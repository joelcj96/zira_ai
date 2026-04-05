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
 * Parse an Ashby job URL.
 *
 * Supported formats:
 *   https://jobs.ashbyhq.com/{company}/{jobPostingId}
 *   https://jobs.ashbyhq.com/{company}/{jobPostingId}/application
 *   https://{company}.ashbyhq.com/jobs/{jobPostingId}
 */
export const parseAshbySourceLink = (sourceLink = "") => {
  try {
    const url = new URL(String(sourceLink || ""));
    const host = url.hostname.toLowerCase();
    if (!host.includes("ashby")) return null;

    const segments = url.pathname.split("/").filter(Boolean);

    // https://jobs.ashbyhq.com/{company}/{jobPostingId}[/application]
    if (host.startsWith("jobs.ashby")) {
      if (segments.length < 2) return null;
      const company = segments[0];
      const jobPostingId = segments[1];
      if (!company || !jobPostingId) return null;
      return { company, jobPostingId };
    }

    // https://{company}.ashbyhq.com/jobs/{jobPostingId}
    const subdomain = host.split(".")[0];
    const jobsIndex = segments.indexOf("jobs");
    if (jobsIndex >= 0 && segments[jobsIndex + 1]) {
      return { company: subdomain, jobPostingId: segments[jobsIndex + 1] };
    }

    return null;
  } catch {
    return null;
  }
};

const ASHBY_FORM_INFO_URL = "https://api.ashbyhq.com/applicationForm.info";
const ASHBY_SUBMIT_URL = "https://api.ashbyhq.com/applicationForm.submit";

export const submitAshbyApplication = async ({
  user,
  application,
  sourceLink,
  proposalText,
  timeoutMs = 15000
}) => {
  const adapterEnabled = toBool(process.env.ASHBY_DIRECT_APPLY_ENABLED, true);
  if (!adapterEnabled) {
    return {
      attempted: false,
      submitted: false,
      provider: "ashby",
      message: "Ashby direct apply adapter is disabled in server configuration."
    };
  }

  const parsed = parseAshbySourceLink(sourceLink);
  if (!parsed) {
    return {
      attempted: true,
      submitted: false,
      provider: "ashby",
      message: "Could not parse Ashby company/job information from source link."
    };
  }

  if (!user?.name || !user?.email) {
    return {
      attempted: true,
      submitted: false,
      provider: "ashby",
      message: "Name and email are required for Ashby submission."
    };
  }

  const { firstName, lastName } = splitName(user.name);
  const safeProposal = String(proposalText || application?.proposalText || "").trim();
  const safePhone = String(user?.phone || "").trim();
  const cvText = String(user?.profileData?.cvRawText || "").trim();

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    // Step 1 — fetch the form schema (optional: we proceed even if this fails)
    let formFields = null;
    try {
      const infoResponse = await fetch(ASHBY_FORM_INFO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobPostingId: parsed.jobPostingId }),
        signal: abortController.signal
      });
      if (infoResponse.ok) {
        const infoData = await infoResponse.json();
        formFields = infoData?.results?.applicationFormDefinition?.sections
          ?.flatMap((section) => section.fields || []) || null;
      }
    } catch {
      // Continue with best-effort payload even if schema fetch fails
    }

    // Step 2 — build field values
    // Standard Ashby system fields use the path pattern _systemfield_*
    const fieldValues = [
      { path: "_systemfield_name", value: `${firstName}${lastName ? ` ${lastName}` : ""}` },
      { path: "_systemfield_email", value: String(user.email).trim() }
    ];
    if (safePhone) fieldValues.push({ path: "_systemfield_phone", value: safePhone });
    if (safeProposal) fieldValues.push({ path: "_systemfield_coverLetter", value: safeProposal });
    if (cvText) fieldValues.push({ path: "_systemfield_resume", value: cvText });
    if (user?.linkedinUrl) fieldValues.push({ path: "_systemfield_linkedin", value: String(user.linkedinUrl).trim() });
    if (user?.website) fieldValues.push({ path: "_systemfield_website", value: String(user.website).trim() });

    // If we received a form schema, also attempt to map any custom fields we have data for
    if (Array.isArray(formFields)) {
      for (const field of formFields) {
        const path = String(field?.path || "").toLowerCase();
        const alreadyAdded = fieldValues.some((fv) => fv.path === field?.path);
        if (alreadyAdded) continue;

        if (path.includes("linkedin") && user?.linkedinUrl) {
          fieldValues.push({ path: field.path, value: String(user.linkedinUrl).trim() });
        } else if ((path.includes("website") || path.includes("portfolio")) && user?.website) {
          fieldValues.push({ path: field.path, value: String(user.website).trim() });
        } else if (path.includes("phone") && safePhone) {
          fieldValues.push({ path: field.path, value: safePhone });
        }
      }
    }

    // Step 3 — submit
    const submitResponse = await fetch(ASHBY_SUBMIT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobPostingId: parsed.jobPostingId,
        applicationForm: { fieldValues }
      }),
      signal: abortController.signal
    });

    let submitData = null;
    try { submitData = await submitResponse.json(); } catch { submitData = null; }

    if (!submitResponse.ok) {
      return {
        attempted: true,
        submitted: false,
        provider: "ashby",
        message:
          submitData?.errors?.[0]?.message ||
          submitData?.message ||
          submitData?.error ||
          `Ashby returned ${submitResponse.status}.`,
        externalApplicationId: submitData?.results?.applicationId || null
      };
    }

    return {
      attempted: true,
      submitted: true,
      provider: "ashby",
      message: "Application submitted via Ashby.",
      externalApplicationId:
        submitData?.results?.applicationId ||
        submitData?.applicationId ||
        submitData?.id ||
        null
    };
  } catch (error) {
    return {
      attempted: true,
      submitted: false,
      provider: "ashby",
      message: `Ashby submission failed: ${error.message || "unknown error"}`
    };
  } finally {
    clearTimeout(timeout);
  }
};
