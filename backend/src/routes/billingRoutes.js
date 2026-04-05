import express from "express";
import Stripe from "stripe";
import { protect } from "../middleware/auth.js";
import User from "../models/User.js";
import { trackConversionEvent } from "../services/conversionAnalyticsService.js";

const router = express.Router();
const SUPPORTED_BILLING_PROVIDERS = ["stripe", "manual"];

const getBillingProvider = () => {
  const provider = String(process.env.BILLING_PROVIDER || "stripe").trim().toLowerCase();
  return SUPPORTED_BILLING_PROVIDERS.includes(provider) ? provider : "stripe";
};

const getStripeClient = () => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    const error = new Error("Stripe is not configured. Missing STRIPE_SECRET_KEY");
    error.status = 500;
    throw error;
  }

  return new Stripe(stripeKey);
};

const toCustomerId = (customer) => (typeof customer === "string" ? customer : customer?.id || "");
const toDateFromUnix = (value) => (Number(value) > 0 ? new Date(Number(value) * 1000) : null);
const toPositiveCents = (value) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0;
};
const getCheckoutPaymentMethodTypes = () => {
  const raw = String(process.env.STRIPE_CHECKOUT_PAYMENT_METHOD_TYPES || "card");
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
};

const syncUserFromSubscription = async (subscription, fallbackCustomerId = "") => {
  const customerId = toCustomerId(subscription?.customer) || fallbackCustomerId;
  const subscriptionId = typeof subscription === "string" ? subscription : subscription?.id || "";
  const stripeStatus = subscription?.status || "inactive";

  let user = customerId ? await User.findOne({ stripeCustomerId: customerId }) : null;

  if (!user && subscription?.metadata?.userId) {
    user = await User.findById(subscription.metadata.userId);
  }

  if (!user) {
    return false;
  }

  user.stripeCustomerId = customerId || user.stripeCustomerId;
  user.stripeSubscriptionId = subscriptionId || user.stripeSubscriptionId;
  user.stripeCurrentPeriodEnd = toDateFromUnix(subscription?.current_period_end);
  user.stripeCancelAtPeriodEnd = Boolean(subscription?.cancel_at_period_end);
  user.stripeLastSyncAt = new Date();

  if (["active", "trialing"].includes(stripeStatus)) {
    user.subscriptionPlan = "pro";
    user.subscriptionStatus = stripeStatus;
  } else if (stripeStatus === "past_due" || stripeStatus === "unpaid") {
    user.subscriptionPlan = "free";
    user.subscriptionStatus = "past_due";
  } else {
    user.subscriptionPlan = "free";
    user.subscriptionStatus = stripeStatus === "canceled" ? "canceled" : "inactive";
  }

  await user.save();
  return true;
};

export const handleStripeWebhook = async (req, res) => {
  if (getBillingProvider() !== "stripe") {
    return res.json({ received: true, provider: getBillingProvider() });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return res.status(500).json({ message: "Missing STRIPE_WEBHOOK_SECRET" });
  }

  const stripe = getStripeClient();
  const signature = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (error) {
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode === "subscription") {
          const userId = session.metadata?.userId;
          const customerId = toCustomerId(session.customer);
          const subscriptionId = typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;

          if (userId) {
            const user = await User.findById(userId);
            if (user) {
              user.subscriptionPlan = "pro";
              user.subscriptionStatus = "active";
              user.stripeCustomerId = customerId || user.stripeCustomerId;
              user.stripeSubscriptionId = subscriptionId || user.stripeSubscriptionId;
              user.stripeLastSyncAt = new Date();
              await user.save();
            }
          }
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        await syncUserFromSubscription(subscription);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const customerId = toCustomerId(invoice.customer);
        const user = customerId ? await User.findOne({ stripeCustomerId: customerId }) : null;

        if (user) {
          user.subscriptionPlan = "free";
          user.subscriptionStatus = "past_due";
          user.stripeLastSyncAt = new Date();
          await user.save();
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object;
        const customerId = toCustomerId(invoice.customer);
        const subscriptionId =
          typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id || "";

        if (customerId) {
          const user = await User.findOne({ stripeCustomerId: customerId });
          if (user && subscriptionId && user.stripeSubscriptionId === subscriptionId) {
            user.subscriptionPlan = "pro";
            user.subscriptionStatus = "active";
            user.stripeLastSyncAt = new Date();
            await user.save();
          }
        }
        break;
      }

      default:
        break;
    }

    return res.json({ received: true });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Webhook processing failed" });
  }
};

router.get("/pricing", protect, async (req, res, next) => {
  try {
    const provider = getBillingProvider();
    const monthlyCents = toPositiveCents(process.env.STRIPE_PRO_PRICE_USD_CENTS);
    const yearlyCents = toPositiveCents(process.env.STRIPE_PRO_YEARLY_PRICE_USD_CENTS);
    const yearlySavingsPercent =
      monthlyCents > 0 && yearlyCents > 0
        ? Math.max(0, Math.round((1 - yearlyCents / (monthlyCents * 12)) * 100))
        : 0;

    res.json({
      provider,
      currency: "usd",
      monthlyCents,
      yearlyCents,
      yearlySavingsPercent,
      monthlyPriceIdConfigured: Boolean(process.env.STRIPE_PRO_PRICE_ID),
      yearlyPriceIdConfigured: Boolean(process.env.STRIPE_PRO_YEARLY_PRICE_ID)
    });
  } catch (error) {
    next(error);
  }
});

router.post("/create-checkout-session", protect, async (req, res, next) => {
  try {
    const { source = "unknown", feature = "pro_upgrade", billingCycle = "monthly" } = req.body || {};
    const provider = getBillingProvider();

    if (!["monthly", "yearly"].includes(billingCycle)) {
      res.status(400);
      throw new Error("Invalid billing cycle. Use monthly or yearly.");
    }

    const monthlyPriceId = process.env.STRIPE_PRO_PRICE_ID;
    const yearlyPriceId = process.env.STRIPE_PRO_YEARLY_PRICE_ID;
    const monthlyFallbackAmount = Number(process.env.STRIPE_PRO_PRICE_USD_CENTS || 0);
    const yearlyFallbackAmount = Number(process.env.STRIPE_PRO_YEARLY_PRICE_USD_CENTS || 0);

    const selectedPriceId = billingCycle === "yearly" ? yearlyPriceId : monthlyPriceId;
    const selectedFallbackAmount =
      billingCycle === "yearly" ? yearlyFallbackAmount : monthlyFallbackAmount;
    const selectedInterval = billingCycle === "yearly" ? "year" : "month";

    if (!selectedPriceId && (!Number.isFinite(selectedFallbackAmount) || selectedFallbackAmount <= 0)) {
      res.status(500);
      throw new Error(
        `Missing Stripe ${billingCycle} price configuration. Set ${
          billingCycle === "yearly" ? "STRIPE_PRO_YEARLY_PRICE_ID" : "STRIPE_PRO_PRICE_ID"
        } (recommended) or ${
          billingCycle === "yearly"
            ? "STRIPE_PRO_YEARLY_PRICE_USD_CENTS"
            : "STRIPE_PRO_PRICE_USD_CENTS"
        }.`
      );
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      res.status(404);
      throw new Error("User not found");
    }

    if (user.subscriptionPlan === "pro" && ["active", "trialing"].includes(user.subscriptionStatus)) {
      res.status(400);
      throw new Error("You already have an active Pro subscription");
    }

    if (provider === "manual") {
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
      const manualBillingUrl =
        process.env.MANUAL_BILLING_CONTACT_URL ||
        `${frontendUrl}/settings?billing=manual&cycle=${billingCycle}`;

      await trackConversionEvent({
        user,
        eventType: "checkout_started",
        surface: source,
        feature,
        metadata: {
          provider,
          billingCycle,
          manualBillingUrl
        },
        uniqueKey: `checkout_started:manual:${user._id}:${billingCycle}:${Date.now()}`
      });

      return res.json({
        url: manualBillingUrl,
        provider,
        manual: true,
        message:
          "Stripe is not available for your region. Continue with manual/local billing using the provided link."
      });
    }

    const stripe = getStripeClient();

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: { userId: String(user._id) }
      });
      customerId = customer.id;
      user.stripeCustomerId = customerId;
      await user.save();
    }

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const paymentMethodTypes = getCheckoutPaymentMethodTypes();
    const lineItems = selectedPriceId
      ? [{ price: selectedPriceId, quantity: 1 }]
      : [
          {
            price_data: {
              currency: "usd",
              unit_amount: selectedFallbackAmount,
              recurring: { interval: selectedInterval },
              product_data: {
                name: "Zira AI Pro",
                description: "Unlimited AI proposal generation and premium optimization features"
              }
            },
            quantity: 1
          }
        ];

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      payment_method_types: paymentMethodTypes,
      line_items: lineItems,
      subscription_data: {
        metadata: { userId: String(user._id) }
      },
      success_url: `${frontendUrl}/settings?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/settings?checkout=cancelled`,
      metadata: {
        userId: String(user._id),
        source,
        feature,
        billingCycle
      }
    });

    await trackConversionEvent({
      user,
      eventType: "checkout_started",
      surface: source,
      feature,
      metadata: {
        checkoutSessionId: session.id,
        stripeCustomerId: customerId,
        billingCycle,
        paymentMethodTypes
      },
      uniqueKey: `checkout_started:${session.id}`
    });

    res.json({ url: session.url });
  } catch (error) {
    next(error);
  }
});

router.get("/checkout-session/:sessionId", protect, async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"]
    });

    const sessionUserId = session.metadata?.userId;
    if (!sessionUserId || sessionUserId !== String(req.user._id)) {
      res.status(403);
      throw new Error("Checkout session does not belong to this user");
    }

    if (session.payment_status !== "paid" && session.status !== "complete") {
      res.status(400);
      throw new Error("Checkout has not completed yet");
    }

    const subscriptionStatus = session.subscription?.status || "active";

    const user = await User.findById(req.user._id);
    if (!user) {
      res.status(404);
      throw new Error("User not found");
    }

    user.subscriptionPlan = "pro";
    user.subscriptionStatus =
      subscriptionStatus === "trialing" || subscriptionStatus === "active"
        ? subscriptionStatus
        : "active";
    user.stripeCustomerId = typeof session.customer === "string" ? session.customer : user.stripeCustomerId;
    user.stripeSubscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id || user.stripeSubscriptionId;
    user.stripeCurrentPeriodEnd = toDateFromUnix(session.subscription?.current_period_end);
    user.stripeCancelAtPeriodEnd = Boolean(session.subscription?.cancel_at_period_end);
    user.stripeLastSyncAt = new Date();

    await user.save();

    await trackConversionEvent({
      user,
      eventType: "upgrade_completed",
      surface: session.metadata?.source || "checkout_success",
      feature: session.metadata?.feature || "pro_upgrade",
      metadata: {
        checkoutSessionId: session.id,
        stripeSubscriptionId: user.stripeSubscriptionId || null
      },
      uniqueKey: `upgrade_completed:${session.id}`
    });

    res.json({
      subscriptionPlan: user.subscriptionPlan,
      subscriptionStatus: user.subscriptionStatus,
      upgraded: true
    });
  } catch (error) {
    next(error);
  }
});

router.get("/status", protect, async (req, res, next) => {
  try {
    const provider = getBillingProvider();
    const user = await User.findById(req.user._id);
    if (!user) {
      res.status(404);
      throw new Error("User not found");
    }

    res.json({
      provider,
      plan: user.subscriptionPlan || "free",
      status: user.subscriptionStatus || "inactive",
      isPremium: user.subscriptionPlan === "pro" && ["active", "trialing"].includes(user.subscriptionStatus),
      stripeCustomerId: user.stripeCustomerId || null,
      stripeSubscriptionId: user.stripeSubscriptionId || null,
      nextBillingDate: user.stripeCurrentPeriodEnd || null,
      cancelAtPeriodEnd: Boolean(user.stripeCancelAtPeriodEnd),
      lastStripeSyncAt: user.stripeLastSyncAt || null,
      manualBillingContactUrl:
        provider === "manual"
          ? process.env.MANUAL_BILLING_CONTACT_URL || null
          : null
    });
  } catch (error) {
    next(error);
  }
});

export default router;
