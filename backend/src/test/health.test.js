import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app.js";

describe("Public endpoints", () => {
  it("GET /api/health returns 200 with healthy message", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Zira AI API is healthy");
  });

  it("GET /api/system/index-status returns 200 with a warning field", async () => {
    const res = await request(app).get("/api/system/index-status");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("warning");
  });

  it("Unknown route returns 404", async () => {
    const res = await request(app).get("/api/does-not-exist");
    expect(res.status).toBe(404);
  });
});

