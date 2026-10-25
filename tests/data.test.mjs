import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyStore, serializeStore, validateStore, STORAGE_KEY } from '../js/data/schema.js';
import { appendCompletedResult, compareValues } from '../js/data/baselines.js';
import { readStore, updateStore } from '../js/data/storage.js';

function result(id, patches = {}) {
  return {
    id,
    activityId: 'tap',
    protocolVersion: 1,
    metricVersion: 2,
    createdAt: '2026-10-20T15:00:00.000Z',
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
    metrics: { accuracyPct: 80, tapsPerSecond: 2, rhythmCV: null },
    quality: { issues: [], sampleCount: 20 },
    notes: '',
    isDemo: false,
    ...patches,
  };
}
function store() {
  const value = createEmptyStore();
  value.devices = [{ id: 'mouse-1', label: 'My mouse' }];
  value.setup.deviceId = 'mouse-1';
  return value;
}
const append = (value, entry) =>
  appendCompletedResult(value, entry, {
    createId: () => `baseline-${value.baselineSeries.length + 1}`,
  });
function memoryStorage(initial = null) {
  return {
    raw: initial,
    getItem() {
      return this.raw;
    },
    setItem(key, value) {
      assert.equal(key, STORAGE_KEY);
      this.raw = value;
    },
  };
}
function locks() {
  let queue = Promise.resolve();
  return {
    request(name, options, callback) {
      const work = queue.then(callback);
      queue = work.catch(() => {});
      return work;
    },
  };
}

test('first saved result sets a baseline and later results preserve it', () => {
  const empty = store();
  const first = append(empty, result('one'));
  const second = append(first, result('two', { metrics: { accuracyPct: 65, tapsPerSecond: 1.5 } }));
  assert.equal(empty.results.length, 0);
  assert.equal(second.baselineSeries.length, 1);
  assert.equal(second.baselineSeries[0].baselineResultId, 'one');
  assert.equal(second.results[1].seriesId, second.results[0].seriesId);
  assert.deepEqual(validateStore(JSON.parse(serializeStore(second))), second);
});

test('setup and actual input changes receive separate starting points', () => {
  const first = append(store(), result('one'));
  const secondResult = result('two');
  secondResult.context = { ...secondResult.context, hand: 'left' };
  const second = append(first, secondResult);
  const thirdResult = result('three');
  thirdResult.context = {
    ...thirdResult.context,
    assistedInput: true,
    caregiverProvidedInput: true,
  };
  const third = append(second, thirdResult);
  assert.equal(third.baselineSeries.length, 3);
  assert.notEqual(third.results[0].comparisonKey, third.results[1].comparisonKey);
});

test('practice, demo, stopped and duplicate results cannot establish baselines', () => {
  for (const patch of [
    { status: 'stopped' },
    { status: 'interrupted' },
    { isDemo: true },
    { isPractice: true },
  ])
    assert.throws(() => append(store(), result('bad', patch)), /completed personal/);
  const first = append(store(), result('one'));
  assert.throws(() => append(first, result('one')), /already been saved/);
});

test('invalid values and broken result, device or baseline references fail closed', () => {
  assert.throws(() => append(store(), result('one', { metrics: { accuracyPct: NaN } })), /metric/);
  assert.throws(
    () => append(store(), result('one', { metrics: { accuracyPct: Infinity } })),
    /metric/,
  );
  assert.throws(
    () => append(store(), result('one', { metrics: { accuracyPct: 80, tapsPerSecond: -2 } })),
    /metric/,
  );
  assert.throws(
    () => append(store(), result('one', { createdAt: '2026-02-31T00:00:00.000Z' })),
    /date/,
  );
  assert.throws(() => append(store(), result('one', { metrics: { accuracyPct: 101 } })), /range/);
  const invalidDevice = result('one');
  invalidDevice.context.deviceId = 'absent';
  assert.throws(() => append(store(), invalidDevice), /saved device/);
  const invalidFatigue = result('one');
  invalidFatigue.context.fatigue = 6;
  assert.throws(() => append(store(), invalidFatigue), /fatigue/);
  const first = append(store(), result('one'));
  first.baselineSeries[0].baselineResultId = 'absent';
  assert.throws(() => validateStore(first), /baseline reference/);
  const second = append(store(), result('one'));
  second.results[0].comparisonKey = 'fake';
  assert.throws(() => validateStore(second), /comparison profile/);
});

test('stale baseline expectations are rejected instead of silently reassigned', () => {
  const first = append(store(), result('one'));
  assert.throws(
    () => appendCompletedResult(first, result('two'), { expectedSeriesId: null }),
    /changed in another tab/,
  );
});

test('zero starting points use absolute change and accuracy uses percentage points', () => {
  assert.deepEqual(compareValues(1, 0, 'taps/s'), {
    absoluteChange: 1,
    percentChange: null,
    changeUnit: 'taps/s',
  });
  assert.deepEqual(compareValues(90, 80, '%'), {
    absoluteChange: 10,
    percentChange: 12.5,
    changeUnit: 'percentage points',
  });
  assert.equal(compareValues(null, 80, '%').absoluteChange, null);
});

test('concurrent result saves re-read under the lock and retain both results', async () => {
  const storage = memoryStorage(serializeStore(store()));
  const sharedLocks = locks();
  await Promise.all([
    updateStore(storage, sharedLocks, (current) => append(current, result('one'))),
    updateStore(storage, sharedLocks, (current) => append(current, result('two'))),
  ]);
  const saved = readStore(storage).store;
  assert.equal(saved.results.length, 2);
  assert.equal(saved.baselineSeries.length, 1);
  assert.equal(saved.baselineSeries[0].baselineResultId, 'one');
});

test('settings writers cannot silently erase or change measured history', async () => {
  const first = append(store(), result('one'));
  const storage = memoryStorage(serializeStore(first));
  await assert.rejects(
    updateStore(storage, locks(), (current) => {
      current.results = [];
      current.baselineSeries = [];
      return current;
    }),
    /Saved history changed/,
  );
  assert.equal(readStore(storage).store.results.length, 1);
  await updateStore(storage, locks(), (current) => {
    current.settings.theme = 'dark';
    return current;
  });
  assert.equal(readStore(storage).store.results.length, 1);
});

test('write failures leave the earlier history unchanged', async () => {
  const storage = memoryStorage(serializeStore(append(store(), result('one'))));
  const before = storage.raw;
  storage.setItem = () => {
    throw new Error('Quota exceeded');
  };
  await assert.rejects(
    updateStore(storage, locks(), (current) => append(current, result('two'))),
    /Quota/,
  );
  assert.equal(storage.raw, before);
});

test('older protocols remain readable and updated games start separate immutable baselines', () => {
  let value = store();
  const legacy = [
    ['trace', 1],
    ['tap', 1],
    ['aim', 2],
    ['hold', 1],
  ];
  for (const [activityId, protocolVersion] of legacy) {
    value = append(
      value,
      result(`old-${activityId}`, {
        activityId,
        protocolVersion,
        config: { pathId: activityId === 'trace' ? 'spiral-v1' : null, targetSizeMode: 'standard' },
      }),
    );
  }
  const originalResults = structuredClone(value.results);
  const originalBaselines = structuredClone(value.baselineSeries);
  for (const [activityId, protocolVersion] of [
    ['trace', 2],
    ['tap', 2],
    ['aim', 3],
    ['hold', 2],
  ]) {
    value = append(
      value,
      result(`new-${activityId}`, {
        activityId,
        protocolVersion,
        config: { pathId: activityId === 'trace' ? 'spiral-v2' : null, targetSizeMode: 'standard' },
      }),
    );
  }
  const restored = validateStore(JSON.parse(serializeStore(value)));
  assert.equal(restored.baselineSeries.length, 8);
  assert.deepEqual(restored.results.slice(0, 4), originalResults);
  assert.deepEqual(restored.baselineSeries.slice(0, 4), originalBaselines);
  for (const [index, current] of restored.results.slice(4).entries())
    assert.notEqual(current.comparisonKey, originalResults[index].comparisonKey);
});

test('new games and point scores save and retain their own starting points', () => {
  let value = store();
  const gameMetrics = {
    sequence: { accuracyPct: 75, hitCount: 6, missCount: 2, completionSeconds: 20 },
    memory: { accuracyPct: 60, matchedPairs: 3, pairAttempts: 5, completionSeconds: 32 },
    choice: { accuracyPct: 80, hitCount: 8, missCount: 2, scorePoints: 800, completionSeconds: 22 },
    aim: { accuracyPct: 75, hitCount: 9, missCount: 3, scorePoints: 825 },
  };
  for (const [activityId, metrics] of Object.entries(gameMetrics)) {
    const first = result(`${activityId}-first`, {
      activityId,
      protocolVersion: activityId === 'aim' ? 3 : 1,
      metrics,
    });
    value = append(value, first);
    value = append(value, { ...first, id: `${activityId}-second` });
  }
  const restored = validateStore(JSON.parse(serializeStore(value)));
  assert.equal(restored.baselineSeries.length, 4);
  assert.equal(restored.results.length, 8);
  for (const [activityId, metrics] of Object.entries(gameMetrics)) {
    const entries = restored.results.filter((entry) => entry.activityId === activityId);
    assert.equal(entries[0].seriesId, entries[1].seriesId);
    assert.deepEqual(entries[0].metrics, metrics);
  }
  assert.throws(
    () =>
      append(
        store(),
        result('negative-score', {
          activityId: 'aim',
          protocolVersion: 3,
          metrics: { accuracyPct: 50, scorePoints: -25 },
        }),
      ),
    /metric/,
  );
});

test('partial spiral protocol has its own immutable baseline and preserves older spiral records', () => {
  const spiral = (id, protocolVersion, accuracyPct) =>
    result(id, {
      activityId: 'trace',
      protocolVersion,
      config: { pathId: `spiral-v${protocolVersion}`, targetSizeMode: 'standard' },
      metrics: { accuracyPct, meanDistancePctWidth: 2, coveragePct: 35 },
    });
  let value = append(store(), spiral('trace-v1', 1, 80));
  value = append(value, spiral('trace-v2', 2, 85));
  const oldResults = structuredClone(value.results);
  const oldBaselines = structuredClone(value.baselineSeries);
  value = append(value, spiral('trace-v3-first', 3, 75));
  value = append(value, spiral('trace-v3-next', 3, 90));
  const restored = validateStore(JSON.parse(serializeStore(value)));
  assert.equal(restored.baselineSeries.length, 3);
  assert.equal(restored.results.length, 4);
  assert.deepEqual(restored.results.slice(0, 2), oldResults);
  assert.deepEqual(restored.baselineSeries.slice(0, 2), oldBaselines);
  assert.equal(restored.baselineSeries[2].baselineResultId, 'trace-v3-first');
  assert.equal(restored.results[2].seriesId, restored.results[3].seriesId);
  assert.equal(restored.results[2].metrics.accuracyPct, 75);
  assert.notEqual(restored.results[1].comparisonKey, restored.results[2].comparisonKey);
});

test('comfortable spiral scores start their own baseline and leave all earlier versions intact', () => {
  let value = store();
  const spiral = (id, protocolVersion, accuracyPct) =>
    result(id, {
      activityId: 'trace',
      protocolVersion,
      config: { pathId: `spiral-v${protocolVersion}`, targetSizeMode: 'standard' },
      metrics: { accuracyPct, meanDistancePctWidth: 1, coveragePct: 12 },
    });
  for (const version of [1, 2, 3, 4]) value = append(value, spiral(`old-v${version}`, version, 50));
  const previousResults = structuredClone(value.results);
  const previousBaselines = structuredClone(value.baselineSeries);
  value = append(value, spiral('comfortable-first', 5, 90));
  value = append(value, spiral('comfortable-next', 5, 95));
  const restored = validateStore(JSON.parse(serializeStore(value)));
  assert.equal(restored.baselineSeries.length, 5);
  assert.deepEqual(restored.results.slice(0, 4), previousResults);
  assert.deepEqual(restored.baselineSeries.slice(0, 4), previousBaselines);
  assert.equal(restored.results[4].seriesId, restored.results[5].seriesId);
  assert.notEqual(restored.results[3].comparisonKey, restored.results[4].comparisonKey);
  assert.equal(restored.baselineSeries[4].baselineResultId, 'comfortable-first');
  assert.throws(
    () =>
      append(value, {
        ...spiral('wrong-v5-path', 5, 90),
        config: { pathId: 'spiral-v4', targetSizeMode: 'standard' },
      }),
    /path/,
  );
});

test('unknown versions and mismatched spiral paths cannot masquerade as another game', () => {
  for (const [activityId, protocolVersion] of [
    ['trace', 6],
    ['tap', 3],
    ['aim', 1],
    ['aim', 4],
    ['hold', 3],
    ['sequence', 2],
    ['memory', 2],
    ['choice', 2],
  ]) {
    assert.throws(
      () =>
        append(
          store(),
          result(`bad-${activityId}-${protocolVersion}`, { activityId, protocolVersion }),
        ),
      /protocol/,
    );
  }
  assert.throws(
    () =>
      append(
        store(),
        result('wrong-path', {
          activityId: 'trace',
          protocolVersion: 2,
          config: { pathId: 'spiral-v1', targetSizeMode: 'standard' },
        }),
      ),
    /path/,
  );
  assert.throws(
    () =>
      append(
        store(),
        result('wrong-new-path', {
          activityId: 'trace',
          protocolVersion: 3,
          config: { pathId: 'spiral-v2', targetSizeMode: 'standard' },
        }),
      ),
    /path/,
  );
});

test('reading legacy data adds the default color setting without changing storage or history', async () => {
  const prior = append(store(), result('legacy'));
  delete prior.settings.colorScheme;
  const raw = JSON.stringify(prior);
  const storage = memoryStorage(raw);
  const loaded = readStore(storage);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.store.settings.colorScheme, 'lavender');
  assert.equal(storage.raw, raw);
  const history = structuredClone(loaded.store.results);
  await updateStore(storage, locks(), (current) => {
    current.settings.colorScheme = 'ocean';
    return current;
  });
  const saved = readStore(storage).store;
  assert.equal(saved.settings.colorScheme, 'ocean');
  assert.deepEqual(saved.results, history);
});

test('saving and importing keep summaries while dropping unknown pointer and identity fields', () => {
  const entry = result('summary-only');
  entry.rawPointerEvents = [{ x: 42, y: 96, timestamp: 1 }];
  entry.context.pointerSamples = [{ x: 42, y: 96 }];
  entry.context.patientName = 'Synthetic identity';
  entry.config.unrecognizedSetup = 'discard';
  const saved = append(store(), entry);
  saved.patientName = 'Synthetic identity';
  saved.settings.unknownPreference = true;
  saved.baselineSeries[0].pointerSamples = [{ x: 1, y: 2 }];
  const raw = serializeStore(saved);
  const restored = validateStore(JSON.parse(raw));

  assert.deepEqual(restored.results[0].metrics, entry.metrics);
  assert.deepEqual(restored.results[0].quality, entry.quality);
  for (const field of [
    'rawPointerEvents',
    'pointerSamples',
    'patientName',
    'unrecognizedSetup',
    'unknownPreference',
  ])
    assert.equal(raw.includes(field), false);
});

test('raw pointer arrays cannot be hidden inside saved quality fields', () => {
  const entry = result('invalid-quality');
  entry.quality.pointerSamples = [{ x: 42, y: 96 }];
  assert.throws(() => append(store(), entry), /quality field/);
});

test('ordinary updates cannot rewrite measured summaries or replace the original starting point', async () => {
  const first = append(store(), result('first'));
  const history = append(first, result('second'));
  const originalRaw = serializeStore(history);
  const changes = [
    (current) => {
      current.results[0].metrics.accuracyPct = 10;
    },
    (current) => {
      current.results[0].quality.sampleCount = 1;
    },
    (current) => {
      current.results[0].notes = 'Changed after saving';
    },
    (current) => {
      current.baselineSeries[0].baselineResultId = 'second';
    },
  ];
  for (const change of changes) {
    const storage = memoryStorage(originalRaw);
    await assert.rejects(
      updateStore(storage, locks(), (current) => {
        change(current);
        return current;
      }),
      /Saved history changed/,
    );
    assert.equal(storage.raw, originalRaw);
  }
});
