import bcrypt from "bcryptjs";
import User from "../models/User.js";

const DEFAULT_ADMIN_EMAIL = "joel@gmail.com";
const DEFAULT_ADMIN_PASSWORD = "joelantita1996";

export const ensureAdminUser = async () => {
  const adminEmail = (process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.warn("Skipping ensureAdminUser: ADMIN_EMAIL or ADMIN_PASSWORD missing");
    return;
  }

  const passwordHash = await bcrypt.hash(adminPassword, 10);
  let user = await User.findOne({ email: adminEmail });

  if (!user) {
    user = await User.create({
      name: "Joel Admin",
      email: adminEmail,
      password: passwordHash,
      authProvider: "email",
      role: "admin",
      isBanned: false,
      lastActiveAt: new Date()
    });

    console.log(`Admin user created: ${user.email}`);
    return;
  }

  user.role = "admin";
  user.isBanned = false;
  user.authProvider = "email";
  user.password = passwordHash;

  await user.save();
  console.log(`Admin user ensured: ${user.email}`);
};
