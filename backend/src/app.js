import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { getIndexWarning } from "./scripts/ensureIndexes.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import jobsRoutes from "./routes/jobsRoutes.js";
import proposalsRoutes from "./routes/proposalsRoutes.js";
import applicationsRoutes from "./routes/applicationsRoutes.js";
import notificationsRoutes from "./routes/notificationsRoutes.js";
import billingRoutes, { handleStripeWebhook } from "./routes/billingRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import creditsRoutes from "./routes/creditsRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import activityRoutes from "./routes/activityRoutes.js";
import supportRoutes from "./routes/supportRoutes.js";

dotenv.config();

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true
  })
);

// Stripe webhook must use raw body for signature verification.
app.post("/api/billing/webhook", express.raw({ type: "application/json" }), handleStripeWebhook);

app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ message: "Zira AI API is healthy" });
});

app.get("/api/system/index-status", (req, res) => {
  const warning = getIndexWarning();
  res.json({ warning: warning || null });
});

app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/jobs", jobsRoutes);
app.use("/api/proposals", proposalsRoutes);
app.use("/api/applications", applicationsRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/credits", creditsRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api/support", supportRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;

