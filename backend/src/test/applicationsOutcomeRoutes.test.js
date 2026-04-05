import { beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import request from "supertest";

process.env.JWT_SECRET = "test-secret";

const userFindByIdMock = vi.fn();
const applicationFindOneMock = vi.fn();

vi.mock("../models/User.js", () => ({
  default: {
    findById: userFindByIdMock,
    updateOne: vi.fn().mockResolvedValue({ acknowledged: true })
  }
}));

vi.mock("../models/Application.js", () => ({
  default: {
    findOne: applicationFindOneMock,
    updateMany: vi.fn(),
    countDocuments: vi.fn().mockResolvedValue(0),
    create: vi.fn()
  }
}));

const buildUser = (id) => ({
  _id: id,
  name: "Test User",
  email: `${id}@example.com`,
  role: "user",
  isBanned: false,
  subscriptionPlan: "pro",
  subscriptionStatus: "active"
});

userFindByIdMock.mockImplementation((id) => ({
  select: vi.fn().mockResolvedValue(buildUser(id))
}));

const { default: app } = await import("../app.js");

const makeToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET);

describe("Application outcome routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    userFindByIdMock.mockImplementation((id) => ({
      select: vi.fn().mockResolvedValue(buildUser(id))
    }));
  });

  it("rejects invalid outcome values", async () => {
    const application = {
      _id: "app-1",
      user: "user-1",
      save: vi.fn()
    };

    applicationFindOneMock.mockResolvedValue(application);

    const res = await request(app)
      .put("/api/applications/app-1/outcome")
      .set("Authorization", `Bearer ${makeToken("user-1")}`)
      .send({ outcome: "invalid_value" });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Invalid outcome");
  });

  it("updates outcome and marks status accepted when job is won", async () => {
    const saveMock = vi.fn().mockResolvedValue(true);
    const application = {
      _id: "app-1",
      user: "user-1",
      outcome: "unknown",
      status: "pending",
      save: saveMock,
      toObject: () => ({
        _id: "app-1",
        outcome: "job_won",
        status: "accepted"
      })
    };

    applicationFindOneMock.mockResolvedValue(application);

    const res = await request(app)
      .put("/api/applications/app-1/outcome")
      .set("Authorization", `Bearer ${makeToken("user-1")}`)
      .send({
        outcome: "job_won",
        outcomeNotes: "Client accepted and sent contract"
      });

    expect(res.status).toBe(200);
    expect(application.outcome).toBe("job_won");
    expect(application.status).toBe("accepted");
    expect(application.outcomeUpdatedAt).toBeInstanceOf(Date);
    expect(application.outcomeNotes).toContain("Client accepted");
    expect(saveMock).toHaveBeenCalled();
  });
});
