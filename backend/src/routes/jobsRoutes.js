import express from "express";
import { protect } from "../middleware/auth.js";
import Notification from "../models/Notification.js";
import { getEntitlements } from "../services/subscriptionService.js";
import {
  analyzeJobDescription,
  matchRequirementsToSkills
} from "../services/openaiService.js";
import {
  trackUserJobBehavior,
  getUserBehaviorProfile
} from "../services/behaviorPersonalizationService.js";
import { rankJobsSmart } from "../services/smartJobRankingService.js";
import { logUserActivity } from "../services/activityLogService.js";
import { scoreJob } from "../services/jobMatcher.js";
import { getStructuredSkills } from "../services/userProfileService.js";
import {
  JOB_SOURCE_TAGS,
  getUnifiedJobById,
  getUnifiedJobsForUser
} from "../services/jobStoreService.js";

const router = express.Router();

const stripHtml = (value = "") =>
  String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();

const truncate = (value = "", max = 1200) => String(value || "").trim().slice(0, max).trim();

const createExternalJobId = (sourceLink = "", title = "external-job") => {
  const seed = `${sourceLink}|${title}`;
  return `external-${Buffer.from(seed).toString("base64url").slice(0, 24)}`;
};

const extractJsonLdJobPosting = (html = "") => {
  const matches = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];

  for (const match of matches) {
    try {
      const parsed = JSON.parse(match[1]);
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      const jobPosting = candidates.find((item) => item?.["@type"] === "JobPosting");
      if (jobPosting) return jobPosting;
    } catch {}
  }

  return null;
};

const extractMetaContent = (html = "", key = "") => {
  const regex = new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
  const match = html.match(regex);
  return match?.[1] ? stripHtml(match[1]) : "";
};

const fetchExternalJobPreview = async (sourceLink) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);

  try {
    const response = await fetch(sourceLink, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; ZiraAI/1.0; +https://zira.ai)",
        accept: "text/html,application/xhtml+xml"
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch job page: ${response.status}`);
    }

    const html = await response.text();
    const jobPosting = extractJsonLdJobPosting(html);
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);

    const title =
      stripHtml(jobPosting?.title) ||
      extractMetaContent(html, "og:title") ||
      stripHtml(h1Match?.[1]) ||
      stripHtml(titleMatch?.[1]);

    const company =
      stripHtml(jobPosting?.hiringOrganization?.name) ||
      extractMetaContent(html, "og:site_name");

    const location =
      stripHtml(jobPosting?.jobLocation?.address?.addressLocality) ||
      stripHtml(jobPosting?.jobLocation?.address?.addressRegion) ||
      extractMetaContent(html, "job:location") ||
      "Remote";

    const description = truncate(
      stripHtml(jobPosting?.description) ||
        extractMetaContent(html, "description") ||
        extractMetaContent(html, "og:description")
    );

    return {
      title,
      company,
      location,
      description
    };
  } finally {
    clearTimeout(timeout);
  }
};

const buildExternalJobAnalysis = ({ sourceLink, extracted = {}, manualDescription = "", user }) => {
  const description = truncate(manualDescription || extracted.description || "", 4000);
  const title = truncate(extracted.title || "External Job Opportunity", 180);
  const company = truncate(extracted.company || "External Platform", 140);
  const location = truncate(extracted.location || "Remote", 120);

  const analysis = analyzeJobDescription({
    jobTitle: title,
    jobDescription: description,
    skillsRequired: []
  });

  const job = {
    id: createExternalJobId(sourceLink, title),
    title,
    company,
    location,
    description,
    sourceLink,
    sourceTag: JOB_SOURCE_TAGS.USER_ADDED_TAG,
    skillsRequired: analysis.requiredSkills
  };

  const matchScore = scoreJob(job, user);
  const skillMatch = matchRequirementsToSkills({
    requirements: analysis.requiredSkills.map((item) => normalize(item)),
    userSkills: getStructuredSkills(user)
  });

  const aiInsights = [];
  if (analysis.requiredSkills.length > 0) {
    aiInsights.push(`Detected ${analysis.requiredSkills.length} likely required skills from the job description.`);
  }
  if (skillMatch.directMatches.length > 0) {
    aiInsights.push(`Your strongest overlaps: ${skillMatch.directMatches.slice(0, 4).join(", ")}.`);
  }
  if (skillMatch.unmatchedRequirements.length > 0) {
    aiInsights.push(`Potential gaps to address: ${skillMatch.unmatchedRequirements.slice(0, 3).join(", ")}.`);
  }

  return {
    job,
    analysis,
    matchScore,
    aiInsights
  };
};

const normalize = (value = "") => String(value || "").toLowerCase().trim();

const extractSalaryValue = (job) => {
  if (typeof job.salary === "number" && Number.isFinite(job.salary)) return job.salary;
  const salaryText = normalize(job.salary || "");
  const numbers = salaryText.match(/\d[\d,.]*/g);
  if (!numbers || numbers.length === 0) return 0;
  const parsed = Number(numbers[numbers.length - 1].replace(/[,$\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const resolveJobType = (job) => {
  const explicitType = normalize(job.jobType);
  if (explicitType === "freelance" || explicitType === "full-time") return explicitType;
  const text = normalize(`${job.title || ""} ${job.description || ""}`);
  return /freelance|contract|gig/.test(text) ? "freelance" : "full-time";
};

const resolveLocationType = (job) => {
  const explicitLocationType = normalize(job.locationType);
  if (explicitLocationType === "remote" || explicitLocationType === "on-site") {
    return explicitLocationType;
  }
  const locationText = normalize(job.location);
  if (/remote|hybrid|work from home|wfh/.test(locationText)) return "remote";
  return "on-site";
};

const resolveBudgetRange = (job) => {
  const explicitBudgetRange = normalize(job.budgetRange);
  if (explicitBudgetRange === "low" || explicitBudgetRange === "mid" || explicitBudgetRange === "high") {
    return explicitBudgetRange;
  }
  const salary = extractSalaryValue(job);
  if (salary >= 120000) return "high";
  if (salary >= 80000) return "mid";
  return "low";
};

const resolveNewestRank = (job) => {
  const dateCandidate = job.postedAt || job.createdAt || job.updatedAt;
  const timestamp = dateCandidate ? Date.parse(dateCandidate) : Number.NaN;
  if (Number.isFinite(timestamp)) return timestamp;
  const idNumber = Number(String(job.id || "").replace(/\D/g, ""));
  return Number.isFinite(idNumber) ? idNumber : 0;
};

const normalizeSearchText = (value = "") =>
  normalize(String(value || "").replace(/[^a-z0-9]+/gi, " "));

const compactSearchText = (value = "") => normalizeSearchText(value).replace(/\s+/g, "");

const tokenizeSearchText = (value = "") =>
  normalizeSearchText(value)
    .split(/\s+/)
    .filter((token) => token.length >= 2);

const levenshteinDistance = (left = "", right = "") => {
  const a = String(left || "");
  const b = String(right || "");
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const previous = new Array(b.length + 1).fill(0).map((_, index) => index);

  for (let row = 1; row <= a.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;

    for (let col = 1; col <= b.length; col += 1) {
      const top = previous[col];
      const cost = a[row - 1] === b[col - 1] ? 0 : 1;
      previous[col] = Math.min(
        previous[col] + 1,
        previous[col - 1] + 1,
        diagonal + cost
      );
      diagonal = top;
    }
  }

  return previous[b.length];
};

const isFuzzyTokenMatch = (queryToken = "", candidateToken = "") => {
  if (!queryToken || !candidateToken) return false;
  if (candidateToken.includes(queryToken) || queryToken.includes(candidateToken)) return true;

  const maxDistance = queryToken.length >= 7 ? 2 : 1;
  if (Math.abs(queryToken.length - candidateToken.length) > maxDistance) {
    return false;
  }

  return levenshteinDistance(queryToken, candidateToken) <= maxDistance;
};

const matchesQuery = (job, query) => {
  if (!query) return true;
  const haystack = normalizeSearchText(
    `${job.title || ""} ${job.company || ""} ${job.location || ""} ${job.description || ""} ${(job.skillsRequired || []).join(" ")}`
  );
  const normalizedQuery = normalizeSearchText(query);

  if (haystack.includes(normalizedQuery)) {
    return true;
  }

  const compactHaystack = compactSearchText(haystack);
  const compactQuery = compactSearchText(normalizedQuery);
  if (compactQuery && compactHaystack.includes(compactQuery)) {
    return true;
  }

  const queryTerms = normalizedQuery.split(/\s+/).filter((term) => term.length >= 2);
  if (queryTerms.length === 0) {
    return true;
  }

  if (queryTerms.every((term) => haystack.includes(term))) {
    return true;
  }

  const haystackTokens = tokenizeSearchText(haystack);
  return queryTerms.every((queryTerm) =>
    haystackTokens.some((candidateToken) => isFuzzyTokenMatch(queryTerm, candidateToken))
  );
};

const sortJobs = (jobs, sortBy = "best-match") => {
  return [...jobs].sort((a, b) => {
    if (sortBy === "highest-paying") {
      return extractSalaryValue(b) - extractSalaryValue(a);
    }

    if (sortBy === "newest") {
      return resolveNewestRank(b) - resolveNewestRank(a);
    }

    if ((b.smartRanking?.smartScore || 0) !== (a.smartRanking?.smartScore || 0)) {
      return (b.smartRanking?.smartScore || 0) - (a.smartRanking?.smartScore || 0);
    }
    return (b.matchScore || 0) - (a.matchScore || 0);
  });
};

const formatSalary = (salary) => {
  if (typeof salary !== "number" || Number.isNaN(salary)) return null;
  return `$${salary.toLocaleString()} / year`;
};

const getBudgetTier = (salary) => {
  if (typeof salary !== "number" || Number.isNaN(salary)) return null;
  if (salary >= 120000) return "Senior";
  if (salary >= 90000) return "Mid-level";
  return "Entry-level";
};

const toDashboardFeedJob = (job) => {
  const skills = Array.isArray(job.skillsRequired) ? job.skillsRequired.filter(Boolean) : [];
  const skillsLabel = skills.length > 0 ? `Core skills: ${skills.join(", ")}.` : "";
  const matchedSkills = job.aiExplanation?.skillMatch?.matchedCount;
  const requiredSkills = job.aiExplanation?.skillMatch?.requiredCount;
  const successSimilarityScore = job.aiExplanation?.successSimilarity?.score;
  const opportunityLabel = job.intelligence?.labelKey;

  const aiInsights = [];
  if (Number.isFinite(matchedSkills) && Number.isFinite(requiredSkills)) {
    aiInsights.push(`Skill alignment: ${matchedSkills}/${requiredSkills} required skills matched.`);
  }
  if (Number.isFinite(successSimilarityScore)) {
    aiInsights.push(`Success similarity score: ${successSimilarityScore}/100 based on your prior outcomes.`);
  }
  if (opportunityLabel) {
    aiInsights.push(`Opportunity type detected: ${opportunityLabel}.`);
  }

  return {
    id: job.id,
    title: job.title,
    company: job.company,
    jobType: job.jobType || null,
    locationType: job.locationType || null,
    budgetRange: job.budgetRange || null,
    postedAt: job.postedAt || null,
    sourceTag: job.sourceTag || JOB_SOURCE_TAGS.FEED_TAG,
    sourceLink: typeof job.sourceLink === "string" ? job.sourceLink : null,
    externalSourceId: job.externalSourceId || null,
    externalSourceName: job.externalSourceName || null,
    shortDescription: job.description,
    fullDescription: job.description,
    location: job.location || "Remote",
    salary: formatSalary(job.salary),
    budget: getBudgetTier(job.salary),
    matchScore: Number(job.smartRanking?.smartScore || job.matchScore || 0),
    aiInsights,
    details: `${job.description} ${skillsLabel}`.trim()
  };
};

router.get("/dashboard-feed", protect, async (req, res, next) => {
  try {
    const unifiedJobs = await getUnifiedJobsForUser(req.user._id);
    const smartRanking = await rankJobsSmart(unifiedJobs, req.user);
    const jobsForFeed = smartRanking.jobsForFeed.map(toDashboardFeedJob);

    res.json({
      jobs: jobsForFeed
    });
  } catch (error) {
    next(error);
  }
});

router.post("/analyze-external", protect, async (req, res, next) => {
  try {
    const { url = "", manualDescription = "" } = req.body;
    const resolvedManualDescription = truncate(manualDescription, 4000);
    const hasManualDescription = resolvedManualDescription.trim().length >= 120;

    if ((!url || typeof url !== "string") && !hasManualDescription) {
      res.status(400);
      throw new Error("A valid job link or full job description is required");
    }

    let parsedUrl = null;
    if (url) {
      try {
        parsedUrl = new URL(url);
      } catch {
        res.status(400);
        throw new Error("Job link must be a valid URL");
      }

      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        res.status(400);
        throw new Error("Only http and https job links are supported");
      }
    }

    let extracted = {
      title: "",
      company: parsedUrl?.hostname?.replace(/^www\./i, "") || "External Platform",
      location: "Remote",
      description: ""
    };

    if (parsedUrl) {
      try {
        extracted = {
          ...extracted,
          ...(await fetchExternalJobPreview(parsedUrl.toString()))
        };
      } catch {}
    }

    const hasUsableDescription = (resolvedManualDescription || extracted.description || "").trim().length >= 120;

    if (!hasUsableDescription) {
      return res.json({
        needsManualDescription: true,
        extracted: {
          title: extracted.title || "External Job Opportunity",
          company: extracted.company || parsedUrl?.hostname?.replace(/^www\./i, "") || "External Platform",
          location: extracted.location || "Remote",
          sourceLink: parsedUrl?.toString() || null
        }
      });
    }

    const result = buildExternalJobAnalysis({
      sourceLink: parsedUrl?.toString() || "",
      extracted,
      manualDescription: resolvedManualDescription,
      user: req.user
    });

    res.json({
      needsManualDescription: false,
      ...result
    });
  } catch (error) {
    next(error);
  }
});

router.get("/", protect, async (req, res, next) => {
  try {
    const q = normalize(req.query.q || "");
    const jobType = normalize(req.query.jobType || "all");
    const locationType = normalize(req.query.locationType || "all");
    const budgetRange = normalize(req.query.budgetRange || "all");
    const sortBy = normalize(req.query.sort || "best-match");
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 8));
    const activeSort = ["best-match", "newest", "highest-paying"].includes(sortBy)
      ? sortBy
      : "best-match";

    const entitlements = getEntitlements(req.user);
    const unifiedJobs = await getUnifiedJobsForUser(req.user._id);
    const smartRanking = await rankJobsSmart(unifiedJobs, req.user);
    const baseJobs = smartRanking.jobsForFeed;

    const rankedJobs = baseJobs
      .map((job) => {
        return {
          ...job,
          matchScore: entitlements.bestJobMatches ? job.matchScore : null,
          premiumMatchLocked: !entitlements.bestJobMatches
        };
      })
      .filter((job) => {
        if (!matchesQuery(job, q)) return false;
        if (jobType !== "all" && resolveJobType(job) !== jobType) return false;
        if (locationType !== "all" && resolveLocationType(job) !== locationType) return false;
        if (budgetRange !== "all" && resolveBudgetRange(job) !== budgetRange) return false;
        return true;
      });

    const jobsForPlan = sortJobs(rankedJobs, activeSort);
    const topMatches = jobsForPlan.slice(0, 3);
    const total = jobsForPlan.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const startIndex = (safePage - 1) * limit;
    const paginatedJobs = jobsForPlan.slice(startIndex, startIndex + limit);

    const hasActiveFilters =
      Boolean(q) || jobType !== "all" || locationType !== "all" || budgetRange !== "all" || activeSort !== "best-match";

    if (!hasActiveFilters && jobsForPlan.length > 0) {
      const topMatch = jobsForPlan[0];
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      try {
        const alreadyNotified = await Notification.exists({
          user: req.user._id,
          type: "job_match",
          createdAt: { $gte: todayStart }
        });
        if (!alreadyNotified) {
          await Notification.create({
            user: req.user._id,
            message: `New top match: ${topMatch.title} at ${topMatch.company}`,
            type: "job_match"
          });
        }
      } catch (error) {
        console.error("jobs feed: notification side effect failed", error?.message || error);
      }
    }

    res.json({
      jobs: paginatedJobs,
      topMatches,
      pagination: {
        page: safePage,
        limit,
        total,
        totalPages,
        hasPrev: safePage > 1,
        hasNext: safePage < totalPages
      },
      behaviorProfile: {
        preferredBudgetLevel: smartRanking.behaviorProfile.preferredBudgetLevel,
        toneHint: smartRanking.behaviorProfile.toneHint,
        ignoredCount: smartRanking.behaviorProfile.ignoredCount,
        totalEvents: smartRanking.behaviorProfile.totalEvents
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post("/behavior", protect, async (req, res, next) => {
  try {
    const { jobId, eventType, metadata = {} } = req.body;
    if (!jobId || !eventType) {
      res.status(400);
      throw new Error("jobId and eventType are required");
    }

    const allowedEvents = ["clicked", "applied", "ignored"];
    if (!allowedEvents.includes(eventType)) {
      res.status(400);
      throw new Error("Invalid eventType");
    }

    const job = await getUnifiedJobById({ jobId, userId: req.user._id });
    if (!job) {
      res.status(404);
      throw new Error("Job not found");
    }

    await trackUserJobBehavior({
      userId: req.user._id,
      eventType,
      job,
      metadata
    });

    if (eventType === "ignored") {
      await logUserActivity({
        userId: req.user._id,
        actionType: "job_skipped",
        message: `Job skipped (${job.title} at ${job.company})`,
        metadata: {
          jobId,
          title: job.title,
          company: job.company,
          source: "jobs.behavior"
        }
      });
    }

    const behaviorProfile = await getUserBehaviorProfile(req.user._id);

    res.status(201).json({
      success: true,
      behaviorProfile
    });
  } catch (error) {
    next(error);
  }
});

router.get("/all", protect, async (req, res, next) => {
  try {
    const jobs = await getUnifiedJobsForUser(req.user._id);
    res.json(jobs);
  } catch (error) {
    next(error);
  }
});

export default router;
