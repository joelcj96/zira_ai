import ActivityLog from "../models/ActivityLog.js";

export const logUserActivity = async ({ userId, actionType, message, metadata = {} }) => {
  if (!userId || !actionType || !message) {
    return null;
  }

  return ActivityLog.create({
    user: userId,
    actionType,
    message,
    metadata
  });
};
