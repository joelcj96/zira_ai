import mongoose from "mongoose";

const queueAuditLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Application",
      default: null
    },
    jobTitle: { type: String, required: true },
    company: { type: String, required: true },
    action: {
      type: String,
      enum: [
        "cancel",
        "reschedule",
        "submit",
        "schedule",
        "skip",
        "policy_block",
        "review_checkpoint"
      ],
      required: true
    },
    reason: { type: String, default: "" },
    previousStatus: { type: String },
    previousScheduledFor: { type: Date, default: null },
    newScheduledFor: { type: Date, default: null },
    delaySeconds: { type: Number, default: null },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

export default mongoose.model("QueueAuditLog", queueAuditLogSchema);
