import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { trackConversionEvent } from "../api/analytics";
import JobCard from "../components/JobCard";
import ProposalEditor from "../components/ProposalEditor";
import ProposalLearning from "../components/ProposalLearning";
import JobOptimizationPanel from "../components/JobOptimizationPanel";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";
import { useToast } from "../context/ToastContext";

const PAGE_SIZE_STORAGE_KEY = "zira.jobs.pageSize";
const FEED_PREFERENCES_STORAGE_KEY = "zira.jobs.feedPreferences";
const PAGE_SIZE_OPTIONS = [4, 8, 12, 16];
const APPLY_FILTER_OPTIONS = ["all", "not-applied", "applied"];
const JOB_TYPE_FILTER_OPTIONS = ["all", "freelance", "full-time"];
const LOCATION_FILTER_OPTIONS = ["all", "remote", "on-site"];
const BUDGET_FILTER_OPTIONS = ["all", "low", "mid", "high"];
const SORT_OPTIONS = ["best-match", "newest", "highest-paying"];
const LIVE_JOB_REFRESH_INTERVAL_MS = 30000;

const mergeJobsById = (existingJobs, incomingJobs) => {
  const merged = [...existingJobs, ...incomingJobs];
  const seen = new Set();

  return merged.filter((job) => {
    const jobId = String(job?.id || "");
    if (!jobId || seen.has(jobId)) return false;
    seen.add(jobId);
    return true;
  });
};

const extractExternalSourceLink = (notes = "") => {
  const match = String(notes || "").match(/External job source:\s*(https?:\/\/\S+)/i);
  return match?.[1] || "";
};

const detectApplyProviderFromLink = (sourceLink = "") => {
  try {
    const host = new URL(String(sourceLink || "")).hostname.toLowerCase();
    if (!host) return "unknown";
    if (host.includes("greenhouse")) return "greenhouse";
    if (host.includes("lever")) return "lever";
    if (host.includes("ashby")) return "ashby";
    if (host.includes("smartrecruiters")) return "smartrecruiters";
    if (host.includes("linkedin")) return "linkedin";
    if (host.includes("indeed")) return "indeed";
    if (host.includes("workday")) return "workday";
    return "generic";
  } catch {
    return "unknown";
  }
};

const isDirectApplyLink = (value = "") => {
  try {
    const parsed = new URL(String(value || ""));
    const host = String(parsed.hostname || "").toLowerCase();
    if (!parsed.protocol || !["http:", "https:"].includes(parsed.protocol)) {
      return false;
    }
    const path = String(parsed.pathname || "").trim();
    if ((path === "" || path === "/") && !parsed.search && !parsed.hash) {
      return false;
    }

    if (host.includes("linkedin.com")) {
      return /\/jobs\/view\//i.test(path);
    }

    return true;
  } catch {
    return false;
  }
};

const getInitialPageSize = () => {
  if (typeof window === "undefined") return 8;
  const raw = window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY);
  const parsed = Number(raw);
  if (PAGE_SIZE_OPTIONS.includes(parsed)) return parsed;
  return 8;
};

const getInitialFeedPreferences = () => {
  const fallback = {
    applyFilter: "all",
    searchQuery: "",
    jobTypeFilter: "all",
    locationFilter: "all",
    budgetFilter: "all",
    sortBy: "best-match"
  };

  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(FEED_PREFERENCES_STORAGE_KEY);
    if (!raw) return fallback;

    const parsed = JSON.parse(raw);
    return {
      applyFilter: APPLY_FILTER_OPTIONS.includes(parsed?.applyFilter) ? parsed.applyFilter : fallback.applyFilter,
      searchQuery: typeof parsed?.searchQuery === "string" ? parsed.searchQuery : fallback.searchQuery,
      jobTypeFilter: JOB_TYPE_FILTER_OPTIONS.includes(parsed?.jobTypeFilter)
        ? parsed.jobTypeFilter
        : fallback.jobTypeFilter,
      locationFilter: LOCATION_FILTER_OPTIONS.includes(parsed?.locationFilter)
        ? parsed.locationFilter
        : fallback.locationFilter,
      budgetFilter: BUDGET_FILTER_OPTIONS.includes(parsed?.budgetFilter)
        ? parsed.budgetFilter
        : fallback.budgetFilter,
      sortBy: SORT_OPTIONS.includes(parsed?.sortBy) ? parsed.sortBy : fallback.sortBy
    };
  } catch {
    return fallback;
  }
};

function JobsPage() {
  const { user, refreshUser, isPro } = useAuth();
  const { t } = useI18n();
  const { showToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const initialFeedPreferences = useMemo(() => getInitialFeedPreferences(), []);
  const [jobs, setJobs] = useState([]);
  const [topMatches, setTopMatches] = useState([]);
  const [appliedJobIds, setAppliedJobIds] = useState([]);
  const [savedExternalJobs, setSavedExternalJobs] = useState([]);
  const [applyFilter, setApplyFilter] = useState(initialFeedPreferences.applyFilter);
  const [searchQuery, setSearchQuery] = useState(initialFeedPreferences.searchQuery);
  const [jobTypeFilter, setJobTypeFilter] = useState(initialFeedPreferences.jobTypeFilter);
  const [locationFilter, setLocationFilter] = useState(initialFeedPreferences.locationFilter);
  const [budgetFilter, setBudgetFilter] = useState(initialFeedPreferences.budgetFilter);
  const [sortBy, setSortBy] = useState(initialFeedPreferences.sortBy);
  const [pageSize, setPageSize] = useState(getInitialPageSize);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 8,
    total: 0,
    totalPages: 1,
    hasPrev: false,
    hasNext: false
  });
  const [feedLoading, setFeedLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [pendingLiveJobs, setPendingLiveJobs] = useState([]);
  const [livePreview, setLivePreview] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [proposal, setProposal] = useState("");
  const [alternateProposal, setAlternateProposal] = useState("");
  const [proposalHistoryId, setProposalHistoryId] = useState(null);
  const [proposalStrategy, setProposalStrategy] = useState(null);
  const [tone, setTone] = useState("professional");
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(false);
  const [applyMode, setApplyMode] = useState("manual");
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [dailyLimit, setDailyLimit] = useState(5);
  const [isApplying, setIsApplying] = useState(false);
  const [isTailoring, setIsTailoring] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [freePlanUsage, setFreePlanUsage] = useState({ limit: 5, used: 0, remaining: 5 });
  const [optimizationLoading, setOptimizationLoading] = useState(false);
  const [optimization, setOptimization] = useState(null);
  const [optimizedCoverLetter, setOptimizedCoverLetter] = useState("");
  const [optimizedCv, setOptimizedCv] = useState("");
  const [optimizationApproved, setOptimizationApproved] = useState(false);
  const [ignoredJobIds, setIgnoredJobIds] = useState([]);
  const [behaviorProfile, setBehaviorProfile] = useState(null);
  const [externalJobLink, setExternalJobLink] = useState("");
  const [externalJobManualDescription, setExternalJobManualDescription] = useState("");
  const [externalJobAnalyzing, setExternalJobAnalyzing] = useState(false);
  const [externalJobNeedsManual, setExternalJobNeedsManual] = useState(false);
  const [externalJobExtracted, setExternalJobExtracted] = useState(null);
  const [externalJobAnalysis, setExternalJobAnalysis] = useState(null);
  const [externalJobProposal, setExternalJobProposal] = useState("");
  const [externalJobOptimization, setExternalJobOptimization] = useState(null);
  const [externalJobActionLoading, setExternalJobActionLoading] = useState({
    proposal: false,
    optimize: false
  });
  const [externalJobMessage, setExternalJobMessage] = useState("");
  const loadMoreTriggerRef = useRef(null);
  const paginationRequestLockRef = useRef(false);
  const routeSection = location.pathname.split("/")[2] || "all";
  const isProposalDraftPage = routeSection === "proposal-draft";
  const isBestMatchesPage = routeSection === "best-matches";
  const isFeedPage = ["all", "not-applied", "applied"].includes(routeSection);
  const proUnavailableNotice = t(
    "settings.proUnavailableNotice",
    {},
    "Pro subscriptions are temporarily unavailable. Our team will activate Pro manually for selected users."
  );

  const buildFeedParams = (pageNumber = 1) => {
    const params = {
      sort: sortBy,
      page: pageNumber,
      limit: pageSize
    };

    const queryText = searchQuery.trim();
    if (queryText) params.q = queryText;
    if (jobTypeFilter !== "all") params.jobType = jobTypeFilter;
    if (locationFilter !== "all") params.locationType = locationFilter;
    if (budgetFilter !== "all") params.budgetRange = budgetFilter;

    return params;
  };

  const loadJobsPage = async ({ pageToLoad = 1, append = false, silent = false } = {}) => {
    if (append && paginationRequestLockRef.current) return null;

    if (append) {
      paginationRequestLockRef.current = true;
      setIsLoadingMore(true);
    } else if (!silent) {
      setFeedLoading(true);
    }

    try {
      const { data } = await api.get("/jobs", { params: buildFeedParams(pageToLoad) });
      if (Array.isArray(data)) {
        setJobs(data);
        setTopMatches(data.slice(0, 3));
        setBehaviorProfile(null);
        setPagination({
          page: 1,
          limit: data.length,
          total: data.length,
          totalPages: 1,
          hasPrev: false,
          hasNext: false
        });
        setPendingLiveJobs([]);
        setLivePreview(null);
        return data;
      }

      setJobs((previous) => (append ? mergeJobsById(previous, data.jobs || []) : data.jobs || []));
      if (!append) {
        setTopMatches(data.topMatches || []);
      }
      setBehaviorProfile(data.behaviorProfile || null);
      setPagination(
        data.pagination || {
          page: 1,
          limit: data.jobs?.length || 0,
          total: data.jobs?.length || 0,
          totalPages: 1,
          hasPrev: false,
          hasNext: false
        }
      );
      if (!append) {
        setPendingLiveJobs([]);
        setLivePreview(null);
      }

      return data;
    } finally {
      if (append) {
        paginationRequestLockRef.current = false;
        setIsLoadingMore(false);
      } else if (!silent) {
        setFeedLoading(false);
      }
    }
  };

  const trackJobBehavior = async (job, eventType, metadata = {}) => {
    try {
      const { data } = await api.post("/jobs/behavior", {
        jobId: job.id,
        eventType,
        metadata
      });
      if (data?.behaviorProfile) {
        setBehaviorProfile(data.behaviorProfile);
      }
    } catch (error) {
      console.error("Failed to track job behavior", error);
    }
  };

  const loadAppliedJobs = async () => {
    const { data } = await api.get("/applications");
    setAppliedJobIds(data.map((item) => item.jobId));
    setSavedExternalJobs(
      data.filter((item) => String(item.jobId || "").startsWith("external-"))
    );
  };

  useEffect(() => {
    loadAppliedJobs().catch((error) => console.error("Failed to load applied jobs", error));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(pageSize));
  }, [pageSize]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      FEED_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        applyFilter,
        searchQuery,
        jobTypeFilter,
        locationFilter,
        budgetFilter,
        sortBy
      })
    );
  }, [applyFilter, searchQuery, jobTypeFilter, locationFilter, budgetFilter, sortBy]);

  useEffect(() => {
    if (isFeedPage && routeSection !== applyFilter) {
      setApplyFilter(routeSection);
    }
  }, [routeSection, isFeedPage, applyFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      paginationRequestLockRef.current = false;
      loadJobsPage({ pageToLoad: 1, append: false }).catch((error) => {
        console.error("Failed to load jobs data", error);
        setFeedLoading(false);
      });
    }, 220);

    return () => window.clearTimeout(timer);
  }, [searchQuery, jobTypeFilter, locationFilter, budgetFilter, sortBy, pageSize]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;
    const trigger = loadMoreTriggerRef.current;

    if (!trigger || !pagination.hasNext || feedLoading || isLoadingMore) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting || paginationRequestLockRef.current) return;

        loadJobsPage({ pageToLoad: pagination.page + 1, append: true }).catch((error) => {
          console.error("Failed to load additional jobs", error);
        });
      },
      {
        rootMargin: "240px 0px"
      }
    );

    observer.observe(trigger);
    return () => observer.disconnect();
  }, [pagination.hasNext, pagination.page, feedLoading, isLoadingMore]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (feedLoading || isLoadingMore) return;

      api
        .get("/jobs", { params: buildFeedParams(1) })
        .then(({ data }) => {
          if (Array.isArray(data)) return;

          const currentJobIds = new Set(jobs.map((job) => job.id));
          const unseenJobs = (data.jobs || []).filter((job) => !currentJobIds.has(job.id));

          setPendingLiveJobs(unseenJobs);
          setLivePreview(unseenJobs.length > 0 ? data : null);
        })
        .catch((error) => {
          console.error("Failed to refresh live jobs feed", error);
        });
    }, LIVE_JOB_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [jobs, searchQuery, jobTypeFilter, locationFilter, budgetFilter, sortBy, pageSize, feedLoading, isLoadingMore]);

  useEffect(() => {
    const settings = user?.smartApplySettings;
    if (!settings) return;

    setApplyMode(settings.defaultMode || "manual");
    setDailyLimit(settings.defaultDailyLimit || 5);
    setReviewConfirmed(settings.requireReviewConfirmation === false);
  }, [user]);

  useEffect(() => {
    if (!isPro) {
      setTone("professional");
    }
  }, [isPro]);

  /* Auto-generate proposal when arriving from JobViewPage */
  useEffect(() => {
    const autoJob = location.state?.autoProposalJob;
    if (!autoJob) return;
    /* Clear the state so refresh doesn't re-trigger */
    window.history.replaceState({}, "");
    onGenerateProposal(autoJob);
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isPro) return;
    trackConversionEvent({
      eventType: "lock_impression",
      surface: "jobs_page",
      feature: "best_job_matches",
      dedupeKey: "jobs_page:best_job_matches:lock_impression"
    });
  }, [isPro]);

  const showInlineNotice = (message, type = "info") => {
    showToast(message, type);
  };

  const startUpgradeCheckout = async (source = "jobs_page", feature = "pro_upgrade") => {
    if (user?.role !== "admin") {
      const unavailableMessage = proUnavailableNotice;
      showToast(unavailableMessage, "danger");
      return;
    }

    try {
      setBillingLoading(true);
      await trackConversionEvent({
        eventType: "upgrade_cta_click",
        surface: source,
        feature
      });
      const { data } = await api.post("/billing/create-checkout-session", { source, feature });
      if (data?.url) {
        window.location.assign(data.url);
        return;
      }
      showToast(t("settings.checkoutError"), "danger");
    } catch (error) {
      const rawMessage = error.response?.data?.message || error.message || "";
      const isTechnicalFailure =
        /_id\.slice|not a function|TypeError|Cannot read properties/i.test(rawMessage);
      const readableMessage = isTechnicalFailure
        ? t(
            "settings.checkoutFailedGeneric",
            {},
            "We could not process your request right now. Please try again in a moment."
          )
        : rawMessage;
      showToast(readableMessage || t("settings.checkoutStart", {}, "Could not start checkout."), "danger");
    } finally {
      setBillingLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const checkout = params.get("checkout");

    if (checkout !== "success" || !sessionId) return;

    api
      .get(`/billing/checkout-session/${sessionId}`)
      .then(async () => {
        await refreshUser();
        showToast(t("jobs.proActivated"), "success");
      })
      .catch((error) => {
        showToast(error.response?.data?.message || t("settings.checkoutFailed", {}, "Could not confirm checkout."), "danger");
      });
  }, [refreshUser]);

  const onGenerateProposal = async (job) => {
    setLoading(true);
    setSelectedJob(job);
    navigate("/jobs/proposal-draft");
    setReviewConfirmed(false);
    setOptimizationApproved(false);
    setOptimization(null);

    trackJobBehavior(job, "clicked", { source: "generate_proposal" });

    try {
      const { data } = await api.post("/proposals/generate", {
        jobId: job.id,
        tone,
        language: user?.preferences?.language || "en"
      });
      setProposal(data.proposal);
      setProposalHistoryId(data.proposalHistoryId);
      setProposalStrategy(data.strategy || null);
      setAlternateProposal("");
      setInsights(data.insights || null);
      if (data.subscription?.plan === "free") {
        setFreePlanUsage({
          limit: data.subscription.freePlanDailyLimit,
          used: data.subscription.usedToday,
          remaining: data.subscription.remainingToday
        });
      }
    } catch (error) {
      showToast(error.response?.data?.message || t("jobs.couldNotGenerate", {}, "Could not generate proposal."), "danger");
    } finally {
      setLoading(false);
    }
  };

  const onUseProfileCoverLetter = () => {
    const baseCoverLetter = String(user?.profileData?.coverLetterText || "").trim();
    if (!baseCoverLetter) {
      showInlineNotice(t("proposalEditor.noProfileCoverLetter", {}, "Add a cover letter in Profile first."));
      return;
    }
    setProposal(baseCoverLetter);
    setAlternateProposal("");
    setReviewConfirmed(false);
    showToast(t("jobs.loadedProfileCoverLetter", {}, "Loaded your saved profile cover letter."), "success");
  };

  const onGenerateAgain = async () => {
    if (!selectedJob) {
      showInlineNotice(t("jobs.alertPickJob"));
      return;
    }

    setLoading(true);
    setReviewConfirmed(false);
    try {
      const { data } = await api.post("/proposals/generate", {
        jobId: selectedJob.id,
        tone,
        language: user?.preferences?.language || "en",
        variationSeed: `again_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      });
      setAlternateProposal(data.proposal);
      setProposalStrategy(data.strategy || proposalStrategy);
      setInsights(data.insights || null);
    } catch (error) {
      showToast(error.response?.data?.message || t("jobs.couldNotGenerateSecond", {}, "Could not generate a second version."), "danger");
    } finally {
      setLoading(false);
    }
  };

  const onUseAlternate = () => {
    if (!alternateProposal) return;
    setProposal(alternateProposal);
    setAlternateProposal("");
    setReviewConfirmed(false);
  };

  const onRegenerateSmart = async (currentProposalHistoryId) => {
    if (!selectedJob) {
      showInlineNotice(t("jobs.alertSelectJob"));
      return;
    }

    setLoading(true);
    setReviewConfirmed(false);
    setOptimizationApproved(false);
    setOptimization(null);
    try {
      const { data } = await api.post("/proposals/regenerate-smarter", {
        jobId: selectedJob.id,
        currentProposalHistoryId,
        language: user?.preferences?.language || "en"
      });

      setProposal(data.proposal);
      setProposalHistoryId(data.proposalHistoryId);
      setProposalStrategy(data.strategy || null);
      setAlternateProposal("");
      setInsights(data.insights || null);
      
      if (data.learnedFrom) {
        showToast(t("jobs.regeneratedFeedback", { count: data.learnedFrom.successCount, tone: data.learnedFrom.tone, confidence: data.learnedFrom.confidence }), "success");
      } else {
        showToast(data.message || t("jobs.proposalRegenerated"), "success");
      }
    } catch (error) {
      showToast(error.response?.data?.message || t("jobs.couldNotRegenerateLearn", {}, "Could not regenerate proposal with learning."), "danger");
    } finally {
      setLoading(false);
    }
  };

  const onSmartApply = async () => {
    if (!selectedJob) {
      showInlineNotice(t("jobs.alertSelectJobApply"));
      return;
    }

    if (optimization && !optimizationApproved) {
      showInlineNotice(t("jobs.alertApproveOptimization"));
      return;
    }

    if (applyReadiness.supportsDirect && applyReadiness.blocking.length > 0) {
      showToast(
        `Complete profile before direct submit: ${applyReadiness.blocking.join(", ")}`,
        "info"
      );
      return;
    }

    try {
      setIsApplying(true);
      const { data } = await api.post("/applications/smart-apply", {
        jobId: selectedJob.id,
        title: selectedJob.title,
        company: selectedJob.company,
        jobDescription: selectedJob.description || "",
        jobMatchScore: selectedJob.smartRanking?.jobScore ?? selectedJob.matchingScore ?? 0,
        proposalText: optimizationApproved && optimizedCoverLetter ? optimizedCoverLetter : proposal,
        mode: applyMode,
        dailyLimit,
        tone,
        reviewConfirmed,
        notes: optimizationApproved && optimizedCv
          ? `Submitted through smart apply workflow with approved optimized CV snapshot:\n\n${optimizedCv}`
          : "Submitted through smart apply workflow"
      });

      if (data.skipped) {
        if (data.reason === "low_job_match" && data.details?.score !== undefined) {
          showToast(
            `Application paused by safety rules. Match score: ${data.details.score}%. Minimum required: ${data.details.minimumRequired}%. You can lower this in Settings > Responsible Automation, or switch to Manual mode and apply again.`,
            "info"
          );
          return;
        }
        showToast(data.message || t("jobs.responsibleSkipDefault"), "info");
        return;
      }

      if (data.applySummary.scheduledFor) {
        const scheduledAt = new Date(data.applySummary.scheduledFor).toLocaleTimeString();
        showToast(t("jobs.queuedFeedback", { delay: data.applySummary.simulatedDelaySeconds, time: scheduledAt, remaining: data.applySummary.remainingToday }), "success");
      } else {
        showToast(t("jobs.manualFeedback", { remaining: data.applySummary.remainingToday }), "success");
      }

      // Surface external submission result as a secondary notification
      const ext = data.externalSubmission;
      if (ext) {
        if (ext.submitted) {
          const idNote = ext.externalApplicationId ? ` (ID: ${ext.externalApplicationId})` : "";
          showToast(`Also submitted directly to ${ext.provider}${idNote}.`, "success");
        } else if (ext.provider === "linkedin") {
          const link = selectedJob?.sourceLink;
          if (link) {
            showToast(`LinkedIn requires manual apply. Open the job link in a new tab: ${link}`, "info");
          } else {
            showToast("LinkedIn requires manual apply — open the job's source link to submit there.", "info");
          }
        } else if (ext.attempted && !ext.submitted && ext.missingFields?.length) {
          showToast(
            `Profile incomplete for direct submit. Fill in: ${ext.missingFields.join(", ")} — go to Profile settings.`,
            "info"
          );
        }
      }

      await loadAppliedJobs();
    } catch (error) {
      showToast(error.response?.data?.message || t("jobs.couldNotApply", {}, "Smart apply failed."), "danger");
    } finally {
      setIsApplying(false);
    }
  };

  const onAddApplication = async (job) => {
    try {
      await api.post("/applications", {
        jobId: job.id,
        title: job.title,
        company: job.company,
        jobDescription: job.description || "",
        status: "pending"
      });
      await loadAppliedJobs();
      showInlineNotice(t("jobs.alertAppAdded"));
    } catch (error) {
      showInlineNotice(error.response?.data?.message || t("jobs.couldNotAddApp", {}, "Could not add application."));
    }
  };

  const onIgnoreJob = async (job) => {
    setIgnoredJobIds((previous) => [...new Set([...previous, job.id])]);
    await trackJobBehavior(job, "ignored", { source: "job_card_ignore" });
  };

  const onSelectJob = (job) => {
    navigate("/jobs/view", { state: { job, isApplied: appliedJobIds.includes(job.id) } });
  };

  const onSaveProposal = async () => {
    if (!selectedJob) return;

    if (optimization && !optimizationApproved) {
      showInlineNotice(t("jobs.alertApproveOptimization"));
      return;
    }

    try {
      await api.post("/applications", {
        jobId: selectedJob.id,
        title: selectedJob.title,
        company: selectedJob.company,
        jobDescription: selectedJob.description || "",
        status: "pending",
        proposalText: optimizationApproved && optimizedCoverLetter ? optimizedCoverLetter : proposal
      });

      await loadAppliedJobs();
      showInlineNotice(t("jobs.alertProposalSaved"));
    } catch (error) {
      showInlineNotice(error.response?.data?.message || t("jobs.couldNotSave", {}, "Could not save proposal."));
    }
  };

  const onOptimizeApplication = async () => {
    if (!selectedJob) {
      showInlineNotice(t("jobs.alertSelectJob"));
      return;
    }

    const baseCoverLetter = String(user?.profileData?.coverLetterText || "").trim();
    const resolvedCoverLetter = proposal.trim() || baseCoverLetter;

    if (!resolvedCoverLetter) {
      showInlineNotice(t("jobs.alertGenerateProposalFirst"));
      return;
    }

    try {
      setOptimizationLoading(true);
      setOptimizationApproved(false);
      const { data } = await api.post("/proposals/optimize-job-application", {
        jobId: selectedJob.id,
        coverLetterOriginal: resolvedCoverLetter,
        cvOriginal: [
          `Candidate: ${user?.name || "Candidate"}`,
          `Skills: ${(user?.profileData?.skills || user?.skills || []).join(", ") || "N/A"}`,
          `Experience: ${user?.experience || "N/A"}`,
          user?.profileData?.cvRawText ? `CV Text: ${user.profileData.cvRawText}` : ""
        ]
          .filter(Boolean)
          .join("\n"),
        language: user?.preferences?.language || "en"
      });

      setOptimization(data);
      setOptimizedCoverLetter(data?.content?.optimizedCoverLetter || "");
      setOptimizedCv(data?.content?.optimizedCv || "");
    } catch (error) {
      showInlineNotice(error.response?.data?.message || t("jobs.optimizeFailed"));
    } finally {
      setOptimizationLoading(false);
    }
  };

  const onTailorCoverLetter = async () => {
    if (!selectedJob) {
      showInlineNotice(t("jobs.alertSelectJob"));
      return;
    }

    const baseCoverLetter = String(user?.profileData?.coverLetterText || "").trim();
    const resolvedCoverLetter = proposal.trim() || baseCoverLetter;

    if (!resolvedCoverLetter) {
      showInlineNotice(t("jobs.alertGenerateProposalFirst"));
      return;
    }

    try {
      setIsTailoring(true);
      const { data } = await api.post("/proposals/optimize-job-application", {
        jobId: selectedJob.id,
        coverLetterOriginal: resolvedCoverLetter,
        cvOriginal: [
          `Candidate: ${user?.name || "Candidate"}`,
          `Skills: ${(user?.profileData?.skills || user?.skills || []).join(", ") || "N/A"}`,
          `Experience: ${user?.experience || "N/A"}`,
          user?.profileData?.cvRawText ? `CV Text: ${user.profileData.cvRawText}` : ""
        ]
          .filter(Boolean)
          .join("\n"),
        language: user?.preferences?.language || "en"
      });

      const tailoredCover = String(data?.content?.optimizedCoverLetter || "").trim();
      if (!tailoredCover) {
        showToast(t("jobs.optimizeFailed"), "danger");
        return;
      }

      setProposal(tailoredCover);
      setAlternateProposal("");
      setReviewConfirmed(false);
      showToast("Cover letter tailored to this job. Review it, then apply.", "success");
    } catch (error) {
      showToast(error.response?.data?.message || t("jobs.optimizeFailed"), "danger");
    } finally {
      setIsTailoring(false);
    }
  };

  const matchingJobs = useMemo(
    () => jobs.filter((job) => !ignoredJobIds.includes(job.id)),
    [jobs, ignoredJobIds]
  );

  const applyReadiness = useMemo(() => {
    const sourceLink = String(selectedJob?.sourceLink || "").trim();
    const provider = detectApplyProviderFromLink(sourceLink);
    const supportsDirect =
      provider === "greenhouse" ||
      provider === "lever" ||
      provider === "ashby" ||
      provider === "smartrecruiters";
    const manualOnly = provider === "linkedin" || provider === "indeed";

    const blocking = [];
    const warnings = [];

    if (supportsDirect && !String(user?.name || "").trim()) blocking.push("Full name");
    if (supportsDirect && !String(user?.email || "").trim()) blocking.push("Email");

    if (provider === "greenhouse") {
      if (!String(user?.phone || "").trim()) warnings.push("Phone can be required by this posting");
      if (!String(user?.profileData?.cvRawText || "").trim()) warnings.push("Upload CV text for required resume fields");
      if (!String(user?.linkedinUrl || "").trim()) warnings.push("LinkedIn URL may be required on some forms");
    }

    if (provider === "lever" && !String(user?.phone || "").trim()) {
      warnings.push("Phone is recommended for higher pass rate");
    }

    if (provider === "ashby") {
      if (!String(user?.phone || "").trim()) warnings.push("Phone is recommended");
      if (!String(user?.profileData?.cvRawText || "").trim()) warnings.push("Upload CV for resume field");
    }

    if (provider === "smartrecruiters") {
      if (!String(user?.phone || "").trim()) warnings.push("Phone is recommended");
    }

    return {
      provider,
      sourceLink,
      supportsDirect,
      manualOnly,
      blocking,
      warnings
    };
  }, [selectedJob, user]);

  const applyCounts = useMemo(() => {
    const appliedCount = matchingJobs.filter((job) => appliedJobIds.includes(job.id)).length;
    return {
      all: matchingJobs.length,
      applied: appliedCount,
      "not-applied": matchingJobs.length - appliedCount
    };
  }, [matchingJobs, appliedJobIds]);

  const matchingWithApplyFilter = useMemo(
    () =>
      matchingJobs.filter((job) => {
        if (applyFilter === "applied") return appliedJobIds.includes(job.id);
        if (applyFilter === "not-applied") return !appliedJobIds.includes(job.id);
        return true;
      }),
    [matchingJobs, applyFilter, appliedJobIds]
  );

  const visibleTopMatches = useMemo(() => {
    return topMatches
      .filter((job) => !ignoredJobIds.includes(job.id))
      .filter((job) => {
        if (applyFilter === "applied") return appliedJobIds.includes(job.id);
        if (applyFilter === "not-applied") return !appliedJobIds.includes(job.id);
        return true;
      });
  }, [topMatches, ignoredJobIds, applyFilter, appliedJobIds]);

  const visibleJobs = useMemo(() => {
    if (!isFeedPage) {
      return matchingWithApplyFilter;
    }

    const topMatchIds = new Set(visibleTopMatches.map((item) => item.id));
    return matchingWithApplyFilter.filter((job) => !topMatchIds.has(job.id));
  }, [matchingWithApplyFilter, visibleTopMatches, isFeedPage]);

  const resetFeedFilters = () => {
    setApplyFilter("all");
    setSearchQuery("");
    setJobTypeFilter("all");
    setLocationFilter("all");
    setBudgetFilter("all");
    setSortBy("best-match");
    setPendingLiveJobs([]);
    setLivePreview(null);

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(FEED_PREFERENCES_STORAGE_KEY);
    }
  };

  const refreshLiveJobs = async () => {
    try {
      await loadJobsPage({ pageToLoad: 1, append: false });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error("Failed to refresh jobs feed", error);
    }
  };

  const analyzeExternalJob = async ({ useManualDescription = false } = {}) => {
    const trimmedLink = externalJobLink.trim();
    if (!trimmedLink && !externalJobManualDescription.trim()) {
      setExternalJobMessage(t("jobs.externalJobLinkRequired", {}, "Paste a job link to analyze."));
      return;
    }

    if (useManualDescription && !externalJobManualDescription.trim()) {
      setExternalJobMessage(
        t("jobs.externalJobDescriptionRequired", {}, "Paste the job description if extraction failed.")
      );
      return;
    }

    setExternalJobAnalyzing(true);
    setExternalJobMessage("");
    setExternalJobProposal("");
    setExternalJobOptimization(null);

    try {
      const { data } = await api.post("/jobs/analyze-external", {
        url: trimmedLink,
        manualDescription: externalJobManualDescription
      });

      if (data.needsManualDescription) {
        setExternalJobNeedsManual(true);
        setExternalJobExtracted(data.extracted || null);
        setExternalJobAnalysis(null);
        setExternalJobMessage(
          t(
            "jobs.externalJobManualNeeded",
            {},
            "We could not extract enough details. Paste the full job description below."
          )
        );
        return;
      }

      setExternalJobNeedsManual(false);
      setExternalJobExtracted(data.job || null);
      setExternalJobAnalysis(data);
      setExternalJobMessage(t("jobs.externalJobReady", {}, "Job analyzed successfully."));
    } catch (error) {
      setExternalJobMessage(
        error.response?.data?.message ||
          t("jobs.externalJobAnalyzeFailed", {}, "Could not analyze this job link.")
      );
    } finally {
      setExternalJobAnalyzing(false);
    }
  };

  const generateExternalJobProposal = async () => {
    if (!externalJobAnalysis?.job) return;

    setExternalJobActionLoading((previous) => ({ ...previous, proposal: true }));
    setExternalJobMessage("");
    try {
      const { data } = await api.post("/proposals/generate-external", {
        job: externalJobAnalysis.job,
        tone,
        language: user?.preferences?.language || "en"
      });
      setExternalJobProposal(data.proposal || "");
      setExternalJobMessage(t("jobs.externalProposalReady", {}, "Proposal generated successfully."));
    } catch (error) {
      setExternalJobMessage(
        error.response?.data?.message ||
          t("jobs.externalProposalFailed", {}, "Could not generate a proposal for this job.")
      );
    } finally {
      setExternalJobActionLoading((previous) => ({ ...previous, proposal: false }));
    }
  };

  const optimizeExternalJob = async () => {
    if (!externalJobAnalysis?.job) return;

    setExternalJobActionLoading((previous) => ({ ...previous, optimize: true }));
    setExternalJobMessage("");
    try {
      const { data } = await api.post("/proposals/optimize-external-job", {
        job: externalJobAnalysis.job,
        coverLetterOriginal:
          String(externalJobProposal || "").trim() || String(user?.profileData?.coverLetterText || "").trim(),
        cvOriginal: [
          `Candidate: ${user?.name || "Candidate"}`,
          `Skills: ${(user?.profileData?.skills || user?.skills || []).join(", ") || "N/A"}`,
          `Experience Summary: ${user?.experience || "N/A"}`,
          user?.profileData?.cvRawText ? `CV Text: ${user.profileData.cvRawText}` : ""
        ]
          .filter(Boolean)
          .join("\n"),
        language: user?.preferences?.language || "en"
      });

      setExternalJobOptimization(data);
      setExternalJobMessage(t("jobs.externalOptimizationReady", {}, "CV optimization complete."));
    } catch (error) {
      setExternalJobMessage(
        error.response?.data?.message ||
          t("jobs.externalOptimizationFailed", {}, "Could not optimize CV for this job.")
      );
    } finally {
      setExternalJobActionLoading((previous) => ({ ...previous, optimize: false }));
    }
  };

  const saveExternalJob = async () => {
    if (!externalJobAnalysis?.job) return;

    try {
      await api.post("/applications", {
        jobId: externalJobAnalysis.job.id,
        title: externalJobAnalysis.job.title,
        company: externalJobAnalysis.job.company,
        jobDescription: externalJobAnalysis.job.description || "",
        status: "pending",
        notes: externalJobAnalysis.job.sourceLink
          ? `External job source: ${externalJobAnalysis.job.sourceLink}`
          : "Saved from Bring Your Own Job",
        sourceTag: "User Added"
      });
      await loadAppliedJobs();
      setExternalJobMessage(t("jobs.externalJobSaved", {}, "External job saved to your tracked applications."));
    } catch (error) {
      setExternalJobMessage(
        error.response?.data?.message ||
          t("jobs.externalJobSaveFailed", {}, "Could not save this external job.")
      );
    }
  };

  const loadSavedExternalJob = async (application) => {
    const sourceLink = extractExternalSourceLink(application.notes);
    setExternalJobLink(sourceLink);
    setExternalJobManualDescription(application.jobDescription || "");
    setExternalJobNeedsManual(false);
    setExternalJobExtracted(null);
    setExternalJobProposal(application.proposalText || "");
    setExternalJobOptimization(null);
    setExternalJobMessage("");
    setExternalJobAnalyzing(true);

    try {
      const { data } = await api.post("/jobs/analyze-external", {
        url: sourceLink,
        manualDescription: application.jobDescription || ""
      });

      if (data.needsManualDescription) {
        setExternalJobNeedsManual(true);
        setExternalJobExtracted(data.extracted || null);
        setExternalJobAnalysis(null);
        setExternalJobMessage(
          t("jobs.externalJobManualNeeded", {}, "We could not extract enough details. Paste the full job description below.")
        );
        return;
      }

      setExternalJobAnalysis(data);
      setExternalJobMessage(t("jobs.externalJobLoaded", {}, "Saved external job loaded."));
    } catch (error) {
      setExternalJobMessage(
        error.response?.data?.message ||
          t("jobs.externalJobLoadFailed", {}, "Could not load this saved external job.")
      );
    } finally {
      setExternalJobAnalyzing(false);
    }
  };

  return (
    <div className={`jobs-layout ${isProposalDraftPage ? "jobs-layout-proposal" : "jobs-layout-feed"}`}>
      <div className="jobs-list jobs-feed-column">
        {!isProposalDraftPage && !isBestMatchesPage && (
        <>
        <div className="jobs-feed-sticky-stack">
        <div className="job-feed-controls jobs-compact-controls">
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t("jobs.searchPlaceholder", {}, "Search jobs by keyword (e.g. React, Remote)")}
            aria-label={t("jobs.searchAria", {}, "Search jobs")}
          />
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value)}
            aria-label={t("jobs.sortBy", {}, "Sort jobs")}
          >
            <option value="best-match">{t("jobs.sortBestMatch", {}, "Best match")}</option>
            <option value="newest">{t("jobs.sortNewest", {}, "Newest")}</option>
            <option value="highest-paying">{t("jobs.sortHighestPaying", {}, "Highest paying")}</option>
          </select>
          <button type="button" className="secondary job-feed-reset" onClick={resetFeedFilters}>
            {t("jobs.resetFilters", {}, "Reset")}
          </button>
          {!isPro && (
            <div className="jobs-free-plan-pill" role="status" aria-live="polite">
              {t(
                "jobs.freePlanUsageShort",
                { remaining: freePlanUsage.remaining, limit: freePlanUsage.limit },
                `${freePlanUsage.remaining}/${freePlanUsage.limit} free left`
              )}
            </div>
          )}
        </div>

        {false && (
        <section className="panel byo-job-panel">
          <div className="chart-head">
            <h3>{t("jobs.byoTitle", {}, "Bring Your Own Job")}</h3>
            <p className="muted">
              {t(
                "jobs.byoSub",
                {},
                "Paste a job link from any platform and let the AI analyze fit, generate a proposal, and optimize your CV."
              )}
            </p>
          </div>

          <div className="byo-job-form">
            <input
              type="text"
              value={externalJobLink}
              onChange={(event) => setExternalJobLink(event.target.value)}
              placeholder={t("jobs.byoLinkPlaceholder", {}, "Paste job link (optional if you provide description)")}
              aria-label={t("jobs.byoLinkAria", {}, "Paste job link")}
            />
            <button type="button" onClick={() => analyzeExternalJob()} disabled={externalJobAnalyzing}>
              {externalJobAnalyzing
                ? t("common.loading", {}, "Loading...")
                : t("jobs.byoAnalyze", {}, "Analyze Job")}
            </button>
          </div>

          {externalJobNeedsManual && (
            <div className="byo-job-manual">
              <textarea
                rows={8}
                value={externalJobManualDescription}
                onChange={(event) => setExternalJobManualDescription(event.target.value)}
                placeholder={t("jobs.byoManualPlaceholder", {}, "Paste the full job description here if extraction failed")}
              />
              <button type="button" className="secondary" onClick={() => analyzeExternalJob({ useManualDescription: true })}>
                {t("jobs.byoAnalyzeManual", {}, "Analyze Manual Description")}
              </button>
            </div>
          )}

          {externalJobMessage && <p className="muted small-note">{externalJobMessage}</p>}
          {externalJobLink.includes("linkedin") && (
            <p className="muted small-note">
              LinkedIn jobs can be analyzed and saved here, but direct auto-submission to LinkedIn is not possible (LinkedIn does not provide an apply API). You can generate a proposal and apply manually via the link.
            </p>
          )}

          {externalJobAnalysis?.job && (
            <div className="byo-job-result">
              {appliedJobIds.includes(externalJobAnalysis.job.id) && (
                <p className="success-text small-note">
                  {t("jobs.externalJobAlreadySaved", {}, "This external job is already in your tracked applications.")}
                </p>
              )}
              <div className="byo-job-result-head">
                <div>
                  <h4>{externalJobAnalysis.job.title}</h4>
                  <p className="muted">
                    {externalJobAnalysis.job.company} | {externalJobAnalysis.job.location}
                  </p>
                </div>
                <span className="dashboard-job-score">{externalJobAnalysis.matchScore || 0}/100</span>
              </div>

              <p>{externalJobAnalysis.job.description}</p>

              {Array.isArray(externalJobAnalysis.aiInsights) && externalJobAnalysis.aiInsights.length > 0 && (
                <ul className="dashboard-job-insights">
                  {externalJobAnalysis.aiInsights.map((insight, index) => (
                    <li key={`external-job-insight-${index}`}>{insight}</li>
                  ))}
                </ul>
              )}

              <div className="byo-job-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={saveExternalJob}
                  disabled={appliedJobIds.includes(externalJobAnalysis.job.id)}
                >
                  {appliedJobIds.includes(externalJobAnalysis.job.id)
                    ? t("jobCard.tracked", {}, "Tracked")
                    : t("jobs.saveExternalJob", {}, "Save External Job")}
                </button>
                <button
                  type="button"
                  onClick={generateExternalJobProposal}
                  disabled={externalJobActionLoading.proposal}
                >
                  {externalJobActionLoading.proposal
                    ? t("common.loading", {}, "Loading...")
                    : t("dashboard.generateProposal", {}, "Generate Proposal")}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={optimizeExternalJob}
                  disabled={externalJobActionLoading.optimize}
                >
                  {externalJobActionLoading.optimize
                    ? t("common.loading", {}, "Loading...")
                    : t("dashboard.optimizeCv", {}, "Optimize CV")}
                </button>
              </div>

              {externalJobProposal && (
                <div className="byo-job-output-block">
                  <strong>{t("dashboard.generatedProposal", {}, "Generated Proposal")}</strong>
                  <textarea rows={10} value={externalJobProposal} readOnly />
                </div>
              )}

              {externalJobOptimization?.content?.optimizedCv && (
                <div className="byo-job-output-grid">
                  <div className="byo-job-output-block">
                    <strong>{t("dashboard.optimizedCv", {}, "Optimized CV")}</strong>
                    <textarea rows={10} value={externalJobOptimization.content.optimizedCv} readOnly />
                  </div>
                  <div className="byo-job-output-block">
                    <strong>{t("optimization.optimizedCover", {}, "Optimized Cover Letter")}</strong>
                    <textarea rows={10} value={externalJobOptimization.content.optimizedCoverLetter || ""} readOnly />
                  </div>
                </div>
              )}
            </div>
          )}

          {savedExternalJobs.length > 0 && (
            <div className="byo-saved-jobs">
              <strong>{t("jobs.savedExternalJobs", {}, "Saved External Jobs")}</strong>
              <div className="byo-saved-jobs-list">
                {savedExternalJobs.map((item) => (
                  <button
                    key={item._id}
                    type="button"
                    className="secondary byo-saved-job-btn"
                    onClick={() => loadSavedExternalJob(item)}
                  >
                    <span>{item.title}</span>
                    <small>{item.company}</small>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
        )}

        {behaviorProfile?.totalEvents > 0 && (
          <p className="muted small-note">
            {t("jobs.personalizationHint", {
              budget: behaviorProfile.preferredBudgetLevel || t("jobs.personalizationUnknown")
            })}
          </p>
        )}
        {!isPro && (
          <div className="premium-lock-banner">
            <div>
              <strong>🔒 {t("jobs.bestMatchesLocked")}</strong>
              <p className="muted">{t("jobs.bestMatchesLockedSub")}</p>
            </div>
            <button
              type="button"
              onClick={() => startUpgradeCheckout("jobs_page_banner", "best_job_matches")}
              disabled={billingLoading}
            >
              {billingLoading ? t("settings.openingCheckout") : t("settings.upgradePro")}
            </button>
          </div>
        )}
        {pendingLiveJobs.length > 0 && livePreview && (
          <div className="jobs-live-banner" role="status" aria-live="polite">
            <div>
              <strong>{t("jobs.liveFeedTitle", {}, "New jobs just arrived")}</strong>
              <p className="muted small-note">
                {t(
                  "jobs.liveFeedSub",
                  { count: pendingLiveJobs.length },
                  `${pendingLiveJobs.length} new jobs are ready to load into your feed.`
                )}
              </p>
            </div>
            <button type="button" onClick={refreshLiveJobs}>
              {t("jobs.refreshFeed", {}, "Refresh Feed")}
            </button>
          </div>
        )}
        </div>
        {feedLoading && <p className="muted">{t("common.loading", {}, "Loading...")}</p>}
        {!feedLoading && matchingJobs.length === 0 && <p className="muted">{t("jobs.noMatchedJobs")}</p>}
        {visibleTopMatches.length > 0 && (
          <section className="top-matches-section">
            <div className="jobs-picks-header">
              <h4>{t("jobs.topMatchesTitle")}</h4>
              <p className="muted">{t("jobs.topMatchesSub")}</p>
            </div>
            <div className="top-matches-list">
              {visibleTopMatches.map((job) => (
                  <JobCard
                    key={`top-${job.id}`}
                    job={job}
                    compact
                    isApplied={appliedJobIds.includes(job.id)}
                    onGenerateProposal={onGenerateProposal}
                    onAddApplication={onAddApplication}
                    onIgnoreJob={onIgnoreJob}
                    isPro={isPro}
                    onUpgrade={(source, feature) => startUpgradeCheckout(source, feature)}
                    onSelectJob={onSelectJob}
                    isSelected={false}
                  />
                ))}
            </div>
          </section>
        )}
        {visibleJobs.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            compact
            isApplied={appliedJobIds.includes(job.id)}
            onGenerateProposal={onGenerateProposal}
            onAddApplication={onAddApplication}
            onIgnoreJob={onIgnoreJob}
            isPro={isPro}
            onUpgrade={(source, feature) => startUpgradeCheckout(source, feature)}
            onSelectJob={onSelectJob}
            isSelected={false}
          />
        ))}
        {!feedLoading && pagination.total > 0 && (
          <div className="jobs-pagination">
            <p className="muted small-note">
              {t(
                "jobs.paginationSummary",
                {},
                `Loaded ${jobs.length} of ${pagination.total} results`
              )}
            </p>
            <div className="jobs-pagination-controls">
              <div className="jobs-page-size">
                <label htmlFor="jobs-page-size-select">{t("jobs.pageSize", {}, "Page size")}</label>
                <select
                  id="jobs-page-size-select"
                  value={pageSize}
                  onChange={(event) => {
                    const nextPageSize = Number(event.target.value);
                    setPageSize(nextPageSize);
                  }}
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="jobs-infinite-status">
              {pagination.hasNext && (
                <button
                  type="button"
                  className="secondary jobs-load-more"
                  onClick={() => loadJobsPage({ pageToLoad: pagination.page + 1, append: true })}
                  disabled={isLoadingMore}
                >
                  {isLoadingMore
                    ? t("common.loading", {}, "Loading...")
                    : t("jobs.loadMoreJobs", {}, "Load More Jobs")}
                </button>
              )}
              {!pagination.hasNext && jobs.length > 0 && (
                <p className="muted small-note">
                  {t("jobs.allJobsLoaded", {}, "You have reached the end of the current job feed.")}
                </p>
              )}
              <div ref={loadMoreTriggerRef} className="jobs-load-trigger" aria-hidden="true" />
            </div>
          </div>
        )}
        </>
        )}

        {isBestMatchesPage && (
          <section className="panel jobs-best-matches-page">
            {!isPro && (
              <div className="premium-lock-banner premium-lock-banner-compact">
                <div>
                  <strong>🔒 {t("jobs.bestMatchesLocked")}</strong>
                  <p className="muted">{t("jobs.bestMatchesLockedSub")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => startUpgradeCheckout("jobs_best_matches_page", "best_job_matches")}
                  disabled={billingLoading}
                >
                  {billingLoading ? t("settings.openingCheckout") : t("settings.upgradePro")}
                </button>
              </div>
            )}

            {isPro && visibleTopMatches.length > 0 && (
              <section className="top-matches-section top-matches-section-page">
                <h4>{t("jobs.topMatchesTitle")}</h4>
                <p className="muted">{t("jobs.topMatchesSub")}</p>
                <div className="top-matches-list">
                  {visibleTopMatches.map((job) => (
                    <JobCard
                      key={`top-${job.id}`}
                      job={job}
                      compact
                      isApplied={appliedJobIds.includes(job.id)}
                      onGenerateProposal={onGenerateProposal}
                      onAddApplication={onAddApplication}
                      onIgnoreJob={onIgnoreJob}
                      isPro={isPro}
                      onUpgrade={(source, feature) => startUpgradeCheckout(source, feature)}
                      onSelectJob={onSelectJob}
                      isSelected={false}
                    />
                  ))}
                </div>
              </section>
            )}

            {isPro && !feedLoading && visibleTopMatches.length === 0 && (
              <p className="muted">{t("jobs.noMatchedJobs")}</p>
            )}
          </section>
        )}

      </div>
      {isProposalDraftPage && (
        <div className="proposal-draft-workspace">
          <section className="panel proposal-draft-context">
            <div className="chart-head">
              <h3>AI Proposal Draft</h3>
              <p className="muted">
                {selectedJob
                  ? `${selectedJob.title} | ${selectedJob.company}`
                  : "Generate a proposal from the Jobs tab first, then edit and submit it here."}
              </p>
            </div>
          </section>
          {loading && <p>{t("jobs.generatingProposal")}</p>}
          {!loading && (
            <div className="proposal-draft-grid">
              <div className="proposal-draft-main">
                <ProposalEditor
                  proposal={proposal}
                  setProposal={setProposal}
                  alternateProposal={alternateProposal}
                  onUseProfileCoverLetter={onUseProfileCoverLetter}
                  hasProfileCoverLetter={Boolean(String(user?.profileData?.coverLetterText || "").trim())}
                  tone={tone}
                  setTone={setTone}
                  insights={insights}
                  strategy={proposalStrategy}
                  selectedJob={selectedJob}
                  onGenerateAgain={onGenerateAgain}
                  onUseAlternate={onUseAlternate}
                  isPro={isPro}
                  onUpgrade={(source, feature) => startUpgradeCheckout(source, feature)}
                  billingLoading={billingLoading}
                />
              </div>

              <aside className="proposal-draft-side">
                <section className="panel smart-apply-panel">
                  <h4>{t("proposalEditor.smartApplyTitle")}</h4>
                  <div className="mode-toggle-row">
                    <button
                      type="button"
                      className={applyMode === "manual" ? "mode-button active-mode" : "mode-button secondary"}
                      onClick={() => setApplyMode("manual")}
                    >
                      {t("proposalEditor.modeManual")}
                    </button>
                    <button
                      type="button"
                      className={applyMode === "semi-automatic" ? "mode-button active-mode" : "mode-button secondary"}
                      onClick={() => {
                        if (!isPro) { startUpgradeCheckout("proposal_editor_mode_toggle", "smart_assist"); return; }
                        setApplyMode("semi-automatic");
                      }}
                      title={!isPro ? t("proposalEditor.smartAssistPro") : ""}
                    >
                      {!isPro ? `🔒 ${t("proposalEditor.modeSmartAssist")}` : t("proposalEditor.modeSmartAssist")}
                    </button>
                  </div>
                  {!isPro && <p className="muted">{t("proposalEditor.smartAssistPro")}</p>}
                  <div className="smart-grid">
                    <div>
                      <label htmlFor="dailyLimit">{t("proposalEditor.dailyLimit")}</label>
                      <input
                        id="dailyLimit"
                        type="number"
                        min="1"
                        max="25"
                        value={dailyLimit}
                        onChange={(e) => setDailyLimit(e.target.value)}
                      />
                    </div>
                  </div>
                  <label className="inline-check">
                    <input
                      type="checkbox"
                      checked={reviewConfirmed}
                      onChange={(e) => setReviewConfirmed(e.target.checked)}
                    />
                    {t("proposalEditor.reviewLabel")}
                  </label>
                  {!(user?.smartApplySettings?.requireReviewConfirmation !== false) && (
                    <p className="muted">{t("proposalEditor.reviewOptional")}</p>
                  )}
                  <p className="muted">{t("proposalEditor.modeNote")}</p>
                  <p className="muted">Applies are tracked within Zira AI. Direct submission works for Greenhouse and Lever jobs. LinkedIn and Indeed require manual apply — use the Open button if you see one.</p>
                  <div className="apply-readiness-card">
                    <p><strong>Apply readiness</strong></p>
                    <p className="muted">Provider: {applyReadiness.provider}</p>
                    {applyReadiness.supportsDirect && <p className="muted">Direct submit available for this job link.</p>}
                    {applyReadiness.manualOnly && <p className="muted">This provider requires manual submit on the source site.</p>}
                    {applyReadiness.blocking.length > 0 && (
                      <p className="danger-text">Missing required profile fields: {applyReadiness.blocking.join(", ")}</p>
                    )}
                    {applyReadiness.warnings.length > 0 && (
                      <p className="muted">Recommended before applying: {applyReadiness.warnings.join("; ")}</p>
                    )}
                    {applyReadiness.provider === "greenhouse" && (
                      <p className="muted">Note: some Greenhouse postings include custom required questions that still need manual completion.</p>
                    )}
                  </div>
                  {selectedJob?.sourceLink && selectedJob.sourceLink.includes("linkedin") && isDirectApplyLink(selectedJob.sourceLink) && (
                    <a
                      href={selectedJob.sourceLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="secondary inline-link-btn"
                    >
                      Open on LinkedIn to apply manually
                    </a>
                  )}
                  <div className="proposal-actions">
                    <button
                      type="button"
                      className="secondary"
                      onClick={onTailorCoverLetter}
                      disabled={!selectedJob || isTailoring || isApplying}
                    >
                      {isTailoring ? "Tailoring..." : "Tailor Cover Letter"}
                    </button>
                    <button
                      type="button"
                      onClick={onSmartApply}
                      disabled={!proposal.trim() || !selectedJob || isApplying || isTailoring}
                    >
                      {isApplying ? t("proposalEditor.applyingBtn") : t("proposalEditor.applyBtn")}
                    </button>
                    <button type="button" className="secondary" onClick={onSaveProposal}>
                      {t("proposalEditor.saveToTracker")}
                    </button>
                  </div>
                </section>
                <JobOptimizationPanel
                  isPro={isPro}
                  loading={optimizationLoading}
                  optimization={optimization}
                  optimizedCoverLetter={optimizedCoverLetter}
                  optimizedCv={optimizedCv}
                  setOptimizedCoverLetter={setOptimizedCoverLetter}
                  setOptimizedCv={setOptimizedCv}
                  approved={optimizationApproved}
                  setApproved={setOptimizationApproved}
                  onOptimize={onOptimizeApplication}
                  onUpgrade={(source, feature) => startUpgradeCheckout(source, feature)}
                />
                {proposal && (
                  <ProposalLearning
                    proposalHistoryId={proposalHistoryId}
                    selectedJob={selectedJob}
                    isPro={isPro}
                    onRegenerateSmart={onRegenerateSmart}
                    onUpgrade={(source, feature) => startUpgradeCheckout(source, feature)}
                    onNotify={showInlineNotice}
                  />
                )}
              </aside>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default JobsPage;
