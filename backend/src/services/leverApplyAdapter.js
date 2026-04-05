const TRUE_SET = new Set(["1", "true", "yes", "on"]);

const toBool = (value, fallback = false) => {
  if (value === undefined || value === null) return fallback;
  return TRUE_SET.has(String(value).trim().toLowerCase());
};

/**
 * Parse a Lever job URL into company slug, job ID, and API endpoint.
 *
 * Supported formats:
 *   https://jobs.lever.co/{company}/{jobId}
 *   https://jobs.lever.co/{company}/{jobId}/apply
 */
export const parseLeverSourceLink = (sourceLink = "") => {
  try {
    const url = new URL(String(sourceLink || ""));
    const host = url.hostname.toLowerCase();
    if (!host.includes("lever")) return null;

    const segments = url.pathname.split("/").filter(Boolean);
    // Expected path: /{company}/{jobId}[/apply]
    if (segments.length < 2) return null;

    const company = segments[0];
    const jobId = segments[1];

    if (!company || !jobId) return null;

    return {
      company,
      jobId,
      apiUrl: `https://api.lever.co/v0/postings/${encodeURIComponent(company)}/${encodeURIComponent(jobId)}/apply`
    };
  } catch {
    return null;
  }
};

export const submitLeverApplication = async ({
  user,
  application,
  sourceLink,
  proposalText,
  timeoutMs = 15000
}) => {
  const adapterEnabled = toBool(process.env.LEVER_DIRECT_APPLY_ENABLED, true);
  if (!adapterEnabled) {
    return {
      attempted: false,
      submitted: false,
      provider: "lever",
      message: "Lever direct apply adapter is disabled in server configuration."
    };
  }

  const parsed = parseLeverSourceLink(sourceLink);
  if (!parsed) {
    return {
      attempted: true,
      submitted: false,
      provider: "lever",
      message: "Could not parse Lever company/job information from source link."
    };
  }

  if (!user?.name || !user?.email) {
    return {
      attempted: true,
      submitted: false,
      provider: "lever",
      message: "Name and email are required for Lever submission."
    };
  }

  const safeComment = String(proposalText || application?.proposalText || "").trim();
  const safePhone = String(user?.phone || "").trim();

  const payload = {
    name: String(user.name || "").trim(),
    email: String(user.email || "").trim(),
    org: parsed.company,
    ...(safePhone ? { phone: safePhone } : {}),
    ...(safeComment ? { comments: safeComment } : {})
  };

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    const response = await fetch(parsed.apiUrl, {
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
      const providerMessage =
        data?.message || data?.error || data?.errors?.[0] || `Lever returned ${response.status}.`;
      return {
        attempted: true,
        submitted: false,
        provider: "lever",
        message: String(providerMessage),
        externalApplicationId: data?.applicationId || null
      };
    }

    return {
      attempted: true,
      submitted: true,
      provider: "lever",
      message: data?.message || "Lever submission accepted.",
      externalApplicationId: data?.applicationId || null
    };
  } catch (error) {
    return {
      attempted: true,
      submitted: false,
      provider: "lever",
      message: `Lever submission failed: ${error.message || "unknown error"}`
    };
  } finally {
    clearTimeout(timeout);
  }
};
