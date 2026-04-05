import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app.js";

describe("POST /api/auth/register – input validation", () => {
  it("returns 400 when body is empty", async () => {
    const res = await request(app).post("/api/auth/register").send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Name, email, and password are required");
  });

  it("returns 400 when only name is supplied", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Alice" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Name, email, and password are required");
  });

  it("returns 400 when name and email are supplied but not password", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Alice", email: "alice@example.com" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Name, email, and password are required");
  });
});

describe("Protected routes – missing auth token", () => {
  it("GET /api/user/me returns 401", async () => {
    const res = await request(app).get("/api/user/me");
    expect(res.status).toBe(401);
  });

  it("GET /api/jobs returns 401", async () => {
    const res = await request(app).get("/api/jobs");
    expect(res.status).toBe(401);
  });

  it("GET /api/admin/users returns 401", async () => {
    const res = await request(app).get("/api/admin/users");
    expect(res.status).toBe(401);
  });

  it("GET /api/credits/balance returns 401", async () => {
    const res = await request(app).get("/api/credits/balance");
    expect(res.status).toBe(401);
  });
});
