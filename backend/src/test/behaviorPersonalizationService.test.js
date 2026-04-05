import { describe, expect, it, vi } from "vitest";

const findMock = vi.fn();
const createMock = vi.fn();

vi.mock("../models/UserJobBehavior.js", () => ({
  default: {
    find: findMock,
    create: createMock
  }
}));

const {
  getUserBehaviorProfile,
  buildBehaviorPromptContext,
  trackUserJobBehavior
} = await import("../services/behaviorPersonalizationService.js");

describe("behaviorPersonalizationService", () => {
  it("derives budget and ignored-title preferences from events", async () => {
    findMock.mockReturnValue({
      select: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            lean: vi.fn().mockResolvedValue([
              {
                eventType: "applied",
                title: "Senior React Engineer",
                location: "Remote",
                salary: 130000,
                skillsRequired: ["React", "Node.js"]
              },
              {
                eventType: "clicked",
                title: "AI Product Developer",
                location: "Remote",
                salary: 125000,
                skillsRequired: ["OpenAI", "Node.js"]
              },
              {
                eventType: "ignored",
                title: "Junior Web Developer",
                location: "Chicago",
                salary: 60000,
                skillsRequired: ["HTML"]
              }
            ])
          })
        })
      })
    });

    const profile = await getUserBehaviorProfile("user-1");

    expect(profile.totalEvents).toBe(3);
    expect(profile.preferredBudgetLevel).toBe("high");
    expect(profile.ignoredTitleKeywords.some((item) => item.value === "junior")).toBe(true);
    expect(profile.preferredLocations.some((item) => item.value === "remote")).toBe(true);

    const context = buildBehaviorPromptContext(profile);
    expect(context).toContain("USER BEHAVIOR PERSONALIZATION");
    expect(context).toContain("Preferred budget level: high");
  });

  it("stores job behavior events", async () => {
    createMock.mockResolvedValue({ _id: "evt_1" });

    await trackUserJobBehavior({
      userId: "u1",
      eventType: "clicked",
      job: {
        id: "job-101",
        title: "Frontend React Developer",
        location: "Remote",
        salary: 90000,
        skillsRequired: ["React"]
      },
      metadata: { source: "test" }
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user: "u1",
        jobId: "job-101",
        eventType: "clicked"
      })
    );
  });
});
