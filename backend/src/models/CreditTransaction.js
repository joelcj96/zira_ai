import mongoose from "mongoose";

const creditTransactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    type: {
      type: String,
      enum: ["usage", "purchase"],
      required: true
    },
    action: {
      type: String,
      enum: ["proposal_generation", "job_application", "credit_purchase"],
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    balanceBefore: {
      type: Number,
      required: true
    },
    balanceAfter: {
      type: Number,
      required: true
    },
    reference: {
      jobId: String,
      applicationId: mongoose.Schema.Types.ObjectId,
      purchaseId: String
    },
    status: {
      type: String,
      enum: ["completed", "failed", "pending"],
      default: "completed"
    }
  },
  { timestamps: true }
);

// Index for querying user transactions
creditTransactionSchema.index({ user: 1, createdAt: -1 });
creditTransactionSchema.index({ user: 1, type: 1 });

const CreditTransaction = mongoose.model("CreditTransaction", creditTransactionSchema);

export default CreditTransaction;
