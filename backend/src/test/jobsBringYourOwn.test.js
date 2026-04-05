import { beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import request from "supertest";

process.env.JWT_SECRET = "test-secret";

const userFindByIdMock = vi.fn();

vi.mock("../models/User.js", () => ({
  default: {
    findById: userFindByIdMock
  }
}));

const buildUser = (id) => ({
  _id: id,
  name: "BYO User",
  email: `${id}@example.com`,
  role: "user",
  isBanned: false,
  lastActiveAt: new Date(),
  skills: ["React", "Node.js"],
  preferences: {
    titles: ["developer"],
    locations: ["remote"],
    remoteOnly: true,
    salaryMin: 0
  }
});

const makeToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET);

const { default: app } = await import("../app.js");

describe("Bring Your Own Job API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userFindByIdMock.mockImplementation((id) => ({
      select: vi.fn().mockResolvedValue(buildUser(id))
    }));
  });

  it("POST /api/jobs/analyze-external analyzes manual job description when extraction is unavailable", async () => {
    const res = await request(app)
      .post("/api/jobs/analyze-external")
      .set("Authorization", `Bearer ${makeToken("byo-user")}`)
      .send({
        url: "https://jobs.example.com/react-role",
        manualDescription:
          "We are hiring a React developer to build remote product features, collaborate with design, and improve API integrations with Node.js services."
      });

    expect(res.status).toBe(200);
    expect(res.body.needsManualDescription).toBe(false);
    expect(res.body.job).toMatchObject({
      title: expect.any(String),
      company: expect.any(String),
      location: expect.any(String),
      sourceLink: "https://jobs.example.com/react-role"
    });
    expect(res.body.job.description).toContain("React developer");
    expect(typeof res.body.matchScore).toBe("number");
    expect(Array.isArray(res.body.aiInsights)).toBe(true);
    expect(Array.isArray(res.body.analysis.requiredSkills)).toBe(true);
  });
});
