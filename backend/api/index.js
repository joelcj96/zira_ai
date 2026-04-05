import "./polyfill.js";
import { connectDB } from "../src/config/db.js";
import app from "../src/app.js";

// Initiate DB connection once per container. Express/Mongoose will handle
// buffering — requests respond immediately, DB queries execute once connected.
connectDB().catch((err) => console.error("MongoDB connection error:", err));

export default app;
