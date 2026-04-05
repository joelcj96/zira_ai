import { useRef } from "react";
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

const isLikelyJobPostingLink = (value) => {
  if (!isSafeExternalLink(value)) return false;

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

const AVATAR_COLORS = [
  { bg: "rgba(0,212,200,0.18)", border: "rgba(0,212,200,0.38)", text: "#00d4c8" },
  { bg: "rgba(123,97,255,0.18)", border: "rgba(123,97,255,0.35)", text: "#a991ff" },
  { bg: "rgba(34,212,124,0.16)", border: "rgba(34,212,124,0.35)", text: "#22d47c" },
  { bg: "rgba(245,185,66,0.16)", border: "rgba(245,185,66,0.35)", text: "#f5b942" },
  { bg: "rgba(255,94,58,0.15)", border: "rgba(255,94,58,0.3)", text: "#ff9070" },
];

const avatarFor = (name = "") => AVATAR_COLORS[String(name || "?").charCodeAt(0) % AVATAR_COLORS.length];

function JobCard({
  job,
  isApplied,
  onGenerateProposal,
  onAddApplication,
  onIgnoreJob,
  isPro = false,
  onUpgrade,
  compact = false,
  onSelectJob = null,
  isSelected = false,
}) {
  const { t } = useI18n();
  const ref = useRef(null);
  const intelligence = job.intelligence || null;
  const explanation = job.aiExplanation || null;
  const hasDirectSourceLink = isLikelyJobPostingLink(job.sourceLink);
  const isUserAddedJob = job.sourceTag === "User Added";
  const externalSourceName = !isUserAddedJob ? String(job.externalSourceName || "").trim() : "";
  const sourceLabel = isUserAddedJob
    ? t("jobCard.sourceYourJob", {}, "Your Job")
    : t("jobCard.sourceSuggested", {}, "Suggested");

  const cardClass = intelligence?.labelKey
    ? `job-card opportunity-${intelligence.labelKey}`
    : "job-card";
  const cardClickable = typeof onSelectJob === "function";
  const selectedClass = isSelected ? " job-card-selected" : "";
  const clickableClass = cardClickable ? " job-card-clickable" : "";
  const hasSalary = Number.isFinite(Number(job.salary)) && Number(job.salary) > 0;
  const salaryLabel = hasSalary
    ? `$${Number(job.salary).toLocaleString()}`
    : t("jobCard.salaryNotListed", {}, "Salary not listed");
  const compactMeta = [
    job.location || "Remote",
    job.jobType,
    job.budgetRange ? `${t("jobs.filters.budget", {}, "Budget")}: ${String(job.budgetRange)}` : null,
    salaryLabel,
    isApplied ? t("jobCard.alreadyApplied") : null,
    intelligence ? `${t("jobCard.jobScore", { score: intelligence.jobScore })}` : null,
    isPro ? t("jobCard.matchScore", { score: job.matchScore ?? 0 }) : t("jobCard.bestMatchLocked")
  ]
    .filter(Boolean)
    .map((item) => String(item).replace(/-/g, " "));
  const avatarColor = avatarFor(job.company);

  const handleMouseMove = (e) => {
    const card = ref.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    card.style.transform = `perspective(700px) rotateX(${-y * 8}deg) rotateY(${x * 8}deg) translateY(-5px) scale(1.015)`;
    card.style.boxShadow = `0 20px 50px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,212,200,0.12), 0 0 24px rgba(0,212,200,0.3)`;
  };

  const handleMouseLeave = () => {
    if (ref.current) {
      ref.current.style.transform = "";
      ref.current.style.boxShadow = "";
    }
  };

  return (
    <article
      ref={ref}
      className={`${cardClass} ${compact ? "job-card-compact" : ""}${selectedClass}${clickableClass}`.trim()}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={cardClickable ? () => onSelectJob(job) : undefined}
      role={cardClickable ? "button" : undefined}
      tabIndex={cardClickable ? 0 : undefined}
      onKeyDown={cardClickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectJob(job); } } : undefined}
    >
      <div className="job-head">
        <div
          className="job-card-avatar"
          style={{ background: avatarColor.bg, border: `2px solid ${avatarColor.border}`, color: avatarColor.text }}
          aria-hidden="true"
        >
          {String(job.company || "?")[0].toUpperCase()}
        </div>

        <div className="job-head-content">
          <h3>{job.title}</h3>
          <p className="job-company-line">{job.company}</p>
          <p className="job-location-line">{job.location || "Remote"}</p>
          <div className="job-head-badges">
            <span className={`job-source-pill ${isUserAddedJob ? "source-user-added" : "source-feed"}`}>
              {sourceLabel}
            </span>
            {externalSourceName && <span className="job-provider-pill">{externalSourceName}</span>}
            {job.jobType && <span className="job-provider-pill job-type-pill">{job.jobType}</span>}
            {hasSalary && <span className="job-provider-pill job-salary-pill">{salaryLabel}</span>}
          </div>
        </div>
        <div className="job-card-meta">
          {!compact && isApplied && <span className="applied-pill">{t("jobCard.alreadyApplied")}</span>}
          {!compact && intelligence && <span className="score-pill intelligence-pill">{t("jobCard.jobScore", { score: intelligence.jobScore })}</span>}
          {!compact &&
            (isPro ? (
              <span className="score-pill">{t("jobCard.matchScore", { score: job.matchScore ?? 0 })}</span>
            ) : (
              <span className="score-pill locked">{t("jobCard.bestMatchLocked")}</span>
            ))}
        </div>
      </div>

      {!compact && explanation && (
        <div className="job-explanation">
          <strong>{t("jobCard.whyFitTitle")}</strong>
          <ul>
            <li>
              {t("jobCard.whySkillMatch", {
                matched: explanation.skillMatch?.matchedCount || 0,
                total: explanation.skillMatch?.requiredCount || 0
              })}
            </li>
            <li>
              {explanation.successSimilarity?.isSimilarToPastSuccess
                ? t("jobCard.whySuccessSimilar")
                : t("jobCard.whySuccessLearning")}
            </li>
          </ul>
        </div>
      )}

      {compact && (
        <p className="job-compact-meta-line">{compactMeta.join(" • ")}</p>
      )}

      {!compact && (
        <div className="chip-row">
          {job.skillsRequired?.map((skill) => (
            <span key={skill} className="chip">
              {skill}
            </span>
          ))}
        </div>
      )}

      <div className="job-footer" onClick={cardClickable ? (e) => e.stopPropagation() : undefined}>
        {!compact && <strong>{salaryLabel}</strong>}
        <div className="inline-actions">
          {hasDirectSourceLink && (
            <a
              href={job.sourceLink}
              target="_blank"
              rel="noopener noreferrer"
              className="job-platform-link"
            >
              {t("jobCard.applyOnPlatform", {}, "Apply on Platform")}
            </a>
          )}
          <button className="secondary" onClick={() => onAddApplication(job)} disabled={isApplied}>
            {isApplied
              ? t("jobCard.tracked")
              : isUserAddedJob
              ? t("jobCard.trackYourJob", {}, "Track Your Job")
              : t("jobCard.trackSuggestedJob", {}, "Track Suggested Job")}
          </button>
          <button className="secondary" onClick={() => onIgnoreJob?.(job)}>
            {t("jobCard.ignore")}
          </button>
          {!isPro && (
            <button
              className="secondary premium-inline-btn"
              onClick={() => onUpgrade?.("job_card", "best_job_matches")}
            >
              {t("jobCard.upgradeToPro")}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export default JobCard;
