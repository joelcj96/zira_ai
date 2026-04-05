import { getStructuredSkills } from "./userProfileService.js";

const normalize = (value) => (value || "").toLowerCase();

const getBehaviorBudgetBoost = (job, behaviorProfile) => {
  if (!behaviorProfile?.preferredBudgetLevel) return 0;

  const salary = Number(job.salary) || 0;
  const level = salary >= 120000 ? "high" : salary >= 80000 ? "medium" : "low";
  return level === behaviorProfile.preferredBudgetLevel ? 14 : -4;
};

const getBehaviorLocationBoost = (job, behaviorProfile) => {
  if (!behaviorProfile?.preferredLocations?.length) return 0;
  const location = normalize(job.location);
  return behaviorProfile.preferredLocations.some((item) => item.value === location) ? 10 : 0;
};

const getBehaviorSkillBoost = (job, behaviorProfile) => {
  if (!behaviorProfile?.preferredSkills?.length) return 0;
  const normalizedSkills = (job.skillsRequired || []).map((item) => normalize(item));
  const matches = behaviorProfile.preferredSkills.filter((item) => normalizedSkills.includes(item.value)).length;
  return matches * 4;
};

const getIgnoredPenalty = (job, behaviorProfile) => {
  if (!behaviorProfile?.ignoredTitleKeywords?.length) return 0;
  const normalizedTitle = normalize(job.title);
  const matchCount = behaviorProfile.ignoredTitleKeywords.filter((item) =>
    normalizedTitle.includes(item.value)
  ).length;
  return matchCount * 14;
};

export const scoreJob = (job, user, behaviorProfile = null) => {
  let score = 0;

  const userSkills = getStructuredSkills(user).map((s) => normalize(s));
  const required = (job.skillsRequired || []).map((s) => normalize(s));

  const skillMatches = required.filter((skill) => userSkills.includes(skill)).length;
  score += skillMatches * 25;

  const titles = (user.preferences?.titles || []).map((t) => normalize(t));
  if (titles.some((title) => normalize(job.title).includes(title))) {
    score += 20;
  }

  const locations = (user.preferences?.locations || []).map((l) => normalize(l));
  if (locations.length > 0 && locations.includes(normalize(job.location))) {
    score += 15;
  }

  if (user.preferences?.remoteOnly && normalize(job.location) === "remote") {
    score += 15;
  }

  if ((job.salary || 0) >= (user.preferences?.salaryMin || 0)) {
    score += 10;
  }

  score += getBehaviorBudgetBoost(job, behaviorProfile);
  score += getBehaviorLocationBoost(job, behaviorProfile);
  score += getBehaviorSkillBoost(job, behaviorProfile);
  score -= getIgnoredPenalty(job, behaviorProfile);

  return Math.min(score, 100);
};

export const filterAndRankJobs = (jobs, user, behaviorProfile = null) => {
  return jobs
    .map((job) => ({
      ...job,
      matchScore: scoreJob(job, user, behaviorProfile)
    }))
    .filter((job) => job.matchScore >= 20)
    .sort((a, b) => b.matchScore - a.matchScore);
};
