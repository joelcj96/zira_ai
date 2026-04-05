import "./polyfill.js";
import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import app from "../src/app.js";

let isConnected = false;

const handler = async (req, res) => {
  if (!isConnected || mongoose.connection.readyState !== 1) {
    await connectDB();
    isConnected = true;
  }
  return app(req, res);
};

export default handler;
