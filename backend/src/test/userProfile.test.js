import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app.js";

describe("User API", () => {
  it("GET /api/user/me returns 401 without auth", async () => {
    const res = await request(app).get("/api/user/me");
    expect(res.status).toBe(401);
  });

  it("PUT /api/user/profile returns 401 without auth", async () => {
    const res = await request(app).put("/api/user/profile").send({ name: "Updated" });
    expect(res.status).toBe(401);
  });

  it("GET /api/user/stats returns 404 when route is unavailable", async () => {
    const res = await request(app).get("/api/user/stats");
    expect(res.status).toBe(404);
  });
});
