import mongoose from "mongoose";

const applicationTrackerSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    date: {
      type: Date,
      required: true,
      index: true
    },
    applicationCount: {
      type: Number,
      default: 0,
      min: 0
    },
    dailyLimit: {
      type: Number,
      default: 10
    },
    applicationsInQueue: {
      type: Number,
      default: 0
    },
    // Last application timestamp to prevent rapid repeated actions
    lastApplicationAt: {
      type: Date,
      default: null
    },
    // Minimum delay between applications (milliseconds)
    minDelayMs: {
      type: Number,
      default: 2000 // 2 seconds minimum between applications
    },
    // Auto-reset per day
    lastResetAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

// Index for efficient daily lookups
applicationTrackerSchema.index({ user: 1, date: 1 });

const ApplicationTracker = mongoose.model("ApplicationTracker", applicationTrackerSchema);

export default ApplicationTracker;
