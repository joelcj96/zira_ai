import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { trackConversionEvent } from "../api/analytics";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";
import { useToast } from "../context/ToastContext";

const SAFETY_PRESETS = {
  safe: {
    safetyControls: {
      safetyMode: true,
      maxApplicationsPerDay: 6,
      delaySpeed: "slow"
    },
    responsibleAutomation: {
      enabled: true,
      minDelaySeconds: 60,
      maxDelaySeconds: 150,
      maxApplicationsPerHour: 2,
      maxApplicationsPerDay: 6,
      activeHoursStart: 9,
      activeHoursEnd: 18,
      minJobMatchScore: 70,
      enforceProposalDiversity: true,
      diversitySimilarityThreshold: 0.88
    },
    defaultDailyLimit: 6
  },
  balanced: {
    safetyControls: {
      safetyMode: true,
      maxApplicationsPerDay: 10,
      delaySpeed: "normal"
    },
    responsibleAutomation: {
      enabled: true,
      minDelaySeconds: 35,
      maxDelaySeconds: 90,
      maxApplicationsPerHour: 3,
      maxApplicationsPerDay: 10,
      activeHoursStart: 8,
      activeHoursEnd: 20,
      minJobMatchScore: 60,
      enforceProposalDiversity: true,
      diversitySimilarityThreshold: 0.9
    },
    defaultDailyLimit: 10
  },
  aggressive: {
    safetyControls: {
      safetyMode: false,
      maxApplicationsPerDay: 18,
      delaySpeed: "fast"
    },
    responsibleAutomation: {
      enabled: true,
      minDelaySeconds: 8,
      maxDelaySeconds: 22,
      maxApplicationsPerHour: 6,
      maxApplicationsPerDay: 18,
      activeHoursStart: 7,
      activeHoursEnd: 22,
      minJobMatchScore: 50,
      enforceProposalDiversity: false,
      diversitySimilarityThreshold: 0.95
    },
    defaultDailyLimit: 18
  }
};

const PRESET_NAMES = ["safe", "balanced", "aggressive"];

const PRESET_NUMERIC_PATHS = [
  "defaultDailyLimit",
  "safetyControls.maxApplicationsPerDay",
  "responsibleAutomation.minDelaySeconds",
  "responsibleAutomation.maxDelaySeconds",
  "responsibleAutomation.maxApplicationsPerHour",
  "responsibleAutomation.maxApplicationsPerDay",
  "responsibleAutomation.activeHoursStart",
  "responsibleAutomation.activeHoursEnd",
  "responsibleAutomation.minJobMatchScore",
  "responsibleAutomation.diversitySimilarityThreshold"
];

const formatUsd = (cents) => `$${(Number(cents || 0) / 100).toFixed(2)}`;

const getPathValue = (obj, path) =>
  path.split(".").reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);

const isPresetMatch = (form, preset) => {
  for (const path of PRESET_NUMERIC_PATHS) {
    if (Number(getPathValue(form, path)) !== Number(getPathValue(preset, path))) {
      return false;
    }
  }

  if (Boolean(form.safetyControls.safetyMode) !== Boolean(preset.safetyControls.safetyMode)) {
    return false;
  }
  if (String(form.safetyControls.delaySpeed) !== String(preset.safetyControls.delaySpeed)) {
    return false;
  }
  if (
    Boolean(form.responsibleAutomation.enabled) !==
    Boolean(preset.responsibleAutomation.enabled)
  ) {
    return false;
  }
  if (
    Boolean(form.responsibleAutomation.enforceProposalDiversity) !==
    Boolean(preset.responsibleAutomation.enforceProposalDiversity)
  ) {
    return false;
  }

  return true;
};

function SmartApplySettingsPage() {
  const { user, refreshUser, isPro } = useAuth();
  const { t } = useI18n();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({
    defaultMode: "manual",
    defaultDailyLimit: 5,
    requireReviewConfirmation: true,
    responsibleAutomation: {
      enabled: true,
      minDelaySeconds: 20,
      maxDelaySeconds: 90,
      maxApplicationsPerHour: 4,
      maxApplicationsPerDay: 12,
      activeHoursStart: 8,
      activeHoursEnd: 20,
      minJobMatchScore: 55,
      enforceProposalDiversity: true,
      diversitySimilarityThreshold: 0.9
    },
    safetyControls: {
      safetyMode: true,
      maxApplicationsPerDay: 8,
      delaySpeed: "slow"
    }
  });
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingStatus, setBillingStatus] = useState(null);
  const requestedSettingsSection = searchParams.get("section");
  const activeSettingsSection = ["billing", "automation", "policy"].includes(requestedSettingsSection)
    ? requestedSettingsSection
    : "billing";
  const [pricing, setPricing] = useState({
    monthlyCents: 1900,
    yearlyCents: 19000,
    yearlySavingsPercent: 17,
    currency: "usd"
  });

  const monthlyPriceLabel = `${formatUsd(pricing.monthlyCents)}/month`;
  const yearlyPriceLabel = `${formatUsd(pricing.yearlyCents)}/year`;
  const yearlyEquivalentLabel =
    pricing.yearlyCents > 0 ? `$${(pricing.yearlyCents / 12 / 100).toFixed(2)}/mo` : "$0.00/mo";
  const yearlySavingsPercent = pricing.yearlySavingsPercent || 0;
  const yearlyListPriceCents = Math.max(0, pricing.monthlyCents * 12);
  const yearlyListPriceLabel = `${formatUsd(yearlyListPriceCents)}/year`;
  const yearlySavingsAmountCents = Math.max(0, yearlyListPriceCents - pricing.yearlyCents);
  const yearlySavingsAmountLabel = formatUsd(yearlySavingsAmountCents);

  const loadBillingStatus = async () => {
    try {
      const { data } = await api.get("/billing/status");
      setBillingStatus(data);
    } catch (error) {
      console.error("Failed to load billing status", error);
    }
  };

  const loadPricing = async () => {
    try {
      const { data } = await api.get("/billing/pricing");
      setPricing((previous) => ({
        ...previous,
        monthlyCents: Number(data?.monthlyCents) > 0 ? Number(data.monthlyCents) : previous.monthlyCents,
        yearlyCents: Number(data?.yearlyCents) > 0 ? Number(data.yearlyCents) : previous.yearlyCents,
        yearlySavingsPercent:
          Number(data?.yearlySavingsPercent) >= 0
            ? Number(data.yearlySavingsPercent)
            : previous.yearlySavingsPercent,
        currency: data?.currency || previous.currency
      }));
    } catch (error) {
      console.error("Failed to load pricing", error);
    }
  };

  useEffect(() => {
    if (!user?.smartApplySettings) return;

    setForm({
      defaultMode: user.smartApplySettings.defaultMode || "manual",
      defaultDailyLimit: user.smartApplySettings.defaultDailyLimit || 5,
      requireReviewConfirmation:
        user.smartApplySettings.requireReviewConfirmation !== false,
      responsibleAutomation: {
        enabled: user.smartApplySettings.responsibleAutomation?.enabled !== false,
        minDelaySeconds: user.smartApplySettings.responsibleAutomation?.minDelaySeconds || 20,
        maxDelaySeconds: user.smartApplySettings.responsibleAutomation?.maxDelaySeconds || 90,
        maxApplicationsPerHour:
          user.smartApplySettings.responsibleAutomation?.maxApplicationsPerHour || 4,
        maxApplicationsPerDay:
          user.smartApplySettings.responsibleAutomation?.maxApplicationsPerDay || 12,
        activeHoursStart: user.smartApplySettings.responsibleAutomation?.activeHoursStart ?? 8,
        activeHoursEnd: user.smartApplySettings.responsibleAutomation?.activeHoursEnd ?? 20,
        minJobMatchScore: user.smartApplySettings.responsibleAutomation?.minJobMatchScore || 55,
        enforceProposalDiversity:
          user.smartApplySettings.responsibleAutomation?.enforceProposalDiversity !== false,
        diversitySimilarityThreshold:
          user.smartApplySettings.responsibleAutomation?.diversitySimilarityThreshold || 0.9
      },
      safetyControls: {
        safetyMode: user.smartApplySettings.safetyControls?.safetyMode !== false,
        maxApplicationsPerDay: user.smartApplySettings.safetyControls?.maxApplicationsPerDay || 8,
        delaySpeed: user.smartApplySettings.safetyControls?.delaySpeed || "slow"
      }
    });
  }, [user]);

  useEffect(() => {
    if (isPro) return;
    if (form.defaultMode === "semi-automatic") {
      setForm((previous) => ({ ...previous, defaultMode: "manual" }));
    }
  }, [isPro, form.defaultMode]);

  useEffect(() => {
    loadBillingStatus();
    loadPricing();
  }, []);

  useEffect(() => {
    if (isPro) return;
    trackConversionEvent({
      eventType: "lock_impression",
      surface: "settings_page",
      feature: "smart_assist_default_mode",
      dedupeKey: "settings_page:smart_assist_default_mode:lock_impression"
    });
  }, [isPro]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkoutStatus = params.get("checkout");
    const sessionId = params.get("session_id");

    if (checkoutStatus === "cancelled") {
      showToast(t("settings.checkoutCancelled"), "info");
      return;
    }

    if (checkoutStatus !== "success" || !sessionId) return;

    api
      .get(`/billing/checkout-session/${sessionId}`)
      .then(async () => {
        await refreshUser();
        await loadBillingStatus();
        showToast(t("settings.proActivated"), "success");
      })
      .catch((error) => {
        showToast(error.response?.data?.message || t("settings.checkoutFailed"), "danger");
      });
  }, [refreshUser]);

  const startUpgradeCheckout = async (billingCycle = "monthly") => {
    if (user?.role !== "admin") {
      showToast(t("settings.proUnavailableNotice", {}, "Pro subscriptions are temporarily unavailable. Our team will activate Pro manually for selected users."), "danger");
      return;
    }

    setBillingLoading(true);
    try {
      await trackConversionEvent({
        eventType: "upgrade_cta_click",
        surface: "settings_page",
        feature: billingCycle === "yearly" ? "subscription_upgrade_yearly" : "subscription_upgrade_monthly"
      });
      const { data } = await api.post("/billing/create-checkout-session", {
        source: "settings_page",
        feature: billingCycle === "yearly" ? "subscription_upgrade_yearly" : "subscription_upgrade_monthly",
        billingCycle
      });
      if (data?.url) {
        window.location.assign(data.url);
        return;
      }
      showToast(t("settings.checkoutError"), "danger");
    } catch (error) {
      const rawMessage = error.response?.data?.message || error.message || "";
      const isTechnicalFailure =
        /_id\.slice|not a function|TypeError|Cannot read properties/i.test(rawMessage);
      const readableMessage = isTechnicalFailure
        ? t(
            "settings.checkoutFailedGeneric",
            {},
            "We could not process your request right now. Please try again in a moment."
          )
        : rawMessage;
      showToast(readableMessage || t("settings.checkoutStart", {}, "Could not start checkout."), "danger");
    } finally {
      setBillingLoading(false);
    }
  };

  const onChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((previous) => ({
      ...previous,
      [name]: type === "checkbox" ? checked : value
    }));
  };

  const onPolicyChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((previous) => ({
      ...previous,
      responsibleAutomation: {
        ...previous.responsibleAutomation,
        [name]: type === "checkbox" ? checked : value
      }
    }));
  };

  const onSafetyChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((previous) => ({
      ...previous,
      safetyControls: {
        ...previous.safetyControls,
        [name]: type === "checkbox" ? checked : value
      }
    }));
  };

  const applySafetyPreset = (presetName) => {
    const preset = SAFETY_PRESETS[presetName];
    if (!preset) return;

    setForm((previous) => ({
      ...previous,
      defaultDailyLimit: preset.defaultDailyLimit,
      safetyControls: {
        ...previous.safetyControls,
        ...preset.safetyControls
      },
      responsibleAutomation: {
        ...previous.responsibleAutomation,
        ...preset.responsibleAutomation
      }
    }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();

    await api.put("/user/settings/smart-apply", {
      defaultMode: form.defaultMode,
      defaultDailyLimit: Number(form.defaultDailyLimit),
      requireReviewConfirmation: form.requireReviewConfirmation,
      responsibleAutomation: {
        enabled: form.responsibleAutomation.enabled,
        minDelaySeconds: Number(form.responsibleAutomation.minDelaySeconds),
        maxDelaySeconds: Number(form.responsibleAutomation.maxDelaySeconds),
        maxApplicationsPerHour: Number(form.responsibleAutomation.maxApplicationsPerHour),
        maxApplicationsPerDay: Number(form.responsibleAutomation.maxApplicationsPerDay),
        activeHoursStart: Number(form.responsibleAutomation.activeHoursStart),
        activeHoursEnd: Number(form.responsibleAutomation.activeHoursEnd),
        minJobMatchScore: Number(form.responsibleAutomation.minJobMatchScore),
        enforceProposalDiversity: form.responsibleAutomation.enforceProposalDiversity,
        diversitySimilarityThreshold: Number(form.responsibleAutomation.diversitySimilarityThreshold)
      },
      safetyControls: {
        safetyMode: form.safetyControls.safetyMode,
        maxApplicationsPerDay: Number(form.safetyControls.maxApplicationsPerDay),
        delaySpeed: form.safetyControls.delaySpeed
      }
    });

    await refreshUser();
    showToast(t("settings.saved"), "success");
  };

  const nextBillingDateText = billingStatus?.nextBillingDate
    ? new Date(billingStatus.nextBillingDate).toLocaleString()
    : t("settings.notAvailable");

  const billingBadgeClass =
    billingStatus?.status === "active" || billingStatus?.status === "trialing"
      ? "billing-pill billing-good"
      : billingStatus?.status === "past_due"
      ? "billing-pill billing-bad"
      : "billing-pill billing-neutral";

  const detectedPreset =
    PRESET_NAMES.find((presetName) => isPresetMatch(form, SAFETY_PRESETS[presetName])) || "custom";

  const detectedPresetLabel =
    detectedPreset === "safe"
      ? t("settings.presetSafe")
      : detectedPreset === "balanced"
      ? t("settings.presetBalanced")
      : detectedPreset === "aggressive"
      ? t("settings.presetAggressive")
      : t("settings.presetCustom");

  return (
    <>
      <form className="panel settings-main-panel" onSubmit={onSubmit}>
        <h3>{t("settings.title")}</h3>
        {activeSettingsSection === "billing" && <>
        <div className="subscription-panel">
          <h4>{t("settings.subscriptionTitle")}</h4>
          <p className="muted">
            {t("settings.currentPlan")} <strong>{isPro ? t("settings.planPro") : t("settings.planFree")}</strong>
            {isPro ? ` ${t("settings.premiumActive")}` : ` ${t("settings.limitedProposals")}`}
          </p>
          {!isPro && (
            <div className="pricing-grid">
              <article className="plan-card monthly-plan">
                <p className="plan-name">{t("settings.monthlyPlan", {}, "Monthly Pro")}</p>
                <p className="plan-price">{monthlyPriceLabel}</p>
                <p className="muted small">{t("settings.monthlyPlanHint", {}, "Best for getting started")}</p>
                <button type="button" onClick={() => startUpgradeCheckout("monthly")} disabled={billingLoading}>
                  {billingLoading
                    ? t("settings.openingCheckout")
                    : t("settings.chooseMonthly", {}, "Choose Monthly")}
                </button>
              </article>

              <article className="plan-card yearly-plan">
                <div className="plan-meta-row">
                  <span className="plan-badge">{t("settings.mostPopular", {}, "Most Popular")}</span>
                  {yearlySavingsPercent > 0 && (
                    <span className="plan-savings">{t("settings.savePercent", { percent: yearlySavingsPercent }, `Save ${yearlySavingsPercent}%`)}</span>
                  )}
                </div>
                <p className="plan-name">{t("settings.yearlyPlan", {}, "Yearly Pro")}</p>
                <p className="plan-price">{yearlyPriceLabel}</p>
                {yearlyListPriceCents > 0 && pricing.yearlyCents > 0 && pricing.yearlyCents < yearlyListPriceCents && (
                  <p className="plan-list-price">
                    {t("settings.originalYearlyPrice", { value: yearlyListPriceLabel }, `Originally ${yearlyListPriceLabel}`)}
                  </p>
                )}
                <p className="muted small">
                  {t("settings.yearlyEquivalent", { equivalent: yearlyEquivalentLabel }, `Only ${yearlyEquivalentLabel}`)}
                </p>
                {yearlySavingsAmountCents > 0 && (
                  <p className="plan-savings-amount">
                    {t("settings.youSaveAmount", { value: yearlySavingsAmountLabel }, `You save ${yearlySavingsAmountLabel}`)}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => startUpgradeCheckout("yearly")}
                  disabled={billingLoading}
                >
                  {billingLoading
                    ? t("settings.openingCheckout")
                    : t("settings.chooseYearly", {}, "Choose Yearly")}
                </button>
              </article>
            </div>
          )}
          {!isPro && (
            <p className="muted small">
              {yearlySavingsPercent > 0
                ? t("settings.yearlySavingsHint", { percent: yearlySavingsPercent }, `Yearly plan saves ${yearlySavingsPercent}% compared to monthly.`)
                : t("settings.yearlySavingsHint", {}, "Yearly plan saves compared to monthly.")}
            </p>
          )}
        </div>
        <div className="subscription-panel billing-health-card">
          <h4>{t("settings.billingHealthTitle")}</h4>
          {!billingStatus && <p className="muted">{t("settings.loadingBillingHealth")}</p>}
          {billingStatus && (
            <>
              <div className="billing-health-grid">
                <p>
                  {t("settings.statusLabel")} <span className={billingBadgeClass}>{billingStatus.status || "inactive"}</span>
                </p>
                <p>
                  {t("settings.nextRenewal")} <strong>{nextBillingDateText}</strong>
                </p>
                <p>
                  {t("settings.lastSync")} {billingStatus.lastStripeSyncAt ? new Date(billingStatus.lastStripeSyncAt).toLocaleString() : t("settings.notSyncedYet")}
                </p>
              </div>

              {billingStatus.cancelAtPeriodEnd && (
                <p className="billing-alert warn">
                  {t("settings.cancelAtPeriodEnd")}
                </p>
              )}

              {billingStatus.status === "past_due" && (
                <p className="billing-alert bad">
                  {t("settings.paymentFailed")}
                </p>
              )}
            </>
          )}
        </div>
        <p className="muted">
          {t("settings.settingsDesc")}
        </p>
        </>}

        {activeSettingsSection === "automation" && <>
        <div className="settings-grid">
          <div>
            <label htmlFor="defaultMode">{t("settings.defaultMode")}</label>
            <select id="defaultMode" name="defaultMode" value={form.defaultMode} onChange={onChange}>
              <option value="manual">{t("settings.modeManual")}</option>
              <option value="semi-automatic" disabled={!isPro}>
                {isPro ? t("settings.modeSmartAssist") : `🔒 ${t("settings.modeSmartAssist")}`}
              </option>
            </select>
            {!isPro && <p className="muted small">{t("settings.smartAssistProOnly")}</p>}
          </div>
          <div>
            <label htmlFor="defaultDailyLimit">{t("settings.defaultDailyLimit")}</label>
            <input
              id="defaultDailyLimit"
              name="defaultDailyLimit"
              type="number"
              min="1"
              max="25"
              value={form.defaultDailyLimit}
              onChange={onChange}
            />
          </div>
        </div>

        <label className="inline-check">
          <input
            type="checkbox"
            name="requireReviewConfirmation"
            checked={form.requireReviewConfirmation}
            onChange={onChange}
          />
          {t("settings.requireReviewLabel")}
        </label>
        <section className="responsible-automation-section">
          <h4>{t("settings.manualOverrideTitle")}</h4>
          <p className="muted">{t("settings.manualOverrideSub")}</p>
          <p className="muted">{t("settings.manualOverrideEditNote")}</p>
          <p className="muted">{t("settings.manualOverrideCancelNote")}</p>
          <p className="muted">{t("settings.manualOverrideSemiAutoNote")}</p>
        </section>

        <section className="responsible-automation-section">
          <h4>{t("settings.safetyControlTitle")}</h4>
          <p className="muted">{t("settings.safetyControlSub")}</p>

          <div className="preset-row" role="group" aria-label={t("settings.safetyPresetTitle")}>
            <span className="muted small">{t("settings.safetyPresetTitle")}</span>
            <div className="preset-actions">
              <button type="button" className="secondary" onClick={() => applySafetyPreset("safe")}>
                {t("settings.presetSafe")}
              </button>
              <button type="button" className="secondary" onClick={() => applySafetyPreset("balanced")}>
                {t("settings.presetBalanced")}
              </button>
              <button type="button" className="secondary" onClick={() => applySafetyPreset("aggressive")}>
                {t("settings.presetAggressive")}
              </button>
            </div>
            <p className="preset-detected">
              <strong>{t("settings.safetyCurrentPreset")}:</strong> {detectedPresetLabel}
            </p>
          </div>

          <label className="inline-check">
            <input
              type="checkbox"
              name="safetyMode"
              checked={form.safetyControls.safetyMode}
              onChange={onSafetyChange}
            />
            {t("settings.safetyModeToggle")}
          </label>

          <div className="settings-grid">
            <div>
              <label htmlFor="safetyMaxApplicationsPerDay">{t("settings.safetyMaxApplicationsPerDay")}</label>
              <input
                id="safetyMaxApplicationsPerDay"
                name="maxApplicationsPerDay"
                type="number"
                min="1"
                max="80"
                value={form.safetyControls.maxApplicationsPerDay}
                onChange={onSafetyChange}
              />
            </div>
            <div>
              <label htmlFor="delaySpeed">{t("settings.delaySpeed")}</label>
              <select
                id="delaySpeed"
                name="delaySpeed"
                value={form.safetyControls.delaySpeed}
                onChange={onSafetyChange}
              >
                <option value="slow">{t("settings.delaySlow")}</option>
                <option value="normal">{t("settings.delayNormal")}</option>
                <option value="fast">{t("settings.delayFast")}</option>
              </select>
            </div>
          </div>

          {!form.safetyControls.safetyMode && (
            <p className="billing-alert bad">{t("settings.safetyOffWarning")}</p>
          )}
          {form.safetyControls.delaySpeed === "fast" && (
            <p className="billing-alert warn">{t("settings.fastModeWarning")}</p>
          )}
        </section>
        </>}

        {activeSettingsSection === "policy" && <>
        <section className="responsible-automation-section">
          <h4>{t("settings.responsibleAutomationTitle")}</h4>
          <p className="muted">{t("settings.responsibleAutomationSub")}</p>

          <label className="inline-check">
            <input
              type="checkbox"
              name="enabled"
              checked={form.responsibleAutomation.enabled}
              onChange={onPolicyChange}
            />
            {t("settings.responsibleAutomationEnabled")}
          </label>

          <div className="settings-grid">
            <div>
              <label htmlFor="minDelaySeconds">{t("settings.minDelaySeconds")}</label>
              <input
                id="minDelaySeconds"
                name="minDelaySeconds"
                type="number"
                min="5"
                max="180"
                value={form.responsibleAutomation.minDelaySeconds}
                onChange={onPolicyChange}
              />
            </div>
            <div>
              <label htmlFor="maxDelaySeconds">{t("settings.maxDelaySeconds")}</label>
              <input
                id="maxDelaySeconds"
                name="maxDelaySeconds"
                type="number"
                min="8"
                max="300"
                value={form.responsibleAutomation.maxDelaySeconds}
                onChange={onPolicyChange}
              />
            </div>
            <div>
              <label htmlFor="maxApplicationsPerHour">{t("settings.maxApplicationsPerHour")}</label>
              <input
                id="maxApplicationsPerHour"
                name="maxApplicationsPerHour"
                type="number"
                min="1"
                max="20"
                value={form.responsibleAutomation.maxApplicationsPerHour}
                onChange={onPolicyChange}
              />
            </div>
            <div>
              <label htmlFor="maxApplicationsPerDay">{t("settings.maxApplicationsPerDay")}</label>
              <input
                id="maxApplicationsPerDay"
                name="maxApplicationsPerDay"
                type="number"
                min="1"
                max="80"
                value={form.responsibleAutomation.maxApplicationsPerDay}
                onChange={onPolicyChange}
              />
            </div>
            <div>
              <label htmlFor="activeHoursStart">{t("settings.activeHoursStart")}</label>
              <input
                id="activeHoursStart"
                name="activeHoursStart"
                type="number"
                min="0"
                max="23"
                value={form.responsibleAutomation.activeHoursStart}
                onChange={onPolicyChange}
              />
            </div>
            <div>
              <label htmlFor="activeHoursEnd">{t("settings.activeHoursEnd")}</label>
              <input
                id="activeHoursEnd"
                name="activeHoursEnd"
                type="number"
                min="0"
                max="23"
                value={form.responsibleAutomation.activeHoursEnd}
                onChange={onPolicyChange}
              />
            </div>
            <div>
              <label htmlFor="minJobMatchScore">{t("settings.minJobMatchScore")}</label>
              <input
                id="minJobMatchScore"
                name="minJobMatchScore"
                type="number"
                min="0"
                max="100"
                value={form.responsibleAutomation.minJobMatchScore}
                onChange={onPolicyChange}
              />
            </div>
            <div>
              <label htmlFor="diversitySimilarityThreshold">{t("settings.diversitySimilarityThreshold")}</label>
              <input
                id="diversitySimilarityThreshold"
                name="diversitySimilarityThreshold"
                type="number"
                min="0.5"
                max="0.99"
                step="0.01"
                value={form.responsibleAutomation.diversitySimilarityThreshold}
                onChange={onPolicyChange}
              />
            </div>
          </div>

          <label className="inline-check">
            <input
              type="checkbox"
              name="enforceProposalDiversity"
              checked={form.responsibleAutomation.enforceProposalDiversity}
              onChange={onPolicyChange}
            />
            {t("settings.enforceProposalDiversity")}
          </label>
        </section>
        </>}

        <button type="submit">{t("settings.saveDefaults")}</button>
      </form>

    </>
  );
}

export default SmartApplySettingsPage;
