import { comparisonKey } from './profiles.js';
import { validateRoutineState } from './routines.js';

export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = 'traceback:v1:data';
export const MAX_STORAGE_BYTES = 4 * 1024 * 1024;
export const DEFAULT_SETTINGS = Object.freeze({
  theme: 'system',
  colorScheme: 'lavender',
  textScale: 1,
  highContrast: false,
  comfortableSpacing: false,
  reducedMotion: true,
  largeControls: false,
  largerTargets: false,
  simplifiedInstructions: true,
  caregiverMode: false,
  activityConsent: false,
});

const HANDS = ['left', 'right', 'both', 'unspecified'];
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/;
const DATE_PATTERN = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const FIELD_NAME = /^[a-z][A-Za-z0-9]{0,59}$/;

// which protocol versions we still accept for each game.
// older saved games keep the setup and starting point they had
const PROTOCOLS = {
  trace: [1, 2, 3, 4, 5, 6],
  tap: [1, 2],
  aim: [2, 3],
  hold: [1, 2],
  sequence: [1],
  memory: [1],
  choice: [1],
};

const CONTEXT_FIELDS = [
  'hand',
  'deviceId',
  'pointerType',
  'surfaceCssWidth',
  'surfaceCssHeight',
  'viewportWidth',
  'viewportHeight',
  'dpr',
  'assistedInput',
  'caregiverProvidedInput',
  'caregiverSetupHelp',
  'fatigue',
];

function checkObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

function checkString(value, max, label, allowEmpty = false) {
  if (typeof value !== 'string') {
    throw new Error(`Invalid ${label}.`);
  }
  if ((!allowEmpty && value.length === 0) || value.length > max || value.includes('\0')) {
    throw new Error(`Invalid ${label}.`);
  }
}

function checkId(value, label) {
  checkString(value, 80, label);
  if (!ID_PATTERN.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }
}

function checkNumber(value, min, max, label) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Invalid ${label}.`);
  }
}

function checkBoolean(value, label) {
  if (typeof value !== 'boolean') {
    throw new Error(`Invalid ${label}.`);
  }
}

function checkDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    throw new Error('Invalid result date.');
  }
  if (!Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new Error('Invalid result date.');
  }
}

export function createEmptyStore() {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: Object.assign({}, DEFAULT_SETTINGS),
    devices: [],
    baselineSeries: [],
    results: [],
    setup: { hand: 'right', deviceId: null },
    routines: [],
    routineSession: null,
  };
}

export function validateSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Settings must be an object.');
  }
  const settings = Object.assign({}, DEFAULT_SETTINGS, value);

  if (!['light', 'dark', 'system'].includes(settings.theme)) {
    throw new Error('Unsupported appearance.');
  }
  if (!['lavender', 'ocean', 'forest', 'warm'].includes(settings.colorScheme)) {
    throw new Error('Unsupported color scheme.');
  }
  if (![1, 1.25, 1.5].includes(settings.textScale)) {
    throw new Error('Unsupported text size.');
  }

  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (typeof DEFAULT_SETTINGS[key] === 'boolean' && typeof settings[key] !== 'boolean') {
      throw new Error(`Invalid setting: ${key}.`);
    }
  }

  // only copy the keys we know about, so an imported file can't sneak in extra ones
  const clean = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    clean[key] = settings[key];
  }
  return clean;
}

function checkDevices(devices) {
  if (devices.length > 30) {
    throw new Error('Too many device labels.');
  }
  const ids = new Set();
  for (const device of devices) {
    if (
      !device ||
      typeof device.id !== 'string' ||
      !device.id ||
      device.id.length > 80 ||
      ids.has(device.id)
    ) {
      throw new Error('Invalid or repeated device ID.');
    }
    if (typeof device.label !== 'string' || !device.label.trim() || device.label.length > 80) {
      throw new Error('Invalid device label.');
    }
    ids.add(device.id);
  }
  return ids;
}

function checkSeries(series, results, seriesIds, profileKeys) {
  checkObject(series, 'Baseline');
  checkId(series.id, 'Baseline ID');
  checkId(series.baselineResultId, 'Baseline result ID');
  checkDate(series.createdAt);
  checkString(series.comparisonKey, 1000, 'Baseline comparison key');

  if (seriesIds.has(series.id) || profileKeys.has(series.comparisonKey)) {
    throw new Error('Repeated baseline or comparison profile.');
  }

  const baseline = results.find((result) => result.id === series.baselineResultId);
  if (
    !baseline ||
    baseline.seriesId !== series.id ||
    baseline.comparisonKey !== series.comparisonKey ||
    baseline.createdAt !== series.createdAt
  ) {
    throw new Error('Broken baseline reference.');
  }

  seriesIds.add(series.id);
  profileKeys.add(series.comparisonKey);
  return {
    id: series.id,
    comparisonKey: series.comparisonKey,
    baselineResultId: series.baselineResultId,
    createdAt: series.createdAt,
  };
}

export function validateStore(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid stored data.');
  }
  if (value.schemaVersion !== SCHEMA_VERSION) {
    throw new Error('Unsupported data version. Original data has been preserved.');
  }

  const settings = validateSettings(value.settings);

  for (const key of ['devices', 'baselineSeries', 'results']) {
    if (!Array.isArray(value[key])) {
      throw new Error(`Invalid ${key} list.`);
    }
  }

  const deviceIds = checkDevices(value.devices);

  let setup = value.setup;
  if (setup === undefined || setup === null) {
    setup = { hand: 'right', deviceId: null };
  }
  if (!HANDS.includes(setup.hand) || (setup.deviceId !== null && !deviceIds.has(setup.deviceId))) {
    throw new Error('Invalid saved activity setup.');
  }

  if (value.results.length > 5000 || value.baselineSeries.length > 5000) {
    throw new Error('History limit reached. Export your data before adding more.');
  }

  const results = [];
  const baselineSeries = [];
  try {
    const resultIds = new Set();
    for (const item of value.results) {
      const clean = validateCompletedResult(item);
      if (resultIds.has(clean.id)) {
        throw new Error('Repeated result ID.');
      }
      if (!deviceIds.has(clean.context.deviceId)) {
        throw new Error('Result refers to an unknown device.');
      }
      resultIds.add(clean.id);
      results.push(clean);
    }

    const seriesIds = new Set();
    const profileKeys = new Set();
    for (const series of value.baselineSeries) {
      baselineSeries.push(checkSeries(series, results, seriesIds, profileKeys));
    }

    for (const result of results) {
      const match = baselineSeries.find(function (series) {
        return series.id === result.seriesId && series.comparisonKey === result.comparisonKey;
      });
      if (!match) {
        throw new Error('Result refers to an unknown baseline.');
      }
    }
  } catch (error) {
    throw new Error(`${error.message} Original data has been preserved.`);
  }

  const routineState = validateRoutineState(value.routines, value.routineSession, results);

  const devices = [];
  for (const device of value.devices) {
    devices.push({ id: device.id, label: device.label });
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    settings: settings,
    devices: devices,
    baselineSeries: baselineSeries,
    results: results,
    setup: { hand: setup.hand, deviceId: setup.deviceId },
    routines: routineState.routines,
    routineSession: routineState.routineSession,
  };
}

// Only summaries get saved. Raw pointer events and any unknown imported fields are dropped.
export function validateCompletedResult(value, { requireSeries = true } = {}) {
  checkObject(value, 'Result');
  checkId(value.id, 'result ID');

  const versions = Object.hasOwn(PROTOCOLS, value.activityId) ? PROTOCOLS[value.activityId] : null;
  if (!versions || !versions.includes(value.protocolVersion) || value.metricVersion !== 2) {
    throw new Error('Unsupported result protocol or metric version.');
  }
  if (value.status !== 'complete' || value.isDemo !== false || value.isPractice === true) {
    throw new Error('Only completed personal activities can be saved.');
  }

  checkDate(value.createdAt);
  checkNumber(value.durationMs, 1, 86400000, 'activity duration');

  checkObject(value.context, 'Result context');
  const context = value.context;
  checkId(context.deviceId, 'device ID');
  checkNumber(context.surfaceCssWidth, 1, 20000, 'surfaceCssWidth');
  checkNumber(context.surfaceCssHeight, 1, 20000, 'surfaceCssHeight');
  checkNumber(context.viewportWidth, 1, 20000, 'viewportWidth');
  checkNumber(context.viewportHeight, 1, 20000, 'viewportHeight');
  checkNumber(context.dpr, 0.1, 20, 'pixel ratio');
  checkBoolean(context.assistedInput, 'assistedInput');
  checkBoolean(context.caregiverProvidedInput, 'caregiverProvidedInput');
  checkBoolean(context.caregiverSetupHelp, 'caregiverSetupHelp');
  if (context.caregiverProvidedInput && !context.assistedInput) {
    throw new Error('Caregiver input must be marked as assisted.');
  }
  if (context.fatigue !== null) {
    checkNumber(context.fatigue, 1, 5, 'fatigue');
  }

  const cleanContext = {};
  for (const field of CONTEXT_FIELDS) {
    cleanContext[field] = context[field];
  }
  if (context.assistiveInputMode !== undefined) {
    checkString(context.assistiveInputMode, 80, 'assistive input mode');
    cleanContext.assistiveInputMode = context.assistiveInputMode;
  }

  checkObject(value.config, 'Activity setup');
  let expectedPath = null;
  if (value.activityId === 'trace') {
    expectedPath = `spiral-v${value.protocolVersion}`;
  }
  if (value.config.pathId !== expectedPath) {
    throw new Error('Unsupported activity path.');
  }
  const config = { pathId: value.config.pathId, targetSizeMode: value.config.targetSizeMode };
  const key = comparisonKey(cleanContext, config, value);

  checkObject(value.metrics, 'Metrics');
  const metricEntries = Object.entries(value.metrics);
  if (
    metricEntries.length === 0 ||
    metricEntries.length > 30 ||
    !Object.hasOwn(value.metrics, 'accuracyPct')
  ) {
    throw new Error('Activity accuracy is required.');
  }
  const metrics = {};
  for (const [name, metric] of metricEntries) {
    if (!FIELD_NAME.test(name)) {
      throw new Error('Invalid metric value.');
    }
    if (metric !== null && (!Number.isFinite(metric) || metric < 0 || metric > 1e12)) {
      throw new Error('Invalid metric value.');
    }
    // anything ending in Pct (accuracyPct included) has to be 0-100
    if (name.endsWith('Pct') && metric !== null && (metric < 0 || metric > 100)) {
      throw new Error('Percentage is outside its range.');
    }
    metrics[name] = metric;
  }

  checkObject(value.quality, 'Result quality');
  const issues = value.quality.issues;
  if (!Array.isArray(issues) || issues.length > 30) {
    throw new Error('Invalid quality issues.');
  }
  for (const issue of issues) {
    checkString(issue, 200, 'quality issue');
  }
  const quality = { issues: issues.slice() };
  if (Object.keys(value.quality).length > 20) {
    throw new Error('Too many quality fields.');
  }
  for (const [name, item] of Object.entries(value.quality)) {
    if (name === 'issues') continue;
    const type = typeof item;
    const allowedType =
      type === 'number' || type === 'boolean' || type === 'string' || item === null;
    if (!FIELD_NAME.test(name) || !allowedType) {
      throw new Error('Invalid quality field.');
    }
    if (type === 'number') {
      checkNumber(item, -1e12, 1e12, 'quality value');
    }
    if (type === 'string') {
      checkString(item, 200, 'quality value', true);
    }
    quality[name] = item;
  }

  checkString(value.notes, 2000, 'notes', true);

  const result = {
    id: value.id,
    activityId: value.activityId,
    protocolVersion: value.protocolVersion,
    metricVersion: value.metricVersion,
    createdAt: value.createdAt,
    durationMs: value.durationMs,
    status: 'complete',
    context: cleanContext,
    config: config,
    metrics: metrics,
    quality: quality,
    notes: value.notes,
    isDemo: false,
  };

  if (requireSeries) {
    checkId(value.seriesId, 'series ID');
    if (value.comparisonKey !== key) {
      throw new Error('Result comparison profile does not match its setup.');
    }
    result.seriesId = value.seriesId;
    result.comparisonKey = key;
  }
  return result;
}

export function serializeStore(store) {
  const json = JSON.stringify(validateStore(store));
  const size = new TextEncoder().encode(json).length;
  if (size > MAX_STORAGE_BYTES) {
    throw new Error('Storage size limit reached. Export a backup before adding more data.');
  }
  return json;
}
