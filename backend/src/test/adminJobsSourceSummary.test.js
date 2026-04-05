import { beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import request from "supertest";
import { clearAdminDashboardCache } from "../services/adminDashboardCacheService.js";

process.env.JWT_SECRET = "test-secret";

const userFindByIdMock = vi.fn();
const jobCountDocumentsMock = vi.fn();
const jobAggregateMock = vi.fn();
const userCountDocumentsMock = vi.fn();
const applicationCountDocumentsMock = vi.fn();
const proposalUsageAggregateMock = vi.fn();
const getConversionAnalyticsSummaryMock = vi.fn();
const getExternalJobFeedSyncStatusMock = vi.fn();

vi.mock("../models/User.js", () => ({
  default: {
    findById: userFindByIdMock,
    countDocuments: userCountDocumentsMock
  }
}));

vi.mock("../models/Job.js", () => ({
  default: {
    countDocuments: jobCountDocumentsMock,
    aggregate: jobAggregateMock
  }
}));

vi.mock("../models/Application.js", () => ({
  default: {
    countDocuments: applicationCountDocumentsMock
  }
}));

vi.mock("../models/ProposalUsage.js", () => ({
  default: {
    aggregate: proposalUsageAggregateMock
  }
}));

vi.mock("../services/conversionAnalyticsService.js", () => ({
  exportConversionEventsCsv: vi.fn(),
  getConversionAnalyticsSummary: getConversionAnalyticsSummaryMock
}));

vi.mock("../services/externalJobFeedService.js", () => ({
  getExternalJobFeedSyncStatus: getExternalJobFeedSyncStatusMock,
  EXTERNAL_JOB_FEED_CONSTANTS: {
    EXTERNAL_ID_PREFIXES: ["remotive-", "arbeitnow-", "themuse-"]
  }
}));

vi.mock("../models/ManualPayment.js", () => ({
  default: {
    findOne: vi.fn()
  }
}));

const buildUser = (id) => ({
  _id: id,
  name: id,
  email: `${id}@example.com`,
  role: id === "admin-user" ? "admin" : "user",
  isBanned: false,
  lastActiveAt: new Date()
});

const makeToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET);

const { default: app } = await import("../app.js");

describe("Admin jobs source summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAdminDashboardCache();

    userFindByIdMock.mockImplementation((id) => ({
      select: vi.fn().mockResolvedValue(buildUser(id))
    }));
    getConversionAnalyticsSummaryMock.mockResolvedValue({
      funnel: {
        lockImpressions: 0,
        upgradeClicks: 0,
        checkoutStarts: 0,
        upgradesCompleted: 0
      },
      recent: []
    });
    getExternalJobFeedSyncStatusMock.mockReturnValue({
      enabled: true,
      providerCount: 3,
      cachedJobCount: 24,
      lastAttemptedAt: "2026-04-02T11:46:16.000Z",
      lastSuccessfulSyncAt: "2026-04-02T11:40:00.000Z",
      lastErrorMessage: null,
      providers: [
        {
          id: "remotive",
          name: "Remotive",
          status: "success",
          fetchedJobCount: 8,
          lastAttemptedAt: "2026-04-02T11:46:16.000Z",
          lastSuccessfulSyncAt: "2026-04-02T11:40:00.000Z",
          lastErrorMessage: null
        },
        {
          id: "arbeitnow",
          name: "Arbeitnow",
          status: "success",
          fetchedJobCount: 8,
          lastAttemptedAt: "2026-04-02T11:46:16.000Z",
          lastSuccessfulSyncAt: "2026-04-02T11:40:00.000Z",
          lastErrorMessage: null
        },
        {
          id: "themuse",
          name: "The Muse",
          status: "success",
          fetchedJobCount: 8,
          lastAttemptedAt: "2026-04-02T11:46:16.000Z",
          lastSuccessfulSyncAt: "2026-04-02T11:40:00.000Z",
          lastErrorMessage: null
        }
      ]
    });
    jobAggregateMock.mockResolvedValue([]);
  });

  it("GET /api/admin/jobs/source-summary returns sourceTag totals for admins", async () => {
    jobCountDocumentsMock
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(17);

    const res = await request(app)
      .get("/api/admin/jobs/source-summary")
      .set("Authorization", `Bearer ${makeToken("admin-user")}`);

    expect(res.status).toBe(200);
    expect(res.body.tags).toEqual([
      { sourceTag: "Feed", cardLabel: "Suggested", count: 12 },
      { sourceTag: "User Added", cardLabel: "Your Job", count: 5 }
    ]);
    expect(res.body.totals).toEqual({
      totalJobs: 17,
      feedJobs: 12,
      userAddedJobs: 5
    });
    expect(jobCountDocumentsMock).toHaveBeenCalledTimes(3);
  });

  it("GET /api/admin/jobs/source-summary blocks non-admin users", async () => {
    const res = await request(app)
      .get("/api/admin/jobs/source-summary")
      .set("Authorization", `Bearer ${makeToken("regular-user")}`);

    expect(res.status).toBe(403);
  });

  it("GET /api/admin/dashboard includes jobSourceSummary totals", async () => {
    userCountDocumentsMock
      .mockResolvedValueOnce(41)
      .mockResolvedValueOnce(9);
    proposalUsageAggregateMock.mockResolvedValue([{ _id: null, total: 114 }]);
    applicationCountDocumentsMock.mockResolvedValue(27);
    jobCountDocumentsMock
      .mockResolvedValueOnce(14)
      .mockResolvedValueOnce(3);
    jobAggregateMock.mockResolvedValue([
      { _id: { day: "2026-03-31", sourceTag: "Feed" }, count: 2 },
      { _id: { day: "2026-03-31", sourceTag: "User Added" }, count: 1 }
    ]);

    const res = await request(app)
      .get("/api/admin/dashboard")
      .set("Authorization", `Bearer ${makeToken("admin-user")}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      totalUsers: 41,
      activeUsers: 9,
      totalProposalsGenerated: 114,
      totalApplicationsSent: 27,
      realJobSyncStatus: {
        enabled: true,
        providerCount: 3,
        cachedJobCount: 24
      },
      jobSourceSummary: {
        totals: {
          totalJobs: 17,
          feedJobs: 14,
          userAddedJobs: 3
        }
      }
    });
    expect(Array.isArray(res.body.jobSourceSummary.tags)).toBe(true);
    expect(res.body.jobSourceSummary.tags).toEqual([
      { sourceTag: "Feed", cardLabel: "Suggested", count: 14 },
      { sourceTag: "User Added", cardLabel: "Your Job", count: 3 }
    ]);
    expect(Array.isArray(res.body.jobSourceSummary.trends)).toBe(true);
    expect(res.body.jobSourceSummary.trends).toHaveLength(14);
  });

  it("GET /api/admin/dashboard supports a 30-day job source trend window", async () => {
    userCountDocumentsMock
      .mockResolvedValueOnce(41)
      .mockResolvedValueOnce(9);
    proposalUsageAggregateMock.mockResolvedValue([{ _id: null, total: 114 }]);
    applicationCountDocumentsMock.mockResolvedValue(27);
    jobCountDocumentsMock
      .mockResolvedValueOnce(14)
      .mockResolvedValueOnce(3);
    jobAggregateMock.mockResolvedValue([]);

    const res = await request(app)
      .get("/api/admin/dashboard?trendDays=30")
      .set("Authorization", `Bearer ${makeToken("admin-user")}`);

    expect(res.status).toBe(200);
    expect(res.body.jobSourceSummary.trendDays).toBe(30);
    expect(Array.isArray(res.body.jobSourceSummary.trends)).toBe(true);
    expect(res.body.jobSourceSummary.trends).toHaveLength(30);
  });

  it("GET /api/admin/dashboard caches results per trend window", async () => {
    userCountDocumentsMock
      .mockResolvedValueOnce(41)
      .mockResolvedValueOnce(9)
      .mockResolvedValueOnce(52)
      .mockResolvedValueOnce(11);
    proposalUsageAggregateMock
      .mockResolvedValueOnce([{ _id: null, total: 114 }])
      .mockResolvedValueOnce([{ _id: null, total: 130 }]);
    applicationCountDocumentsMock
      .mockResolvedValueOnce(27)
      .mockResolvedValueOnce(33);
    jobCountDocumentsMock
      .mockResolvedValueOnce(14)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(20)
      .mockResolvedValueOnce(6);
    jobAggregateMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const firstRes = await request(app)
      .get("/api/admin/dashboard?trendDays=14")
      .set("Authorization", `Bearer ${makeToken("admin-user")}`);

    const secondRes = await request(app)
      .get("/api/admin/dashboard?trendDays=14")
      .set("Authorization", `Bearer ${makeToken("admin-user")}`);

    const thirdRes = await request(app)
      .get("/api/admin/dashboard?trendDays=30")
      .set("Authorization", `Bearer ${makeToken("admin-user")}`);

    expect(firstRes.status).toBe(200);
    expect(secondRes.status).toBe(200);
    expect(thirdRes.status).toBe(200);

    expect(firstRes.body.totalUsers).toBe(41);
    expect(secondRes.body.totalUsers).toBe(41);
    expect(thirdRes.body.totalUsers).toBe(52);

    expect(userCountDocumentsMock).toHaveBeenCalledTimes(4);
    expect(applicationCountDocumentsMock).toHaveBeenCalledTimes(2);
    expect(proposalUsageAggregateMock).toHaveBeenCalledTimes(2);
    expect(jobCountDocumentsMock).toHaveBeenCalledTimes(4);
    expect(jobAggregateMock).toHaveBeenCalledTimes(2);
    expect(getExternalJobFeedSyncStatusMock).toHaveBeenCalledTimes(2);
  });
});
