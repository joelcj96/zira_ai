import { useState, useEffect } from "react";
import { api } from "../api/client";
import { useI18n } from "../context/I18nContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

function CreditsPurchasePanel() {
  const { t } = useI18n();
  const { isPro, user } = useAuth();
  const { showToast } = useToast();
  const [credits, setCredits] = useState(null);
  const [packages, setPackages] = useState(null);
  const [purchasing, setPurchasing] = useState(null);

  useEffect(() => {
    loadCredits();
    loadPackages();
  }, []);

  const loadCredits = async () => {
    try {
      const res = await api.get("/credits/balance");
      setCredits(res.data);
    } catch (error) {
      console.error("Failed to load credits:", error);
    }
  };

  const loadPackages = async () => {
    try {
      const res = await api.get("/credits/packages");
      setPackages(res.data);
    } catch (error) {
      console.error("Failed to load packages:", error);
    }
  };

  const handlePurchase = async (packageId) => {
    if (user?.role !== "admin") {
      showToast(t("credits.purchaseNotActivated", {}, "Credit purchases are not activated yet. Please check back soon."), "info");
      return;
    }

    setPurchasing(packageId);
    try {
      const res = await api.post("/credits/purchase", { package: packageId });
      showToast(t("credits.purchaseSuccess", { count: res.data.credits - credits.credits }), "success");
      setCredits(res.data);
    } catch (error) {
      const rawMessage = error.response?.data?.message || error.message || "";
      const isTechnicalFailure =
        /_id\.slice|not a function|TypeError|Cannot read properties/i.test(rawMessage);
      const readableMessage = isTechnicalFailure
        ? t(
            "credits.purchaseFailedGeneric",
            {},
            "We could not process your purchase right now. Please try again in a moment."
          )
        : rawMessage;

      showToast(t("credits.purchaseFailed", { message: readableMessage }), "danger");
    } finally {
      setPurchasing(null);
    }
  };

  if (!credits || !packages) {
    return (
      <section className="panel credits-panel">
        <div className="credits-head">
          <h3>{t("credits.creditsTitle")}</h3>
          <p className="muted">{t("credits.loading")}</p>
        </div>
      </section>
    );
  }

  const creditStatus =
    credits.isUnlimited
      ? "unlimited"
      : credits.credits === 0
      ? "zero"
      : credits.credits <= 2
        ? "low"
        : credits.credits <= 5
          ? "medium"
          : "healthy";

  return (
    <section className="panel credits-panel">
      <div className="credits-head">
        <h3>{t("credits.title")}</h3>
        <p className="muted">
          {t("credits.costNote", {
            proposalCost: packages.proposalCost,
            applicationCost: packages.applicationCost
          })}
        </p>
      </div>

      <div className={`credits-display credits-${creditStatus}`}>
        <div className="credits-current">
          <div className="credit-value">{credits.isUnlimited ? "∞" : credits.credits}</div>
          <div className="credit-label">{t("credits.availableCredits")}</div>
        </div>

        {credits.isUnlimited && <div className="credit-good">✓ {t("credits.unlimitedCredits")}</div>}
        {creditStatus === "zero" && <div className="credit-warning">⚠ {t("credits.outOfCredits")}</div>}
        {creditStatus === "low" && <div className="credit-warning">⚠ {t("credits.lowOnCredits")}</div>}
      </div>

      <div className="stats-row">
        <div className="stat-mini">
          <span className="label">{t("credits.earned")}</span>
          <span className="value">{credits.totalEarned}</span>
        </div>
        <div className="stat-mini">
          <span className="label">{t("credits.spent")}</span>
          <span className="value">{credits.totalSpent}</span>
        </div>
      </div>

      {!credits.isUnlimited && (
        <div className="purchase-section">
          <h4>{t("credits.buyMore")}</h4>
          <div className="package-grid">
            {packages.packages.map((pkg) => (
              <div
                key={pkg.id}
                className={`package-card ${pkg.popular ? "popular" : ""}`}
              >
                {pkg.popular && <div className="popular-badge">{t("credits.mostPopular")}</div>}
                {pkg.discount > 0 && <div className="discount-badge">{t("credits.saveDiscount", { discount: pkg.discount })}</div>}

                <div className="package-credits">{pkg.credits} {t("credits.creditsTitle")}</div>
                <div className="package-price">${pkg.price}</div>
                <div className="package-cpp">{t("credits.pricePerCredit", { price: pkg.pricePerCredit.toFixed(3) })}</div>

                <button
                  className="btn btn-primary"
                  onClick={() => handlePurchase(pkg.id)}
                  disabled={purchasing !== null}
                >
                  {purchasing === pkg.id ? t("credits.processing") : t("credits.buyNow")}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {credits.isUnlimited && (
        <div className="subscription-panel compact">
          <p>{t("credits.unlimitedCreditsProNote")}</p>
        </div>
      )}


      <div className="credits-note">
        <p>
          <strong>{isPro ? t("settings.planPro") : t("credits.freeTierLabel")}:</strong>{" "}
          {isPro
            ? t("credits.proTierNote")
            : t("credits.freeTierNote", { count: packages.freeTierCredits })}
        </p>
      </div>
    </section>
  );
}

export default CreditsPurchasePanel;
