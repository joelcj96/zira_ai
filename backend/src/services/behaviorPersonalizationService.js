import UserJobBehavior from "../models/UserJobBehavior.js";

const normalize = (value = "") => String(value || "").toLowerCase().trim();

const tokenize = (text = "") =>
  normalize(text)
    .split(/[^a-z0-9+#.]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);

const toTopEntries = (map, limit = 6) =>
  Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));

const toOutcomeScore = (eventType) => {
  if (eventType === "applied") return 1.0;
  if (eventType === "clicked") return 0.55;
  return -0.8;
};

export const trackUserJobBehavior = async ({ userId, eventType, job = {}, metadata = {} }) => {
  if (!userId || !eventType || !job.id) {
    return null;
  }

  return UserJobBehavior.create({
    user: userId,
    jobId: job.id,
    eventType,
    title: job.title || "",
    company: job.company || "",
    location: job.location || "",
    salary: Number(job.salary) || 0,
    skillsRequired: Array.isArray(job.skillsRequired) ? job.skillsRequired : [],
    metadata
  });
};

export const getUserBehaviorProfile = async (userId, lookbackLimit = 150) => {
  const events = await UserJobBehavior.find({ user: userId })
    .select("eventType title location salary skillsRequired createdAt")
    .sort({ createdAt: -1 })
    .limit(lookbackLimit)
    .lean();

  if (!events.length) {
    return {
      totalEvents: 0,
      clickedCount: 0,
      appliedCount: 0,
      ignoredCount: 0,
      preferredBudgetLevel: null,
      preferredLocations: [],
      preferredSkills: [],
      ignoredTitleKeywords: [],
      toneHint: "professional"
    };
  }

  const positiveEvents = events.filter((event) => event.eventType === "applied" || event.eventType === "clicked");
  const ignoredEvents = events.filter((event) => event.eventType === "ignored");

  const budgetSignals = { low: 0, medium: 0, high: 0 };
  const locationFreq = {};
  const skillFreq = {};
  const ignoredTitleFreq = {};

  positiveEvents.forEach((event) => {
    const weight = toOutcomeScore(event.eventType);
    const salary = Number(event.salary) || 0;

    if (salary >= 120000) budgetSignals.high += weight;
    else if (salary >= 80000) budgetSignals.medium += weight;
    else budgetSignals.low += weight;

    const location = normalize(event.location);
    if (location) {
      locationFreq[location] = (locationFreq[location] || 0) + 1;
    }

    (event.skillsRequired || []).forEach((skill) => {
      const normalized = normalize(skill);
      if (normalized) {
        skillFreq[normalized] = (skillFreq[normalized] || 0) + 1;
      }
    });
  });

  ignoredEvents.forEach((event) => {
    tokenize(event.title).forEach((token) => {
      ignoredTitleFreq[token] = (ignoredTitleFreq[token] || 0) + 1;
    });
  });

  const preferredBudgetLevel = Object.entries(budgetSignals).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const preferredLocations = toTopEntries(locationFreq, 4);
  const preferredSkills = toTopEntries(skillFreq, 8);
  const ignoredTitleKeywords = toTopEntries(ignoredTitleFreq, 8);

  let toneHint = "professional";
  if (budgetSignals.high > budgetSignals.medium + budgetSignals.low) {
    toneHint = "confident";
  } else if (preferredLocations.some((item) => item.value === "remote")) {
    toneHint = "friendly";
  }

  return {
    totalEvents: events.length,
    clickedCount: events.filter((event) => event.eventType === "clicked").length,
    appliedCount: events.filter((event) => event.eventType === "applied").length,
    ignoredCount: ignoredEvents.length,
    preferredBudgetLevel,
    preferredLocations,
    preferredSkills,
    ignoredTitleKeywords,
    toneHint
  };
};

export const buildBehaviorPromptContext = (profile) => {
  if (!profile || !profile.totalEvents) {
    return "";
  }

  const preferredSkills = profile.preferredSkills.slice(0, 5).map((item) => item.value).join(", ");
  const preferredLocations = profile.preferredLocations.slice(0, 3).map((item) => item.value).join(", ");
  const ignoredKeywords = profile.ignoredTitleKeywords.slice(0, 5).map((item) => item.value).join(", ");

  return [
    "USER BEHAVIOR PERSONALIZATION:",
    `- Events observed: ${profile.totalEvents}`,
    `- Applied jobs: ${profile.appliedCount}, Clicked jobs: ${profile.clickedCount}, Ignored jobs: ${profile.ignoredCount}`,
    `- Preferred budget level: ${profile.preferredBudgetLevel || "unknown"}`,
    preferredLocations ? `- Preferred locations: ${preferredLocations}` : "",
    preferredSkills ? `- Preferred skill themes: ${preferredSkills}` : "",
    ignoredKeywords ? `- De-prioritize titles/themes with these keywords: ${ignoredKeywords}` : "",
    `- Recommended communication tone hint: ${profile.toneHint}`
  ]
    .filter(Boolean)
    .join("\n");
};
