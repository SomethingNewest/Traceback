import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  comparisonGroups,
  gameCounts,
  metricChange,
  selectTrendResults,
  trendDateRange,
  trendGeometry,
} from '../js/data/trends.js';

function result(
  id,
  {
    day = 24,
    hour = 12,
    month = 9,
    activityId = 'tap',
    comparisonKey = 'tap-mouse-v2',
    accuracyPct = 80,
    ...rest
  } = {},
) {
  return {
    id,
    activityId,
    comparisonKey,
    createdAt: new Date(2026, month, day, hour).toISOString(),
    status: 'complete',
    isDemo: false,
    metrics: { accuracyPct },
    ...rest,
  };
}

test('trends include only personal completed results for the chosen game and exact comparison profile', () => {
  const entries = [
    result('valid'),
    result('other-hand', { comparisonKey: 'tap-left-v2' }),
    result('old-version', { comparisonKey: 'tap-mouse-v1' }),
    result('other-game', { activityId: 'trace' }),
    result('demo', { isDemo: true }),
    result('practice', { isPractice: true }),
    result('stopped', { status: 'stopped' }),
  ];
  const selected = selectTrendResults(entries, {
    activityId: 'tap',
    comparisonKey: 'tap-mouse-v2',
  });
  assert.deepEqual(
    selected.map((entry) => entry.id),
    ['valid'],
  );
  assert.equal(entries.length, 7, 'selection does not mutate saved history');
});

test('setup options keep versions separate, sort games by actual date and offer the most recent setup first', () => {
  const groups = comparisonGroups(
    [
      result('second', { day: 22 }),
      result('new-version', { comparisonKey: 'tap-mouse-v3' }),
      result('first', { day: 20 }),
      result('unrelated', { activityId: 'trace' }),
    ],
    'tap',
  );
  assert.deepEqual(
    groups.map((group) => group.comparisonKey),
    ['tap-mouse-v3', 'tap-mouse-v2'],
  );
  assert.deepEqual(
    groups[1].results.map((entry) => entry.id),
    ['first', 'second'],
  );
});

test('last 7 days includes today and six prior local calendar days, but excludes a future day', () => {
  const now = new Date(2026, 9, 24, 15);
  const range = trendDateRange('7', now);
  assert.equal(range.start.getDate(), 18);
  assert.equal(range.start.getHours(), 0);
  assert.equal(range.end.getDate(), 25);
  assert.equal(range.end.getHours(), 0);
  const selected = selectTrendResults(
    [
      result('too-old', { day: 17, hour: 23 }),
      result('first', { day: 18, hour: 0 }),
      result('last', { day: 24, hour: 23 }),
      result('future', { day: 25, hour: 0 }),
    ],
    { timeframe: '7', now },
  );
  assert.deepEqual(
    selected.map((entry) => entry.id),
    ['first', 'last'],
  );
  assert.throws(() => trendDateRange('bogus', now), /range/);
});

test('calendar ranges survive daylight saving time changes instead of assuming 168 hours', () => {
  const source = `const { trendDateRange, gameCounts } = await import(new URL('./js/data/trends.js', 'file://' + process.cwd().replaceAll('\\\\', '/') + '/'));
    const range = trendDateRange('7', new Date(2026, 10, 3, 12));
    const counts = gameCounts([], { timeframe: '7', now: new Date(2026, 10, 3, 12) });
    console.log(JSON.stringify({ hours: (range.end - range.start) / 3600000, days: counts.buckets.map(bucket => bucket.key) }));`;
  const data = JSON.parse(
    execFileSync(process.execPath, ['--input-type=module', '-e', source], {
      cwd: new URL('../', import.meta.url),
      env: { ...process.env, TZ: 'America/Chicago' },
      encoding: 'utf8',
    }),
  );
  assert.equal(data.hours, 169);
  assert.equal(data.days.length, 7);
  assert.equal(data.days[0], '2026-10-28');
  assert.equal(data.days.at(-1), '2026-11-03');
});

test('zero baselines have a valid absolute difference; absent values do not produce a comparison', () => {
  assert.deepEqual(metricChange(25, 0, '%'), { difference: 25, unit: 'percentage points' });
  assert.deepEqual(metricChange(0, 0, 'points'), { difference: 0, unit: 'points' });
  assert.equal(metricChange(null, 80, '%'), null);
  assert.equal(metricChange(80, undefined, '%'), null);
});

test('chart uses real elapsed time, with a missing measurement splitting the line', () => {
  const entries = [
    result('last', { day: 24, accuracyPct: 95 }),
    result('first', { day: 20, accuracyPct: 70 }),
    result('missing', { day: 21, accuracyPct: null }),
    result('third', { day: 22, accuracyPct: 85 }),
  ];
  const chart = trendGeometry(entries, 'accuracyPct', { percent: true, baselineValue: 70 });
  assert.deepEqual(
    chart.points.map((point) => point.result.id),
    ['first', 'missing', 'third', 'last'],
  );
  const [first, missing, third, last] = chart.points;
  assert.equal(first.x, chart.bounds.left);
  assert.equal(last.x, chart.bounds.right);
  assert.equal((missing.x - first.x) / (last.x - first.x), 0.25);
  assert.equal((third.x - first.x) / (last.x - first.x), 0.5);
  assert.equal(missing.y, null);
  assert.deepEqual(
    chart.segments.map((segment) => segment.map((point) => point.result.id)),
    [['first'], ['third', 'last']],
  );
  assert.equal(chart.maximum, 100);
  assert.equal(chart.minimum, 0);
  assert.ok(chart.baselineY > last.y, 'a higher accuracy sits higher on the chart');
});

test('one point and identical timestamps remain centered and finite', () => {
  for (const entries of [[result('only')], [result('one'), result('two', { accuracyPct: 60 })]]) {
    const chart = trendGeometry(entries, 'accuracyPct', { percent: true });
    for (const point of chart.points) {
      assert.equal(point.x, (chart.bounds.left + chart.bounds.right) / 2);
      assert.ok(Number.isFinite(point.y));
    }
  }
});

test('non-percentage scale includes a recorded baseline and does not turn null into zero', () => {
  const entries = [
    result('missing', { metrics: { scorePoints: null } }),
    result('zero', { day: 25, metrics: { scorePoints: 0 } }),
  ];
  const chart = trendGeometry(entries, 'scorePoints', { baselineValue: 500 });
  assert.ok(chart.maximum > 500);
  assert.ok(Number.isFinite(chart.baselineY));
  assert.equal(chart.points[0].value, null);
  assert.equal(chart.points[0].y, null);
  assert.equal(chart.points[1].value, 0);
  assert.equal(chart.points[1].y, chart.bounds.bottom);
  const absent = trendGeometry(entries, 'notRecorded');
  assert.equal(absent.segments.length, 0);
  assert.equal(absent.baselineY, null);
  assert.equal(absent.maximum, 1);
});

test('daily counts count games across setups without averaging accuracy, preserving empty days', () => {
  const now = new Date(2026, 9, 24, 15);
  const counts = gameCounts(
    [
      result('a', { day: 24, accuracyPct: 0 }),
      result('b', { day: 24, accuracyPct: 100, comparisonKey: 'other-setup' }),
      result('c', { day: 18 }),
      result('outside', { day: 17 }),
      result('demo', { day: 24, isDemo: true }),
    ],
    { timeframe: '7', now },
  );
  assert.equal(counts.unit, 'day');
  assert.equal(counts.buckets.length, 7);
  assert.deepEqual(
    counts.buckets.map((bucket) => bucket.count),
    [1, 0, 0, 0, 0, 0, 2],
  );
  assert.equal(
    counts.buckets.reduce((sum, bucket) => sum + bucket.count, 0),
    3,
  );
});

test('long histories use Monday weekly counts with real zero gaps', () => {
  const counts = gameCounts([result('first', { month: 8, day: 1 }), result('last', { day: 24 })]);
  assert.equal(counts.unit, 'week');
  assert.ok(counts.buckets.length > 6);
  assert.ok(counts.buckets.every((bucket) => bucket.date.getDay() === 1));
  assert.equal(
    counts.buckets.reduce((sum, bucket) => sum + bucket.count, 0),
    2,
  );
  assert.ok(counts.buckets.some((bucket) => bucket.count === 0));
});

test('empty history has no invented measurements or all-time frequency dates', () => {
  assert.deepEqual(comparisonGroups([], 'tap'), []);
  assert.deepEqual(gameCounts([]), { unit: 'day', buckets: [] });
  const chart = trendGeometry([], 'accuracyPct', { percent: true });
  assert.equal(chart.points.length, 0);
  assert.equal(chart.segments.length, 0);
  assert.equal(chart.baselineY, null);
});
