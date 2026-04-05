import { useEffect } from "react";
import { trackConversionEvent } from "../api/analytics";
import { useI18n } from "../context/I18nContext";

function SkillList({ title, items }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <p className="muted small"><strong>{title}</strong></p>
      <div className="chip-row">
        {items.map((item) => (
          <span key={item} className="chip">{item}</span>
        ))}
      </div>
    </div>
  );
}

function JobOptimizationPanel({
  isPro,
  loading,
  optimization,
  optimizedCoverLetter,
  optimizedCv,
  setOptimizedCoverLetter,
  setOptimizedCv,
  approved,
  setApproved,
  onOptimize,
  onUpgrade
}) {
  const { t } = useI18n();

  useEffect(() => {
    if (isPro) return;
    trackConversionEvent({
      eventType: "lock_impression",
      surface: "job_optimization_panel",
      feature: "ai_job_optimization",
      dedupeKey: "job_optimization_panel:ai_job_optimization:lock_impression"
    });
  }, [isPro]);

  if (!isPro) {
    return (
      <div className="panel optimization-panel locked-panel">
        <h4>🔒 {t("optimization.title")}</h4>
        <p className="muted">{t("optimization.proOnly")}</p>
        <button
          type="button"
          onClick={() => onUpgrade?.("job_optimization_panel", "ai_job_optimization")}
        >
          {t("optimization.upgrade")}
        </button>
      </div>
    );
  }

  const analysis = optimization?.analysis;
  const content = optimization?.content;

  return (
    <div className="panel optimization-panel">
      <div className="optimization-head">
        <h4>{t("optimization.title")}</h4>
        <button type="button" onClick={onOptimize} disabled={loading}>
          {loading ? t("optimization.optimizing") : t("optimization.optimizeNow")}
        </button>
      </div>
      <p className="muted">{t("optimization.subtext")}</p>

      {optimization && (
        <>
          <div className="optimization-score-card">
            <span className="muted">{t("optimization.matchScore")}</span>
            <strong>{optimization.matchScore}%</strong>
          </div>

          <div className="optimization-analysis-grid">
            <SkillList title={t("optimization.requiredSkills")} items={analysis?.requiredSkills} />
            <SkillList title={t("optimization.matchedSkills")} items={analysis?.matchedSkills} />
            <SkillList title={t("optimization.missingSkills")} items={analysis?.missingSkills} />
            <SkillList title={t("optimization.keywords")} items={analysis?.keywords} />
          </div>

          <div className="optimization-columns">
            <div className="optimization-column">
              <h5>{t("optimization.originalCover")}</h5>
              <textarea value={content?.originalCoverLetter || ""} readOnly rows={8} />

              <h5>{t("optimization.originalCv")}</h5>
              <textarea value={content?.originalCv || ""} readOnly rows={8} />
            </div>

            <div className="optimization-column">
              <h5>{t("optimization.optimizedCover")}</h5>
              <textarea
                value={optimizedCoverLetter}
                onChange={(event) => {
                  setApproved(false);
                  setOptimizedCoverLetter(event.target.value);
                }}
                rows={8}
              />

              <h5>{t("optimization.optimizedCv")}</h5>
              <textarea
                value={optimizedCv}
                onChange={(event) => {
                  setApproved(false);
                  setOptimizedCv(event.target.value);
                }}
                rows={8}
              />
            </div>
          </div>

          <label className="inline-check">
            <input
              type="checkbox"
              checked={approved}
              onChange={(event) => setApproved(event.target.checked)}
            />
            {t("optimization.approveBeforeApply")}
          </label>
        </>
      )}
    </div>
  );
}

export default JobOptimizationPanel;
