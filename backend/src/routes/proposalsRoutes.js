import express from "express";
import { protect } from "../middleware/auth.js";
import ProposalUsage from "../models/ProposalUsage.js";
import ProposalHistory from "../models/ProposalHistory.js";
import { deductCredits } from "./creditsRoutes.js";
import {
  extractKeyRequirements,
  getProposalStrategyForJob,
  generateProposal,
  matchRequirementsToSkills,
  optimizeJobApplicationContent
} from "../services/openaiService.js";
import {
  saveProposalToHistory,
  getSuccessfulProposals,
  analyzeSuccessPatterns,
  generateContextFromSuccessful,
  markProposalSuccess
} from "../services/proposalAnalysisService.js";
import { buildApplicationLearningContext } from "../services/applicationLearningService.js";
import {
  buildBehaviorPromptContext,
  getUserBehaviorProfile
} from "../services/behaviorPersonalizationService.js";
import { getEntitlements, isProUser } from "../services/subscriptionService.js";
import { getProfileContext, getStructuredSkills } from "../services/userProfileService.js";
import { logUserActivity } from "../services/activityLogService.js";
import { getUnifiedJobById } from "../services/jobStoreService.js";

const router = express.Router();

const normalizeExternalJob = (rawJob = {}) => {
  const title = String(rawJob.title || "").trim();
  const description = String(rawJob.description || rawJob.fullDescription || "").trim();

  if (!title || !description) {
    return null;
  }

  return {
    id: String(rawJob.id || `external-${Date.now()}`),
    title,
    company: String(rawJob.company || "External Platform").trim() || "External Platform",
    location: String(rawJob.location || "Remote").trim() || "Remote",
    description,
    sourceLink: typeof rawJob.sourceLink === "string" ? rawJob.sourceLink : null,
    skillsRequired: Array.isArray(rawJob.skillsRequired)
      ? rawJob.skillsRequired.filter(Boolean).map((item) => String(item).trim())
      : []
  };
};

const getDayKey = () => new Date().toISOString().slice(0, 10);

router.post("/generate", protect, async (req, res, next) => {
  try {
    const { jobId, tone, variationSeed, language } = req.body;
    const allowedTones = ["professional", "friendly", "confident"];
    const entitlements = getEntitlements(req.user);
    const isPro = isProUser(req.user);

    if (!jobId) {
      res.status(400);
      throw new Error("jobId is required");
    }

    const job = await getUnifiedJobById({ jobId, userId: req.user._id });
    if (!job) {
      res.status(404);
      throw new Error("Job not found");
    }

    if (tone && !allowedTones.includes(tone)) {
      res.status(400);
      throw new Error("Invalid tone. Use professional, friendly, or confident.");
    }

    if (!isPro && tone && tone !== "professional") {
      res.status(403);
      throw new Error("Friendly and confident tones are available on Pro plan only");
    }

    if (!isPro && variationSeed) {
      res.status(403);
      throw new Error("Generate Again is a Pro-only feature");
    }

    // Check free-plan daily limit BEFORE deducting credits
    let usage = null;
    if (!isPro) {
      const dayKey = getDayKey();
      usage = await ProposalUsage.findOneAndUpdate(
        { user: req.user._id, dayKey },
        { $setOnInsert: { count: 0 } },
        { upsert: true, new: true }
      );

      if (usage.count >= entitlements.maxDailyProposals) {
        res.status(429);
        throw new Error(
          `Free plan limit reached: ${entitlements.maxDailyProposals} proposals per day. Upgrade to Pro for unlimited proposals.`
        );
      }
    }

    // Deduct credits only after confirming the request is valid
    const { user: updatedUser } = await deductCredits(
      req.user._id,
      1,
      "proposal_generation",
      { jobId }
    );
    req.user.credits = updatedUser.credits;

    if (usage) {
      usage.count += 1;
      await usage.save();
    }

    const requirements = extractKeyRequirements(job);
    const matchInsights = matchRequirementsToSkills({
      requirements,
      userSkills: getStructuredSkills(req.user)
    });

    const applicationLearning = await buildApplicationLearningContext(req.user._id);
    const behaviorProfile = await getUserBehaviorProfile(req.user._id);
    const behaviorContext = buildBehaviorPromptContext(behaviorProfile);
    const additionalContext = [applicationLearning?.context || "", behaviorContext]
      .filter(Boolean)
      .join("\n\n");

    const resolvedTone =
      isPro && tone
        ? tone
        : isPro && ["professional", "friendly", "confident"].includes(behaviorProfile?.toneHint)
        ? behaviorProfile.toneHint
        : "professional";

    const proposal = await generateProposal({
      user: req.user,
      job,
      tone: isPro ? resolvedTone : "professional",
      variationSeed: variationSeed || "",
      additionalContext,
      outputLanguage: language || req.user.preferences?.language || "en"
    });
    const strategy = getProposalStrategyForJob(job);

    // Save proposal to history for learning
    const proposalHistoryId = await saveProposalToHistory(
      req.user._id,
      jobId,
      job.title,
      proposal,
      isPro ? resolvedTone : "professional",
      req.user.skills?.length || 0,
      ((matchInsights.directMatches?.length || 0) / (requirements.length || 1)) * 100,
      requirements.length || 0
    );

    await logUserActivity({
      userId: req.user._id,
      actionType: "proposal_generated",
      message: `Proposal generated for ${job.title} at ${job.company}`,
      metadata: {
        jobId: job.id,
        title: job.title,
        company: job.company,
        tone: isPro ? resolvedTone : "professional",
        strategy: strategy?.type || "unknown"
      }
    });

    res.json({
      proposal,
      proposalHistoryId,
      job,
      strategy,
      tone: isPro ? resolvedTone : "professional",
      insights: isPro
        ? {
            requirements,
            matchedSkills: matchInsights.directMatches,
            uncoveredRequirements: matchInsights.unmatchedRequirements
          }
        : null,
      learning: applicationLearning?.stats || {
        totalExamples: 0,
        positiveExamples: 0,
        negativeExamples: 0
      },
      subscription: {
        plan: req.user.subscriptionPlan || "free",
        status: req.user.subscriptionStatus || "inactive",
        freePlanDailyLimit: entitlements.maxDailyProposals,
        usedToday: usage?.count || 0,
        remainingToday: usage ? Math.max(entitlements.maxDailyProposals - usage.count, 0) : null
      },
      credits: {
        current: req.user.credits,
        deducted: 1,
        remaining: req.user.credits
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post("/generate-external", protect, async (req, res, next) => {
  try {
    const { job: rawJob, tone, language } = req.body;
    const allowedTones = ["professional", "friendly", "confident"];
    const entitlements = getEntitlements(req.user);
    const isPro = isProUser(req.user);

    const job = normalizeExternalJob(rawJob);
    if (!job) {
      res.status(400);
      throw new Error("A valid analyzed job is required");
    }

    if (tone && !allowedTones.includes(tone)) {
      res.status(400);
      throw new Error("Invalid tone. Use professional, friendly, or confident.");
    }

    if (!isPro && tone && tone !== "professional") {
      res.status(403);
      throw new Error("Friendly and confident tones are available on Pro plan only");
    }

    let usage = null;
    if (!isPro) {
      const dayKey = getDayKey();
      usage = await ProposalUsage.findOneAndUpdate(
        { user: req.user._id, dayKey },
        { $setOnInsert: { count: 0 } },
        { upsert: true, new: true }
      );

      if (usage.count >= entitlements.maxDailyProposals) {
        res.status(429);
        throw new Error(
          `Free plan limit reached: ${entitlements.maxDailyProposals} proposals per day. Upgrade to Pro for unlimited proposals.`
        );
      }
    }

    const { user: updatedUser } = await deductCredits(
      req.user._id,
      1,
      "proposal_generation_external_job",
      { jobId: job.id, sourceLink: job.sourceLink }
    );
    req.user.credits = updatedUser.credits;

    if (usage) {
      usage.count += 1;
      await usage.save();
    }

    const requirements = extractKeyRequirements(job);
    const matchInsights = matchRequirementsToSkills({
      requirements,
      userSkills: getStructuredSkills(req.user)
    });

    const applicationLearning = await buildApplicationLearningContext(req.user._id);
    const behaviorProfile = await getUserBehaviorProfile(req.user._id);
    const behaviorContext = buildBehaviorPromptContext(behaviorProfile);
    const additionalContext = [applicationLearning?.context || "", behaviorContext]
      .filter(Boolean)
      .join("\n\n");

    const resolvedTone =
      isPro && tone
        ? tone
        : isPro && ["professional", "friendly", "confident"].includes(behaviorProfile?.toneHint)
        ? behaviorProfile.toneHint
        : "professional";

    const proposal = await generateProposal({
      user: req.user,
      job,
      tone: isPro ? resolvedTone : "professional",
      additionalContext,
      outputLanguage: language || req.user.preferences?.language || "en"
    });
    const strategy = getProposalStrategyForJob(job);

    const proposalHistoryId = await saveProposalToHistory(
      req.user._id,
      job.id,
      job.title,
      proposal,
      isPro ? resolvedTone : "professional",
      req.user.skills?.length || 0,
      ((matchInsights.directMatches?.length || 0) / (requirements.length || 1)) * 100,
      requirements.length || 0
    );

    res.json({
      proposal,
      proposalHistoryId,
      job,
      strategy,
      tone: isPro ? resolvedTone : "professional",
      insights: {
        requirements,
        matchedSkills: matchInsights.directMatches,
        uncoveredRequirements: matchInsights.unmatchedRequirements
      },
      credits: {
        current: req.user.credits,
        deducted: 1,
        remaining: req.user.credits
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get user's proposal history
router.get("/history", protect, async (req, res, next) => {
  try {
    const { limit = 10, skip = 0, onlySuccessful = false } = req.query;
    
    const query = { user: req.user._id };
    if (onlySuccessful === 'true') {
      query.success = true;
    }

    const total = await ProposalHistory.countDocuments(query);
    const proposals = await ProposalHistory.find(query)
      .select("jobId jobTitle tone success successReason userRating userFeedback detectedTonePatterns createdAt")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean();

    res.json({
      proposals,
      total,
      page: Math.floor(parseInt(skip) / parseInt(limit)) + 1,
      pageSize: parseInt(limit),
      successCount: await ProposalHistory.countDocuments({ ...query, success: true })
    });
  } catch (error) {
    next(error);
  }
});

// Get successful proposals and success patterns for current user
router.get("/successful-patterns", protect, async (req, res, next) => {
  try {
    const successPatterns = await analyzeSuccessPatterns(req.user._id);
    const successfulProposals = await getSuccessfulProposals(req.user._id, 5);

    if (!successPatterns) {
      return res.json({
        successCount: 0,
        message: "No successful proposals yet. Keep generating and rating proposals!",
        nextSteps: [
          "Generate a new proposal",
          "Rate proposals as successful when they lead to interviews",
          "The system will learn from your patterns"
        ]
      });
    }

    res.json({
      ...successPatterns,
      recentSuccessful: successfulProposals,
      aiInsight: `You've had ${successPatterns.successCount} successful proposal(s). Your most effective approach uses a ${successPatterns.mostEffectiveTone} tone with ${(successPatterns.averageConfidence * 100).toFixed(0)}% confidence. Keep leveraging these patterns!`
    });
  } catch (error) {
    next(error);
  }
});

// Mark a proposal as successful
router.post("/mark-success/:proposalHistoryId", protect, async (req, res, next) => {
  try {
    const { proposalHistoryId } = req.params;
    const { successReason, userRating, userFeedback } = req.body;

    // Verify ownership
    const proposal = await ProposalHistory.findById(proposalHistoryId);
    if (!proposal || proposal.user.toString() !== req.user._id.toString()) {
      res.status(404);
      throw new Error("Proposal not found or unauthorized");
    }

    // Mark as successful
    await markProposalSuccess(proposalHistoryId, successReason, userRating);

    // Update feedback if provided
    if (userFeedback) {
      await ProposalHistory.findByIdAndUpdate(proposalHistoryId, { userFeedback });
    }

    // Get updated success patterns
    const updatedPatterns = await analyzeSuccessPatterns(req.user._id);

    res.json({
      success: true,
      message: "Proposal marked as successful! The AI is learning from this.",
      updatedPatterns
    });
  } catch (error) {
    next(error);
  }
});

// Regenerate a proposal using successful patterns as context
router.post("/regenerate-smarter", protect, async (req, res, next) => {
  try {
    const entitlements = getEntitlements(req.user);
    if (!entitlements.smartAiProposals) {
      res.status(403);
      throw new Error("Smart AI proposal regeneration is available on Pro plan only");
    }

    const { jobId, currentProposalHistoryId, language } = req.body;

    if (!jobId) {
      res.status(400);
      throw new Error("jobId is required");
    }

    const job = await getUnifiedJobById({ jobId, userId: req.user._id });
    if (!job) {
      res.status(404);
      throw new Error("Job not found");
    }

    // Check credits (regeneration also costs 1 credit)
    const { user: updatedUser } = await deductCredits(
      req.user._id,
      1,
      "proposal_regeneration",
      { jobId }
    );
    req.user.credits = updatedUser.credits;

    // Get successful patterns and context
    const contextData = await generateContextFromSuccessful(req.user._id);
    const applicationLearning = await buildApplicationLearningContext(req.user._id);
    const behaviorProfile = await getUserBehaviorProfile(req.user._id);
    const behaviorContext = buildBehaviorPromptContext(behaviorProfile);
    
    const additionalInstructions = [
      contextData ? `LEARNING CONTEXT: ${contextData.context}` : "",
      applicationLearning?.context || "",
      behaviorContext
    ]
      .filter(Boolean)
      .join("\n\n");

    const requirements = extractKeyRequirements(job);
    const matchInsights = matchRequirementsToSkills({
      requirements,
      userSkills: getStructuredSkills(req.user)
    });

    // Generate using smarter context
    const regenerationTone =
      contextData?.suggestedTone ||
      (["professional", "friendly", "confident"].includes(behaviorProfile?.toneHint)
        ? behaviorProfile.toneHint
        : "professional");

    const proposal = await generateProposal({
      user: req.user,
      job,
      tone: regenerationTone,
      variationSeed: "smarter_" + Date.now(),
      additionalContext: additionalInstructions,
      outputLanguage: language || req.user.preferences?.language || "en"
    });
    const strategy = getProposalStrategyForJob(job);

    // Save new proposal to history
    const proposalHistoryId = await saveProposalToHistory(
      req.user._id,
      jobId,
      job.title,
      proposal,
      regenerationTone,
      req.user.skills?.length || 0,
      ((matchInsights.directMatches?.length || 0) / (requirements.length || 1)) * 100,
      requirements.length || 0
    );

    await logUserActivity({
      userId: req.user._id,
      actionType: "proposal_generated",
      message: `Proposal regenerated for ${job.title} at ${job.company}`,
      metadata: {
        jobId: job.id,
        title: job.title,
        company: job.company,
        tone: regenerationTone,
        strategy: strategy?.type || "unknown",
        smarter: true
      }
    });

    // Mark as "used context" for both current and new proposal
    if (currentProposalHistoryId) {
      await ProposalHistory.findByIdAndUpdate(currentProposalHistoryId, {
        usedAsContext: true,
        $inc: { contextualReferenceCount: 1 }
      });
    }

    res.json({
      proposal,
      proposalHistoryId,
      job,
      strategy,
      isSmarter: true,
      learnedFrom: contextData ? {
        successCount: contextData.patterns.successCount,
        tone: contextData.patterns.mostEffectiveTone,
        confidence: `${(contextData.patterns.averageConfidence * 100).toFixed(0)}%`,
        recommendations: contextData.patterns.recommendations
      } : null,
      message: contextData
        ? "✨ This proposal was regenerated using patterns from your successful previous proposals!"
        : "Proposal regenerated. As you mark proposals successful, the AI will learn and improve.",
      learning: applicationLearning?.stats || {
        totalExamples: 0,
        positiveExamples: 0,
        negativeExamples: 0
      },
      credits: {
        current: req.user.credits,
        deducted: 1,
        remaining: req.user.credits
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post("/optimize-job-application", protect, async (req, res, next) => {
  try {
    const entitlements = getEntitlements(req.user);
    if (!entitlements.smartAiProposals) {
      res.status(403);
      throw new Error("AI Job Optimization is available on Pro plan only");
    }

    const { jobId, coverLetterOriginal = "", cvOriginal = "", language } = req.body;

    if (!jobId) {
      res.status(400);
      throw new Error("jobId is required");
    }

    const job = await getUnifiedJobById({ jobId, userId: req.user._id });
    if (!job) {
      res.status(404);
      throw new Error("Job not found");
    }

    const profile = getProfileContext(req.user);
    const resolvedCoverLetter =
      String(coverLetterOriginal || "").trim() ||
      String(profile.coverLetterText || "").trim();

    const optimization = await optimizeJobApplicationContent({
      user: req.user,
      job,
      coverLetterOriginal: resolvedCoverLetter,
      cvOriginal:
        cvOriginal ||
        [
          `Candidate: ${profile.name}`,
          `Skills: ${(profile.skills || []).join(", ") || "N/A"}`,
          `Experience Summary: ${profile.experienceSummary || "N/A"}`,
          profile.cvRawText ? `CV Text: ${profile.cvRawText}` : ""
        ]
          .filter(Boolean)
          .join("\n"),
      outputLanguage: language || req.user.preferences?.language || "en"
    });

    res.json({
      ...optimization,
      subscription: {
        plan: req.user.subscriptionPlan || "free",
        status: req.user.subscriptionStatus || "inactive"
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post("/optimize-external-job", protect, async (req, res, next) => {
  try {
    const entitlements = getEntitlements(req.user);
    if (!entitlements.smartAiProposals) {
      res.status(403);
      throw new Error("AI Job Optimization is available on Pro plan only");
    }

    const { job: rawJob, coverLetterOriginal = "", cvOriginal = "", language } = req.body;
    const job = normalizeExternalJob(rawJob);

    if (!job) {
      res.status(400);
      throw new Error("A valid analyzed job is required");
    }

    const profile = getProfileContext(req.user);
    const resolvedCoverLetter =
      String(coverLetterOriginal || "").trim() ||
      String(profile.coverLetterText || "").trim();

    const optimization = await optimizeJobApplicationContent({
      user: req.user,
      job,
      coverLetterOriginal: resolvedCoverLetter,
      cvOriginal:
        cvOriginal ||
        [
          `Candidate: ${profile.name}`,
          `Skills: ${(profile.skills || []).join(", ") || "N/A"}`,
          `Experience Summary: ${profile.experienceSummary || "N/A"}`,
          profile.cvRawText ? `CV Text: ${profile.cvRawText}` : ""
        ]
          .filter(Boolean)
          .join("\n"),
      outputLanguage: language || req.user.preferences?.language || "en"
    });

    res.json({
      ...optimization,
      job,
      subscription: {
        plan: req.user.subscriptionPlan || "free",
        status: req.user.subscriptionStatus || "inactive"
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get detailed analysis of a single proposal
router.get("/analysis/:proposalHistoryId", protect, async (req, res, next) => {
  try {
    const { proposalHistoryId } = req.params;

    const proposal = await ProposalHistory.findById(proposalHistoryId);
    if (!proposal || proposal.user.toString() !== req.user._id.toString()) {
      res.status(404);
      throw new Error("Proposal not found or unauthorized");
    }

    res.json({
      proposal: {
        jobTitle: proposal.jobTitle,
        tone: proposal.tone,
        text: proposal.generatedProposal,
        success: proposal.success,
        rating: proposal.userRating,
        feedback: proposal.userFeedback
      },
      analysis: {
        tonePatterns: proposal.detectedTonePatterns,
        structure: proposal.structureAnalysis,
        context: proposal.generationContext
      },
      insights: {
        sentimentInterpretation: proposal.detectedTonePatterns.sentimentScore > 0.5 ? "Very positive" : "Balanced",
        formalityLevel: proposal.detectedTonePatterns.formality > 0.65 ? "Formal" : proposal.detectedTonePatterns.formality > 0.35 ? "Balanced" : "Casual",
        confidenceLevel: proposal.detectedTonePatterns.confidenceLevel > 0.65 ? "Highly confident" : "Moderately confident",
        keyStrengths: proposal.detectedTonePatterns.personalityKeywords
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
