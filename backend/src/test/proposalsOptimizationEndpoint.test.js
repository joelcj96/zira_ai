import { beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import request from "supertest";

process.env.JWT_SECRET = "test-secret";
process.env.REAL_JOB_ALLOW_MOCK_FALLBACK = "true";

const userFindByIdMock = vi.fn();

vi.mock("../models/User.js", () => ({
  default: {
    findById: userFindByIdMock
  }
}));

const buildUser = (id, role = "user", subscriptionPlan = "free", subscriptionStatus = "inactive") => ({
  _id: id,
  name: id === "pro-user" ? "Pro Candidate" : "Free Candidate",
  email: `${id}@example.com`,
  role,
  isBanned: false,
  lastActiveAt: new Date(),
  skills: ["React", "Node.js"],
  experience: "Built API-driven web features and collaborated with cross-functional teams.",
  preferences: { language: "en" },
  smartApplySettings: {
    defaultMode: "manual",
    defaultDailyLimit: 5,
    requireReviewConfirmation: true
  },
  subscriptionPlan,
  subscriptionStatus
});

const resolveUserById = (id) => {
  if (id === "pro-user") {
    return buildUser(id, "user", "pro", "active");
  }

  if (id === "pro-inactive-user") {
    return buildUser(id, "user", "pro", "past_due");
  }

  return buildUser(id, "user", "free", "inactive");
};

userFindByIdMock.mockImplementation((id) => ({
  select: vi.fn().mockResolvedValue(resolveUserById(id))
}));

const { default: app } = await import("../app.js");

const makeToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET);

describe("Proposals optimization endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    userFindByIdMock.mockImplementation((id) => ({
      select: vi.fn().mockResolvedValue(resolveUserById(id))
    }));
  });

  it("blocks optimization when plan is pro but status is not active/trialing", async () => {
    const res = await request(app)
      .post("/api/proposals/optimize-job-application")
      .set("Authorization", `Bearer ${makeToken("pro-inactive-user")}`)
      .send({
        jobId: "job-101",
        coverLetterOriginal: "I enjoy building frontend systems.",
        cvOriginal: "Experience: React and Node.js features."
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain("Pro");
  });

  it("blocks free users from AI optimization", async () => {
    const res = await request(app)
      .post("/api/proposals/optimize-job-application")
      .set("Authorization", `Bearer ${makeToken("free-user")}`)
      .send({
        jobId: "job-1",
        coverLetterOriginal: "Hello team",
        cvOriginal: "Skills: React, Node.js"
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain("Pro");
  });

  it("returns optimization result shape for pro users", async () => {
    const res = await request(app)
      .post("/api/proposals/optimize-job-application")
      .set("Authorization", `Bearer ${makeToken("pro-user")}`)
      .send({
        jobId: "job-101",
        coverLetterOriginal: "I am applying for this role because it fits my profile.",
        cvOriginal: "Experience: Built web products using React and Node.js.",
        language: "en"
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("matchScore");
    expect(res.body).toHaveProperty("analysis");
    expect(res.body).toHaveProperty("content");

    expect(typeof res.body.matchScore).toBe("number");
    expect(Array.isArray(res.body.analysis.requiredSkills)).toBe(true);
    expect(Array.isArray(res.body.analysis.matchedSkills)).toBe(true);
    expect(Array.isArray(res.body.analysis.missingSkills)).toBe(true);

    expect(res.body.content).toHaveProperty("originalCoverLetter");
    expect(res.body.content).toHaveProperty("optimizedCoverLetter");
    expect(res.body.content).toHaveProperty("originalCv");
    expect(res.body.content).toHaveProperty("optimizedCv");
  });

  it("returns 404 for unknown jobs", async () => {
    const res = await request(app)
      .post("/api/proposals/optimize-job-application")
      .set("Authorization", `Bearer ${makeToken("pro-user")}`)
      .send({
        jobId: "job-does-not-exist"
      });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Job not found");
  });
});
