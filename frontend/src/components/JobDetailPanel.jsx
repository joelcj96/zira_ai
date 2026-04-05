import { useI18n } from "../context/I18nContext";

const isSafeExternalLink = (value) => {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const formatRelativeTime = (postedAt) => {
  if (!postedAt) return null;
  try {
    const date = new Date(postedAt);
    if (Number.isNaN(date.getTime())) return null;
    const diffMs = Date.now() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 1) return "Today";
    if (diffDays === 1) return "1 day ago";
    if (diffDays < 7) return `${diffDays} days ago`;
    const diffWeeks = Math.floor(diffDays / 7);
    if (diffWeeks === 1) return "1 week ago";
    if (diffWeeks < 5) return `${diffWeeks} weeks ago`;
    return null;
  } catch {
    return null;
  }
};

const DIRECT_APPLY_PROVIDERS = new Set(["greenhouse", "lever", "ashby", "smartrecruiters"]);

const detectProvider = (sourceLink = "") => {
  try {
    const host = new URL(String(sourceLink || "")).hostname.toLowerCase();
    if (host.includes("greenhouse")) return "greenhouse";
    if (host.includes("lever")) return "lever";
    if (host.includes("ashby")) return "ashby";
    if (host.includes("smartrecruiters")) return "smartrecruiters";
    if (host.includes("linkedin")) return "linkedin";
    if (host.includes("indeed")) return "indeed";
    return "generic";
  } catch {
    return "unknown";
  }
};

// Color palette derived from the app's design tokens
const AVATAR_COLORS = [
  { bg: "rgba(0,212,200,0.18)", border: "rgba(0,212,200,0.35)", text: "#00d4c8" },
  { bg: "rgba(123,97,255,0.18)", border: "rgba(123,97,255,0.35)", text: "#a991ff" },
  { bg: "rgba(34,212,124,0.16)", border: "rgba(34,212,124,0.35)", text: "#22d47c" },
  { bg: "rgba(245,185,66,0.16)", border: "rgba(245,185,66,0.35)", text: "#f5b942" },
  { bg: "rgba(255,94,58,0.15)", border: "rgba(255,94,58,0.3)", text: "#ff9070" },
];

function CompanyAvatar({ name, size = 56 }) {
  const letter = String(name || "?").trim()[0]?.toUpperCase() ?? "?";
  const colorSet = AVATAR_COLORS[letter.charCodeAt(0) % AVATAR_COLORS.length];
  return (
    <div
      className="company-avatar"
      style={{
        width: size,
        height: size,
        minWidth: size,
        background: colorSet.bg,
        border: `1px solid ${colorSet.border}`,
        color: colorSet.text,
        fontSize: Math.round(size * 0.44),
      }}
      aria-hidden="true"
    >
      {letter}
    </div>
  );
}

function JobDetailPanel({
  job,
  isApplied,
  onGenerateProposal,
  onAddApplication,
  onIgnoreJob,
  onClose,
  isPro,
  onUpgrade,
}) {
  const { t } = useI18n();
  const hasSafeSourceLink = isSafeExternalLink(job.sourceLink);
  const provider = detectProvider(job.sourceLink);
  const supportsDirect = DIRECT_APPLY_PROVIDERS.has(provider);
  const postedLabel = formatRelativeTime(job.postedAt);
  const hasSalary = Number.isFinite(Number(job.salary)) && Number(job.salary) > 0;
  const salaryLabel = hasSalary ? `$${Number(job.salary).toLocaleString()}` : null;
  const isUserAddedJob = job.sourceTag === "User Added";

  const handleDismiss = () => {
    onIgnoreJob?.(job);
    onClose();
  };

  return (
    <aside className="job-detail-panel" aria-label="Job details">
      {/* Header: logo + title + close */}
      <div className="job-detail-header">
        <CompanyAvatar name={job.company} size={52} />
        <div className="job-detail-title-block">
          <h2 className="job-detail-title">{job.title}</h2>
          <p className="job-detail-company">{job.company}</p>
          <p className="job-detail-location">{job.location || "Remote"}</p>
        </div>
        <button
          type="button"
          className="secondary job-detail-close-btn"
          onClick={onClose}
          aria-label="Close job details"
        >
          ✕
        </button>
      </div>

      {/* Badges row */}
      <div className="job-detail-badges">
        {supportsDirect && (
          <span className="jd-badge jd-badge-direct">⚡ Direct Apply</span>
        )}
        {isApplied && (
          <span className="jd-badge jd-badge-applied">✓ Tracked</span>
        )}
        {job.jobType && (
          <span className="jd-badge jd-badge-type">{job.jobType}</span>
        )}
        {!isUserAddedJob && job.externalSourceName && (
          <span className="jd-badge jd-badge-source">{job.externalSourceName}</span>
        )}
        {postedLabel && (
          <span className="jd-badge jd-badge-time">{postedLabel}</span>
        )}
        {isUserAddedJob && (
          <span className="jd-badge jd-badge-user">Your Job</span>
        )}
      </div>

      {/* Salary */}
      {salaryLabel && (
        <p className="job-detail-salary">
          <strong>{salaryLabel}</strong>
          <span className="muted"> / year</span>
        </p>
      )}

      {/* Budget range (Upwork-style jobs) */}
      {job.budgetRange && (
        <p className="job-detail-budget">
          <span className="muted">Budget range: </span>
          <strong>{job.budgetRange}</strong>
        </p>
      )}

      {/* Skills */}
      {Array.isArray(job.skillsRequired) && job.skillsRequired.length > 0 && (
        <div className="job-detail-skills">
          <p className="job-detail-section-label">Skills</p>
          <div className="chip-row">
            {job.skillsRequired.map((skill) => (
              <span key={skill} className="chip">{skill}</span>
            ))}
          </div>
        </div>
      )}

      {/* Description */}
      <div className="job-detail-description">
        <p className="job-detail-section-label">About the role</p>
        <p className="job-detail-desc-text">{job.description}</p>
      </div>

      {/* AI match score if available */}
      {isPro && typeof job.matchScore === "number" && (
        <p className="job-detail-match-score muted">
          Match score: <strong style={{ color: "var(--accent)" }}>{job.matchScore}/100</strong>
        </p>
      )}

      {/* Direct-apply notice */}
      {supportsDirect && (
        <div className="job-detail-direct-notice">
          <p>
            ⚡ <strong>Direct apply supported</strong> — generate a proposal and use Smart Apply to submit directly.
          </p>
        </div>
      )}

      {provider === "linkedin" && hasSafeSourceLink && (
        <div className="job-detail-manual-notice">
          <p>LinkedIn requires manual apply. Open the listing to apply there.</p>
        </div>
      )}

      {/* Actions */}
      <div className="job-detail-actions">
        <button type="button" onClick={() => onGenerateProposal(job)}>
          {t("jobCard.generateProposal", {}, "Generate Proposal")}
        </button>
        {hasSafeSourceLink && (
          <a
            href={job.sourceLink}
            target="_blank"
            rel="noopener noreferrer"
            className="secondary job-platform-link"
          >
            {supportsDirect
              ? t("jobCard.applyOnPlatform", {}, "View Listing")
              : t("jobCard.applyOnPlatform", {}, "Apply on Platform")}
          </a>
        )}
        <button
          type="button"
          className="secondary"
          onClick={() => onAddApplication(job)}
          disabled={isApplied}
        >
          {isApplied
            ? t("jobCard.tracked", {}, "✓ Tracked")
            : isUserAddedJob
            ? t("jobCard.trackYourJob", {}, "Track Your Job")
            : t("jobCard.trackSuggestedJob", {}, "Track Suggested Job")}
        </button>
        <button type="button" className="secondary" onClick={handleDismiss}>
          {t("jobCard.ignore", {}, "Dismiss")}
        </button>
      </div>
    </aside>
  );
}

export default JobDetailPanel;
