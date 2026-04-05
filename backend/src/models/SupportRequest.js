import mongoose from "mongoose";

const supportRequestSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    requesterName: { type: String, required: true, trim: true },
    requesterEmail: { type: String, required: true, trim: true },
    subject: { type: String, required: true, trim: true, maxlength: 160 },
    message: { type: String, required: true, trim: true, maxlength: 4000 },
    status: {
      type: String,
      enum: ["open", "reviewed", "closed"],
      default: "open"
    }
  },
  { timestamps: true }
);

supportRequestSchema.index({ user: 1, createdAt: -1 });
supportRequestSchema.index({ status: 1, createdAt: -1 });

const SupportRequest = mongoose.model("SupportRequest", supportRequestSchema);

export default SupportRequest;