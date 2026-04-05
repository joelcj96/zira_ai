import Application from "../models/Application.js";

const POSITIVE_OUTCOMES = new Set(["response_received", "job_won"]);
const NEGATIVE_OUTCOMES = new Set(["no_response"]);

const clip = (value = "", max = 260) => {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "N/A";
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
};

const detectWeakSignals = (examples = []) => {
  const signals = {
    tooShort: 0,
    genericOpeners: 0,
    lowSpecificity: 0
  };

  const genericRegex = /\b(i am excited to apply|great fit|thank you for your consideration|opportunity to apply)\b/i;

  examples.forEach((item) => {
    const proposal = String(item.proposalText || "").trim();
    const words = proposal.split(/\s+/).filter(Boolean).length;

    if (words > 0 && words < 120) {
      signals.tooShort += 1;
    }

    if (genericRegex.test(proposal)) {
      signals.genericOpeners += 1;
    }

    const keywordHits = (proposal.match(/\b(api|react|node|python|data|design|testing|architecture|performance|delivery)\b/gi) || []).length;
    if (keywordHits < 2) {
      signals.lowSpecificity += 1;
    }
  });

  return Object.entries(signals)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key)
    .slice(0, 3);
};

export const getApplicationOutcomeExamples = async (userId, limit = 12) => {
  const items = await Application.find({
    user: userId,
    outcome: { $in: ["no_response", "response_received", "job_won"] },
    proposalText: { $exists: true, $ne: "" }
  })
    .select("title company jobDescription proposalText outcome outcomeUpdatedAt")
    .sort({ outcomeUpdatedAt: -1, updatedAt: -1 })
    .limit(limit)
    .lean();

  const positiveExamples = items.filter((item) => POSITIVE_OUTCOMES.has(item.outcome));
  const negativeExamples = items.filter((item) => NEGATIVE_OUTCOMES.has(item.outcome));

  return {
    totalExamples: items.length,
    positiveExamples,
    negativeExamples
  };
};

export const buildApplicationLearningContext = async (userId, limit = 12) => {
  const { totalExamples, positiveExamples, negativeExamples } = await getApplicationOutcomeExamples(
    userId,
    limit
  );

  if (!totalExamples) {
    return null;
  }

  const topPositive = positiveExamples.slice(0, 3);
  const topNegative = negativeExamples.slice(0, 3);
  const negativeSignals = detectWeakSignals(negativeExamples);

  const lines = [];
  lines.push("REAL APPLICATION OUTCOME LEARNING:");
  lines.push(`- Positive examples: ${positiveExamples.length}`);
  lines.push(`- Unsuccessful examples: ${negativeExamples.length}`);

  if (topPositive.length > 0) {
    lines.push("- Positive patterns to emulate:");
    topPositive.forEach((item, idx) => {
      lines.push(
        `  ${idx + 1}) ${item.title} at ${item.company} | Outcome: ${item.outcome}`
      );
      lines.push(`     Job context: ${clip(item.jobDescription, 180)}`);
      lines.push(`     Proposal excerpt: ${clip(item.proposalText, 200)}`);
    });
  }

  if (topNegative.length > 0) {
    lines.push("- Unsuccessful patterns to avoid repeating:");
    topNegative.forEach((item, idx) => {
      lines.push(`  ${idx + 1}) ${item.title} at ${item.company} | Outcome: ${item.outcome}`);
      lines.push(`     Job context: ${clip(item.jobDescription, 180)}`);
      lines.push(`     Proposal excerpt: ${clip(item.proposalText, 200)}`);
    });
  }

  if (negativeSignals.length > 0) {
    const signalText = negativeSignals
      .map((signal) => {
        if (signal === "tooShort") return "proposals that are too short";
        if (signal === "genericOpeners") return "generic opener phrasing";
        return "low-specificity value statements";
      })
      .join(", ");

    lines.push(`- Avoid these recurring weak signals: ${signalText}.`);
  }

  lines.push("- Prioritize specificity and concrete requirement-to-skill alignment.");

  return {
    context: lines.join("\n"),
    stats: {
      totalExamples,
      positiveExamples: positiveExamples.length,
      negativeExamples: negativeExamples.length
    }
  };
};

export const getApplicationLearningInsights = async (userId, limit = 24) => {
  const allWithOutcome = await Application.find({
    user: userId,
    outcome: { $in: ["no_response", "response_received", "job_won"] }
  })
    .select("outcome outcomeUpdatedAt")
    .sort({ outcomeUpdatedAt: -1, updatedAt: -1 })
    .limit(limit)
    .lean();

  const positiveCount = allWithOutcome.filter((item) => POSITIVE_OUTCOMES.has(item.outcome)).length;
  const negativeCount = allWithOutcome.filter((item) => NEGATIVE_OUTCOMES.has(item.outcome)).length;
  const total = allWithOutcome.length;

  const winCount = allWithOutcome.filter((item) => item.outcome === "job_won").length;
  const responseCount = allWithOutcome.filter((item) => item.outcome === "response_received").length;
  const noResponseCount = allWithOutcome.filter((item) => item.outcome === "no_response").length;

  const positiveRate = total > 0 ? Math.round((positiveCount / total) * 100) : 0;
  const winRate = total > 0 ? Math.round((winCount / total) * 100) : 0;

  const trendScoreByOutcome = {
    job_won: 100,
    response_received: 72,
    no_response: 24
  };

  const trendPoints = allWithOutcome
    .slice(0, 7)
    .reverse()
    .map((item, index) => ({
      label: `#${index + 1}`,
      outcome: item.outcome,
      score: trendScoreByOutcome[item.outcome] || 0
    }));

  const startScore = trendPoints[0]?.score || 0;
  const endScore = trendPoints[trendPoints.length - 1]?.score || 0;
  const delta = endScore - startScore;
  const trendDirection = delta > 8 ? "improving" : delta < -8 ? "declining" : "flat";

  const contextData = await buildApplicationLearningContext(userId, Math.min(limit, 12));
  const weakSignals = contextData?.context?.includes("Avoid these recurring weak signals")
    ? contextData.context
        .split("Avoid these recurring weak signals:")[1]
        ?.split(".")[0]
        ?.trim() || ""
    : "";

  let influenceSummary = "Collect more outcomes to improve proposal adaptation.";
  if (total >= 3 && positiveRate >= 60) {
    influenceSummary = "AI will emphasize wording patterns from your positive outcomes.";
  } else if (total >= 3 && positiveRate < 40) {
    influenceSummary = "AI will reduce patterns linked to low-response proposals and increase specificity.";
  } else if (total > 0) {
    influenceSummary = "AI is balancing both positive and negative patterns while gathering more evidence.";
  }

  return {
    totalExamples: total,
    positiveExamples: positiveCount,
    negativeExamples: negativeCount,
    positiveRate,
    winRate,
    outcomeBreakdown: {
      jobWon: winCount,
      responseReceived: responseCount,
      noResponse: noResponseCount
    },
    weakSignals,
    influenceSummary,
    trendPoints,
    trendDirection,
    updatedAt: allWithOutcome[0]?.outcomeUpdatedAt || null
  };
};
