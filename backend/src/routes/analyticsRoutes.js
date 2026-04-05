import express from "express";
import { protect } from "../middleware/auth.js";
import { trackConversionEvent } from "../services/conversionAnalyticsService.js";

const router = express.Router();

const ALLOWED_EVENT_TYPES = [
  "lock_impression",
  "upgrade_cta_click",
  "checkout_started",
  "upgrade_completed"
];

router.post("/conversion-events", protect, async (req, res, next) => {
  try {
    const { eventType, surface, feature, metadata, uniqueKey } = req.body;

    if (!ALLOWED_EVENT_TYPES.includes(eventType)) {
      res.status(400);
      throw new Error("Invalid eventType");
    }

    if (!surface) {
      res.status(400);
      throw new Error("surface is required");
    }

    const event = await trackConversionEvent({
      user: req.user,
      eventType,
      surface,
      feature,
      metadata: metadata || {},
      uniqueKey: uniqueKey || ""
    });

    res.status(201).json({ success: true, id: event?._id || null });
  } catch (error) {
    next(error);
  }
});

export default router;