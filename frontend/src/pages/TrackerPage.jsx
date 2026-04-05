import { useEffect, useState } from "react";
import { api } from "../api/client";
import StatusBadge from "../components/StatusBadge";
import OutcomeSparkline from "../components/OutcomeSparkline";
import { useI18n } from "../context/I18nContext";
import { useToast } from "../context/ToastContext";

const formatCountdown = (scheduledFor, now) => {
  const diff = Math.max(new Date(scheduledFor).getTime() - now, 0);
  const totalSeconds = Math.floor(diff / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

function TrackerPage() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [rescheduleValues, setRescheduleValues] = useState({});
  const [auditLog, setAuditLog] = useState([]);
  const [auditOpen, setAuditOpen] = useState(false);
  const [updatingOutcomeId, setUpdatingOutcomeId] = useState("");
  const [retryingExternalId, setRetryingExternalId] = useState("");
  const [learningInsights, setLearningInsights] = useState(null);
  const [applySummary, setApplySummary] = useState(null);
  const [activityTimeline, setActivityTimeline] = useState([]);
  const { t } = useI18n();
  const { showToast } = useToast();

  const loadApplications = async () => {
    setLoading(true);
    const { data } = await api.get("/applications");
    setApplications(data);
    setLoading(false);
  };

  const loadAuditLog = async () => {
    const { data } = await api.get("/applications/audit-log");
    setAuditLog(data);
  };

  const loadLearningInsights = async () => {
    const { data } = await api.get("/applications/learning-insights");
    setLearningInsights(data);
  };

  const loadApplySummary = async () => {
    const { data } = await api.get("/applications/apply-summary");
    setApplySummary(data);
  };

  const loadActivityTimeline = async () => {
    const { data } = await api.get("/activity/timeline?limit=120");
    setActivityTimeline(data.items || []);
  };

  useEffect(() => {
    Promise.all([
      loadApplications(),
      loadAuditLog(),
      loadLearningInsights(),
      loadApplySummary(),
      loadActivityTimeline()
    ]).catch((error) => {
      console.error("Failed to load tracker data", error);
      setLoading(false);
    });

    const countdownTimer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    const refreshTimer = window.setInterval(() => {
      Promise.all([loadApplications(), loadApplySummary(), loadActivityTimeline()]).catch((error) =>
        console.error("Failed to refresh applications", error)
      );
    }, 15000);

    return () => {
      window.clearInterval(countdownTimer);
      window.clearInterval(refreshTimer);
    };
  }, []);

  const updateStatus = async (applicationId, status) => {
    await api.put(`/applications/${applicationId}`, { status });
    loadApplications();
  };

  const updateOutcome = async (applicationId, outcome) => {
    try {
      setUpdatingOutcomeId(applicationId);
      await api.put(`/applications/${applicationId}/outcome`, { outcome });
      await Promise.all([loadApplications(), loadLearningInsights()]);
    } catch (error) {
      console.error("Failed to update outcome", error);
    } finally {
      setUpdatingOutcomeId("");
    }
  };

  const queuedApplications = applications.filter((item) => item.submissionStatus === "scheduled");
  const draftQueueApplications = applications.filter((item) => item.submissionStatus === "draft");

  const cancelQueue = async (applicationId) => {
    await api.put(`/applications/${applicationId}/cancel-queue`);
    await Promise.all([loadApplications(), loadAuditLog()]);
  };

  const rescheduleQueue = async (applicationId) => {
    const delaySeconds = rescheduleValues[applicationId] || 45;
    await api.put(`/applications/${applicationId}/reschedule`, { delaySeconds });
    await Promise.all([loadApplications(), loadAuditLog()]);
  };

  const updateRescheduleValue = (applicationId, value) => {
    setRescheduleValues((previous) => ({
      ...previous,
      [applicationId]: value
    }));
  };

  const retryExternal = async (applicationId) => {
    try {
      setRetryingExternalId(applicationId);
      const { data } = await api.post(`/applications/${applicationId}/retry-external`);
      const nextExternalSubmission = data?.externalSubmission || null;
      setApplications((prev) =>
        prev.map((app) =>
          app._id === applicationId ? { ...app, externalSubmission: nextExternalSubmission } : app
        )
      );

      if (nextExternalSubmission?.submitted) {
        const providerLabel = nextExternalSubmission.provider || t("tracker.externalProviderFallback");
        showToast(t("tracker.retrySuccess", { provider: providerLabel }), "success");
      } else {
        const retryMessage =
          nextExternalSubmission?.message ||
          t("tracker.retryIncomplete");
        showToast(retryMessage, "info");
      }
    } catch (error) {
      console.error("Failed to retry external submission", error);
      showToast(error.response?.data?.message || t("tracker.retryFailed"), "danger");
    } finally {
      setRetryingExternalId("");
    }
  };

  const hourlyTrend = applySummary?.responsibleAutomation?.usage?.hourlyTrend || [];
  const hourlyTrendMax = Math.max(
    1,
    applySummary?.responsibleAutomation?.usage?.hourlyTrendMaxCount || 0
  );

  return (
    <div className="panel">
      <h3>{t("tracker.title")}</h3>
      {applySummary?.responsibleAutomation?.enabled && (
        <section className="learning-insights-panel responsible-panel">
          <div className="learning-insights-head">
            <h4>{t("tracker.responsiblePanelTitle")}</h4>
            <p className="muted">{t("tracker.responsiblePanelSub")}</p>
          </div>
          <div className="learning-insights-grid">
            <article className="learning-kpi neutral">
              <span>{t("tracker.hourlyUsage")}</span>
              <strong>
                {applySummary.responsibleAutomation.usage.appliedThisHour}/
                {applySummary.responsibleAutomation.usage.maxApplicationsPerHour}
              </strong>
            </article>
            <article className="learning-kpi neutral">
              <span>{t("tracker.dailyUsage")}</span>
              <strong>
                {applySummary.responsibleAutomation.usage.appliedToday}/
                {applySummary.responsibleAutomation.usage.maxApplicationsPerDay}
              </strong>
            </article>
            <article className="learning-kpi positive">
              <span>{t("tracker.nextWindow")}</span>
              <strong>{applySummary.responsibleAutomation.activeWindow.hint}</strong>
            </article>
          </div>
          {hourlyTrend.length > 0 && (
            <div className="responsible-mini-chart">
              <div className="responsible-mini-chart-head">
                <p className="muted">{t("tracker.hourlyTrendTitle")}</p>
                <small className="muted">
                  {t("tracker.hourlyTrendLegend", {
                    max: hourlyTrendMax
                  })}
                </small>
              </div>
              <div className="responsible-bars" role="img" aria-label={t("tracker.hourlyTrendTitle")}>
                {hourlyTrend.map((point, index) => {
                  const safeCount = Number(point.count) || 0;
                  const heightPct = Math.max(6, Math.round((safeCount / hourlyTrendMax) * 100));
                  const showLabel = index % 6 === 0 || index === hourlyTrend.length - 1;

                  return (
                    <div key={`${point.label}-${index}`} className="responsible-bar-col">
                      <div
                        className="responsible-bar"
                        style={{ height: `${heightPct}%` }}
                        title={`${point.label}: ${safeCount}`}
                      />
                      {showLabel && <span className="responsible-bar-label">{point.label.slice(0, 2)}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}
      <section className="learning-insights-panel activity-timeline-panel">
        <div className="learning-insights-head">
          <h4>{t("tracker.activityTitle")}</h4>
          <p className="muted">{t("tracker.activitySub")}</p>
        </div>
        {activityTimeline.length === 0 && <p className="muted">{t("tracker.noActivityYet")}</p>}
        {activityTimeline.length > 0 && (
          <div className="activity-timeline-list">
            {activityTimeline.map((item) => {
              const timeText = new Date(item.createdAt).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit"
              });

              return (
                <p key={item._id} className="activity-line">
                  <strong>{timeText}</strong> - {item.message}
                </p>
              );
            })}
          </div>
        )}
      </section>
      {learningInsights && (
        <section className="learning-insights-panel">
          <div className="learning-insights-head">
            <h4>{t("tracker.learningTitle")}</h4>
            <p className="muted">{t("tracker.learningSub")}</p>
          </div>
          <div className="learning-insights-grid">
            <article className="learning-kpi positive">
              <span>{t("tracker.positiveOutcomes")}</span>
              <strong>{learningInsights.positiveExamples}</strong>
            </article>
            <article className="learning-kpi negative">
              <span>{t("tracker.negativeOutcomes")}</span>
              <strong>{learningInsights.negativeExamples}</strong>
            </article>
            <article className="learning-kpi neutral">
              <span>{t("tracker.positiveRate")}</span>
              <strong>{learningInsights.positiveRate}%</strong>
            </article>
          </div>
          {learningInsights.trendPoints?.length > 0 && (
            <div className="learning-trend-block">
              <p className="muted">
                {t("tracker.learningTrend")}: {t(`tracker.trend${learningInsights.trendDirection[0].toUpperCase()}${learningInsights.trendDirection.slice(1)}`)}
              </p>
              <OutcomeSparkline
                points={learningInsights.trendPoints}
                direction={learningInsights.trendDirection}
                title={t("tracker.learningTrendTitle")}
                formatTooltip={(point) => {
                  const outcomeLabel =
                    point.outcome === "job_won"
                      ? t("tracker.outcomeJobWon")
                      : point.outcome === "response_received"
                      ? t("tracker.outcomeResponseReceived")
                      : t("tracker.outcomeNoResponse");
                  return `${point.label}: ${outcomeLabel} (${point.score})`;
                }}
              />
            </div>
          )}
          <p className="learning-influence-text">{t("tracker.aiInfluence")}: {learningInsights.influenceSummary}</p>
        </section>
      )}
      {!loading && queuedApplications.length > 0 && (
        <div className="queue-section">
          <h4>{t("tracker.scheduledQueue")}</h4>
          <div className="queue-grid">
            {queuedApplications.map((item) => (
              <article key={item._id} className="queue-card">
                <div>
                  <strong>{item.title}</strong>
                  <p className="muted">{item.company}</p>
                </div>
                <p>
                  {t("tracker.sendsIn")} <strong>{formatCountdown(item.scheduledFor, now)}</strong>
                </p>
                <p className="muted">
                  {t("tracker.scheduledFor")} {new Date(item.scheduledFor).toLocaleTimeString()} | {t("tracker.delay")} {item.simulatedDelaySeconds}s
                </p>
                <div className="queue-actions">
                  <input
                    type="number"
                    min="15"
                    max="300"
                    value={rescheduleValues[item._id] ?? item.simulatedDelaySeconds ?? 45}
                    onChange={(event) => updateRescheduleValue(item._id, event.target.value)}
                  />
                  <button className="secondary" onClick={() => rescheduleQueue(item._id)}>
                    {t("tracker.reschedule")}
                  </button>
                  <button className="secondary" onClick={() => cancelQueue(item._id)}>
                    {t("tracker.cancelQueue")}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
      {!loading && draftQueueApplications.length > 0 && (
        <div className="queue-section">
          <h4>{t("tracker.queuedDrafts")}</h4>
          <div className="queue-grid">
            {draftQueueApplications.map((item) => (
              <article key={item._id} className="queue-card draft-card">
                <div>
                  <strong>{item.title}</strong>
                  <p className="muted">{item.company}</p>
                </div>
                <p className="muted">{t("tracker.canceledDraft")}</p>
                <div className="queue-actions">
                  <input
                    type="number"
                    min="15"
                    max="300"
                    value={rescheduleValues[item._id] ?? 45}
                    onChange={(event) => updateRescheduleValue(item._id, event.target.value)}
                  />
                  <button className="secondary" onClick={() => rescheduleQueue(item._id)}>
                    {t("tracker.scheduleAgain")}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
      {loading && <p>{t("tracker.loading")}</p>}
      {!loading && applications.length === 0 && <p className="muted">{t("tracker.noApplications")}</p>}
      {!loading && applications.length > 0 && (
        <div className="tracker-table-wrap">
          <table className="tracker-table">
            <thead>
              <tr>
                <th>{t("tracker.colRole")}</th>
                <th>{t("tracker.colCompany")}</th>
                <th>{t("tracker.colStatus")}</th>
                <th>{t("tracker.colApplyMode")}</th>
                <th>{t("tracker.colSubmission")}</th>
                <th>{t("tracker.colExternal")}</th>
                <th>{t("tracker.colOutcome")}</th>
                <th>{t("tracker.colUpdate")}</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((item) => (
                <tr key={item._id}>
                  <td>{item.title}</td>
                  <td>{item.company}</td>
                  <td>
                    <StatusBadge status={item.status} />
                  </td>
                  <td>
                    <div>
                      <div>{item.applicationMode || "manual"}</div>
                      <small className="muted">
                          {item.reviewConfirmed ? t("tracker.reviewed") : t("tracker.notReviewed")}
                      </small>
                    </div>
                  </td>
                  <td>
                    <div>
                      <div>{item.submissionStatus || t("tracker.submitted")}</div>
                      {item.scheduledFor && item.submissionStatus === "scheduled" && (
                        <small className="muted">
                          {new Date(item.scheduledFor).toLocaleTimeString()}
                        </small>
                      )}
                      {item.simulatedDelaySeconds > 0 && (
                        <small className="muted">delay {item.simulatedDelaySeconds}s</small>
                      )}
                    </div>
                  </td>
                  <td>
                    {item.externalSubmission?.attempted ? (
                      <div className="ext-submission-audit">
                        <small className={item.externalSubmission.submitted ? "ext-sub-ok" : "danger-text"}>
                          {item.externalSubmission.submitted
                            ? `✓ ${t("tracker.externalSubmitted", {
                                provider: item.externalSubmission.provider
                              })}`
                            : `✗ ${t("tracker.externalFailed", {
                                provider: item.externalSubmission.provider
                              })}`}
                        </small>
                        {item.externalSubmission.externalApplicationId && (
                          <small className="muted">
                            {t("tracker.externalId", {
                              id: item.externalSubmission.externalApplicationId
                            })}
                          </small>
                        )}
                        {!item.externalSubmission.submitted && item.externalSubmission.message && (
                          <small className="muted ext-sub-msg">{item.externalSubmission.message}</small>
                        )}
                        {!item.externalSubmission.submitted && (
                          <button
                            className="secondary ext-sub-retry"
                            disabled={retryingExternalId === item._id}
                            onClick={() => retryExternal(item._id)}
                          >
                            {retryingExternalId === item._id
                              ? t("tracker.retryInProgress")
                              : t("tracker.retryCta")}
                          </button>
                        )}
                      </div>
                    ) : (
                      <small className="muted ext-sub-empty">{t("tracker.externalNotAttempted")}</small>
                    )}
                  </td>
                  <td>
                    <div>
                      <select
                        value={item.outcome || "unknown"}
                        disabled={updatingOutcomeId === item._id}
                        onChange={(event) => updateOutcome(item._id, event.target.value)}
                      >
                        <option value="unknown">{t("tracker.outcomeUnknown")}</option>
                        <option value="no_response">{t("tracker.outcomeNoResponse")}</option>
                        <option value="response_received">{t("tracker.outcomeResponseReceived")}</option>
                        <option value="job_won">{t("tracker.outcomeJobWon")}</option>
                      </select>
                      {item.outcomeUpdatedAt && (
                        <small className="muted">
                          {t("tracker.updatedAt")} {new Date(item.outcomeUpdatedAt).toLocaleString()}
                        </small>
                      )}
                    </div>
                  </td>
                  <td>
                    <select
                      value={item.status}
                      onChange={(event) => updateStatus(item._id, event.target.value)}
                    >
                      <option value="pending">{t("tracker.statusPending")}</option>
                      <option value="accepted">{t("tracker.statusAccepted")}</option>
                      <option value="rejected">{t("tracker.statusRejected")}</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && auditLog.length > 0 && (
        <div className="audit-log-section">
          <button
            className="secondary audit-log-toggle"
            onClick={() => setAuditOpen((previous) => !previous)}
          >
            {auditLog.length === 1
              ? t("tracker.queueHistoryOne", { count: auditLog.length })
              : t("tracker.queueHistoryMany", { count: auditLog.length })}
            <span>{auditOpen ? "▲" : "▼"}</span>
          </button>
          {auditOpen && (
            <div className="audit-log-list">
              {auditLog.map((entry) => (
                <article key={entry._id} className={`audit-entry audit-${entry.action}`}>
                  <div className="audit-meta">
                    <span className={`audit-badge audit-badge-${entry.action}`}>
                        {entry.action === "cancel"
                          ? t("tracker.cancelled")
                          : entry.action === "reschedule"
                          ? t("tracker.rescheduled")
                          : entry.action === "review_checkpoint"
                          ? t("tracker.reviewCheckpointAction")
                          : entry.action === "submit"
                          ? t("tracker.submittedAction")
                          : entry.action === "schedule"
                          ? t("tracker.scheduledAction")
                          : entry.action === "skip"
                          ? t("tracker.skippedAction")
                          : t("tracker.policyBlockedAction")}
                    </span>
                    <strong>{entry.jobTitle}</strong>
                    <span className="muted">{entry.company}</span>
                  </div>
                  <div className="audit-detail muted">
                    {entry.action === "cancel" && entry.previousScheduledFor && (
                      <>{t("tracker.wasScheduledFor")} {new Date(entry.previousScheduledFor).toLocaleString()}</>
                    )}
                    {entry.action === "reschedule" && (
                      <>
                        {entry.previousScheduledFor
                          ? `${new Date(entry.previousScheduledFor).toLocaleTimeString()}`
                          : t("tracker.fromDraft")}{" "}
                        → {new Date(entry.newScheduledFor).toLocaleTimeString()} (+{entry.delaySeconds}s)
                      </>
                    )}
                    {entry.action === "submit" && <>{t("tracker.submittedByPolicy")}</>}
                    {entry.action === "schedule" && (
                      <>
                        {t("tracker.scheduledByPolicy")} {entry.newScheduledFor ? new Date(entry.newScheduledFor).toLocaleTimeString() : ""}
                      </>
                    )}
                    {entry.action === "review_checkpoint" && (
                      <>
                        {t("tracker.reviewCheckpointDetail", {
                          name: entry.metadata?.approvedByName || "-",
                          time: entry.metadata?.reviewedAt
                            ? new Date(entry.metadata.reviewedAt).toLocaleString()
                            : "-"
                        })}
                      </>
                    )}
                    {(entry.action === "skip" || entry.action === "policy_block") && (
                      <>
                        {t("tracker.reasonLabel")} {entry.reason || t("tracker.notAvailable")}
                      </>
                    )}
                  </div>
                  <small className="muted">{new Date(entry.createdAt).toLocaleString()}</small>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default TrackerPage;
