import { beforeEach, describe, expect, it, vi } from "vitest";

describe("optimizeJobApplicationContent fallback safety", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.OPENAI_API_KEY;
  });

  it("optimizes using only provided user data when OpenAI key is absent", async () => {
    const { optimizeJobApplicationContent } = await import("../services/openaiService.js");

    const user = {
      name: "Alex Candidate",
      skills: ["React", "Node.js"],
      experience: "Built API-integrated web applications and improved performance for user-facing screens.",
      preferences: { language: "en" }
    };

    const job = {
      id: "job-test",
      title: "Frontend Engineer",
      company: "Acme",
      description: "Build scalable React features, collaborate with product teams, and optimize UI performance. TypeScript experience preferred.",
      skillsRequired: ["React", "TypeScript", "Performance"]
    };

    const coverLetterOriginal = "I have worked on frontend products and enjoy collaboration.";
    const cvOriginal = "Experience: Built frontend features with React and Node.js.";

    const result = await optimizeJobApplicationContent({
      user,
      job,
      coverLetterOriginal,
      cvOriginal,
      outputLanguage: "en"
    });

    expect(result.matchScore).toBeGreaterThanOrEqual(0);
    expect(result.matchScore).toBeLessThanOrEqual(100);

    expect(result.content.originalCoverLetter).toBe(coverLetterOriginal);
    expect(result.content.originalCv).toBe(cvOriginal);

    // Fallback output should preserve and rephrase existing profile facts, not invent new history.
    expect(result.content.optimizedCoverLetter).toContain(user.experience);
    expect(result.content.optimizedCoverLetter).toContain(`Best,\n${user.name}`);
    expect(result.content.optimizedCoverLetter).toContain("ready to strengthen");

    // Guard against fabricated seniority claims in fallback copy.
    expect(result.content.optimizedCoverLetter).not.toMatch(/\b(5\+?\s*years?|10\s*years?|15\s*years?)\b/i);

    expect(Array.isArray(result.analysis.missingSkills)).toBe(true);
    expect(result.analysis.missingSkills.length).toBeGreaterThan(0);
    expect(result.content.optimizedCv).toContain(cvOriginal);
  });
});
