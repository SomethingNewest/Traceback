import { validateStore, validateCompletedResult } from './schema.js';
import { comparisonKey } from './profiles.js';

export function createResultId() {
  if (!globalThis.crypto || !globalThis.crypto.randomUUID) {
    throw new Error('This browser cannot create a safe result ID.');
  }
  return globalThis.crypto.randomUUID();
}

// call this from inside the updateStore updater so results from other tabs are loaded first
export function appendCompletedResult(
  store,
  result,
  { createId = createResultId, expectedSeriesId } = {},
) {
  const current = validateStore(store);
  const clean = validateCompletedResult(result, { requireSeries: false });

  for (const item of current.results) {
    if (item.id === clean.id) {
      throw new Error('This result has already been saved.');
    }
  }

  let hasDevice = false;
  for (const device of current.devices) {
    if (device.id === clean.context.deviceId) {
      hasDevice = true;
      break;
    }
  }
  if (!hasDevice) {
    throw new Error('Choose a saved device before saving this activity.');
  }

  const key = comparisonKey(clean.context, clean.config, clean);
  let series = current.baselineSeries.find((item) => item.comparisonKey === key);

  if (expectedSeriesId !== undefined) {
    const foundId = series ? series.id : null;
    if (foundId !== expectedSeriesId) {
      throw new Error('Your starting point changed in another tab. Please reload before saving.');
    }
  }

  // first result for this setup becomes the baseline
  if (!series) {
    series = {
      id: createId(),
      comparisonKey: key,
      baselineResultId: clean.id,
      createdAt: clean.createdAt,
    };
    current.baselineSeries.push(series);
  }

  const saved = Object.assign({}, clean, { comparisonKey: key, seriesId: series.id });
  current.results.push(saved);
  return validateStore(current);
}

export function baselineForResult(store, result) {
  const series = store.baselineSeries.find(function (item) {
    return item.id === result.seriesId && item.comparisonKey === result.comparisonKey;
  });
  if (!series) {
    return null;
  }
  const baseline = store.results.find((item) => item.id === series.baselineResultId);
  if (baseline === undefined) {
    return null;
  }
  return baseline;
}

export function compareValues(value, baselineValue, unit) {
  let changeUnit = unit;
  if (unit === '%') {
    changeUnit = 'percentage points';
  }

  if (!Number.isFinite(value) || !Number.isFinite(baselineValue)) {
    return { absoluteChange: null, percentChange: null, changeUnit: changeUnit };
  }

  let percentChange = null;
  if (Math.abs(baselineValue) > 1e-9) {
    percentChange = ((value - baselineValue) / Math.abs(baselineValue)) * 100;
  }

  return {
    absoluteChange: value - baselineValue,
    percentChange: percentChange,
    changeUnit: changeUnit,
  };
}
