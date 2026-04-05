import { submitGreenhouseApplication } from "./greenhouseApplyAdapter.js";
import { submitLeverApplication } from "./leverApplyAdapter.js";
import { submitAshbyApplication } from "./ashbyApplyAdapter.js";
import { submitSmartRecruitersApplication } from "./smartrecruitersApplyAdapter.js";

const TRUE_SET = new Set(["1", "true", "yes", "on"]);

const toBool = (value, fallback = false) => {
  if (value === undefined || value === null) return fallback;
  return TRUE_SET.has(String(value).trim().toLowerCase());
};

const getHostname = (url) => {
  try {
    return new URL(String(url || "")).hostname.toLowerCase();
  } catch {
    return "";
  }
};

export const detectApplyProvider = (sourceLink = "") => {
  const host = getHostname(sourceLink);
  if (!host) return "unknown";
  if (host.includes("linkedin")) return "linkedin";
  if (host.includes("indeed")) return "indeed";
  if (host.includes("greenhouse")) return "greenhouse";
  if (host.includes("lever")) return "lever";
  if (host.includes("ashby")) return "ashby";
  if (host.includes("smartrecruiters")) return "smartrecruiters";
  if (host.includes("workday")) return "workday";
  return "generic";
};

export const submitExternalApplication = async ({
  user,
  application,
  sourceLink,
  proposalText,
  mode
}) => {
  const provider = detectApplyProvider(sourceLink);
  const enabled = toBool(process.env.EXTERNAL_APPLY_ENABLED, false);
  const webhookUrl = String(process.env.EXTERNAL_APPLY_WEBHOOK_URL || "").trim();
  const timeoutMs = Math.max(2000, Math.min(Number(process.env.EXTERNAL_APPLY_TIMEOUT_MS) || 15000, 60000));

  if (!enabled) {
    return {
      attempted: false,
      submitted: false,
      provider,
      message: "External apply is disabled in server configuration."
    };
  }

  if (mode === "semi-automatic") {
    return {
      attempted: false,
      submitted: false,
      provider,
      message: "Application is scheduled. External submission will run when processed."
    };
  }

  if (!sourceLink) {
    return {
      attempted: false,
      submitted: false,
      provider,
      message: "No source link is attached to this job, so external submission cannot run."
    };
  }

  if (provider === "linkedin") {
    return {
      attempted: false,
      submitted: false,
      provider: "linkedin",
      message: "LinkedIn does not provide a public application API. Your application is tracked in Zira. Use the job source link to apply manually on LinkedIn."
    };
  }

  if (provider === "greenhouse") {
    return submitGreenhouseApplication({
      user,
      application,
      sourceLink,
      proposalText,
      timeoutMs
    });
  }

  if (provider === "lever") {
    return submitLeverApplication({
      user,
      application,
      sourceLink,
      proposalText,
      timeoutMs
    });
  }

  if (provider === "ashby") {
    return submitAshbyApplication({
      user,
      application,
      sourceLink,
      proposalText,
      timeoutMs
    });
  }

  if (provider === "smartrecruiters") {
    return submitSmartRecruitersApplication({
      user,
      application,
      sourceLink,
      proposalText,
      timeoutMs
    });
  }

  if (!webhookUrl) {
    return {
      attempted: false,
      submitted: false,
      provider,
      message: "External apply webhook is not configured."
    };
  }

  const payload = {
    provider,
    sourceLink,
    user: {
      id: String(user?._id || ""),
      name: user?.name || "",
      email: user?.email || ""
    },
    application: {
      id: String(application?._id || ""),
      jobId: application?.jobId || "",
      title: application?.title || "",
      company: application?.company || "",
      jobDescription: application?.jobDescription || "",
      proposalText: proposalText || application?.proposalText || "",
      submittedAt: application?.submittedAt || new Date()
    }
  };

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: abortController.signal
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      return {
        attempted: true,
        submitted: false,
        provider,
        message:
          data?.message ||
          `External apply webhook returned ${response.status}.`,
        externalApplicationId: data?.externalApplicationId || null
      };
    }

    return {
      attempted: true,
      submitted: data?.submitted !== false,
      provider,
      message:
        data?.message ||
        "External application submission request accepted.",
      externalApplicationId: data?.externalApplicationId || data?.id || null
    };
  } catch (error) {
    return {
      attempted: true,
      submitted: false,
      provider,
      message: `External submission failed: ${error.message || "unknown error"}`
    };
  } finally {
    clearTimeout(timeout);
  }
};
