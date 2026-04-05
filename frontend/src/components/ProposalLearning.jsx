import { useState, useEffect } from "react";
import { api } from "../api/client";
import { useI18n } from "../context/I18nContext";
import { trackConversionEvent } from "../api/analytics";
import { useToast } from "../context/ToastContext";

function ProposalLearning({ proposalHistoryId, selectedJob, isPro, onRegenerateSmart, onUpgrade, onNotify }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [successPatterns, setSuccessPatterns] = useState(null);
  const [isMarking, setIsMarking] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [rating, setRating] = useState(3);
  const [expanded, setExpanded] = useState(false);

  const notify = (message) => {
    if (!message) return;
    if (onNotify) {
      onNotify(message);
      return;
    }
    showToast(message, "info");
  };

  useEffect(() => {
    loadSuccessPatterns();
  }, []);

  useEffect(() => {
    if (isPro) return;
    trackConversionEvent({
      eventType: "lock_impression",
      surface: "proposal_learning",
      feature: "regenerate_smarter",
      dedupeKey: "proposal_learning:regenerate_smarter:lock_impression"
    });
  }, [isPro]);

  const loadSuccessPatterns = async () => {
    try {
      const { data } = await api.get("/proposals/successful-patterns");
      setSuccessPatterns(data);
    } catch (error) {
      console.error("Failed to load success patterns", error);
    }
  };

  const handleMarkSuccess = async (successReason) => {
    if (!proposalHistoryId) {
      notify(t("proposalLearning.alertGenFirst"));
      return;
    }

    try {
      setIsMarking(true);
      const { data } = await api.post(`/proposals/mark-success/${proposalHistoryId}`, {
        successReason,
        userRating: rating,
        userFeedback: feedback
      });

      setFeedback("");
      setRating(3);
      await loadSuccessPatterns();
      notify(t("proposalLearning.alertSuccessMarked"));
    } catch (error) {
      notify(error.response?.data?.message || t("proposalLearning.couldNotMark"));
    } finally {
      setIsMarking(false);
    }
  };

  const handleRegenerateSmart = () => {
    if (!selectedJob || !proposalHistoryId) {
      notify(t("proposalLearning.alertSelectJobFirst"));
      return;
    }
    onRegenerateSmart(proposalHistoryId);
  };

  return (
    <div className="proposal-learning-panel">
      <div className="learning-header" onClick={() => setExpanded(!expanded)}>
        <h4>🧠 {t("proposalLearning.title")}</h4>
        <span className="expand-icon">{expanded ? "▼" : "▶"}</span>
      </div>

      {expanded && (
        <div className="learning-content">
          {successPatterns && successPatterns.successCount > 0 ? (
            <div className="success-insights">
              <div className="insight-stat">
                <div className="stat-value">{successPatterns.successCount}</div>
                <div className="stat-label">{t("proposalLearning.successfulProposals")}</div>
              </div>
              <div className="insight-stat">
                <div className="stat-value" style={{ textTransform: "capitalize" }}>
                  {successPatterns.mostEffectiveTone}
                </div>
                <div className="stat-label">{t("proposalLearning.mostEffectiveTone")}</div>
              </div>
              <div className="insight-stat">
                <div className="stat-value">{(successPatterns.averageConfidence * 100).toFixed(0)}%</div>
                <div className="stat-label">{t("proposalLearning.avgConfidence")}</div>
              </div>

              {successPatterns.recommendations && (
                <div className="recommendations">
                  <p className="recommendations-title">📋 {t("proposalLearning.recommendationsTitle")}</p>
                  {successPatterns.recommendations.map((rec, idx) => (
                    <p key={idx} className="recommendation-item">
                      • {rec}
                    </p>
                  ))}
                </div>
              )}

              <button
                className="regenerate-smart-btn"
                onClick={handleRegenerateSmart}
                disabled={!isPro}
              >
                {!isPro ? `🔒 ${t("proposalLearning.regenerateSmarter")}` : `✨ ${t("proposalLearning.regenerateSmarter")}`}
              </button>
              <p className="muted small">{t("proposalLearning.regenerateSub")}</p>
              {!isPro && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => onUpgrade?.("proposal_learning", "regenerate_smarter")}
                >
                  {t("proposalLearning.upgradeToPro")}
                </button>
              )}
            </div>
          ) : (
            <div className="no-patterns">
              <p>🤖 {t("proposalLearning.aiLearnIntro")}</p>
              <p className="muted">{t("proposalLearning.markSuccessHint")}</p>
            </div>
          )}

          <div className="success-tracking">
            <h5>{t("proposalLearning.markSuccessTitle")}</h5>
            <p className="muted small">{t("proposalLearning.markSuccessHint2")}</p>

            <div className="rating-row">
              <label>{t("proposalLearning.ratingLabel")}</label>
              <div className="rating-stars">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    className={`star-btn ${rating >= star ? "active" : ""}`}
                    onClick={() => setRating(star)}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>

            <div className="success-reason-buttons">
              <button
                className={`reason-btn ${rating >= 4 ? "visible" : ""}`}
                onClick={() => handleMarkSuccess("interview_secured")}
                disabled={isMarking}
              >
                🎉 {t("proposalLearning.interviewSecured")}
              </button>
              <button
                className={`reason-btn ${rating >= 3 ? "visible" : ""}`}
                onClick={() => handleMarkSuccess("great_fit")}
                disabled={isMarking}
              >
                💡 {t("proposalLearning.greatFit")}
              </button>
              <button
                className={`reason-btn ${rating >= 2 ? "visible" : ""}`}
                onClick={() => handleMarkSuccess("strong_match")}
                disabled={isMarking}
              >
                📍 {t("proposalLearning.strongMatch")}
              </button>
              <button
                className="reason-btn feedback-btn"
                onClick={() => handleMarkSuccess("learning")}
                disabled={isMarking}
              >
                📝 {t("proposalLearning.addFeedback")}
              </button>
            </div>

            <textarea
              name="feedback"
              placeholder={t("proposalLearning.feedbackPlaceholder")}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows="3"
              style={{ marginBottom: "10px" }}
            />

            <button
              className="secondary"
              onClick={() => handleMarkSuccess("good_effort")}
              disabled={isMarking}
            >
              {isMarking ? t("proposalLearning.saving") : t("proposalLearning.markUseful")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProposalLearning;
