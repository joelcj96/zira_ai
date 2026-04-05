import express from "express";
import multer from "multer";
import { protect } from "../middleware/auth.js";
import User from "../models/User.js";
import { getEntitlements } from "../services/subscriptionService.js";
import { extractCvText, parseStructuredCvData } from "../services/cvParserService.js";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }
});

const cleanString = (value) => String(value || "").trim();

const sanitizeProfileData = (value = {}) => ({
  skills: Array.isArray(value.skills)
    ? value.skills.map(cleanString).filter(Boolean)
    : [],
  workExperiences: Array.isArray(value.workExperiences)
    ? value.workExperiences
        .map((item) => ({
          role: cleanString(item?.role),
          company: cleanString(item?.company),
          description: cleanString(item?.description)
        }))
        .filter((item) => item.role || item.company || item.description)
    : [],
  education: Array.isArray(value.education)
    ? value.education
        .map((item) => ({
          institution: cleanString(item?.institution),
          degree: cleanString(item?.degree),
          description: cleanString(item?.description)
        }))
        .filter((item) => item.institution || item.degree || item.description)
    : [],
  projects: Array.isArray(value.projects)
    ? value.projects
        .map((item) => ({
          name: cleanString(item?.name),
          description: cleanString(item?.description),
          techStack: Array.isArray(item?.techStack)
            ? item.techStack.map(cleanString).filter(Boolean)
            : []
        }))
        .filter((item) => item.name || item.description || item.techStack.length > 0)
    : [],
  coverLetterText: cleanString(value.coverLetterText)
});

const sanitizeResponsibleAutomation = (value = {}) => ({
  enabled: value.enabled !== false,
  minDelaySeconds: Math.max(5, Math.min(Number(value.minDelaySeconds) || 20, 180)),
  maxDelaySeconds: Math.max(8, Math.min(Number(value.maxDelaySeconds) || 90, 300)),
  maxApplicationsPerHour: Math.max(1, Math.min(Number(value.maxApplicationsPerHour) || 4, 20)),
  maxApplicationsPerDay: Math.max(1, Math.min(Number(value.maxApplicationsPerDay) || 12, 80)),
  activeHoursStart: Math.max(0, Math.min(Number(value.activeHoursStart) || 8, 23)),
  activeHoursEnd: Math.max(0, Math.min(Number(value.activeHoursEnd) || 20, 23)),
  minJobMatchScore: Math.max(0, Math.min(Number(value.minJobMatchScore) || 55, 100)),
  enforceProposalDiversity: value.enforceProposalDiversity !== false,
  diversitySimilarityThreshold: Math.max(
    0.5,
    Math.min(Number(value.diversitySimilarityThreshold) || 0.9, 0.99)
  )
});

const sanitizeSafetyControls = (value = {}) => ({
  safetyMode: value.safetyMode !== false,
  maxApplicationsPerDay: Math.max(1, Math.min(Number(value.maxApplicationsPerDay) || 8, 80)),
  delaySpeed: ["slow", "normal", "fast"].includes(value.delaySpeed) ? value.delaySpeed : "slow"
});

const cleanUrl = (value) => {
  const s = String(value || "").trim();
  if (!s) return "";
  try { new URL(s); return s; } catch { return ""; }
};

const serializeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role || "user",
  profileImage: user.profileImage || "",
  phone: user.phone || "",
  linkedinUrl: user.linkedinUrl || "",
  website: user.website || "",
  isBanned: Boolean(user.isBanned),
  skills: user.skills,
  experience: user.experience,
  preferences: user.preferences,
  smartApplySettings: user.smartApplySettings,
  profileData: user.profileData || {
    skills: [],
    workExperiences: [],
    education: [],
    projects: [],
    cvRawText: "",
    coverLetterText: "",
    cvFileName: "",
    cvMimeType: "",
    cvLastUploadedAt: null
  },
  subscriptionPlan: user.subscriptionPlan || "free",
  subscriptionStatus: user.subscriptionStatus || "inactive",
  entitlements: getEntitlements(user)
});

router.get("/me", protect, async (req, res, next) => {
  try {
    res.json(serializeUser(req.user));
  } catch (error) {
    next(error);
  }
});

router.put("/profile", protect, async (req, res, next) => {
  try {
    const { name, skills, experience, preferences, phone, linkedinUrl, website } = req.body;
    const allowedLanguages = ["en", "fr", "es"];

    const user = await User.findById(req.user._id);
    if (!user) {
      res.status(404);
      throw new Error("User not found");
    }

    if (preferences?.language && !allowedLanguages.includes(preferences.language)) {
      res.status(400);
      throw new Error("Unsupported language. Use en, fr, or es.");
    }

    user.name = name ?? user.name;
    user.skills = Array.isArray(skills) ? skills : user.skills;
    user.experience = experience ?? user.experience;
    user.preferences = {
      ...user.preferences,
      ...(preferences || {})
    };
    if (phone !== undefined) user.phone = String(phone || "").trim().slice(0, 30);
    if (linkedinUrl !== undefined) user.linkedinUrl = cleanUrl(linkedinUrl);
    if (website !== undefined) user.website = cleanUrl(website);

    user.profileData = {
      ...(user.profileData || {}),
      ...(user.profileData?.skills?.length ? {} : { skills: user.skills || [] })
    };

    const updated = await user.save();
    res.json(serializeUser(updated));
  } catch (error) {
    next(error);
  }
});

router.post("/profile/avatar", protect, upload.single("avatar"), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400);
      throw new Error("Avatar file is required");
    }

    const allowedTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"];
    if (!allowedTypes.includes(req.file.mimetype)) {
      res.status(400);
      throw new Error("Only PNG, JPG, WEBP, or GIF images are allowed");
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      res.status(404);
      throw new Error("User not found");
    }

    const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
    user.profileImage = base64Image;
    const updated = await user.save();

    res.status(201).json({
      success: true,
      user: serializeUser(updated)
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/profile/avatar", protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      res.status(404);
      throw new Error("User not found");
    }

    user.profileImage = "";
    const updated = await user.save();

    res.json({
      success: true,
      user: serializeUser(updated)
    });
  } catch (error) {
    next(error);
  }
});

router.put("/profile/structured-data", protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      res.status(404);
      throw new Error("User not found");
    }

    const incoming = sanitizeProfileData(req.body || {});

    user.profileData = {
      ...(user.profileData || {}),
      ...incoming
    };

    // Keep legacy fields in sync for backward compatibility.
    user.skills = incoming.skills;
    const firstExperience = incoming.workExperiences[0]?.description || incoming.projects[0]?.description || "";
    if (firstExperience) {
      user.experience = firstExperience;
    }

    const updated = await user.save();
    res.json(serializeUser(updated));
  } catch (error) {
    next(error);
  }
});

router.post("/profile/cv", protect, upload.single("cv"), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400);
      throw new Error("CV file is required");
    }

    const cvText = await extractCvText({
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      originalname: req.file.originalname
    });

    const parsed = parseStructuredCvData(cvText);
    const user = await User.findById(req.user._id);
    if (!user) {
      res.status(404);
      throw new Error("User not found");
    }

    user.profileData = {
      ...(user.profileData || {}),
      ...parsed,
      projects: user.profileData?.projects || [],
      cvRawText: cvText,
      cvFileName: req.file.originalname || "",
      cvMimeType: req.file.mimetype || "",
      cvLastUploadedAt: new Date()
    };

    // Keep legacy fields in sync for systems still consuming them.
    user.skills = parsed.skills;
    const summary = parsed.workExperiences[0]?.description || user.experience;
    user.experience = summary;

    const updated = await user.save();

    res.status(201).json({
      success: true,
      extractedTextLength: cvText.length,
      profile: serializeUser(updated)
    });
  } catch (error) {
    next(error);
  }
});

router.get("/profile/cv", protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      res.status(404);
      throw new Error("User not found");
    }

    const data = user.profileData || {};

    res.json({
      cvRawText: data.cvRawText || "",
      coverLetterText: data.coverLetterText || "",
      cvFileName: data.cvFileName || "",
      cvMimeType: data.cvMimeType || "",
      cvLastUploadedAt: data.cvLastUploadedAt || null,
      structured: {
        skills: data.skills || [],
        workExperiences: data.workExperiences || [],
        education: data.education || [],
        projects: data.projects || []
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get("/settings/smart-apply", protect, async (req, res, next) => {
  try {
    res.json(req.user.smartApplySettings || {});
  } catch (error) {
    next(error);
  }
});

router.put("/settings/smart-apply", protect, async (req, res, next) => {
  try {
    const {
      defaultMode,
      defaultDelaySeconds,
      defaultDailyLimit,
      requireReviewConfirmation,
      responsibleAutomation,
      safetyControls
    } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      res.status(404);
      throw new Error("User not found");
    }

    if (defaultMode && !["manual", "semi-automatic"].includes(defaultMode)) {
      res.status(400);
      throw new Error("Invalid default mode. Use manual or semi-automatic.");
    }

    user.smartApplySettings = {
      ...user.smartApplySettings,
      ...(defaultMode ? { defaultMode } : {}),
      ...(defaultDelaySeconds !== undefined
        ? { defaultDelaySeconds: Math.max(15, Math.min(Number(defaultDelaySeconds) || 45, 300)) }
        : {}),
      ...(defaultDailyLimit !== undefined
        ? { defaultDailyLimit: Math.max(1, Math.min(Number(defaultDailyLimit) || 5, 25)) }
        : {}),
      ...(requireReviewConfirmation !== undefined
        ? { requireReviewConfirmation: Boolean(requireReviewConfirmation) }
        : {}),
      ...(responsibleAutomation !== undefined
        ? { responsibleAutomation: sanitizeResponsibleAutomation(responsibleAutomation) }
        : {}),
      ...(safetyControls !== undefined
        ? { safetyControls: sanitizeSafetyControls(safetyControls) }
        : {})
    };

    const updated = await user.save();
    res.json(updated.smartApplySettings);
  } catch (error) {
    next(error);
  }
});

export default router;
