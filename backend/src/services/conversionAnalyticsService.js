import ConversionEvent from "../models/ConversionEvent.js";
import { getPlanName } from "./subscriptionService.js";

const DEFAULT_TREND_DAYS = 14;

const toPercent = (numerator, denominator) => {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
};

const normalizeStartDate = (value) => {
  if (!value) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (DEFAULT_TREND_DAYS - 1));
    return date;
  }

  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const normalizeEndDate = (value) => {
  if (!value) {
    const date = new Date();
    date.setHours(23, 59, 59, 999);
    return date;
  }

  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
};

const buildEventFilters = ({ startDate, endDate, surface }) => {
  const normalizedStartDate = normalizeStartDate(startDate);
  const normalizedEndDate = normalizeEndDate(endDate);
  const query = {
    createdAt: {
      $gte: normalizedStartDate,
      $lte: normalizedEndDate
    }
  };

  if (surface && surface !== "all") {
    query.surface = surface;
  }

  return {
    query,
    normalizedStartDate,
    normalizedEndDate
  };
};

const toMap = (items) =>
  items.reduce((acc, item) => {
    acc[item._id] = item.count;
    return acc;
  }, {});

const buildTrendSeries = ({ rawTrend, normalizedStartDate, normalizedEndDate }) => {
  const rawMap = rawTrend.reduce((acc, item) => {
    acc[item._id] = item;
    return acc;
  }, {});

  const rows = [];
  const cursor = new Date(normalizedStartDate);

  while (cursor <= normalizedEndDate) {
    const dateKey = cursor.toISOString().slice(0, 10);
    const row = rawMap[dateKey] || {};
    rows.push({
      date: dateKey,
      lockImpressions: row.lockImpressions || 0,
      upgradeClicks: row.upgradeClicks || 0,
      checkoutStarts: row.checkoutStarts || 0,
      upgradesCompleted: row.upgradesCompleted || 0
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return rows;
};

const buildSummaryResponse = ({ totals, byType, bySurface, recent, trendSeries, filters }) => {
  const byTypeMap = toMap(byType);
  const surfacesMap = toMap(bySurface);

  const funnel = {
    lockImpressions: byTypeMap.lock_impression || 0,
    upgradeClicks: byTypeMap.upgrade_cta_click || 0,
    checkoutStarts: byTypeMap.checkout_started || 0,
    upgradesCompleted: byTypeMap.upgrade_completed || 0
  };

  return {
    filters,
    totalEvents: totals,
    byType: byTypeMap,
    bySurface: surfacesMap,
    availableSurfaces: Object.keys(surfacesMap).sort(),
    funnel: {
      ...funnel,
      rates: {
        clickThroughRate: toPercent(funnel.upgradeClicks, funnel.lockImpressions),
        checkoutStartRate: toPercent(funnel.checkoutStarts, funnel.upgradeClicks),
        upgradeCompletionRate: toPercent(funnel.upgradesCompleted, funnel.checkoutStarts),
        overallConversionRate: toPercent(funnel.upgradesCompleted, funnel.lockImpressions)
      }
    },
    trends: trendSeries,
    recent
  };
};

export const trackConversionEvent = async ({
  user,
  eventType,
  surface,
  feature = "",
  metadata = {},
  uniqueKey = ""
}) => {
  if (!user?._id || !eventType || !surface) {
    return null;
  }

  if (uniqueKey) {
    const existing = await ConversionEvent.findOne({
      user: user._id,
      eventType,
      "metadata.uniqueKey": uniqueKey
    });

    if (existing) {
      return existing;
    }
  }

  return ConversionEvent.create({
    user: user._id,
    eventType,
    surface,
    feature,
    planAtEvent: getPlanName(user),
    metadata: {
      ...metadata,
      ...(uniqueKey ? { uniqueKey } : {})
    }
  });
};

export const getConversionAnalyticsSummary = async ({ startDate, endDate, surface } = {}) => {
  const { query, normalizedStartDate, normalizedEndDate } = buildEventFilters({
    startDate,
    endDate,
    surface
  });

  const [totals, byType, bySurface, recent, rawTrend] = await Promise.all([
    ConversionEvent.countDocuments(query),
    ConversionEvent.aggregate([
      { $match: query },
      { $group: { _id: "$eventType", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    ConversionEvent.aggregate([
      { $match: query },
      { $group: { _id: "$surface", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    ConversionEvent.find(query)
      .sort({ createdAt: -1 })
      .limit(50)
      .select("eventType surface feature planAtEvent createdAt metadata")
      .lean(),
    ConversionEvent.aggregate([
      { $match: query },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          lockImpressions: {
            $sum: { $cond: [{ $eq: ["$eventType", "lock_impression"] }, 1, 0] }
          },
          upgradeClicks: {
            $sum: { $cond: [{ $eq: ["$eventType", "upgrade_cta_click"] }, 1, 0] }
          },
          checkoutStarts: {
            $sum: { $cond: [{ $eq: ["$eventType", "checkout_started"] }, 1, 0] }
          },
          upgradesCompleted: {
            $sum: { $cond: [{ $eq: ["$eventType", "upgrade_completed"] }, 1, 0] }
          }
        }
      },
      { $sort: { _id: 1 } }
    ])
  ]);

  const trendSeries = buildTrendSeries({ rawTrend, normalizedStartDate, normalizedEndDate });

  return buildSummaryResponse({
    totals,
    byType,
    bySurface,
    recent,
    trendSeries,
    filters: {
      startDate: normalizedStartDate.toISOString(),
      endDate: normalizedEndDate.toISOString(),
      surface: surface || "all"
    }
  });
};

export const exportConversionEventsCsv = async ({ startDate, endDate, surface } = {}) => {
  const { query } = buildEventFilters({ startDate, endDate, surface });
  const events = await ConversionEvent.find(query)
    .sort({ createdAt: -1 })
    .select("eventType surface feature planAtEvent createdAt metadata")
    .lean();

  const escapeCell = (value) => {
    const cell = value === undefined || value === null ? "" : String(value);
    return `"${cell.replaceAll('"', '""')}"`;
  };

  const header = ["createdAt", "eventType", "surface", "feature", "planAtEvent", "metadata"];
  const rows = events.map((event) => [
    event.createdAt,
    event.eventType,
    event.surface,
    event.feature || "",
    event.planAtEvent,
    JSON.stringify(event.metadata || {})
  ]);

  return [header, ...rows].map((row) => row.map(escapeCell).join(",")).join("\n");
};