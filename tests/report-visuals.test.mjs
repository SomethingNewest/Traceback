import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReportModel } from '../js/export/report-model.js';
import { renderReportTrendSVG, renderReportFrequencySVG } from '../js/export/report-charts.js';
import { comparisonKey } from '../js/data/profiles.js';
import { metricMetadata, resultsReportHTML } from '../js/export/report.js';

function result(
  id,
  {
    activityId = 'tap',
    protocolVersion = 2,
    date = new Date(2026, 9, 20, 10),
    hand = 'right',
    accuracyPct = 80,
    measurements = {},
    ...patch
  } = {},
) {
  const entry = {
    id,
    activityId,
    protocolVersion,
    metricVersion: 2,
    createdAt: date.toISOString(),
    durationMs: 10000,
    status: 'complete',
    isDemo: false,
    context: {
      hand,
      deviceId: 'device',
      pointerType: 'mouse',
      surfaceCssWidth: 480,
      surfaceCssHeight: 480,
      assistedInput: false,
      caregiverProvidedInput: false,
      caregiverSetupHelp: false,
    },
    config: { pathId: null, targetSizeMode: 'standard' },
    metrics: { accuracyPct, ...measurements },
    notes: '',
    ...patch,
  };
  entry.comparisonKey = comparisonKey(entry.context, entry.config, entry);
  entry.seriesId = `series:${entry.comparisonKey}`;
  return entry;
}
function store(results) {
  const baselineSeries = [];
  for (const entry of results)
    if (!baselineSeries.some((series) => series.id === entry.seriesId))
      baselineSeries.push({
        id: entry.seriesId,
        comparisonKey: entry.comparisonKey,
        baselineResultId: entry.id,
      });
  return { results, baselineSeries, devices: [{ id: 'device', label: 'My device' }] };
}

test('print model isolates exact setup and protocol identities without averaging game accuracy', () => {
  const results = [
    result('right'),
    result('left', { hand: 'left' }),
    result('old', { protocolVersion: 1 }),
    result('aim', { activityId: 'aim', protocolVersion: 3, measurements: { scorePoints: 400 } }),
  ];
  const model = buildReportModel(store(results), results);
  assert.equal(model.groups.length, 4);
  assert.equal(model.summary.completedGames, 4);
  assert.equal(model.summary.distinctGames, 2);
  assert.equal(model.summary.activeDays, 1);
  assert.equal(model.summary.seriesCount, 4);
  assert.ok(!Object.keys(model.summary).some((key) => /accuracy|average|score/i.test(key)));
  for (const group of model.groups)
    assert.ok(group.results.every((entry) => entry.comparisonKey === group.comparisonKey));
});

test('an original starting point outside the selected week stays the comparison and dashed chart line', () => {
  const first = result('baseline', {
    date: new Date(2026, 8, 1, 10),
    accuracyPct: 40,
    measurements: { tapsPerSecond: 0 },
  });
  const second = result('selected', { accuracyPct: 70, measurements: { tapsPerSecond: 2 } });
  const model = buildReportModel(store([first, second]), [second]);
  const group = model.groups[0];
  assert.equal(group.baseline.id, 'baseline');
  assert.equal(group.results.length, 1);
  assert.equal(group.metrics[0].baselineValue, 40);
  assert.equal(group.metrics[0].change.absoluteChange, 30);
  assert.equal(group.metrics[0].change.changeUnit, 'percentage points');
  assert.equal(group.metrics[1].baselineValue, 0);
  assert.equal(group.metrics[1].change.absoluteChange, 2);
  assert.equal(group.metrics[1].change.percentChange, null);
  const chart = renderReportTrendSVG(group, 'accuracyPct');
  assert.match(chart, /stroke-dasharray="6 4"/);
  assert.match(chart, /Starting point: 40%/);
  assert.match(chart, /1 recorded measurement in 1 saved game/);
  assert.doesNotMatch(chart, /<polyline/);
});

test('nulls and zeroes remain distinct at the endpoints, in chart gaps and signed absolute changes', () => {
  const results = [
    result('first', { accuracyPct: 0, date: new Date(2026, 9, 20, 10) }),
    result('missing', { accuracyPct: null, date: new Date(2026, 9, 20, 11) }),
    result('latest', { accuracyPct: 25, date: new Date(2026, 9, 20, 12) }),
  ];
  const model = buildReportModel(store(results), results);
  const metric = model.groups[0].metrics[0];
  assert.equal(metric.firstValue, 0);
  assert.equal(metric.baselineValue, 0);
  assert.equal(metric.latestValue, 25);
  assert.equal(metric.availableCount, 2);
  assert.equal(metric.changeLabel, '+25 percentage points');
  const chart = renderReportTrendSVG(model.groups[0], 'accuracyPct');
  assert.match(chart, /Starting point: 0%/);
  assert.doesNotMatch(chart, /<polyline/);
  assert.doesNotMatch(chart, /NaN|Infinity/);
  const endingNull = buildReportModel(store(results), results.slice(0, 2)).groups[0].metrics[0];
  assert.equal(endingNull.latestValue, null);
  assert.equal(endingNull.change.absoluteChange, null);
  assert.equal(endingNull.latestValueLabel, 'Not recorded');
});

test('an empty selection contains counts but no invented scores, setups or history', () => {
  const model = buildReportModel(store([]), [], {
    rangeStart: new Date(2026, 9, 19),
    rangeEnd: new Date(2026, 9, 26),
  });
  assert.equal(model.groups.length, 0);
  assert.equal(model.summary.completedGames, 0);
  assert.equal(model.frequency.buckets.length, 7);
  assert.ok(model.frequency.buckets.every((bucket) => bucket.count === 0));
  assert.doesNotMatch(renderReportFrequencySVG(model), /NaN|Infinity/);
});

test('calendar-frequency counts cover all seven days including days without games', () => {
  const results = [
    result('mon', { date: new Date(2026, 9, 19, 23, 30) }),
    result('sun', { date: new Date(2026, 9, 25, 23, 30) }),
  ];
  const model = buildReportModel(store(results), results, {
    rangeStart: '2026-10-19',
    rangeEnd: '2026-10-26',
  });
  assert.deepEqual(
    model.frequency.buckets.map((bucket) => bucket.count),
    [1, 0, 0, 0, 0, 0, 1],
  );
  assert.deepEqual(
    model.frequency.buckets.map((bucket) => bucket.key),
    [
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ],
  );
  assert.match(renderReportFrequencySVG(model), /2 completed games/);
});

test('all seven games are retained, with accuracy, available primary and explicitly selected measurements', () => {
  const ids = ['trace', 'tap', 'aim', 'hold', 'sequence', 'memory', 'choice'];
  const metrics = [
    { meanDistancePctWidth: 0.02, coveragePct: 20 },
    { tapsPerSecond: 3 },
    { scorePoints: 500 },
    { observedDriftPctWidth: 0.1 },
    {},
    {},
    { scorePoints: 600 },
  ];
  const versions = [4, 2, 3, 2, 1, 1, 1];
  const results = ids.map((activityId, index) =>
    result(activityId, {
      activityId,
      protocolVersion: versions[index],
      measurements: metrics[index],
    }),
  );
  const model = buildReportModel(store(results), results, {
    additionalMetricKeys: ['coveragePct', 'accuracyPct'],
  });
  assert.equal(model.groups.length, 7);
  for (const group of model.groups) {
    assert.equal(group.metrics[0].key, 'accuracyPct');
    assert.equal(group.metrics.length, new Set(group.metrics.map((metric) => metric.key)).size);
    assert.ok(group.allMetrics.some((metric) => metric.key === 'accuracyPct'));
  }
  assert.deepEqual(
    model.groups.find((group) => group.activityId === 'trace').metrics.map((metric) => metric.key),
    ['accuracyPct', 'meanDistancePctWidth', 'coveragePct'],
  );
  assert.deepEqual(
    model.groups
      .find((group) => group.activityId === 'sequence')
      .metrics.map((metric) => metric.key),
    ['accuracyPct'],
  );
});

test('charts use the same actual timestamp positions for every metric, including missing observations', () => {
  const results = [
    result('first', { date: new Date(2026, 9, 20, 10), measurements: { tapsPerSecond: 1 } }),
    result('middle', {
      date: new Date(2026, 9, 20, 10, 15),
      measurements: { tapsPerSecond: null },
    }),
    result('last', { date: new Date(2026, 9, 20, 11), measurements: { tapsPerSecond: 4 } }),
  ];
  const group = buildReportModel(store(results), results).groups[0];
  const circles = (chart) =>
    [...chart.matchAll(/<circle cx="([^"]+)" cy="[^"]+" r="4"/g)].map((match) => Number(match[1]));
  const accuracy = circles(renderReportTrendSVG(group, 'accuracyPct'));
  const rate = circles(renderReportTrendSVG(group, 'tapsPerSecond'));
  assert.deepEqual(accuracy, [72, 209, 620]);
  assert.deepEqual(rate, [72, 620]);
});

test('SVG is self-contained, escapes labels, and supports compact portrait chart heights', () => {
  const entry = result('one');
  const group = buildReportModel(store([entry]), [entry], {
    metadataFor: (key) => ({ key, label: '<script>bad</script>', unit: '%', description: '<bad>' }),
  }).groups[0];
  group.activityName = '<img onerror="bad">';
  const chart = renderReportTrendSVG(group, 'accuracyPct', { height: 220 });
  assert.match(chart, /viewBox="0 0 650 220"/);
  assert.match(chart, /&lt;script&gt;bad&lt;\/script&gt;/);
  assert.match(chart, /&lt;img onerror=&quot;bad&quot;&gt;/);
  assert.doesNotMatch(chart, /<script|<img|<foreignObject|href=|<style|<link|onclick=/i);
  assert.match(chart, /role="img"/);
  assert.match(chart, /<title id=/);
  assert.match(chart, /<desc id=/);
  assert.throws(() => renderReportTrendSVG(group, 'accuracyPct', { height: 100 }), /chart height/);
});

test('every selected saved result remains available for a detailed report without mutating the store', () => {
  const results = Array.from({ length: 120 }, (_, index) =>
    result(`entry-${index}`, {
      date: new Date(2026, 0, index + 1),
      measurements: { tapsPerSecond: index % 4 },
    }),
  );
  const value = store(results),
    before = JSON.stringify(value);
  const model = buildReportModel(value, results);
  assert.equal(model.results.length, 120);
  assert.equal(model.groups[0].results.length, 120);
  assert.equal(
    model.frequency.buckets.reduce((sum, bucket) => sum + bucket.count, 0),
    120,
  );
  assert.equal(JSON.stringify(value), before);
  assert.ok(!/<script|NaN|Infinity/.test(renderReportTrendSVG(model.groups[0], 'tapsPerSecond')));
});

test('cross-year graph axes show years so repeated calendar dates remain distinguishable', () => {
  const results = [
    result('old', { date: new Date(2025, 0, 2, 10) }),
    result('new', { date: new Date(2026, 0, 2, 10) }),
  ];
  const model = buildReportModel(store(results), results);
  const xLabels = renderReportTrendSVG(model.groups[0], 'accuracyPct')
    .match(/<text[^>]+y="196"[^>]*>[^<]+<\/text>/g)
    .join(' ');
  assert.match(xLabels, /2025/);
  assert.match(xLabels, /2026/);
  const frequencyLabels = renderReportFrequencySVG(model)
    .match(/<text[^>]+y="151"[^>]*>[^<]+<\/text>/g)
    .join(' ');
  // Frequency weeks use their Monday date, including partial weeks at the edges.
  assert.match(frequencyLabels, /2024/);
  assert.match(frequencyLabels, /2025/);
});

test('a mismatched profile cannot supply another setup starting point', () => {
  const first = result('right-baseline', { accuracyPct: 100 });
  const left = result('left', { hand: 'left', accuracyPct: 10 });
  const value = store([first, left]);
  value.baselineSeries.find((series) => series.id === left.seriesId).baselineResultId = first.id;
  const model = buildReportModel(value, [left]);
  assert.equal(model.groups[0].baseline, null);
  assert.equal(model.groups[0].metrics[0].change.absoluteChange, null);
  assert.doesNotMatch(renderReportTrendSVG(model.groups[0], 'accuracyPct'), /Starting point: 100%/);
});

test('integrated Results export honors game, setup, time range and requested measurement', () => {
  const results = [
    result('before-range', {
      date: new Date(2026, 8, 1),
      activityId: 'trace',
      protocolVersion: 4,
      accuracyPct: 0,
      measurements: { coveragePct: 10 },
    }),
    result('selected', {
      date: new Date(2026, 9, 23),
      activityId: 'trace',
      protocolVersion: 4,
      accuracyPct: 50,
      measurements: { coveragePct: 20 },
    }),
    result('other-hand', {
      date: new Date(2026, 9, 23),
      activityId: 'trace',
      protocolVersion: 4,
      hand: 'left',
      accuracyPct: 90,
      measurements: { coveragePct: 80 },
    }),
    result('other-game', { date: new Date(2026, 9, 23) }),
  ];
  const html = resultsReportHTML(store(results), {
    activityId: 'trace',
    comparisonKey: results[0].comparisonKey,
    timeframe: '7',
    metricKey: 'coveragePct',
    generatedAt: new Date(2026, 9, 24, 12),
  });
  assert.match(html, /Spiral covered over time/);
  assert.match(html, /Starting point: 0%/);
  assert.match(html, /Starting point: 10%/);
  assert.match(html, /1 saved game/);
  assert.doesNotMatch(html, /Target Tap|left hand|80%|90%/);
  const first = result('legacy', { protocolVersion: 1 });
  const legacy = buildReportModel(store([first]), [first], { metadataFor: metricMetadata });
  assert.match(legacy.groups[0].metrics[0].description, /stationary circle/);
  assert.doesNotMatch(legacy.groups[0].metrics[0].description, /moving/);
});

test('compact Letter charts retain valid plot, axis and legend positions', () => {
  const results = [result('one'), result('two', { date: new Date(2026, 9, 21), accuracyPct: 90 })];
  const model = buildReportModel(store(results), results);
  const trend = renderReportTrendSVG(model.groups[0], 'accuracyPct', { height: 180 });
  assert.match(trend, /viewBox="0 0 650 180"/);
  assert.match(trend, /y="136"[^>]*>Oct/);
  assert.match(trend, /y="165"[^>]*>Saved game/);
  assert.doesNotMatch(trend, /NaN|Infinity|height="-/);
  const frequency = renderReportFrequencySVG(model, { height: 190 });
  assert.match(frequency, /viewBox="0 0 650 190"/);
  assert.match(frequency, /y="151"/);
  assert.match(frequency, /y="179"/);
  assert.doesNotMatch(frequency, /NaN|Infinity|height="-/);
  assert.throws(() => renderReportFrequencySVG(model, { height: 160 }), /chart height/);
});
