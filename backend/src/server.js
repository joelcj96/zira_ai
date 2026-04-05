import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import { ensureIndexes } from "./scripts/ensureIndexes.js";
import { ensureAdminUser } from "./scripts/ensureAdminUser.js";
import app from "./app.js";

dotenv.config();

const port = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();
    await ensureIndexes();
    await ensureAdminUser();
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
};

startServer();
