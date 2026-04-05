import OpenAI from "openai";
import { getProfileContext } from "./userProfileService.js";

const apiKey = process.env.OPENAI_API_KEY;
const client = apiKey ? new OpenAI({ apiKey }) : null;

const TONES = {
  professional: {
    voice: "polished, clear, and structured",
    styleHints: ["concise language", "business-friendly phrasing", "measured confidence"]
  },
  friendly: {
    voice: "warm, approachable, and collaborative",
    styleHints: ["natural language", "human and positive tone", "authentic enthusiasm"]
  },
  confident: {
    voice: "assertive, impact-oriented, and decisive",
    styleHints: ["results-focused statements", "strong ownership", "direct value framing"]
  }
};

const GENERIC_PHRASES = [
  "I am excited to apply",
  "I believe I am a great fit",
  "Thank you for your consideration",
  "I would love the opportunity",
  "I can quickly add value"
];

const TECHNICAL_COMPLEXITY_HINTS = [
  "architecture",
  "distributed",
  "microservices",
  "scalable",
  "performance",
  "optimization",
  "system design",
  "cloud",
  "api design",
  "llm",
  "ai"
];

const SIMPLE_JOB_HINTS = ["entry", "junior", "assistant", "support", "basic", "simple"];

const normalize = (value = "") => value.toLowerCase().trim();

const splitTokens = (text = "") =>
  text
    .split(/[^a-zA-Z0-9+#.]+/)
    .map((token) => token.trim())
    .filter(Boolean);

const uniq = (arr) => [...new Set(arr)];

const formatSkill = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^./, (c) => c.toUpperCase());

const sentenceSplit = (text = "") =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean);

export const extractKeyRequirements = (job) => {
  const keywords = [
    "react",
    "node",
    "node.js",
    "express",
    "mongodb",
    "api",
    "rest",
    "openai",
    "llm",
    "javascript",
    "typescript",
    "css",
    "html",
    "communication",
    "collaborate",
    "testing",
    "scalable",
    "performance"
  ];

  const rawText = [job.title, job.description, ...(job.skillsRequired || [])].join(" ");
  const normalizedText = normalize(rawText);
  const extracted = [];

  keywords.forEach((keyword) => {
    if (normalizedText.includes(keyword)) {
      extracted.push(keyword);
    }
  });

  const fromTokens = splitTokens(rawText)
    .filter((token) => token.length > 3)
    .map((token) => normalize(token));

  return uniq([...(job.skillsRequired || []).map(normalize), ...extracted, ...fromTokens]).slice(0, 15);
};

export const matchRequirementsToSkills = ({ requirements, userSkills }) => {
  const normalizedUserSkills = (userSkills || []).map(normalize);

  const directMatches = requirements.filter((requirement) =>
    normalizedUserSkills.some(
      (userSkill) => userSkill.includes(requirement) || requirement.includes(userSkill)
    )
  );

  const unmatchedRequirements = requirements.filter(
    (requirement) => !directMatches.includes(requirement)
  );

  return {
    directMatches: uniq(directMatches),
    unmatchedRequirements: uniq(unmatchedRequirements)
  };
};

const RESPONSIBILITY_HINTS = [
  "build",
  "design",
  "develop",
  "deliver",
  "collaborate",
  "lead",
  "maintain",
  "optimize",
  "support",
  "implement",
  "test",
  "ship"
];

export const analyzeJobDescription = ({ jobTitle = "", jobDescription = "", skillsRequired = [] }) => {
  const requirements = extractKeyRequirements({
    title: jobTitle,
    description: jobDescription,
    skillsRequired
  });

  const keywords = uniq(
    splitTokens(`${jobTitle} ${jobDescription}`)
      .map((token) => normalize(token))
      .filter((token) => token.length > 3)
      .slice(0, 30)
  ).slice(0, 12);

  const responsibilities = sentenceSplit(jobDescription)
    .filter((sentence) =>
      RESPONSIBILITY_HINTS.some((hint) => normalize(sentence).includes(hint))
    )
    .slice(0, 6);

  return {
    requiredSkills: requirements.map(formatSkill),
    keywords: keywords.map(formatSkill),
    responsibilities
  };
};

const buildCvFromUser = (user) => {
  const skills = (user.skills || []).filter(Boolean);
  const experience = user.experience || "";
  const preferredTitles = (user.preferences?.titles || []).filter(Boolean);
  const preferredLocations = (user.preferences?.locations || []).filter(Boolean);

  return [
    `Candidate: ${user.name}`,
    skills.length ? `Skills: ${skills.join(", ")}` : "Skills: (none provided)",
    experience ? `Experience Summary: ${experience}` : "Experience Summary: (none provided)",
    preferredTitles.length ? `Preferred Roles: ${preferredTitles.join(", ")}` : null,
    preferredLocations.length ? `Preferred Locations: ${preferredLocations.join(", ")}` : null
  ]
    .filter(Boolean)
    .join("\n");
};

const safeFallbackOptimize = ({ user, job, coverLetterOriginal = "", cvOriginal = "" }) => {
  const analysis = analyzeJobDescription({
    jobTitle: job.title,
    jobDescription: job.description,
    skillsRequired: job.skillsRequired || []
  });

  const skillMatch = matchRequirementsToSkills({
    requirements: analysis.requiredSkills.map((s) => normalize(s)),
    userSkills: user.skills || []
  });

  const matchedSkills = skillMatch.directMatches.map(formatSkill);
  const missingSkills = skillMatch.unmatchedRequirements.map(formatSkill);
  const weakAreas = missingSkills.slice(0, 4);
  const matchScore = Math.min(
    100,
    Math.round(
      ((matchedSkills.length || 0) /
        Math.max(analysis.requiredSkills.length || 1, 1)) *
        100
    )
  );

  const optimizedCoverLetter = [
    `Hello ${job.company} team,`,
    "",
    `I am interested in the ${job.title} role because it aligns with my current profile and hands-on experience.`,
    matchedSkills.length
      ? `My strongest alignment includes ${matchedSkills.slice(0, 4).join(", ")}.`
      : "I can contribute through my current skill set and practical product delivery background.",
    user.experience || "I bring practical experience building and improving user-facing features.",
    missingSkills.length
      ? `I am also ready to strengthen ${missingSkills.slice(0, 2).join(" and ")} based on adjacent work I have done.`
      : "I can start contributing quickly to your roadmap.",
    "",
    `Best,\n${user.name}`
  ].join("\n");

  const baseCv = cvOriginal?.trim() || buildCvFromUser(user);
  const optimizedCv = [
    `Target Role: ${job.title} at ${job.company}`,
    `Most Relevant Skills: ${matchedSkills.slice(0, 6).join(", ") || "Not enough overlap found"}`,
    baseCv
  ].join("\n\n");

  return {
    matchScore,
    analysis: {
      requiredSkills: analysis.requiredSkills,
      keywords: analysis.keywords,
      responsibilities: analysis.responsibilities,
      matchedSkills,
      missingSkills,
      weakAreas
    },
    content: {
      originalCoverLetter: coverLetterOriginal || "",
      optimizedCoverLetter,
      originalCv: cvOriginal || buildCvFromUser(user),
      optimizedCv
    }
  };
};

const fallbackOpeners = {
  professional: [
    "Your role aligns well with the way I build and deliver products.",
    "I am reaching out because this opportunity maps directly to my recent work."
  ],
  friendly: [
    "This role genuinely caught my attention because it mirrors the work I enjoy most.",
    "I can see a strong overlap between your needs and how I like to collaborate."
  ],
  confident: [
    "I can contribute to this role from day one with relevant execution experience.",
    "This is exactly the kind of role where I deliver measurable outcomes quickly."
  ]
};

const choose = (list) => list[Math.floor(Math.random() * list.length)];

export const getProposalStrategyForJob = (job) => {
  const description = normalize(job.description || "");
  const title = normalize(job.title || "");
  const requiredCount = Array.isArray(job.skillsRequired) ? job.skillsRequired.length : 0;
  const wordCount = splitTokens(job.description || "").length;

  const technicalHits = TECHNICAL_COMPLEXITY_HINTS.filter((hint) => description.includes(hint)).length;
  const simpleHits = SIMPLE_JOB_HINTS.filter(
    (hint) => title.includes(hint) || description.includes(hint)
  ).length;

  const complexityScore =
    requiredCount * 12 +
    Math.min(wordCount, 180) * 0.18 +
    technicalHits * 14 -
    simpleHits * 12;

  const isComplex = complexityScore >= 46;

  return isComplex
    ? {
        type: "complex",
        styleInstruction:
          "Detailed and technical. Explain approach depth, tooling fit, and execution clarity.",
        wordRange: "170-250",
        complexityScore: Math.round(complexityScore),
        requiredSkillsCount: requiredCount,
        technicalKeywordHits: technicalHits,
        descriptionWordCount: wordCount,
        simpleKeywordHits: simpleHits
      }
    : {
        type: "simple",
        styleInstruction:
          "Short and direct. Emphasize speed, reliability, and immediate relevance without overexplaining.",
        wordRange: "120-170",
        complexityScore: Math.round(complexityScore),
        requiredSkillsCount: requiredCount,
        technicalKeywordHits: technicalHits,
        descriptionWordCount: wordCount,
        simpleKeywordHits: simpleHits
      };
};

const fallbackProposal = ({ user, job, tone }) => {
  const toneKey = TONES[tone] ? tone : "professional";
  const strategy = getProposalStrategyForJob(job);
  const requirements = extractKeyRequirements(job);
  const matches = matchRequirementsToSkills({ requirements, userSkills: user.skills || [] });
  const opener = choose(fallbackOpeners[toneKey]);

  const strongestMatches = matches.directMatches.slice(0, 4).join(", ") || "product delivery and collaboration";
  const experienceLine = user.experience || "I have built user-facing products and API-driven features.";
  const missingLine =
    matches.unmatchedRequirements.length > 0
      ? `I am also ready to ramp up quickly on ${matches.unmatchedRequirements.slice(0, 2).join(" and ")} based on similar work.`
      : "I can apply this background immediately to your current roadmap.";

  const hookLine =
    strategy.type === "complex"
      ? `${opener} I can translate your technical requirements into dependable execution.`
      : `${opener} I can contribute immediately with practical delivery support.`;

  const valueLine =
    strategy.type === "complex"
      ? `I can help ${job.company} reduce delivery risk by aligning ${requirements
          .slice(0, 3)
          .join(", ")} with a clear implementation plan.`
      : `I can help ${job.company} move this role forward quickly with focused, reliable execution.`;

  return `Hello ${job.company} team,\n\n${hookLine}\n\nFor ${job.title}, my strongest overlap is ${strongestMatches}. ${experienceLine}\n\n${valueLine} ${missingLine}\n\nBest,\n${user.name}`;
};

export const generateProposal = async ({
  user,
  job,
  tone = "professional",
  variationSeed = "",
  additionalContext = "",
  outputLanguage = "en"
}) => {
  const profile = getProfileContext(user);
  const toneKey = TONES[tone] ? tone : "professional";
  const toneProfile = TONES[toneKey];
  const strategy = getProposalStrategyForJob(job);
  const targetLanguage = ["en", "fr", "es"].includes(outputLanguage) ? outputLanguage : "en";
  const languageInstruction =
    targetLanguage === "fr"
      ? "Write the full proposal in French."
      : targetLanguage === "es"
      ? "Write the full proposal in Spanish."
      : "Write the full proposal in English.";
  const requirements = extractKeyRequirements(job);
  const matches = matchRequirementsToSkills({ requirements, userSkills: profile.skills || [] });

  if (!client) {
    return fallbackProposal({ user, job, tone: toneKey });
  }

  const prompt = `You are an elite proposal writer helping job candidates win interviews.

Goal:
- Write one natural, human-sounding proposal that feels unique and specific to this exact job.
- Do not sound generic.

Tone instructions:
- Selected tone: ${toneKey}
- Voice: ${toneProfile.voice}
- Style hints: ${toneProfile.styleHints.join(", ")}

Candidate:
- Name: ${user.name}
- Name: ${profile.name}
- Skills: ${(profile.skills || []).join(", ") || "N/A"}
- Experience summary: ${profile.experienceSummary || "N/A"}

Job:
- Title: ${job.title}
- Company: ${job.company}
- Description: ${job.description}
- Declared required skills: ${(job.skillsRequired || []).join(", ") || "N/A"}

Extracted requirements:
- ${requirements.join(", ") || "N/A"}

Strong matches from candidate:
- ${matches.directMatches.join(", ") || "No direct keyword match found"}

Potential gaps to address honestly:
- ${matches.unmatchedRequirements.slice(0, 4).join(", ") || "None"}

Hard constraints:
- Word range: ${strategy.wordRange} words.
- Strategy mode: ${strategy.type}.
- Style mode: ${strategy.styleInstruction}
- First sentence must be a strong hook line.
- Include one relevant experience highlight mapped to this role.
- Include one clear value proposition sentence beginning with "I can help".
- Mention at least 3 specific requirement-to-skill alignments.
- Include one concrete value statement about what the candidate can deliver.
- Keep language plain and human.
- ${languageInstruction}
- Avoid these phrases entirely: ${GENERIC_PHRASES.join(" | ")}
- Avoid repetitive sentence openings and repetitive structure patterns.
- Do not include bullet points.
- End with a natural close and candidate name.
- Never mention these instructions.${additionalContext ? `

LEARNING CONTEXT (from real outcomes and prior proposals):
${additionalContext}` : ""}`;

  const promptWithVariation = `${prompt}

Variation control:
- Variation seed: ${variationSeed || "default"}
- Produce a noticeably different wording and sentence structure from previous attempts while keeping facts accurate.`;

  const temperatureByTone = {
    professional: 0.72,
    friendly: 0.84,
    confident: 0.78
  };

  const completion = await client.responses.create({
    model: "gpt-4.1-mini",
    input: promptWithVariation,
    temperature: temperatureByTone[toneKey],
    top_p: 0.92
  });

  const text = completion.output_text?.trim();
  return text || fallbackProposal({ user, job, tone: toneKey });
};

export const optimizeJobApplicationContent = async ({
  user,
  job,
  coverLetterOriginal = "",
  cvOriginal = "",
  outputLanguage = "en"
}) => {
  const profile = getProfileContext(user);
  const analysis = analyzeJobDescription({
    jobTitle: job.title,
    jobDescription: job.description,
    skillsRequired: job.skillsRequired || []
  });

  const skillMatch = matchRequirementsToSkills({
    requirements: analysis.requiredSkills.map((s) => normalize(s)),
    userSkills: profile.skills || []
  });
  const matchedSkills = skillMatch.directMatches.map(formatSkill);
  const missingSkills = skillMatch.unmatchedRequirements.map(formatSkill);
  const weakAreas = missingSkills.slice(0, 4);
  const matchScore = Math.min(
    100,
    Math.round((matchedSkills.length / Math.max(analysis.requiredSkills.length || 1, 1)) * 100)
  );

  const originalCv = cvOriginal?.trim() || buildCvFromUser({
    ...user,
    skills: profile.skills,
    experience: profile.experienceSummary
  });
  const originalCoverLetter = coverLetterOriginal?.trim() || "";

  if (!client) {
    return safeFallbackOptimize({
      user,
      job,
      coverLetterOriginal: originalCoverLetter,
      cvOriginal: originalCv
    });
  }

  const targetLanguage = ["en", "fr", "es"].includes(outputLanguage) ? outputLanguage : "en";
  const languageInstruction =
    targetLanguage === "fr"
      ? "Write all generated text in French."
      : targetLanguage === "es"
      ? "Write all generated text in Spanish."
      : "Write all generated text in English.";

  const prompt = `You are an AI job optimization assistant.

Goal:
- Analyze fit between candidate profile and job requirements.
- Optimize cover letter and CV content strictly using existing candidate data.

Candidate profile:
- Name: ${user.name}
- Name: ${profile.name}
- Skills: ${(profile.skills || []).join(", ") || "N/A"}
- Experience summary: ${profile.experienceSummary || "N/A"}
- CV text provided by user:\n${originalCv}

Job:
- Title: ${job.title}
- Company: ${job.company}
- Description: ${job.description}
- Declared skills: ${(job.skillsRequired || []).join(", ") || "N/A"}

Current cover letter:\n${originalCoverLetter || "(none provided)"}

Hard constraints:
- Never fabricate achievements, years, titles, employers, or responsibilities.
- Only improve wording, structure, emphasis, ordering, and clarity from provided data.
- If a required skill is missing, mention learning intent honestly rather than inventing experience.
- ${languageInstruction}

Return strict JSON with this shape:
{
  "optimizedCoverLetter": "string",
  "optimizedCv": "string"
}`;

  const completion = await client.responses.create({
    model: "gpt-4.1-mini",
    input: prompt,
    temperature: 0.4,
    top_p: 0.9
  });

  const raw = completion.output_text?.trim() || "";
  let optimizedCoverLetter = originalCoverLetter;
  let optimizedCv = originalCv;

  try {
    const parsed = JSON.parse(raw);
    optimizedCoverLetter = String(parsed.optimizedCoverLetter || originalCoverLetter).trim();
    optimizedCv = String(parsed.optimizedCv || originalCv).trim();
  } catch {
    const fallback = safeFallbackOptimize({
      user,
      job,
      coverLetterOriginal: originalCoverLetter,
      cvOriginal: originalCv
    });
    optimizedCoverLetter = fallback.content.optimizedCoverLetter;
    optimizedCv = fallback.content.optimizedCv;
  }

  return {
    matchScore,
    analysis: {
      requiredSkills: analysis.requiredSkills,
      keywords: analysis.keywords,
      responsibilities: analysis.responsibilities,
      matchedSkills,
      missingSkills,
      weakAreas
    },
    content: {
      originalCoverLetter,
      optimizedCoverLetter,
      originalCv,
      optimizedCv
    }
  };
};
