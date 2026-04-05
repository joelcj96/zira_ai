import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app.js";

describe("Jobs API", () => {
  it("GET /api/jobs returns 401 without auth", async () => {
    const res = await request(app).get("/api/jobs");
    expect(res.status).toBe(401);
  });

  it("GET /api/jobs/dashboard-feed returns 401 without auth", async () => {
    const res = await request(app).get("/api/jobs/dashboard-feed");
    expect(res.status).toBe(401);
  });

  it("POST /api/jobs/behavior returns 401 without auth", async () => {
    const res = await request(app)
      .post("/api/jobs/behavior")
      .send({ jobId: "job-1", eventType: "clicked" });

    expect(res.status).toBe(401);
  });
});
