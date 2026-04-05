import Notification from "../models/Notification.js";

// Helper to create notifications
export const createNotification = async (userId, notificationData) => {
  try {
    const notification = await Notification.create({
      user: userId,
      type: notificationData.type || "system",
      title: notificationData.title,
      message: notificationData.message,
      icon: notificationData.icon || "bell",
      color: notificationData.color || "accent",
      actionUrl: notificationData.actionUrl || null,
      reference: notificationData.reference || {},
      dismissAt: notificationData.dismissAt || null
    });
    return notification;
  } catch (error) {
    console.error("Failed to create notification:", error);
    return null;
  }
};

// Create job match notifications
export const notifyJobMatches = async (userId, job) => {
  return createNotification(userId, {
    type: "job_match",
    title: "New Job Alert 🎯",
    message: `${job.title} at ${job.company} might be a great fit for you!`,
    icon: "briefcase",
    color: "accent",
    actionUrl: `/jobs/${job.id}`,
    reference: { jobId: job.id, companyName: job.company }
  });
};

// Create application submitted notification
export const notifyApplicationSubmitted = async (userId, application) => {
  return createNotification(userId, {
    type: "application_submitted",
    title: "Application Sent ✓",
    message: `Your application for ${application.title} at ${application.company} has been submitted.`,
    icon: "check",
    color: "ok",
    actionUrl: `/applications`,
    reference: { applicationId: application._id, companyName: application.company }
  });
};

// Create response received notification (mock)
export const notifyResponseReceived = async (userId, application) => {
  const status = application.status?.toLowerCase() || "pending";
  const statusEmoji = status === "accepted" ? "🎉" : status === "rejected" ? "👋" : "📋";
  const statusText = status === "accepted" ? "Accepted" : status === "rejected" ? "Rejected" : "Reviewed";

  return createNotification(userId, {
    type: "response_received",
    title: `Response Received ${statusEmoji}`,
    message: `${application.company} has ${statusText.toLowerCase()} your application for ${application.title}.`,
    icon: status === "accepted" ? "star" : status === "rejected" ? "alert" : "info",
    color: status === "accepted" ? "ok" : status === "rejected" ? "bad" : "accent",
    actionUrl: `/applications`,
    reference: { applicationId: application._id, companyName: application.company },
    dismissAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Dismiss after 7 days
  });
};

// Create profile update notification
export const notifyProfileUpdate = async (userId) => {
  return createNotification(userId, {
    type: "profile_update",
    title: "Profile Completed 🎨",
    message: "Your profile is now more complete. This helps us find better job matches!",
    icon: "info",
    color: "accent",
    actionUrl: `/settings`
  });
};

export default {
  createNotification,
  notifyJobMatches,
  notifyApplicationSubmitted,
  notifyResponseReceived,
  notifyProfileUpdate
};
