import ApplicationTracker from "../models/ApplicationTracker.js";

/**
 * Get or create today's application tracker for a user
 */
export const getOrCreateDailyTracker = async (userId, dailyLimit = 10) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let tracker = await ApplicationTracker.findOne({
      user: userId,
      date: today
    });

    if (!tracker) {
      tracker = await ApplicationTracker.create({
        user: userId,
        date: today,
        dailyLimit,
        applicationCount: 0,
        applicationsInQueue: 0,
        lastApplicationAt: null
      });
    }

    return tracker;
  } catch (error) {
    console.error("Error getting/creating daily tracker:", error);
    throw error;
  }
};

/**
 * Check if user can apply based on daily limit
 */
export const canApplyToday = async (userId, dailyLimit = 10) => {
  try {
    const tracker = await getOrCreateDailyTracker(userId, dailyLimit);

    const canApply = tracker.applicationCount < tracker.dailyLimit;
    const remaining = Math.max(0, tracker.dailyLimit - tracker.applicationCount);

    return {
      canApply,
      currentCount: tracker.applicationCount,
      limit: tracker.dailyLimit,
      remaining,
      tracker
    };
  } catch (error) {
    console.error("Error checking daily application limit:", error);
    throw error;
  }
};

/**
 * Check if enough time has passed since last application (prevent rapid repeated actions)
 */
export const canApplyWithoutThrottle = async (userId, minDelayMs = 2000) => {
  try {
    const tracker = await getOrCreateDailyTracker(userId);

    if (!tracker.lastApplicationAt) {
      return { canApply: true, waitMs: 0 };
    }

    const timeSinceLastApp = Date.now() - tracker.lastApplicationAt.getTime();
    const canApply = timeSinceLastApp >= minDelayMs;
    const waitMs = Math.max(0, minDelayMs - timeSinceLastApp);

    return {
      canApply,
      waitMs,
      timeSinceLastApp
    };
  } catch (error) {
    console.error("Error checking throttle:", error);
    throw error;
  }
};

/**
 * Generate random delay between min and max seconds
 * Simulates human behavior
 */
export const generateHumanDelay = (minSeconds = 2, maxSeconds = 5) => {
  const range = maxSeconds - minSeconds;
  const random = Math.random();
  const delaySeconds = minSeconds + random * range;
  const delayMs = Math.floor(delaySeconds * 1000);

  return {
    delaySeconds: delaySeconds.toFixed(2),
    delayMs,
    humanized: `${delaySeconds.toFixed(1)}s`
  };
};

/**
 * Record an application attempt
 */
export const recordApplication = async (userId, dailyLimit = 10) => {
  try {
    const tracker = await getOrCreateDailyTracker(userId, dailyLimit);

    // Increment count and update last application time
    tracker.applicationCount += 1;
    tracker.lastApplicationAt = new Date();
    await tracker.save();

    return tracker;
  } catch (error) {
    console.error("Error recording application:", error);
    throw error;
  }
};

/**
 * Process semi-automatic application (with delay)
 * Returns promise that resolves after delay
 */
export const applySemiAutomatically = async (
  userId,
  minDelaySeconds = 2,
  maxDelaySeconds = 5
) => {
  try {
    // Check throttle first
    const throttleCheck = await canApplyWithoutThrottle(userId, 2000);
    if (!throttleCheck.canApply) {
      throw new Error(
        `Please wait ${Math.ceil(throttleCheck.waitMs / 1000)}s before applying again`
      );
    }

    // Generate delay
    const delay = generateHumanDelay(minDelaySeconds, maxDelaySeconds);

    // Return delay info
    return {
      willWaitMs: delay.delayMs,
      willWaitSeconds: delay.delaySeconds,
      humanized: delay.humanized,
      apply: () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({ applied: true, at: new Date() });
          }, delay.delayMs);
        })
    };
  } catch (error) {
    console.error("Error in semi-automatic apply:", error);
    throw error;
  }
};

/**
 * Get application summary for user
 */
export const getApplicationSummary = async (userId) => {
  try {
    const tracker = await getOrCreateDailyTracker(userId);

    return {
      appliedToday: tracker.applicationCount,
      dailyLimit: tracker.dailyLimit,
      remaining: Math.max(0, tracker.dailyLimit - tracker.applicationCount),
      percentageUsed: (
        (tracker.applicationCount / tracker.dailyLimit) * 100
      ).toFixed(1),
      lastApplicationAt: tracker.lastApplicationAt,
      appliedThisSession: tracker.applicationsInQueue
    };
  } catch (error) {
    console.error("Error getting application summary:", error);
    throw error;
  }
};

/**
 * Reset daily tracker (call at midnight or on demand)
 */
export const resetDailyTracker = async (userId) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tracker = await ApplicationTracker.findOneAndUpdate(
      { user: userId, date: today },
      {
        applicationCount: 0,
        applicationsInQueue: 0,
        lastApplicationAt: null,
        lastResetAt: new Date()
      },
      { new: true }
    );

    return tracker;
  } catch (error) {
    console.error("Error resetting daily tracker:", error);
    throw error;
  }
};
