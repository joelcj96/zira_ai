import mongoose from "mongoose";

const manualPaymentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    billingCycle: {
      type: String,
      enum: ["monthly", "yearly"],
      required: true,
      default: "monthly"
    },
    amountUsd: {
      type: Number,
      required: true,
      min: 0
    },
    paymentMethod: {
      type: String,
      required: true,
      default: "manual"
    },
    reference: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    paidAt: {
      type: Date,
      required: true,
      default: Date.now
    },
    subscriptionExpiresAt: {
      type: Date,
      required: true
    },
    status: {
      type: String,
      enum: ["confirmed", "refunded", "voided"],
      default: "confirmed",
      index: true
    },
    notes: {
      type: String,
      default: ""
    }
  },
  { timestamps: true }
);

manualPaymentSchema.index({ createdAt: -1 });
manualPaymentSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model("ManualPayment", manualPaymentSchema);
