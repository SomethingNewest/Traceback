// Trends keep each game version and setup separate. Scores are never averaged
// across different games, and a missing value is never treated as zero.
export const MAX_FREQUENCY_BUCKETS = 1000;
export const FREQUENCY_RANGE_MESSAGE =
  'These dates are too far apart to show a graph. Choose a shorter time range.';

const DAY_MS = 86400000;

export function chronological(a, b) {
  const diff = Date.parse(a.createdAt) - Date.parse(b.createdAt);
  if (diff) {
    return diff;
  }
  return a.id.localeCompare(b.id);
}

function isPersonalResult(result) {
  if (result.status !== 'complete') return false;
  if (result.isDemo !== false) return false;
  if (result.isPractice === true) return false;
  return Number.isFinite(Date.parse(result.createdAt));
}

function pad(number) {
  return String(number).padStart(2, '0');
}

export function localDayKey(date) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

export function trendDateRange(timeframe = 'all', now = new Date()) {
  if (timeframe !== 'all' && timeframe !== '7' && timeframe !== '30') {
    throw new Error('Choose a valid time range.');
  }
  const date = new Date(now);
  if (!Number.isFinite(date.getTime())) {
    throw new Error('Choose a valid date.');
  }

  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  let start = null;
  if (timeframe !== 'all') {
    const days = Number(timeframe);
    start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - days + 1);
  }
  return { start: start, end: end };
}

export function selectTrendResults(
  results,
  { activityId, comparisonKey, timeframe = 'all', now = new Date() } = {},
) {
  const range = trendDateRange(timeframe, now);
  const selected = [];

  for (const result of results) {
    if (!isPersonalResult(result)) continue;
    if (activityId && result.activityId !== activityId) continue;
    if (comparisonKey !== undefined && result.comparisonKey !== comparisonKey) continue;
    if (range.start) {
      const time = Date.parse(result.createdAt);
      if (time < range.start.getTime() || time >= range.end.getTime()) continue;
    }
    selected.push(result);
  }

  selected.sort(chronological);
  return selected;
}

export function comparisonGroups(results, activityId) {
  const groups = new Map();
  const selected = selectTrendResults(results, { activityId: activityId });

  for (const result of selected) {
    if (!result.comparisonKey) continue;
    let group = groups.get(result.comparisonKey);
    if (!group) {
      group = { comparisonKey: result.comparisonKey, results: [] };
      groups.set(result.comparisonKey, group);
    }
    group.results.push(result);
  }

  const list = Array.from(groups.values());
  // newest group first
  list.sort(function (a, b) {
    return chronological(b.results[b.results.length - 1], a.results[a.results.length - 1]);
  });
  return list;
}

export function metricChange(value, baselineValue, unit = '') {
  if (!Number.isFinite(value) || !Number.isFinite(baselineValue)) {
    return null;
  }
  let changeUnit = unit;
  if (unit === '%') {
    changeUnit = 'percentage points';
  }
  return { difference: value - baselineValue, unit: changeUnit };
}

// x positions come from the real timestamps. if a game is missing the value
// the line gets broken there so it doesn't look like it was measured
export function trendGeometry(
  results,
  metricKey,
  { width = 760, height = 300, baselineValue = null, percent = false } = {},
) {
  const ordered = results.filter((result) => Number.isFinite(Date.parse(result.createdAt)));
  ordered.sort(chronological);

  const bounds = { left: 72, right: width - 30, top: 24, bottom: height - 58 };
  if (bounds.right <= bounds.left || bounds.bottom <= bounds.top) {
    throw new Error('Chart is too small.');
  }

  const times = [];
  const values = [];
  for (const result of ordered) {
    times.push(Date.parse(result.createdAt));
    const value = result.metrics ? result.metrics[metricKey] : undefined;
    if (Number.isFinite(value)) {
      values.push(value);
    }
  }
  if (Number.isFinite(baselineValue)) {
    values.push(baselineValue);
  }

  let maximum;
  if (percent) {
    maximum = 100;
  } else {
    maximum = Math.max(0, ...values);
    if (maximum > 0) {
      maximum = maximum * 1.12;
    } else {
      maximum = 1;
    }
  }
  const minimum = 0;

  let firstTime = 0;
  if (times.length > 0) {
    firstTime = times[0];
  }
  let lastTime = firstTime;
  if (times.length > 0) {
    lastTime = times[times.length - 1];
  }

  function xFor(time) {
    if (firstTime === lastTime) {
      return (bounds.left + bounds.right) / 2;
    }
    return (
      bounds.left + ((time - firstTime) / (lastTime - firstTime)) * (bounds.right - bounds.left)
    );
  }

  function yFor(value) {
    return bounds.bottom - ((value - minimum) / (maximum - minimum)) * (bounds.bottom - bounds.top);
  }

  const points = [];
  for (let i = 0; i < ordered.length; i++) {
    const result = ordered[i];
    const value = result.metrics ? result.metrics[metricKey] : undefined;
    const hasValue = Number.isFinite(value);
    points.push({
      result: result,
      index: i,
      time: times[i],
      value: hasValue ? value : null,
      x: xFor(times[i]),
      y: hasValue ? yFor(value) : null,
    });
  }

  const segments = [];
  let segment = [];
  for (const point of points) {
    if (point.value === null) {
      if (segment.length > 0) {
        segments.push(segment);
      }
      segment = [];
    } else {
      segment.push(point);
    }
  }
  if (segment.length > 0) {
    segments.push(segment);
  }

  const ticks = [];
  for (let i = 0; i < 5; i++) {
    const value = (maximum * i) / 4;
    ticks.push({ value: value, y: yFor(value) });
  }

  let baselineY = null;
  if (Number.isFinite(baselineValue)) {
    baselineY = yFor(baselineValue);
  }

  return {
    width: width,
    height: height,
    bounds: bounds,
    points: points,
    segments: segments,
    minimum: minimum,
    maximum: maximum,
    firstTime: firstTime,
    lastTime: lastTime,
    baselineY: baselineY,
    ticks: ticks,
  };
}

export function gameCounts(results, { timeframe = 'all', now = new Date() } = {}) {
  const selected = selectTrendResults(results, { timeframe: timeframe, now: now });
  const range = trendDateRange(timeframe, now);

  if (selected.length === 0 && !range.start) {
    return { unit: 'day', buckets: [] };
  }

  let first;
  let last;
  if (range.start) {
    first = range.start;
    last = new Date(range.end.getFullYear(), range.end.getMonth(), range.end.getDate() - 1);
  } else {
    first = new Date(Date.parse(selected[0].createdAt));
    last = new Date(Date.parse(selected[selected.length - 1].createdAt));
  }
  const start = new Date(first.getFullYear(), first.getMonth(), first.getDate());

  // count calendar days using UTC dates, since a local day isn't always 24 hours (DST)
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
    // monday = 0
    firstWeekOffset = (start.getDay() + 6) % 7;
  }

  const bucketCount = Math.floor((calendarDays + firstWeekOffset - 1) / step) + 1;
  if (bucketCount > MAX_FREQUENCY_BUCKETS) {
    return { unit: unit, buckets: [], message: FREQUENCY_RANGE_MESSAGE };
  }

  start.setDate(start.getDate() - firstWeekOffset);
  const buckets = [];
  const cursor = new Date(start);
  while (cursor <= last) {
    buckets.push({ key: localDayKey(cursor), date: new Date(cursor), count: 0 });
    cursor.setDate(cursor.getDate() + step);
  }

  const byKey = new Map();
  for (const bucket of buckets) {
    byKey.set(bucket.key, bucket);
  }

  for (const result of selected) {
    const date = new Date(result.createdAt);
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
