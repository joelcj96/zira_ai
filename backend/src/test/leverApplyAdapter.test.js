import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseLeverSourceLink, submitLeverApplication } from "../services/leverApplyAdapter.js";

describe("leverApplyAdapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.LEVER_DIRECT_APPLY_ENABLED = "true";
  });

  afterEach(() => {
    delete global.fetch;
  });

  it("parses company and job id from a lever URL", () => {
    const parsed = parseLeverSourceLink("https://jobs.lever.co/acme/abc-123-def");
    expect(parsed).toEqual({
      company: "acme",
      jobId: "abc-123-def",
      apiUrl: "https://api.lever.co/v0/postings/acme/abc-123-def/apply"
    });
  });

  it("parses lever URL that includes /apply suffix", () => {
    const parsed = parseLeverSourceLink("https://jobs.lever.co/globo/xyz-999/apply");
    expect(parsed).not.toBeNull();
    expect(parsed.company).toBe("globo");
    expect(parsed.jobId).toBe("xyz-999");
  });

  it("returns null for non-lever URLs", () => {
    expect(parseLeverSourceLink("https://boards.greenhouse.io/acme/jobs/1")).toBeNull();
    expect(parseLeverSourceLink("")).toBeNull();
  });

  it("submits application to Lever API with name, email, phone and cover letter", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ applicationId: "lv-789", message: "Application received." })
    });

    const result = await submitLeverApplication({
      user: { _id: "u1", name: "Alice Smith", email: "alice@example.com", phone: "+1-800-555-0199" },
      application: { _id: "a1", proposalText: "" },
      sourceLink: "https://jobs.lever.co/startupco/role-42",
      proposalText: "Dear Hiring Manager, I am excited...",
      timeoutMs: 8000
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe("https://api.lever.co/v0/postings/startupco/role-42/apply");

    const body = JSON.parse(options.body);
    expect(body.name).toBe("Alice Smith");
    expect(body.email).toBe("alice@example.com");
    expect(body.phone).toBe("+1-800-555-0199");
    expect(body.comments).toContain("Dear Hiring Manager");

    expect(result.attempted).toBe(true);
    expect(result.submitted).toBe(true);
    expect(result.provider).toBe("lever");
    expect(result.externalApplicationId).toBe("lv-789");
  });

  it("returns not-attempted when adapter is disabled", async () => {
    process.env.LEVER_DIRECT_APPLY_ENABLED = "false";
    global.fetch = vi.fn();

    const result = await submitLeverApplication({
      user: { _id: "u1", name: "Alice", email: "alice@example.com" },
      application: {},
      sourceLink: "https://jobs.lever.co/co/job-1",
      proposalText: "Hello",
      timeoutMs: 8000
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.attempted).toBe(false);
    expect(result.submitted).toBe(false);
  });
});
