import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401);
    return next(new Error("Not authorized, token missing"));
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select("-password");

    if (!req.user) {
      res.status(401);
      return next(new Error("Not authorized, user not found"));
    }

    if (req.user.isBanned) {
      res.status(403);
      return next(new Error("Account is banned. Contact support."));
    }

    const oneHourAgo = Date.now() - 1000 * 60 * 60;
    if (!req.user.lastActiveAt || req.user.lastActiveAt.getTime() < oneHourAgo) {
      User.updateOne({ _id: req.user._id }, { $set: { lastActiveAt: new Date() } }).catch(() => {});
    }

    next();
  } catch (error) {
    res.status(401);
    next(new Error("Not authorized, invalid token"));
  }
};

export const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    res.status(403);
    return next(new Error("Admin access required"));
  }
  next();
};
