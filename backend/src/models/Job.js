import mongoose from "mongoose";

const jobSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    company: { type: String, required: true },
    location: { type: String, default: "Remote" },
    locationType: {
      type: String,
      enum: ["remote", "on-site"],
      default: "remote"
    },
    jobType: {
      type: String,
      enum: ["freelance", "full-time"],
      default: "full-time"
    },
    salary: { type: Number, default: 0 },
    budgetRange: {
      type: String,
      enum: ["low", "mid", "high"],
      default: "low"
    },
    postedAt: { type: Date },
    sourceLink: { type: String, default: null },
    description: { type: String, default: "" },
    skillsRequired: { type: [String], default: [] },
    externalSourceId: { type: String, default: null },
    externalSourceName: { type: String, default: null },
    sourceTag: {
      type: String,
      enum: ["Feed", "User Added"],
      required: true,
      default: "Feed"
    },
    createdByUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true
    }
  },
  { timestamps: true }
);

jobSchema.index({ sourceTag: 1, createdByUser: 1, updatedAt: -1 });

const Job = mongoose.model("Job", jobSchema);

export default Job;
