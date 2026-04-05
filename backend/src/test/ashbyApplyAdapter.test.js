import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseAshbySourceLink, submitAshbyApplication } from "../services/ashbyApplyAdapter.js";

describe("parseAshbySourceLink", () => {
  it("parses standard jobs.ashbyhq.com URL", () => {
    const parsed = parseAshbySourceLink("https://jobs.ashbyhq.com/acme/abc-123-def");
    expect(parsed).not.toBeNull();
    expect(parsed.company).toBe("acme");
    expect(parsed.jobPostingId).toBe("abc-123-def");
  });

  it("parses URL with /application suffix", () => {
    const parsed = parseAshbySourceLink("https://jobs.ashbyhq.com/globo/xyz-999/application");
    expect(parsed).not.toBeNull();
    expect(parsed.company).toBe("globo");
    expect(parsed.jobPostingId).toBe("xyz-999");
  });

  it("returns null for non-Ashby URLs", () => {
    expect(parseAshbySourceLink("https://boards.greenhouse.io/acme/jobs/1")).toBeNull();
    expect(parseAshbySourceLink("https://jobs.lever.co/co/job-1")).toBeNull();
    expect(parseAshbySourceLink("")).toBeNull();
  });
});

describe("submitAshbyApplication", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    process.env.ASHBY_DIRECT_APPLY_ENABLED = "true";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.ASHBY_DIRECT_APPLY_ENABLED;
  });

  it("returns attempted=false when adapter is disabled", async () => {
    process.env.ASHBY_DIRECT_APPLY_ENABLED = "false";
    const result = await submitAshbyApplication({
      user: { name: "Jane Test", email: "jane@test.com" },
      application: {},
      sourceLink: "https://jobs.ashbyhq.com/acme/abc-123",
      proposalText: "Hello"
    });
    expect(result.attempted).toBe(false);
    expect(result.submitted).toBe(false);
    expect(result.provider).toBe("ashby");
  });

  it("submits successfully and returns externalApplicationId", async () => {
    let callCount = 0;
    global.fetch = vi.fn(async (url) => {
      callCount++;
      // First call: form info
      if (String(url).includes("applicationForm.info")) {
        return {
          ok: true,
          json: async () => ({ results: { applicationFormDefinition: { sections: [] } } })
        };
      }
      // Second call: submit
      return {
        ok: true,
        json: async () => ({ results: { applicationId: "ashby-app-999" } })
      };
    });

    const result = await submitAshbyApplication({
      user: { name: "Jane Test", email: "jane@test.com", phone: "555-1234" },
      application: {},
      sourceLink: "https://jobs.ashbyhq.com/acmecorp/role-abc",
      proposalText: "I am a great fit"
    });

    expect(result.attempted).toBe(true);
    expect(result.submitted).toBe(true);
    expect(result.provider).toBe("ashby");
    expect(result.externalApplicationId).toBe("ashby-app-999");
    expect(callCount).toBe(2);
  });

  it("blocks submission when name or email is missing", async () => {
    const result = await submitAshbyApplication({
      user: { name: "", email: "" },
      application: {},
      sourceLink: "https://jobs.ashbyhq.com/acme/abc-123",
      proposalText: ""
    });
    expect(result.attempted).toBe(true);
    expect(result.submitted).toBe(false);
    expect(result.message).toMatch(/name and email/i);
  });

  it("returns submitted=false and message on provider error response", async () => {
    global.fetch = vi.fn(async (url) => {
      if (String(url).includes("applicationForm.info")) {
        return { ok: false, json: async () => ({}) };
      }
      return {
        ok: false,
        json: async () => ({ message: "Job posting not found" })
      };
    });

    const result = await submitAshbyApplication({
      user: { name: "Jane Test", email: "jane@test.com" },
      application: {},
      sourceLink: "https://jobs.ashbyhq.com/acme/bad-id",
      proposalText: "Cover letter"
    });

    expect(result.attempted).toBe(true);
    expect(result.submitted).toBe(false);
    expect(result.message).toMatch(/job posting not found/i);
  });

  it("proceeds with best-effort form data when form info fetch fails", async () => {
    let submitCalled = false;
    global.fetch = vi.fn(async (url) => {
      if (String(url).includes("applicationForm.info")) {
        throw new Error("network error");
      }
      submitCalled = true;
      return {
        ok: true,
        json: async () => ({ applicationId: "fallback-app-1" })
      };
    });

    const result = await submitAshbyApplication({
      user: { name: "Jane Test", email: "jane@test.com" },
      application: {},
      sourceLink: "https://jobs.ashbyhq.com/acme/role-xyz",
      proposalText: "Cover letter text"
    });

    expect(submitCalled).toBe(true);
    expect(result.attempted).toBe(true);
    expect(result.submitted).toBe(true);
  });
});
