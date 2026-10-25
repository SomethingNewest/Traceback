import { activityById, metrics, traceAccuracyDescription } from '../activities/registry.js';
import { baselineForResult, compareValues } from '../data/baselines.js';
import { selectTrendResults, trendDateRange } from '../data/trends.js';
import { buildReportModel } from './report-model.js';
import { renderReportDocument } from './report-layout.js';

export const REPORT_LIMITATIONS =
  'These are game results. They are not a medical test and cannot show whether a brain injury has healed. Practice, tiredness, your device and your setup can change your results.';

// version 1 of these games used a circle/ring that didn't move
const VERSION_1_DESCRIPTIONS = {
  tap: 'Taps that hit the stationary circle, divided by all taps.',
  hold: 'Time inside the stationary ring, divided by the 10-second game.',
};

function pad(number) {
  return String(number).padStart(2, '0');
}

export function localDate(date) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

export function parseLocalDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(value)) {
    throw new Error('Choose a valid week.');
  }
  const parts = value.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const date = new Date(year, month - 1, day);
  // catches things like 2024-02-31 rolling over into March
  if (localDate(date) !== value) {
    throw new Error('Choose a valid week.');
  }
  return date;
}

// uses calendar days instead of adding 7 * 24 hours so DST changes don't shift the week
export function weekRange(value = new Date()) {
  let date;
  if (typeof value === 'string') {
    date = parseLocalDate(value);
  } else {
    date = new Date(value);
  }
  if (!Number.isFinite(date.getTime())) {
    throw new Error('Choose a valid week.');
  }

  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  const last = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  return { start: start, end: end, startDate: localDate(start), endDate: localDate(last) };
}

export function selectReportResults(
  store,
  { weekStart = new Date(), activityId = 'all', allDates = false } = {},
) {
  const range = weekRange(weekStart);
  if (activityId !== 'all' && !activityById(activityId)) {
    throw new Error('Choose a valid activity.');
  }

  const results = [];
  for (const result of store.results) {
    if (result.status !== 'complete' || result.isDemo !== false) continue;
    if (activityId !== 'all' && result.activityId !== activityId) continue;
    if (!allDates) {
      const time = Date.parse(result.createdAt);
      if (!(time >= range.start.getTime() && time < range.end.getTime())) continue;
    }
    results.push(result);
  }

  results.sort(function (a, b) {
    const diff = Date.parse(a.createdAt) - Date.parse(b.createdAt);
    if (diff) return diff;
    return a.id.localeCompare(b.id);
  });

  return Object.assign({}, range, { results: results });
}

export function metricMetadata(key, activityId, protocolVersion) {
  if (key === 'accuracyPct') {
    // a saved score keeps the meaning it had when the game was played,
    // so older trace versions keep their old descriptions
    if (activityId === 'trace' && [1, 2, 3, 4, 5].includes(protocolVersion)) {
      return {
        key: key,
        label: 'Line accuracy',
        unit: '%',
        description: traceAccuracyDescription(protocolVersion),
      };
    }

    const activity = activityById(activityId);
    let description = 'Accuracy for this activity.';
    if (
      activity &&
      activity.accuracyDescription !== undefined &&
      activity.accuracyDescription !== null
    ) {
      description = activity.accuracyDescription;
    }
    if (protocolVersion === 1 && Object.hasOwn(VERSION_1_DESCRIPTIONS, activityId)) {
      description = VERSION_1_DESCRIPTIONS[activityId];
    }

    let label = 'Accuracy';
    if (activity && activity.accuracyLabel !== undefined && activity.accuracyLabel !== null) {
      label = activity.accuracyLabel;
    }
    return { key: key, label: label, unit: '%', description: description };
  }

  const known = metrics[key];
  if (known !== undefined && known !== null) {
    return known;
  }
  return {
    key: key,
    label: key.replace(/([a-z])([A-Z])/g, '$1 $2'),
    unit: 'value',
    description: 'Recorded game measurement.',
  };
}

export function formatValue(value, unit = '') {
  if (!Number.isFinite(value)) {
    return 'Not recorded';
  }
  const text = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
  if (unit === '%') {
    return text + '%';
  }
  if (unit) {
    return text + ' ' + unit;
  }
  return text;
}

export function describeChange(result, baseline, key, unit) {
  if (!baseline) {
    return 'Starting point unavailable';
  }
  if (result.id === baseline.id) {
    return 'Starting point';
  }

  const change = compareValues(result.metrics[key], baseline.metrics[key], unit);
  if (change.absoluteChange === null) {
    return 'Not enough data to compare';
  }
  if (Math.abs(change.absoluteChange) < 1e-9) {
    return 'Same as your starting point';
  }

  const direction = change.absoluteChange > 0 ? 'higher' : 'lower';
  if (unit === '%') {
    return formatValue(Math.abs(change.absoluteChange), 'percentage points') + ' ' + direction;
  }

  const amount = formatValue(Math.abs(change.absoluteChange), unit);
  if (change.percentChange === null) {
    return amount + ' ' + direction + '; starting point was zero';
  }
  return amount + ' ' + direction + ' (' + formatValue(Math.abs(change.percentChange), '%') + ')';
}

export function reportRows(store, results, { includeNotes = false } = {}) {
  const rows = [];

  for (const result of results) {
    const baseline = baselineForResult(store, result);
    const device = store.devices.find((item) => item.id === result.context.deviceId);
    const series = store.baselineSeries.find((item) => item.id === result.seriesId);

    let deviceLabel = 'Unknown device';
    if (device && device.label !== undefined && device.label !== null) {
      deviceLabel = device.label;
    }

    for (const [key, value] of Object.entries(result.metrics)) {
      const metadata = metricMetadata(key, result.activityId, result.protocolVersion);

      let baselineValue = null;
      if (baseline && baseline.metrics[key] !== undefined && baseline.metrics[key] !== null) {
        baselineValue = baseline.metrics[key];
      }

      // the baseline result itself has nothing to compare against
      let change;
      if (baseline && result.id === baseline.id) {
        change = { absoluteChange: null, percentChange: null };
      } else {
        change = compareValues(value, baselineValue, metadata.unit);
      }

      const row = {
        result: result,
        baseline: baseline,
        series: series,
        deviceLabel: deviceLabel,
        key: key,
        value: value,
        metadata: metadata,
        baselineValue: baselineValue,
      };
      Object.assign(row, change);
      row.notes = includeNotes ? result.notes : '';
      rows.push(row);
    }
  }

  return rows;
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHTML(value) {
  let text = value;
  if (text === undefined || text === null) {
    text = '';
  }
  return String(text).replace(/[&<>"']/g, function (character) {
    return HTML_ESCAPES[character];
  });
}

function selectionLabel(activityId) {
  if (activityId === 'all') {
    return 'All activities';
  }
  return activityById(activityId).name;
}

export function printableReportHTML(
  store,
  {
    weekStart = new Date(),
    activityId = 'all',
    includeNotes = false,
    generatedAt = new Date(),
  } = {},
) {
  const selection = selectReportResults(store, { weekStart: weekStart, activityId: activityId });
  const rangeLabel = selection.startDate + ' to ' + selection.endDate;

  const model = buildReportModel(store, selection.results, {
    metadataFor: metricMetadata,
    rangeStart: selection.start,
    rangeEnd: selection.end,
    rangeLabel: rangeLabel,
    generatedAt: generatedAt,
  });

  return renderReportDocument(model, {
    title: 'Weekly report',
    rangeLabel: rangeLabel,
    generatedAtLabel: generatedAt.toLocaleString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    selectionLabel: selectionLabel(activityId),
    weekly: true,
    includeNotes: includeNotes,
    limitations: REPORT_LIMITATIONS,
  });
}

export function resultsReportHTML(
  store,
  {
    activityId = 'all',
    comparisonKey,
    timeframe = 'all',
    metricKey = 'accuracyPct',
    includeNotes = false,
    generatedAt = new Date(),
    now = generatedAt,
  } = {},
) {
  if (activityId !== 'all' && !activityById(activityId)) {
    throw new Error('Choose a valid game.');
  }

  const results = selectTrendResults(store.results, {
    activityId: activityId === 'all' ? undefined : activityId,
    comparisonKey: comparisonKey,
    timeframe: timeframe,
    now: now,
  });

  const range = trendDateRange(timeframe, now);
  let rangeLabel = 'All saved dates';
  if (range.start) {
    const lastDay = new Date(
      range.end.getFullYear(),
      range.end.getMonth(),
      range.end.getDate() - 1,
    );
    rangeLabel = localDate(range.start) + ' to ' + localDate(lastDay);
  }

  const model = buildReportModel(store, results, {
    metadataFor: metricMetadata,
    rangeStart: range.start,
    rangeEnd: range.start ? range.end : undefined,
    rangeLabel: rangeLabel,
    generatedAt: generatedAt,
    additionalMetricKeys: [metricKey],
  });

  return renderReportDocument(model, {
    title: 'Results report',
    rangeLabel: rangeLabel,
    generatedAtLabel: generatedAt.toLocaleString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    selectionLabel: selectionLabel(activityId),
    weekly: false,
    includeNotes: includeNotes,
    limitations: REPORT_LIMITATIONS,
  });
}
