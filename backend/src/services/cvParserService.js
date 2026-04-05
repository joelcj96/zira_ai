import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

const SKILL_KEYWORDS = [
  "react",
  "node",
  "node.js",
  "express",
  "mongodb",
  "javascript",
  "typescript",
  "html",
  "css",
  "python",
  "java",
  "c#",
  "openai",
  "llm",
  "rest",
  "api",
  "git",
  "docker",
  "aws",
  "azure",
  "testing"
];

const splitLines = (text = "") =>
  text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const normalize = (value = "") => value.toLowerCase().trim();

const inferSkills = (text = "") => {
  const lowered = normalize(text);
  const tokenSkills = SKILL_KEYWORDS.filter((skill) => lowered.includes(skill));
  const sectionSkills = [];

  splitLines(text).forEach((line) => {
    if (!/skills?/i.test(line)) return;
    line
      .replace(/skills?[:\-]?/i, "")
      .split(/[,|]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => sectionSkills.push(item));
  });

  return [...new Set([...tokenSkills, ...sectionSkills].map((item) => item.replace(/\s+/g, " ")))].slice(0, 30);
};

const inferWorkExperiences = (text = "") => {
  const lines = splitLines(text);
  const rows = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!/(engineer|developer|manager|lead|analyst|designer|consultant)/i.test(line)) continue;
    const next = lines[i + 1] || "";

    rows.push({
      role: line,
      company: / at /i.test(line) ? line.split(/ at /i)[1] : next,
      description: lines[i + 2] || ""
    });
  }

  return rows.slice(0, 10);
};

const inferEducation = (text = "") => {
  const lines = splitLines(text);
  const rows = [];

  lines.forEach((line, idx) => {
    if (!/(bachelor|master|phd|university|college|school)/i.test(line)) return;
    rows.push({
      institution: line,
      degree: lines[idx - 1] || "",
      description: lines[idx + 1] || ""
    });
  });

  return rows.slice(0, 8);
};

export const extractCvText = async ({ buffer, mimetype, originalname = "" }) => {
  const lowerName = originalname.toLowerCase();

  if (mimetype === "application/pdf" || lowerName.endsWith(".pdf")) {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    return (result?.text || "").trim();
  }

  if (
    mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return (result.value || "").trim();
  }

  throw new Error("Unsupported file type. Upload PDF or DOCX.");
};

export const parseStructuredCvData = (cvText = "") => ({
  skills: inferSkills(cvText),
  workExperiences: inferWorkExperiences(cvText),
  education: inferEducation(cvText)
});
