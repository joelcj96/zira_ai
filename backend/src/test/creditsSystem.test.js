import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app.js";

describe("Credits API", () => {
  it("GET /api/credits/balance returns 401 without auth", async () => {
    const res = await request(app).get("/api/credits/balance");
    expect(res.status).toBe(401);
  });

  it("POST /api/credits/purchase returns 401 without auth", async () => {
    const res = await request(app).post("/api/credits/purchase").send({ package: "10" });
    expect(res.status).toBe(401);
  });

  it("GET /api/credits/history returns 401 without auth", async () => {
    const res = await request(app).get("/api/credits/history");
    expect(res.status).toBe(401);
  });

  it("GET /api/credits/packages returns available packages", async () => {
    const res = await request(app).get("/api/credits/packages");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.packages)).toBe(true);
    expect(res.body.packages.length).toBeGreaterThan(0);
    expect(res.body.packages[0]).toHaveProperty("id");
    expect(res.body.packages[0]).toHaveProperty("credits");
  });
});
