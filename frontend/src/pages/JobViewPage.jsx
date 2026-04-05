import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";
import { useToast } from "../context/ToastContext";
import { api } from "../api/client";
import { useState } from "react";

/* ─── helpers ──────────────────────────────────────────────── */

const isSafeLink = (v) => {
  if (typeof v !== "string" || !v.trim()) return false;
  try { const u = new URL(v); return u.protocol === "http:" || u.protocol === "https:"; }
  catch { return false; }
};

const isLikelyJobPostingLink = (value) => {
  if (!isSafeLink(value)) return false;

  try {
    const parsed = new URL(value);
    const host = String(parsed.hostname || "").toLowerCase();
    const path = String(parsed.pathname || "").trim();

    if ((path === "" || path === "/") && !parsed.search && !parsed.hash) {
      return false;
    }

    if (host.includes("linkedin.com")) return /\/jobs\/view\//i.test(path);
    if (host.includes("indeed.")) return /\/viewjob|\/job\//i.test(path);
    if (host.includes("remotive.com")) return /\/remote-jobs\//i.test(path);
    if (host.includes("arbeitnow.com")) return /\/jobs\//i.test(path);
    if (host.includes("themuse.com")) return /\/jobs\//i.test(path);
    if (host.includes("remoteok.com")) return /\/remote-jobs\//i.test(path);
    if (host.includes("jobicy.com")) return /\/jobs\//i.test(path);
    if (host.includes("himalayas.app")) return /\/companies\/.+\/jobs\//i.test(path);

    return true;
  } catch {
    return false;
  }
};

const formatDate = (raw) => {
  if (!raw) return null;
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (diff < 1) return "Posted today";
    if (diff === 1) return "Posted 1 day ago";
    if (diff < 7) return `Posted ${diff} days ago`;
    if (diff < 14) return "Posted 1 week ago";
    if (diff < 30) return `Posted ${Math.floor(diff / 7)} weeks ago`;
    return `Posted on ${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  } catch { return null; }
};

const DIRECT_PROVIDERS = new Set(["greenhouse", "lever", "ashby", "smartrecruiters"]);
const detectProvider = (sourceLink = "") => {
  try {
    const h = new URL(String(sourceLink || "")).hostname.toLowerCase();
    if (h.includes("greenhouse")) return "greenhouse";
    if (h.includes("lever")) return "lever";
    if (h.includes("ashby")) return "ashby";
    if (h.includes("smartrecruiters")) return "smartrecruiters";
    if (h.includes("linkedin")) return "linkedin";
    if (h.includes("indeed")) return "indeed";
    return "generic";
  } catch { return "unknown"; }
};

const AVATAR_COLORS = [
  { bg: "rgba(0,212,200,0.18)", border: "rgba(0,212,200,0.38)", text: "#00d4c8" },
  { bg: "rgba(123,97,255,0.18)", border: "rgba(123,97,255,0.35)", text: "#a991ff" },
  { bg: "rgba(34,212,124,0.16)", border: "rgba(34,212,124,0.35)", text: "#22d47c" },
  { bg: "rgba(245,185,66,0.16)", border: "rgba(245,185,66,0.35)", text: "#f5b942" },
  { bg: "rgba(255,94,58,0.15)", border: "rgba(255,94,58,0.3)", text: "#ff9070" },
];
const avatarFor = (name = "") => AVATAR_COLORS[String(name || "?").charCodeAt(0) % AVATAR_COLORS.length];

/* ─── component ─────────────────────────────────────────────── */

function JobViewPage() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useI18n();
  const { showToast } = useToast();

  const job = state?.job ?? null;
  const [tracked, setTracked] = useState(state?.isApplied ?? false);
  const [tracking, setTracking] = useState(false);

  /* Bad navigation guard */
  if (!job) {
    return (
      <div className="job-view-error">
        <p className="muted">No job selected. Go back and click a job to view details.</p>
        <button type="button" className="secondary" onClick={() => navigate(-1)}>← Back to Jobs</button>
      </div>
    );
  }

  const provider = detectProvider(job.sourceLink);
  const supportsDirect = DIRECT_PROVIDERS.has(provider);
  const hasDirectLink = isLikelyJobPostingLink(job.sourceLink);
  const postedLabel = formatDate(job.postedAt);
  const hasSalary = Number.isFinite(Number(job.salary)) && Number(job.salary) > 0;
  const salaryLabel = hasSalary ? `$${Number(job.salary).toLocaleString()}` : null;
  const isUserJob = job.sourceTag === "User Added";
  const avatarColor = avatarFor(job.company);

  const handleTrack = async () => {
    if (tracked) return;
    try {
      setTracking(true);
      await api.post("/applications", {
        jobId: job.id,
        title: job.title,
        company: job.company,
        jobDescription: job.description || "",
        status: "pending",
      });
      setTracked(true);
      showToast("Job added to your tracker!", "success");
    } catch (err) {
      showToast(err.response?.data?.message || "Could not track this job.", "danger");
    } finally {
      setTracking(false);
    }
  };

  const handleGenerateProposal = () => {
    /* Navigate to proposal draft — JobsPage.jsx handles the rest via its own state.
       We pass the job via route state so JobsPage can auto-trigger generation. */
    navigate("/jobs/proposal-draft", { state: { autoProposalJob: job } });
  };

  return (
    <div className="job-view-page">

      {/* ── Back bar ── */}
      <div className="job-view-topbar">
        <button
          type="button"
          className="secondary job-view-back-btn"
          onClick={() => navigate(-1)}
        >
          ← Back to Jobs
        </button>
        {postedLabel && <span className="muted job-view-posted">{postedLabel}</span>}
      </div>

      {/* ── Hero ── */}
      <div className="job-view-hero">
        <div
          className="job-view-avatar"
          style={{ background: avatarColor.bg, border: `2px solid ${avatarColor.border}`, color: avatarColor.text }}
          aria-hidden="true"
        >
          {String(job.company || "?")[0].toUpperCase()}
        </div>

        <div className="job-view-hero-info">
          <h1 className="job-view-title">{job.title}</h1>
          <p className="job-view-company">{job.company}</p>
          <p className="job-view-location">{job.location || "Remote"}</p>

          <div className="job-view-badges">
            {supportsDirect && <span className="jd-badge jd-badge-direct">⚡ Direct Apply</span>}
            {tracked && <span className="jd-badge jd-badge-applied">✓ Tracked</span>}
            {job.jobType && <span className="jd-badge jd-badge-type">{job.jobType}</span>}
            {!isUserJob && job.externalSourceName && <span className="jd-badge jd-badge-source">{job.externalSourceName}</span>}
            {hasSalary && <span className="jd-badge jd-badge-salary">💰 {salaryLabel}</span>}
            {job.budgetRange && <span className="jd-badge jd-badge-type">{job.budgetRange}</span>}
          </div>
        </div>

        {/* Primary actions in hero */}
        <div className="job-view-hero-actions">
          <button type="button" onClick={handleGenerateProposal}>
            Generate Proposal
          </button>
          {hasDirectLink && (
            <a
              href={job.sourceLink}
              target="_blank"
              rel="noopener noreferrer"
              className="secondary job-platform-link"
            >
              {supportsDirect ? "View Listing" : "Apply on Platform"}
            </a>
          )}
          <button
            type="button"
            className="secondary"
            onClick={handleTrack}
            disabled={tracked || tracking}
          >
            {tracked ? "✓ Tracked" : tracking ? "Adding…" : isUserJob ? "Track Your Job" : "Track Job"}
          </button>
        </div>
      </div>

      {/* ── Body: two columns ── */}
      <div className="job-view-body">

        {/* LEFT: description */}
        <article className="job-view-main panel">
          <h2 className="job-view-section-title">About the Role</h2>
          <p className="job-view-description">{job.description}</p>
        </article>

        {/* RIGHT: sidebar cards */}
        <aside className="job-view-sidebar">

          {/* Job details card */}
          <div className="panel job-view-card">
            <h3 className="job-view-card-title">Job Details</h3>
            <dl className="job-view-dl">
              {salaryLabel && (
                <>
                  <dt>Salary</dt>
                  <dd>{salaryLabel}<small className="muted"> / year</small></dd>
                </>
              )}
              {job.budgetRange && (
                <>
                  <dt>Budget</dt>
                  <dd>{job.budgetRange}</dd>
                </>
              )}
              {job.jobType && (
                <>
                  <dt>Type</dt>
                  <dd>{job.jobType}</dd>
                </>
              )}
              <dt>Location</dt>
              <dd>{job.location || "Remote"}</dd>
              {!isUserJob && job.externalSourceName && (
                <>
                  <dt>Source</dt>
                  <dd>{job.externalSourceName}</dd>
                </>
              )}
            </dl>
          </div>

          {/* Skills card */}
          {Array.isArray(job.skillsRequired) && job.skillsRequired.length > 0 && (
            <div className="panel job-view-card">
              <h3 className="job-view-card-title">Skills Required</h3>
              <div className="chip-row">
                {job.skillsRequired.map((s) => <span key={s} className="chip">{s}</span>)}
              </div>
            </div>
          )}

          {/* Apply method card */}
          <div className="panel job-view-card">
            <h3 className="job-view-card-title">How to Apply</h3>
            {supportsDirect ? (
              <div className="job-view-apply-direct">
                <p className="muted">
                  ⚡ <strong>Direct submission available.</strong> Generate a proposal and use Smart Apply — Zira will submit directly to {provider}.
                </p>
              </div>
            ) : provider === "linkedin" ? (
              <p className="muted">LinkedIn requires manual apply. Use the <em>Apply on Platform</em> button above to open the listing.</p>
            ) : provider === "indeed" ? (
              <p className="muted">Indeed requires manual apply via the listing link above.</p>
            ) : (
              <p className="muted">Apply via the listing link above. Track your application here to stay organised.</p>
            )}

            {user && (supportsDirect || hasDirectLink) && (
              <div className="job-view-readiness">
                <p className="job-view-readiness-title">Your readiness</p>
                <div className="job-view-readiness-row">
                  <span className={`jd-badge ${user.name ? "jd-badge-applied" : "jd-badge-warn"}`}>
                    {user.name ? "✓" : "✗"} Name
                  </span>
                  <span className={`jd-badge ${user.email ? "jd-badge-applied" : "jd-badge-warn"}`}>
                    {user.email ? "✓" : "✗"} Email
                  </span>
                  {(provider === "greenhouse" || provider === "ashby") && (
                    <span className={`jd-badge ${user?.profileData?.cvRawText ? "jd-badge-applied" : "jd-badge-warn"}`}>
                      {user?.profileData?.cvRawText ? "✓" : "!" } CV
                    </span>
                  )}
                  <span className={`jd-badge ${user?.phone ? "jd-badge-applied" : "jd-badge-type"}`}>
                    {user?.phone ? "✓" : "?"} Phone
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Match score card (Pro) */}
          {typeof job.matchScore === "number" && (
            <div className="panel job-view-card">
              <h3 className="job-view-card-title">AI Match Score</h3>
              <div className="job-view-score-wrap">
                <div
                  className="donut-chart"
                  style={{ "--value": `${job.matchScore}%` }}
                >
                  <div>
                    <strong>{job.matchScore}</strong>
                    <span>/ 100</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* AI explanation card */}
          {job.aiExplanation && (
            <div className="panel job-view-card">
              <h3 className="job-view-card-title">Why You're a Fit</h3>
              <ul className="job-view-why-list">
                <li>
                  Skill match: {job.aiExplanation.skillMatch?.matchedCount ?? 0}/{job.aiExplanation.skillMatch?.requiredCount ?? 0} required skills
                </li>
                <li>
                  {job.aiExplanation.successSimilarity?.isSimilarToPastSuccess
                    ? "Similar to jobs you've succeeded with before"
                    : "Fresh opportunity to expand your track record"}
                </li>
              </ul>
            </div>
          )}

        </aside>
      </div>

    </div>
  );
}

export default JobViewPage;
