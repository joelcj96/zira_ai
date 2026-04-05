import "./polyfill.js";
import { connectDB } from "../src/config/db.js";
import { ensureAdminUser } from "../src/scripts/ensureAdminUser.js";
import app from "../src/app.js";

let initialized = false;

const initialize = async () => {
  await connectDB();
  if (!initialized) {
    initialized = true;
    await ensureAdminUser().catch((err) =>
      console.error("ensureAdminUser error:", err?.message || err)
    );
  }
};

// Initiate at module load — Mongoose buffers queries until connected.
const initPromise = initialize().catch((err) =>
  console.error("MongoDB connection error:", err)
);

const handler = async (req, res) => {
  await initPromise.catch(() => {});
  return app(req, res);
};

export default handler;
