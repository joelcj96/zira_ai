import "./polyfill.js";
import { connectDB } from "../src/config/db.js";
import app from "../src/app.js";

// Fire DB connection immediately at module load.
// Mongoose buffers all model operations until the connection is established,
// so requests don't need to wait — the first real DB query will just queue.
connectDB().catch((err) => console.error("MongoDB connection error:", err));

export default app;
