import { useEffect } from "react";
import { useI18n } from "../context/I18nContext";
import { trackConversionEvent } from "../api/analytics";

function ProposalEditor({
  proposal,
  setProposal,
  alternateProposal,
  tone,
  setTone,
  insights,
  strategy,
  selectedJob,
  onGenerateAgain,
  onUseAlternate,
  onUseProfileCoverLetter,
  hasProfileCoverLetter,
  isPro,
  onUpgrade,
  billingLoading
}) {
  const { t } = useI18n();

  const strategyTooltip = strategy?.type
    ? strategy.type === "complex"
      ? t("proposalEditor.strategyWhyComplex", {
          skills: strategy.requiredSkillsCount ?? 0,
          technical: strategy.technicalKeywordHits ?? 0,
          words: strategy.descriptionWordCount ?? 0
        })
      : t("proposalEditor.strategyWhySimple", {
          skills: strategy.requiredSkillsCount ?? 0,
          simple: strategy.simpleKeywordHits ?? 0,
          words: strategy.descriptionWordCount ?? 0
        })
    : "";

  useEffect(() => {
    if (isPro) return;
    trackConversionEvent({
      eventType: "lock_impression",
      surface: "proposal_editor",
      feature: "premium_ai_controls",
      dedupeKey: "proposal_editor:premium_ai_controls:lock_impression"
    });
  }, [isPro]);

  return (
    <div className="proposal-panel">
      <div className="proposal-header-row">
        <h3>{t("proposalEditor.title")}</h3>
        {strategy?.type && (
          <span
            className={`proposal-strategy-badge strategy-${strategy.type}`}
            tabIndex={0}
            aria-label={strategyTooltip}
            aria-describedby="proposal-strategy-tooltip"
          >
            {strategy.type === "complex"
              ? t("proposalEditor.strategyComplex")
              : t("proposalEditor.strategySimple")}
            <span id="proposal-strategy-tooltip" role="tooltip" className="proposal-strategy-tooltip">
              {strategyTooltip}
            </span>
          </span>
        )}
      </div>
      {!isPro && (
        <div className="subscription-panel compact">
          <p>
            {t("proposalEditor.freePlanNote")}
          </p>
          <button
            type="button"
            onClick={() => onUpgrade?.("proposal_editor_upgrade_panel", "premium_ai_controls")}
            disabled={billingLoading}
          >
            {billingLoading ? t("proposalEditor.openingCheckout") : t("proposalEditor.upgradeBtn")}
          </button>
        </div>
      )}
      <div className="tone-row">
        <label htmlFor="tone">{t("proposalEditor.tone")}</label>
        <select id="tone" value={tone} onChange={(event) => setTone(event.target.value)}>
          <option value="professional">{t("proposalEditor.toneProfessional")}</option>
          <option value="friendly" disabled={!isPro}>{t("proposalEditor.toneFriendly")} {isPro ? "" : t("proposalEditor.tonePro")}</option>
          <option value="confident" disabled={!isPro}>{t("proposalEditor.toneConfident")} {isPro ? "" : t("proposalEditor.tonePro")}</option>
        </select>
      </div>

      {insights && (
        <div className="insights-box">
          <p>
            <strong>{t("proposalEditor.matchedSkills")}</strong> {insights.matchedSkills?.slice(0, 6).join(", ") || t("proposalEditor.noDirectMatches")}
          </p>
          <p>
            <strong>{t("proposalEditor.focusRequirements")}</strong>{" "}
            {insights.requirements?.slice(0, 6).join(", ") || t("proposalEditor.notAvailable")}
          </p>
        </div>
      )}

      <div className="proposal-actions">
        <button className="secondary" onClick={onGenerateAgain} disabled={!selectedJob || !isPro}>
          {!isPro ? `🔒 ${t("proposalEditor.generateAgain")}` : t("proposalEditor.generateAgain")}
        </button>
        <button
          className="secondary"
          onClick={onUseProfileCoverLetter}
          disabled={!hasProfileCoverLetter}
          title={hasProfileCoverLetter ? "" : t("proposalEditor.noProfileCoverLetter", {}, "Add a cover letter in Profile first")}
        >
          {t("proposalEditor.useProfileCoverLetter", {}, "Use Profile Cover Letter")}
        </button>
      </div>
      {!isPro && <p className="muted">{t("proposalEditor.generateAgainPro")}</p>}

      <div className="proposal-compare-grid">
        <div className="proposal-column">
          <p className="muted">{t("proposalEditor.currentDraft")}</p>
          <textarea
            rows={12}
            value={proposal}
            onChange={(event) => setProposal(event.target.value)}
            placeholder={t("proposalEditor.generatePlaceholder")}
          />
        </div>

        <div className="proposal-column">
          <p className="muted">{t("proposalEditor.newVariant")}</p>
          <textarea
            rows={12}
            value={alternateProposal}
            readOnly
            placeholder={t("proposalEditor.variantPlaceholder")}
          />
          <button className="secondary" onClick={onUseAlternate} disabled={!alternateProposal}>
            {t("proposalEditor.useThisVersion")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProposalEditor;
