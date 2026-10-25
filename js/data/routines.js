export const MAX_ROUTINES = 10;
export const MAX_ROUTINE_STEPS = 20;
export const ROUTINE_ACTIVITY_IDS = Object.freeze([
  'trace',
  'tap',
  'aim',
  'hold',
  'sequence',
  'memory',
  'choice',
]);

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/;
const DATE_PATTERN = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;

function checkId(value, label) {
  if (typeof value !== 'string' || value.length > 80 || !ID_PATTERN.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }
}

function checkDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    throw new Error('Invalid routine date.');
  }
  if (!Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new Error('Invalid routine date.');
  }
}

function checkObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${label}.`);
  }
}

function cleanTitle(value) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 80 ||
    /[\0-\x1f\x7f]/.test(value)
  ) {
    throw new Error('Give your routine a name of 1 to 80 characters.');
  }
  return value.trim();
}

function cleanSteps(value) {
  let ok = Array.isArray(value) && value.length > 0 && value.length <= MAX_ROUTINE_STEPS;
  if (ok) {
    for (const activityId of value) {
      if (!ROUTINE_ACTIVITY_IDS.includes(activityId)) {
        ok = false;
        break;
      }
    }
  }
  if (!ok) {
    throw new Error(`Choose between 1 and ${MAX_ROUTINE_STEPS} games for your routine.`);
  }
  return value.slice();
}

function dateString(now) {
  let value;
  if (now instanceof Date) {
    value = now.toISOString();
  } else if (now === undefined || now === null) {
    value = new Date().toISOString();
  } else {
    value = now;
  }
  checkDate(value);
  return value;
}

// only a real saved game can count towards a routine step
function countsForStep(result, activityId, startedAt) {
  if (!result) return false;
  if (result.status !== 'complete') return false;
  if (result.isDemo !== false) return false;
  if (result.isPractice === true) return false;
  if (result.activityId !== activityId) return false;
  if (result.createdAt < startedAt) return false;
  return true;
}

// This lives outside schema.js so the helpers below can also run inside a locked
// result append. Steps are only marked done by result IDs, never by made up scores.
export function validateRoutineState(routineValues = [], sessionValue = null, results = []) {
  if (!Array.isArray(routineValues) || routineValues.length > MAX_ROUTINES) {
    throw new Error(`You can save up to ${MAX_ROUTINES} routines.`);
  }

  const ids = new Set();
  const routines = [];
  for (const value of routineValues) {
    checkObject(value, 'routine');
    checkId(value.id, 'routine ID');
    if (ids.has(value.id)) {
      throw new Error('Repeated routine ID.');
    }
    ids.add(value.id);
    checkDate(value.createdAt);
    checkDate(value.updatedAt);

    const badRevision =
      !Number.isSafeInteger(value.revision) || value.revision < 1 || value.revision > 1e9;
    if (value.updatedAt < value.createdAt || badRevision) {
      throw new Error('Invalid routine revision or date.');
    }

    routines.push({
      id: value.id,
      title: cleanTitle(value.title),
      steps: cleanSteps(value.steps),
      revision: value.revision,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    });
  }

  if (sessionValue === null) {
    return { routines: routines, routineSession: null };
  }

  const session = sessionValue;
  checkObject(session, 'routine session');
  checkId(session.id, 'routine session ID');
  checkId(session.routineId, 'routine ID');
  const steps = cleanSteps(session.steps);
  checkDate(session.startedAt);
  checkDate(session.updatedAt);

  if (
    session.updatedAt < session.startedAt ||
    !Number.isInteger(session.nextIndex) ||
    session.nextIndex < 0 ||
    session.nextIndex > steps.length
  ) {
    throw new Error('Invalid routine progress.');
  }

  if (session.status !== 'active' && session.status !== 'complete') {
    throw new Error('Invalid routine status.');
  }
  const isComplete = session.status === 'complete';
  const reachedEnd = session.nextIndex === steps.length;
  if (isComplete !== reachedEnd) {
    throw new Error('Invalid routine status.');
  }

  if (!Array.isArray(session.completed) || session.completed.length !== session.nextIndex) {
    throw new Error('Invalid completed routine steps.');
  }

  const usedResults = new Set();
  const completed = [];
  for (let i = 0; i < session.completed.length; i++) {
    const entry = session.completed[i];
    checkObject(entry, 'routine step');
    checkId(entry.resultId, 'routine result ID');
    if (entry.stepIndex !== i || usedResults.has(entry.resultId)) {
      throw new Error('Invalid or repeated routine result.');
    }
    const result = results.find((r) => r.id === entry.resultId);
    if (!countsForStep(result, steps[i], session.startedAt)) {
      throw new Error('Routine progress refers to a missing or different saved game.');
    }
    usedResults.add(entry.resultId);
    completed.push({ stepIndex: i, resultId: entry.resultId });
  }

  // the session keeps its own copy of the steps, so editing or deleting
  // the routine later won't mess up a run that already started
  return {
    routines: routines,
    routineSession: {
      id: session.id,
      routineId: session.routineId,
      title: cleanTitle(session.title),
      steps: steps,
      nextIndex: session.nextIndex,
      completed: completed,
      status: session.status,
      startedAt: session.startedAt,
      updatedAt: session.updatedAt,
    },
  };
}

function withRoutineState(store) {
  const state = validateRoutineState(store.routines, store.routineSession, store.results);
  return Object.assign({}, store, state);
}

export function createRoutine(store, value, { now } = {}) {
  const next = withRoutineState(store);
  if (next.routines.length >= MAX_ROUTINES) {
    throw new Error(
      `You can save up to ${MAX_ROUTINES} routines. Edit or remove one to add another.`,
    );
  }
  checkId(value.id, 'routine ID');
  for (const routine of next.routines) {
    if (routine.id === value.id) {
      throw new Error('This routine already exists. Reload before saving.');
    }
  }

  const date = dateString(now);
  next.routines.push({
    id: value.id,
    title: cleanTitle(value.title),
    steps: cleanSteps(value.steps),
    revision: 1,
    createdAt: date,
    updatedAt: date,
  });
  return next;
}

export function updateRoutine(store, id, value, { expectedRevision, now } = {}) {
  const next = withRoutineState(store);
  const index = next.routines.findIndex((routine) => routine.id === id);
  if (index < 0) {
    throw new Error('This routine was removed in another tab. Your changes are still here.');
  }

  const previous = next.routines[index];
  if (expectedRevision !== undefined && previous.revision !== expectedRevision) {
    throw new Error('This routine changed in another tab. Reload before saving over it.');
  }

  const date = dateString(now);
  let updatedAt = date;
  if (date < previous.updatedAt) {
    updatedAt = previous.updatedAt;
  }

  next.routines[index] = Object.assign({}, previous, {
    title: cleanTitle(value.title),
    steps: cleanSteps(value.steps),
    revision: previous.revision + 1,
    updatedAt: updatedAt,
  });
  return next;
}

export function deleteRoutine(store, id, { expectedRevision } = {}) {
  const next = withRoutineState(store);
  const previous = next.routines.find((routine) => routine.id === id);
  if (!previous) {
    return next;
  }
  if (expectedRevision !== undefined && previous.revision !== expectedRevision) {
    throw new Error('This routine changed in another tab. Reload before removing it.');
  }
  next.routines = next.routines.filter((routine) => routine.id !== id);
  return next;
}

export function startRoutine(store, routineId, { sessionId, now } = {}) {
  const next = withRoutineState(store);
  const routine = next.routines.find((item) => item.id === routineId);
  if (!routine) {
    throw new Error('This routine was removed. Choose another routine.');
  }
  checkId(sessionId, 'routine session ID');
  if (next.routineSession && next.routineSession.id === sessionId) {
    throw new Error('Start this routine with a new session ID.');
  }

  const date = dateString(now);
  next.routineSession = {
    id: sessionId,
    routineId: routineId,
    title: routine.title,
    steps: routine.steps.slice(),
    nextIndex: 0,
    completed: [],
    status: 'active',
    startedAt: date,
    updatedAt: date,
  };
  return next;
}

export function currentRoutineStep(store) {
  const session = store.routineSession;
  if (!session) {
    return null;
  }

  let activityId = session.steps[session.nextIndex];
  if (activityId === undefined || activityId === null) {
    activityId = null;
  }

  return {
    sessionId: session.id,
    stepIndex: session.nextIndex,
    activityId: activityId,
    title: session.title,
    totalSteps: session.steps.length,
    complete: session.status === 'complete',
  };
}

// Grab sessionId and stepIndex when a saved game starts, then call this after
// appending its real result inside the same updateStore call. Old games still get
// saved, they just can't move a newer session forward or skip a step in another tab.
export function advanceRoutine(
  store,
  { sessionId, stepIndex, resultId, activityId },
  { now } = {},
) {
  const next = withRoutineState(store);
  const session = next.routineSession;

  if (!session) return next;
  if (session.id !== sessionId) return next;
  if (session.status !== 'active') return next;
  if (session.nextIndex !== stepIndex) return next;
  if (session.steps[stepIndex] !== activityId) return next;

  for (const entry of session.completed) {
    if (entry.resultId === resultId) {
      return next;
    }
  }

  const result = next.results.find((item) => item.id === resultId);
  if (!countsForStep(result, activityId, session.startedAt)) {
    return next;
  }

  const date = dateString(now);
  session.completed.push({ stepIndex: stepIndex, resultId: resultId });
  session.nextIndex = session.nextIndex + 1;
  if (session.nextIndex === session.steps.length) {
    session.status = 'complete';
  } else {
    session.status = 'active';
  }
  if (date >= session.updatedAt) {
    session.updatedAt = date;
  }
  return next;
}

export function endRoutine(store, { sessionId } = {}) {
  const next = withRoutineState(store);
  if (next.routineSession && next.routineSession.id === sessionId) {
    next.routineSession = null;
  }
  return next;
}
