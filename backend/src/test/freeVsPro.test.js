import { describe, it, expect } from "vitest";
import { getEntitlements, isProUser } from "../services/subscriptionService.js";

describe("Subscription Entitlements", () => {
  it("free user gets free plan entitlements", () => {
    const user = { subscriptionPlan: "free", subscriptionStatus: "active" };
    const entitlements = getEntitlements(user);

    expect(entitlements.plan).toBe("free");
    expect(entitlements.unlimitedCredits).toBe(false);
  });

  it("pro active user gets pro entitlements", () => {
    const user = { subscriptionPlan: "pro", subscriptionStatus: "active" };
    const entitlements = getEntitlements(user);

    expect(entitlements.plan).toBe("pro");
    expect(entitlements.unlimitedCredits).toBe(true);
    expect(entitlements.bestJobMatches).toBe(true);
  });

  it("pro expired user is treated as free", () => {
    const user = { subscriptionPlan: "pro", subscriptionStatus: "expired" };
    const entitlements = getEntitlements(user);

    expect(entitlements.plan).toBe("free");
    expect(entitlements.unlimitedCredits).toBe(false);
  });

  it("isProUser true only for active/trialing pro", () => {
    expect(isProUser({ subscriptionPlan: "pro", subscriptionStatus: "active" })).toBe(true);
    expect(isProUser({ subscriptionPlan: "pro", subscriptionStatus: "trialing" })).toBe(true);
    expect(isProUser({ subscriptionPlan: "pro", subscriptionStatus: "expired" })).toBe(false);
    expect(isProUser({ subscriptionPlan: "free", subscriptionStatus: "active" })).toBe(false);
  });
});
