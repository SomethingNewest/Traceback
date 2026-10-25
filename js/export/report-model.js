import {
  activityById,
  metrics as registeredMetrics,
  traceAccuracyDescription,
} from '../activities/registry.js';
import { baselineForResult, compareValues } from '../data/baselines.js';
import {
  chronological,
  gameCounts,
  localDayKey,
  MAX_FREQUENCY_BUCKETS,
  FREQUENCY_RANGE_MESSAGE,
} from '../data/trends.js';

const DAY_MS = 86400000;

function finiteOrNull(value) {
  if (Number.isFinite(value)) {
    return value;
  }
  return null;
}

function isPersonalResult(result) {
  if (result.status !== 'complete') return false;
  if (result.isDemo !== false) return false;
  if (result.isPractice === true) return false;
  return Number.isFinite(Date.parse(result.createdAt));
}

function formatNumber(value) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function dateLabel(value) {
  if (!value) {
    return 'Unavailable';
  }
  return new Date(value).toLocaleString();
}

function metricOf(result, key) {
  if (!result || !result.metrics) {
    return undefined;
  }
  return result.metrics[key];
}

// turns "meanDistancePct" into "mean Distance Pct"
function splitCamelCase(key) {
  return key.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function metadataForMetric(key, activityId, protocolVersion) {
  if (key === 'accuracyPct') {
    const activity = activityById(activityId);
    let label = 'Accuracy';
    let description = 'Recorded accuracy for this game.';
    if (activity && activity.accuracyLabel !== undefined && activity.accuracyLabel !== null) {
      label = activity.accuracyLabel;
    }
    if (
      activity &&
      activity.accuracyDescription !== undefined &&
      activity.accuracyDescription !== null
    ) {
      description = activity.accuracyDescription;
    }
    if (activityId === 'trace') description = traceAccuracyDescription(protocolVersion);
    return { key: key, label: label, unit: '%', description: description };
  }

  const known = registeredMetrics[key];
  if (known !== undefined && known !== null) {
    return known;
  }
  return {
    key: key,
    label: splitCamelCase(key),
    unit: 'value',
    description: 'Recorded game measurement.',
  };
}

function unitSuffix(unit) {
  if (unit === '%') return '%';
  if (unit) return ' ' + unit;
  return '';
}

function valueLabel(value, unit) {
  if (value === null) {
    return 'Not recorded';
  }
  return formatNumber(value) + unitSuffix(unit);
}

function changeLabel(change) {
  if (change.absoluteChange === null) {
    return 'Not enough data to compare';
  }
  let text = '';
  if (change.absoluteChange > 0) {
    text = '+';
  }
  text += formatNumber(change.absoluteChange);
  if (change.changeUnit) {
    text += ' ' + change.changeUnit;
  }
  return text;
}

function localMidnight(value) {
  // a plain YYYY-MM-DD date has to be read as a local date, not UTC
  let date;
  if (typeof value === 'string' && /^\d{4}-\d\d-\d\d$/.test(value)) {
    const parts = value.split('-');
    date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  } else {
    date = new Date(value);
  }
  if (!Number.isFinite(date.getTime())) {
    return null;
  }
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function frequencyFor(results, rangeStart, rangeEnd) {
  let start = null;
  if (rangeStart !== undefined && rangeStart !== null) {
    start = localMidnight(rangeStart);
  }
  let end = null;
  if (rangeEnd !== undefined && rangeEnd !== null) {
    end = localMidnight(rangeEnd);
  }
  if (!start || !end || end <= start) {
    return gameCounts(results);
  }

  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
  const lastUtc = Date.UTC(last.getFullYear(), last.getMonth(), last.getDate());
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const calendarDays = Math.round((lastUtc - startUtc) / DAY_MS) + 1;

  let unit = 'day';
  if (calendarDays > 35) {
    unit = 'week';
  }
  const step = unit === 'week' ? 7 : 1;
  let firstWeekOffset = 0;
  if (unit === 'week') {
    firstWeekOffset = (start.getDay() + 6) % 7;
  }

  const bucketCount = Math.floor((calendarDays + firstWeekOffset - 1) / step) + 1;
  if (bucketCount > MAX_FREQUENCY_BUCKETS) {
    return { unit: unit, buckets: [], message: FREQUENCY_RANGE_MESSAGE };
  }

  const first = new Date(start);
  first.setDate(first.getDate() - firstWeekOffset);

  const buckets = [];
  const cursor = new Date(first);
  while (cursor <= last) {
    buckets.push({ key: localDayKey(cursor), date: new Date(cursor), count: 0 });
    cursor.setDate(cursor.getDate() + step);
  }

  const byKey = new Map();
  for (const bucket of buckets) {
    byKey.set(bucket.key, bucket);
  }

  for (const result of results) {
    const date = new Date(result.createdAt);
    if (date < start || date >= end) continue;
    if (unit === 'week') {
      date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    }
    const bucket = byKey.get(localDayKey(date));
    if (bucket) {
      bucket.count = bucket.count + 1;
    }
  }

  return { unit: unit, buckets: buckets };
}

function setupLabel(context, config, deviceLabel) {
  let hand = context.hand;
  if (hand === undefined || hand === null) {
    hand = 'unspecified';
  }
  let pointer = context.pointerType;
  if (pointer === undefined || pointer === null) {
    pointer = 'Unknown input';
  }
  let targetMode = config.targetSizeMode;
  if (targetMode === undefined || targetMode === null) {
    targetMode = 'standard';
  }

  const labels = [hand + ' hand', deviceLabel, pointer];
  if (Number.isFinite(context.surfaceCssWidth) && Number.isFinite(context.surfaceCssHeight)) {
    labels.push(context.surfaceCssWidth + ' x ' + context.surfaceCssHeight + ' CSS px');
  }
  labels.push(targetMode + ' targets');
  if (context.assistiveInputMode && context.assistiveInputMode !== 'none') {
    labels.push(context.assistiveInputMode);
  }
  if (context.assistedInput) labels.push('Assisted input');
  if (context.caregiverProvidedInput) labels.push('Caregiver provided input');
  if (context.caregiverSetupHelp) labels.push('Help with setup');
  return labels.join(' - ');
}

// Builds a read only view of exactly the results passed in.
// Results are only compared inside the same setup and game version.
export function buildReportModel(
  store,
  selectedResults,
  {
    metadataFor = metadataForMetric,
    rangeStart,
    rangeEnd,
    rangeLabel = 'Selected results',
    generatedAt = new Date(),
    additionalMetricKeys = [],
  } = {},
) {
  const results = selectedResults.filter(isPersonalResult);
  results.sort(chronological);

  const grouped = new Map();
  for (const result of results) {
    // saved results always have a comparison key. anything imported without one
    // gets its own group so it doesn't get merged into some other line
    let key = result.comparisonKey;
    if (key === undefined || key === null) {
      key = 'unidentified:' + result.id;
    }
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(result);
  }

  const groups = [];
  let index = 0;
  for (const [comparisonKey, entries] of grouped) {
    index++;
    groups.push(
      buildGroup(store, comparisonKey, entries, index, metadataFor, additionalMetricKeys),
    );
  }

  const days = new Set();
  const games = new Set();
  for (const result of results) {
    days.add(localDayKey(new Date(result.createdAt)));
    games.add(result.activityId);
  }

  const summary = {
    completedGames: results.length,
    totalGames: results.length,
    activeDays: days.size,
    distinctGames: games.size,
    activityCount: games.size,
    seriesCount: groups.length,
    setupCount: groups.length,
  };

  return {
    results: results,
    groups: groups,
    summary: summary,
    frequency: frequencyFor(results, rangeStart, rangeEnd),
    rangeStart: rangeStart,
    rangeEnd: rangeEnd,
    rangeLabel: rangeLabel,
    generatedAt: new Date(generatedAt),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

function buildGroup(store, comparisonKey, entries, index, metadataFor, additionalMetricKeys) {
  const first = entries[0];
  const latest = entries[entries.length - 1];

  // only use the baseline if it really is the same setup and game
  let baseline = null;
  const candidate = baselineForResult(store, first);
  if (
    candidate &&
    candidate.comparisonKey === first.comparisonKey &&
    candidate.activityId === first.activityId
  ) {
    baseline = candidate;
  }

  const activity = activityById(first.activityId);
  let deviceLabel = 'Unknown device';
  const device = store.devices.find((item) => item.id === first.context.deviceId);
  if (device && device.label !== undefined && device.label !== null) {
    deviceLabel = device.label;
  }

  const keySet = new Set();
  for (const result of entries) {
    for (const key of Object.keys(result.metrics || {})) {
      keySet.add(key);
    }
  }
  const keys = Array.from(keySet);

  const baselineDate = baseline ? baseline.createdAt : undefined;

  function summarize(key) {
    const metadata = metadataFor(key, first.activityId, first.protocolVersion);
    const firstValue = finiteOrNull(metricOf(first, key));
    const latestValue = finiteOrNull(metricOf(latest, key));
    const baselineValue = finiteOrNull(metricOf(baseline, key));
    const change = compareValues(latestValue, baselineValue, metadata.unit);

    let availableCount = 0;
    for (const result of entries) {
      if (Number.isFinite(metricOf(result, key))) {
        availableCount++;
      }
    }

    return Object.assign({}, metadata, {
      key: key,
      firstValue: firstValue,
      latestValue: latestValue,
      baselineValue: baselineValue,
      change: change,
      firstToLatestChange: compareValues(latestValue, firstValue, metadata.unit),
      availableCount: availableCount,
      firstValueLabel: valueLabel(firstValue, metadata.unit),
      latestValueLabel: valueLabel(latestValue, metadata.unit),
      baselineValueLabel: valueLabel(baselineValue, metadata.unit),
      baselineDateLabel: dateLabel(baselineDate),
      changeLabel: changeLabel(change),
    });
  }

  // accuracy is always charted, plus the game's main metric and any extras asked for
  const wanted = ['accuracyPct'];
  if (activity && activity.metricKey) {
    wanted.push(activity.metricKey);
  }
  for (const key of additionalMetricKeys) {
    if (key) {
      wanted.push(key);
    }
  }
  const chartKeys = [];
  for (const key of new Set(wanted)) {
    if (key === 'accuracyPct') {
      chartKeys.push(key);
      continue;
    }
    if (entries.some((result) => Number.isFinite(metricOf(result, key)))) {
      chartKeys.push(key);
    }
  }

  const label = setupLabel(first.context, first.config, deviceLabel);
  let activityName = first.activityId;
  if (activity && activity.name !== undefined && activity.name !== null) {
    activityName = activity.name;
  }

  return {
    id: 'report-series-' + index,
    comparisonKey: comparisonKey,
    activityId: first.activityId,
    activityName: activityName,
    protocolVersion: first.protocolVersion,
    metricVersion: first.metricVersion,
    context: first.context,
    config: first.config,
    deviceLabel: deviceLabel,
    setupLabel: label,
    contextLabel: label,
    baseline: baseline,
    baselineDateLabel: dateLabel(baselineDate),
    first: first,
    latest: latest,
    results: entries,
    metrics: chartKeys.map(summarize),
    allMetrics: keys.map(summarize),
  };
}
