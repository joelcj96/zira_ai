const ADMIN_DASHBOARD_TTL_MS = 30 * 1000;

const dashboardCache = new Map();

const buildCacheKey = (trendDays) => `trendDays:${trendDays}`;

export const getCachedAdminDashboard = ({ trendDays }) => {
  const cacheKey = buildCacheKey(trendDays);
  const cachedEntry = dashboardCache.get(cacheKey);

  if (!cachedEntry) {
    return null;
  }

  if (cachedEntry.expiresAt <= Date.now()) {
    dashboardCache.delete(cacheKey);
    return null;
  }

  return cachedEntry.payload;
};

export const setCachedAdminDashboard = ({ trendDays, payload }) => {
  const cacheKey = buildCacheKey(trendDays);
  dashboardCache.set(cacheKey, {
    payload,
    expiresAt: Date.now() + ADMIN_DASHBOARD_TTL_MS
  });
};

export const clearAdminDashboardCache = () => {
  dashboardCache.clear();
};

export const ADMIN_DASHBOARD_CACHE_TTL_MS = ADMIN_DASHBOARD_TTL_MS;