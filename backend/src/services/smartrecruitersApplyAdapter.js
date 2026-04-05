const TRUE_SET = new Set(["1", "true", "yes", "on"]);

const toBool = (value, fallback = false) => {
  if (value === undefined || value === null) return fallback;
  return TRUE_SET.has(String(value).trim().toLowerCase());
};

const normalizeName = (name = "") => String(name || "").trim().replace(/\s+/g, " ");

const splitName = (name = "") => {
  const normalized = normalizeName(name);
  if (!normalized) return { firstName: "Applicant", lastName: "" };
  const parts = normalized.split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1) || "" };
};

/**
 * Parse a SmartRecruiters job URL.
 *
 * Supported formats:
 *   https://jobs.smartrecruiters.com/{company}/{jobId}
 *   https://careers.{company}.com/jobs/{jobId}  (embedded SR page)
 */
export const parseSmartRecruitersSourceLink = (sourceLink = "") => {
  try {
    const url = new URL(String(sourceLink || ""));
    const host = url.hostname.toLowerCase();
    if (!host.includes("smartrecruiters")) return null;

    const segments = url.pathname.split("/").filter(Boolean);

    // https://jobs.smartrecruiters.com/{company}/{jobId}
    if (host.startsWith("jobs.smartrecruiters")) {
      if (segments.length < 2) return null;
      const company = segments[0];
      const jobId = segments[1];
      if (!company || !jobId) return null;
      return {
        company,
        jobId,
        apiUrl: `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings/${encodeURIComponent(jobId)}/candidates`
      };
    }

    return null;
  } catch {
    return null;
  }
};

export const submitSmartRecruitersApplication = async ({
  user,
  application,
  sourceLink,
  proposalText,
  timeoutMs = 15000
}) => {
  const adapterEnabled = toBool(process.env.SMARTRECRUITERS_DIRECT_APPLY_ENABLED, true);
  if (!adapterEnabled) {
    return {
      attempted: false,
      submitted: false,
      provider: "smartrecruiters",
      message: "SmartRecruiters direct apply adapter is disabled in server configuration."
    };
  }

  const parsed = parseSmartRecruitersSourceLink(sourceLink);
  if (!parsed) {
    return {
      attempted: true,
      submitted: false,
      provider: "smartrecruiters",
      message: "Could not parse SmartRecruiters company/job information from source link."
    };
  }

  if (!user?.name || !user?.email) {
    return {
      attempted: true,
      submitted: false,
      provider: "smartrecruiters",
      message: "Name and email are required for SmartRecruiters submission."
    };
  }

  const { firstName, lastName } = splitName(user.name);
  const safeProposal = String(proposalText || application?.proposalText || "").trim();
  const safePhone = String(user?.phone || "").trim();

  const payload = {
    firstName: firstName || "Applicant",
    lastName: lastName || "",
    email: String(user.email).trim(),
    ...(safePhone ? { phoneNumber: safePhone } : {}),
    ...(safeProposal
      ? { coverLetter: { text: safeProposal, confidentiality: "all" } }
      : {}),
    ...(user?.website ? { web: { url: String(user.website).trim(), label: "Portfolio" } } : {})
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
    try { data = await response.json(); } catch { data = null; }

    if (!response.ok) {
      const providerMessage =
        data?.message ||
        data?.error ||
        (Array.isArray(data?.errors) ? data.errors.map((e) => e.message).join("; ") : null) ||
        `SmartRecruiters returned ${response.status}.`;

      return {
        attempted: true,
        submitted: false,
        provider: "smartrecruiters",
        message: String(providerMessage),
        externalApplicationId: data?.id || null
      };
    }

    return {
      attempted: true,
      submitted: true,
      provider: "smartrecruiters",
      message: "Application submitted via SmartRecruiters.",
      externalApplicationId: data?.id || null
    };
  } catch (error) {
    return {
      attempted: true,
      submitted: false,
      provider: "smartrecruiters",
      message: `SmartRecruiters submission failed: ${error.message || "unknown error"}`
    };
  } finally {
    clearTimeout(timeout);
  }
};
