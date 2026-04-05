import { describe, expect, it, vi } from "vitest";

const findMock = vi.fn();

vi.mock("../models/Application.js", () => ({
  default: {
    find: findMock
  }
}));

const { buildApplicationLearningContext, getApplicationLearningInsights } = await import("../services/applicationLearningService.js");

describe("applicationLearningService", () => {
  it("builds context with both positive and negative examples", async () => {
    const sortMock = vi.fn().mockReturnThis();
    const limitMock = vi.fn().mockReturnThis();
    const leanMock = vi.fn().mockResolvedValue([
      {
        title: "Senior React Engineer",
        company: "Acme",
        jobDescription: "Need React, API integration, and performance optimization.",
        proposalText: "I built React interfaces and optimized API-heavy dashboards with measurable latency wins.",
        outcome: "job_won"
      },
      {
        title: "Frontend Developer",
        company: "Globex",
        jobDescription: "Build reusable UI components.",
        proposalText: "I am excited to apply. I am a great fit.",
        outcome: "no_response"
      }
    ]);

    findMock.mockReturnValue({
      select: vi.fn().mockReturnValue({
        sort: sortMock.mockReturnValue({
          limit: limitMock.mockReturnValue({
            lean: leanMock
          })
        })
      })
    });

    const result = await buildApplicationLearningContext("user-1");

    expect(result).not.toBeNull();
    expect(result.stats.totalExamples).toBe(2);
    expect(result.stats.positiveExamples).toBe(1);
    expect(result.stats.negativeExamples).toBe(1);
    expect(result.context).toContain("Positive patterns to emulate");
    expect(result.context).toContain("Unsuccessful patterns to avoid repeating");
  });

  it("returns sparkline trend points and trend direction", async () => {
    const buildQuery = (payload) => ({
      select: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            lean: vi.fn().mockResolvedValue(payload)
          })
        })
      })
    });

    // First call: getApplicationLearningInsights main query
    findMock.mockReturnValueOnce(
      buildQuery([
        { outcome: "job_won", outcomeUpdatedAt: new Date("2026-04-03T10:00:00.000Z") },
        { outcome: "response_received", outcomeUpdatedAt: new Date("2026-04-03T09:00:00.000Z") },
        { outcome: "no_response", outcomeUpdatedAt: new Date("2026-04-03T08:00:00.000Z") },
        { outcome: "response_received", outcomeUpdatedAt: new Date("2026-04-03T07:00:00.000Z") }
      ])
    );

    // Second call: buildApplicationLearningContext query inside insights helper
    findMock.mockReturnValueOnce(
      buildQuery([
        {
          title: "Senior React Engineer",
          company: "Acme",
          jobDescription: "React + performance",
          proposalText: "I delivered measurable React performance improvements.",
          outcome: "job_won"
        },
        {
          title: "Frontend Developer",
          company: "Globex",
          jobDescription: "Reusable UI",
          proposalText: "I am excited to apply.",
          outcome: "no_response"
        }
      ])
    );

    const result = await getApplicationLearningInsights("user-1");

    expect(result.totalExamples).toBe(4);
    expect(result.positiveExamples).toBe(3);
    expect(result.negativeExamples).toBe(1);
    expect(result.trendPoints.length).toBe(4);
    expect(["improving", "declining", "flat"]).toContain(result.trendDirection);
  });
});
