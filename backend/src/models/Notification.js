import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: ["job_match", "application_submitted", "response_received", "profile_update", "system"],
      default: "system"
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    icon: { type: String, default: "bell" }, // bell, briefcase, check, star, alert, info
    color: { type: String, default: "accent" }, // accent, ok, warn, bad, muted
    read: { type: Boolean, default: false },
    actionUrl: { type: String, default: null }, // /jobs, /jobs/123, /applications, etc.
    reference: {
      jobId: mongoose.Schema.Types.ObjectId,
      applicationId: mongoose.Schema.Types.ObjectId,
      companyName: String
    },
    dismissAt: { type: Date, default: null } // When notification should auto-disappear (optional)
  },
  { timestamps: true }
);

// Index for fast queries
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, read: 1 });

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
