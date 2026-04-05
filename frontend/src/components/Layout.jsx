import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useRef, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";
import NotificationBell from "./NotificationBell";
import { api } from "../api/client";

const baseNavItems = [
  { path: "/",         labelKey: "nav.dashboard",  icon: "⚡" },
  { path: "/profile",  labelKey: "nav.profile",    icon: "👤" },
  { path: "/jobs",     labelKey: "nav.jobs",       icon: "🔍" },
  { path: "/tracker",  labelKey: "nav.tracker",    icon: "📋" },
  { path: "/settings", labelKey: "nav.smartApply", icon: "🚀" },
  { path: "/support",  label: "Support",           icon: "🛟" }
];

function Layout() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [indexWarning, setIndexWarning] = useState(null);
  const [warningDismissed, setWarningDismissed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerPanelRef = useRef(null);
  const navItems = user?.role === "admin"
    ? [...baseNavItems, { path: "/admin", labelKey: "nav.admin", icon: "🛡️" }]
    : baseNavItems;

  useEffect(() => {
    api.get("/system/index-status")
      .then(({ data }) => { if (data.warning) setIndexWarning(data.warning); })
      .catch(() => {});
  }, []);

  // Close drawer when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (drawerOpen && drawerPanelRef.current && !drawerPanelRef.current.contains(e.target)) {
        setDrawerOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [drawerOpen]);

  const handleLogout = () => { logout(); navigate("/login"); };
  const closeDrawer = () => setDrawerOpen(false);

  const dashboardQuickTabs = [
    { key: "overview", label: t("dashboard.weeklyActivity") },
    { key: "performance", label: t("dashboard.learningTitle") }
  ];

  const settingsQuickTabs = [
    { key: "billing", label: t("settings.subscriptionTitle") },
    { key: "automation", label: t("settings.safetyControlTitle") },
    { key: "policy", label: t("settings.responsibleAutomationTitle") }
  ];

  const jobsQuickTabs = [
    { path: "/jobs/all", label: t("jobs.filterAll") },
    { path: "/jobs/best-matches", label: t("jobs.topMatchesTitle", {}, "Best Matches") },
    { path: "/jobs/not-applied", label: t("jobs.filterNotApplied") },
    { path: "/jobs/applied", label: t("jobs.filterApplied") },
    { path: "/jobs/proposal-draft", label: "Draft" }
  ];

  const profileQuickTabs = [{ key: "edit", label: "Edit Profile" }];

  const routeSection = new URLSearchParams(location.search).get("section") || "";
  const isJobsRoute = location.pathname === "/jobs" || location.pathname.startsWith("/jobs/");
  const pageTitle =
    location.pathname === "/"
      ? t("nav.dashboard")
      : location.pathname === "/settings"
      ? t("nav.smartApply")
      : location.pathname === "/tracker"
      ? t("nav.tracker", {}, "Tracker")
      : isJobsRoute
      ? t("nav.jobs")
      : location.pathname === "/admin"
      ? t("nav.admin")
      : location.pathname === "/support"
      ? "Support"
      : location.pathname === "/profile"
      ? "Your Profile"
      : t("app.name");

  const topTabs =
    location.pathname === "/"
      ? dashboardQuickTabs
      : location.pathname === "/settings"
      ? settingsQuickTabs
      : isJobsRoute
      ? jobsQuickTabs
      : location.pathname === "/profile"
      ? profileQuickTabs
      : [];

  const renderNavLinks = (onClick) =>
    navItems.map((item) => (
      <NavLink
        key={item.path}
        to={item.path}
        end={item.path === "/"}
        className={({ isActive }) => (isActive ? "active" : "")}
        onClick={onClick}
      >
        <span className="nav-icon">{item.icon}</span>
        {item.label || t(item.labelKey)}
      </NavLink>
    ));

  return (
    <div className="app-shell">
      {/* Desktop sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>{t("app.name")}</h1>
          <p className="muted">{t("app.subtitle")}</p>
        </div>
        <nav>{renderNavLinks(undefined)}</nav>
      </aside>

      {/* Mobile top bar */}
      <header className="mobile-nav-bar">
        <span className="mobile-logo">{pageTitle}</span>
        <button className="hamburger" onClick={() => setDrawerOpen(true)} aria-label={t("common.openMenu")}>
          ☰
        </button>
      </header>

      {/* Mobile drawer */}
      <div className={`mobile-drawer${drawerOpen ? " open" : ""}`}>
        <div className="mobile-drawer-overlay" onClick={closeDrawer} />
        <nav className="mobile-drawer-panel" ref={drawerPanelRef}>
          {renderNavLinks(closeDrawer)}
        </nav>
      </div>

      {/* Main */}
      <main className="main-content">
        <header className="topbar">
          <div className="topbar-title-wrap">
            <h2>{pageTitle}</h2>
            {topTabs.length > 0 && (
              <div className="top-section-nav" role="tablist" aria-label="Page sections">
                {topTabs.map((tab) => (
                  <button
                    key={tab.key || tab.path}
                    type="button"
                    className={
                      tab.path
                        ? location.pathname === tab.path
                          ? "top-tab-active"
                          : "secondary"
                        : routeSection === tab.key || (!routeSection && tab.key === topTabs[0].key)
                        ? "top-tab-active"
                        : "secondary"
                    }
                    onClick={() => navigate(tab.path || `${location.pathname}?section=${tab.key}`)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="top-actions">
            <div className="top-avatar" title={user?.name || "User"} aria-label="Profile picture">
              {user?.profileImage ? (
                <img src={user.profileImage} alt={user?.name || "User"} />
              ) : (
                <span>{(user?.name || "U").charAt(0).toUpperCase()}</span>
              )}
            </div>
            <NotificationBell />
            <button className="secondary" onClick={handleLogout}>{t("common.logout")}</button>
          </div>
        </header>

        <section className="content-area">
          {indexWarning && !warningDismissed && (
            <div className="index-warning-banner">
              <strong>{t("system.dbWarning")}</strong> {indexWarning.message}
              <small className="muted"> {t("system.detectedAt")} {new Date(indexWarning.detectedAt).toLocaleString()}</small>
              <button className="secondary" onClick={() => setWarningDismissed(true)}>{t("common.dismiss")}</button>
            </div>
          )}
          <Outlet />
        </section>
      </main>
    </div>
  );
}

export default Layout;
