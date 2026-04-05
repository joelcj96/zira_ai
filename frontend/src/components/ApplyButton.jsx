import { useState } from "react";
import { api } from "../api/client";
import { useI18n } from "../context/I18nContext";

function ApplyButton({
  job,
  mode = "manual",
  onApplySuccess,
  onApplyError,
  disabled = false,
  isApplied = false,
  proposalText = ""
}) {
  const { t } = useI18n();
  const [isLoading, setIsLoading] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [delayInfo, setDelayInfo] = useState(null);
  const [confirmation, setConfirmation] = useState(null);

  const handleQuickApply = async () => {
    if (!job || !job.id) {
      onApplyError?.(t("applyButton.missingJob"));
      return;
    }

    if (isApplied) {
      onApplyError?.(t("applyButton.alreadyAppliedError"));
      return;
    }

    try {
      setIsLoading(true);
      setDelayInfo(null);
      setConfirmation(null);

      const { data } = await api.post("/applications/quick-apply", {
        jobId: job.id,
        title: job.title,
        company: job.company,
        proposalText: proposalText || job.description,
        useMode: mode
      });

      // If semi-automatic, show waiting state
      if (data.mode === "semi-automatic" && data.delay) {
        setIsWaiting(true);
        setDelayInfo(data.delay);

        // Wait for the delay
        await data.delay.apply?.();

        setIsWaiting(false);
        setConfirmation({
          status: "success",
          message: `✓ ${t("applyButton.submittedTo", { company: data.application.company })}`,
          timestamp: new Date()
        });
      } else {
        // Manual mode - immediate confirmation
        setConfirmation({
          status: "success",
          message: `✓ ${t("applyButton.submittedTo", { company: data.application.company })}`,
          timestamp: new Date()
        });
      }

      onApplySuccess?.(data);

      // Clear confirmation after 3 seconds
      setTimeout(() => {
        setConfirmation(null);
      }, 3000);
    } catch (error) {
      const errorMsg = error.response?.data?.message || t("applyButton.failedApply");
      setConfirmation({
        status: "error",
        message: `✗ ${errorMsg}`,
        timestamp: new Date()
      });
      onApplyError?.(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  // Determine button state
  const isDisabled = disabled || isApplied || isLoading || isWaiting;
  const buttonText = isApplied
    ? t("applyButton.alreadyApplied")
    : isWaiting
    ? t("applyButton.submitting")
    : isLoading
    ? t("applyButton.preparing")
    : t("applyButton.applyNow");

  const buttonClass = isApplied
    ? "applied"
    : isWaiting
    ? "waiting"
    : isLoading
    ? "loading"
    : "ready";

  return (
    <div className="apply-button-wrapper">
      <button
        className={`apply-button ${buttonClass}`}
        onClick={handleQuickApply}
        disabled={isDisabled}
        title={
          isApplied
            ? t("applyButton.alreadyAppliedTitle")
            : t("applyButton.applyInMode", { mode })
        }
      >
        {isWaiting && <span className="spinner" />}
        {buttonText}
        {delayInfo && isWaiting && (
          <span className="delay-badge">{delayInfo.humanized}</span>
        )}
      </button>

      {delayInfo && isWaiting && (
        <div className="apply-delay-info">
          <p className="delay-message">
            {t("applyButton.humanActionIn", { delay: delayInfo.humanized })}
          </p>
          <div className="delay-bar">
            <div className="delay-progress" />
          </div>
        </div>
      )}

      {confirmation && (
        <div className={`apply-confirmation ${confirmation.status}`}>
          {confirmation.message}
        </div>
      )}
    </div>
  );
}

export default ApplyButton;
