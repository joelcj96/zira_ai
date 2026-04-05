import mongoose from "mongoose";
import Job from "../models/Job.js";
import { mockJobs } from "../data/mockJobs.js";
import {
  EXTERNAL_JOB_FEED_CONSTANTS,
  getExternalFeedJobById,
  getLatestExternalFeedJobs
} from "./externalJobFeedService.js";

const FEED_TAG = "Feed";
const USER_ADDED_TAG = "User Added";
const ALLOW_MOCK_FALLBACK = String(process.env.REAL_JOB_ALLOW_MOCK_FALLBACK || "false").trim().toLowerCase() === "true";

const normalizeText = (value = "", fallback = "") => {
  const text = String(value || "").trim();
  return text || fallback;
};

const normalizeSkills = (skills) =>
  Array.isArray(skills)
    ? skills
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    : [];

const toJobRecord = (job = {}) => ({
  id: normalizeText(job.id),
  title: normalizeText(job.title, "Untitled role"),
  company: normalizeText(job.company, "Unknown company"),
  location: normalizeText(job.location, "Remote"),
  locationType: normalizeText(job.locationType, "remote"),
  jobType: normalizeText(job.jobType, "full-time"),
  salary: Number(job.salary) || 0,
  budgetRange: normalizeText(job.budgetRange, "low"),
  postedAt: job.postedAt ? new Date(job.postedAt) : null,
  sourceLink: typeof job.sourceLink === "string" ? job.sourceLink : null,
  description: normalizeText(job.description),
  skillsRequired: normalizeSkills(job.skillsRequired),
  sourceTag: job.sourceTag === USER_ADDED_TAG ? USER_ADDED_TAG : FEED_TAG,
  externalSourceId: normalizeText(job.externalSourceId) || null,
  externalSourceName: normalizeText(job.externalSourceName) || null,
  createdByUser: job.createdByUser || null
});

const toClientJob = (job = {}) => ({
  id: job.id,
  title: job.title,
  company: job.company,
  location: job.location,
  locationType: job.locationType,
  jobType: job.jobType,
  salary: job.salary,
  budgetRange: job.budgetRange,
  postedAt: job.postedAt,
  sourceLink: job.sourceLink,
  description: job.description,
  skillsRequired: normalizeSkills(job.skillsRequired),
  sourceTag: job.sourceTag === USER_ADDED_TAG ? USER_ADDED_TAG : FEED_TAG,
  externalSourceId: normalizeText(job.externalSourceId) || null,
  externalSourceName: normalizeText(job.externalSourceName) || null
});

const isDbConnected = () => mongoose.connection.readyState === 1;

const getMockFallbackFeedJobs = () =>
  mockJobs.map((job) =>
    toClientJob({
      ...job,
      sourceTag: FEED_TAG,
      createdByUser: null
    })
  );

const getNoJobsFallback = () => [];

const seedFeedJobs = async () => {
  const operations = mockJobs
    .map((job) => toJobRecord({ ...job, sourceTag: FEED_TAG, createdByUser: null }))
    .filter((job) => job.id)
    .map((job) => ({
      updateOne: {
        filter: { id: job.id },
        update: {
          $set: {
            title: job.title,
            company: job.company,
            location: job.location,
            locationType: job.locationType,
            jobType: job.jobType,
            salary: job.salary,
            budgetRange: job.budgetRange,
            postedAt: job.postedAt,
            sourceLink: job.sourceLink,
            description: job.description,
            skillsRequired: job.skillsRequired,
            sourceTag: FEED_TAG,
            externalSourceId: job.externalSourceId,
            externalSourceName: job.externalSourceName,
            createdByUser: null
          }
        },
        upsert: true
      }
    }));

  if (operations.length > 0) {
    await Job.bulkWrite(operations, { ordered: false });
  }
};

const replaceFeedJobs = async (jobs) => {
  const records = jobs.map((job) => toJobRecord({ ...job, sourceTag: FEED_TAG, createdByUser: null })).filter((job) => job.id);

  if (records.length === 0) {
    return 0;
  }

  const operations = records.map((job) => ({
    updateOne: {
      filter: { id: job.id },
      update: {
        $set: {
          title: job.title,
          company: job.company,
          location: job.location,
          locationType: job.locationType,
          jobType: job.jobType,
          salary: job.salary,
          budgetRange: job.budgetRange,
          postedAt: job.postedAt,
          sourceLink: job.sourceLink,
          description: job.description,
          skillsRequired: job.skillsRequired,
          sourceTag: FEED_TAG,
          externalSourceId: job.externalSourceId,
          externalSourceName: job.externalSourceName,
          createdByUser: null
        }
      },
      upsert: true
    }
  }));

  await Job.bulkWrite(operations, { ordered: false });
  await Job.deleteMany({
    sourceTag: FEED_TAG,
    id: { $nin: records.map((job) => job.id) }
  });

  return records.length;
};

const ensureFeedJobsAvailable = async () => {
  const externalFeed = await getLatestExternalFeedJobs();

  if (!isDbConnected()) {
    if (externalFeed.jobs.length > 0) {
      return externalFeed.jobs.map(toClientJob);
    }
    return ALLOW_MOCK_FALLBACK ? getMockFallbackFeedJobs() : getNoJobsFallback();
  }

  if (externalFeed.fetchedFresh && externalFeed.jobs.length > 0) {
    await replaceFeedJobs(externalFeed.jobs);
  } else {
    const existingFeedCount = await Job.countDocuments({ sourceTag: FEED_TAG });
    if (existingFeedCount === 0) {
      if (externalFeed.jobs.length > 0) {
        await replaceFeedJobs(externalFeed.jobs);
      } else if (ALLOW_MOCK_FALLBACK) {
        await seedFeedJobs();
      }
    }
  }

  return null;
};

const getFallbackFeedJobs = async () => {
  const externalFeed = await getLatestExternalFeedJobs();
  if (externalFeed.jobs.length > 0) {
    return externalFeed.jobs.map(toClientJob);
  }
  return ALLOW_MOCK_FALLBACK ? getMockFallbackFeedJobs() : getNoJobsFallback();
};

export const getUnifiedJobsForUser = async (userId) => {
  try {
    const inMemoryFeedFallback = await ensureFeedJobsAvailable();
    if (inMemoryFeedFallback) {
      return inMemoryFeedFallback;
    }

    const jobs = await Job.find({
      $or: [{ sourceTag: FEED_TAG }, { sourceTag: USER_ADDED_TAG, createdByUser: userId }]
    })
      .sort({ postedAt: -1, createdAt: -1 })
      .lean();

    return jobs.map(toClientJob);
  } catch {
    return getFallbackFeedJobs();
  }
};

export const getUnifiedJobById = async ({ jobId, userId }) => {
  if (!jobId) return null;

  if (isDbConnected()) {
    try {
      await ensureFeedJobsAvailable();
      const job = await Job.findOne({
        id: jobId,
        $or: [{ sourceTag: FEED_TAG }, { sourceTag: USER_ADDED_TAG, createdByUser: userId }]
      }).lean();

      if (job) {
        return toClientJob(job);
      }
    } catch {}
  }

  const externalJob = await getExternalFeedJobById(jobId);
  if (externalJob) {
    return toClientJob(externalJob);
  }

  const fallback = mockJobs.find((item) => item.id === jobId);
  if (!fallback || !ALLOW_MOCK_FALLBACK) return null;

  return toClientJob({ ...fallback, sourceTag: FEED_TAG, createdByUser: null });
};

export const upsertUserAddedJob = async ({ userId, job }) => {
  const record = toJobRecord({
    ...job,
    sourceTag: USER_ADDED_TAG,
    createdByUser: userId,
    postedAt: job?.postedAt || new Date().toISOString()
  });

  if (!record.id || !record.title || !record.company) {
    return null;
  }

  if (!isDbConnected()) {
    return toClientJob(record);
  }

  try {
    const saved = await Job.findOneAndUpdate(
      { id: record.id },
      {
        $set: {
          title: record.title,
          company: record.company,
          location: record.location,
          locationType: record.locationType,
          jobType: record.jobType,
          salary: record.salary,
          budgetRange: record.budgetRange,
          postedAt: record.postedAt,
          sourceLink: record.sourceLink,
          description: record.description,
          skillsRequired: record.skillsRequired,
          sourceTag: USER_ADDED_TAG,
          externalSourceId: record.externalSourceId,
          externalSourceName: record.externalSourceName,
          createdByUser: userId
        }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    return toClientJob(saved);
  } catch {
    return toClientJob(record);
  }
};

export const JOB_SOURCE_TAGS = {
  FEED_TAG,
  USER_ADDED_TAG
};

export const EXTERNAL_FEED_ID_PREFIX = EXTERNAL_JOB_FEED_CONSTANTS.EXTERNAL_ID_PREFIXES[0];
