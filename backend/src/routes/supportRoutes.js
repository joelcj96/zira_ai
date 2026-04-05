import express from "express";
import { protect } from "../middleware/auth.js";
import SupportRequest from "../models/SupportRequest.js";

const router = express.Router();

const DEFAULT_SUPPORT_EMAIL = "nkashamailunga96@gmail.com";

const getSupportEmail = () => process.env.SUPPORT_EMAIL || DEFAULT_SUPPORT_EMAIL;

const cleanString = (value) => String(value || "").trim();

router.get("/meta", protect, async (req, res, next) => {
  try {
    res.json({
      supportEmail: getSupportEmail()
    });
  } catch (error) {
    next(error);
  }
});

router.get("/requests", protect, async (req, res, next) => {
  try {
    const requests = await SupportRequest.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(25)
      .lean();

    res.json(
      requests.map((item) => ({
        id: item._id,
        subject: item.subject,
        message: item.message,
        status: item.status,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      }))
    );
  } catch (error) {
    next(error);
  }
});

router.post("/requests", protect, async (req, res, next) => {
  try {
    const subject = cleanString(req.body?.subject);
    const message = cleanString(req.body?.message);

    if (!subject) {
      res.status(400);
      throw new Error("Support request subject is required");
    }

    if (!message) {
      res.status(400);
      throw new Error("Support request message is required");
    }

    if (subject.length > 160) {
      res.status(400);
      throw new Error("Support request subject must be 160 characters or fewer");
    }

    if (message.length > 4000) {
      res.status(400);
      throw new Error("Support request message must be 4000 characters or fewer");
    }

    const createdRequest = await SupportRequest.create({
      user: req.user._id,
      requesterName: cleanString(req.user.name),
      requesterEmail: cleanString(req.user.email),
      subject,
      message
    });

    res.status(201).json({
      message: "Support request submitted successfully",
      supportEmail: getSupportEmail(),
      request: {
        id: createdRequest._id,
        subject: createdRequest.subject,
        message: createdRequest.message,
        status: createdRequest.status,
        createdAt: createdRequest.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/requests/:requestId", protect, async (req, res, next) => {
  try {
    const requestId = cleanString(req.params?.requestId);

    if (!requestId) {
      res.status(400);
      throw new Error("Support request id is required");
    }

    const deletedRequest = await SupportRequest.findOneAndDelete({
      _id: requestId,
      user: req.user._id
    });

    if (!deletedRequest) {
      res.status(404);
      throw new Error("Support request not found");
    }

    res.json({
      message: "Support request deleted successfully",
      request: {
        id: deletedRequest._id,
        subject: deletedRequest.subject
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;