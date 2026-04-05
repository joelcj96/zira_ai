import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseGreenhouseSourceLink, submitGreenhouseApplication } from "../services/greenhouseApplyAdapter.js";

describe("greenhouseApplyAdapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.GREENHOUSE_DIRECT_APPLY_ENABLED = "true";
    process.env.GREENHOUSE_DEFAULT_PHONE = "";
  });

  afterEach(() => {
    delete global.fetch;
  });

  it("parses board token and job id from greenhouse URL", () => {
    const parsed = parseGreenhouseSourceLink("https://boards.greenhouse.io/acme/jobs/1234567");
    expect(parsed).toEqual({
      boardToken: "acme",
      jobId: "1234567",
      apiUrl: "https://boards-api.greenhouse.io/v1/boards/acme/jobs/1234567"
    });
  });

  it("returns null for non-greenhouse URLs", () => {
    expect(parseGreenhouseSourceLink("https://example.com/jobs/1")).toBeNull();
  });

  it("fetches job questions then submits when all required fields are satisfied", async () => {
    global.fetch = vi.fn()
      // first call: GET job questions
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          questions: [
            { required: true, label: "First Name", fields: [{ name: "first_name", type: "input_text" }] },
            { required: true, label: "Email", fields: [{ name: "email", type: "input_text" }] }
          ]
        })
      })
      // second call: POST application
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: "gh-app-1", message: "Accepted" })
      });

    const result = await submitGreenhouseApplication({
      user: { _id: "u1", name: "Jane Doe", email: "jane@example.com" },
      application: { _id: "a1", proposalText: "Hi" },
      sourceLink: "https://boards.greenhouse.io/acme/jobs/1234567",
      proposalText: "Tailored cover",
      timeoutMs: 8000
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result.attempted).toBe(true);
    expect(result.submitted).toBe(true);
    expect(result.provider).toBe("greenhouse");
    expect(result.externalApplicationId).toBe("gh-app-1");
  });

  it("blocks submission and reports missing fields when job requires phone and resume", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        questions: [
          { required: true, label: "First Name", fields: [{ name: "first_name", type: "input_text" }] },
          { required: true, label: "Email", fields: [{ name: "email", type: "input_text" }] },
          { required: true, label: "Phone", fields: [{ name: "phone", type: "input_text" }] },
          { required: true, label: "Resume", fields: [{ name: "resume", type: "input_file" }] }
        ]
      })
    });

    // User has no phone and no CV uploaded
    const result = await submitGreenhouseApplication({
      user: {
        _id: "u1", name: "Jane Doe", email: "jane@example.com",
        phone: "", profileData: { cvRawText: "" }
      },
      application: { _id: "a1", proposalText: "" },
      sourceLink: "https://boards.greenhouse.io/acme/jobs/1234567",
      proposalText: "",
      timeoutMs: 8000
    });

    // Only the GET should have been called — POST must not have been attempted
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result.attempted).toBe(true);
    expect(result.submitted).toBe(false);
    expect(result.missingFields).toContain("Phone number (add it in Profile settings)");
    expect(result.missingFields).toContain("Resume/CV (upload your CV in Profile settings)");
  });

  it("maps phone and cv from user profile when job questions require them", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          questions: [
            { required: true, label: "Phone", fields: [{ name: "phone", type: "input_text" }] },
            { required: false, label: "Resume", fields: [{ name: "resume", type: "input_file" }] }
          ]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: "gh-app-2", message: "Accepted" })
      });

    const result = await submitGreenhouseApplication({
      user: {
        _id: "u1", name: "Jane Doe", email: "jane@example.com", phone: "+1-555-0100",
        profileData: { cvRawText: "Software Engineer with 5 years of experience..." }
      },
      application: { _id: "a1", proposalText: "" },
      sourceLink: "https://boards.greenhouse.io/acme/jobs/1234567",
      proposalText: "I am a great fit.",
      timeoutMs: 8000
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result.attempted).toBe(true);
    expect(result.submitted).toBe(true);
    expect(result.externalApplicationId).toBe("gh-app-2");
  });

  it("falls back to best-effort payload when question fetch fails", async () => {
    global.fetch = vi.fn()
      // GET fails
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) })
      // POST succeeds with fallback data
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: "gh-app-3", message: "Accepted" })
      });

    const result = await submitGreenhouseApplication({
      user: { _id: "u1", name: "Jane Doe", email: "jane@example.com" },
      application: { _id: "a1", proposalText: "" },
      sourceLink: "https://boards.greenhouse.io/acme/jobs/1234567",
      proposalText: "Hi there",
      timeoutMs: 8000
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result.attempted).toBe(true);
    expect(result.submitted).toBe(true);
  });
});
