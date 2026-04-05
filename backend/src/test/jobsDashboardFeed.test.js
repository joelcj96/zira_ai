import { beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import request from "supertest";

process.env.JWT_SECRET = "test-secret";

const userFindByIdMock = vi.fn();
const rankJobsSmartMock = vi.fn();

vi.mock("../models/User.js", () => ({
  default: {
    findById: userFindByIdMock
  }
}));

vi.mock("../services/smartJobRankingService.js", () => ({
  rankJobsSmart: rankJobsSmartMock
}));

const buildUser = (id) => ({
  _id: id,
  name: "Test User",
  email: `${id}@example.com`,
  role: "user",
  isBanned: false,
  lastActiveAt: new Date()
});

const makeToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET);

const { default: app } = await import("../app.js");

describe("Jobs dashboard feed endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    userFindByIdMock.mockImplementation((id) => ({
      select: vi.fn().mockResolvedValue(buildUser(id))
    }));

    rankJobsSmartMock.mockResolvedValue({
      jobsForFeed: [
        {
          id: "job-101",
          title: "Frontend React Developer",
          company: "BluePeak Labs",
          externalSourceName: "Remotive",
          jobType: "full-time",
          locationType: "remote",
          budgetRange: "mid",
          postedAt: "2026-03-29T09:00:00.000Z",
          location: "Remote",
          salary: 90000,
          description: "Build scalable React apps and collaborate with designers.",
          skillsRequired: ["React", "JavaScript"]
        },
        {
          id: "job-102",
          title: "Full Stack Node Engineer",
          company: "NimbusWorks",
          location: "New York",
          salary: 120000,
          description: "Design backend APIs and modern frontend interfaces.",
          skillsRequired: ["Node.js", "Express"]
        }
      ],
      topMatches: [],
      behaviorProfile: {
        preferredBudgetLevel: null,
        toneHint: "professional",
        ignoredCount: 0,
        totalEvents: 0
      }
    });
  });

  it("GET /api/jobs/dashboard-feed returns normalized dashboard jobs", async () => {
    const res = await request(app)
      .get("/api/jobs/dashboard-feed")
      .set("Authorization", `Bearer ${makeToken("feed-user")}`);

    expect(res.status).toBe(200);
    expect(rankJobsSmartMock).toHaveBeenCalled();
    expect(Array.isArray(res.body.jobs)).toBe(true);
    expect(res.body.jobs).toHaveLength(2);

    expect(res.body.jobs[0]).toMatchObject({
      id: "job-101",
      title: "Frontend React Developer",
      company: "BluePeak Labs",
      externalSourceName: "Remotive",
      jobType: "full-time",
      locationType: "remote",
      budgetRange: "mid",
      postedAt: "2026-03-29T09:00:00.000Z",
      shortDescription: "Build scalable React apps and collaborate with designers.",
      location: "Remote",
      salary: "$90,000 / year",
      budget: "Mid-level"
    });

    expect(typeof res.body.jobs[0].details).toBe("string");
    expect(res.body.jobs[0].details).toContain("Core skills:");

    expect(res.body.jobs[1]).toMatchObject({
      id: "job-102",
      salary: "$120,000 / year",
      budget: "Senior"
    });
  });
});
