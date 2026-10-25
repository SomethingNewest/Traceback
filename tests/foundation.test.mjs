import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute } from '../js/router.js';
import { activities, supportsActivity, metrics } from '../js/activities/registry.js';
import { comparisonKey } from '../js/data/profiles.js';
import {
  createEmptyStore,
  validateStore,
  validateSettings,
  serializeStore,
  STORAGE_KEY,
} from '../js/data/schema.js';
import { readStore, updateStore } from '../js/data/storage.js';
import { scoreTap } from '../js/metrics/scoring.js';
import { applySettings } from '../js/ui/settings.js';

function memoryStorage(raw = null) {
  return {
    raw,
    getItem() {
      return this.raw;
    },
    setItem(key, value) {
      assert.equal(key, STORAGE_KEY);
      this.raw = value;
    },
  };
}
function queuedLocks() {
  let queue = Promise.resolve();
  return {
    request(name, options, callback) {
      const next = queue.then(callback);
      queue = next.catch(() => {});
      return next;
    },
  };
}
const context = {
  hand: 'right',
  deviceId: 'mouse-1',
  pointerType: 'mouse',
  surfaceCssWidth: 480,
  surfaceCssHeight: 480,
  assistedInput: false,
  caregiverProvidedInput: false,
};
const config = { pathId: 'spiral-v1', targetSizeMode: 'standard' };
const versions = { activityId: 'trace', protocolVersion: 1, metricVersion: 1 };

test('hash routing supports every specification route and rejects unknown activities', () => {
  for (const page of ['home', 'activities', 'progress', 'report', 'settings', 'about'])
    assert.deepEqual(parseRoute(`#/${page}`), { page });
  for (const activityId of ['trace', 'tap', 'aim', 'hold', 'sequence', 'memory', 'choice'])
    assert.deepEqual(parseRoute(`#/activity/${activityId}`), { page: 'activity', activityId });
  assert.equal(parseRoute('#/activity/unknown').page, 'not-found');
  assert.equal(parseRoute('').page, 'home');
});
test('all seven registry entries declare versioned game and accuracy metadata', () => {
  assert.equal(activities.length, 7);
  for (const activity of activities) {
    assert.equal(activity.status, 'ready');
    assert.equal(activity.metricVersion, 2);
    assert.ok(metrics[activity.metricKey]);
    assert.ok(activity.accuracyDescription);
  }
});
test('Cursor Hold support depends on pointer capability, including mouse on a small device', () => {
  assert.equal(supportsActivity('hold', { hasFinePointer: false }), false);
  assert.equal(supportsActivity('hold', { hasFinePointer: false, observedMouse: true }), true);
  assert.equal(supportsActivity('hold', { hasFinePointer: true }), true);
  assert.equal(supportsActivity('tap', { hasFinePointer: false }), true);
});
test('empty root and default settings round trip without producing results', () => {
  const store = createEmptyStore();
  assert.deepEqual(validateStore(JSON.parse(serializeStore(store))), store);
  assert.equal(store.results.length, 0);
});
test('settings reject unsupported types and remove unknown keys', () => {
  assert.throws(() => validateSettings({ textScale: 2 }), /text size/);
  assert.throws(() => validateSettings({ theme: 'other' }), /appearance/);
  assert.throws(() => validateSettings({ colorScheme: 'neon' }), /color scheme/);
  assert.throws(() => validateSettings({ highContrast: 'yes' }), /Invalid setting/);
  assert.equal(validateSettings({ theme: 'dark', injected: true }).injected, undefined);
});
test('legacy settings get lavender and every color scheme persists independently of appearance', () => {
  assert.equal(validateSettings({ theme: 'dark' }).colorScheme, 'lavender');
  for (const colorScheme of ['lavender', 'ocean', 'forest', 'warm']) {
    const value = createEmptyStore();
    value.settings.colorScheme = colorScheme;
    assert.equal(
      validateStore(JSON.parse(serializeStore(value))).settings.colorScheme,
      colorScheme,
    );
  }
});
test('color schemes apply for light, dark and device appearance without disabling stronger contrast', () => {
  const previousDocument = globalThis.document;
  const previousMatchMedia = globalThis.matchMedia;
  try {
    const root = { dataset: {}, style: { setProperty() {} } };
    globalThis.document = { documentElement: root };
    globalThis.matchMedia = () => ({ matches: true });
    for (const theme of ['light', 'dark', 'system'])
      for (const colorScheme of ['lavender', 'ocean', 'forest', 'warm']) {
        applySettings({ ...createEmptyStore().settings, theme, colorScheme, highContrast: true });
        assert.equal(root.dataset.theme, theme === 'system' ? 'dark' : theme);
        assert.equal(root.dataset.colorScheme, colorScheme);
        assert.equal(root.dataset.highContrast, 'true');
      }
    globalThis.matchMedia = () => ({ matches: false });
    applySettings(createEmptyStore().settings);
    assert.equal(root.dataset.theme, 'light');
    assert.equal(root.dataset.colorScheme, 'lavender');
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousMatchMedia === undefined) delete globalThis.matchMedia;
    else globalThis.matchMedia = previousMatchMedia;
  }
});
test('future schemas and measured roots fail closed rather than being overwritten', () => {
  assert.throws(() => validateStore({ ...createEmptyStore(), schemaVersion: 2 }), /version/);
  assert.throws(
    () => validateStore({ ...createEmptyStore(), results: [{ id: 'real-result' }] }),
    /preserved/,
  );
});
test('device and setup references are validated before writes', () => {
  const store = createEmptyStore();
  store.devices = [{ id: 'one', label: 'Mouse' }];
  store.setup.deviceId = 'absent';
  assert.throws(() => validateStore(store), /setup/);
  store.setup.deviceId = 'one';
  store.devices.push({ id: 'one', label: 'Duplicate' });
  assert.throws(() => validateStore(store), /repeated/);
});
test('corrupt local JSON remains byte-for-byte intact', async () => {
  const storage = memoryStorage('{corrupt');
  assert.equal(readStore(storage).ok, false);
  await assert.rejects(updateStore(storage, queuedLocks(), (value) => value));
  assert.equal(storage.raw, '{corrupt');
});
test('denied browser storage returns a read-only empty view', () => {
  const storage = {
    getItem() {
      throw new Error('Denied');
    },
  };
  const result = readStore(storage);
  assert.equal(result.ok, false);
  assert.equal(result.store.results.length, 0);
});
test('unsupported locking never attempts a storage write', async () => {
  const storage = memoryStorage();
  await assert.rejects(
    updateStore(storage, null, (value) => value),
    /safely save/,
  );
  assert.equal(storage.raw, null);
});
test('quota errors never report a successful save', async () => {
  const storage = memoryStorage();
  storage.setItem = () => {
    throw new Error('Quota exceeded');
  };
  await assert.rejects(
    updateStore(storage, queuedLocks(), (value) => value),
    /Quota/,
  );
  assert.equal(storage.raw, null);
});
test('concurrent updates re-read under the same lock and retain both changes', async () => {
  const storage = memoryStorage();
  const locks = queuedLocks();
  await Promise.all([
    updateStore(storage, locks, (value) => {
      value.settings.theme = 'dark';
      return value;
    }),
    updateStore(storage, locks, (value) => {
      value.settings.highContrast = true;
      return value;
    }),
  ]);
  assert.equal(readStore(storage).store.settings.theme, 'dark');
  assert.equal(readStore(storage).store.settings.highContrast, true);
});
test('profile identity separates hand, input, geometry, versions and assistance', () => {
  const key = comparisonKey(context, config, versions);
  for (const patch of [
    { hand: 'left' },
    { pointerType: 'touch' },
    { surfaceCssWidth: 390 },
    { assistedInput: true },
    { caregiverProvidedInput: true },
    { deviceId: 'mouse-2' },
    { assistiveInputMode: 'switch' },
  ])
    assert.notEqual(comparisonKey({ ...context, ...patch }, config, versions), key);
  assert.notEqual(comparisonKey(context, { ...config, targetSizeMode: 'larger' }, versions), key);
  assert.notEqual(comparisonKey(context, config, { ...versions, metricVersion: 2 }), key);
  assert.equal(
    comparisonKey(
      { ...context, dpr: 2, theme: 'dark', colorScheme: 'forest', fatigue: 5 },
      config,
      versions,
    ),
    key,
  );
});
test('profile rejects unknown pointers, touch Hold and nonfinite geometry', () => {
  assert.throws(() => comparisonKey({ ...context, pointerType: 'keyboard' }, config, versions));
  assert.throws(() =>
    comparisonKey({ ...context, pointerType: 'touch' }, config, {
      ...versions,
      activityId: 'hold',
    }),
  );
  assert.throws(() => comparisonKey({ ...context, surfaceCssWidth: NaN }, config, versions));
});
test('empty completed tap results have zero rate and no invented accuracy', () => {
  const result = scoreTap([], 0, 10000);
  assert.equal(result.metrics.tapsPerSecond, 0);
  assert.equal(result.metrics.accuracyPct, null);
});
