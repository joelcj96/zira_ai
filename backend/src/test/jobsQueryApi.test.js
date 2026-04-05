import { beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import request from "supertest";

process.env.JWT_SECRET = "test-secret";

const userFindByIdMock = vi.fn();
const rankJobsSmartMock = vi.fn();
const notificationExistsMock = vi.fn();
const notificationCreateMock = vi.fn();

vi.mock("../models/User.js", () => ({
  default: {
    findById: userFindByIdMock
  }
}));

vi.mock("../services/smartJobRankingService.js", () => ({
  rankJobsSmart: rankJobsSmartMock
}));

vi.mock("../models/Notification.js", () => ({
  default: {
    exists: notificationExistsMock,
    create: notificationCreateMock
  }
}));

const buildUser = (id) => ({
  _id: id,
  name: "Pro User",
  email: `${id}@example.com`,
  role: "user",
  isBanned: false,
  lastActiveAt: new Date(),
  subscriptionPlan: "pro",
  subscriptionStatus: "active"
});

const makeToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET);

const { default: app } = await import("../app.js");

describe("Jobs query API", () => {
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
          location: "Remote",
          locationType: "remote",
          jobType: "full-time",
          budgetRange: "mid",
          postedAt: "2026-03-29T09:00:00.000Z",
          salary: 90000,
          description: "Build scalable React apps and collaborate with designers.",
          skillsRequired: ["React"],
          matchScore: 75,
          smartRanking: { smartScore: 82 }
        },
        {
          id: "job-103",
          title: "AI Product Developer",
          company: "CortexBridge",
          location: "Remote",
          locationType: "remote",
          jobType: "freelance",
          budgetRange: "high",
          postedAt: "2026-04-03T08:15:00.000Z",
          salary: 135000,
          description: "Integrate LLM APIs into product workflows.",
          skillsRequired: ["OpenAI"],
          matchScore: 88,
          smartRanking: { smartScore: 93 }
        }
      ],
      topMatches: [],
      behaviorProfile: {
        preferredBudgetLevel: "high",
        toneHint: "confident",
        ignoredCount: 0,
        totalEvents: 10
      }
    });

    notificationExistsMock.mockResolvedValue(false);
    notificationCreateMock.mockResolvedValue({ _id: "note_1" });
  });

  it("GET /api/jobs applies q/filters/sort server-side", async () => {
    const res = await request(app)
      .get("/api/jobs")
      .query({
        q: "ai",
        jobType: "freelance",
        locationType: "remote",
        budgetRange: "high",
        sort: "highest-paying"
      })
      .set("Authorization", `Bearer ${makeToken("pro-user")}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.jobs)).toBe(true);
    expect(res.body.jobs).toHaveLength(1);
    expect(res.body.jobs[0].id).toBe("job-103");
    expect(res.body.topMatches).toHaveLength(1);
    expect(res.body.topMatches[0].id).toBe("job-103");

    // Active query filters should suppress top-match daily notification creation.
    expect(notificationExistsMock).not.toHaveBeenCalled();
    expect(notificationCreateMock).not.toHaveBeenCalled();
  });

  it("GET /api/jobs applies page/limit pagination", async () => {
    const res = await request(app)
      .get("/api/jobs")
      .query({
        sort: "highest-paying",
        page: "2",
        limit: "1"
      })
      .set("Authorization", `Bearer ${makeToken("pro-user")}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination).toMatchObject({
      page: 2,
      limit: 1,
      total: 2,
      totalPages: 2,
      hasPrev: true,
      hasNext: false
    });
    expect(res.body.jobs).toHaveLength(1);
    expect(res.body.jobs[0].id).toBe("job-101");
    expect(res.body.topMatches[0].id).toBe("job-103");
  });
});
