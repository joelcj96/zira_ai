import express from "express";
import { protect } from "../middleware/auth.js";
import Application from "../models/Application.js";
import QueueAuditLog from "../models/QueueAuditLog.js";
import { deductCredits } from "./creditsRoutes.js";
import { notifyApplicationSubmitted } from "../services/notificationService.js";
import {
  canApplyWithoutThrottle,
  generateHumanDelay,
  recordApplication,
  getApplicationSummary
} from "../services/applicationAssistantService.js";
import { getApplicationLearningInsights } from "../services/applicationLearningService.js";
import { getEntitlements } from "../services/subscriptionService.js";
import { trackUserJobBehavior } from "../services/behaviorPersonalizationService.js";
import { logUserActivity } from "../services/activityLogService.js";
import {
  getUnifiedJobById,
  upsertUserAddedJob
} from "../services/jobStoreService.js";
import { submitExternalApplication } from "../services/externalApplyService.js";

const router = express.Router();

const getDayRange = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return { start, end };
};

const flushScheduledApplications = async (user) => {
  const userId = user?._id;
  if (!userId) return;

  const now = new Date();

  const dueScheduled = await Application.find({
    user: userId,
    submissionStatus: "scheduled",
    scheduledFor: { $lte: now }
  });

  for (const application of dueScheduled) {
    application.submissionStatus = "submitted";
    application.submittedAt = now;
    await application.save();

    const alreadyAttempted = Boolean(application.externalSubmission?.attempted);
    if (!alreadyAttempted) {
      await attachExternalSubmission({
        user,
        application,
        proposalText: application.proposalText || "",
        mode: "manual"
      });
    }

    await notifyApplicationSubmitted(userId, application);
  }
};

const normalizeDelaySeconds = (value) => Math.max(15, Math.min(Number(value) || 45, 300));

const DEFAULT_RESPONSIBLE_AUTOMATION = {
  enabled: true,
  minDelaySeconds: 20,
  maxDelaySeconds: 90,
  maxApplicationsPerHour: 4,
  maxApplicationsPerDay: 12,
  activeHoursStart: 8,
  activeHoursEnd: 20,
  minJobMatchScore: 55,
  enforceProposalDiversity: true,
  diversitySimilarityThreshold: 0.9
};

const DEFAULT_SAFETY_CONTROLS = {
  safetyMode: true,
  maxApplicationsPerDay: 8,
  delaySpeed: "slow"
};

const SAFETY_DELAY_PROFILES = {
  safe: {
    slow: { min: 60, max: 150 },
    normal: { min: 35, max: 90 },
    fast: { min: 20, max: 60 }
  },
  aggressive: {
    slow: { min: 25, max: 70 },
    normal: { min: 12, max: 35 },
    fast: { min: 5, max: 15 }
  }
};

const getHourRange = () => {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  const end = new Date(start);
  end.setHours(end.getHours() + 1);
  return { start, end };
};

const getNextActiveWindow = (policy, now = new Date()) => {
  const currentHour = now.getHours();
  const todayStart = new Date(now);
  todayStart.setHours(policy.activeHoursStart, 0, 0, 0);

  const withinActiveHours = isWithinActiveHours(now, policy.activeHoursStart, policy.activeHoursEnd);
  if (withinActiveHours) {
    return {
      withinActiveHours: true,
      nextStartAt: null,
      hint: `Active now (${policy.activeHoursStart}:00-${policy.activeHoursEnd}:00)`
    };
  }

  if (policy.activeHoursStart < policy.activeHoursEnd && currentHour < policy.activeHoursStart) {
    return {
      withinActiveHours: false,
      nextStartAt: todayStart,
      hint: `Starts today at ${policy.activeHoursStart}:00`
    };
  }

  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  return {
    withinActiveHours: false,
    nextStartAt: tomorrowStart,
    hint: `Starts next at ${policy.activeHoursStart}:00`
  };
};

const normalizeResponsibleAutomation = (settings = {}) => ({
  enabled: settings.enabled !== false,
  minDelaySeconds: Math.max(5, Math.min(Number(settings.minDelaySeconds) || 20, 180)),
  maxDelaySeconds: Math.max(8, Math.min(Number(settings.maxDelaySeconds) || 90, 300)),
  maxApplicationsPerHour: Math.max(1, Math.min(Number(settings.maxApplicationsPerHour) || 4, 20)),
  maxApplicationsPerDay: Math.max(1, Math.min(Number(settings.maxApplicationsPerDay) || 12, 80)),
  activeHoursStart: Math.max(0, Math.min(Number(settings.activeHoursStart) || 8, 23)),
  activeHoursEnd: Math.max(0, Math.min(Number(settings.activeHoursEnd) || 20, 23)),
  minJobMatchScore: Math.max(0, Math.min(Number(settings.minJobMatchScore) || 55, 100)),
  enforceProposalDiversity: settings.enforceProposalDiversity !== false,
  diversitySimilarityThreshold: Math.max(
    0.5,
    Math.min(Number(settings.diversitySimilarityThreshold) || 0.9, 0.99)
  )
});

const normalizeSafetyControls = (settings = {}) => ({
  safetyMode: settings.safetyMode !== false,
  maxApplicationsPerDay: Math.max(1, Math.min(Number(settings.maxApplicationsPerDay) || 8, 80)),
  delaySpeed: ["slow", "normal", "fast"].includes(settings.delaySpeed) ? settings.delaySpeed : "slow"
});

const applySafetyControlsToPolicy = (policy, safetyControls) => {
  const profileGroup = safetyControls.safetyMode ? "safe" : "aggressive";
  const speedProfile = SAFETY_DELAY_PROFILES[profileGroup][safetyControls.delaySpeed];

  const nextPolicy = {
    ...policy,
    minDelaySeconds: speedProfile.min,
    maxDelaySeconds: speedProfile.max,
    maxApplicationsPerDay: Math.min(policy.maxApplicationsPerDay, safetyControls.maxApplicationsPerDay)
  };

  if (safetyControls.safetyMode) {
    nextPolicy.enabled = true;
    nextPolicy.maxApplicationsPerHour = Math.min(nextPolicy.maxApplicationsPerHour, 3);
    nextPolicy.minJobMatchScore = Math.max(nextPolicy.minJobMatchScore, 65);
    nextPolicy.enforceProposalDiversity = true;
  }

  return nextPolicy;
};

const isWithinActiveHours = (date, startHour, endHour) => {
  const currentHour = date.getHours();
  if (startHour === endHour) {
    return true;
  }
  if (startHour < endHour) {
    return currentHour >= startHour && currentHour < endHour;
  }
  return currentHour >= startHour || currentHour < endHour;
};

const tokenizeProposal = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);

const computeJaccardSimilarity = (leftTokens, rightTokens) => {
  if (!leftTokens.length || !rightTokens.length) {
    return 0;
  }

  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  let intersectionCount = 0;

  for (const token of leftSet) {
    if (rightSet.has(token)) {
      intersectionCount += 1;
    }
  }

  const unionCount = leftSet.size + rightSet.size - intersectionCount;
  return unionCount === 0 ? 0 : intersectionCount / unionCount;
};

const checkRecentProposalSimilarity = async (userId, proposalText, lookbackDays = 30) => {
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const recentApplications = await Application.find(
    {
      user: userId,
      createdAt: { $gte: since },
      proposalText: { $exists: true, $ne: "" }
    },
    { proposalText: 1, title: 1 }
  )
    .sort({ createdAt: -1 })
    .limit(15)
    .lean();

  const tokens = tokenizeProposal(proposalText);
  let maxSimilarity = 0;
  let mostSimilarTitle = "";

  for (const entry of recentApplications) {
    const similarity = computeJaccardSimilarity(tokens, tokenizeProposal(entry.proposalText));
    if (similarity > maxSimilarity) {
      maxSimilarity = similarity;
      mostSimilarTitle = entry.title || "";
    }
  }

  return {
    maxSimilarity,
    mostSimilarTitle
  };
};

const generateAdaptiveDelay = (policy, jobMatchScore) => {
  const safeMin = Math.min(policy.minDelaySeconds, policy.maxDelaySeconds - 1);
  const safeMax = Math.max(policy.maxDelaySeconds, safeMin + 1);
  const score = Math.max(0, Math.min(Number(jobMatchScore) || 0, 100));
  const qualityFactor = 1.2 - score / 250;

  const adaptedMin = Math.max(2, safeMin * qualityFactor);
  const adaptedMax = Math.max(adaptedMin + 1, safeMax * (qualityFactor + 0.08));

  return generateHumanDelay(adaptedMin, adaptedMax);
};

const getHourlyUsageTrend = async (userId, lookbackHours = 24) => {
  const now = new Date();
  const end = new Date(now);
  end.setMinutes(0, 0, 0);
  end.setHours(end.getHours() + 1);

  const start = new Date(end);
  start.setHours(start.getHours() - lookbackHours);

  const applications = await Application.find(
    {
      user: userId,
      createdAt: { $gte: start, $lt: end },
      submissionStatus: { $in: ["scheduled", "submitted"] }
    },
    { createdAt: 1 }
  ).lean();

  const buckets = Array.from({ length: lookbackHours }, (_, index) => {
    const hourStart = new Date(start);
    hourStart.setHours(start.getHours() + index);
    return {
      hourStart,
      label: `${String(hourStart.getHours()).padStart(2, "0")}:00`,
      count: 0
    };
  });

  for (const item of applications) {
    const itemDate = new Date(item.createdAt);
    const offset = Math.floor((itemDate.getTime() - start.getTime()) / (60 * 60 * 1000));
    if (offset >= 0 && offset < buckets.length) {
      buckets[offset].count += 1;
    }
  }

  const maxCount = buckets.reduce((max, item) => Math.max(max, item.count), 0);

  return {
    points: buckets,
    maxCount
  };
};

const getTodayAppliedCount = async (userId) => {
  const { start, end } = getDayRange();
  return Application.countDocuments({
    user: userId,
    createdAt: { $gte: start, $lt: end },
    submissionStatus: { $in: ["scheduled", "submitted"] }
  });
};

const ensureUnifiedJobRecord = async ({ userId, jobId, title, company, jobDescription = "", notes = "" }) => {
  const existing = await getUnifiedJobById({ jobId, userId });
  if (existing) return;

  const sourceLinkMatch = String(notes || "").match(/https?:\/\/\S+/i);

  await upsertUserAddedJob({
    userId,
    job: {
      id: jobId,
      title,
      company,
      location: "Remote",
      description: jobDescription,
      sourceLink: sourceLinkMatch?.[0] || null,
      postedAt: new Date().toISOString(),
      skillsRequired: []
    }
  });
};

const attachExternalSubmission = async ({ user, application, proposalText, mode }) => {
  try {
    let sourceLink = "";
    try {
      const unifiedJob = await getUnifiedJobById({ jobId: application.jobId, userId: user._id });
      sourceLink = unifiedJob?.sourceLink || "";
    } catch {
      sourceLink = "";
    }

    const result = await submitExternalApplication({
      user,
      application,
      sourceLink,
      proposalText,
      mode
    });

    application.externalSubmission = {
      attempted: Boolean(result.attempted),
      submitted: Boolean(result.submitted),
      provider: result.provider || "unknown",
      sourceLink,
      externalApplicationId: result.externalApplicationId || "",
      message: result.message || "",
      attemptedAt: new Date()
    };

    await application.save();
    return application.externalSubmission;
  } catch (error) {
    const fallback = {
      attempted: false,
      submitted: false,
      provider: "unknown",
      sourceLink: "",
      externalApplicationId: "",
      message: `External submission unavailable: ${error.message || "unknown error"}`,
      attemptedAt: new Date()
    };

    try {
      application.externalSubmission = fallback;
      await application.save();
    } catch {}

    return fallback;
  }
};

router.get("/", protect, async (req, res, next) => {
  try {
    await flushScheduledApplications(req.user);
    const applications = await Application.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(applications);
  } catch (error) {
    next(error);
  }
});

router.post("/", protect, async (req, res, next) => {
  try {
    const entitlements = getEntitlements(req.user);
    const { jobId, title, company, jobDescription, status, proposalText, notes } = req.body;

    if (!jobId || !title || !company) {
      res.status(400);
      throw new Error("jobId, title, and company are required");
    }

    const existingApplication = await Application.findOne({ user: req.user._id, jobId });
    if (existingApplication) {
      res.status(409);
      throw new Error("You have already created an application for this job");
    }

    if (entitlements.maxDailyApplications !== null) {
      const todayCount = await getTodayAppliedCount(req.user._id);
      if (todayCount >= entitlements.maxDailyApplications) {
        res.status(429);
        throw new Error(
          `Free plan daily limit reached (${entitlements.maxDailyApplications}). Upgrade to Pro for unlimited applications.`
        );
      }
    }

    await ensureUnifiedJobRecord({
      userId: req.user._id,
      jobId,
      title,
      company,
      jobDescription,
      notes
    });

    // Deduct 2 credits for job application
    const { user: updatedUser } = await deductCredits(
      req.user._id,
      2,
      "job_application",
      { jobId }
    );
    req.user.credits = updatedUser.credits;

    const application = await Application.create({
      user: req.user._id,
      jobId,
      title,
      company,
      jobDescription: jobDescription || "",
      status: status || "pending",
      proposalText: proposalText || "",
      notes: notes || "",
      applicationMode: "manual",
      submissionStatus: "submitted",
      submittedAt: new Date(),
      reviewConfirmed: Boolean(proposalText)
    });

    const externalSubmission = await attachExternalSubmission({
      user: req.user,
      application,
      proposalText,
      mode: "manual"
    });

    // Create notification for application submitted
    await notifyApplicationSubmitted(req.user._id, application);

    await trackUserJobBehavior({
      userId: req.user._id,
      eventType: "applied",
      job: {
        id: jobId,
        title,
        company,
        location: "",
        salary: 0,
        skillsRequired: []
      },
      metadata: { source: "applications.create" }
    });

    await logUserActivity({
      userId: req.user._id,
      actionType: "application_submitted",
      message: `Applied to ${application.title} at ${application.company}`,
      metadata: {
        applicationId: application._id,
        jobId,
        title: application.title,
        company: application.company,
        mode: "manual"
      }
    });

    res.status(201).json({
      ...application.toObject(),
      externalSubmission,
      credits: {
        deducted: 2,
        remaining: req.user.credits
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post("/smart-apply", protect, async (req, res, next) => {
  try {
    const entitlements = getEntitlements(req.user);
    const {
      jobId,
      title,
      company,
      jobDescription,
      proposalText,
      notes,
      mode,
      dailyLimit,
      jobMatchScore,
      tone,
      reviewConfirmed
    } = req.body;
    const reviewRequired = req.user.smartApplySettings?.requireReviewConfirmation !== false;
    const hasReviewConfirmation = Boolean(reviewConfirmed);

    if (!jobId || !title || !company || !proposalText) {
      res.status(400);
      throw new Error("jobId, title, company, and proposalText are required");
    }

    const existingApplication = await Application.findOne({ user: req.user._id, jobId });
    if (existingApplication) {
      res.status(409);
      throw new Error("You have already applied to this job");
    }

    if (reviewRequired && !hasReviewConfirmation) {
      res.status(400);
      throw new Error("Review confirmation is required before applying");
    }

    const allowedModes = ["manual", "semi-automatic"];
    if (!allowedModes.includes(mode)) {
      res.status(400);
      throw new Error("Invalid mode. Use manual or semi-automatic.");
    }

    if (mode === "semi-automatic" && !entitlements.canUseSmartAssist) {
      res.status(403);
      throw new Error("Smart Assist mode is available on Pro plan only");
    }

    const safetyControls = normalizeSafetyControls({
      ...DEFAULT_SAFETY_CONTROLS,
      ...(req.user.smartApplySettings?.safetyControls || {})
    });
    const policy = applySafetyControlsToPolicy(normalizeResponsibleAutomation({
      ...DEFAULT_RESPONSIBLE_AUTOMATION,
      ...(req.user.smartApplySettings?.responsibleAutomation || {})
    }), safetyControls);
    const normalizedJobMatchScore = Math.max(0, Math.min(Number(jobMatchScore) || 0, 100));

    if (policy.enabled) {
      const now = new Date();
      if (!isWithinActiveHours(now, policy.activeHoursStart, policy.activeHoursEnd)) {
        await QueueAuditLog.create({
          user: req.user._id,
          applicationId: null,
          jobTitle: title,
          company,
          action: "policy_block",
          reason: "outside_active_hours",
          metadata: {
            activeHoursStart: policy.activeHoursStart,
            activeHoursEnd: policy.activeHoursEnd,
            currentHour: now.getHours()
          }
        });
        res.status(429);
        throw new Error(
          `Applications are only allowed between ${policy.activeHoursStart}:00 and ${policy.activeHoursEnd}:00 in Responsible Automation Mode.`
        );
      }

      if (normalizedJobMatchScore < policy.minJobMatchScore) {
        await QueueAuditLog.create({
          user: req.user._id,
          applicationId: null,
          jobTitle: title,
          company,
          action: "skip",
          reason: "low_job_match",
          metadata: {
            jobMatchScore: Number(jobMatchScore) || 0,
            minimumRequired: policy.minJobMatchScore
          }
        });

        await logUserActivity({
          userId: req.user._id,
          actionType: "job_skipped",
          message: `Job skipped (${title}) due to low match score`,
          metadata: {
            jobId,
            title,
            company,
            reason: "low_job_match",
            score: normalizedJobMatchScore
          }
        });

        return res.status(200).json({
          skipped: true,
          reason: "low_job_match",
          message: `Application skipped for safety: this job's match score is ${normalizedJobMatchScore}%, below your current minimum (${policy.minJobMatchScore}%). Lower your minimum score in Settings > Responsible Automation or switch to Manual mode to proceed.`,
          details: {
            score: normalizedJobMatchScore,
            minimumRequired: policy.minJobMatchScore,
            nextSteps: [
              "Open Settings > Responsible Automation",
              "Lower Minimum Job Match Score",
              "Or switch Apply Mode to Manual"
            ]
          },
          policy,
          safetyControls
        });
      }

      const { start: hourStart, end: hourEnd } = getHourRange();
      const hourlyCount = await Application.countDocuments({
        user: req.user._id,
        createdAt: { $gte: hourStart, $lt: hourEnd },
        submissionStatus: { $in: ["scheduled", "submitted"] }
      });

      if (hourlyCount >= policy.maxApplicationsPerHour) {
        await QueueAuditLog.create({
          user: req.user._id,
          applicationId: null,
          jobTitle: title,
          company,
          action: "policy_block",
          reason: "hourly_limit_reached",
          metadata: {
            hourlyCount,
            maxApplicationsPerHour: policy.maxApplicationsPerHour
          }
        });
        res.status(429);
        throw new Error(
          `Hourly limit reached (${policy.maxApplicationsPerHour}) in Responsible Automation Mode.`
        );
      }

      if (policy.enforceProposalDiversity) {
        const diversityCheck = await checkRecentProposalSimilarity(req.user._id, proposalText);
        if (diversityCheck.maxSimilarity >= policy.diversitySimilarityThreshold) {
          await QueueAuditLog.create({
            user: req.user._id,
            applicationId: null,
            jobTitle: title,
            company,
            action: "skip",
            reason: "proposal_too_similar",
            metadata: {
              maxSimilarity: Number(diversityCheck.maxSimilarity.toFixed(3)),
              threshold: policy.diversitySimilarityThreshold,
              mostSimilarTitle: diversityCheck.mostSimilarTitle
            }
          });

          await logUserActivity({
            userId: req.user._id,
            actionType: "job_skipped",
            message: `Job skipped (${title}) due to repetitive proposal`,
            metadata: {
              jobId,
              title,
              company,
              reason: "proposal_too_similar",
              similarity: Number(diversityCheck.maxSimilarity.toFixed(3))
            }
          });

          return res.status(200).json({
            skipped: true,
            reason: "proposal_too_similar",
            message: "Application skipped for safety: this proposal is too similar to recent submissions. Regenerate or tailor your cover letter, then apply again.",
            diversity: {
              maxSimilarity: Number(diversityCheck.maxSimilarity.toFixed(3)),
              threshold: policy.diversitySimilarityThreshold,
              mostSimilarTitle: diversityCheck.mostSimilarTitle
            }
          });
        }
      }
    }

    const requestedDailyLimit = Math.max(
      1,
      Math.min(Number(dailyLimit) || req.user.smartApplySettings?.defaultDailyLimit || 5, 25)
    );
    const policyDailyLimit = policy.enabled
      ? Math.max(1, policy.maxApplicationsPerDay)
      : requestedDailyLimit;
    const normalizedDailyLimit =
      entitlements.maxDailyApplications === null
        ? Math.min(requestedDailyLimit, policyDailyLimit)
        : Math.min(entitlements.maxDailyApplications, policyDailyLimit);

    const todayCount = await getTodayAppliedCount(req.user._id);
    if (todayCount >= normalizedDailyLimit) {
      res.status(429);
      throw new Error(`Daily limit reached (${normalizedDailyLimit}) in Responsible Automation Mode.`);
    }

    await ensureUnifiedJobRecord({
      userId: req.user._id,
      jobId,
      title,
      company,
      jobDescription,
      notes
    });

    // Deduct 2 credits for job application
    const { user: updatedUser } = await deductCredits(
      req.user._id,
      2,
      "job_application",
      { jobId }
    );
    req.user.credits = updatedUser.credits;

    const throttleCheck = await canApplyWithoutThrottle(req.user._id, 2000);
    if (!throttleCheck.canApply) {
      res.status(429);
      throw new Error(
        `Please wait ${Math.ceil(throttleCheck.waitMs / 1000)}s before applying again`
      );
    }

    const now = new Date();
    const isSemiAutomatic = mode === "semi-automatic";
    const delayInfo = isSemiAutomatic
      ? policy.enabled
        ? generateAdaptiveDelay(policy, normalizedJobMatchScore)
        : generateHumanDelay(2, 5)
      : null;
    const scheduledFor = isSemiAutomatic
      ? new Date(now.getTime() + delayInfo.delayMs)
      : null;

    const application = await Application.create({
      user: req.user._id,
      jobId,
      title,
      company,
      jobDescription: jobDescription || "",
      status: "pending",
      proposalText,
      notes: notes || "",
      applicationMode: mode,
      submissionStatus: isSemiAutomatic ? "scheduled" : "submitted",
      reviewConfirmed: hasReviewConfirmation,
      reviewedAt: hasReviewConfirmation ? now : null,
      scheduledFor,
      submittedAt: isSemiAutomatic ? null : now,
      simulatedDelaySeconds: isSemiAutomatic ? Number(delayInfo.delaySeconds) : 0,
      dailyLimitAtSubmission: normalizedDailyLimit,
      toneUsed: tone || "professional"
    });

    const externalSubmission = !isSemiAutomatic
      ? await attachExternalSubmission({
          user: req.user,
          application,
          proposalText,
          mode
        })
      : null;

    await recordApplication(req.user._id, normalizedDailyLimit);
    const updatedSummary = await getApplicationSummary(req.user._id);

    // Create notification for application submitted
    if (!isSemiAutomatic) {
      await notifyApplicationSubmitted(req.user._id, application);
    }

    await trackUserJobBehavior({
      userId: req.user._id,
      eventType: "applied",
      job: {
        id: jobId,
        title,
        company,
        location: "",
        salary: 0,
        skillsRequired: []
      },
      metadata: { source: "applications.smart-apply", mode }
    });

    if (hasReviewConfirmation) {
      await QueueAuditLog.create({
        user: req.user._id,
        applicationId: application._id,
        jobTitle: application.title,
        company: application.company,
        action: "review_checkpoint",
        reason: "human_review_confirmed",
        previousStatus: "draft",
        previousScheduledFor: null,
        newScheduledFor: null,
        metadata: {
          approvedByUserId: String(req.user._id),
          approvedByName: req.user.name || "",
          reviewedAt: application.reviewedAt,
          mode
        }
      });
    }

    await logUserActivity({
      userId: req.user._id,
      actionType: isSemiAutomatic ? "application_scheduled" : "application_submitted",
      message: isSemiAutomatic
        ? `Application scheduled for ${application.title} at ${application.company}`
        : `Applied to ${application.title} at ${application.company}`,
      metadata: {
        applicationId: application._id,
        jobId,
        title: application.title,
        company: application.company,
        mode,
        scheduledFor
      }
    });

    await QueueAuditLog.create({
      user: req.user._id,
      applicationId: application._id,
      jobTitle: application.title,
      company: application.company,
      action: isSemiAutomatic ? "schedule" : "submit",
      reason: "application_created",
      previousStatus: "draft",
      previousScheduledFor: null,
      newScheduledFor: scheduledFor,
      delaySeconds: isSemiAutomatic ? Number(delayInfo.delaySeconds) : null,
      metadata: {
        mode,
        policyEnabled: policy.enabled,
        jobMatchScore: normalizedJobMatchScore
      }
    });

    res.status(201).json({
      application,
      externalSubmission,
      applySummary: {
        mode,
        dailyLimit: normalizedDailyLimit,
        applicationsToday: updatedSummary.appliedToday,
        remainingToday: updatedSummary.remaining,
        simulatedDelaySeconds: isSemiAutomatic ? delayInfo.delaySeconds : 0,
        scheduledFor,
        responsibleAutomation: policy,
        safetyControls
      },
      credits: {
        deducted: 2,
        remaining: req.user.credits
      }
    });
  } catch (error) {
    next(error);
  }
});

router.put("/:id/cancel-queue", protect, async (req, res, next) => {
  try {
    const application = await Application.findOne({
      _id: req.params.id,
      user: req.user._id,
      submissionStatus: "scheduled"
    });

    if (!application) {
      res.status(404);
      throw new Error("Scheduled application not found");
    }

    const previousScheduledFor = application.scheduledFor;
    const previousStatus = application.submissionStatus;

    application.submissionStatus = "draft";
    application.scheduledFor = null;
    application.simulatedDelaySeconds = 0;

    const updated = await application.save();

    await QueueAuditLog.create({
      user: req.user._id,
      applicationId: application._id,
      jobTitle: application.title,
      company: application.company,
      action: "cancel",
      previousStatus,
      previousScheduledFor,
      newScheduledFor: null,
      delaySeconds: null
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.put("/:id/reschedule", protect, async (req, res, next) => {
  try {
    const { delaySeconds } = req.body;
    const application = await Application.findOne({
      _id: req.params.id,
      user: req.user._id,
      submissionStatus: { $in: ["scheduled", "draft"] }
    });

    if (!application) {
      res.status(404);
      throw new Error("Queued application not found");
    }

    const previousScheduledFor = application.scheduledFor;
    const previousStatus = application.submissionStatus;
    const normalizedDelaySeconds = normalizeDelaySeconds(delaySeconds);
    const scheduledFor = new Date(Date.now() + normalizedDelaySeconds * 1000);

    application.submissionStatus = "scheduled";
    application.scheduledFor = scheduledFor;
    application.simulatedDelaySeconds = normalizedDelaySeconds;

    const updated = await application.save();

    await QueueAuditLog.create({
      user: req.user._id,
      applicationId: application._id,
      jobTitle: application.title,
      company: application.company,
      action: "reschedule",
      previousStatus,
      previousScheduledFor,
      newScheduledFor: scheduledFor,
      delaySeconds: normalizedDelaySeconds
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.get("/learning-insights", protect, async (req, res, next) => {
  try {
    const insights = await getApplicationLearningInsights(req.user._id);
    res.json(insights);
  } catch (error) {
    next(error);
  }
});

router.put("/:id", protect, async (req, res, next) => {
  try {
    const application = await Application.findOne({ _id: req.params.id, user: req.user._id });

    if (!application) {
      res.status(404);
      throw new Error("Application not found");
    }

    const { status, notes, proposalText, outcome, outcomeNotes } = req.body;
    application.status = status ?? application.status;
    application.notes = notes ?? application.notes;
    application.proposalText = proposalText ?? application.proposalText;

    if (outcome !== undefined) {
      const allowedOutcomes = ["unknown", "no_response", "response_received", "job_won"];
      if (!allowedOutcomes.includes(outcome)) {
        res.status(400);
        throw new Error("Invalid outcome value");
      }
      application.outcome = outcome;
      application.outcomeUpdatedAt = new Date();
    }

    if (outcomeNotes !== undefined) {
      application.outcomeNotes = String(outcomeNotes || "");
    }

    const updated = await application.save();
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.put("/:id/outcome", protect, async (req, res, next) => {
  try {
    const { outcome, outcomeNotes = "" } = req.body;
    const allowedOutcomes = ["unknown", "no_response", "response_received", "job_won"];

    if (!allowedOutcomes.includes(outcome)) {
      res.status(400);
      throw new Error("Invalid outcome value");
    }

    const application = await Application.findOne({ _id: req.params.id, user: req.user._id });
    if (!application) {
      res.status(404);
      throw new Error("Application not found");
    }

    application.outcome = outcome;
    application.outcomeNotes = String(outcomeNotes || "");
    application.outcomeUpdatedAt = new Date();

    if (outcome === "job_won") {
      application.status = "accepted";
    }

    const updated = await application.save();
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/retry-external", protect, async (req, res, next) => {
  try {
    const application = await Application.findOne({ _id: req.params.id, user: req.user._id });
    if (!application) {
      res.status(404);
      throw new Error("Application not found");
    }

    if (application.externalSubmission?.submitted) {
      return res.json({ message: "Already submitted", externalSubmission: application.externalSubmission });
    }

    const result = await attachExternalSubmission({
      user: req.user,
      application,
      proposalText: application.proposalText || "",
      mode: "manual"
    });

    res.json({ externalSubmission: result });
  } catch (error) {
    next(error);
  }
});

router.get("/audit-log", protect, async (req, res, next) => {
  try {
    const entries = await QueueAuditLog.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(entries);
  } catch (error) {
    next(error);
  }
});

// Get today's application summary and limits
router.get("/apply-summary", protect, async (req, res, next) => {
  try {
    const entitlements = getEntitlements(req.user);
    const { start: hourStart, end: hourEnd } = getHourRange();
    const appliedToday = await getTodayAppliedCount(req.user._id);
    const appliedThisHour = await Application.countDocuments({
      user: req.user._id,
      createdAt: { $gte: hourStart, $lt: hourEnd },
      submissionStatus: { $in: ["scheduled", "submitted"] }
    });
    const safetyControls = normalizeSafetyControls({
      ...DEFAULT_SAFETY_CONTROLS,
      ...(req.user.smartApplySettings?.safetyControls || {})
    });
    const policy = applySafetyControlsToPolicy(normalizeResponsibleAutomation({
      ...DEFAULT_RESPONSIBLE_AUTOMATION,
      ...(req.user.smartApplySettings?.responsibleAutomation || {})
    }), safetyControls);
    const activeWindow = getNextActiveWindow(policy);
    const hourlyTrend = await getHourlyUsageTrend(req.user._id, 24);
    const effectiveDailyLimit =
      entitlements.maxDailyApplications === null
        ? policy.maxApplicationsPerDay
        : Math.min(entitlements.maxDailyApplications, policy.maxApplicationsPerDay);
    const remaining =
      effectiveDailyLimit === null
        ? null
        : Math.max(effectiveDailyLimit - appliedToday, 0);

    const summary = await getApplicationSummary(req.user._id);
    const userSettings = req.user.smartApplySettings || {};

    res.json({
      summary: {
        ...summary,
        appliedToday,
        dailyLimit: effectiveDailyLimit,
        remaining,
        percentageUsed:
          effectiveDailyLimit === null
            ? null
            : ((appliedToday / effectiveDailyLimit) * 100).toFixed(1)
      },
      settings: {
        mode: userSettings.defaultMode || "manual",
        delaySeconds: userSettings.defaultDelaySeconds || 45,
        dailyLimit: userSettings.defaultDailyLimit || 5,
        requireReviewConfirmation: userSettings.requireReviewConfirmation !== false,
        responsibleAutomation: policy,
        safetyControls
      },
      responsibleAutomation: {
        enabled: policy.enabled,
        usage: {
          appliedThisHour,
          maxApplicationsPerHour: policy.maxApplicationsPerHour,
          hourlyRemaining: Math.max(policy.maxApplicationsPerHour - appliedThisHour, 0),
          appliedToday,
          maxApplicationsPerDay: effectiveDailyLimit,
          dailyRemaining: remaining,
          hourlyTrend: hourlyTrend.points,
          hourlyTrendMaxCount: hourlyTrend.maxCount
        },
        activeWindow: {
          ...activeWindow,
          nextStartAt: activeWindow.nextStartAt || null
        },
        safetyControls
      }
    });
  } catch (error) {
    next(error);
  }
});

// Quick semi-automatic apply endpoint
// Checks limits, applies delay, and confirms application
router.post("/quick-apply", protect, async (req, res, next) => {
  try {
    const entitlements = getEntitlements(req.user);
    const { jobId, title, company, jobDescription, proposalText, useMode, jobMatchScore, reviewConfirmed } = req.body;
    const hasReviewConfirmation = Boolean(reviewConfirmed);

    if (!jobId || !title || !company) {
      res.status(400);
      throw new Error("jobId, title, and company are required");
    }

    const existingApplication = await Application.findOne({
      user: req.user._id,
      jobId
    });
    if (existingApplication) {
      res.status(409);
      throw new Error("You have already applied to this job");
    }

    // Get user settings
    const userSettings = req.user.smartApplySettings || {};
    const reviewRequired = userSettings.requireReviewConfirmation !== false;
    if (reviewRequired && !hasReviewConfirmation) {
      res.status(400);
      throw new Error("Review confirmation is required before applying");
    }
    const dailyLimit = userSettings.defaultDailyLimit || 5;
    const requestedMode = useMode || userSettings.defaultMode || "manual";
    const safetyControls = normalizeSafetyControls({
      ...DEFAULT_SAFETY_CONTROLS,
      ...(userSettings.safetyControls || {})
    });
    const policy = applySafetyControlsToPolicy(normalizeResponsibleAutomation({
      ...DEFAULT_RESPONSIBLE_AUTOMATION,
      ...(userSettings.responsibleAutomation || {})
    }), safetyControls);
    const normalizedJobMatchScore = Math.max(0, Math.min(Number(jobMatchScore) || 0, 100));

    if (requestedMode === "semi-automatic" && !entitlements.canUseSmartAssist) {
      res.status(403);
      throw new Error("Smart Assist mode is available on Pro plan only");
    }

    const policyDailyLimit = policy.enabled
      ? Math.max(1, policy.maxApplicationsPerDay)
      : Math.max(1, Math.min(Number(dailyLimit) || 5, 25));

    const actualDailyLimit =
      entitlements.maxDailyApplications === null
        ? Math.min(Math.max(1, Math.min(Number(dailyLimit) || 5, 25)), policyDailyLimit)
        : Math.min(entitlements.maxDailyApplications, policyDailyLimit);

    if (policy.enabled) {
      const now = new Date();
      if (!isWithinActiveHours(now, policy.activeHoursStart, policy.activeHoursEnd)) {
        await QueueAuditLog.create({
          user: req.user._id,
          jobTitle: title,
          company,
          action: "policy_block",
          reason: "outside_active_hours",
          metadata: {
            activeHoursStart: policy.activeHoursStart,
            activeHoursEnd: policy.activeHoursEnd,
            currentHour: now.getHours()
          }
        });
        res.status(429);
        throw new Error(
          `Applications are only allowed between ${policy.activeHoursStart}:00 and ${policy.activeHoursEnd}:00 in Responsible Automation Mode.`
        );
      }

      if (normalizedJobMatchScore < policy.minJobMatchScore) {
        await QueueAuditLog.create({
          user: req.user._id,
          jobTitle: title,
          company,
          action: "skip",
          reason: "low_job_match",
          metadata: {
            jobMatchScore: Number(jobMatchScore) || 0,
            minimumRequired: policy.minJobMatchScore
          }
        });

        await logUserActivity({
          userId: req.user._id,
          actionType: "job_skipped",
          message: `Job skipped (${title}) due to low match score`,
          metadata: {
            jobId,
            title,
            company,
            reason: "low_job_match",
            score: normalizedJobMatchScore
          }
        });

        return res.status(200).json({
          skipped: true,
          reason: "low_job_match",
          message: `Application skipped for safety: this job's match score is ${normalizedJobMatchScore}%, below your current minimum (${policy.minJobMatchScore}%). Lower your minimum score in Settings > Responsible Automation or switch to Manual mode to proceed.`,
          details: {
            score: normalizedJobMatchScore,
            minimumRequired: policy.minJobMatchScore,
            nextSteps: [
              "Open Settings > Responsible Automation",
              "Lower Minimum Job Match Score",
              "Or switch Apply Mode to Manual"
            ]
          },
          policy,
          safetyControls
        });
      }

      const { start: hourStart, end: hourEnd } = getHourRange();
      const hourlyCount = await Application.countDocuments({
        user: req.user._id,
        createdAt: { $gte: hourStart, $lt: hourEnd },
        submissionStatus: { $in: ["scheduled", "submitted"] }
      });

      if (hourlyCount >= policy.maxApplicationsPerHour) {
        await QueueAuditLog.create({
          user: req.user._id,
          jobTitle: title,
          company,
          action: "policy_block",
          reason: "hourly_limit_reached",
          metadata: {
            hourlyCount,
            maxApplicationsPerHour: policy.maxApplicationsPerHour
          }
        });
        res.status(429);
        throw new Error(
          `Hourly limit reached (${policy.maxApplicationsPerHour}) in Responsible Automation Mode.`
        );
      }

      if (policy.enforceProposalDiversity && proposalText) {
        const diversityCheck = await checkRecentProposalSimilarity(req.user._id, proposalText);
        if (diversityCheck.maxSimilarity >= policy.diversitySimilarityThreshold) {
          await QueueAuditLog.create({
            user: req.user._id,
            jobTitle: title,
            company,
            action: "skip",
            reason: "proposal_too_similar",
            metadata: {
              maxSimilarity: Number(diversityCheck.maxSimilarity.toFixed(3)),
              threshold: policy.diversitySimilarityThreshold,
              mostSimilarTitle: diversityCheck.mostSimilarTitle
            }
          });

          await logUserActivity({
            userId: req.user._id,
            actionType: "job_skipped",
            message: `Job skipped (${title}) due to repetitive proposal`,
            metadata: {
              jobId,
              title,
              company,
              reason: "proposal_too_similar",
              similarity: Number(diversityCheck.maxSimilarity.toFixed(3))
            }
          });

          return res.status(200).json({
            skipped: true,
            reason: "proposal_too_similar",
            message: "Application skipped for safety: this proposal is too similar to recent submissions. Regenerate or tailor your cover letter, then apply again.",
            diversity: {
              maxSimilarity: Number(diversityCheck.maxSimilarity.toFixed(3)),
              threshold: policy.diversitySimilarityThreshold,
              mostSimilarTitle: diversityCheck.mostSimilarTitle
            }
          });
        }
      }
    }

    // Check daily limit
    const todayCount = await getTodayAppliedCount(req.user._id);
    if (todayCount >= actualDailyLimit) {
      res.status(429);
      throw new Error(`Daily limit reached (${actualDailyLimit}) in Responsible Automation Mode.`);
    }

    await ensureUnifiedJobRecord({
      userId: req.user._id,
      jobId,
      title,
      company,
      jobDescription,
      notes: ""
    });

    // Check throttle (prevent rapid applications)
    const throttleCheck = await canApplyWithoutThrottle(req.user._id, 2000);
    if (!throttleCheck.canApply) {
      res.status(429);
      throw new Error(
        `Please wait ${Math.ceil(throttleCheck.waitMs / 1000)}s before applying again`
      );
    }

    // Deduct 2 credits
    const { user: updatedUser } = await deductCredits(
      req.user._id,
      2,
      "job_application",
      { jobId }
    );
    req.user.credits = updatedUser.credits;

    // Determine if semi-automatic or manual
    const mode = requestedMode;
    const isSemiAutomatic = mode === "semi-automatic";

    // Generate delay if semi-automatic
    const delayInfo = isSemiAutomatic
      ? policy.enabled
        ? generateAdaptiveDelay(policy, normalizedJobMatchScore)
        : generateHumanDelay(2, 5)
      : null;

    // Create application record
    const now = new Date();
    const scheduledFor = isSemiAutomatic ? new Date(now.getTime() + delayInfo.delayMs) : null;

    const application = await Application.create({
      user: req.user._id,
      jobId,
      title,
      company,
      jobDescription: jobDescription || "",
      status: "pending",
      proposalText: proposalText || "",
      notes: "",
      applicationMode: mode,
      submissionStatus: isSemiAutomatic ? "scheduled" : "submitted",
      reviewConfirmed: hasReviewConfirmation,
      reviewedAt: hasReviewConfirmation ? now : null,
      scheduledFor,
      submittedAt: isSemiAutomatic ? null : now,
      simulatedDelaySeconds: isSemiAutomatic ? parseInt(delayInfo.delaySeconds) : 0,
      dailyLimitAtSubmission: actualDailyLimit,
      toneUsed: "professional"
    });

    const externalSubmission = !isSemiAutomatic
      ? await attachExternalSubmission({
          user: req.user,
          application,
          proposalText,
          mode
        })
      : null;

    // Record the application attempt
    await recordApplication(req.user._id, actualDailyLimit);

    // Notify immediately if manual, or after delay if semi-automatic
    if (!isSemiAutomatic) {
      await notifyApplicationSubmitted(req.user._id, application);
    }

    // Get updated summary
    const updatedSummary = await getApplicationSummary(req.user._id);

    await trackUserJobBehavior({
      userId: req.user._id,
      eventType: "applied",
      job: {
        id: jobId,
        title,
        company,
        location: "",
        salary: 0,
        skillsRequired: []
      },
      metadata: { source: "applications.quick-apply", mode }
    });

    if (hasReviewConfirmation) {
      await QueueAuditLog.create({
        user: req.user._id,
        applicationId: application._id,
        jobTitle: application.title,
        company: application.company,
        action: "review_checkpoint",
        reason: "human_review_confirmed",
        previousStatus: "draft",
        previousScheduledFor: null,
        newScheduledFor: null,
        metadata: {
          approvedByUserId: String(req.user._id),
          approvedByName: req.user.name || "",
          reviewedAt: application.reviewedAt,
          mode
        }
      });
    }

    await logUserActivity({
      userId: req.user._id,
      actionType: isSemiAutomatic ? "application_scheduled" : "application_submitted",
      message: isSemiAutomatic
        ? `Application scheduled for ${application.title} at ${application.company}`
        : `Applied to ${application.title} at ${application.company}`,
      metadata: {
        applicationId: application._id,
        jobId,
        title: application.title,
        company: application.company,
        mode,
        scheduledFor
      }
    });

    await QueueAuditLog.create({
      user: req.user._id,
      applicationId: application._id,
      jobTitle: application.title,
      company: application.company,
      action: isSemiAutomatic ? "schedule" : "submit",
      reason: "application_created",
      previousStatus: "draft",
      previousScheduledFor: null,
      newScheduledFor: scheduledFor,
      delaySeconds: isSemiAutomatic ? Number(delayInfo.delaySeconds) : null,
      metadata: {
        mode,
        policyEnabled: policy.enabled,
        jobMatchScore: normalizedJobMatchScore
      }
    });

    res.status(201).json({
      success: true,
      mode,
      externalSubmission,
      application: {
        id: application._id,
        jobId: application.jobId,
        title: application.title,
        company: application.company,
        applicationMode: application.applicationMode,
        submissionStatus: application.submissionStatus,
        scheduledFor: application.scheduledFor
      },
      delay: isSemiAutomatic
        ? {
            willWaitSeconds: delayInfo.delaySeconds,
            willWaitMs: delayInfo.delayMs,
            humanized: delayInfo.humanized,
            message: `Application will be submitted in ${delayInfo.humanized} based on responsible pacing settings`
          }
        : null,
      applySummary: {
        mode,
        dailyLimit: actualDailyLimit,
        appliedToday: updatedSummary.appliedToday,
        remaining: updatedSummary.remaining,
        percentageUsed: updatedSummary.percentageUsed,
        responsibleAutomation: policy,
        safetyControls
      },
      credits: {
        deducted: 2,
        remaining: req.user.credits
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get apply settings for user
router.get("/apply-settings", protect, async (req, res, next) => {
  try {
    const entitlements = getEntitlements(req.user);
    const userSettings = req.user.smartApplySettings || {};
    const responsibleAutomation = normalizeResponsibleAutomation({
      ...DEFAULT_RESPONSIBLE_AUTOMATION,
      ...(userSettings.responsibleAutomation || {})
    });
    const maxDailyLimit = entitlements.maxDailyApplications;

    const summary = await getApplicationSummary(req.user._id);
    const appliedToday = await getTodayAppliedCount(req.user._id);

    res.json({
      settings: {
        mode: userSettings.defaultMode || "manual",
        modes: [
          {
            value: "manual",
            label: "Manual",
            description: "Apply immediately when you click"
          },
          {
            value: "semi-automatic",
            label: "Smart Assist",
            description: "Uses adaptive pacing and queue scheduling safeguards",
            premium: true,
            enabled: entitlements.canUseSmartAssist
          }
        ],
        delaySeconds: userSettings.defaultDelaySeconds || 45,
        dailyLimit: userSettings.defaultDailyLimit || 5,
        maxDailyLimit,
        requireReviewConfirmation: userSettings.requireReviewConfirmation !== false,
        responsibleAutomation
      },
      limits: {
        dailyLimit: maxDailyLimit,
        appliedToday,
        remaining: maxDailyLimit === null ? null : Math.max(maxDailyLimit - appliedToday, 0),
        percentageUsed: maxDailyLimit === null ? null : ((appliedToday / maxDailyLimit) * 100).toFixed(1),
        plan: entitlements.plan
      },
      features: {
        semiAutomatic: entitlements.canUseSmartAssist,
        delaySimulation: true,
        dailyLimitEnforcement: true,
        throttleProtection: true,
        queuePreview: true,
        responsibleAutomation: true
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
