import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyStore } from '../js/data/schema.js';
import { appendCompletedResult } from '../js/data/baselines.js';
import { csvCell, exportCSV, CSV_HEADERS } from '../js/export/csv.js';
import {
  localDate,
  parseLocalDate,
  weekRange,
  selectReportResults,
  printableReportHTML,
  describeChange,
  reportRows,
  metricMetadata,
} from '../js/export/report.js';
import { buildReportModel } from '../js/export/report-model.js';

function fixture() {
  let store = createEmptyStore();
  store.devices.push({ id: 'mouse-1', label: '=HYPERLINK("bad")' });
  for (const [id, day, accuracy] of [
    ['old', 5, 0],
    ['this-week', 13, 90],
    ['next-week', 19, 80],
  ]) {
    const createdAt = new Date(2026, 9, day, 12).toISOString();
    store = appendCompletedResult(
      store,
      {
        id,
        activityId: 'tap',
        protocolVersion: 1,
        metricVersion: 2,
        createdAt,
        durationMs: 10000,
        status: 'complete',
        context: {
          hand: 'right',
          deviceId: 'mouse-1',
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
        metrics: { accuracyPct: accuracy, tapsPerSecond: 2, rhythmCV: null },
        quality: { issues: [] },
        notes: 'Private note <script>alert(1)</script>',
        isDemo: false,
      },
      { createId: () => 'series-1' },
    );
  }
  return store;
}

test('weekly filtering uses local Monday midnight through next Monday exclusively', () => {
  const range = weekRange('2026-10-14');
  assert.equal(range.startDate, '2026-10-12');
  assert.equal(range.endDate, '2026-10-18');
  assert.equal(range.start.getHours(), 0);
  const store = fixture();
  const selected = selectReportResults(store, { weekStart: '2026-10-14' });
  assert.deepEqual(
    selected.results.map((result) => result.id),
    ['this-week'],
  );
  const monday = structuredClone(store.results[1]);
  monday.id = 'monday';
  monday.createdAt = range.start.toISOString();
  const sunday = structuredClone(monday);
  sunday.id = 'sunday';
  sunday.createdAt = new Date(range.end.getTime() - 1).toISOString();
  const nextMonday = structuredClone(monday);
  nextMonday.id = 'next-monday';
  nextMonday.createdAt = range.end.toISOString();
  store.results = [monday, sunday, nextMonday];
  assert.deepEqual(
    selectReportResults(store, { weekStart: '2026-10-12' }).results.map((result) => result.id),
    ['monday', 'sunday'],
  );
});

test('local dates reject invalid calendar days and handle year boundaries', () => {
  assert.throws(() => parseLocalDate('2026-02-31'), /valid week/);
  assert.throws(() => parseLocalDate('10/10/2026'), /valid week/);
  assert.equal(weekRange('2027-01-01').startDate, '2026-12-28');
  assert.equal(localDate(parseLocalDate('2026-03-08')), '2026-03-08');
});

test('DST transitions retain midnight calendar boundaries', () => {
  const previousTZ = process.env.TZ;
  try {
    process.env.TZ = 'America/Chicago';
    const spring = weekRange('2026-03-08');
    assert.equal(spring.startDate, '2026-03-02');
    assert.equal(spring.endDate, '2026-03-08');
    assert.equal(spring.end.getHours(), 0);
    assert.equal(spring.end.getDate(), 9);
    // Platforms that implement runtime TZ changes expose the 167-hour spring week.
    if (spring.start.getTimezoneOffset() !== spring.end.getTimezoneOffset())
      assert.equal((spring.end - spring.start) / 3600000, 167);
  } finally {
    if (previousTZ === undefined) delete process.env.TZ;
    else process.env.TZ = previousTZ;
  }
});

test('CSV defends formula text while preserving numeric negatives and null blanks', () => {
  for (const value of ['=1+1', '+cmd', '-cmd', '@cmd', '\ttext', '\ntext', '  =cmd'])
    assert.ok(csvCell(value).startsWith('"\''));
  assert.equal(csvCell(-2), '-2');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell('a,"b"\nc'), '"a,""b""\nc"');
  assert.throws(() => csvCell(Infinity), /nonfinite/);
});

test('weekly CSV retains earlier baseline, explicit units and blank insufficient values', () => {
  const store = fixture();
  const selected = selectReportResults(store, { weekStart: '2026-10-12' }).results;
  const csv = exportCSV(store, selected);
  assert.equal(csv.split('\r\n')[0], CSV_HEADERS.join(','));
  assert.ok(csv.includes('"old"'));
  assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'));
  assert.ok(csv.includes('"rhythmCV",,"CV"'));
  assert.ok(csv.includes('"percentage points"'));
  assert.ok(!csv.includes('Private note'));
  assert.ok(exportCSV(store, selected, { includeNotes: true }).includes('Private note'));
});

test('downloaded report contains selected week only, escapes data, omits notes by default', () => {
  const store = fixture();
  const html = printableReportHTML(store, {
    weekStart: '2026-10-12',
    generatedAt: new Date('2026-10-24T12:00:00Z'),
  });
  assert.ok(html.includes('2026-10-12 to 2026-10-18'));
  assert.ok(html.includes('Completed games:</strong> 1'));
  assert.ok(html.includes('They are not a medical test'));
  assert.ok(html.includes('Starting points may be from an earlier week'));
  assert.ok(!html.includes('Private note'));
  const notes = printableReportHTML(store, { weekStart: '2026-10-12', includeNotes: true });
  assert.ok(notes.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!notes.includes('<script>alert(1)</script>'));
});

test('accuracy differences use percentage points and never imply recovery', () => {
  const store = fixture();
  assert.equal(
    describeChange(store.results[0], store.results[0], 'accuracyPct', '%'),
    'Starting point',
  );
  assert.equal(
    describeChange(store.results[1], store.results[0], 'accuracyPct', '%'),
    '90 percentage points higher',
  );
});

test('new games and Drag & Place points are included in the weekly CSV and printable report', () => {
  let store = fixture();
  const seed = store.results.find((result) => result.id === 'this-week');
  const gameMetrics = {
    sequence: { accuracyPct: 75, hitCount: 6, missCount: 2, completionSeconds: 18 },
    memory: { accuracyPct: 60, matchedPairs: 3, pairAttempts: 5, completionSeconds: 25 },
    choice: { accuracyPct: 80, hitCount: 8, missCount: 2, scorePoints: 800, completionSeconds: 22 },
    aim: { accuracyPct: 75, hitCount: 9, missCount: 3, scorePoints: 825 },
  };
  for (const [activityId, metrics] of Object.entries(gameMetrics)) {
    const { seriesId, comparisonKey, ...entry } = seed;
    store = appendCompletedResult(
      store,
      {
        ...entry,
        id: `new-${activityId}`,
        activityId,
        protocolVersion: activityId === 'aim' ? 3 : 1,
        metrics,
      },
      { createId: () => `series-${activityId}` },
    );
  }
  const selection = selectReportResults(store, { weekStart: '2026-10-12' });
  const csv = exportCSV(store, selection.results);
  const html = printableReportHTML(store, { weekStart: '2026-10-12' });
  for (const activityId of Object.keys(gameMetrics)) {
    assert.ok(csv.includes(`"new-${activityId}","${activityId}"`));
    assert.equal(
      selectReportResults(store, { weekStart: '2026-10-12', activityId }).results.length,
      1,
    );
  }
  assert.ok(csv.includes('"scorePoints",825,"points"'));
  assert.ok(csv.includes('"scorePoints",800,"points"'));
  assert.ok(csv.includes('"matchedPairs",3,"pairs"'));
  assert.ok(csv.includes('"pairAttempts",5,"attempts"'));
  for (const name of ['Number Trail', 'Match Pairs', 'Shape Pick', 'Drag &amp; Place'])
    assert.ok(html.includes(name));
  assert.ok(html.includes('825 points'));
  assert.ok(html.includes('Game version 3'));
  assert.ok(html.includes('Completed games:</strong> 5'));
});

test('old and moving game reports compare only their own protocol starting points', () => {
  let store = fixture();
  const { seriesId, comparisonKey, ...entry } = store.results.find(
    (result) => result.id === 'this-week',
  );
  store = appendCompletedResult(
    store,
    {
      ...entry,
      id: 'moving-tap',
      protocolVersion: 2,
      metrics: { accuracyPct: 55, tapsPerSecond: 1.1, rhythmCV: null },
    },
    { createId: () => 'series-moving' },
  );
  const selected = selectReportResults(store, {
    weekStart: '2026-10-12',
    activityId: 'tap',
  }).results;
  assert.equal(selected.length, 2);
  const csv = exportCSV(store, selected);
  assert.match(csv, /"this-week","tap",[^\r\n]+"old"/);
  assert.match(csv, /"moving-tap","tap",[^\r\n]+"moving-tap"/);
  const html = printableReportHTML(store, { weekStart: '2026-10-12', activityId: 'tap' });
  assert.ok(html.includes('Game version 1'));
  assert.ok(html.includes('Game version 2'));
  assert.ok(html.includes('stationary circle'));
  assert.ok(html.includes('moving circle'));
});

test('partial spiral reports preserve historical meanings and compare with their own starting point', () => {
  let store = fixture();
  const { seriesId, comparisonKey, ...seed } = store.results.find(
    (result) => result.id === 'this-week',
  );
  const addSpiral = (id, protocolVersion, accuracyPct, coveragePct, createdAt = seed.createdAt) => {
    store = appendCompletedResult(
      store,
      {
        ...seed,
        id,
        activityId: 'trace',
        protocolVersion,
        createdAt,
        config: { pathId: `spiral-v${protocolVersion}`, targetSizeMode: 'standard' },
        metrics: { accuracyPct, coveragePct, meanDistancePctWidth: 1.5 },
      },
      { createId: () => `spiral-series-${protocolVersion}` },
    );
  };
  addSpiral('full-v1', 1, 70, 95);
  addSpiral('full-v2', 2, 75, 96);
  addSpiral(
    'partial-first',
    3,
    80,
    25,
    store.results.find((result) => result.id === 'old').createdAt,
  );
  addSpiral('partial-next', 3, 90, 30);

  const selection = selectReportResults(store, { weekStart: '2026-10-12', activityId: 'trace' });
  assert.deepEqual(selection.results.map((result) => result.id).sort(), [
    'full-v1',
    'full-v2',
    'partial-next',
  ]);
  const accuracyRows = reportRows(store, selection.results).filter(
    (row) => row.key === 'accuracyPct',
  );
  for (const id of ['full-v1', 'full-v2']) {
    const row = accuracyRows.find((row) => row.result.id === id);
    assert.equal(row.baseline.id, id);
    assert.equal(row.metadata.label, 'Line accuracy');
    assert.equal(
      row.metadata.description,
      'The part of your drawn line that stays close to the spiral.',
    );
  }
  const current = accuracyRows.find((row) => row.result.id === 'partial-next');
  assert.equal(current.baseline.id, 'partial-first');
  assert.equal(current.baselineValue, 80);
  assert.equal(current.value, 90);
  assert.equal(current.absoluteChange, 10);
  assert.equal(
    current.metadata.description,
    'How much of the line you drew stays close to the spiral. You do not have to trace every turn.',
  );

  const csv = exportCSV(store, selection.results);
  assert.match(csv, /"partial-next","trace",[^\r\n]+"partial-first"/);
  assert.ok(csv.includes('"coveragePct",30,"%"'));
  const html = printableReportHTML(store, { weekStart: '2026-10-12', activityId: 'trace' });
  assert.ok(html.includes('game version 1): Line accuracy'));
  assert.ok(html.includes('game version 2): Line accuracy'));
  assert.ok(html.includes('game version 3): Line accuracy'));
  assert.ok(html.includes('The part of your drawn line that stays close to the spiral.'));
  assert.ok(html.includes('You do not have to trace every turn.'));
  assert.ok(html.includes('Spiral covered'));
  assert.ok(html.includes('Completed games:</strong> 3'));
});

test('comfortable spiral reports explain tolerance and compare only the same version', () => {
  let store = fixture();
  const { seriesId, comparisonKey, ...seed } = store.results.find(
    (result) => result.id === 'this-week',
  );
  for (const [id, protocolVersion, accuracyPct] of [
    ['strict-v4', 4, 30],
    ['comfortable-first', 5, 90],
    ['comfortable-next', 5, 95],
  ]) {
    store = appendCompletedResult(
      store,
      {
        ...seed,
        id,
        activityId: 'trace',
        protocolVersion,
        config: { pathId: `spiral-v${protocolVersion}`, targetSizeMode: 'standard' },
        metrics: { accuracyPct, meanDistancePctWidth: 1, coveragePct: 12 },
      },
      { createId: () => `series-${id}` },
    );
  }
  const results = selectReportResults(store, { activityId: 'trace', allDates: true }).results;
  const rows = reportRows(store, results).filter((row) => row.key === 'accuracyPct');
  assert.equal(rows.find((row) => row.result.id === 'strict-v4').baseline.id, 'strict-v4');
  const latest = rows.find((row) => row.result.id === 'comfortable-next');
  assert.equal(latest.baseline.id, 'comfortable-first');
  assert.equal(latest.absoluteChange, 5);
  assert.match(latest.metadata.description, /full credit inside the guide/);
  assert.match(
    metricMetadata('accuracyPct', 'trace', 4).description,
    /outside the guide earn no credit/,
  );
  const model = buildReportModel(store, results);
  assert.equal(model.groups.length, 2);
  const strict = model.groups.find((group) => group.protocolVersion === 4);
  const comfortable = model.groups.find((group) => group.protocolVersion === 5);
  assert.match(
    strict.metrics.find((metric) => metric.key === 'accuracyPct').description,
    /outside the guide earn no credit/,
  );
  assert.match(
    comfortable.metrics.find((metric) => metric.key === 'accuracyPct').description,
    /Small wobbles are allowed/,
  );
  const html = printableReportHTML(store, { activityId: 'trace', weekStart: '2026-10-12' });
  assert.match(html, /game version 4\): Line accuracy/);
  assert.match(html, /game version 5\): Line accuracy/);
  assert.match(html, /Small wobbles are allowed/);
});
