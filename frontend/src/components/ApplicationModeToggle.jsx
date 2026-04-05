import { useState, useEffect } from "react";
import { api } from "../api/client";
import { useI18n } from "../context/I18nContext";

function ApplicationModeToggle({ onModeChange, currentMode, disabled = false }) {
  const { t } = useI18n();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/applications/apply-settings");
      setSettings(data);
    } catch (error) {
      console.error(t("applyMode.failedLoadSettings"), error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !settings) {
    return <div className="muted">{t("applyMode.loadingSettings")}</div>;
  }

  const getModeLabel = (modeOption) => {
    if (modeOption.value === "manual") return t("applyMode.manual");
    if (modeOption.value === "semi-automatic") return t("applyMode.smartAssist");
    return modeOption.label;
  };

  return (
    <div className="mode-toggle-panel">
      <h4>{t("applyMode.applicationMode")}</h4>
      <div className="mode-buttons">
        {settings.settings.modes.map((modeOption) => (
          <button
            key={modeOption.value}
            className={`mode-option ${currentMode === modeOption.value ? "active" : ""}`}
            onClick={() => onModeChange(modeOption.value)}
            disabled={disabled}
            title={modeOption.description}
          >
            <div className="mode-label">{getModeLabel(modeOption)}</div>
            <div className="mode-desc">{modeOption.description}</div>
          </button>
        ))}
      </div>
      <div className="limits-info">
        <strong>{t("applyMode.todayActivity")}</strong>
        <div className="limit-stat">
          <span>{settings.limits.appliedToday} / {settings.limits.dailyLimit}</span>
          <div className="limit-bar">
            <div
              className="limit-fill"
              style={{ width: `${Math.min(settings.limits.percentageUsed, 100)}%` }}
            />
          </div>
          <span className="muted">{t("applyMode.remaining", { count: settings.limits.remaining })}</span>
        </div>
      </div>
    </div>
  );
}

export default ApplicationModeToggle;
