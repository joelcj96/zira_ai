import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import Application from "../models/Application.js";

dotenv.config();

let _indexWarning = null;

export const getIndexWarning = () => _indexWarning;

export const ensureIndexes = async () => {
  const duplicates = await Application.aggregate([
    {
      $group: {
        _id: { user: "$user", jobId: "$jobId" },
        count: { $sum: 1 },
        ids: { $push: "$_id" }
      }
    },
    {
      $match: {
        count: { $gt: 1 }
      }
    }
  ]);

  if (duplicates.length > 0) {
    console.warn("Skipping unique application index creation because duplicates already exist.");
    duplicates.forEach((duplicate) => {
      console.warn(
        `Duplicate user/job pair: ${duplicate._id.user} / ${duplicate._id.jobId} (${duplicate.count} docs)`
      );
    });
    _indexWarning = {
      duplicateCount: duplicates.length,
      message: `Found ${duplicates.length} duplicate user/job application pair(s). Unique index was NOT created. Clean up duplicates and rerun to enable protection.`,
      detectedAt: new Date().toISOString()
    };
    return { created: false, reason: "duplicates-exist", duplicates: duplicates.length };
  }

  _indexWarning = null;

  await Application.collection.createIndex({ user: 1, jobId: 1 }, { unique: true, background: true });
  console.log("Ensured Application unique index on { user: 1, jobId: 1 }");
  return { created: true };
};

const run = async () => {
  try {
    await connectDB();
    await ensureIndexes();
    await mongoose.disconnect();
  } catch (error) {
    console.error("Failed to ensure indexes:", error.message);
    process.exit(1);
  }
};

if (process.argv[1] && process.argv[1].endsWith("ensureIndexes.js")) {
  run();
}
