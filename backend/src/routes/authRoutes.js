import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { getEntitlements } from "../services/subscriptionService.js";

const router = express.Router();

const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });

const serializeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role || "user",
  profileImage: user.profileImage || "",
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

router.post("/register", async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      res.status(400);
      throw new Error("Name, email, and password are required");
    }

    const existing = await User.findOne({ email });
    if (existing) {
      res.status(400);
      throw new Error("User already exists");
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashed, authProvider: "email" });

    res.status(201).json({
      token: signToken(user._id),
      user: serializeUser(user)
    });
  } catch (error) {
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      res.status(401);
      throw new Error("Email not found. Please check your email or create an account.");
    }

    if (!user.password) {
      res.status(401);
      throw new Error("This email is registered via Google. Please sign in with Google.");
    }

    if (user.isBanned) {
      res.status(403);
      throw new Error("Account is banned. Contact support.");
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.status(401);
      throw new Error("Incorrect password. Please try again.");
    }

    user.lastActiveAt = new Date();
    await user.save();

    res.json({
      token: signToken(user._id),
      user: serializeUser(user)
    });
  } catch (error) {
    next(error);
  }
});

router.post("/google", async (req, res, next) => {
  try {
    const { email, name, googleToken } = req.body;

    if (!googleToken || !email || !name) {
      res.status(400);
      throw new Error("Google login payload is incomplete");
    }

    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        name,
        email,
        authProvider: "google",
        password: null
      });
    }

    if (user.isBanned) {
      res.status(403);
      throw new Error("Account is banned. Contact support.");
    }

    user.lastActiveAt = new Date();
    await user.save();

    res.json({
      token: signToken(user._id),
      user: serializeUser(user)
    });
  } catch (error) {
    next(error);
  }
});

export default router;
