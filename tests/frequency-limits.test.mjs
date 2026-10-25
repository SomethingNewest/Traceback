import test from 'node:test';
import assert from 'node:assert/strict';
import { gameCounts, MAX_FREQUENCY_BUCKETS, FREQUENCY_RANGE_MESSAGE } from '../js/data/trends.js';
import { createEmptyStore } from '../js/data/schema.js';
import { appendCompletedResult } from '../js/data/baselines.js';
import { buildReportModel } from '../js/export/report-model.js';
import { renderReportDocument } from '../js/export/report-layout.js';
import { renderReportFrequencySVG } from '../js/export/report-charts.js';
import { renderFrequencyChart } from '../js/ui/charts.js';

function storeWithDates(dates) {
  let store = createEmptyStore();
  store.devices.push({ id: 'mouse', label: 'Example mouse' });
  for (const [index, date] of dates.entries()) {
    store = appendCompletedResult(
      store,
      {
        id: `result-${index}`,
        activityId: 'tap',
        protocolVersion: 2,
        metricVersion: 2,
        createdAt: new Date(date).toISOString(),
        durationMs: 10000,
        status: 'complete',
        isDemo: false,
        context: {
          hand: 'right',
          deviceId: 'mouse',
          pointerType: 'mouse',
          surfaceCssWidth: 480,
          surfaceCssHeight: 480,
          viewportWidth: 1280,
          viewportHeight: 800,
          dpr: 1,
          assistedInput: false,
          caregiverProvidedInput: false,
          caregiverSetupHelp: false,
          fatigue: null,
        },
        config: { pathId: null, targetSizeMode: 'standard' },
        metrics: { accuracyPct: 80, tapsPerSecond: 2 },
        quality: { issues: [] },
        notes: '',
      },
      { createId: () => 'series' },
    );
  }
  return store;
}

const extremeDates = ['0100-01-01T12:00:00.000Z', '9999-12-31T12:00:00.000Z'];

test('extreme valid saved dates cannot allocate an unbounded frequency graph', () => {
  const store = storeWithDates(extremeDates);
  const before = structuredClone(store);
  const frequency = gameCounts(store.results);
  assert.equal(frequency.unit, 'week');
  assert.deepEqual(frequency.buckets, []);
  assert.equal(frequency.message, FREQUENCY_RANGE_MESSAGE);
  assert.deepEqual(store, before);

  const model = buildReportModel(store, store.results);
  assert.equal(model.frequency.message, FREQUENCY_RANGE_MESSAGE);
  assert.equal(model.results.length, 2);
  assert.equal(model.summary.completedGames, 2);
  assert.equal(model.groups[0].results.length, 2);
  const html = renderReportDocument(model);
  assert.match(html, /Completed games:<\/strong> 2/);
  assert.match(html, /Game 1/);
  assert.match(html, /Game 2/);
  assert.match(html, /These dates are too far apart to show a graph/);
  assert.doesNotMatch(html, /0 completed games|No saved games in this selection/);
});

test('explicit report date ranges use the same limit before creating buckets', () => {
  const store = storeWithDates([new Date(2026, 9, 20, 12)]);
  const range = { rangeStart: new Date(extremeDates[0]), rangeEnd: new Date(extremeDates[1]) };
  const model = buildReportModel(store, store.results, range);
  assert.deepEqual(model.frequency.buckets, []);
  assert.equal(model.frequency.message, FREQUENCY_RANGE_MESSAGE);
  assert.equal(model.results.length, 1);
  assert.equal(model.summary.completedGames, 1);

  const empty = buildReportModel(createEmptyStore(), [], range);
  assert.equal(empty.frequency.message, FREQUENCY_RANGE_MESSAGE);
  assert.deepEqual(empty.frequency.buckets, []);
});

test('a full allowed span is counted and the next bucket is rejected', () => {
  const first = new Date(2020, 0, 6, 12); // Monday in the local calendar.
  const last = new Date(first);
  last.setDate(last.getDate() + MAX_FREQUENCY_BUCKETS * 7 - 1);
  const store = storeWithDates([first, last]);
  const frequency = gameCounts(store.results);
  assert.equal(frequency.buckets.length, MAX_FREQUENCY_BUCKETS);
  assert.equal(frequency.message, undefined);
  assert.equal(frequency.buckets[0].count, 1);
  assert.equal(frequency.buckets.at(-1).count, 1);

  const end = new Date(last);
  end.setDate(end.getDate() + 1);
  end.setHours(0, 0, 0, 0);
  const model = buildReportModel(store, store.results, { rangeStart: first, rangeEnd: end });
  assert.equal(model.frequency.buckets.length, MAX_FREQUENCY_BUCKETS);
  end.setDate(end.getDate() + 1);
  assert.equal(
    buildReportModel(store, store.results, { rangeStart: first, rangeEnd: end }).frequency.message,
    FREQUENCY_RANGE_MESSAGE,
  );

  last.setDate(last.getDate() + 1);
  assert.equal(gameCounts(storeWithDates([first, last]).results).message, FREQUENCY_RANGE_MESSAGE);
});

test('normal daily and weekly ranges keep all counts, including empty days', () => {
  const now = new Date(2026, 9, 25, 12);
  const store = storeWithDates([new Date(2026, 9, 19, 12), new Date(2026, 9, 25, 12)]);
  const frequency = gameCounts(store.results, { timeframe: '7', now });
  assert.equal(frequency.unit, 'day');
  assert.equal(frequency.message, undefined);
  assert.deepEqual(
    frequency.buckets.map((bucket) => bucket.count),
    [1, 0, 0, 0, 0, 0, 1],
  );
  const model = buildReportModel(store, store.results, {
    rangeStart: new Date(2026, 9, 19),
    rangeEnd: new Date(2026, 9, 26),
  });
  assert.deepEqual(model.frequency, frequency);

  const weekly = gameCounts(
    storeWithDates([new Date(2026, 8, 1, 12), new Date(2026, 9, 25, 12)]).results,
  );
  assert.equal(weekly.unit, 'week');
  assert.equal(weekly.message, undefined);
  assert.ok(weekly.buckets.every((bucket) => bucket.date.getDay() === 1));
  assert.equal(
    weekly.buckets.reduce((sum, bucket) => sum + bucket.count, 0),
    2,
  );
});

test('static reports distinguish empty results from an unavailable frequency graph', () => {
  const empty = gameCounts([]);
  assert.deepEqual(empty.buckets, []);
  assert.equal(empty.message, undefined);
  const emptySVG = renderReportFrequencySVG({ frequency: empty, rangeLabel: 'Empty' });
  assert.match(emptySVG, /No saved games in this selection/);
  assert.doesNotMatch(emptySVG, /dates are too far apart/);

  const frequency = gameCounts(storeWithDates(extremeDates).results);
  const svg = renderReportFrequencySVG({ frequency, rangeLabel: 'Extreme' });
  assert.ok(svg.includes(FREQUENCY_RANGE_MESSAGE));
  assert.match(svg, /<tspan[^>]*>These dates are too far apart to show a graph\.<\/tspan>/);
  assert.doesNotMatch(svg, /No saved games|0 completed games|NaN|Infinity/);
});

function withMinimalDOM(action) {
  const previous = globalThis.document;
  const element = (tagName) => ({
    tagName,
    children: [],
    style: {},
    textContent: '',
    append(...items) {
      this.children.push(...items);
    },
    replaceChildren(...items) {
      this.children = items;
    },
    setAttribute() {},
  });
  globalThis.document = { createElement: element };
  try {
    action(element('section'));
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
}

test('dashboard explains excessive dates without saying saved games are missing', () => {
  withMinimalDOM((container) => {
    renderFrequencyChart(container, { results: storeWithDates(extremeDates).results });
    assert.equal(container.children.length, 1);
    assert.equal(container.children[0].textContent, FREQUENCY_RANGE_MESSAGE);
    assert.equal(container.children[0].tagName, 'p');

    renderFrequencyChart(container, { results: [] });
    assert.equal(container.children[0].textContent, 'No saved games in this time range.');

    renderFrequencyChart(container, {
      results: storeWithDates([new Date(2026, 9, 24, 12)]).results,
    });
    const bars = container.children.find((child) => child.tagName === 'ol');
    assert.equal(bars.children.length, 1);
    assert.equal(bars.children[0].children[0].textContent, '1');
  });
});
