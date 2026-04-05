const TRUE_SET = new Set(["1", "true", "yes", "on"]);

const toBool = (value, fallback = false) => {
  if (value === undefined || value === null) return fallback;
  return TRUE_SET.has(String(value).trim().toLowerCase());
};

const normalizeName = (name = "") => String(name || "").trim().replace(/\s+/g, " ");

const splitName = (name = "") => {
  const normalized = normalizeName(name);
  if (!normalized) {
    return { firstName: "Applicant", lastName: "" };
  }
  const parts = normalized.split(" ");
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.at(-1) || ""
  };
};

export const parseGreenhouseSourceLink = (sourceLink = "") => {
  try {
    const url = new URL(String(sourceLink || ""));
    const host = url.hostname.toLowerCase();
    if (!host.includes("greenhouse")) return null;

    const segments = url.pathname.split("/").filter(Boolean);

    let boardToken = url.searchParams.get("for") || "";
    let jobId = url.searchParams.get("gh_jid") || url.searchParams.get("token") || "";

    const jobsIndex = segments.indexOf("jobs");
    if (jobsIndex > 0 && !boardToken) {
      boardToken = segments[jobsIndex - 1] || "";
    }
    if (jobsIndex >= 0 && segments[jobsIndex + 1] && !jobId) {
      jobId = segments[jobsIndex + 1];
    }

    boardToken = String(boardToken || "").trim();
    jobId = String(jobId || "").trim();

    if (!boardToken || !jobId) return null;

    return {
      boardToken,
      jobId,
      apiUrl: `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs/${encodeURIComponent(jobId)}`
    };
  } catch {
    return null;
  }
};

// Field names where we know how to supply values from user profile
const KNOWN_FIELD_NAMES = new Set([
  "first_name", "last_name", "email", "phone",
  "cover_letter", "resume",
  "linkedin_profile", "linkedin_url", "linkedin",
  "website", "website_url", "portfolio_url", "portfolio"
]);

const fetchGreenhouseJobQuestions = async (parsed, timeoutMs) => {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), Math.min(timeoutMs, 8000));
  try {
    const response = await fetch(`${parsed.apiUrl}?questions=true`, {
      method: "GET",
      signal: abortController.signal
    });
    if (!response.ok) return null;
    const data = await response.json();
    return Array.isArray(data.questions) ? data.questions : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const buildFormDataFromQuestions = (questions, user, proposalText) => {
  const { firstName, lastName } = splitName(user?.name);
  const safeProposal = String(proposalText || "").trim();
  const cvText = String(user?.profileData?.cvRawText || "").trim();

  const formData = new FormData();
  const missingRequired = [];

  for (const question of questions) {
    const field = question.fields?.[0];
    if (!field) continue;
    const fieldName = String(field.name || "").toLowerCase();
    const required = Boolean(question.required);

    switch (fieldName) {
      case "first_name":
        formData.set("first_name", firstName || "Applicant");
        break;
      case "last_name":
        formData.set("last_name", lastName || "");
        break;
      case "email":
        if (user?.email) {
          formData.set("email", String(user.email).trim());
        } else if (required) {
          missingRequired.push("Email address");
        }
        break;
      case "phone": {
        const phone = String(user?.phone || process.env.GREENHOUSE_DEFAULT_PHONE || "").trim();
        if (phone) {
          formData.set("phone", phone);
        } else if (required) {
          missingRequired.push("Phone number (add it in Profile settings)");
        }
        break;
      }
      case "cover_letter":
        if (safeProposal) {
          formData.set("cover_letter", safeProposal);
        } else if (required) {
          missingRequired.push("Cover letter");
        }
        break;
      case "resume":
        if (cvText) {
          const blob = new Blob([cvText], { type: "text/plain" });
          formData.set("resume", blob, "resume.txt");
        } else if (required) {
          missingRequired.push("Resume/CV (upload your CV in Profile settings)");
        }
        break;
      case "linkedin_profile":
      case "linkedin_url":
      case "linkedin":
        if (user?.linkedinUrl) {
          formData.set(fieldName, String(user.linkedinUrl).trim());
        } else if (required) {
          missingRequired.push("LinkedIn profile URL (add it in Profile settings)");
        }
        break;
      case "website":
      case "website_url":
      case "portfolio_url":
      case "portfolio":
        if (user?.website) {
          formData.set(fieldName, String(user.website).trim());
        } else if (required) {
          missingRequired.push("Website/Portfolio URL (add it in Profile settings)");
        }
        break;
      default:
        // Unknown field — flag if required (custom employer question)
        if (required) {
          missingRequired.push(question.label || fieldName);
        }
        break;
    }
  }

  // Always ensure the identity fields are present (in case questions list omits them)
  if (!formData.get("first_name")) formData.set("first_name", firstName || "Applicant");
  if (!formData.get("last_name")) formData.set("last_name", lastName || "");
  if (!formData.get("email") && user?.email) formData.set("email", String(user.email).trim());

  return { formData, missingRequired };
};

const buildFallbackFormData = (user, proposalText) => {
  const { firstName, lastName } = splitName(user?.name);
  const phone = String(user?.phone || process.env.GREENHOUSE_DEFAULT_PHONE || "").trim();
  const safeProposal = String(proposalText || "").trim();
  const cvText = String(user?.profileData?.cvRawText || "").trim();

  const formData = new FormData();
  formData.set("first_name", firstName || "Applicant");
  formData.set("last_name", lastName || "");
  formData.set("email", String(user?.email || "").trim());
  if (phone) formData.set("phone", phone);
  if (safeProposal) formData.set("cover_letter", safeProposal);
  if (cvText) {
    const blob = new Blob([cvText], { type: "text/plain" });
    formData.set("resume", blob, "resume.txt");
  }
  return formData;
};

export const submitGreenhouseApplication = async ({
  user,
  application,
  sourceLink,
  proposalText,
  timeoutMs = 15000
}) => {
  const adapterEnabled = toBool(process.env.GREENHOUSE_DIRECT_APPLY_ENABLED, true);
  if (!adapterEnabled) {
    return {
      attempted: false,
      submitted: false,
      provider: "greenhouse",
      message: "Greenhouse direct apply adapter is disabled in server configuration."
    };
  }

  const parsed = parseGreenhouseSourceLink(sourceLink);
  if (!parsed) {
    return {
      attempted: true,
      submitted: false,
      provider: "greenhouse",
      message: "Could not parse Greenhouse board/job information from source link."
    };
  }

  if (!user?.email) {
    return {
      attempted: true,
      submitted: false,
      provider: "greenhouse",
      message: "User email is required for Greenhouse submission."
    };
  }

  const safeProposalText = String(proposalText || application?.proposalText || "").trim();

  // Fetch the job's required question schema first
  const questions = await fetchGreenhouseJobQuestions(parsed, timeoutMs);

  let formData;
  let missingRequired = [];

  if (questions && questions.length > 0) {
    ({ formData, missingRequired } = buildFormDataFromQuestions(questions, user, safeProposalText));
  } else {
    // Could not fetch questions — send best-effort payload
    formData = buildFallbackFormData(user, safeProposalText);
  }

  if (missingRequired.length > 0) {
    return {
      attempted: true,
      submitted: false,
      provider: "greenhouse",
      message: `Cannot submit: missing required fields — ${missingRequired.join("; ")}`,
      missingFields: missingRequired
    };
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    const response = await fetch(parsed.apiUrl, {
      method: "POST",
      body: formData,
      signal: abortController.signal
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      const providerMessage = data?.message || data?.error || data?.errors?.[0] || `Greenhouse returned ${response.status}.`;
      return {
        attempted: true,
        submitted: false,
        provider: "greenhouse",
        message: String(providerMessage),
        externalApplicationId: data?.id || data?.application_id || null
      };
    }

    return {
      attempted: true,
      submitted: true,
      provider: "greenhouse",
      message: data?.message || "Greenhouse submission accepted.",
      externalApplicationId: data?.id || data?.application_id || null
    };
  } catch (error) {
    return {
      attempted: true,
      submitted: false,
      provider: "greenhouse",
      message: `Greenhouse submission failed: ${error.message || "unknown error"}`
    };
  } finally {
    clearTimeout(timeout);
  }
};
