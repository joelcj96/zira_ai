import mongoose from "mongoose";

const proposalHistorySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    jobId: {
      type: String,
      required: true
    },
    jobTitle: {
      type: String,
      required: true
    },
    generatedProposal: {
      type: String,
      required: true
    },
    tone: {
      type: String,
      enum: ["professional", "friendly", "confident"],
      default: "professional"
    },
    success: {
      type: Boolean,
      default: false,
      index: true
    },
    successReason: {
      type: String,
      enum: ["interview_secured", "great_fit", "strong_match", "good_effort", "learning"],
      default: null
    },
    userRating: {
      type: Number,
      min: 1,
      max: 5,
      default: null
    },
    userFeedback: {
      type: String,
      default: ""
    },
    // Extracted patterns for learning
    detectedTonePatterns: {
      sentimentScore: { type: Number, default: 0 }, // -1 to 1
      formality: { type: Number, default: 0.5 }, // 0=casual to 1=formal
      confidenceLevel: { type: Number, default: 0.5 }, // 0=humble to 1=confident
      personalityKeywords: { type: [String], default: [] }
    },
    structureAnalysis: {
      introductionStyle: { type: String, default: "" },
      bodyLength: { type: Number, default: 0 },
      callToActionStyle: { type: String, default: "" },
      keyPointsCount: { type: Number, default: 0 }
    },
    // Metadata for learning
    generationContext: {
      userSkillsCount: { type: Number, default: 0 },
      skillMatchPercentage: { type: Number, default: 0 },
      jobRequirementsCount: { type: Number, default: 0 }
    },
    usedAsContext: {
      type: Boolean,
      default: false
    },
    contextualReferenceCount: {
      type: Number,
      default: 0
    }
  },
  { timestamps: true }
);

// Index for efficient querying of successful proposals by user
proposalHistorySchema.index({ user: 1, success: 1, createdAt: -1 });

const ProposalHistory = mongoose.model("ProposalHistory", proposalHistorySchema);

export default ProposalHistory;
