import "./polyfill.js";
import { connectDB } from "../src/config/db.js";
import app from "../src/app.js";

// Cache the connection promise so we only connect once per container lifetime.
let connectionPromise = null;

const handler = async (req, res) => {
  if (!connectionPromise) {
    connectionPromise = connectDB().catch((err) => {
      console.error("MongoDB connection error:", err);
      connectionPromise = null; // allow retry on next request
      throw err;
    });
  }
  await connectionPromise;
  return app(req, res);
};

export default handler;
