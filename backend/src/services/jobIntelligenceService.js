import { getStructuredSkills } from "./userProfileService.js";

const normalize = (value = "") => String(value).toLowerCase().trim();

const URGENT_KEYWORDS = [
  "urgent",
  "urgently",
  "asap",
  "immediately",
  "immediate start",
  "start today",
  "quick turnaround",
  "fast delivery"
];

const CLARITY_POSITIVE = [
  "responsibilities",
  "requirements",
  "deliverables",
  "scope",
  "timeline",
  "experience",
  "communication"
];

const CLARITY_NEGATIVE = ["need someone", "easy job", "quick task", "simple task", "cheap"];

const toPercent = (value) => Math.max(0, Math.min(100, Math.round(value)));

const scoreSkillMatch = ({ requiredSkills = [], userSkills = [] }) => {
  if (!requiredSkills.length) return 50;
  const normalizedUserSkills = userSkills.map((item) => normalize(item));
  const matched = requiredSkills.filter((required) => {
    const normalizedRequired = normalize(required);
    return normalizedUserSkills.some(
      (skill) => skill.includes(normalizedRequired) || normalizedRequired.includes(skill)
    );
  }).length;

  return toPercent((matched / requiredSkills.length) * 100);
};

const inferBudgetLevel = ({ salary = 0, description = "" }) => {
  const text = normalize(description);

  if (salary >= 120000 || /high budget|well-funded|enterprise/i.test(text)) {
    return "high";
  }

  if (salary >= 80000 || /competitive pay|market rate/i.test(text)) {
    return "medium";
  }

  return "low";
};

const budgetToScore = {
  low: 35,
  medium: 65,
  high: 90
};

const inferUrgency = (description = "") => {
  const text = normalize(description);
  const hitCount = URGENT_KEYWORDS.filter((keyword) => text.includes(keyword)).length;

  if (hitCount >= 2) return "high";
  if (hitCount === 1) return "medium";
  return "low";
};

const scoreClientQuality = ({ description = "", requiredSkills = [] }) => {
  const text = normalize(description);
  const descLengthScore = Math.min(45, Math.floor(text.length / 12));
  const structureScore = Math.min(20, requiredSkills.length * 4);
  const positiveSignals = CLARITY_POSITIVE.filter((term) => text.includes(term)).length * 5;
  const negativeSignals = CLARITY_NEGATIVE.filter((term) => text.includes(term)).length * 8;

  return toPercent(descLengthScore + structureScore + positiveSignals - negativeSignals + 20);
};

const assignLabelKey = ({ jobScore, urgencyLevel, clientQualityScore }) => {
  if (clientQualityScore < 45 || jobScore < 35) {
    return "lowQuality";
  }

  if (urgencyLevel === "high" && jobScore >= 60) {
    return "quickWin";
  }

  if (jobScore >= 75 && clientQualityScore >= 60) {
    return "highValue";
  }

  return "quickWin";
};

export const buildJobIntelligence = (job, user) => {
  const userSkills = getStructuredSkills(user);
  const requiredSkills = Array.isArray(job.skillsRequired) ? job.skillsRequired : [];

  const skillMatchScore = scoreSkillMatch({ requiredSkills, userSkills });
  const budgetLevel = inferBudgetLevel({ salary: job.salary, description: job.description });
  const budgetScore = budgetToScore[budgetLevel] || 35;
  const urgencyLevel = inferUrgency(job.description || "");
  const clientQualityScore = scoreClientQuality({
    description: job.description || "",
    requiredSkills
  });

  const jobScore = toPercent(skillMatchScore * 0.55 + budgetScore * 0.2 + clientQualityScore * 0.25);
  const labelKey = assignLabelKey({ jobScore, urgencyLevel, clientQualityScore });

  return {
    skillMatchScore,
    budgetLevel,
    urgencyLevel,
    clientQualityScore,
    jobScore,
    labelKey
  };
};
