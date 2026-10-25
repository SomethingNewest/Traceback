import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyStore, serializeStore, validateStore, STORAGE_KEY } from '../js/data/schema.js';
import { appendCompletedResult } from '../js/data/baselines.js';
import { readStore, updateStore } from '../js/data/storage.js';
import {
  MAX_ROUTINES,
  MAX_ROUTINE_STEPS,
  createRoutine,
  updateRoutine,
  deleteRoutine,
  startRoutine,
  advanceRoutine,
  endRoutine,
  currentRoutineStep,
  validateRoutineState,
} from '../js/data/routines.js';

const START = '2026-10-24T15:00:00.000Z';
const LATER = '2026-10-24T15:01:00.000Z';
function store() {
  const value = createEmptyStore();
  value.devices = [{ id: 'mouse-1', label: 'My mouse' }];
  value.setup.deviceId = 'mouse-1';
  return value;
}
function result(id, activityId = 'tap', patches = {}) {
  return {
    id,
    activityId,
    protocolVersion: activityId === 'trace' ? 4 : activityId === 'aim' ? 3 : 1,
    metricVersion: 2,
    createdAt: LATER,
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
    config: { pathId: activityId === 'trace' ? 'spiral-v4' : null, targetSizeMode: 'standard' },
    metrics: { accuracyPct: 80 },
    quality: { issues: [], sampleCount: 20 },
    notes: '',
    isDemo: false,
    ...patches,
  };
}
const addResult = (value, entry) =>
  appendCompletedResult(value, entry, {
    createId: () => `baseline-${value.baselineSeries.length + 1}`,
  });
const addRoutine = (value = store(), steps = ['tap', 'trace', 'tap']) =>
  createRoutine(value, { id: 'morning', title: 'Morning games', steps }, { now: START });
const begin = (value = addRoutine()) =>
  startRoutine(value, 'morning', { sessionId: 'session-1', now: START });
const complete = (
  value,
  resultId = 'one',
  stepIndex = 0,
  activityId = 'tap',
  sessionId = 'session-1',
) => advanceRoutine(value, { sessionId, stepIndex, resultId, activityId }, { now: LATER });
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

test('routine defaults extend old data without writing or changing settings and results', async () => {
  const prior = addResult(store(), result('old'));
  delete prior.routines;
  delete prior.routineSession;
  const raw = JSON.stringify(prior);
  const storage = memoryStorage(raw);
  const loaded = readStore(storage);
  assert.equal(loaded.ok, true);
  assert.equal(storage.raw, raw);
  assert.deepEqual(loaded.store.routines, []);
  assert.equal(loaded.store.routineSession, null);
  assert.deepEqual(loaded.store.results, prior.results);
  assert.deepEqual(loaded.store.settings, prior.settings);
  await updateStore(storage, locks(), (current) => addRoutine(current));
  const after = readStore(storage).store;
  assert.deepEqual(after.results, prior.results);
  assert.deepEqual(after.baselineSeries, prior.baselineSeries);
  assert.deepEqual(after.settings, prior.settings);
  assert.equal(after.routines.length, 1);
});

test('routine creation, repeated games, ordered edits and removal do not mutate previous stores', () => {
  const empty = store();
  const created = addRoutine(empty);
  assert.deepEqual(empty.routines, []);
  assert.deepEqual(created.routines[0].steps, ['tap', 'trace', 'tap']);
  const edited = updateRoutine(
    created,
    'morning',
    { title: 'Evening games', steps: ['trace', 'tap', 'hold'] },
    { expectedRevision: 1, now: LATER },
  );
  assert.equal(created.routines[0].title, 'Morning games');
  assert.equal(edited.routines[0].revision, 2);
  assert.deepEqual(edited.routines[0].steps, ['trace', 'tap', 'hold']);
  assert.equal(deleteRoutine(edited, 'morning', { expectedRevision: 2 }).routines.length, 0);
  assert.equal(edited.routines.length, 1);
  assert.deepEqual(validateStore(JSON.parse(serializeStore(edited))), edited);
});

test('routines reject malformed IDs, unsafe names, unknown games and excessive plans', () => {
  for (const [key, value] of [
    ['id', '../bad'],
    ['id', ''],
    ['title', ' '],
    ['title', 'x'.repeat(81)],
    ['title', 'bad\0name'],
    ['steps', []],
    ['steps', ['unknown']],
    ['steps', Array(MAX_ROUTINE_STEPS + 1).fill('tap')],
  ]) {
    assert.throws(() =>
      createRoutine(store(), { id: 'valid', title: 'Valid', steps: ['tap'], [key]: value }),
    );
  }
  assert.throws(() => addRoutine(addRoutine()), /already exists/);
  let value = store();
  for (let index = 0; index < MAX_ROUTINES; index++)
    value = createRoutine(value, { id: `routine-${index}`, title: 'Games', steps: ['tap'] });
  assert.throws(
    () => createRoutine(value, { id: 'eleventh', title: 'Games', steps: ['tap'] }),
    /up to 10/,
  );
  const invalid = addRoutine();
  invalid.routines[0].revision = 0;
  assert.throws(() => validateStore(invalid), /revision/);
});

test('stale editor writes and deletions preserve another tab’s revision', () => {
  const original = addRoutine();
  const edited = updateRoutine(
    original,
    'morning',
    { title: 'Changed in another tab', steps: ['memory'] },
    { expectedRevision: 1 },
  );
  assert.throws(
    () =>
      updateRoutine(
        edited,
        'morning',
        { title: 'Stale', steps: ['choice'] },
        { expectedRevision: 1 },
      ),
    /another tab/,
  );
  assert.throws(() => deleteRoutine(edited, 'morning', { expectedRevision: 1 }), /another tab/);
  assert.throws(
    () =>
      updateRoutine(deleteRoutine(original, 'morning'), 'morning', {
        title: 'Gone',
        steps: ['tap'],
      }),
    /removed/,
  );
  assert.equal(edited.routines[0].title, 'Changed in another tab');
});

test('started routine uses a snapshot unaffected by edits or deleting its template', () => {
  const started = begin();
  const edited = updateRoutine(
    started,
    'morning',
    { title: 'Different', steps: ['memory'] },
    { now: LATER },
  );
  const removed = deleteRoutine(edited, 'morning');
  assert.deepEqual(removed.routineSession.steps, ['tap', 'trace', 'tap']);
  assert.equal(removed.routineSession.title, 'Morning games');
  assert.deepEqual(currentRoutineStep(removed), {
    sessionId: 'session-1',
    stepIndex: 0,
    activityId: 'tap',
    title: 'Morning games',
    totalSteps: 3,
    complete: false,
  });
  const restored = validateStore(JSON.parse(serializeStore(removed)));
  assert.equal(restored.routineSession.nextIndex, 0);
  assert.throws(
    () => startRoutine(removed, 'morning', { sessionId: 'second', now: LATER }),
    /removed/,
  );
});

test('only the expected real saved game advances a routine and retries cannot skip repeated steps', () => {
  let value = begin(addRoutine(store(), ['tap', 'tap']));
  const initial = structuredClone(value.routineSession);
  assert.deepEqual(complete(value).routineSession, initial); // No saved result.
  value = addResult(value, result('one'));
  assert.equal(complete(value, 'one', 0, 'trace').routineSession.nextIndex, 0);
  assert.equal(complete(value, 'one', 0, 'tap', 'other-session').routineSession.nextIndex, 0);
  const first = complete(value);
  assert.equal(first.routineSession.nextIndex, 1);
  assert.equal(value.routineSession.nextIndex, 0);
  assert.deepEqual(complete(first).routineSession, first.routineSession);
  assert.equal(complete(first, 'one', 1).routineSession.nextIndex, 1); // Same result cannot count twice.
  value = addResult(first, result('two'));
  value = complete(value, 'two', 1);
  assert.equal(value.routineSession.nextIndex, 2);
  assert.equal(value.routineSession.status, 'complete');
  assert.deepEqual(value.routineSession.completed, [
    { stepIndex: 0, resultId: 'one' },
    { stepIndex: 1, resultId: 'two' },
  ]);
  assert.equal(currentRoutineStep(value).complete, true);
  assert.equal(currentRoutineStep(value).activityId, null);
  assert.deepEqual(
    validateStore(JSON.parse(serializeStore(value))).routineSession,
    value.routineSession,
  );
});

test('stopped, unsaved, practice, demo and games from before the routine cannot advance', () => {
  const original = begin(addRoutine(store(), ['tap']));
  for (const patch of [
    { status: 'stopped' },
    { status: 'interrupted' },
    { isDemo: true },
    { isPractice: true },
    { createdAt: '2026-10-23T12:00:00.000Z' },
  ]) {
    const value = { ...original, results: [result('fake', 'tap', patch)] };
    assert.equal(complete(value, 'fake').routineSession.nextIndex, 0);
  }
  assert.equal(original.results.length, 0);
});

test('routine sessions fail closed on broken references, gaps and repeated results', () => {
  const first = complete(addResult(begin(), result('one')));
  const patches = [
    (session) => {
      session.completed[0].resultId = 'missing';
    },
    (session) => {
      session.steps[0] = 'trace';
    },
    (session) => {
      session.nextIndex = 2;
    },
    (session) => {
      session.completed[0].stepIndex = 1;
    },
    (session) => {
      session.status = 'complete';
    },
    (session) => {
      session.startedAt = '2026-10-25T12:00:00.000Z';
      session.updatedAt = session.startedAt;
    },
  ];
  for (const patch of patches) {
    const value = structuredClone(first);
    patch(value.routineSession);
    assert.throws(() => validateStore(value), /routine|Routine/);
  }
  assert.throws(() => validateRoutineState(null, null, []), /routines/);
});

test('save and routine advancement are one atomic write and quota failure preserves both', async () => {
  const storage = memoryStorage(serializeStore(begin()));
  const before = storage.raw;
  const sharedLocks = locks();
  storage.setItem = () => {
    throw new Error('Quota exceeded');
  };
  await assert.rejects(
    updateStore(storage, sharedLocks, (current) => complete(addResult(current, result('one')))),
    /Quota/,
  );
  assert.equal(storage.raw, before);
  assert.equal(readStore(storage).store.routineSession.nextIndex, 0);
  storage.setItem = function (key, raw) {
    this.raw = raw;
  };
  await updateStore(storage, sharedLocks, (current) => complete(addResult(current, result('one'))));
  const saved = readStore(storage).store;
  assert.equal(saved.results.length, 1);
  assert.equal(saved.routineSession.nextIndex, 1);
});

test('concurrent tabs may save both games but only one completion advances the captured step', async () => {
  const storage = memoryStorage(serializeStore(begin(addRoutine(store(), ['tap', 'tap']))));
  const sharedLocks = locks();
  await Promise.all([
    updateStore(storage, sharedLocks, (current) => complete(addResult(current, result('one')))),
    updateStore(storage, sharedLocks, (current) =>
      complete(addResult(current, result('two')), 'two'),
    ),
  ]);
  const saved = readStore(storage).store;
  assert.equal(saved.results.length, 2);
  assert.equal(saved.routineSession.nextIndex, 1);
  assert.deepEqual(saved.routineSession.completed, [{ stepIndex: 0, resultId: 'one' }]);
});

test('restarting creates a new instance and rejects old completion or stop callbacks', () => {
  const old = begin();
  const restarted = startRoutine(old, 'morning', { sessionId: 'session-2', now: LATER });
  const withSavedResult = addResult(restarted, result('one'));
  assert.equal(complete(withSavedResult).routineSession.nextIndex, 0);
  assert.equal(endRoutine(restarted, { sessionId: 'session-1' }).routineSession.id, 'session-2');
  assert.equal(endRoutine(restarted, { sessionId: 'session-2' }).routineSession, null);
  assert.throws(() => startRoutine(old, 'morning', { sessionId: 'session-1' }), /new session ID/);
});

test('new spiral accuracy protocol starts a separate baseline and keeps older records', () => {
  let value = store();
  for (const protocolVersion of [1, 2, 3, 4])
    value = addResult(
      value,
      result(`trace-v${protocolVersion}`, 'trace', {
        protocolVersion,
        config: { pathId: `spiral-v${protocolVersion}`, targetSizeMode: 'standard' },
      }),
    );
  assert.equal(value.baselineSeries.length, 4);
  assert.equal(validateStore(JSON.parse(serializeStore(value))).results.length, 4);
});
