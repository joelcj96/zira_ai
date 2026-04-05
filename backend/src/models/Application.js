import mongoose from "mongoose";

const applicationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    jobId: { type: String, required: true },
    title: { type: String, required: true },
    company: { type: String, required: true },
    jobDescription: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending"
    },
    outcome: {
      type: String,
      enum: ["unknown", "no_response", "response_received", "job_won"],
      default: "unknown",
      index: true
    },
    outcomeNotes: { type: String, default: "" },
    outcomeUpdatedAt: { type: Date },
    proposalText: { type: String, default: "" },
    notes: { type: String, default: "" },
    applicationMode: {
      type: String,
      enum: ["manual", "semi-automatic"],
      default: "manual"
    },
    submissionStatus: {
      type: String,
      enum: ["draft", "scheduled", "submitted"],
      default: "submitted"
    },
    reviewConfirmed: { type: Boolean, default: false },
    reviewedAt: { type: Date },
    scheduledFor: { type: Date },
    submittedAt: { type: Date },
    simulatedDelaySeconds: { type: Number, default: 0 },
    dailyLimitAtSubmission: { type: Number, default: 0 },
    toneUsed: { type: String, default: "professional" },
    externalSubmission: {
      attempted: { type: Boolean, default: false },
      submitted: { type: Boolean, default: false },
      provider: { type: String, default: "unknown" },
      sourceLink: { type: String, default: "" },
      externalApplicationId: { type: String, default: "" },
      message: { type: String, default: "" },
      attemptedAt: { type: Date }
    }
  },
  { timestamps: true }
);

applicationSchema.index({ user: 1, jobId: 1 }, { unique: true });

const Application = mongoose.model("Application", applicationSchema);

export default Application;
