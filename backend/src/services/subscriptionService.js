const FREE_DAILY_APPLICATION_LIMIT = Math.max(
  1,
  Number(process.env.FREE_PLAN_DAILY_APPLICATIONS || 5)
);

const FREE_DAILY_PROPOSAL_LIMIT = Math.max(
  1,
  Number(process.env.FREE_PLAN_DAILY_PROPOSALS || 5)
);

export const isProUser = (user) =>
  user?.subscriptionPlan === "pro" && ["active", "trialing"].includes(user?.subscriptionStatus);

export const getPlanName = (user) => (isProUser(user) ? "pro" : "free");

export const getEntitlements = (user) => {
  const pro = isProUser(user);

  return {
    plan: pro ? "pro" : "free",
    unlimitedCredits: pro,
    smartAiProposals: pro,
    bestJobMatches: pro,
    maxDailyApplications: pro ? null : FREE_DAILY_APPLICATION_LIMIT,
    maxDailyProposals: pro ? null : FREE_DAILY_PROPOSAL_LIMIT,
    canUseSmartAssist: pro
  };
};
