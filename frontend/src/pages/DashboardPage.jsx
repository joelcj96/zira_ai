import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import OutcomeSparkline from "../components/OutcomeSparkline";
import { useI18n } from "../context/I18nContext";

function StatCard({ title, value, delay }) {
  const ref = useRef(null);

  const handleMouseMove = (e) => {
    const card = ref.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    card.style.transform = `perspective(700px) rotateX(${-y * 10}deg) rotateY(${x * 10}deg) translateY(-4px) scale(1.03)`;
  };

  const handleMouseLeave = () => {
    if (ref.current) ref.current.style.transform = "";
  };

  return (
    <div
      ref={ref}
      className="stat-card"
      style={{ animationDelay: `${delay}s` }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <h3>{title}</h3>
      <p>{value}</p>
    </div>
  );
}

function MiniBar({ label, value, total, tone }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="mini-bar-row">
      <div className="mini-bar-head">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="mini-bar-track">
        <div
          className={`mini-bar-fill ${tone || "tone-neutral"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function WeeklyActivityChart({ points, maxValue }) {
  return (
    <div className="weekly-chart" role="img" aria-label="Weekly activity chart">
      {points.map((point) => {
        const appHeight = maxValue > 0 ? Math.max(6, Math.round((point.applications / maxValue) * 100)) : 0;
        const proposalHeight =
          maxValue > 0 ? Math.max(6, Math.round((point.proposals / maxValue) * 100)) : 0;

        return (
          <div key={point.dayKey} className="weekly-day-col">
            <div className="weekly-bars">
              <div
                className="weekly-bar weekly-bar-apps"
                style={{ height: `${appHeight}%` }}
                title={`${point.applications} applications`}
              />
              <div
                className="weekly-bar weekly-bar-proposals"
                style={{ height: `${proposalHeight}%` }}
                title={`${point.proposals} proposals`}
              />
            </div>
            <span className="weekly-day-label">{point.label}</span>
          </div>
        );
      })}
    </div>
  );
}

const getProposalScore = (application) => {
  const textLength = (application.proposalText || "").trim().length;
  const hasTone = Boolean(application.toneUsed);
  const hasReview = Boolean(application.reviewConfirmed);

  let score = 0;
  if (application.status === "accepted") score += 72;
  if (application.status === "pending") score += 36;
  if (application.status === "rejected") score += 18;

  score += Math.min(Math.floor(textLength / 45), 22);
  if (hasTone) score += 4;
  if (hasReview) score += 2;

  return Math.min(score, 100);
};

const summarizeProposal = (text) => {
  if (!text) return "No proposal text available.";
  return text.length > 130 ? `${text.slice(0, 130).trim()}...` : text;
};

const getDayKey = (dateInput) => {
  const date = new Date(dateInput);
  return date.toISOString().slice(0, 10);
};

const getDateDaysAgo = (daysAgo) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date;
};

const getRecentDayPoints = () => {
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return Array.from({ length: 7 }).map((_, idx) => {
    const date = getDateDaysAgo(6 - idx);
    return {
      dayKey: getDayKey(date),
      label: labels[date.getDay()],
      applications: 0,
      proposals: 0
    };
  });
};

const getRollingResponseRate = (apps, fromDate, toDate) => {
  const scoped = apps.filter((item) => {
    const at = new Date(item.submittedAt || item.createdAt);
    return at >= fromDate && at < toDate;
  });

  if (scoped.length === 0) return 0;

  const responded = scoped.filter(
    (item) => item.status === "accepted" || item.status === "rejected"
  ).length;

  return Math.round((responded / scoped.length) * 100);
};

const getCurrentActivityStreak = (activityDayKeys) => {
  const days = new Set(activityDayKeys);
  let streak = 0;
  let cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  while (days.has(getDayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
};

const getStreakTier = (days) => {
  if (days >= 14) {
    return {
      key: "gold",
      label: "Gold",
      nextAt: null,
      helper: "Elite consistency unlocked"
    };
  }

  if (days >= 7) {
    return {
      key: "silver",
      label: "Silver",
      nextAt: 14,
      helper: "Strong momentum"
    };
  }

  if (days >= 3) {
    return {
      key: "bronze",
      label: "Bronze",
      nextAt: 7,
      helper: "Great start"
    };
  }

  return {
    key: "starter",
    label: "Starter",
    nextAt: 3,
    helper: "Build your streak"
  };
};

function DashboardPage() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [credits, setCredits] = useState(null);
  const [stats, setStats] = useState({
    sent: 0,
    proposalsGenerated: 0,
    responseRate: 0,
    won: 0,
    weeklyActions: 0,
    pending: 0,
    rejected: 0
  });
  const [statusSeries, setStatusSeries] = useState({ accepted: 0, pending: 0, rejected: 0 });
  const [modeSeries, setModeSeries] = useState({ manual: 0, "semi-automatic": 0 });
  const [bestProposals, setBestProposals] = useState([]);
  const [weeklyPoints, setWeeklyPoints] = useState([]);
  const [insightTip, setInsightTip] = useState(t("dashboard.insightDefault"));
  const [streakDays, setStreakDays] = useState(0);
  const [celebrateTier, setCelebrateTier] = useState("");
  const [learningInsights, setLearningInsights] = useState(null);
  const [searchParams] = useSearchParams();
  const requestedDashboardSection = searchParams.get("section");
  const activeDashboardSection = ["overview", "performance"].includes(requestedDashboardSection)
    ? requestedDashboardSection
    : "overview";

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [applicationsRes, creditsRes, proposalsRes, learningRes] = await Promise.all([
        api.get("/applications"),
        api.get("/credits/balance").catch(() => null),
        api.get("/proposals/history?limit=250&skip=0").catch(() => ({ data: { proposals: [], total: 0 } })),
        api.get("/applications/learning-insights").catch(() => null)
      ]);

      const proposalHistoryData = proposalsRes?.data || { proposals: [], total: 0 };
      const proposalHistory = proposalHistoryData.proposals || [];
      const proposalTotal = Number(proposalHistoryData.total) || proposalHistory.length;

      setCredits(creditsRes?.data || null);
      setLearningInsights(learningRes?.data || null);

      const apps = applicationsRes.data;
      const sentApps = apps.filter(
        (item) => item.submissionStatus === "submitted" || !item.submissionStatus
      );
      const accepted = sentApps.filter((item) => item.status === "accepted");
      const rejected = sentApps.filter((item) => item.status === "rejected");
      const pending = sentApps.filter((item) => item.status === "pending");
      const responses = accepted.length + rejected.length;
      const responseRate = sentApps.length > 0 ? Math.round((responses / sentApps.length) * 100) : 0;

      const ranked = sentApps
        .filter((item) => item.proposalText)
        .map((item) => ({
          id: item._id,
          title: item.title,
          company: item.company,
          tone: item.toneUsed || "professional",
          status: item.status,
          score: getProposalScore(item),
          preview: summarizeProposal(item.proposalText)
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

      const modeBreakdown = sentApps.reduce(
        (acc, item) => {
          const mode = item.applicationMode || "manual";
          acc[mode] = (acc[mode] || 0) + 1;
          return acc;
        },
        { manual: 0, "semi-automatic": 0 }
      );

      const recentPoints = getRecentDayPoints();
      const pointsByDay = Object.fromEntries(recentPoints.map((point) => [point.dayKey, point]));

      sentApps.forEach((item) => {
        const key = getDayKey(item.submittedAt || item.createdAt);
        if (pointsByDay[key]) pointsByDay[key].applications += 1;
      });

      proposalHistory.forEach((item) => {
        const key = getDayKey(item.createdAt);
        if (pointsByDay[key]) pointsByDay[key].proposals += 1;
      });

      const activityDayKeys = new Set();
      sentApps.forEach((item) => activityDayKeys.add(getDayKey(item.submittedAt || item.createdAt)));
      proposalHistory.forEach((item) => activityDayKeys.add(getDayKey(item.createdAt)));
      setStreakDays(getCurrentActivityStreak([...activityDayKeys]));

      const weekStart = getDateDaysAgo(6);
      const weekEnd = new Date();
      weekEnd.setHours(23, 59, 59, 999);
      const prevWeekStart = getDateDaysAgo(13);
      const prevWeekEnd = getDateDaysAgo(6);

      const thisWeekRate = getRollingResponseRate(sentApps, weekStart, weekEnd);
      const prevWeekRate = getRollingResponseRate(sentApps, prevWeekStart, prevWeekEnd);

      if (thisWeekRate > prevWeekRate) {
        setInsightTip(t("dashboard.insightImproved", { prev: prevWeekRate, current: thisWeekRate }));
      } else if (thisWeekRate < prevWeekRate) {
        setInsightTip(t("dashboard.insightDropped", { prev: prevWeekRate, current: thisWeekRate }));
      } else {
        setInsightTip(t("dashboard.insightSteady", { current: thisWeekRate }));
      }

      const weeklyActionCount = recentPoints.reduce(
        (sum, point) => sum + point.applications + point.proposals,
        0
      );

      setStats({
        sent: sentApps.length,
        proposalsGenerated: proposalTotal,
        responseRate,
        won: accepted.length,
        weeklyActions: weeklyActionCount,
        pending: pending.length,
        rejected: rejected.length
      });

      setStatusSeries({
        accepted: accepted.length,
        pending: pending.length,
        rejected: rejected.length
      });
      setModeSeries(modeBreakdown);
      setWeeklyPoints(recentPoints);
      setBestProposals(ranked);
      setLoading(false);
    };

    load().catch((error) => {
      console.error("Failed to load dashboard", error);
      setLoading(false);
    });
  }, []);

  const totalStatus = statusSeries.accepted + statusSeries.pending + statusSeries.rejected;
  const totalModes = modeSeries.manual + modeSeries["semi-automatic"];
  const bestProposal = bestProposals[0] || null;
  const maxWeeklyValue = Math.max(
    1,
    ...weeklyPoints.map((point) => Math.max(point.applications, point.proposals))
  );
  const streakTier = getStreakTier(streakDays);
  const localizedTierLabel =
    streakTier.key === "gold"
      ? t("dashboard.tierGold")
      : streakTier.key === "silver"
      ? t("dashboard.tierSilver")
      : streakTier.key === "bronze"
      ? t("dashboard.tierBronze")
      : t("dashboard.tierStarter");
  const streakProgressText =
    streakTier.nextAt === null
      ? t("dashboard.maxTier")
      : streakTier.nextAt === 3
      ? t("dashboard.toBronze", { days: Math.max(streakTier.nextAt - streakDays, 0) })
      : streakTier.nextAt === 7
      ? t("dashboard.toSilver", { days: Math.max(streakTier.nextAt - streakDays, 0) })
      : t("dashboard.toGold", { days: Math.max(streakTier.nextAt - streakDays, 0) });

  useEffect(() => {
    if (loading) return;

    const tierRank = { starter: 0, bronze: 1, silver: 2, gold: 3 };
    const currentRank = tierRank[streakTier.key] ?? 0;

    if (currentRank <= 0) return;

    const sessionKey = "dashboard.streakCelebratedTier";
    const seenRank = Number(window.sessionStorage.getItem(sessionKey) || 0);

    if (currentRank > seenRank) {
      setCelebrateTier(streakTier.key);
      window.sessionStorage.setItem(sessionKey, String(currentRank));

      const timer = window.setTimeout(() => {
        setCelebrateTier("");
      }, 2200);

      return () => window.clearTimeout(timer);
    }
  }, [loading, streakTier.key]);

  return (
    <div className="dashboard-stack">
      {activeDashboardSection === "overview" && credits && (
        <div className={`panel credits-display credits-${
          credits.credits === 0 
            ? 'zero' 
            : credits.credits <= 2 
            ? 'low' 
            : credits.credits <= 5 
            ? 'medium' 
            : 'healthy'
        }`}>
          <div className="credits-current">
            <div className="credit-value">{credits.credits}</div>
            <div className="credit-label">Credits Available</div>
          </div>
          {credits.credits <= 2 && (
            <div className="credit-warning">
              ⚠ {credits.credits === 0 
                ? 'Out of credits. Visit Settings to purchase more.' 
                : 'Low on credits. Consider purchasing more in Settings.'}
            </div>
          )}
        </div>
      )}

      {activeDashboardSection === "overview" && <div className="grid-two">
        <div
          className={`streak-badge streak-${streakTier.key}${celebrateTier === streakTier.key ? " streak-celebrate" : ""}`}
          role="status"
          aria-live="polite"
        >
          <span className="streak-dot" />
          {loading ? (
            t("dashboard.calculatingStreak")
          ) : (
            <>
              <strong>{localizedTierLabel}</strong>
              <span>{streakDays > 0 ? t("dashboard.streakText", { days: streakDays }) : t("dashboard.startToday")}</span>
              <em>{streakProgressText}</em>
              {celebrateTier === streakTier.key && <b className="streak-unlocked">{t("dashboard.tierUnlocked")}</b>}
            </>
          )}
        </div>
        <StatCard title={t("dashboard.applicationsSent")} value={loading ? "--" : stats.sent} delay={0.05} />
        <StatCard title={t("dashboard.proposalsGenerated")} value={loading ? "--" : stats.proposalsGenerated} delay={0.12} />
        <StatCard title={t("dashboard.responseRate")} value={loading ? "--" : `${stats.responseRate}%`} delay={0.19} />
        <StatCard title={t("dashboard.weeklyActivity")} value={loading ? "--" : stats.weeklyActions} delay={0.26} />
      </div>}

      {activeDashboardSection === "overview" && <div className="dashboard-grid-two">
        <section className="panel dashboard-panel chart-panel">
          <div className="chart-head">
            <h3>{t("dashboard.responseMomentum")}</h3>
            <p className="muted">{t("dashboard.responseMomentumSub")}</p>
          </div>
          <div className="donut-wrap">
            <div
              className="donut-chart"
              style={{ "--value": `${stats.responseRate}%` }}
              role="img"
              aria-label={`Response rate ${stats.responseRate}%`}
            >
              <div>
                <strong>{stats.responseRate}%</strong>
                <span>Response</span>
              </div>
            </div>
            <div className="mini-legend">
              <MiniBar label="Accepted" value={statusSeries.accepted} total={totalStatus} tone="tone-good" />
              <MiniBar label="Pending" value={statusSeries.pending} total={totalStatus} tone="tone-warn" />
              <MiniBar label="Rejected" value={statusSeries.rejected} total={totalStatus} tone="tone-bad" />
            </div>
          </div>
        </section>

        <section className="panel dashboard-panel chart-panel">
          <div className="chart-head">
            <h3>{t("dashboard.applyModeSplit")}</h3>
            <p className="muted">{t("dashboard.applyModeSplitSub")}</p>
          </div>
          <div className="mini-legend">
            <MiniBar label={t("dashboard.manual")} value={modeSeries.manual} total={totalModes} tone="tone-neutral" />
            <MiniBar
              label={t("dashboard.smartAssist")}
              value={modeSeries["semi-automatic"]}
              total={totalModes}
              tone="tone-boost"
            />
          </div>
          <p className="muted small-note">
            {t("dashboard.pendingRejected", { pending: stats.pending, rejected: stats.rejected })}
          </p>
        </section>
      </div>}

      {activeDashboardSection === "overview" && <section className="panel dashboard-panel chart-panel">
        <div className="chart-head">
          <h3>{t("dashboard.weeklyActivityTitle")}</h3>
          <p className="muted">{t("dashboard.weeklyActivitySub")}</p>
        </div>
        {weeklyPoints.length > 0 ? (
          <WeeklyActivityChart points={weeklyPoints} maxValue={maxWeeklyValue} />
        ) : (
          <p className="muted">{t("dashboard.noWeeklyActivity")}</p>
        )}
        <div className="weekly-legend">
          <span><i className="legend-dot legend-apps" /> {t("dashboard.applications")}</span>
          <span><i className="legend-dot legend-proposals" /> {t("dashboard.proposals")}</span>
        </div>
      </section>}

      {activeDashboardSection === "overview" && <section className="panel dashboard-panel insight-tip-panel">
        <div className="chart-head">
          <h3>{t("dashboard.insightTipTitle")}</h3>
          <p className="muted">{t("dashboard.insightTipSub")}</p>
        </div>
        <p className="insight-tip-text">{insightTip}</p>
      </section>}

      {activeDashboardSection === "performance" && learningInsights && (
        <section className="panel dashboard-panel insight-tip-panel">
          <div className="chart-head">
            <h3>{t("dashboard.learningTitle")}</h3>
            <p className="muted">{t("dashboard.learningSub")}</p>
          </div>
          <div className="learning-insights-grid">
            <article className="learning-kpi positive">
              <span>{t("dashboard.positiveOutcomes")}</span>
              <strong>{learningInsights.positiveExamples}</strong>
            </article>
            <article className="learning-kpi negative">
              <span>{t("dashboard.negativeOutcomes")}</span>
              <strong>{learningInsights.negativeExamples}</strong>
            </article>
            <article className="learning-kpi neutral">
              <span>{t("dashboard.positiveRate")}</span>
              <strong>{learningInsights.positiveRate}%</strong>
            </article>
          </div>
          {learningInsights.trendPoints?.length > 0 && (
            <div className="learning-trend-block">
              <p className="muted">
                {t("dashboard.learningTrend")}: {t(`dashboard.trend${learningInsights.trendDirection[0].toUpperCase()}${learningInsights.trendDirection.slice(1)}`)}
              </p>
              <OutcomeSparkline
                points={learningInsights.trendPoints}
                direction={learningInsights.trendDirection}
                title={t("dashboard.learningTrendTitle")}
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
          <p className="learning-influence-text">
            {t("dashboard.aiInfluence")}: {learningInsights.influenceSummary}
          </p>
        </section>
      )}

      {activeDashboardSection === "performance" && <section className="panel dashboard-panel best-highlight-panel">
        <div className="chart-head">
          <h3>{t("dashboard.bestProposalTitle")}</h3>
          <p className="muted">{t("dashboard.bestProposalSub")}</p>
        </div>
        {!bestProposal && (
          <p className="muted">{t("dashboard.noBestProposal")}</p>
        )}
        {bestProposal && (
          <article className="best-highlight-card">
            <div>
              <h4>{bestProposal.title}</h4>
              <p className="muted">{bestProposal.company}</p>
              <p className="proposal-preview">{bestProposal.preview}</p>
            </div>
            <div className="proposal-metrics">
              <span className={`status-badge ${bestProposal.status}`}>{bestProposal.status}</span>
              <span className="proposal-tone">{bestProposal.tone}</span>
              <strong>{bestProposal.score}/100</strong>
            </div>
          </article>
        )}
      </section>}

      {activeDashboardSection === "performance" && <section className="panel dashboard-panel insights-panel">
        <div className="chart-head">
          <h3>{t("dashboard.topArchiveTitle")}</h3>
          <p className="muted">{t("dashboard.topArchiveSub")}</p>
        </div>

        {bestProposals.length === 0 && (
          <p className="muted">{t("dashboard.noArchive")}</p>
        )}

        {bestProposals.length > 0 && (
          <div className="proposal-insight-list">
            {bestProposals.map((item, index) => (
              <article key={item.id} className="proposal-insight-card">
                <div className="proposal-rank">#{index + 1}</div>
                <div>
                  <h4>{item.title}</h4>
                  <p className="muted">{item.company}</p>
                  <p className="proposal-preview">{item.preview}</p>
                </div>
                <div className="proposal-metrics">
                  <span className={`status-badge ${item.status}`}>{item.status}</span>
                  <span className="proposal-tone">{item.tone}</span>
                  <strong>{item.score}/100</strong>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>}

    </div>
  );
}

export default DashboardPage;
