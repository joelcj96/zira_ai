import express from "express";
import { protect, adminOnly } from "../middleware/auth.js";
import User from "../models/User.js";
import Application from "../models/Application.js";
import Job from "../models/Job.js";
import ProposalUsage from "../models/ProposalUsage.js";
import ManualPayment from "../models/ManualPayment.js";
import SupportRequest from "../models/SupportRequest.js";
import { logUserActivity } from "../services/activityLogService.js";
import {
  getCachedAdminDashboard,
  setCachedAdminDashboard
} from "../services/adminDashboardCacheService.js";
import { getExternalJobFeedSyncStatus } from "../services/externalJobFeedService.js";
import {
  exportConversionEventsCsv,
  getConversionAnalyticsSummary
} from "../services/conversionAnalyticsService.js";

const router = express.Router();

router.use(protect, adminOnly);

router.get("/jobs/source-summary", async (req, res, next) => {
  try {
    const [feedCount, userAddedCount, totalJobs] = await Promise.all([
      Job.countDocuments({ sourceTag: "Feed" }),
      Job.countDocuments({ sourceTag: "User Added" }),
      Job.countDocuments({})
    ]);

    res.json({
      tags: [
        {
          sourceTag: "Feed",
          cardLabel: "Suggested",
          count: feedCount
        },
        {
          sourceTag: "User Added",
          cardLabel: "Your Job",
          count: userAddedCount
        }
      ],
      totals: {
        totalJobs,
        feedJobs: feedCount,
        userAddedJobs: userAddedCount
      }
    });
  } catch (error) {
    next(error);
  }
});

const toCsvCell = (value) => {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const parseOptionalDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const refreshManualSubscriptionState = async (userId) => {
  const user = await User.findById(userId);
  if (!user) return null;

  const now = new Date();
  const activeManualPayment = await ManualPayment.findOne({
    user: user._id,
    status: "confirmed",
    subscriptionExpiresAt: { $gt: now }
  })
    .sort({ subscriptionExpiresAt: -1 })
    .lean();

  if (!activeManualPayment) {
    user.subscriptionPlan = "free";
    user.subscriptionStatus = "inactive";
    user.stripeCurrentPeriodEnd = null;
    user.stripeCancelAtPeriodEnd = false;
    user.stripeSubscriptionId = "";
    user.stripeLastSyncAt = new Date();
    await user.save();
    return user;
  }

  user.subscriptionPlan = "pro";
  user.subscriptionStatus = "active";
  user.stripeCurrentPeriodEnd = activeManualPayment.subscriptionExpiresAt;
  user.stripeCancelAtPeriodEnd = true;
  user.stripeLastSyncAt = new Date();
  await user.save();
  return user;
};

router.get("/dashboard", async (req, res, next) => {
  try {
    const requestedTrendDays = Number.parseInt(req.query.trendDays, 10);
    const trendDays = [14, 30].includes(requestedTrendDays) ? requestedTrendDays : 14;
    const cachedDashboard = getCachedAdminDashboard({ trendDays });

    if (cachedDashboard) {
      return res.json(cachedDashboard);
    }

    const sevenDaysAgo = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7);
    const trendStart = new Date();
    trendStart.setHours(0, 0, 0, 0);
    trendStart.setDate(trendStart.getDate() - (trendDays - 1));

    const [
      totalUsers,
      activeUsers,
      proposalsAggregation,
      totalApplicationsSent,
      feedJobs,
      userAddedJobs,
      sourceTrendRows,
      conversionAnalytics
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ lastActiveAt: { $gte: sevenDaysAgo }, isBanned: false }),
      ProposalUsage.aggregate([{ $group: { _id: null, total: { $sum: "$count" } } }]),
      Application.countDocuments({
        $or: [{ submissionStatus: "submitted" }, { submissionStatus: { $exists: false } }]
      }),
      Job.countDocuments({ sourceTag: "Feed" }),
      Job.countDocuments({ sourceTag: "User Added" }),
      Job.aggregate([
        {
          $match: {
            createdAt: { $gte: trendStart }
          }
        },
        {
          $project: {
            day: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt"
              }
            },
            sourceTag: 1
          }
        },
        {
          $group: {
            _id: {
              day: "$day",
              sourceTag: "$sourceTag"
            },
            count: { $sum: 1 }
          }
        }
      ]),
      getConversionAnalyticsSummary()
    ]);

    const trendByDay = new Map();
    for (let offset = trendDays - 1; offset >= 0; offset -= 1) {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - offset);
      const dayKey = date.toISOString().slice(0, 10);
      trendByDay.set(dayKey, {
        date: dayKey,
        feedJobsAdded: 0,
        userAddedJobsAdded: 0
      });
    }

    sourceTrendRows.forEach((row) => {
      const day = row?._id?.day;
      const sourceTag = row?._id?.sourceTag;
      const count = Number(row?.count) || 0;
      if (!day || !trendByDay.has(day)) return;

      const entry = trendByDay.get(day);
      if (sourceTag === "Feed") {
        entry.feedJobsAdded += count;
      } else if (sourceTag === "User Added") {
        entry.userAddedJobsAdded += count;
      }
    });

    const payload = {
      totalUsers,
      activeUsers,
      totalProposalsGenerated: proposalsAggregation[0]?.total || 0,
      totalApplicationsSent,
      jobSourceSummary: {
        tags: [
          {
            sourceTag: "Feed",
            cardLabel: "Suggested",
            count: feedJobs
          },
          {
            sourceTag: "User Added",
            cardLabel: "Your Job",
            count: userAddedJobs
          }
        ],
        totals: {
          totalJobs: feedJobs + userAddedJobs,
          feedJobs,
          userAddedJobs
        },
        trendDays,
        trends: [...trendByDay.values()]
      },
      realJobSyncStatus: getExternalJobFeedSyncStatus(),
      conversionAnalytics
    };

    setCachedAdminDashboard({ trendDays, payload });

    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.get("/conversion-analytics", async (req, res, next) => {
  try {
    const { startDate, endDate, surface, format } = req.query;

    if (format === "csv") {
      const csv = await exportConversionEventsCsv({ startDate, endDate, surface });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="conversion-events-${Date.now()}.csv"`
      );
      return res.send(csv);
    }

    const summary = await getConversionAnalyticsSummary({ startDate, endDate, surface });
    return res.json(summary);
  } catch (error) {
    return next(error);
  }
});

router.get("/users", async (req, res, next) => {
  try {
    const users = await User.find({}).sort({ createdAt: -1 }).select(
      "name email role isBanned subscriptionPlan subscriptionStatus stripeCurrentPeriodEnd credits createdAt lastActiveAt"
    );

    const userRows = users.map((user) => {
      const isPro = user.subscriptionPlan === "pro";
      const credits = isPro ? "Unlimited" : (user.credits ?? 0);

      return {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isBanned: user.isBanned,
        plan: user.subscriptionPlan || "free",
        subscriptionStatus: user.subscriptionStatus || "inactive",
        subscriptionExpiresAt: user.stripeCurrentPeriodEnd || null,
        credits,
        dateJoined: user.createdAt,
        lastActiveAt: user.lastActiveAt
      };
    });

    res.json(userRows);
  } catch (error) {
    next(error);
  }
});

router.put("/users/:id/ban", async (req, res, next) => {
  try {
    const { banned } = req.body;

    if (typeof banned !== "boolean") {
      res.status(400);
      throw new Error("banned must be a boolean");
    }

    if (String(req.user._id) === String(req.params.id) && banned) {
      res.status(400);
      throw new Error("Admins cannot ban themselves");
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      res.status(404);
      throw new Error("User not found");
    }

    user.isBanned = banned;
    await user.save();

    res.json({ success: true, id: user._id, isBanned: user.isBanned });
  } catch (error) {
    next(error);
  }
});

router.put("/users/:id/plan", async (req, res, next) => {
  try {
    const { plan } = req.body;

    if (!["free", "pro"].includes(plan)) {
      res.status(400);
      throw new Error("plan must be free or pro");
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      res.status(404);
      throw new Error("User not found");
    }

    user.subscriptionPlan = plan;
    user.subscriptionStatus = plan === "pro" ? "active" : "inactive";

    if (plan === "free") {
      user.stripeSubscriptionId = "";
      user.stripeCurrentPeriodEnd = null;
      user.stripeCancelAtPeriodEnd = false;
    }

    await user.save();

    res.json({
      success: true,
      id: user._id,
      plan: user.subscriptionPlan,
      subscriptionStatus: user.subscriptionStatus
    });
  } catch (error) {
    next(error);
  }
});

router.put("/users/:id/manual-subscription", async (req, res, next) => {
  try {
    const { plan, expiresAt = null, reason = "manual_admin_override" } = req.body || {};

    if (!["free", "pro"].includes(plan)) {
      res.status(400);
      throw new Error("plan must be free or pro");
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      res.status(404);
      throw new Error("User not found");
    }

    const previous = {
      plan: user.subscriptionPlan || "free",
      status: user.subscriptionStatus || "inactive",
      expiresAt: user.stripeCurrentPeriodEnd || null
    };

    let parsedExpiry = null;
    if (plan === "pro" && expiresAt) {
      parsedExpiry = new Date(expiresAt);
      if (Number.isNaN(parsedExpiry.getTime())) {
        res.status(400);
        throw new Error("expiresAt must be a valid ISO date string");
      }
      if (parsedExpiry.getTime() <= Date.now()) {
        res.status(400);
        throw new Error("expiresAt must be in the future");
      }
    }

    user.subscriptionPlan = plan;
    user.subscriptionStatus = plan === "pro" ? "active" : "inactive";
    user.stripeCurrentPeriodEnd = plan === "pro" ? parsedExpiry : null;
    user.stripeCancelAtPeriodEnd = plan === "pro" ? Boolean(parsedExpiry) : false;
    user.stripeLastSyncAt = new Date();

    if (plan === "free") {
      user.stripeSubscriptionId = "";
    }

    await user.save();

    await logUserActivity({
      userId: user._id,
      actionType: "admin_subscription_updated",
      message: `Subscription updated by admin: ${previous.plan} -> ${plan}`,
      metadata: {
        adminId: req.user?._id || null,
        adminEmail: req.user?.email || null,
        reason,
        previous,
        current: {
          plan: user.subscriptionPlan,
          status: user.subscriptionStatus,
          expiresAt: user.stripeCurrentPeriodEnd || null
        }
      }
    });

    res.json({
      success: true,
      id: user._id,
      plan: user.subscriptionPlan,
      subscriptionStatus: user.subscriptionStatus,
      subscriptionExpiresAt: user.stripeCurrentPeriodEnd || null
    });
  } catch (error) {
    next(error);
  }
});

router.get("/support-requests", async (req, res, next) => {
  try {
    const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 100));
    const status = String(req.query.status || "all").trim().toLowerCase();

    const query = {};
    if (["open", "reviewed", "closed"].includes(status)) {
      query.status = status;
    }

    const requests = await SupportRequest.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("user", "name email")
      .lean();

    res.json(
      requests.map((item) => ({
        id: item._id,
        subject: item.subject,
        message: item.message,
        status: item.status,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        requesterName: item.requesterName || item.user?.name || "Unknown",
        requesterEmail: item.requesterEmail || item.user?.email || "Unknown"
      }))
    );
  } catch (error) {
    next(error);
  }
});

router.put("/support-requests/:id/status", async (req, res, next) => {
  try {
    const status = String(req.body?.status || "").trim().toLowerCase();
    if (!["open", "reviewed", "closed"].includes(status)) {
      res.status(400);
      throw new Error("status must be open, reviewed, or closed");
    }

    const updated = await SupportRequest.findByIdAndUpdate(
      req.params.id,
      { $set: { status } },
      { new: true }
    ).lean();

    if (!updated) {
      res.status(404);
      throw new Error("Support request not found");
    }

    res.json({
      id: updated._id,
      status: updated.status,
      updatedAt: updated.updatedAt
    });
  } catch (error) {
    next(error);
  }
});

router.get("/manual-payments", async (req, res, next) => {
  try {
    const { userId, paymentMethod, status, q, startDate, endDate, format } = req.query;
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 100, 500));
    const query = {};

    if (userId) {
      query.user = userId;
    }
    if (paymentMethod) {
      query.paymentMethod = paymentMethod;
    }
    if (["confirmed", "refunded", "voided"].includes(String(status || ""))) {
      query.status = status;
    }

    if (startDate || endDate) {
      query.paidAt = {};
      const parsedStart = parseOptionalDate(startDate);
      const parsedEnd = parseOptionalDate(endDate);
      if (parsedStart) query.paidAt.$gte = parsedStart;
      if (parsedEnd) {
        parsedEnd.setHours(23, 59, 59, 999);
        query.paidAt.$lte = parsedEnd;
      }
    }

    if (q) {
      const regex = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.$or = [{ reference: regex }, { notes: regex }];
    }

    const rows = await ManualPayment.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("user", "name email")
      .populate("recordedBy", "name email")
      .lean();

    const mapped = rows.map((item) => ({
      id: item._id,
      userId: item.user?._id || null,
      userName: item.user?.name || "Unknown user",
      userEmail: item.user?.email || "",
      recordedById: item.recordedBy?._id || null,
      recordedByName: item.recordedBy?.name || "Admin",
      billingCycle: item.billingCycle,
      amountUsd: item.amountUsd,
      paymentMethod: item.paymentMethod,
      reference: item.reference,
      paidAt: item.paidAt,
      subscriptionExpiresAt: item.subscriptionExpiresAt,
      status: item.status,
      notes: item.notes || "",
      createdAt: item.createdAt
    }));

    if (format === "csv") {
      const header = [
        "payment_id",
        "user_id",
        "user_name",
        "user_email",
        "recorded_by",
        "billing_cycle",
        "amount_usd",
        "payment_method",
        "reference",
        "paid_at",
        "subscription_expires_at",
        "status",
        "notes",
        "created_at"
      ];
      const lines = mapped.map((row) =>
        [
          row.id,
          row.userId,
          row.userName,
          row.userEmail,
          row.recordedByName,
          row.billingCycle,
          row.amountUsd,
          row.paymentMethod,
          row.reference,
          row.paidAt ? new Date(row.paidAt).toISOString() : "",
          row.subscriptionExpiresAt ? new Date(row.subscriptionExpiresAt).toISOString() : "",
          row.status,
          row.notes,
          row.createdAt ? new Date(row.createdAt).toISOString() : ""
        ]
          .map(toCsvCell)
          .join(",")
      );

      const csv = [header.join(","), ...lines].join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="manual-payments-${Date.now()}.csv"`);
      return res.send(csv);
    }

    res.json(mapped);
  } catch (error) {
    next(error);
  }
});

router.post("/manual-payments", async (req, res, next) => {
  try {
    const {
      userId,
      billingCycle = "monthly",
      amountUsd,
      paymentMethod = "manual",
      reference,
      paidAt,
      subscriptionExpiresAt,
      notes = ""
    } = req.body || {};

    if (!userId) {
      res.status(400);
      throw new Error("userId is required");
    }
    if (!["monthly", "yearly"].includes(billingCycle)) {
      res.status(400);
      throw new Error("billingCycle must be monthly or yearly");
    }

    const amount = Number(amountUsd);
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400);
      throw new Error("amountUsd must be a positive number");
    }

    const cleanReference = String(reference || "").trim();
    if (!cleanReference) {
      res.status(400);
      throw new Error("reference is required");
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(404);
      throw new Error("User not found");
    }

    const resolvedPaidAt = paidAt ? new Date(paidAt) : new Date();
    if (Number.isNaN(resolvedPaidAt.getTime())) {
      res.status(400);
      throw new Error("paidAt must be a valid date");
    }

    let resolvedExpiry;
    if (subscriptionExpiresAt) {
      resolvedExpiry = new Date(subscriptionExpiresAt);
      if (Number.isNaN(resolvedExpiry.getTime())) {
        res.status(400);
        throw new Error("subscriptionExpiresAt must be a valid date");
      }
    } else {
      resolvedExpiry = new Date(resolvedPaidAt);
      resolvedExpiry.setDate(
        resolvedExpiry.getDate() + (billingCycle === "yearly" ? 365 : 30)
      );
    }

    if (resolvedExpiry.getTime() <= resolvedPaidAt.getTime()) {
      res.status(400);
      throw new Error("subscriptionExpiresAt must be after paidAt");
    }

    const payment = await ManualPayment.create({
      user: user._id,
      recordedBy: req.user._id,
      billingCycle,
      amountUsd: amount,
      paymentMethod: String(paymentMethod || "manual").trim(),
      reference: cleanReference,
      paidAt: resolvedPaidAt,
      subscriptionExpiresAt: resolvedExpiry,
      notes: String(notes || "").trim(),
      status: "confirmed"
    });

    const previousPlan = user.subscriptionPlan || "free";
    user.subscriptionPlan = "pro";
    user.subscriptionStatus = "active";
    user.stripeCurrentPeriodEnd = resolvedExpiry;
    user.stripeCancelAtPeriodEnd = true;
    user.stripeLastSyncAt = new Date();
    await user.save();

    await logUserActivity({
      userId: user._id,
      actionType: "admin_subscription_updated",
      message: `Manual payment recorded and Pro activated (${billingCycle})`,
      metadata: {
        adminId: req.user._id,
        adminEmail: req.user.email,
        previousPlan,
        paymentId: payment._id,
        amountUsd: amount,
        paymentMethod: payment.paymentMethod,
        reference: cleanReference,
        paidAt: resolvedPaidAt,
        subscriptionExpiresAt: resolvedExpiry
      }
    });

    res.status(201).json({
      success: true,
      payment: {
        id: payment._id,
        userId: user._id,
        userName: user.name,
        userEmail: user.email,
        billingCycle: payment.billingCycle,
        amountUsd: payment.amountUsd,
        paymentMethod: payment.paymentMethod,
        reference: payment.reference,
        paidAt: payment.paidAt,
        subscriptionExpiresAt: payment.subscriptionExpiresAt,
        status: payment.status,
        notes: payment.notes,
        recordedByName: req.user.name,
        createdAt: payment.createdAt
      },
      user: {
        id: user._id,
        plan: user.subscriptionPlan,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionExpiresAt: user.stripeCurrentPeriodEnd
      }
    });
  } catch (error) {
    next(error);
  }
});

router.put("/manual-payments/:id/status", async (req, res, next) => {
  try {
    const { status, reason = "manual_payment_status_update" } = req.body || {};
    if (!["confirmed", "refunded", "voided"].includes(status)) {
      res.status(400);
      throw new Error("status must be confirmed, refunded, or voided");
    }

    const payment = await ManualPayment.findById(req.params.id);
    if (!payment) {
      res.status(404);
      throw new Error("Manual payment not found");
    }

    const previousStatus = payment.status;
    if (previousStatus === status) {
      return res.json({ success: true, payment, unchanged: true });
    }

    payment.status = status;
    await payment.save();

    const updatedUser = await refreshManualSubscriptionState(payment.user);

    await logUserActivity({
      userId: payment.user,
      actionType: "admin_subscription_updated",
      message: `Manual payment status changed: ${previousStatus} -> ${status}`,
      metadata: {
        adminId: req.user._id,
        adminEmail: req.user.email,
        reason,
        paymentId: payment._id,
        previousStatus,
        currentStatus: status,
        userPlanAfterUpdate: updatedUser?.subscriptionPlan || "unknown",
        userStatusAfterUpdate: updatedUser?.subscriptionStatus || "unknown",
        userExpiryAfterUpdate: updatedUser?.stripeCurrentPeriodEnd || null
      }
    });

    res.json({
      success: true,
      payment: {
        id: payment._id,
        status: payment.status
      },
      user: updatedUser
        ? {
            id: updatedUser._id,
            plan: updatedUser.subscriptionPlan,
            subscriptionStatus: updatedUser.subscriptionStatus,
            subscriptionExpiresAt: updatedUser.stripeCurrentPeriodEnd || null
          }
        : null
    });
  } catch (error) {
    next(error);
  }
});

export default router;
