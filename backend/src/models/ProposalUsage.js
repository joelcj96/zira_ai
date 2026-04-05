import mongoose from "mongoose";

const proposalUsageSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    dayKey: { type: String, required: true },
    count: { type: Number, default: 0 }
  },
  { timestamps: true }
);

proposalUsageSchema.index({ user: 1, dayKey: 1 }, { unique: true });

export default mongoose.model("ProposalUsage", proposalUsageSchema);
