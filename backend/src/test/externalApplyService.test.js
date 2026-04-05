import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detectApplyProvider, submitExternalApplication } from "../services/externalApplyService.js";

describe("externalApplyService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.EXTERNAL_APPLY_ENABLED = "false";
    process.env.EXTERNAL_APPLY_WEBHOOK_URL = "";
    process.env.EXTERNAL_APPLY_TIMEOUT_MS = "15000";
    process.env.GREENHOUSE_DIRECT_APPLY_ENABLED = "true";
    process.env.LEVER_DIRECT_APPLY_ENABLED = "true";
  });

  afterEach(() => {
    delete global.fetch;
  });

  it("detects known providers from source links", () => {
    expect(detectApplyProvider("https://www.linkedin.com/jobs/view/123")).toBe("linkedin");
    expect(detectApplyProvider("https://jobs.lever.co/acme/abc")).toBe("lever");
    expect(detectApplyProvider("https://boards.greenhouse.io/acme/jobs/1")).toBe("greenhouse");
    expect(detectApplyProvider("https://example.com/jobs/1")).toBe("generic");
  });

  it("does not attempt external submission when integration is disabled", async () => {
    const result = await submitExternalApplication({
      user: { _id: "u1", name: "U", email: "u@example.com" },
      application: { _id: "a1", jobId: "j1", title: "Dev", company: "Acme" },
      sourceLink: "https://www.linkedin.com/jobs/view/123",
      proposalText: "Hello",
      mode: "manual"
    });

    expect(result.attempted).toBe(false);
    expect(result.submitted).toBe(false);
    expect(result.message).toContain("disabled");
  });

  it("returns LinkedIn not-supported message without attempting fetch", async () => {
    process.env.EXTERNAL_APPLY_ENABLED = "true";
    process.env.EXTERNAL_APPLY_WEBHOOK_URL = "https://integration.example/apply";

    global.fetch = vi.fn();

    const result = await submitExternalApplication({
      user: { _id: "u1", name: "U", email: "u@example.com" },
      application: { _id: "a1", jobId: "j1", title: "Dev", company: "Acme" },
      sourceLink: "https://www.linkedin.com/jobs/view/9999",
      proposalText: "Hello",
      mode: "manual"
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.attempted).toBe(false);
    expect(result.submitted).toBe(false);
    expect(result.provider).toBe("linkedin");
    expect(result.message).toContain("LinkedIn");
  });

  it("submits via webhook when enabled and webhook responds ok", async () => {
    process.env.EXTERNAL_APPLY_ENABLED = "true";
    process.env.EXTERNAL_APPLY_WEBHOOK_URL = "https://integration.example/apply";

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ submitted: true, externalApplicationId: "ext-123", message: "Submitted" })
    });

    const result = await submitExternalApplication({
      user: { _id: "u1", name: "U", email: "u@example.com" },
      application: { _id: "a1", jobId: "j1", title: "Dev", company: "Acme" },
      // Use a workday URL so it exercises the webhook path (not a dedicated adapter)
      sourceLink: "https://company.myworkdayjobs.com/en-US/careers/job/Remote/Dev_JR",
      proposalText: "Hello",
      mode: "manual"
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result.attempted).toBe(true);
    expect(result.submitted).toBe(true);
    expect(result.externalApplicationId).toBe("ext-123");
  });

  it("uses direct Greenhouse adapter path when provider is greenhouse", async () => {
    process.env.EXTERNAL_APPLY_ENABLED = "true";

    // Greenhouse adapter does a GET for questions + a POST to apply — mock both
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ questions: [] })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: "gh-123", message: "Accepted" })
      });

    const result = await submitExternalApplication({
      user: { _id: "u1", name: "U", email: "u@example.com" },
      application: { _id: "a1", jobId: "j1", title: "Dev", company: "Acme" },
      sourceLink: "https://boards.greenhouse.io/acme/jobs/1234567",
      proposalText: "Hello",
      mode: "manual"
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result.provider).toBe("greenhouse");
    expect(result.attempted).toBe(true);
    expect(result.submitted).toBe(true);
    expect(result.externalApplicationId).toBe("gh-123");
  });

  it("uses direct Lever adapter path when provider is lever", async () => {
    process.env.EXTERNAL_APPLY_ENABLED = "true";

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ applicationId: "lv-456", message: "Application received." })
    });

    const result = await submitExternalApplication({
      user: { _id: "u1", name: "Zara Jones", email: "zara@example.com" },
      application: { _id: "a1", jobId: "j1", title: "Dev", company: "Acme" },
      sourceLink: "https://jobs.lever.co/acme/abc-123-def",
      proposalText: "Dear Hiring Team...",
      mode: "manual"
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result.provider).toBe("lever");
    expect(result.attempted).toBe(true);
    expect(result.submitted).toBe(true);
    expect(result.externalApplicationId).toBe("lv-456");
  });

  it("does not externally submit scheduled semi-automatic applications", async () => {
    process.env.EXTERNAL_APPLY_ENABLED = "true";
    process.env.EXTERNAL_APPLY_WEBHOOK_URL = "https://integration.example/apply";

    global.fetch = vi.fn();

    const result = await submitExternalApplication({
      user: { _id: "u1", name: "U", email: "u@example.com" },
      application: { _id: "a1", jobId: "j1", title: "Dev", company: "Acme" },
      sourceLink: "https://company.myworkdayjobs.com/en-US/careers/job/Remote/Dev_JR",
      proposalText: "Hello",
      mode: "semi-automatic"
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.attempted).toBe(false);
    expect(result.submitted).toBe(false);
    expect(result.message).toContain("scheduled");
  });
});
