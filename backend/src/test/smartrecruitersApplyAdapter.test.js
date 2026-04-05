import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseSmartRecruitersSourceLink,
  submitSmartRecruitersApplication
} from "../services/smartrecruitersApplyAdapter.js";

describe("parseSmartRecruitersSourceLink", () => {
  it("parses jobs.smartrecruiters.com URL", () => {
    const parsed = parseSmartRecruitersSourceLink(
      "https://jobs.smartrecruiters.com/AcmeCorp/abc-def-engineer"
    );
    expect(parsed).not.toBeNull();
    expect(parsed.company).toBe("AcmeCorp");
    expect(parsed.jobId).toBe("abc-def-engineer");
    expect(parsed.apiUrl).toContain("/companies/AcmeCorp/postings/abc-def-engineer/candidates");
  });

  it("returns null for non-SmartRecruiters URLs", () => {
    expect(parseSmartRecruitersSourceLink("https://jobs.lever.co/co/job-1")).toBeNull();
    expect(parseSmartRecruitersSourceLink("https://boards.greenhouse.io/acme/jobs/1")).toBeNull();
    expect(parseSmartRecruitersSourceLink("")).toBeNull();
  });
});

describe("submitSmartRecruitersApplication", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    process.env.SMARTRECRUITERS_DIRECT_APPLY_ENABLED = "true";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.SMARTRECRUITERS_DIRECT_APPLY_ENABLED;
  });

  it("returns attempted=false when adapter is disabled", async () => {
    process.env.SMARTRECRUITERS_DIRECT_APPLY_ENABLED = "false";
    const result = await submitSmartRecruitersApplication({
      user: { name: "John Doe", email: "john@doe.com" },
      application: {},
      sourceLink: "https://jobs.smartrecruiters.com/Acme/role-1",
      proposalText: "Cover letter"
    });
    expect(result.attempted).toBe(false);
    expect(result.submitted).toBe(false);
    expect(result.provider).toBe("smartrecruiters");
  });

  it("submits successfully with correct JSON body", async () => {
    let capturedBody = null;
    global.fetch = vi.fn(async (url, options) => {
      capturedBody = JSON.parse(options?.body || "{}");
      return {
        ok: true,
        json: async () => ({ id: "sr-candidate-42" })
      };
    });

    const result = await submitSmartRecruitersApplication({
      user: { name: "Jane Smith", email: "jane@smith.com", phone: "555-9876" },
      application: {},
      sourceLink: "https://jobs.smartrecruiters.com/GlobalCorp/position-xyz",
      proposalText: "I am passionate about this role."
    });

    expect(result.attempted).toBe(true);
    expect(result.submitted).toBe(true);
    expect(result.provider).toBe("smartrecruiters");
    expect(result.externalApplicationId).toBe("sr-candidate-42");

    expect(capturedBody.firstName).toBe("Jane");
    expect(capturedBody.lastName).toBe("Smith");
    expect(capturedBody.email).toBe("jane@smith.com");
    expect(capturedBody.phoneNumber).toBe("555-9876");
    expect(capturedBody.coverLetter?.text).toContain("passionate");
  });

  it("blocks submission when name or email is missing", async () => {
    const result = await submitSmartRecruitersApplication({
      user: { name: "", email: "" },
      application: {},
      sourceLink: "https://jobs.smartrecruiters.com/Acme/role-1",
      proposalText: ""
    });
    expect(result.attempted).toBe(true);
    expect(result.submitted).toBe(false);
    expect(result.message).toMatch(/name and email/i);
  });

  it("returns submitted=false and provider error message on non-2xx response", async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      json: async () => ({ message: "Posting not accepting applications" })
    }));

    const result = await submitSmartRecruitersApplication({
      user: { name: "Jane Smith", email: "jane@smith.com" },
      application: {},
      sourceLink: "https://jobs.smartrecruiters.com/Acme/closed-role",
      proposalText: "Cover letter"
    });

    expect(result.attempted).toBe(true);
    expect(result.submitted).toBe(false);
    expect(result.message).toMatch(/not accepting applications/i);
  });
});
