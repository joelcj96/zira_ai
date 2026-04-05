import { describe, expect, it, vi } from "vitest";

const appFindMock = vi.fn();
const behaviorFindMock = vi.fn();

vi.mock("../models/Application.js", () => ({
  default: {
    find: appFindMock
  }
}));

vi.mock("../models/UserJobBehavior.js", () => ({
  default: {
    find: behaviorFindMock,
    create: vi.fn()
  }
}));

const { rankJobsSmart } = await import("../services/smartJobRankingService.js");

const makeQuery = (payload) => ({
  select: vi.fn().mockReturnValue({
    sort: vi.fn().mockReturnValue({
      limit: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(payload)
      })
    })
  })
});

describe("smartJobRankingService", () => {
  it("returns top matches sorted by smart score", async () => {
    appFindMock.mockReturnValue(
      makeQuery([
        { title: "Senior React Engineer" },
        { title: "AI Product Developer" }
      ])
    );

    behaviorFindMock.mockReturnValue(
      makeQuery([
        {
          eventType: "applied",
          title: "Senior React Engineer",
          location: "Remote",
          salary: 130000,
          skillsRequired: ["React", "Node.js"]
        },
        {
          eventType: "ignored",
          title: "Junior Web Developer",
          location: "Chicago",
          salary: 60000,
          skillsRequired: ["HTML"]
        }
      ])
    );

    const jobs = [
      {
        id: "job-1",
        title: "Senior React Engineer",
        company: "A",
        location: "Remote",
        salary: 130000,
        description: "Responsibilities and requirements for React and APIs.",
        skillsRequired: ["React", "Node.js", "API"]
      },
      {
        id: "job-2",
        title: "Junior Web Developer",
        company: "B",
        location: "Chicago",
        salary: 65000,
        description: "Simple task and cheap implementation.",
        skillsRequired: ["HTML", "CSS"]
      }
    ];

    const user = {
      _id: "u1",
      preferences: {
        titles: ["react"],
        locations: ["remote"],
        remoteOnly: true,
        salaryMin: 80000
      },
      profileData: { skills: ["React", "Node.js"] }
    };

    const result = await rankJobsSmart(jobs, user);

    expect(result.jobsForFeed.length).toBeGreaterThan(0);
    expect(result.topMatches.length).toBeGreaterThan(0);
    expect(result.jobsForFeed[0].smartRanking.smartScore).toBeGreaterThanOrEqual(
      result.jobsForFeed[result.jobsForFeed.length - 1].smartRanking.smartScore
    );
    expect(result.topMatches[0].title).toContain("React");
    expect(result.topMatches[0].aiExplanation).toBeTruthy();
    expect(result.topMatches[0].aiExplanation.skillMatch.requiredCount).toBeGreaterThan(0);
  });
});
