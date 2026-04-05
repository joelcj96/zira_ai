import mongoose from "mongoose";

const userJobBehaviorSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    jobId: {
      type: String,
      required: true,
      index: true
    },
    eventType: {
      type: String,
      enum: ["clicked", "applied", "ignored"],
      required: true,
      index: true
    },
    title: { type: String, default: "" },
    company: { type: String, default: "" },
    location: { type: String, default: "" },
    salary: { type: Number, default: 0 },
    skillsRequired: { type: [String], default: [] },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

userJobBehaviorSchema.index({ user: 1, eventType: 1, createdAt: -1 });

const UserJobBehavior = mongoose.model("UserJobBehavior", userJobBehaviorSchema);

export default UserJobBehavior;
