import express from "express";
import { protect } from "../middleware/auth.js";
import User from "../models/User.js";
import CreditTransaction from "../models/CreditTransaction.js";
import { getEntitlements } from "../services/subscriptionService.js";

const router = express.Router();

// Helper to deduct credits and create transaction
export const deductCredits = async (userId, amount, action, reference = {}) => {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  const entitlements = getEntitlements(user);
  if (entitlements.unlimitedCredits) {
    return { user, transaction: null, deducted: 0 };
  }

  if (user.credits < amount) {
    const error = new Error("Insufficient credits");
    error.statusCode = 402;
    throw error;
  }

  const balanceBefore = user.credits;
  user.credits -= amount;
  user.totalCreditsSpent += amount;
  await user.save();

  const transaction = await CreditTransaction.create({
    user: userId,
    type: "usage",
    action,
    amount,
    balanceBefore,
    balanceAfter: user.credits,
    reference,
    status: "completed"
  });

  return { user, transaction };
};

// Helper to add credits and create transaction
export const addCredits = async (userId, amount, action, reference = {}) => {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  const balanceBefore = user.credits;
  user.credits += amount;
  user.totalCreditsEarned += amount;
  await user.save();

  const transaction = await CreditTransaction.create({
    user: userId,
    type: "purchase",
    action,
    amount,
    balanceBefore,
    balanceAfter: user.credits,
    reference,
    status: "completed"
  });

  return { user, transaction };
};

// GET /api/credits/balance - Get current credit balance
router.get("/balance", protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      res.status(404);
      throw new Error("User not found");
    }

    const entitlements = getEntitlements(user);

    res.json({
      credits: entitlements.unlimitedCredits ? null : user.credits,
      totalEarned: user.totalCreditsEarned,
      totalSpent: user.totalCreditsSpent,
      isUnlimited: entitlements.unlimitedCredits,
      status: entitlements.unlimitedCredits
        ? "unlimited"
        : user.credits === 0
          ? "zero"
          : user.credits <= 2
            ? "low"
            : "healthy"
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/credits/purchase - Simulate credit purchase
router.post("/purchase", protect, async (req, res, next) => {
  try {
    const entitlements = getEntitlements(req.user);
    if (entitlements.unlimitedCredits) {
      res.status(400);
      throw new Error("Your Pro plan already includes unlimited credits");
    }

    if (req.user?.role !== "admin") {
      res.status(503);
      throw new Error("Credit purchases are not activated yet. Please check back soon.");
    }

    const { package: packageType } = req.body; // "10", "50", or "100"
    const validPackages = { "10": 10, "50": 50, "100": 100 };

    if (!validPackages[packageType]) {
      res.status(400);
      throw new Error("Invalid package. Use: 10, 50, or 100");
    }

    const amount = validPackages[packageType];
    const userIdSuffix = String(req.user?._id || "user").slice(-8);
    const purchaseId = `mock-purchase-${Date.now()}-${userIdSuffix}`;

    // Simulate successful purchase
    const { user, transaction } = await addCredits(
      req.user._id,
      amount,
      "credit_purchase",
      { purchaseId }
    );

    res.status(201).json({
      success: true,
      message: `Successfully purchased ${amount} credits`,
      purchaseId,
      credits: user.credits,
      transaction: {
        id: transaction._id,
        type: "purchase",
        amount,
        balanceBefore: transaction.balanceBefore,
        balanceAfter: transaction.balanceAfter,
        createdAt: transaction.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/credits/history - Get transaction history
router.get("/history", protect, async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const transactions = await CreditTransaction.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({
      total: await CreditTransaction.countDocuments({ user: req.user._id }),
      transactions: transactions.map((t) => ({
        id: t._id,
        type: t.type,
        action: t.action,
        amount: t.amount,
        balanceBefore: t.balanceBefore,
        balanceAfter: t.balanceAfter,
        createdAt: t.createdAt,
        reference: t.reference
      }))
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/credits/packages - Get available credit packages
router.get("/packages", (req, res) => {
  res.json({
    packages: [
      {
        id: "10",
        credits: 10,
        price: 4.99,
        pricePerCredit: 0.499,
        popular: false,
        discount: 0
      },
      {
        id: "50",
        credits: 50,
        price: 19.99,
        pricePerCredit: 0.3998,
        popular: true,
        discount: 20
      },
      {
        id: "100",
        credits: 100,
        price: 34.99,
        pricePerCredit: 0.3499,
        popular: false,
        discount: 30
      }
    ],
    freeTierCredits: 16,
    proposalCost: 1,
    applicationCost: 2
  });
});

export default router;
