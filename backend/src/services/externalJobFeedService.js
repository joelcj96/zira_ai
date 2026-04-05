const REMOTIVE_API_URL = "https://remotive.com/api/remote-jobs";
const ARBEITNOW_API_URL = "https://www.arbeitnow.com/api/job-board-api";
const THE_MUSE_API_URL = "https://www.themuse.com/api/public/jobs";
const REMOTEOK_API_URL = "https://remoteok.com/api";
const JOBICY_API_URL = "https://jobicy.com/api/v2/remote-jobs";
const HIMALAYAS_API_URL = "https://himalayas.app/jobs/api";
const DEFAULT_SYNC_INTERVAL_MINUTES = 360;
const DEFAULT_FETCH_TIMEOUT_MS = 10000;
const DEFAULT_MAX_JOBS = 600;
const DEFAULT_ARBEITNOW_MAX_PAGES = 3;
const DEFAULT_THE_MUSE_MAX_PAGES = 3;
const DEFAULT_JOBICY_MAX_JOBS = 50;
const DEFAULT_HIMALAYAS_MAX_JOBS = 100;
const REMOTIVE_ID_PREFIX = "remotive-";
const ARBEITNOW_ID_PREFIX = "arbeitnow-";
const THE_MUSE_ID_PREFIX = "themuse-";
const REMOTEOK_ID_PREFIX = "remoteok-";
const JOBICY_ID_PREFIX = "jobicy-";
const HIMALAYAS_ID_PREFIX = "himalayas-";

const PROVIDERS = [
  {
    id: "remotive",
    name: "Remotive"
  },
  {
    id: "arbeitnow",
    name: "Arbeitnow"
  },
  {
    id: "themuse",
    name: "The Muse"
  },
  {
    id: "remoteok",
    name: "RemoteOK"
  },
  {
    id: "jobicy",
    name: "Jobicy"
  },
  {
    id: "himalayas",
    name: "Himalayas"
  }
];

const EXTERNAL_PROVIDER_IDS = PROVIDERS.map((provider) => provider.id);
const EXTERNAL_ID_PREFIXES = [
  REMOTIVE_ID_PREFIX,
  ARBEITNOW_ID_PREFIX,
  THE_MUSE_ID_PREFIX,
  REMOTEOK_ID_PREFIX,
  JOBICY_ID_PREFIX,
  HIMALAYAS_ID_PREFIX
];

const createProviderCacheEntry = (provider) => ({
  id: provider.id,
  name: provider.name,
  status: "idle",
  lastAttemptedAt: 0,
  lastSuccessfulSyncAt: 0,
  fetchedJobCount: 0,
  lastErrorMessage: null
});

const createProviderCacheMap = () =>
  Object.fromEntries(PROVIDERS.map((provider) => [provider.id, createProviderCacheEntry(provider)]));

const cache = {
  jobs: [],
  fetchedAt: 0,
  lastAttemptedAt: 0,
  lastSuccessfulSyncAt: 0,
  inFlight: null,
  lastError: null,
  providers: createProviderCacheMap()
};

const normalizeText = (value = "", fallback = "") => {
  const text = String(value || "").trim();
  return text || fallback;
};

const toAbsoluteUrl = (value = "", baseUrl = "") => {
  const text = normalizeText(value);
  if (!text) return "";

  try {
    const parsed = new URL(text, baseUrl || undefined);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.toString();
  } catch {
    return "";
  }
};

const isHomepageLikeUrl = (value = "") => {
  try {
    const parsed = new URL(value);
    const path = parsed.pathname || "/";
    return (path === "/" || path === "") && !parsed.search && !parsed.hash;
  } catch {
    return false;
  }
};

const resolveDirectJobUrl = ({ candidates = [], baseUrl = "" }) => {
  const normalized = candidates.map((candidate) => toAbsoluteUrl(candidate, baseUrl)).filter(Boolean);
  if (normalized.length === 0) return null;

  const deepLink = normalized.find((url) => !isHomepageLikeUrl(url));
  return deepLink || normalized[0] || null;
};

const stripHtml = (value = "") =>
  String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();

const truncate = (value = "", max = 4000) => String(value || "").trim().slice(0, max).trim();

const normalizeSkills = (skills) =>
  Array.isArray(skills)
    ? skills
        .map((skill) => String(skill || "").trim())
        .filter(Boolean)
        .slice(0, 12)
    : [];

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getSyncIntervalMs = () =>
  parsePositiveInteger(process.env.REAL_JOB_SYNC_INTERVAL_MINUTES, DEFAULT_SYNC_INTERVAL_MINUTES) * 60 * 1000;

const getFetchTimeoutMs = () => parsePositiveInteger(process.env.REAL_JOB_FETCH_TIMEOUT_MS, DEFAULT_FETCH_TIMEOUT_MS);

const getMaxJobs = () => parsePositiveInteger(process.env.REAL_JOB_MAX_RESULTS, DEFAULT_MAX_JOBS);
const getArbeitnowMaxPages = () =>
  parsePositiveInteger(process.env.REAL_JOB_ARBEITNOW_MAX_PAGES, DEFAULT_ARBEITNOW_MAX_PAGES);
const getTheMuseMaxPages = () =>
  parsePositiveInteger(process.env.REAL_JOB_THE_MUSE_MAX_PAGES, DEFAULT_THE_MUSE_MAX_PAGES);
const getJobicyMaxJobs = () =>
  parsePositiveInteger(process.env.REAL_JOB_JOBICY_MAX_JOBS, DEFAULT_JOBICY_MAX_JOBS);
const getHimalayasMaxJobs = () =>
  parsePositiveInteger(process.env.REAL_JOB_HIMALAYAS_MAX_JOBS, DEFAULT_HIMALAYAS_MAX_JOBS);

const isRealJobFeedEnabled = () => String(process.env.DISABLE_REAL_JOB_FEED || "false").trim().toLowerCase() !== "true";

const toIsoString = (value) => (value ? new Date(value).toISOString() : null);

const mapJobType = (jobType = "") => {
  const normalized = String(jobType || "").trim().toLowerCase();

  if (
    normalized.includes("freelance") ||
    normalized.includes("contract") ||
    normalized.includes("gig") ||
    normalized.includes("consult")
  ) {
    return "freelance";
  }

  return "full-time";
};

const extractSalaryValue = (salary = "") => {
  const matches = String(salary || "").match(/\d[\d,.]*/g);
  if (!matches || matches.length === 0) return 0;

  const numericValues = matches
    .map((value) => Number.parseFloat(value.replace(/,/g, "")))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (numericValues.length === 0) return 0;

  const maxValue = Math.max(...numericValues);
  return maxValue >= 1000 ? Math.round(maxValue) : Math.round(maxValue * 1000);
};

const getBudgetRange = (salary) => {
  if (salary >= 120000) return "high";
  if (salary >= 80000) return "mid";
  return "low";
};

const parseUnixTimestamp = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }

  return new Date(numericValue * 1000);
};

const parseDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
};

const getPostedTimestamp = (value) => {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const scoreJobRichness = (job = {}) => {
  let score = 0;

  if (job.salary > 0) score += 2;
  if (job.postedAt) score += 1;
  if ((job.description || "").length > 200) score += 1;
  if (Array.isArray(job.skillsRequired) && job.skillsRequired.length > 0) score += 1;

  return score;
};

const buildJobDedupKey = (job = {}) => {
  const sourceLink = normalizeText(job.sourceLink);
  if (sourceLink) {
    return sourceLink.toLowerCase();
  }

  return [job.company, job.title, job.location]
    .map((value) => normalizeText(value).toLowerCase())
    .join("|");
};

const dedupeJobs = (jobs = []) => {
  const byKey = new Map();

  jobs.forEach((job) => {
    const key = buildJobDedupKey(job);
    if (!key) return;

    const existing = byKey.get(key);
    if (!existing || scoreJobRichness(job) > scoreJobRichness(existing)) {
      byKey.set(key, job);
    }
  });

  return [...byKey.values()];
};

const sortJobsByRecency = (jobs = []) =>
  [...jobs].sort((leftJob, rightJob) => getPostedTimestamp(rightJob.postedAt) - getPostedTimestamp(leftJob.postedAt));

const updateProviderCache = ({ providerId, status, fetchedJobCount = 0, error = null, attemptedAt = Date.now(), successfulAt = 0 }) => {
  const existing = cache.providers[providerId] || {};

  cache.providers[providerId] = {
    ...existing,
    id: providerId,
    name: existing.name || PROVIDERS.find((provider) => provider.id === providerId)?.name || providerId,
    status,
    lastAttemptedAt: attemptedAt,
    lastSuccessfulSyncAt: successfulAt || existing.lastSuccessfulSyncAt || 0,
    fetchedJobCount,
    lastErrorMessage: error ? normalizeText(error.message, "Unknown provider error") : null
  };
};

const mapRemotiveJob = (job = {}) => {
  const salary = extractSalaryValue(job.salary);
  const location = normalizeText(job.candidate_required_location, "Remote");
  const normalizedSalary = salary > 0 ? salary : null;

  return {
    id: `${REMOTIVE_ID_PREFIX}${normalizeText(job.id)}`,
    title: normalizeText(job.title, "Untitled role"),
    company: normalizeText(job.company_name, "Unknown company"),
    location,
    locationType: /remote|worldwide|anywhere/i.test(location) ? "remote" : "on-site",
    jobType: mapJobType(job.job_type),
    salary: normalizedSalary,
    budgetRange: getBudgetRange(salary),
    postedAt: job.publication_date ? new Date(job.publication_date) : null,
    sourceLink: resolveDirectJobUrl({
      candidates: [job.url, job.jobUrl, job.apply_url],
      baseUrl: "https://remotive.com"
    }),
    description: truncate(stripHtml(job.description)),
    skillsRequired: normalizeSkills(job.tags),
    sourceTag: "Feed",
    externalSourceId: "remotive",
    externalSourceName: "Remotive",
    createdByUser: null
  };
};

const mapArbeitnowJob = (job = {}) => {
  const slug = normalizeText(job.slug);
  const location = normalizeText(job.location, job.remote ? "Remote" : "On-site");
  const slugFallback = slug ? `https://www.arbeitnow.com/jobs/${slug}` : "";

  return {
    id: `${ARBEITNOW_ID_PREFIX}${slug || normalizeText(job.url)}`,
    title: normalizeText(job.title, "Untitled role"),
    company: normalizeText(job.company_name, "Unknown company"),
    location,
    locationType: job.remote || /remote|worldwide|anywhere/i.test(location) ? "remote" : "on-site",
    jobType: mapJobType(Array.isArray(job.job_types) ? job.job_types[0] : ""),
    salary: null,
    budgetRange: "low",
    postedAt: parseUnixTimestamp(job.created_at),
    sourceLink: resolveDirectJobUrl({
      candidates: [job.url, job.link, slugFallback],
      baseUrl: "https://www.arbeitnow.com"
    }),
    description: truncate(stripHtml(job.description)),
    skillsRequired: normalizeSkills(job.tags),
    sourceTag: "Feed",
    externalSourceId: "arbeitnow",
    externalSourceName: "Arbeitnow",
    createdByUser: null
  };
};

const mapTheMuseJob = (job = {}) => {
  const companyName = normalizeText(job?.company?.name, "Unknown company");
  const title = normalizeText(job?.name, "Untitled role");
  const location =
    normalizeText(
      Array.isArray(job?.locations) ? job.locations.map((locationItem) => locationItem?.name).filter(Boolean).join(", ") : ""
    ) || "Remote";

  const categorySkills = Array.isArray(job?.categories)
    ? job.categories.map((category) => normalizeText(category?.name)).filter(Boolean)
    : [];
  const levelSkills = Array.isArray(job?.levels)
    ? job.levels.map((level) => normalizeText(level?.name)).filter(Boolean)
    : [];

  const sourceLink = resolveDirectJobUrl({
    candidates: [job?.refs?.landing_page, job?.refs?.apply, job?.refs?.short_link],
    baseUrl: "https://www.themuse.com"
  });
  const idSeed = normalizeText(job?.id, normalizeText(sourceLink) || normalizeText(title));

  return {
    id: `${THE_MUSE_ID_PREFIX}${idSeed}`,
    title,
    company: companyName,
    location,
    locationType: /remote|anywhere|worldwide/i.test(location) ? "remote" : "on-site",
    jobType: mapJobType(
      [job?.type, ...(Array.isArray(job?.levels) ? job.levels.map((level) => level?.name) : [])]
        .filter(Boolean)
        .join(" ")
    ),
    salary: null,
    budgetRange: "low",
    postedAt: parseDate(job?.publication_date),
    sourceLink,
    description: truncate(stripHtml(job?.contents || "")),
    skillsRequired: normalizeSkills([...categorySkills, ...levelSkills]),
    sourceTag: "Feed",
    externalSourceId: "themuse",
    externalSourceName: "The Muse",
    createdByUser: null
  };
};

const fetchProviderJson = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getFetchTimeoutMs());

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": "ZiraAI/1.0 (+https://zira.ai)"
      }
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
};

const fetchPaginatedProviderData = async ({
  baseUrl,
  maxPages,
  mapPagePayload,
  getNextPage
}) => {
  const aggregatedRows = [];
  let page = 1;

  while (page <= maxPages) {
    const separator = baseUrl.includes("?") ? "&" : "?";
    const payload = await fetchProviderJson(`${baseUrl}${separator}page=${page}`);
    aggregatedRows.push(...mapPagePayload(payload));

    if (!getNextPage(payload, page)) {
      break;
    }

    page += 1;
  }

  return aggregatedRows;
};

const mapRemoteOKJob = (job = {}) => {
  const salaryMin = Number(job.salary_min) || 0;
  const salaryMax = Number(job.salary_max) || 0;
  const salary = salaryMax > 0 ? Math.round(salaryMax) : salaryMin > 0 ? Math.round(salaryMin) : 0;
  const normalizedSalary = salary > 0 ? salary : null;
  const location = normalizeText(job.location, "Remote");

  return {
    id: `${REMOTEOK_ID_PREFIX}${normalizeText(String(job.id || ""))}`,
    title: normalizeText(job.position, "Untitled role"),
    company: normalizeText(job.company, "Unknown company"),
    location,
    locationType: "remote",
    jobType: mapJobType(job.job_type || ""),
    salary: normalizedSalary,
    budgetRange: getBudgetRange(salary),
    postedAt: job.date ? new Date(job.date) : null,
    sourceLink: resolveDirectJobUrl({
      candidates: [job.url, job.apply_url, job.apply_url2],
      baseUrl: "https://remoteok.com"
    }),
    description: truncate(stripHtml(job.description || "")),
    skillsRequired: normalizeSkills(job.tags),
    sourceTag: "Feed",
    externalSourceId: "remoteok",
    externalSourceName: "RemoteOK",
    createdByUser: null
  };
};

const mapJobicyJob = (job = {}) => {
  const salary = extractSalaryValue(job.jobSalary || "");
  const location = normalizeText(job.jobGeo, "Remote");

  return {
    id: `${JOBICY_ID_PREFIX}${normalizeText(String(job.id || ""))}`,
    title: normalizeText(job.jobTitle, "Untitled role"),
    company: normalizeText(job.companyName, "Unknown company"),
    location,
    locationType: /remote|anywhere|worldwide/i.test(location) ? "remote" : "on-site",
    jobType: mapJobType(job.jobType || ""),
    salary: salary || null,
    budgetRange: getBudgetRange(salary),
    postedAt: job.pubDate ? new Date(job.pubDate) : null,
    sourceLink: resolveDirectJobUrl({
      candidates: [job.url, job.jobUrl, job.link],
      baseUrl: "https://jobicy.com"
    }),
    description: truncate(stripHtml(job.jobDescription || job.jobExcerpt || "")),
    skillsRequired: normalizeSkills(
      Array.isArray(job.jobIndustry)
        ? job.jobIndustry
        : job.jobType
        ? [job.jobType]
        : []
    ),
    sourceTag: "Feed",
    externalSourceId: "jobicy",
    externalSourceName: "Jobicy",
    createdByUser: null
  };
};

const mapHimalayasJob = (job = {}) => {
  const salaryMin = Number(job.annualSalaryMin ?? job.minSalary) || 0;
  const salaryMax = Number(job.annualSalaryMax ?? job.maxSalary) || 0;
  const salary = salaryMax > 0 ? Math.round(salaryMax) : salaryMin > 0 ? Math.round(salaryMin) : 0;
  const normalizedSalary = salary > 0 ? salary : null;
  const rawLocation = Array.isArray(job.locationNames)
    ? job.locationNames.join(", ")
    : Array.isArray(job.locationRestrictions)
    ? job.locationRestrictions.join(", ")
    : normalizeText(job.location, "");
  const location = normalizeText(rawLocation, "Remote");
  const companyName =
    typeof job.company === "object" && job.company !== null
      ? normalizeText(job.company.name, "Unknown company")
      : normalizeText(job.companyName || job.company, "Unknown company");
  const categories = Array.isArray(job.categories)
    ? job.categories.map((c) => (typeof c === "object" ? c?.name : c))
    : [];

  const sourceLink = resolveDirectJobUrl({
    candidates: [job.url, job.applicationUrl, job.applicationLink, job.guid],
    baseUrl: "https://himalayas.app"
  });

  return {
    id: `${HIMALAYAS_ID_PREFIX}${normalizeText(String(job.id || ""))}`,
    title: normalizeText(job.title, "Untitled role"),
    company: companyName,
    location,
    locationType: job.isRemote || /remote|anywhere|worldwide/i.test(location) ? "remote" : "on-site",
    jobType: mapJobType(job.jobType || job.employmentType || ""),
    salary: normalizedSalary,
    budgetRange: getBudgetRange(salary),
    postedAt: job.publishedAt ? new Date(job.publishedAt) : parseUnixTimestamp(job.pubDate),
    sourceLink,
    description: truncate(stripHtml(job.description || "")),
    skillsRequired: normalizeSkills(categories),
    sourceTag: "Feed",
    externalSourceId: "himalayas",
    externalSourceName: "Himalayas",
    createdByUser: null
  };
};

const fetchRemotiveJobs = async () => {
  const payload = await fetchProviderJson(REMOTIVE_API_URL);
  const jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];

  return sortJobsByRecency(
    jobs
      .map(mapRemotiveJob)
      .filter((job) => job.id && job.title && job.company && job.sourceLink)
  );
};

const fetchArbeitnowJobs = async () => {
  const jobs = await fetchPaginatedProviderData({
    baseUrl: ARBEITNOW_API_URL,
    maxPages: getArbeitnowMaxPages(),
    mapPagePayload: (payload) => (Array.isArray(payload?.data) ? payload.data : []),
    getNextPage: (payload, currentPage) => {
      const hasLinkNext = Boolean(payload?.links?.next);
      const current = Number(payload?.meta?.current_page || currentPage);
      const to = Number(payload?.meta?.to || 0);
      const perPage = Number(payload?.meta?.per_page || 0);

      if (hasLinkNext) return true;
      if (to > 0 && perPage > 0) {
        return to >= perPage * current;
      }

      return false;
    }
  });

  return sortJobsByRecency(
    jobs
      .map(mapArbeitnowJob)
      .filter((job) => job.id && job.title && job.company && job.sourceLink)
  );
};

const fetchTheMuseJobs = async () => {
  const jobs = await fetchPaginatedProviderData({
    baseUrl: THE_MUSE_API_URL,
    maxPages: getTheMuseMaxPages(),
    mapPagePayload: (payload) => (Array.isArray(payload?.results) ? payload.results : []),
    getNextPage: (payload, currentPage) => {
      const pageCount = Number(payload?.page_count || 0);
      if (pageCount > 0) {
        return currentPage < pageCount;
      }

      const total = Number(payload?.total || 0);
      const pageSize = Number(payload?.items_per_page || 20);
      if (total > 0) {
        return currentPage * pageSize < total;
      }

      return false;
    }
  });

  return sortJobsByRecency(
    jobs
      .map(mapTheMuseJob)
      .filter((job) => job.id && job.title && job.company && job.sourceLink)
  );
};

const fetchRemoteOKJobs = async () => {
  const data = await fetchProviderJson(REMOTEOK_API_URL);
  // First element is API metadata, skip it
  const jobs = Array.isArray(data) ? data.slice(1).filter((job) => job && job.id) : [];

  return sortJobsByRecency(
    jobs
      .map(mapRemoteOKJob)
      .filter((job) => job.id && job.title && job.company && job.sourceLink)
  );
};

const fetchJobicyJobs = async () => {
  const maxJobs = getJobicyMaxJobs();
  const payload = await fetchProviderJson(`${JOBICY_API_URL}?count=${maxJobs}`);
  const jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];

  return sortJobsByRecency(
    jobs
      .map(mapJobicyJob)
      .filter((job) => job.id && job.title && job.company && job.sourceLink)
  );
};

const fetchHimalayasJobs = async () => {
  const maxJobs = getHimalayasMaxJobs();
  const payload = await fetchProviderJson(`${HIMALAYAS_API_URL}?limit=${maxJobs}`);
  const jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];

  return sortJobsByRecency(
    jobs
      .map(mapHimalayasJob)
      .filter((job) => job.id && job.title && job.company && job.sourceLink)
  );
};

const getProviderStatuses = () =>
  PROVIDERS.map((provider) => {
    const state = cache.providers[provider.id] || createProviderCacheEntry(provider);

    return {
      id: provider.id,
      name: provider.name,
      status: state.status,
      fetchedJobCount: state.fetchedJobCount,
      lastAttemptedAt: toIsoString(state.lastAttemptedAt),
      lastSuccessfulSyncAt: toIsoString(state.lastSuccessfulSyncAt),
      lastErrorMessage: state.lastErrorMessage
    };
  });

export const getExternalJobFeedSyncStatus = () => {
  if (!isRealJobFeedEnabled()) {
    return {
      enabled: false,
      providerCount: PROVIDERS.length,
      cachedJobCount: 0,
      lastAttemptedAt: null,
      lastSuccessfulSyncAt: null,
      lastErrorMessage: null,
      providers: PROVIDERS.map((provider) => ({
        id: provider.id,
        name: provider.name,
        status: "disabled",
        fetchedJobCount: 0,
        lastAttemptedAt: null,
        lastSuccessfulSyncAt: null,
        lastErrorMessage: null
      }))
    };
  }

  return {
    enabled: true,
    providerCount: PROVIDERS.length,
    cachedJobCount: cache.jobs.length,
    lastAttemptedAt: toIsoString(cache.lastAttemptedAt),
    lastSuccessfulSyncAt: toIsoString(cache.lastSuccessfulSyncAt),
    lastErrorMessage: cache.lastError ? normalizeText(cache.lastError.message) : null,
    providers: getProviderStatuses()
  };
};

const fetchProviderJobs = async (provider) => {
  if (provider.id === "remotive") return fetchRemotiveJobs();
  if (provider.id === "arbeitnow") return fetchArbeitnowJobs();
  if (provider.id === "themuse") return fetchTheMuseJobs();
  if (provider.id === "remoteok") return fetchRemoteOKJobs();
  if (provider.id === "jobicy") return fetchJobicyJobs();
  if (provider.id === "himalayas") return fetchHimalayasJobs();
  return [];
};

const fetchAllProviderJobs = async () => {
  const attemptedAt = Date.now();
  cache.lastAttemptedAt = attemptedAt;

  const results = await Promise.allSettled(
    PROVIDERS.map(async (provider) => ({
      provider,
      jobs: await fetchProviderJobs(provider)
    }))
  );

  const successfulJobs = [];
  const providerErrors = [];

  results.forEach((result, index) => {
    const provider = PROVIDERS[index];

    if (result.status === "fulfilled") {
      const providerJobs = result.value.jobs;
      successfulJobs.push(...providerJobs);
      updateProviderCache({
        providerId: provider.id,
        status: "success",
        fetchedJobCount: providerJobs.length,
        attemptedAt,
        successfulAt: attemptedAt
      });
      return;
    }

    providerErrors.push(`${provider.name}: ${normalizeText(result.reason?.message, "Unknown error")}`);
    updateProviderCache({
      providerId: provider.id,
      status: "error",
      fetchedJobCount: 0,
      attemptedAt,
      error: result.reason
    });
  });

  if (successfulJobs.length > 0) {
    const jobs = sortJobsByRecency(dedupeJobs(successfulJobs)).slice(0, getMaxJobs());
    cache.jobs = jobs;
    cache.fetchedAt = attemptedAt;
    cache.lastSuccessfulSyncAt = attemptedAt;
    cache.lastError =
      providerErrors.length > 0 ? new Error(`Some providers failed: ${providerErrors.join("; ")}`) : null;

    return {
      jobs,
      fetchedFresh: true,
      lastError: cache.lastError,
      source: providerErrors.length > 0 ? "partial-network" : "network"
    };
  }

  cache.lastError = new Error(
    providerErrors.length > 0 ? providerErrors.join("; ") : "All external job providers failed"
  );

  return {
    jobs: cache.jobs,
    fetchedFresh: false,
    lastError: cache.lastError,
    source: cache.jobs.length > 0 ? "stale-cache" : "error"
  };
};

export const getLatestExternalFeedJobs = async ({ force = false } = {}) => {
  if (!isRealJobFeedEnabled()) {
    return {
      jobs: [],
      fetchedFresh: false,
      lastError: null,
      source: "disabled",
      syncStatus: getExternalJobFeedSyncStatus()
    };
  }

  const now = Date.now();
  if (!force && cache.jobs.length > 0 && now - cache.fetchedAt < getSyncIntervalMs()) {
    return {
      jobs: cache.jobs,
      fetchedFresh: false,
      lastError: cache.lastError,
      source: "cache",
      syncStatus: getExternalJobFeedSyncStatus()
    };
  }

  if (cache.inFlight) {
    return cache.inFlight;
  }

  cache.inFlight = (async () => {
    try {
      const result = await fetchAllProviderJobs();
      return {
        ...result,
        syncStatus: getExternalJobFeedSyncStatus()
      };
    } finally {
      cache.inFlight = null;
    }
  })();

  return cache.inFlight;
};

export const getExternalFeedJobById = async (jobId) => {
  if (!jobId || !EXTERNAL_ID_PREFIXES.some((prefix) => String(jobId).startsWith(prefix))) {
    return null;
  }

  const { jobs } = await getLatestExternalFeedJobs();
  return jobs.find((job) => job.id === jobId) || null;
};

export const __resetExternalJobFeedCacheForTests = () => {
  cache.jobs = [];
  cache.fetchedAt = 0;
  cache.lastAttemptedAt = 0;
  cache.lastSuccessfulSyncAt = 0;
  cache.inFlight = null;
  cache.lastError = null;
  cache.providers = createProviderCacheMap();
};

export const EXTERNAL_JOB_FEED_CONSTANTS = {
  REMOTIVE_ID_PREFIX,
  ARBEITNOW_ID_PREFIX,
  THE_MUSE_ID_PREFIX,
  REMOTEOK_ID_PREFIX,
  JOBICY_ID_PREFIX,
  HIMALAYAS_ID_PREFIX,
  EXTERNAL_PROVIDER_IDS,
  EXTERNAL_ID_PREFIXES
};