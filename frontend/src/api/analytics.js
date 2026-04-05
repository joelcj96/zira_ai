import { api } from "./client";

const STORAGE_PREFIX = "zira_ai_conversion_event:";
const LEGACY_STORAGE_PREFIX = "agentcj_conversion_event:";

const hasTrackedInSession = (key) => {
  if (typeof window === "undefined" || !key) return false;
  try {
    return (
      sessionStorage.getItem(`${STORAGE_PREFIX}${key}`) === "1" ||
      sessionStorage.getItem(`${LEGACY_STORAGE_PREFIX}${key}`) === "1"
    );
  } catch {
    return false;
  }
};

const markTrackedInSession = (key) => {
  if (typeof window === "undefined" || !key) return;
  try {
    sessionStorage.setItem(`${STORAGE_PREFIX}${key}`, "1");
    sessionStorage.removeItem(`${LEGACY_STORAGE_PREFIX}${key}`);
  } catch {}
};

export const trackConversionEvent = async ({
  eventType,
  surface,
  feature = "",
  metadata = {},
  dedupeKey = ""
}) => {
  if (!eventType || !surface) return;
  if (dedupeKey && hasTrackedInSession(dedupeKey)) return;

  try {
    await api.post("/analytics/conversion-events", {
      eventType,
      surface,
      feature,
      metadata,
      uniqueKey: dedupeKey
    });
    if (dedupeKey) {
      markTrackedInSession(dedupeKey);
    }
  } catch {
    // Analytics should never block the main UX flow.
  }
};