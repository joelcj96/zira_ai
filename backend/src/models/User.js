import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String },
    authProvider: { type: String, enum: ["email", "google"], default: "email" },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    profileImage: { type: String, default: "" },
    phone: { type: String, default: "" },
    linkedinUrl: { type: String, default: "" },
    website: { type: String, default: "" },
    isBanned: { type: Boolean, default: false },
    lastActiveAt: { type: Date, default: Date.now },
    skills: { type: [String], default: [] },
    experience: { type: String, default: "" },
    preferences: {
      titles: { type: [String], default: [] },
      locations: { type: [String], default: [] },
      remoteOnly: { type: Boolean, default: false },
      salaryMin: { type: Number, default: 0 },
      language: {
        type: String,
        enum: ["en", "fr", "es"],
        default: "en"
      }
    },
    smartApplySettings: {
      defaultMode: {
        type: String,
        enum: ["manual", "semi-automatic"],
        default: "manual"
      },
      defaultDelaySeconds: { type: Number, default: 45 },
      defaultDailyLimit: { type: Number, default: 5 },
      requireReviewConfirmation: { type: Boolean, default: true },
      responsibleAutomation: {
        enabled: { type: Boolean, default: true },
        minDelaySeconds: { type: Number, default: 20 },
        maxDelaySeconds: { type: Number, default: 90 },
        maxApplicationsPerHour: { type: Number, default: 4 },
        maxApplicationsPerDay: { type: Number, default: 12 },
        activeHoursStart: { type: Number, default: 8 },
        activeHoursEnd: { type: Number, default: 20 },
        minJobMatchScore: { type: Number, default: 55 },
        enforceProposalDiversity: { type: Boolean, default: true },
        diversitySimilarityThreshold: { type: Number, default: 0.9 }
      },
      safetyControls: {
        safetyMode: { type: Boolean, default: true },
        maxApplicationsPerDay: { type: Number, default: 8 },
        delaySpeed: {
          type: String,
          enum: ["slow", "normal", "fast"],
          default: "slow"
        }
      }
    },
    subscriptionPlan: {
      type: String,
      enum: ["free", "pro"],
      default: "free"
    },
    subscriptionStatus: {
      type: String,
      enum: ["inactive", "active", "past_due", "canceled", "trialing"],
      default: "inactive"
    },
    stripeCustomerId: { type: String, default: "" },
    stripeSubscriptionId: { type: String, default: "" },
    stripeCurrentPeriodEnd: { type: Date },
    stripeCancelAtPeriodEnd: { type: Boolean, default: false },
    stripeLastSyncAt: { type: Date },
    credits: {
      type: Number,
      default: 16,
      min: 0
    },
    totalCreditsEarned: {
      type: Number,
      default: 16
    },
    totalCreditsSpent: {
      type: Number,
      default: 0
    },
    profileData: {
      skills: { type: [String], default: [] },
      workExperiences: {
        type: [
          {
            role: { type: String, default: "" },
            company: { type: String, default: "" },
            description: { type: String, default: "" }
          }
        ],
        default: []
      },
      education: {
        type: [
          {
            institution: { type: String, default: "" },
            degree: { type: String, default: "" },
            description: { type: String, default: "" }
          }
        ],
        default: []
      },
      projects: {
        type: [
          {
            name: { type: String, default: "" },
            description: { type: String, default: "" },
            techStack: { type: [String], default: [] }
          }
        ],
        default: []
      },
      cvRawText: { type: String, default: "" },
      coverLetterText: { type: String, default: "" },
      cvFileName: { type: String, default: "" },
      cvMimeType: { type: String, default: "" },
      cvLastUploadedAt: { type: Date }
    }
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

export default User;
