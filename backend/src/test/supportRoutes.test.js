import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const createSupportRequestMock = vi.fn();
const findOneAndDeleteSupportRequestMock = vi.fn();

vi.mock("../middleware/auth.js", () => ({
  protect: (req, res, next) => {
    req.user = {
      _id: "user-123",
      name: "Test User",
      email: "test@example.com",
      role: "user"
    };
    next();
  },
  adminOnly: (req, res, next) => next()
}));

vi.mock("../models/SupportRequest.js", () => ({
  default: {
    create: createSupportRequestMock,
    findOneAndDelete: findOneAndDeleteSupportRequestMock
  }
}));

const { default: app } = await import("../app.js");

describe("supportRoutes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPPORT_EMAIL = "nkashamailunga96@gmail.com";
  });

  it("GET /api/support/meta returns the support email", async () => {
    const res = await request(app).get("/api/support/meta");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      supportEmail: "nkashamailunga96@gmail.com"
    });
  });

  it("POST /api/support/requests stores the submitted issue", async () => {
    createSupportRequestMock.mockResolvedValue({
      _id: "support-1",
      subject: "Payment problem",
      message: "My upgrade page is stuck.",
      status: "open",
      createdAt: new Date("2026-04-03T12:00:00.000Z")
    });

    const res = await request(app).post("/api/support/requests").send({
      subject: "Payment problem",
      message: "My upgrade page is stuck."
    });

    expect(res.status).toBe(201);
    expect(createSupportRequestMock).toHaveBeenCalledWith({
      user: "user-123",
      requesterName: "Test User",
      requesterEmail: "test@example.com",
      subject: "Payment problem",
      message: "My upgrade page is stuck."
    });
    expect(res.body).toMatchObject({
      message: "Support request submitted successfully",
      supportEmail: "nkashamailunga96@gmail.com",
      request: {
        id: "support-1",
        subject: "Payment problem",
        message: "My upgrade page is stuck.",
        status: "open"
      }
    });
  });

  it("POST /api/support/requests rejects empty submissions", async () => {
    const res = await request(app).post("/api/support/requests").send({
      subject: "",
      message: ""
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Support request subject is required");
    expect(createSupportRequestMock).not.toHaveBeenCalled();
  });

  it("DELETE /api/support/requests/:requestId removes an existing request", async () => {
    findOneAndDeleteSupportRequestMock.mockResolvedValue({
      _id: "support-1",
      subject: "Payment problem"
    });

    const res = await request(app).delete("/api/support/requests/support-1");

    expect(res.status).toBe(200);
    expect(findOneAndDeleteSupportRequestMock).toHaveBeenCalledWith({
      _id: "support-1",
      user: "user-123"
    });
    expect(res.body).toEqual({
      message: "Support request deleted successfully",
      request: {
        id: "support-1",
        subject: "Payment problem"
      }
    });
  });

  it("DELETE /api/support/requests/:requestId returns 404 when the request does not exist", async () => {
    findOneAndDeleteSupportRequestMock.mockResolvedValue(null);

    const res = await request(app).delete("/api/support/requests/support-missing");

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Support request not found");
  });
});