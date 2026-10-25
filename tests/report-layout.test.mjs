import test from 'node:test';
import assert from 'node:assert/strict';
import { comparisonKey } from '../js/data/profiles.js';
import { metricMetadata } from '../js/export/report.js';
import { buildReportModel } from '../js/export/report-model.js';
import { renderReportDocument } from '../js/export/report-layout.js';

function savedGame(id, { setupHelp = false, accuracy = 75, notes = '' } = {}) {
  const result = {
    id,
    activityId: 'tap',
    protocolVersion: 2,
    metricVersion: 2,
    createdAt: new Date(2026, 9, 20, id === 'first' ? 10 : 11).toISOString(),
    durationMs: 10000,
    status: 'complete',
    isDemo: false,
    context: {
      hand: 'right',
      deviceId: 'mouse',
      pointerType: 'mouse',
      surfaceCssWidth: 480,
      surfaceCssHeight: 480,
      assistedInput: false,
      caregiverProvidedInput: false,
      caregiverSetupHelp: setupHelp,
    },
    config: { pathId: null, targetSizeMode: 'standard' },
    metrics: { accuracyPct: accuracy, tapsPerSecond: 2, rhythmCV: null },
    quality: { issues: [] },
    notes,
  };
  result.comparisonKey = comparisonKey(result.context, result.config, result);
  result.seriesId = 'series-one';
  return result;
}

function reportModel(results, deviceLabel = 'Example device', options = {}) {
  const store = {
    results,
    devices: [{ id: 'mouse', label: deviceLabel }],
    baselineSeries: results.length
      ? [
          {
            id: 'series-one',
            comparisonKey: results[0].comparisonKey,
            baselineResultId: results[0].id,
          },
        ]
      : [],
  };
  return buildReportModel(store, results, {
    metadataFor: metricMetadata,
    rangeLabel: '2026-10-19 to 2026-10-25',
    generatedAt: new Date('2026-10-24T16:00:00Z'),
    ...options,
  });
}

test('report counts setup help across a comparison series and labels each individual game', () => {
  const first = savedGame('first'),
    second = savedGame('second', { setupHelp: true });
  assert.equal(
    first.comparisonKey,
    second.comparisonKey,
    'Setup help does not change the comparison profile',
  );
  const model = reportModel([first, second]);
  assert.equal(model.groups.length, 1);
  const html = renderReportDocument(model);
  assert.match(html, /Help with setup in 1 of 2 games/);
  assert.match(html, /<h4>Game 1[^<]*Setup help: no<\/h4>/);
  assert.match(html, /<h4>Game 2[^<]*Setup help: yes<\/h4>/);
  assert.doesNotMatch(html, /No input or setup help recorded/);
});

test('report distinguishes absent accuracy and baselines without inventing zero-valued results', () => {
  const model = reportModel([
    savedGame('first', { accuracy: null }),
    savedGame('second', { accuracy: null }),
  ]);
  const html = renderReportDocument(model);
  assert.match(html, /<p class="report-metric-value">Not recorded<\/p>/);
  assert.match(html, /Starting point: Not recorded/);
  assert.match(html, /This measurement was not recorded/);
  assert.match(html, /Not enough data to compare/);
  assert.doesNotMatch(html, /NaN|Infinity|undefined/);
});

test('report escapes private labels and notes while notes remain excluded by default', () => {
  const model = reportModel(
    [savedGame('first', { notes: 'Private <img src=x onerror=alert(1)>' })],
    'Mouse <script>alert(2)</script>',
  );
  const defaultHTML = renderReportDocument(model, { title: 'Report <script>alert(3)</script>' });
  assert.doesNotMatch(defaultHTML, /Private|<script>|<img src=x/);
  assert.match(defaultHTML, /Mouse &lt;script&gt;alert\(2\)&lt;\/script&gt;/);
  assert.match(defaultHTML, /Report &lt;script&gt;alert\(3\)&lt;\/script&gt;/);
  const notesHTML = renderReportDocument(model, { includeNotes: true });
  assert.match(notesHTML, /Private &lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(notesHTML, /<img src=x/);
});

test('full details retain measurements outside the charts and are not hidden behind collapsed content', () => {
  const model = reportModel([savedGame('first')]);
  const html = renderReportDocument(model);
  assert.equal(
    model.groups[0].metrics.some((metric) => metric.key === 'rhythmCV'),
    false,
  );
  assert.match(html, /Tap rhythm variation/);
  assert.match(html, /Recorded game time/);
  assert.match(html, /Full measurement details/);
  assert.doesNotMatch(html, /<details|<link[^>]+href=|<script/);
  assert.match(
    html,
    /@bottom-right\s*\{\s*content:\s*['"]Page ['"]\s+counter\(page\)\s+['"] of ['"]\s+counter\(pages\)/,
  );
});

test('an extra selected measurement retains all charts and keeps the game table before them', () => {
  const result = savedGame('first');
  result.metrics.rhythmCV = 0.4;
  const model = reportModel([result], 'Example device', { additionalMetricKeys: ['rhythmCV'] });
  assert.equal(model.groups[0].metrics.length, 3);
  const html = renderReportDocument(model);
  assert.equal((html.match(/class="report-chart" aria-labelledby=/g) ?? []).length, 3);
  assert.ok(html.indexOf('Games in this selection') < html.indexOf('<figure class="report-chart"'));
});
