import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { useI18n } from "../context/I18nContext";
import { useToast } from "../context/ToastContext";

const getTodayDateInput = () => new Date().toISOString().slice(0, 10);

const getDaysAgoDateInput = (daysAgo) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
};

const formatAdminDateTime = (value, fallback = "Never") => {
  if (!value) return fallback;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return parsed.toLocaleString();
};

const getSyncHealthLabel = (status, t) => {
  if (status === "success") return t("admin.syncHealthy", {}, "Healthy");
  if (status === "error") return t("admin.syncError", {}, "Error");
  if (status === "disabled") return t("admin.syncDisabled", {}, "Disabled");
  return t("admin.syncIdle", {}, "Idle");
};

function ConversionTrendChart({ points, t }) {
  const maxValue = Math.max(
    1,
    ...points.map((point) =>
      Math.max(
        point.lockImpressions,
        point.upgradeClicks,
        point.checkoutStarts,
        point.upgradesCompleted
      )
    )
  );

  return (
    <div className="conversion-trend-block">
      <div className="conversion-legend">
        <span className="legend-item lock">{t("admin.lockImpressions")}</span>
        <span className="legend-item click">{t("admin.upgradeClicks")}</span>
        <span className="legend-item checkout">{t("admin.checkoutStarts")}</span>
        <span className="legend-item upgrade">{t("admin.upgradesCompleted")}</span>
      </div>
      <div className="conversion-trend-chart" role="img" aria-label={t("admin.trendChartLabel")}>
        {points.map((point) => (
          <div key={point.date} className="conversion-day-col">
            <div className="conversion-bars">
              <div className="conversion-bar lock" style={{ height: `${(point.lockImpressions / maxValue) * 100}%` }} />
              <div className="conversion-bar click" style={{ height: `${(point.upgradeClicks / maxValue) * 100}%` }} />
              <div className="conversion-bar checkout" style={{ height: `${(point.checkoutStarts / maxValue) * 100}%` }} />
              <div className="conversion-bar upgrade" style={{ height: `${(point.upgradesCompleted / maxValue) * 100}%` }} />
            </div>
            <span className="weekly-day-label">{point.date.slice(5)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function JobSourceTrendChart({ points, t }) {
  const maxValue = Math.max(
    1,
    ...points.map((point) => Math.max(point.feedJobsAdded || 0, point.userAddedJobsAdded || 0))
  );

  return (
    <div className="job-source-trend-block">
      <div className="job-source-trend-legend">
        <span className="legend-item feed">{t("admin.feedJobs", {}, "Feed Jobs")}</span>
        <span className="legend-item user">{t("admin.userAddedJobs", {}, "User Added Jobs")}</span>
      </div>
      <div className="job-source-trend-chart" role="img" aria-label={t("admin.jobSourceTrendLabel", {}, "Job source trend chart") }>
        {points.map((point) => (
          <div key={point.date} className="job-source-day-col">
            <div className="job-source-bars">
              <div className="job-source-bar feed" style={{ height: `${((point.feedJobsAdded || 0) / maxValue) * 100}%` }} />
              <div className="job-source-bar user" style={{ height: `${((point.userAddedJobsAdded || 0) / maxValue) * 100}%` }} />
            </div>
            <span className="weekly-day-label">{point.date.slice(5)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminDashboardPage() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [jobSourceTrendDays, setJobSourceTrendDays] = useState(14);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    totalProposalsGenerated: 0,
    totalApplicationsSent: 0,
    jobSourceSummary: {
      tags: [],
      totals: {
        totalJobs: 0,
        feedJobs: 0,
        userAddedJobs: 0
      },
      trendDays: 14,
      trends: []
    },
    realJobSyncStatus: {
      enabled: true,
      providerCount: 0,
      cachedJobCount: 0,
      lastAttemptedAt: null,
      lastSuccessfulSyncAt: null,
      lastErrorMessage: null,
      providers: []
    },
    conversionAnalytics: {
      funnel: {
        lockImpressions: 0,
        upgradeClicks: 0,
        checkoutStarts: 0,
        upgradesCompleted: 0
      },
      recent: []
    }
  });
  const [users, setUsers] = useState([]);
  const [actionLoadingUserId, setActionLoadingUserId] = useState("");
  const [manualPayments, setManualPayments] = useState([]);
  const [manualPaymentSubmitting, setManualPaymentSubmitting] = useState(false);
  const [manualPaymentActionLoadingId, setManualPaymentActionLoadingId] = useState("");
  const [manualPaymentFilters, setManualPaymentFilters] = useState({
    userId: "",
    paymentMethod: "",
    status: "all",
    startDate: "",
    endDate: "",
    q: ""
  });
  const [manualPaymentForm, setManualPaymentForm] = useState({
    userId: "",
    billingCycle: "monthly",
    amountUsd: "",
    paymentMethod: "bank_transfer",
    reference: "",
    paidAt: getTodayDateInput(),
    subscriptionExpiresAt: "",
    notes: ""
  });
  const [supportRequests, setSupportRequests] = useState([]);
  const [supportStatusFilter, setSupportStatusFilter] = useState("all");
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportActionLoadingId, setSupportActionLoadingId] = useState("");
  const [conversionLoading, setConversionLoading] = useState(true);
  const [conversionFilters, setConversionFilters] = useState({
    startDate: getDaysAgoDateInput(13),
    endDate: getTodayDateInput(),
    surface: "all"
  });
  const [conversionAnalytics, setConversionAnalytics] = useState({
    availableSurfaces: [],
    funnel: {
      lockImpressions: 0,
      upgradeClicks: 0,
      checkoutStarts: 0,
      upgradesCompleted: 0,
      rates: {
        clickThroughRate: 0,
        checkoutStartRate: 0,
        upgradeCompletionRate: 0,
        overallConversionRate: 0
      }
    },
    trends: [],
    recent: []
  });

  const loadAdminData = async (trendDays = jobSourceTrendDays) => {
    setLoading(true);
    const [statsRes, usersRes] = await Promise.all([
      api.get("/admin/dashboard", { params: { trendDays } }),
      api.get("/admin/users")
    ]);

    setStats(statsRes.data);
    setUsers(usersRes.data);
    setLoading(false);
  };

  const loadManualPayments = async (filters = manualPaymentFilters) => {
    const params = new URLSearchParams({ limit: "200" });
    if (filters.userId) params.set("userId", filters.userId);
    if (filters.paymentMethod) params.set("paymentMethod", filters.paymentMethod);
    if (filters.status && filters.status !== "all") params.set("status", filters.status);
    if (filters.startDate) params.set("startDate", filters.startDate);
    if (filters.endDate) params.set("endDate", filters.endDate);
    if (filters.q) params.set("q", filters.q);

    const { data } = await api.get(`/admin/manual-payments?${params.toString()}`);
    setManualPayments(Array.isArray(data) ? data : []);
  };

  const loadConversionAnalytics = async () => {
    setConversionLoading(true);
    const params = new URLSearchParams({
      startDate: conversionFilters.startDate,
      endDate: conversionFilters.endDate,
      surface: conversionFilters.surface
    });

    const { data } = await api.get(`/admin/conversion-analytics?${params.toString()}`);
    setConversionAnalytics(data);
    setConversionLoading(false);
  };

  useEffect(() => {
    loadAdminData().catch((error) => {
      console.error(t("admin.failedLoad"), error);
      setLoading(false);
    });
    loadManualPayments().catch((error) => {
      console.error("Failed to load manual payments", error);
    });
  }, [jobSourceTrendDays]);

  useEffect(() => {
    loadConversionAnalytics().catch((error) => {
      console.error(t("admin.failedLoadAnalytics"), error);
      setConversionLoading(false);
    });
  }, [conversionFilters.startDate, conversionFilters.endDate, conversionFilters.surface]);

  useEffect(() => {
    loadManualPayments().catch((error) => {
      console.error("Failed to load manual payments", error);
    });
  }, [
    manualPaymentFilters.userId,
    manualPaymentFilters.paymentMethod,
    manualPaymentFilters.status,
    manualPaymentFilters.startDate,
    manualPaymentFilters.endDate,
    manualPaymentFilters.q
  ]);

  useEffect(() => {
    if (activeTab !== "support") return;
    loadSupportRequests(supportStatusFilter).catch((error) => {
      console.error("Failed to load support requests", error);
      setSupportLoading(false);
    });
  }, [activeTab, supportStatusFilter]);

  const rows = useMemo(() => users, [users]);

  const loadSupportRequests = async (status = supportStatusFilter) => {
    try {
      setSupportLoading(true);
      const params = new URLSearchParams({ limit: "100" });
      if (status && status !== "all") {
        params.set("status", status);
      }
      const { data } = await api.get(`/admin/support-requests?${params.toString()}`);
      setSupportRequests(Array.isArray(data) ? data : []);
    } finally {
      setSupportLoading(false);
    }
  };

  const onFilterChange = (event) => {
    const { name, value } = event.target;
    setConversionFilters((previous) => ({ ...previous, [name]: value }));
  };

  const exportAnalytics = async () => {
    const params = new URLSearchParams({
      startDate: conversionFilters.startDate,
      endDate: conversionFilters.endDate,
      surface: conversionFilters.surface,
      format: "csv"
    });

    const response = await api.get(`/admin/conversion-analytics?${params.toString()}`, {
      responseType: "blob"
    });

    const blobUrl = window.URL.createObjectURL(response.data);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = `conversion-events-${conversionFilters.startDate}-to-${conversionFilters.endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(blobUrl);
  };

  const toggleBan = async (user) => {
    try {
      setActionLoadingUserId(user.id);
      await api.put(`/admin/users/${user.id}/ban`, { banned: !user.isBanned });
      await loadAdminData();
    } catch (error) {
      showToast(error.response?.data?.message || t("admin.failedBanUpdate"), "danger");
    } finally {
      setActionLoadingUserId("");
    }
  };

  const setManualSubscription = async (user, plan) => {
    try {
      setActionLoadingUserId(user.id);
      let expiresAt = null;
      let reason = "manual_admin_override";

      if (plan === "pro") {
        const expiryInput = window.prompt(
          t(
            "admin.promptExpiry",
            {},
            "Optional expiry date (YYYY-MM-DD). Leave empty for no expiry."
          )
        );

        if (expiryInput && expiryInput.trim()) {
          const parsed = new Date(`${expiryInput.trim()}T23:59:59.000Z`);
          if (Number.isNaN(parsed.getTime())) {
            showToast(t("admin.invalidExpiry", {}, "Invalid expiry date format."), "danger");
            return;
          }
          expiresAt = parsed.toISOString();
        }
      }

      const reasonInput = window.prompt(
        t("admin.promptReason", {}, "Optional reason for this manual subscription update:"),
        reason
      );
      reason = (reasonInput || reason).trim() || "manual_admin_override";

      await api.put(`/admin/users/${user.id}/manual-subscription`, {
        plan,
        expiresAt,
        reason
      });
      await loadAdminData();
    } catch (error) {
      showToast(error.response?.data?.message || t("admin.failedUpgrade"), "danger");
    } finally {
      setActionLoadingUserId("");
    }
  };

  const onManualPaymentFormChange = (event) => {
    const { name, value } = event.target;
    setManualPaymentForm((previous) => ({ ...previous, [name]: value }));
  };

  const onManualPaymentFilterChange = (event) => {
    const { name, value } = event.target;
    setManualPaymentFilters((previous) => ({ ...previous, [name]: value }));
  };

  const exportManualPayments = async () => {
    const params = new URLSearchParams({ limit: "200", format: "csv" });
    if (manualPaymentFilters.userId) params.set("userId", manualPaymentFilters.userId);
    if (manualPaymentFilters.paymentMethod) params.set("paymentMethod", manualPaymentFilters.paymentMethod);
    if (manualPaymentFilters.status && manualPaymentFilters.status !== "all") {
      params.set("status", manualPaymentFilters.status);
    }
    if (manualPaymentFilters.startDate) params.set("startDate", manualPaymentFilters.startDate);
    if (manualPaymentFilters.endDate) params.set("endDate", manualPaymentFilters.endDate);
    if (manualPaymentFilters.q) params.set("q", manualPaymentFilters.q);

    const response = await api.get(`/admin/manual-payments?${params.toString()}`, {
      responseType: "blob"
    });

    const blobUrl = window.URL.createObjectURL(response.data);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = `manual-payments-${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(blobUrl);
  };

  const updateManualPaymentStatus = async (payment, status) => {
    try {
      setManualPaymentActionLoadingId(payment.id);
      await api.put(`/admin/manual-payments/${payment.id}/status`, {
        status,
        reason: `admin_marked_${status}`
      });
      await Promise.all([loadManualPayments(), loadAdminData()]);
      showToast(
        t(
          "admin.manualPaymentStatusUpdated",
          { status },
          `Manual payment marked as ${status}.`
        ),
        "success"
      );
    } catch (error) {
      showToast(
        error.response?.data?.message ||
          t("admin.failedManualPaymentStatus", {}, "Failed to update manual payment status."),
        "danger"
      );
    } finally {
      setManualPaymentActionLoadingId("");
    }
  };

  const submitManualPayment = async (event) => {
    event.preventDefault();

    try {
      setManualPaymentSubmitting(true);
      const payload = {
        userId: manualPaymentForm.userId,
        billingCycle: manualPaymentForm.billingCycle,
        amountUsd: Number(manualPaymentForm.amountUsd),
        paymentMethod: manualPaymentForm.paymentMethod,
        reference: manualPaymentForm.reference,
        paidAt: manualPaymentForm.paidAt ? `${manualPaymentForm.paidAt}T12:00:00.000Z` : undefined,
        subscriptionExpiresAt: manualPaymentForm.subscriptionExpiresAt
          ? `${manualPaymentForm.subscriptionExpiresAt}T23:59:59.000Z`
          : undefined,
        notes: manualPaymentForm.notes
      };

      await api.post("/admin/manual-payments", payload);
      await Promise.all([loadManualPayments(), loadAdminData()]);

      setManualPaymentForm((previous) => ({
        ...previous,
        amountUsd: "",
        reference: "",
        subscriptionExpiresAt: "",
        notes: ""
      }));
      showToast(t("admin.manualPaymentRecorded", {}, "Manual payment recorded and Pro activated."), "success");
    } catch (error) {
      showToast(
        error.response?.data?.message ||
          t("admin.failedManualPayment", {}, "Failed to record manual payment."),
        "danger"
      );
    } finally {
      setManualPaymentSubmitting(false);
    }
  };

  const updateSupportStatus = async (requestId, status) => {
    try {
      setSupportActionLoadingId(requestId);
      await api.put(`/admin/support-requests/${requestId}/status`, { status });
      await loadSupportRequests(supportStatusFilter);
    } catch (error) {
      showToast(error.response?.data?.message || "Failed to update support request status.", "danger");
    } finally {
      setSupportActionLoadingId("");
    }
  };

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar panel">
        <h3>{t("admin.consoleTitle")}</h3>
        <button
          type="button"
          className={activeTab === "overview" ? "active-admin-tab" : "secondary"}
          onClick={() => setActiveTab("overview")}
        >
          {t("admin.overview")}
        </button>
        <button
          type="button"
          className={activeTab === "users" ? "active-admin-tab" : "secondary"}
          onClick={() => setActiveTab("users")}
        >
          {t("admin.userManagement")}
        </button>
        <button
          type="button"
          className={activeTab === "manual-payments" ? "active-admin-tab" : "secondary"}
          onClick={() => setActiveTab("manual-payments")}
        >
          {t("admin.manualPayments", {}, "Manual Payments")}
        </button>
        <button
          type="button"
          className={activeTab === "support" ? "active-admin-tab" : "secondary"}
          onClick={() => setActiveTab("support")}
        >
          {t("admin.supportRequests", {}, "Support Requests")}
        </button>
      </aside>

      <section className="admin-content">
        {activeTab === "overview" && (
          <>
            <div className="grid-two">
              <div className="stat-card">
                <h3>{t("admin.totalUsers")}</h3>
                <p>{loading ? "--" : stats.totalUsers}</p>
              </div>
              <div className="stat-card">
                <h3>{t("admin.activeUsers7d")}</h3>
                <p>{loading ? "--" : stats.activeUsers}</p>
              </div>
              <div className="stat-card">
                <h3>{t("admin.totalProposalsGenerated")}</h3>
                <p>{loading ? "--" : stats.totalProposalsGenerated}</p>
              </div>
              <div className="stat-card">
                <h3>{t("admin.totalApplicationsSent")}</h3>
                <p>{loading ? "--" : stats.totalApplicationsSent}</p>
              </div>
            </div>

            <div className="panel">
              <h4>{t("admin.jobSourceSummaryTitle", {}, "Job Source Summary")}</h4>
              <p className="muted">
                {t(
                  "admin.jobSourceSummarySub",
                  {},
                  "Track how many jobs are Suggested from feed versus Your Job submissions."
                )}
              </p>
              <div className="grid-two conversion-grid">
                <div className="stat-card compact-stat">
                  <h3>{t("admin.feedJobs", {}, "Feed Jobs (Suggested)")}</h3>
                  <p>{loading ? "--" : stats.jobSourceSummary?.totals?.feedJobs || 0}</p>
                </div>
                <div className="stat-card compact-stat">
                  <h3>{t("admin.userAddedJobs", {}, "User Added Jobs (Your Job)")}</h3>
                  <p>{loading ? "--" : stats.jobSourceSummary?.totals?.userAddedJobs || 0}</p>
                </div>
              </div>
              <p className="muted small-note">
                {t("admin.totalJobsTracked", {}, "Total jobs tracked")}: {loading ? "--" : stats.jobSourceSummary?.totals?.totalJobs || 0}
              </p>
              {!loading && Array.isArray(stats.jobSourceSummary?.trends) && stats.jobSourceSummary.trends.length > 0 && (
                <div className="panel job-source-trend-panel">
                  <div className="job-source-trend-head">
                    <h5>
                      {t(
                        "admin.jobSourceTrendTitle",
                        { days: stats.jobSourceSummary?.trendDays || jobSourceTrendDays },
                        `${stats.jobSourceSummary?.trendDays || jobSourceTrendDays}-Day Source Trend`
                      )}
                    </h5>
                    <div className="job-source-trend-toggle" role="group" aria-label={t("admin.jobSourceTrendToggle", {}, "Job source trend range") }>
                      {[14, 30].map((days) => (
                        <button
                          key={days}
                          type="button"
                          className={jobSourceTrendDays === days ? "active-admin-tab" : "secondary"}
                          onClick={() => setJobSourceTrendDays(days)}
                        >
                          {days}d
                        </button>
                      ))}
                    </div>
                  </div>
                  <JobSourceTrendChart points={stats.jobSourceSummary.trends} t={t} />
                </div>
              )}
            </div>

            <div className="panel">
              <h4>{t("admin.realJobSyncTitle", {}, "Real Job Sync Status")}</h4>
              <p className="muted">
                {t(
                  "admin.realJobSyncSub",
                  {},
                  "Monitor the latest external feed refresh and provider health for real job ingestion."
                )}
              </p>
              <div className="grid-two conversion-grid">
                <div className="stat-card compact-stat">
                  <h3>{t("admin.lastSuccessfulRefresh", {}, "Last successful refresh")}</h3>
                  <p>
                    {loading
                      ? "--"
                      : formatAdminDateTime(
                          stats.realJobSyncStatus?.lastSuccessfulSyncAt,
                          t("admin.never", {}, "Never")
                        )}
                  </p>
                </div>
                <div className="stat-card compact-stat">
                  <h3>{t("admin.lastRefreshAttempt", {}, "Last refresh attempt")}</h3>
                  <p>
                    {loading
                      ? "--"
                      : formatAdminDateTime(
                          stats.realJobSyncStatus?.lastAttemptedAt,
                          t("admin.never", {}, "Never")
                        )}
                  </p>
                </div>
                <div className="stat-card compact-stat">
                  <h3>{t("admin.cachedRealJobs", {}, "Cached real jobs")}</h3>
                  <p>{loading ? "--" : stats.realJobSyncStatus?.cachedJobCount || 0}</p>
                </div>
                <div className="stat-card compact-stat">
                  <h3>{t("admin.activeProviders", {}, "Providers")}</h3>
                  <p>{loading ? "--" : stats.realJobSyncStatus?.providerCount || 0}</p>
                </div>
              </div>
              {!loading && stats.realJobSyncStatus?.lastErrorMessage && (
                <p className="muted small-note real-job-sync-error">
                  {t("admin.latestSyncIssue", {}, "Latest sync issue")}: {stats.realJobSyncStatus.lastErrorMessage}
                </p>
              )}
              {!loading && Array.isArray(stats.realJobSyncStatus?.providers) && stats.realJobSyncStatus.providers.length > 0 && (
                <div className="real-job-provider-grid">
                  {stats.realJobSyncStatus.providers.map((provider) => (
                    <article
                      key={provider.id}
                      className={`real-job-provider-card provider-status-${provider.status || "idle"}`}
                    >
                      <div className="real-job-provider-head">
                        <strong>{provider.name}</strong>
                        <span className={`status-badge real-job-sync-badge ${provider.status || "idle"}`}>
                          {getSyncHealthLabel(provider.status, t)}
                        </span>
                      </div>
                      <p className="muted small-note">
                        {t("admin.providerJobsFetched", {}, "Jobs fetched")}: {provider.fetchedJobCount || 0}
                      </p>
                      <p className="muted small-note">
                        {t("admin.providerLastSuccess", {}, "Last success")}: {formatAdminDateTime(
                          provider.lastSuccessfulSyncAt,
                          t("admin.never", {}, "Never")
                        )}
                      </p>
                      <p className="muted small-note">
                        {t("admin.providerLastAttempt", {}, "Last attempt")}: {formatAdminDateTime(
                          provider.lastAttemptedAt,
                          t("admin.never", {}, "Never")
                        )}
                      </p>
                      {provider.lastErrorMessage && (
                        <p className="muted small-note real-job-sync-error">{provider.lastErrorMessage}</p>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className="panel">
              <h4>{t("admin.activityInsights")}</h4>
              <p className="muted">
                {t("admin.insightsText")}
              </p>
            </div>

            <div className="panel">
              <h4>{t("admin.conversionTitle")}</h4>
              <p className="muted">{t("admin.conversionSubtext")}</p>
              <div className="admin-filter-row">
                <div>
                  <label htmlFor="startDate">{t("admin.startDate")}</label>
                  <input id="startDate" type="date" name="startDate" value={conversionFilters.startDate} onChange={onFilterChange} />
                </div>
                <div>
                  <label htmlFor="endDate">{t("admin.endDate")}</label>
                  <input id="endDate" type="date" name="endDate" value={conversionFilters.endDate} onChange={onFilterChange} />
                </div>
                <div>
                  <label htmlFor="surface">{t("admin.surfaceFilter")}</label>
                  <select id="surface" name="surface" value={conversionFilters.surface} onChange={onFilterChange}>
                    <option value="all">{t("admin.allSurfaces")}</option>
                    {conversionAnalytics.availableSurfaces.map((surface) => (
                      <option key={surface} value={surface}>{surface}</option>
                    ))}
                  </select>
                </div>
                <div className="admin-filter-action">
                  <button type="button" className="secondary" onClick={exportAnalytics}>
                    {t("admin.exportCsv")}
                  </button>
                </div>
              </div>

              <div className="grid-two conversion-grid conversion-rate-grid">
                <div className="stat-card compact-stat">
                  <h3>{t("admin.clickThroughRate")}</h3>
                  <p>{conversionLoading ? "--" : `${conversionAnalytics.funnel?.rates?.clickThroughRate || 0}%`}</p>
                </div>
                <div className="stat-card compact-stat">
                  <h3>{t("admin.checkoutStartRate")}</h3>
                  <p>{conversionLoading ? "--" : `${conversionAnalytics.funnel?.rates?.checkoutStartRate || 0}%`}</p>
                </div>
                <div className="stat-card compact-stat">
                  <h3>{t("admin.upgradeCompletionRate")}</h3>
                  <p>{conversionLoading ? "--" : `${conversionAnalytics.funnel?.rates?.upgradeCompletionRate || 0}%`}</p>
                </div>
                <div className="stat-card compact-stat">
                  <h3>{t("admin.overallConversionRate")}</h3>
                  <p>{conversionLoading ? "--" : `${conversionAnalytics.funnel?.rates?.overallConversionRate || 0}%`}</p>
                </div>
              </div>

              <div className="grid-two conversion-grid">
                <div className="stat-card compact-stat">
                  <h3>{t("admin.lockImpressions")}</h3>
                  <p>{conversionLoading ? "--" : conversionAnalytics?.funnel?.lockImpressions || 0}</p>
                </div>
                <div className="stat-card compact-stat">
                  <h3>{t("admin.upgradeClicks")}</h3>
                  <p>{conversionLoading ? "--" : conversionAnalytics?.funnel?.upgradeClicks || 0}</p>
                </div>
                <div className="stat-card compact-stat">
                  <h3>{t("admin.checkoutStarts")}</h3>
                  <p>{conversionLoading ? "--" : conversionAnalytics?.funnel?.checkoutStarts || 0}</p>
                </div>
                <div className="stat-card compact-stat">
                  <h3>{t("admin.upgradesCompleted")}</h3>
                  <p>{conversionLoading ? "--" : conversionAnalytics?.funnel?.upgradesCompleted || 0}</p>
                </div>
              </div>

              {conversionAnalytics.trends?.length > 0 && (
                <div className="panel conversion-chart-panel">
                  <h5>{t("admin.trendTitle")}</h5>
                  <ConversionTrendChart points={conversionAnalytics.trends} t={t} />
                </div>
              )}

              {!conversionLoading && conversionAnalytics?.recent?.length > 0 && (
                <div className="tracker-table-wrap">
                  <table className="tracker-table admin-users-table admin-conversion-table">
                    <thead>
                      <tr>
                        <th>{t("admin.eventType")}</th>
                        <th>{t("admin.surface")}</th>
                        <th>{t("admin.feature")}</th>
                        <th>{t("admin.plan")}</th>
                        <th>{t("admin.timestamp")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {conversionAnalytics.recent.map((item) => (
                        <tr key={`${item.eventType}-${item.createdAt}-${item.surface}`}>
                          <td>{item.eventType}</td>
                          <td>{item.surface}</td>
                          <td>{item.feature || "-"}</td>
                          <td>{item.planAtEvent}</td>
                          <td>{new Date(item.createdAt).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!conversionLoading && conversionAnalytics?.recent?.length === 0 && (
                <p className="muted">{t("admin.noAnalyticsEvents")}</p>
              )}
            </div>
          </>
        )}

        {activeTab === "users" && (
          <div className="panel">
            <h4>{t("admin.allUsers")}</h4>
            {loading && <p>{t("admin.loadingUsers")}</p>}
            {!loading && rows.length === 0 && <p className="muted">{t("admin.noUsers")}</p>}
            {!loading && rows.length > 0 && (
              <div className="tracker-table-wrap">
                <table className="tracker-table admin-users-table">
                  <thead>
                    <tr>
                      <th>{t("admin.name")}</th>
                      <th>{t("admin.email")}</th>
                      <th>{t("admin.plan")}</th>
                      <th>{t("admin.credits")}</th>
                      <th>{t("admin.dateJoined")}</th>
                      <th>{t("admin.status")}</th>
                      <th>{t("admin.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((item) => (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>{item.email}</td>
                        <td>
                          <strong>{item.plan}</strong>
                          <div className="muted small">
                            {item.subscriptionStatus || "inactive"}
                            {item.subscriptionExpiresAt
                              ? ` • ${t("admin.expiresOn", {}, "expires")}: ${new Date(item.subscriptionExpiresAt).toLocaleDateString()}`
                              : ""}
                          </div>
                        </td>
                        <td>{item.credits}</td>
                        <td>{new Date(item.dateJoined).toLocaleDateString()}</td>
                        <td>
                          {item.isBanned ? (
                            <span className="status-badge rejected">{t("admin.banned")}</span>
                          ) : (
                            <span className="status-badge accepted">{t("admin.active")}</span>
                          )}
                        </td>
                        <td>
                          <div className="admin-actions">
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => toggleBan(item)}
                              disabled={actionLoadingUserId === item.id}
                            >
                              {item.isBanned ? t("admin.unban") : t("admin.ban")}
                            </button>
                            <button
                              type="button"
                              onClick={() => setManualSubscription(item, "pro")}
                              disabled={item.plan === "pro" || actionLoadingUserId === item.id}
                            >
                              {t("admin.upgradeToPro")}
                            </button>
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => setManualSubscription(item, "free")}
                              disabled={item.plan === "free" || actionLoadingUserId === item.id}
                            >
                              {t("admin.setFree", {}, "Set Free")}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "manual-payments" && (
          <div className="panel">
            <h4>{t("admin.manualPaymentsTitle", {}, "Manual Payments Dashboard")}</h4>
            <p className="muted">
              {t(
                "admin.manualPaymentsSub",
                {},
                "Record local payments and automatically activate Pro subscriptions with an optional expiry."
              )}
            </p>

            <div className="manual-payment-filters">
              <div>
                <label htmlFor="filterManualUser">{t("admin.user", {}, "User")}</label>
                <select
                  id="filterManualUser"
                  name="userId"
                  value={manualPaymentFilters.userId}
                  onChange={onManualPaymentFilterChange}
                >
                  <option value="">{t("admin.allUsers", {}, "All users")}</option>
                  {rows.map((item) => (
                    <option key={`filter-${item.id}`} value={item.id}>
                      {item.name} ({item.email})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="filterManualMethod">{t("admin.paymentMethod", {}, "Payment method")}</label>
                <input
                  id="filterManualMethod"
                  name="paymentMethod"
                  value={manualPaymentFilters.paymentMethod}
                  onChange={onManualPaymentFilterChange}
                  placeholder={t("admin.methodFilterPlaceholder", {}, "bank_transfer / mobile_money")}
                />
              </div>
              <div>
                <label htmlFor="filterManualStatus">{t("admin.status", {}, "Status")}</label>
                <select
                  id="filterManualStatus"
                  name="status"
                  value={manualPaymentFilters.status}
                  onChange={onManualPaymentFilterChange}
                >
                  <option value="all">{t("admin.allStatuses", {}, "All statuses")}</option>
                  <option value="confirmed">{t("admin.confirmed", {}, "confirmed")}</option>
                  <option value="refunded">{t("admin.refunded", {}, "refunded")}</option>
                  <option value="voided">{t("admin.voided", {}, "voided")}</option>
                </select>
              </div>
              <div>
                <label htmlFor="filterManualQ">{t("admin.search", {}, "Search")}</label>
                <input
                  id="filterManualQ"
                  name="q"
                  value={manualPaymentFilters.q}
                  onChange={onManualPaymentFilterChange}
                  placeholder={t("admin.searchPlaceholder", {}, "Reference or notes")}
                />
              </div>
              <div>
                <label htmlFor="filterManualStart">{t("admin.startDate", {}, "Start date")}</label>
                <input
                  id="filterManualStart"
                  type="date"
                  name="startDate"
                  value={manualPaymentFilters.startDate}
                  onChange={onManualPaymentFilterChange}
                />
              </div>
              <div>
                <label htmlFor="filterManualEnd">{t("admin.endDate", {}, "End date")}</label>
                <input
                  id="filterManualEnd"
                  type="date"
                  name="endDate"
                  value={manualPaymentFilters.endDate}
                  onChange={onManualPaymentFilterChange}
                />
              </div>
              <div className="manual-payment-filter-actions">
                <button type="button" className="secondary" onClick={exportManualPayments}>
                  {t("admin.exportCsv", {}, "Export CSV")}
                </button>
              </div>
            </div>

            <form className="manual-payment-form" onSubmit={submitManualPayment}>
              <div>
                <label htmlFor="manualUserId">{t("admin.user", {}, "User")}</label>
                <select
                  id="manualUserId"
                  name="userId"
                  value={manualPaymentForm.userId}
                  onChange={onManualPaymentFormChange}
                  required
                >
                  <option value="">{t("admin.selectUser", {}, "Select user")}</option>
                  {rows.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="manualBillingCycle">{t("admin.billingCycle", {}, "Billing cycle")}</label>
                <select
                  id="manualBillingCycle"
                  name="billingCycle"
                  value={manualPaymentForm.billingCycle}
                  onChange={onManualPaymentFormChange}
                >
                  <option value="monthly">{t("admin.monthly", {}, "Monthly")}</option>
                  <option value="yearly">{t("admin.yearly", {}, "Yearly")}</option>
                </select>
              </div>

              <div>
                <label htmlFor="manualAmountUsd">{t("admin.amountUsd", {}, "Amount (USD)")}</label>
                <input
                  id="manualAmountUsd"
                  name="amountUsd"
                  type="number"
                  min="1"
                  step="0.01"
                  value={manualPaymentForm.amountUsd}
                  onChange={onManualPaymentFormChange}
                  required
                />
              </div>

              <div>
                <label htmlFor="manualPaymentMethod">{t("admin.paymentMethod", {}, "Payment method")}</label>
                <input
                  id="manualPaymentMethod"
                  name="paymentMethod"
                  value={manualPaymentForm.paymentMethod}
                  onChange={onManualPaymentFormChange}
                  placeholder={t("admin.paymentMethodPlaceholder", {}, "bank_transfer / mobile_money / cash")}
                  required
                />
              </div>

              <div>
                <label htmlFor="manualReference">{t("admin.reference", {}, "Reference")}</label>
                <input
                  id="manualReference"
                  name="reference"
                  value={manualPaymentForm.reference}
                  onChange={onManualPaymentFormChange}
                  placeholder={t("admin.referencePlaceholder", {}, "Transaction id or receipt no")}
                  required
                />
              </div>

              <div>
                <label htmlFor="manualPaidAt">{t("admin.paidAt", {}, "Paid date")}</label>
                <input
                  id="manualPaidAt"
                  name="paidAt"
                  type="date"
                  value={manualPaymentForm.paidAt}
                  onChange={onManualPaymentFormChange}
                  required
                />
              </div>

              <div>
                <label htmlFor="manualExpiresAt">{t("admin.subscriptionExpiresAt", {}, "Subscription expires (optional)")}</label>
                <input
                  id="manualExpiresAt"
                  name="subscriptionExpiresAt"
                  type="date"
                  value={manualPaymentForm.subscriptionExpiresAt}
                  onChange={onManualPaymentFormChange}
                />
              </div>

              <div>
                <label htmlFor="manualNotes">{t("admin.notes", {}, "Notes")}</label>
                <input
                  id="manualNotes"
                  name="notes"
                  value={manualPaymentForm.notes}
                  onChange={onManualPaymentFormChange}
                  placeholder={t("admin.notesPlaceholder", {}, "Optional details")}
                />
              </div>

              <div className="manual-payment-submit-row">
                <button type="submit" disabled={manualPaymentSubmitting}>
                  {manualPaymentSubmitting
                    ? t("admin.recording", {}, "Recording...")
                    : t("admin.recordPayment", {}, "Record payment")}
                </button>
              </div>
            </form>
            <div className="tracker-table-wrap">
              <table className="tracker-table admin-users-table admin-manual-payments-table">
                <thead>
                  <tr>
                    <th>{t("admin.user", {}, "User")}</th>
                    <th>{t("admin.billingCycle", {}, "Cycle")}</th>
                    <th>{t("admin.amountUsd", {}, "Amount")}</th>
                    <th>{t("admin.paymentMethod", {}, "Method")}</th>
                    <th>{t("admin.reference", {}, "Reference")}</th>
                    <th>{t("admin.paidAt", {}, "Paid")}</th>
                    <th>{t("admin.subscriptionExpiresAt", {}, "Expires")}</th>
                    <th>{t("admin.recordedBy", {}, "Recorded By")}</th>
                    <th>{t("admin.status", {}, "Status")}</th>
                    <th>{t("admin.actions", {}, "Actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {manualPayments.length === 0 && (
                    <tr>
                      <td colSpan={10} className="muted">
                        {t("admin.noManualPayments", {}, "No manual payments recorded yet.")}
                      </td>
                    </tr>
                  )}
                  {manualPayments.map((item) => (
                    <tr key={item.id}>
                      <td>{item.userName}<div className="muted small">{item.userEmail}</div></td>
                      <td>{item.billingCycle}</td>
                      <td>${Number(item.amountUsd || 0).toFixed(2)}</td>
                      <td>{item.paymentMethod}</td>
                      <td>{item.reference}</td>
                      <td>{new Date(item.paidAt).toLocaleDateString()}</td>
                      <td>{new Date(item.subscriptionExpiresAt).toLocaleDateString()}</td>
                      <td>{item.recordedByName}</td>
                      <td>{item.status}</td>
                      <td>
                        <div className="admin-actions">
                          <button
                            type="button"
                            className="secondary"
                            disabled={item.status === "confirmed" || manualPaymentActionLoadingId === item.id}
                            onClick={() => updateManualPaymentStatus(item, "confirmed")}
                          >
                            {t("admin.restoreConfirmed", {}, "Restore Confirmed")}
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            disabled={item.status !== "confirmed" || manualPaymentActionLoadingId === item.id}
                            onClick={() => updateManualPaymentStatus(item, "refunded")}
                          >
                            {t("admin.markRefunded", {}, "Mark Refunded")}
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            disabled={item.status !== "confirmed" || manualPaymentActionLoadingId === item.id}
                            onClick={() => updateManualPaymentStatus(item, "voided")}
                          >
                            {t("admin.markVoided", {}, "Mark Voided")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "support" && (
          <div className="panel">
            <h4>{t("admin.supportRequests", {}, "Support Requests")}</h4>
            <p className="muted">
              {t("admin.supportRequestsSub", {}, "Review and update user-submitted issues.")}
            </p>

            <div className="admin-filter-row">
              <div>
                <label htmlFor="support-status-filter">{t("admin.status", {}, "Status")}</label>
                <select
                  id="support-status-filter"
                  value={supportStatusFilter}
                  onChange={(event) => setSupportStatusFilter(event.target.value)}
                >
                  <option value="all">{t("admin.allStatuses", {}, "All statuses")}</option>
                  <option value="open">open</option>
                  <option value="reviewed">reviewed</option>
                  <option value="closed">closed</option>
                </select>
              </div>
            </div>

            {supportLoading && <p className="muted">{t("common.loading", {}, "Loading...")}</p>}
            {!supportLoading && supportRequests.length === 0 && (
              <p className="muted">{t("admin.noSupportRequests", {}, "No support requests found.")}</p>
            )}

            {!supportLoading && supportRequests.length > 0 && (
              <div className="support-admin-list">
                {supportRequests.map((item) => (
                  <article key={item.id} className="support-admin-card">
                    <div className="support-admin-head">
                      <div>
                        <h5>{item.subject}</h5>
                        <p className="muted small-note">
                          {item.requesterName} ({item.requesterEmail})
                        </p>
                      </div>
                      <span className="status-badge pending">{item.status}</span>
                    </div>
                    <p>{item.message}</p>
                    <p className="muted small-note">{new Date(item.createdAt).toLocaleString()}</p>
                    <div className="admin-actions">
                      <button
                        type="button"
                        className="secondary"
                        disabled={supportActionLoadingId === item.id}
                        onClick={() => updateSupportStatus(item.id, "reviewed")}
                      >
                        Mark Reviewed
                      </button>
                      <button
                        type="button"
                        disabled={supportActionLoadingId === item.id}
                        onClick={() => updateSupportStatus(item.id, "closed")}
                      >
                        Close
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        disabled={supportActionLoadingId === item.id}
                        onClick={() => updateSupportStatus(item.id, "open")}
                      >
                        Reopen
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

export default AdminDashboardPage;
