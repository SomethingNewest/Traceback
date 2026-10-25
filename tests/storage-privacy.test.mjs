import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmptyStore,
  serializeStore,
  STORAGE_KEY,
  MAX_STORAGE_BYTES,
} from '../js/data/schema.js';
import {
  getStorageKey,
  readStore,
  updateStore,
  downloadRawBackup,
  restoreStore,
  deleteStore,
  importLegacy,
  removeLegacy,
} from '../js/data/storage.js';

const projectKey = getStorageKey('/Traceback-challenge/');

function memoryStorage() {
  const values = new Map();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

function sharedLocks() {
  const queues = new Map();
  return {
    names: [],
    request(name, options, action) {
      assert.equal(options.mode, 'exclusive');
      this.names.push(name);
      const work = (queues.get(name) ?? Promise.resolve()).then(action);
      queues.set(
        name,
        work.catch(() => {}),
      );
      return work;
    },
  };
}

function fixture(theme = 'dark') {
  const store = createEmptyStore();
  store.settings.theme = theme;
  store.devices = [{ id: 'sample-mouse', label: 'Synthetic device' }];
  store.setup.deviceId = 'sample-mouse';
  return store;
}

test('project paths use separate keys with consistent index and slash handling', () => {
  assert.notEqual(projectKey, getStorageKey('/Traceback/'));
  assert.notEqual(projectKey, STORAGE_KEY);
  for (const path of [
    '/Traceback-challenge',
    '/Traceback-challenge/index.html',
    '//Traceback-challenge//',
  ])
    assert.equal(getStorageKey(path), projectKey);
  assert.equal(getStorageKey('/index.html'), getStorageKey('/'));
  assert.equal(getStorageKey('/a/../Traceback-challenge/./'), projectKey);
});

test('scoped reads, updates and backups leave the earlier shared data alone', async () => {
  const storage = memoryStorage();
  const legacy = serializeStore(fixture());
  storage.setItem(STORAGE_KEY, legacy);
  assert.equal(readStore(storage, projectKey).store.devices.length, 0);
  await updateStore(
    storage,
    sharedLocks(),
    (value) => {
      value.settings.highContrast = true;
      return value;
    },
    projectKey,
  );
  assert.equal(readStore(storage, projectKey).store.settings.highContrast, true);
  assert.equal(JSON.parse(downloadRawBackup(storage, projectKey)).settings.highContrast, true);
  assert.equal(storage.getItem(STORAGE_KEY), legacy);
  assert.equal(readStore(storage).store.settings.theme, 'dark');
});

test('scoped writers retain concurrent changes under their shared lock', async () => {
  const storage = memoryStorage();
  const locks = sharedLocks();
  await Promise.all([
    updateStore(
      storage,
      locks,
      async (value) => {
        await Promise.resolve();
        value.settings.theme = 'dark';
        return value;
      },
      projectKey,
    ),
    updateStore(
      storage,
      locks,
      (value) => {
        value.settings.highContrast = true;
        return value;
      },
      projectKey,
    ),
  ]);
  assert.equal(readStore(storage, projectKey).store.settings.theme, 'dark');
  assert.equal(readStore(storage, projectKey).store.settings.highContrast, true);
  assert.deepEqual(locks.names, [`${projectKey}:write`, `${projectKey}:write`]);
});

test('a stale writer cannot recreate saved data deleted in another tab', async () => {
  const storage = memoryStorage();
  const locks = sharedLocks();
  const raw = serializeStore(fixture());
  storage.setItem(projectKey, raw);
  let updaterCalled = false;
  const deleting = deleteStore({ storage, locks, storageKey: projectKey, expectedRaw: raw });
  const writing = updateStore(
    storage,
    locks,
    (value) => {
      updaterCalled = true;
      return value;
    },
    projectKey,
    { expectedPresent: true },
  );
  await deleting;
  await assert.rejects(writing, /deleted in another tab/);
  assert.equal(updaterCalled, false);
  assert.equal(storage.getItem(projectKey), null);
});

test('a first visit can save without a previous store', async () => {
  const storage = memoryStorage();
  await updateStore(storage, sharedLocks(), (value) => value, projectKey, {
    expectedPresent: false,
  });
  assert.notEqual(storage.getItem(projectKey), null);
});

test('restore validates a backup and needs explicit consent to replace existing bytes', async () => {
  const storage = memoryStorage();
  const locks = sharedLocks();
  const existing = serializeStore(fixture('light'));
  const raw = serializeStore(fixture('dark'));
  storage.setItem(projectKey, existing);
  const options = { storage, locks, storageKey: projectKey, raw, expectedRaw: existing };
  await assert.rejects(restoreStore(options), /Confirm/);
  assert.equal(storage.getItem(projectKey), existing);
  const restored = await restoreStore({ ...options, replace: true });
  assert.deepEqual(restored, fixture('dark'));
  assert.equal(readStore(storage, projectKey).store.settings.theme, 'dark');
});

test('invalid and unsupported backups preserve the current store', async () => {
  const storage = memoryStorage();
  const original = serializeStore(fixture());
  storage.setItem(projectKey, original);
  for (const raw of [
    '{broken',
    '{}',
    JSON.stringify({ ...fixture(), schemaVersion: 2 }),
    JSON.stringify({ ...fixture(), setup: { hand: 'right', deviceId: 'unknown' } }),
  ]) {
    await assert.rejects(
      restoreStore({
        storage,
        locks: sharedLocks(),
        storageKey: projectKey,
        raw,
        expectedRaw: original,
        replace: true,
      }),
    );
    assert.equal(storage.getItem(projectKey), original);
  }
});

test('oversized backup rejection measures UTF-8 bytes before parsing', async () => {
  const storage = memoryStorage();
  const raw = 'é'.repeat(MAX_STORAGE_BYTES / 2 + 1);
  assert.ok(raw.length < MAX_STORAGE_BYTES);
  await assert.rejects(
    restoreStore({
      storage,
      locks: sharedLocks(),
      storageKey: projectKey,
      raw,
      expectedRaw: null,
    }),
    /too large/,
  );
  assert.equal(storage.getItem(projectKey), null);
});

test('restore compares current bytes inside the lock rather than replacing a newer save', async () => {
  const storage = memoryStorage();
  const locks = sharedLocks();
  const original = serializeStore(fixture());
  storage.setItem(projectKey, original);
  const saving = updateStore(
    storage,
    locks,
    (value) => {
      value.settings.highContrast = true;
      return value;
    },
    projectKey,
  );
  const restoring = restoreStore({
    storage,
    locks,
    storageKey: projectKey,
    raw: original,
    expectedRaw: original,
    replace: true,
  });
  await saving;
  await assert.rejects(restoring, /changed in another tab/);
  assert.equal(readStore(storage, projectKey).store.settings.highContrast, true);
});

test('restore into an absent destination requires an explicit null snapshot', async () => {
  const storage = memoryStorage();
  const options = {
    storage,
    locks: sharedLocks(),
    storageKey: projectKey,
    raw: serializeStore(fixture()),
  };
  await assert.rejects(restoreStore(options), /Reload/);
  await restoreStore({ ...options, expectedRaw: null });
  assert.equal(readStore(storage, projectKey).store.devices.length, 1);
});

test('failed quota writes do not claim that a backup has been restored', async () => {
  const storage = memoryStorage();
  const existing = serializeStore(fixture());
  storage.setItem(projectKey, existing);
  storage.setItem = () => {
    throw new Error('Quota exceeded');
  };
  await assert.rejects(
    restoreStore({
      storage,
      locks: sharedLocks(),
      storageKey: projectKey,
      raw: serializeStore(fixture('light')),
      expectedRaw: existing,
      replace: true,
    }),
    /Quota/,
  );
  assert.equal(storage.getItem(projectKey), existing);
});

test('unreadable data can be downloaded intact and deleted only against its exact snapshot', async () => {
  const storage = memoryStorage();
  const raw = '{unreadable original bytes';
  storage.setItem(projectKey, raw);
  assert.equal(downloadRawBackup(storage, projectKey), raw);
  await assert.rejects(
    deleteStore({ storage, locks: sharedLocks(), storageKey: projectKey, expectedRaw: null }),
    /changed/,
  );
  assert.equal(storage.getItem(projectKey), raw);
  await deleteStore({ storage, locks: sharedLocks(), storageKey: projectKey, expectedRaw: raw });
  assert.equal(storage.getItem(projectKey), null);
});

test('legacy import copies only to an absent destination and never deletes its source', async () => {
  const storage = memoryStorage();
  const locks = sharedLocks();
  const raw = serializeStore(fixture());
  storage.setItem(STORAGE_KEY, raw);
  const options = {
    storage,
    locks,
    storageKey: projectKey,
    expectedRaw: null,
    expectedLegacyRaw: raw,
  };
  assert.deepEqual(await importLegacy(options), fixture());
  assert.equal(storage.getItem(STORAGE_KEY), raw);
  assert.deepEqual(locks.names, [`${STORAGE_KEY}:write`, `${projectKey}:write`]);
  await assert.rejects(
    importLegacy({ ...options, expectedRaw: storage.getItem(projectKey) }),
    /already has saved data/,
  );
  assert.equal(storage.getItem(STORAGE_KEY), raw);
});

test('legacy import refuses a changed source without creating destination data', async () => {
  const storage = memoryStorage();
  const expectedLegacyRaw = serializeStore(fixture('light'));
  const actual = serializeStore(fixture('dark'));
  storage.setItem(STORAGE_KEY, actual);
  await assert.rejects(
    importLegacy({
      storage,
      locks: sharedLocks(),
      storageKey: projectKey,
      expectedRaw: null,
      expectedLegacyRaw,
    }),
    /changed in another tab/,
  );
  assert.equal(storage.getItem(projectKey), null);
  assert.equal(storage.getItem(STORAGE_KEY), actual);
});

test('legacy import rejects invalid data, a same-key destination and an absent source', async () => {
  const storage = memoryStorage();
  const options = { storage, locks: sharedLocks(), storageKey: projectKey, expectedRaw: null };
  await assert.rejects(importLegacy({ ...options, expectedLegacyRaw: '{bad' }));
  await assert.rejects(importLegacy({ ...options, expectedLegacyRaw: null }), /no earlier results/);
  await assert.rejects(
    importLegacy({
      ...options,
      storageKey: STORAGE_KEY,
      expectedLegacyRaw: serializeStore(fixture()),
    }),
    /separate destination/,
  );
  assert.equal(storage.values.size, 0);
});

test('removing earlier shared data requires the current snapshot and preserves project data', async () => {
  const storage = memoryStorage();
  const raw = serializeStore(fixture());
  storage.setItem(STORAGE_KEY, raw);
  storage.setItem(projectKey, raw);
  await assert.rejects(
    removeLegacy({ storage, locks: sharedLocks(), expectedRaw: null }),
    /changed/,
  );
  await removeLegacy({ storage, locks: sharedLocks(), expectedRaw: raw });
  assert.equal(storage.getItem(STORAGE_KEY), null);
  assert.equal(storage.getItem(projectKey), raw);
});

test('restore, import and deletion all fail closed when browser locks are unavailable', async () => {
  const storage = memoryStorage();
  const raw = serializeStore(fixture());
  storage.setItem(STORAGE_KEY, raw);
  storage.setItem(projectKey, raw);
  await assert.rejects(
    restoreStore({ storage, storageKey: projectKey, raw, expectedRaw: raw, replace: true }),
    /safely save/,
  );
  await assert.rejects(
    importLegacy({ storage, storageKey: projectKey, expectedRaw: null, expectedLegacyRaw: raw }),
    /safely save/,
  );
  await assert.rejects(
    deleteStore({ storage, storageKey: projectKey, expectedRaw: raw }),
    /safely save/,
  );
  await assert.rejects(removeLegacy({ storage, expectedRaw: raw }), /safely save/);
  assert.equal(storage.getItem(projectKey), raw);
  assert.equal(storage.getItem(STORAGE_KEY), raw);
});
