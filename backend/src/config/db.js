import mongoose from "mongoose";

export const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("MONGO_URI (or MONGODB_URI) is missing in environment variables");
  }

  await mongoose.connect(mongoUri, {
    autoIndex: false,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 30000,
    bufferCommands: true,
  });
  console.log("MongoDB connected");
};
