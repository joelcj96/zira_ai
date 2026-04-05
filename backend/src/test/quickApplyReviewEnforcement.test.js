import { beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import request from "supertest";

process.env.JWT_SECRET = "test-secret";

// ── shared mocks ────────────────────────────────────────────────────────────
const userFindByIdMock = vi.fn();
const applicationFindOneMock = vi.fn();
const applicationCountDocumentsMock = vi.fn();
const applicationCreateMock = vi.fn();
const applicationUpdateManyMock = vi.fn();
const queueAuditLogCreateMock = vi.fn();
const activityLogCreateMock = vi.fn();
const canApplyWithoutThrottleMock = vi.fn();
const recordApplicationMock = vi.fn();
const getApplicationSummaryMock = vi.fn();
const deductCreditsMock = vi.fn();
const notifyApplicationSubmittedMock = vi.fn();
const trackUserJobBehaviorMock = vi.fn();

vi.mock("../models/User.js", () => ({
  default: {
    findById: userFindByIdMock,
    updateOne: vi.fn().mockResolvedValue({ acknowledged: true })
  }
}));

vi.mock("../models/Application.js", () => ({
  default: {
    findOne: applicationFindOneMock,
    countDocuments: applicationCountDocumentsMock,
    create: applicationCreateMock,
    updateMany: applicationUpdateManyMock,
    find: vi.fn().mockResolvedValue([])
  }
}));

vi.mock("../models/QueueAuditLog.js", () => ({
  default: { create: queueAuditLogCreateMock }
}));

vi.mock("../models/ActivityLog.js", () => ({
  default: { create: activityLogCreateMock }
}));

vi.mock("../services/applicationAssistantService.js", () => ({
  canApplyWithoutThrottle: canApplyWithoutThrottleMock,
  generateHumanDelay: vi.fn().mockReturnValue({ delayMs: 2000, delaySeconds: 2, humanized: "2 seconds" }),
  recordApplication: recordApplicationMock,
  getApplicationSummary: getApplicationSummaryMock
}));

vi.mock("../routes/creditsRoutes.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    deductCredits: deductCreditsMock
  };
});

vi.mock("../services/notificationService.js", () => ({
  notifyApplicationSubmitted: notifyApplicationSubmittedMock
}));

vi.mock("../services/behaviorPersonalizationService.js", () => ({
  trackUserJobBehavior: trackUserJobBehaviorMock
}));

vi.mock("../services/applicationLearningService.js", () => ({
  getApplicationLearningInsights: vi.fn().mockResolvedValue({})
}));

// ── helpers ─────────────────────────────────────────────────────────────────
const makeToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET);

const buildUser = (id, overrides = {}) => ({
  _id: id,
  name: "Test User",
  email: `${id}@example.com`,
  role: "user",
  isBanned: false,
  lastActiveAt: new Date(),
  subscriptionPlan: "pro",
  subscriptionStatus: "active",
  credits: 100,
  smartApplySettings: {
    requireReviewConfirmation: true,
    defaultMode: "manual",
    defaultDailyLimit: 10,
    responsibleAutomation: { enabled: false },
    safetyControls: { safetyMode: false, maxApplicationsPerDay: 20, delaySpeed: "normal" }
  },
  ...overrides
});

const basePayload = {
  jobId: "job-1",
  title: "Software Engineer",
  company: "Acme Corp",
  jobDescription: "Write great code",
  proposalText: "I am a perfect fit.",
  jobMatchScore: 80
};

let app;

// ── test setup ───────────────────────────────────────────────────────────────
beforeEach(async () => {
  vi.clearAllMocks();

  // no duplicate application
  applicationFindOneMock.mockResolvedValue(null);
  // daily count well below limit
  applicationCountDocumentsMock.mockResolvedValue(1);
  applicationUpdateManyMock.mockResolvedValue({});
  // throttle passes
  canApplyWithoutThrottleMock.mockResolvedValue({ canApply: true });
  // credit deduction succeeds
  deductCreditsMock.mockResolvedValue({ user: { credits: 98 } });
  // notifications / behavior tracking are fire-and-forget helpers
  notifyApplicationSubmittedMock.mockResolvedValue(null);
  trackUserJobBehaviorMock.mockResolvedValue(null);
  queueAuditLogCreateMock.mockResolvedValue({});
  activityLogCreateMock.mockResolvedValue({});
  recordApplicationMock.mockResolvedValue({});
  getApplicationSummaryMock.mockResolvedValue({ appliedToday: 2, remaining: 8 });

  const applicationRecord = {
    _id: "app-new",
    jobId: "job-1",
    title: "Software Engineer",
    company: "Acme Corp",
    applicationMode: "manual",
    submissionStatus: "submitted",
    reviewConfirmed: false,
    reviewedAt: null,
    scheduledFor: null
  };
  applicationCreateMock.mockResolvedValue(applicationRecord);
});

// ── lazy import after mocks ──────────────────────────────────────────────────
const { default: importedApp } = await import("../app.js");
app = importedApp;

// ── tests ────────────────────────────────────────────────────────────────────
describe("POST /api/applications/quick-apply — review enforcement", () => {
  it("blocks the request when review is required and reviewConfirmed is false", async () => {
    const user = buildUser("u-require-review", {
      smartApplySettings: {
        requireReviewConfirmation: true,
        defaultMode: "manual",
        defaultDailyLimit: 10,
        responsibleAutomation: { enabled: false },
        safetyControls: { safetyMode: false, maxApplicationsPerDay: 20, delaySpeed: "normal" }
      }
    });

    userFindByIdMock.mockImplementation(() => ({
      select: vi.fn().mockResolvedValue(user)
    }));

    const res = await request(app)
      .post("/api/applications/quick-apply")
      .set("Authorization", `Bearer ${makeToken("u-require-review")}`)
      .send({ ...basePayload, reviewConfirmed: false });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Review confirmation is required");
  });

  it("allows the request when review is required and reviewConfirmed is true", async () => {
    const user = buildUser("u-review-confirmed", {
      smartApplySettings: {
        requireReviewConfirmation: true,
        defaultMode: "manual",
        defaultDailyLimit: 10,
        responsibleAutomation: { enabled: false },
        safetyControls: { safetyMode: false, maxApplicationsPerDay: 20, delaySpeed: "normal" }
      }
    });

    userFindByIdMock.mockImplementation(() => ({
      select: vi.fn().mockResolvedValue(user)
    }));

    const res = await request(app)
      .post("/api/applications/quick-apply")
      .set("Authorization", `Bearer ${makeToken("u-review-confirmed")}`)
      .send({ ...basePayload, reviewConfirmed: true });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    // review checkpoint audit entry was created
    expect(queueAuditLogCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "review_checkpoint", reason: "human_review_confirmed" })
    );
  });

  it("allows the request when review is optional and reviewConfirmed is false", async () => {
    const user = buildUser("u-optional-review", {
      smartApplySettings: {
        requireReviewConfirmation: false,
        defaultMode: "manual",
        defaultDailyLimit: 10,
        responsibleAutomation: { enabled: false },
        safetyControls: { safetyMode: false, maxApplicationsPerDay: 20, delaySpeed: "normal" }
      }
    });

    userFindByIdMock.mockImplementation(() => ({
      select: vi.fn().mockResolvedValue(user)
    }));

    const res = await request(app)
      .post("/api/applications/quick-apply")
      .set("Authorization", `Bearer ${makeToken("u-optional-review")}`)
      .send({ ...basePayload, reviewConfirmed: false });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    // no review checkpoint audit entry when review was not confirmed
    const reviewCheckpointCalls = queueAuditLogCreateMock.mock.calls.filter(
      ([arg]) => arg?.action === "review_checkpoint"
    );
    expect(reviewCheckpointCalls).toHaveLength(0);
  });

  it("stores reviewConfirmed=false on the application record when review is optional and not confirmed", async () => {
    const user = buildUser("u-optional-not-confirmed", {
      smartApplySettings: {
        requireReviewConfirmation: false,
        defaultMode: "manual",
        defaultDailyLimit: 10,
        responsibleAutomation: { enabled: false },
        safetyControls: { safetyMode: false, maxApplicationsPerDay: 20, delaySpeed: "normal" }
      }
    });

    userFindByIdMock.mockImplementation(() => ({
      select: vi.fn().mockResolvedValue(user)
    }));

    await request(app)
      .post("/api/applications/quick-apply")
      .set("Authorization", `Bearer ${makeToken("u-optional-not-confirmed")}`)
      .send({ ...basePayload, reviewConfirmed: false });

    expect(applicationCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ reviewConfirmed: false, reviewedAt: null })
    );
  });

  it("stores reviewConfirmed=true and sets reviewedAt when confirmed", async () => {
    const user = buildUser("u-confirmed-stored", {
      smartApplySettings: {
        requireReviewConfirmation: false,
        defaultMode: "manual",
        defaultDailyLimit: 10,
        responsibleAutomation: { enabled: false },
        safetyControls: { safetyMode: false, maxApplicationsPerDay: 20, delaySpeed: "normal" }
      }
    });

    userFindByIdMock.mockImplementation(() => ({
      select: vi.fn().mockResolvedValue(user)
    }));

    await request(app)
      .post("/api/applications/quick-apply")
      .set("Authorization", `Bearer ${makeToken("u-confirmed-stored")}`)
      .send({ ...basePayload, reviewConfirmed: true });

    const createArgs = applicationCreateMock.mock.calls[0][0];
    expect(createArgs.reviewConfirmed).toBe(true);
    expect(createArgs.reviewedAt).toBeInstanceOf(Date);
  });
});
