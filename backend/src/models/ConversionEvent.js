import mongoose from "mongoose";

const conversionEventSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    eventType: {
      type: String,
      required: true,
      enum: ["lock_impression", "upgrade_cta_click", "checkout_started", "upgrade_completed"],
      index: true
    },
    surface: { type: String, required: true, trim: true, index: true },
    feature: { type: String, default: "", trim: true, index: true },
    planAtEvent: { type: String, enum: ["free", "pro"], required: true, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

conversionEventSchema.index({ createdAt: -1 });

export default mongoose.model("ConversionEvent", conversionEventSchema);