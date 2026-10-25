import {
  STORAGE_KEY,
  MAX_STORAGE_BYTES,
  createEmptyStore,
  serializeStore,
  validateStore,
} from './schema.js';
import { assertHistoryPreserved } from './history-integrity.js';

// Each project path gets its own key so the two TraceBack sites don't share results by mistake.
// This does NOT protect against other scripts running on the same hostname.
export function getStorageKey(pathname = '/') {
  let path = String(pathname).split(/[?#]/, 1)[0];
  path = path.replace(/\/index\.html\/?$/i, '/');

  const segments = [];
  const parts = path.split('/');
  for (const part of parts) {
    if (part === '' || part === '.') {
      continue;
    }
    if (part === '..') {
      segments.pop();
    } else {
      segments.push(part);
    }
  }

  let normalized = '/';
  if (segments.length > 0) {
    normalized = '/' + segments.join('/') + '/';
  }
  return 'traceback:v2:data:' + encodeURIComponent(normalized);
}

function parseRaw(raw) {
  if (typeof raw !== 'string') {
    throw new Error('Choose a TraceBack JSON backup.');
  }
  // check the size first so a huge file never gets parsed
  if (raw.length > MAX_STORAGE_BYTES || new TextEncoder().encode(raw).length > MAX_STORAGE_BYTES) {
    throw new Error('This backup is too large. The limit is 4 MB.');
  }
  return validateStore(JSON.parse(raw));
}

function readRaw(raw) {
  if (raw === null) {
    return createEmptyStore();
  }
  return parseRaw(raw);
}

function requireLocks(locks) {
  if (!locks || !locks.request) {
    throw new Error('This browser cannot safely save changes. Settings apply for this visit only.');
  }
}

function checkExpectedRaw(actual, expected) {
  if (expected !== null && typeof expected !== 'string') {
    throw new Error('Reload the saved data before making this change.');
  }
  if (actual !== expected) {
    throw new Error('Saved data changed in another tab. Reload before trying again.');
  }
}

function lockName(key) {
  return key + ':write';
}

export function readStore(storage, storageKey = STORAGE_KEY) {
  try {
    const store = readRaw(storage.getItem(storageKey));
    return { ok: true, store: store };
  } catch (error) {
    return {
      ok: false,
      store: createEmptyStore(),
      message: 'Local data could not be read. It has not been changed. ' + error.message,
    };
  }
}

// Anything that writes has to go through this same lock and re-read the data inside it.
// If the browser has no Web Locks we just don't save (no localStorage-based fallback).
export async function updateStore(
  storage,
  locks,
  updater,
  storageKey = STORAGE_KEY,
  { expectedPresent = false } = {},
) {
  requireLocks(locks);

  return locks.request(lockName(storageKey), { mode: 'exclusive' }, async function () {
    const raw = storage.getItem(storageKey);
    if (expectedPresent && raw === null) {
      throw new Error('Saved data was deleted in another tab. Reload before saving.');
    }

    let current;
    try {
      current = readRaw(raw);
    } catch (error) {
      throw new Error('Local data could not be read. It has not been changed. ' + error.message);
    }

    const updated = await updater(structuredClone(current));
    const next = validateStore(updated);

    // settings changes and new results should never touch old history
    assertHistoryPreserved(current, next);

    // only show "Saved" once this has actually returned
    storage.setItem(storageKey, serializeStore(next));
    return next;
  });
}

export function downloadRawBackup(storage, storageKey = STORAGE_KEY) {
  // gives back the raw bytes even if they can't be read, so nothing is lost.
  // this isn't a checked backup that can be restored
  const raw = storage.getItem(storageKey);
  if (raw === null || raw === undefined) {
    return serializeStore(createEmptyStore());
  }
  return raw;
}

export async function restoreStore({
  storage,
  locks,
  storageKey = STORAGE_KEY,
  raw,
  expectedRaw,
  replace = false,
}) {
  requireLocks(locks);
  const next = parseRaw(raw);
  const serialized = serializeStore(next);

  return locks.request(lockName(storageKey), { mode: 'exclusive' }, function () {
    const currentRaw = storage.getItem(storageKey);
    checkExpectedRaw(currentRaw, expectedRaw);
    if (currentRaw !== null && replace !== true) {
      throw new Error('Confirm that this backup should replace the saved data.');
    }
    storage.setItem(storageKey, serialized);
    return next;
  });
}

export async function deleteStore({ storage, locks, storageKey = STORAGE_KEY, expectedRaw }) {
  requireLocks(locks);
  return locks.request(lockName(storageKey), { mode: 'exclusive' }, function () {
    checkExpectedRaw(storage.getItem(storageKey), expectedRaw);
    storage.removeItem(storageKey);
  });
}

export async function importLegacy({ storage, locks, storageKey, expectedRaw, expectedLegacyRaw }) {
  requireLocks(locks);
  if (typeof storageKey !== 'string' || !storageKey || storageKey === STORAGE_KEY) {
    throw new Error('Choose a separate destination for the earlier results.');
  }
  if (expectedLegacyRaw === null) {
    throw new Error('There are no earlier results to copy.');
  }

  const next = parseRaw(expectedLegacyRaw);
  const serialized = serializeStore(next);

  // always grab the locks in this order - older versions only use the legacy lock
  return locks.request(lockName(STORAGE_KEY), { mode: 'exclusive' }, function () {
    return locks.request(lockName(storageKey), { mode: 'exclusive' }, function () {
      checkExpectedRaw(storage.getItem(STORAGE_KEY), expectedLegacyRaw);
      const currentRaw = storage.getItem(storageKey);
      checkExpectedRaw(currentRaw, expectedRaw);
      if (currentRaw !== null) {
        throw new Error('This site already has saved data. Download a backup before replacing it.');
      }
      storage.setItem(storageKey, serialized);
      return next;
    });
  });
}

export async function removeLegacy({ storage, locks, expectedRaw }) {
  return deleteStore({
    storage: storage,
    locks: locks,
    storageKey: STORAGE_KEY,
    expectedRaw: expectedRaw,
  });
}
