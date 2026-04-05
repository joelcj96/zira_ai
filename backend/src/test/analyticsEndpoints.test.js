import { beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import request from "supertest";
import { clearAdminDashboardCache } from "../services/adminDashboardCacheService.js";

process.env.JWT_SECRET = "test-secret";

const userFindByIdMock = vi.fn();
const userCountDocumentsMock = vi.fn();
const applicationCountDocumentsMock = vi.fn();
const proposalUsageAggregateMock = vi.fn();
const jobCountDocumentsMock = vi.fn();
const jobAggregateMock = vi.fn();
const trackConversionEventMock = vi.fn();
const getConversionAnalyticsSummaryMock = vi.fn();
const exportConversionEventsCsvMock = vi.fn();

vi.mock("../models/User.js", () => ({
  default: {
    findById: userFindByIdMock,
    countDocuments: userCountDocumentsMock
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

vi.mock("../models/Job.js", () => ({
  default: {
    countDocuments: jobCountDocumentsMock,
    aggregate: jobAggregateMock
  }
}));

vi.mock("../services/conversionAnalyticsService.js", () => ({
  trackConversionEvent: trackConversionEventMock,
  getConversionAnalyticsSummary: getConversionAnalyticsSummaryMock,
  exportConversionEventsCsv: exportConversionEventsCsvMock
}));

const buildUser = (id, role = "user") => ({
  _id: id,
  name: role === "admin" ? "Admin User" : "Free User",
  email: `${id}@example.com`,
  role,
  isBanned: false,
  lastActiveAt: new Date(),
  subscriptionPlan: "free",
  subscriptionStatus: "inactive"
});

userFindByIdMock.mockImplementation((id) => ({
  select: vi.fn().mockResolvedValue(id === "admin-user" ? buildUser(id, "admin") : buildUser(id))
}));

const { default: app } = await import("../app.js");

const makeToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET);

describe("Analytics routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAdminDashboardCache();

    userFindByIdMock.mockImplementation((id) => ({
      select: vi.fn().mockResolvedValue(id === "admin-user" ? buildUser(id, "admin") : buildUser(id))
    }));

    userCountDocumentsMock.mockResolvedValueOnce(12).mockResolvedValueOnce(5);
    applicationCountDocumentsMock.mockResolvedValue(9);
    proposalUsageAggregateMock.mockResolvedValue([{ total: 21 }]);
    jobCountDocumentsMock.mockResolvedValueOnce(20).mockResolvedValueOnce(7);
    jobAggregateMock.mockResolvedValue([]);
    getConversionAnalyticsSummaryMock.mockResolvedValue({
      availableSurfaces: ["jobs_page", "settings_page"],
      funnel: {
        lockImpressions: 100,
        upgradeClicks: 30,
        checkoutStarts: 12,
        upgradesCompleted: 6,
        rates: {
          clickThroughRate: 30,
          checkoutStartRate: 40,
          upgradeCompletionRate: 50,
          overallConversionRate: 6
        }
      },
      trends: [
        {
          date: "2026-04-01",
          lockImpressions: 10,
          upgradeClicks: 3,
          checkoutStarts: 1,
          upgradesCompleted: 1
        }
      ],
      recent: [
        {
          eventType: "upgrade_completed",
          surface: "settings_page",
          feature: "subscription_upgrade",
          planAtEvent: "free",
          createdAt: "2026-04-01T12:00:00.000Z"
        }
      ]
    });
    exportConversionEventsCsvMock.mockResolvedValue(
      '"createdAt","eventType"\n"2026-04-01T12:00:00.000Z","upgrade_completed"'
    );
    trackConversionEventMock.mockResolvedValue({ _id: "evt_123" });
  });

  it("POST /api/analytics/conversion-events stores a valid event", async () => {
    const res = await request(app)
      .post("/api/analytics/conversion-events")
      .set("Authorization", `Bearer ${makeToken("free-user")}`)
      .send({
        eventType: "lock_impression",
        surface: "jobs_page",
        feature: "best_job_matches",
        metadata: { source: "banner" },
        uniqueKey: "jobs:lock:1"
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(trackConversionEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "lock_impression",
        surface: "jobs_page",
        feature: "best_job_matches",
        uniqueKey: "jobs:lock:1"
      })
    );
  });

  it("POST /api/analytics/conversion-events rejects invalid event types", async () => {
    const res = await request(app)
      .post("/api/analytics/conversion-events")
      .set("Authorization", `Bearer ${makeToken("free-user")}`)
      .send({
        eventType: "not_real",
        surface: "jobs_page"
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid eventType");
  });

  it("GET /api/admin/dashboard returns conversion funnel summary for admins", async () => {
    const res = await request(app)
      .get("/api/admin/dashboard")
      .set("Authorization", `Bearer ${makeToken("admin-user")}`);

    expect(res.status).toBe(200);
    expect(res.body.totalUsers).toBe(12);
    expect(res.body.activeUsers).toBe(5);
    expect(res.body.totalProposalsGenerated).toBe(21);
    expect(res.body.totalApplicationsSent).toBe(9);
    expect(res.body.jobSourceSummary.trendDays).toBe(14);
    expect(res.body.conversionAnalytics.funnel.upgradesCompleted).toBe(6);
    expect(getConversionAnalyticsSummaryMock).toHaveBeenCalled();
  });

  it("GET /api/admin/conversion-analytics passes filters to summary service", async () => {
    const res = await request(app)
      .get("/api/admin/conversion-analytics?startDate=2026-04-01&endDate=2026-04-03&surface=jobs_page")
      .set("Authorization", `Bearer ${makeToken("admin-user")}`);

    expect(res.status).toBe(200);
    expect(res.body.funnel.lockImpressions).toBe(100);
    expect(getConversionAnalyticsSummaryMock).toHaveBeenCalledWith({
      startDate: "2026-04-01",
      endDate: "2026-04-03",
      surface: "jobs_page"
    });
  });

  it("GET /api/admin/conversion-analytics?format=csv exports csv", async () => {
    const res = await request(app)
      .get("/api/admin/conversion-analytics?startDate=2026-04-01&endDate=2026-04-03&surface=settings_page&format=csv")
      .set("Authorization", `Bearer ${makeToken("admin-user")}`);

    expect(res.status).toBe(200);
    expect(res.text).toContain("upgrade_completed");
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(exportConversionEventsCsvMock).toHaveBeenCalledWith({
      startDate: "2026-04-01",
      endDate: "2026-04-03",
      surface: "settings_page"
    });
  });
});
