import express from "express";
import { protect } from "../middleware/auth.js";
import ActivityLog from "../models/ActivityLog.js";

const router = express.Router();

router.get("/timeline", protect, async (req, res, next) => {
  try {
    const limit = Math.max(10, Math.min(Number(req.query.limit) || 100, 300));

    const [items, total] = await Promise.all([
      ActivityLog.find({ user: req.user._id })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      ActivityLog.countDocuments({ user: req.user._id })
    ]);

    res.json({
      items,
      total
    });
  } catch (error) {
    next(error);
  }
});

export default router;
