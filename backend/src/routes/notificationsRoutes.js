import express from "express";
import { protect } from "../middleware/auth.js";
import Notification from "../models/Notification.js";
import {
  notifyApplicationSubmitted,
  notifyResponseReceived
} from "../services/notificationService.js";

const router = express.Router();

// GET /api/notifications - Get all notifications with unread count
router.get("/", protect, async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const notifications = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const unreadCount = await Notification.countDocuments({
      user: req.user._id,
      read: false
    });

    res.json({
      notifications,
      unreadCount,
      total: await Notification.countDocuments({ user: req.user._id })
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/notifications/unread-count - Get just the unread count (for polling)
router.get("/unread-count", protect, async (req, res, next) => {
  try {
    const unreadCount = await Notification.countDocuments({
      user: req.user._id,
      read: false
    });

    res.json({ unreadCount });
  } catch (error) {
    next(error);
  }
});

// PUT /api/notifications/:id/read - Mark notification as read
router.put("/:id/read", protect, async (req, res, next) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!notification) {
      res.status(404);
      throw new Error("Notification not found");
    }

    notification.read = true;
    await notification.save();

    res.json(notification);
  } catch (error) {
    next(error);
  }
});

// PUT /api/notifications/:id/unread - Mark notification as unread
router.put("/:id/unread", protect, async (req, res, next) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!notification) {
      res.status(404);
      throw new Error("Notification not found");
    }

    notification.read = false;
    await notification.save();

    res.json(notification);
  } catch (error) {
    next(error);
  }
});

// PUT /api/notifications/mark-all-read - Mark all notifications as read
router.put("/mark-all/read", protect, async (req, res, next) => {
  try {
    const result = await Notification.updateMany(
      { user: req.user._id, read: false },
      { $set: { read: true } }
    );

    res.json({
      message: "All notifications marked as read",
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/notifications/:id - Delete a notification
router.delete("/:id", protect, async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id
    });

    if (!notification) {
      res.status(404);
      throw new Error("Notification not found");
    }

    res.json({ message: "Notification deleted" });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/notifications/clear/all - Clear all notifications
router.delete("/clear/all", protect, async (req, res, next) => {
  try {
    const result = await Notification.deleteMany({ user: req.user._id });

    res.json({
      message: "All notifications cleared",
      deletedCount: result.deletedCount
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/notifications/test - Test notification (for demo)
router.post("/test", protect, async (req, res, next) => {
  try {
    const { type } = req.body;

    let notification;
    switch (type) {
      case "job_match":
        notification = await Notification.create({
          user: req.user._id,
          type: "job_match",
          title: "New Job Alert 🎯",
          message: "Senior Software Engineer at TechCorp matches your profile!",
          icon: "briefcase",
          color: "accent",
          actionUrl: "/jobs/job-1"
        });
        break;

      case "application_submitted":
        notification = await Notification.create({
          user: req.user._id,
          type: "application_submitted",
          title: "Application Sent ✓",
          message: "Your application for Senior Engineer at TechCorp has been submitted.",
          icon: "check",
          color: "ok",
          actionUrl: "/applications"
        });
        break;

      case "response_received":
        notification = await Notification.create({
          user: req.user._id,
          type: "response_received",
          title: "Response Received 🎉",
          message: "TechCorp has accepted your application for Senior Engineer!",
          icon: "star",
          color: "ok",
          actionUrl: "/applications"
        });
        break;

      default:
        res.status(400);
        throw new Error("Invalid notification type");
    }

    res.status(201).json({
      message: "Test notification created",
      notification
    });
  } catch (error) {
    next(error);
  }
});

export default router;
