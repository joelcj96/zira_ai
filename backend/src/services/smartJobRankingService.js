import Application from "../models/Application.js";
import { scoreJob } from "./jobMatcher.js";
import { buildJobIntelligence } from "./jobIntelligenceService.js";
import { getUserBehaviorProfile } from "./behaviorPersonalizationService.js";
import { getStructuredSkills } from "./userProfileService.js";

const POSITIVE_OUTCOMES = ["response_received", "job_won"];

const normalize = (value = "") => String(value || "").toLowerCase().trim();

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "senior",
  "junior",
  "developer",
  "engineer",
  "specialist",
  "manager",
  "lead",
  "remote"
]);

const tokenize = (text = "") =>
  normalize(text)
    .split(/[^a-z0-9+#.]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));

const toPercent = (value) => Math.max(0, Math.min(100, Math.round(value)));

const getMatchedSkillStats = (job, user) => {
  const requiredSkills = Array.isArray(job.skillsRequired) ? job.skillsRequired : [];
  const normalizedUserSkills = getStructuredSkills(user).map((item) => normalize(item));

  const matchedCount = requiredSkills.filter((skill) => {
    const normalizedRequired = normalize(skill);
    return normalizedUserSkills.some(
      (userSkill) => userSkill.includes(normalizedRequired) || normalizedRequired.includes(userSkill)
    );
  }).length;

  return {
    matchedCount,
    requiredCount: requiredSkills.length
  };
};

const buildSuccessKeywordProfile = async (userId) => {
  const successfulApps = await Application.find({
    user: userId,
    outcome: { $in: POSITIVE_OUTCOMES }
  })
    .select("title")
    .sort({ outcomeUpdatedAt: -1, updatedAt: -1 })
    .limit(40)
    .lean();

  const keywordFreq = {};
  successfulApps.forEach((item) => {
    tokenize(item.title).forEach((keyword) => {
      keywordFreq[keyword] = (keywordFreq[keyword] || 0) + 1;
    });
  });

  return keywordFreq;
};

const computeSuccessPatternScore = (job, keywordProfile) => {
  const jobTokens = tokenize(job.title);
  if (!jobTokens.length || !Object.keys(keywordProfile).length) {
    return 50;
  }

  const weightedHits = jobTokens.reduce((sum, token) => sum + (keywordProfile[token] || 0), 0);
  return toPercent(Math.min(100, 35 + weightedHits * 14));
};

export const rankJobsSmart = async (jobs, user) => {
  const behaviorProfile = await getUserBehaviorProfile(user._id);
  const successKeywordProfile = await buildSuccessKeywordProfile(user._id);

  const ranked = jobs
    .map((job) => {
      const intelligence = buildJobIntelligence(job, user);
      const preferenceScore = scoreJob(job, user, behaviorProfile);
      const successPatternScore = computeSuccessPatternScore(job, successKeywordProfile);
      const { matchedCount, requiredCount } = getMatchedSkillStats(job, user);

      const explanation = {
        skillMatch: {
          matchedCount,
          requiredCount,
          percentage: requiredCount > 0 ? toPercent((matchedCount / requiredCount) * 100) : null
        },
        successSimilarity: {
          score: successPatternScore,
          isSimilarToPastSuccess: successPatternScore >= 60
        }
      };

      const smartScore = toPercent(
        intelligence.skillMatchScore * 0.35 +
          intelligence.jobScore * 0.3 +
          preferenceScore * 0.2 +
          successPatternScore * 0.15
      );

      return {
        ...job,
        matchScore: preferenceScore,
        intelligence,
        smartRanking: {
          smartScore,
          skillMatchScore: intelligence.skillMatchScore,
          jobScore: intelligence.jobScore,
          preferenceScore,
          successPatternScore
        },
        aiExplanation: explanation
      };
    })
    .sort((a, b) => b.smartRanking.smartScore - a.smartRanking.smartScore);

  const filtered = ranked.filter((job) => job.smartRanking.smartScore >= 35);
  const jobsForFeed = filtered.length >= 3 ? filtered : ranked;
  const topMatches = jobsForFeed.slice(0, 3);

  return {
    jobsForFeed,
    topMatches,
    behaviorProfile
  };
};
