import { createRouter } from './router.js';
import { activityById, supportsActivity, metrics } from './activities/registry.js';
import { mountActivity } from './activities/runner.js';
import { DEFAULT_SETTINGS, STORAGE_KEY, MAX_STORAGE_BYTES, validateStore } from './data/schema.js';
import {
  readStore,
  updateStore,
  downloadRawBackup,
  getStorageKey,
  restoreStore,
  deleteStore,
  removeLegacy,
} from './data/storage.js';
import { showShareWarning } from './ui/privacy.js';
import { appendCompletedResult, createResultId } from './data/baselines.js';
import { applySettings, readInstructions, stopReading } from './ui/settings.js';
import { confirmDialog } from './ui/components.js';
import { activityPage, practiceMarkup } from './ui/activity-page.js';
import { homePage, libraryPage, settingsPage, aboutPage } from './ui/pages.js';
import { renderHistoryPage } from './ui/history.js';
import { informationPage, bindInformation } from './ui/information.js';
import { renderRoutinesPage } from './ui/routines.js';
import { startRoutine, advanceRoutine, currentRoutineStep } from './data/routines.js';

const main = document.querySelector('main');
const storageStatus = document.querySelector('#storage-status');

let storage;
try {
  storage = window.localStorage;
} catch {
  // storage is blocked, just leave it undefined
}

const storageKey = getStorageKey(location.pathname);
const initial = readStore(storage, storageKey);

let previouslySaved = false;
try {
  previouslySaved = Boolean(storage) && storage.getItem(storageKey) !== null;
} catch {
  // ignore
}

let dataRemoved = false;
let store = initial.store;
let settings = Object.assign({}, store.settings);
let observedMouse = false;
let capabilityChanged = function () {};
let reportRefresh = null;
let beforeLeave = async function () {
  return true;
};

const REMOVED_MESSAGE = 'Saved data was removed in another tab. Reload before saving again.';
const POINTER_TYPES = ['mouse', 'touch', 'pen'];

function capabilities() {
  return {
    hasFinePointer: matchMedia('(any-pointer: fine)').matches,
    observedMouse: observedMouse,
  };
}

function showStorageMessage() {
  if (!initial.ok) {
    storageStatus.textContent =
      'Your saved data could not be read. It has not been changed. Open Settings to download a copy.';
  } else if (!navigator.locks || !navigator.locks.request) {
    storageStatus.textContent =
      'This browser cannot save results. You can download a result when a game ends.';
  } else {
    storageStatus.textContent =
      'Results are saved in this browser. Anyone using this browser profile can read them.';
  }

  // check if the old shared storage key still has results in it
  if (initial.ok && !previouslySaved && readStore(storage).store.results.length) {
    storageStatus.textContent += ' Older results were found. Open Settings to copy them.';
  }
}

showStorageMessage();

document.querySelector('.skip-link').addEventListener('click', function (event) {
  event.preventDefault();
  main.focus();
  main.scrollIntoView();
});

applySettings(settings);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
  applySettings(settings);
});

document.addEventListener(
  'pointermove',
  function (event) {
    if (event.pointerType === 'mouse' && !observedMouse) {
      observedMouse = true;
      capabilityChanged();
    }
  },
  { passive: true },
);

matchMedia('(any-pointer: fine)').addEventListener('change', function () {
  capabilityChanged();
});

async function save(updater) {
  if (!initial.ok) {
    throw new Error('Your saved data could not be read. Download a copy from Settings.');
  }
  if (dataRemoved) {
    throw new Error(REMOVED_MESSAGE);
  }

  store = await updateStore(
    storage,
    navigator.locks,
    function (current) {
      if (dataRemoved) {
        throw new Error(REMOVED_MESSAGE);
      }
      return updater(current);
    },
    storageKey,
    { expectedPresent: previouslySaved },
  );

  previouslySaved = true;
  showStorageMessage();
  if (reportRefresh) {
    reportRefresh();
  }
  return store;
}

function download(text, filename, type = 'application/json') {
  const blob = new Blob([text], { type: type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 1000);
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function openRoutineStep() {
  const step = currentRoutineStep(store);
  let hash = '#/routines';
  if (step && !step.complete) {
    hash = '#/activity/' + step.activityId;
  }
  // if we're already on that page, fire hashchange so the router reloads it
  if (location.hash === hash) {
    window.dispatchEvent(new window.Event('hashchange'));
  } else {
    location.hash = hash;
  }
}

function bindRoutines() {
  let disposed = false;
  let navigationTimer = null;

  function continueAfterUpdate() {
    navigationTimer = setTimeout(function () {
      if (!disposed && location.hash === '#/routines') {
        openRoutineStep();
      }
    }, 0);
  }

  const page = renderRoutinesPage(main, {
    store: store,
    onSave: function (updater) {
      return save(updater);
    },
    onStart: async function (routineId) {
      await save(function (current) {
        return startRoutine(current, routineId, { sessionId: createResultId() });
      });
      if (!disposed) {
        continueAfterUpdate();
      }
    },
    onResume: async function () {
      const latest = readStore(storage, storageKey);
      if (!latest.ok) {
        throw new Error('Your routine could not be read. Reload before continuing.');
      }
      store = latest.store;
      if (!disposed) {
        continueAfterUpdate();
      }
    },
  });

  beforeLeave = async function () {
    if (page.isBusy()) {
      return false;
    }
    if (!page.hasUnsavedChanges()) {
      return true;
    }
    return await confirmDialog({
      title: 'Leave this routine draft?',
      message: 'Your changes have not been saved.',
      action: 'Leave this page',
    });
  };

  return function () {
    disposed = true;
    clearTimeout(navigationTimer);
    page.dispose();
  };
}

function bindSettings() {
  const form = main.querySelector('#settings-form');
  const status = main.querySelector('#settings-status');

  // fill the form with the current settings
  for (const key of Object.keys(settings)) {
    const value = settings[key];
    const field = form.elements.namedItem(key);
    if (!field) continue;
    if (field.type === 'checkbox') {
      field.checked = value;
    } else {
      field.value = String(value);
    }
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
  });

  form.addEventListener('change', async function (event) {
    const field = event.target;
    const key = field.name;
    if (!(key in DEFAULT_SETTINGS)) return;

    let value;
    if (field.type === 'checkbox') {
      value = field.checked;
    } else if (key === 'textScale') {
      value = Number(field.value);
    } else {
      value = field.value;
    }

    settings = Object.assign({}, settings, { [key]: value });
    applySettings(settings);
    status.textContent = 'Saving...';
    try {
      await save(function (current) {
        current.settings[key] = value;
        return current;
      });
      status.textContent = 'Saved.';
    } catch {
      status.textContent = 'Changed for this visit. Could not save this setting.';
    }
  });

  const dataStatus = main.querySelector('#data-status');

  function rawSaved() {
    return storage.getItem(storageKey);
  }

  main.querySelector('#download-backup').addEventListener('click', async function () {
    const ok = await showShareWarning({ kind: 'backup', includeNotes: true });
    if (!ok || !dataStatus.isConnected) return;
    try {
      download(
        downloadRawBackup(storage, storageKey),
        'traceback-backup-' + todayString() + '.json',
      );
      dataStatus.textContent = 'Your backup was downloaded. No password is needed to open it.';
    } catch {
      dataStatus.textContent = 'Your browser blocked access to the saved data.';
    }
  });

  main.querySelector('#restore-backup').addEventListener('click', async function (event) {
    const button = event.currentTarget;
    const input = main.querySelector('#restore-file');
    const file = input.files ? input.files[0] : undefined;
    if (!file) {
      dataStatus.textContent = 'Choose a TraceBack backup file first.';
      return;
    }

    button.disabled = true;
    try {
      if (file.size > MAX_STORAGE_BYTES) {
        throw new Error('This file is too large for a TraceBack backup.');
      }
      const expectedRaw = rawSaved();
      const raw = await file.text();
      if (new TextEncoder().encode(raw).length > MAX_STORAGE_BYTES) {
        throw new Error('This file is too large for a TraceBack backup.');
      }
      const restored = validateStore(JSON.parse(raw));
      if (!dataStatus.isConnected) return;

      const confirmed = await confirmDialog({
        title: 'Restore this backup?',
        message:
          "This replaces this site's current results, routines and settings with " +
          restored.results.length +
          ' saved games from the backup. Download your current backup first if you want to keep it.',
        action: 'Restore backup',
      });
      if (!confirmed || !dataStatus.isConnected) return;

      await restoreStore({
        storage: storage,
        locks: navigator.locks,
        storageKey: storageKey,
        raw: raw,
        expectedRaw: expectedRaw,
        replace: expectedRaw !== null,
      });
      location.reload();
    } catch (error) {
      if (dataStatus.isConnected) {
        dataStatus.textContent = 'The backup was not restored. ' + error.message;
      }
    } finally {
      if (button.isConnected) {
        button.disabled = false;
      }
    }
  });

  main.querySelector('#delete-data').addEventListener('click', async function () {
    try {
      const expectedRaw = rawSaved();
      const confirmed = await confirmDialog({
        title: 'Delete saved data?',
        message:
          "This permanently removes this site's results, routines and settings from this browser. Downloaded files and the older shared copy are separate.",
        action: 'Delete saved data',
      });
      if (!confirmed || !dataStatus.isConnected) return;

      await deleteStore({
        storage: storage,
        locks: navigator.locks,
        storageKey: storageKey,
        expectedRaw: expectedRaw,
      });
      dataRemoved = true;
      location.reload();
    } catch (error) {
      if (dataStatus.isConnected) {
        dataStatus.textContent = 'Saved data was not deleted. ' + error.message;
      }
    }
  });

  // older versions kept everything under one shared key
  const legacyCopy = main.querySelector('#copy-legacy-data');
  const legacyRemove = main.querySelector('#remove-legacy-data');
  let legacyAvailable = false;
  try {
    legacyAvailable = Boolean(storage) && storage.getItem(STORAGE_KEY) !== null;
  } catch {
    // ignore
  }
  legacyCopy.hidden = !legacyAvailable;
  legacyRemove.hidden = !legacyAvailable;

  legacyCopy.addEventListener('click', async function () {
    try {
      const expectedRaw = rawSaved();
      const raw = storage.getItem(STORAGE_KEY);
      if (raw === null) {
        throw new Error('There is no older copy to import.');
      }
      const older = validateStore(JSON.parse(raw));

      const confirmed = await confirmDialog({
        title: 'Copy older results?',
        message:
          'This copies ' +
          older.results.length +
          ' older games and their routines and settings. It replaces the current data for this site. The older shared copy will stay until you choose to remove it.',
        action: 'Copy older results',
      });
      if (!confirmed || !dataStatus.isConnected) return;

      await restoreStore({
        storage: storage,
        locks: navigator.locks,
        storageKey: storageKey,
        raw: raw,
        expectedRaw: expectedRaw,
        replace: expectedRaw !== null,
      });
      location.reload();
    } catch (error) {
      if (dataStatus.isConnected) {
        dataStatus.textContent = 'Older results were not copied. ' + error.message;
      }
    }
  });

  legacyRemove.addEventListener('click', async function () {
    try {
      const expectedRaw = storage.getItem(STORAGE_KEY);
      if (expectedRaw === null) {
        throw new Error('There is no older copy to remove.');
      }

      const confirmed = await confirmDialog({
        title: 'Remove the older copy?',
        message:
          'This permanently removes the unprotected copy shared by older versions of both sites. Copy the older results first if you want to keep them. Current site data and downloaded files stay.',
        action: 'Remove older copy',
      });
      if (!confirmed || !dataStatus.isConnected) return;

      await removeLegacy({ storage: storage, locks: navigator.locks, expectedRaw: expectedRaw });
      legacyCopy.hidden = true;
      legacyRemove.hidden = true;
      dataStatus.textContent = 'The older shared copy was removed.';
    } catch (error) {
      if (dataStatus.isConnected) {
        dataStatus.textContent = 'The older copy was not removed. ' + error.message;
      }
    }
  });

  main.querySelector('#reset-settings').addEventListener('click', async function () {
    const confirmed = await confirmDialog({
      title: 'Reset display settings?',
      message:
        'This will reset text, colors and controls. Your results and device labels will stay.',
      action: 'Reset settings',
    });
    if (!confirmed) return;
    if (!form.isConnected) return;

    settings = Object.assign({}, DEFAULT_SETTINGS);
    applySettings(settings);

    let message = 'Settings reset.';
    try {
      await save(function (current) {
        current.settings = Object.assign({}, DEFAULT_SETTINGS);
        return current;
      });
    } catch {
      message = 'Reset for this visit. Could not save this change.';
    }
    if (!form.isConnected) return;

    // redraw the page so the form shows the defaults again
    main.innerHTML = settingsPage();
    bindSettings();
    main.querySelector('#settings-status').textContent = message;
    main.querySelector('#reset-settings').focus();
  });
}

// these metrics are whole numbers so don't show decimals for them
const WHOLE_NUMBER_METRICS = [
  'hitCount',
  'missCount',
  'successfulDrops',
  'dropAttempts',
  'scorePoints',
  'matchedPairs',
  'pairAttempts',
];

function formatMetric(value, key) {
  if (value === null || value === undefined) {
    return 'Not enough data';
  }

  let unit = '';
  if (metrics[key] && metrics[key].unit !== undefined && metrics[key].unit !== null) {
    unit = metrics[key].unit;
  }

  let decimals = 2;
  if (WHOLE_NUMBER_METRICS.includes(key)) {
    decimals = 0;
  }
  const formatted = Number(value).toLocaleString(undefined, { maximumFractionDigits: decimals });

  if (unit === '%') {
    return formatted + '%';
  }
  if (unit) {
    return formatted + ' ' + unit;
  }
  return formatted;
}

// which extra numbers to show under the main score for each game
const RESULT_DETAILS = {
  trace: ['coveragePct', 'meanDistancePctWidth', 'completionSeconds'],
  tap: ['hitCount', 'missCount', 'tapsPerSecond'],
  aim: ['hitCount', 'missCount', 'completionSeconds'],
  hold: ['timeInsidePct', 'observedDriftPctWidth', 'outsideSurfaceSeconds'],
  sequence: ['hitCount', 'missCount', 'completionSeconds'],
  memory: ['matchedPairs', 'pairAttempts', 'completionSeconds'],
  choice: ['hitCount', 'missCount', 'completionSeconds'],
};

function showResult(panel, activity, payload, practice) {
  const result = panel.querySelector('#game-result');
  result.hidden = false;
  result.innerHTML =
    '<p class="eyebrow result-label"></p>' +
    '<p class="result-score"></p>' +
    '<p class="result-explanation"></p>' +
    '<p class="result-comparison"></p>' +
    '<dl class="metric-grid"></dl>';

  let label = 'Accuracy';
  if (activity.accuracyLabel !== undefined && activity.accuracyLabel !== null) {
    label = activity.accuracyLabel;
  }
  result.querySelector('.result-label').textContent = label;

  const accuracy = payload.metrics.accuracyPct;
  if (accuracy === null) {
    result.querySelector('.result-score').textContent = '-';
    result.querySelector('.result-explanation').textContent =
      'There were no attempts, so accuracy could not be calculated.';
  } else {
    result.querySelector('.result-score').textContent = Number(accuracy).toFixed(1) + '%';
    result.querySelector('.result-explanation').textContent = activity.accuracyDescription;
  }

  if (Number.isFinite(payload.metrics.scorePoints)) {
    const points = document.createElement('p');
    points.className = 'result-points';
    const pointsLabel = document.createElement('span');
    pointsLabel.className = 'result-points-label';
    pointsLabel.textContent = 'Your score';
    points.append(
      pointsLabel,
      document.createTextNode(payload.metrics.scorePoints.toLocaleString() + ' points'),
    );
    result.querySelector('.result-label').before(points);
  }

  let keys = RESULT_DETAILS[activity.id];
  if (keys === undefined || keys === null) {
    keys = Object.keys(payload.metrics).filter(function (key) {
      return key !== 'accuracyPct' && key !== 'scorePoints';
    });
  }

  const details = result.querySelector('dl');
  for (const key of keys) {
    if (!(key in payload.metrics)) continue;
    const group = document.createElement('div');
    const term = document.createElement('dt');
    if (metrics[key] && metrics[key].label !== undefined && metrics[key].label !== null) {
      term.textContent = metrics[key].label;
    } else {
      term.textContent = key;
    }
    const value = document.createElement('dd');
    value.textContent = formatMetric(payload.metrics[key], key);
    group.append(term, value);
    details.append(group);
  }

  if (practice) {
    panel.querySelector('#save-status').textContent =
      'Practice finished. This result was not saved.';
  } else {
    panel.querySelector('#save-status').textContent = 'Saving your result...';
  }
}

function bindActivity(activityId) {
  const activity = activityById(activityId);
  const form = main.querySelector('#setup-form');
  const ready = main.querySelector('#ready-panel');
  const area = main.querySelector('#practice-area');
  const startButton = main.querySelector('#start-practice');
  const practiceButton = main.querySelector('#start-unscored');

  let runner = null;
  let active = false;
  let disposed = false;
  let attempt = 0;
  let inputType = capabilities().hasFinePointer ? 'mouse' : 'touch';
  let pendingResult = null;
  let resultSave = null;

  // box at the top that shows routine progress
  const routineNotice = document.createElement('section');
  routineNotice.className = 'card routine-game-notice';
  routineNotice.setAttribute('aria-label', 'Routine progress');
  main.querySelector('.activity-intro').after(routineNotice);

  function updateRoutineNotice() {
    routineNotice.replaceChildren();
    const step = currentRoutineStep(store);
    routineNotice.hidden = !step || step.complete;
    if (!step || step.complete) return;

    const title = document.createElement('p');
    title.className = 'routine-game-title';
    title.textContent = step.title + ' - Game ' + (step.stepIndex + 1) + ' of ' + step.totalSteps;

    const copy = document.createElement('p');
    if (step.activityId === activityId) {
      copy.textContent =
        'Finish and save this game to complete this step. Practice does not count.';
    } else {
      copy.textContent =
        'Your next routine game is ' +
        activityById(step.activityId).name +
        '. This game will not complete that step.';
    }

    const link = document.createElement('a');
    link.href = '#/routines';
    link.textContent = 'View routine';
    routineNotice.append(title, copy, link);
  }

  updateRoutineNotice();

  async function confirmLeaveResult(message, action) {
    return await confirmDialog({
      title: 'Leave the unsaved result?',
      message: message,
      action: action,
    });
  }

  beforeLeave = async function () {
    if (resultSave) {
      await resultSave;
    }
    if (!pendingResult) {
      return true;
    }
    return await confirmLeaveResult(
      'Download this result first if you want to keep it.',
      'Leave this page',
    );
  };

  form.elements.hand.value = store.setup.hand;
  const savedDevice = store.devices.find((device) => device.id === store.setup.deviceId);
  if (savedDevice && savedDevice.label !== undefined && savedDevice.label !== null) {
    form.elements.deviceLabel.value = savedDevice.label;
  } else {
    form.elements.deviceLabel.value = '';
  }

  const handLabels = {
    right: 'Right hand',
    left: 'Left hand',
    both: 'Both hands',
    unspecified: 'Hand not specified',
  };

  function deviceLabelValue() {
    const label = form.elements.deviceLabel.value.trim();
    if (label) {
      return label;
    }
    return 'This device';
  }

  function updateSummary() {
    let text = handLabels[form.elements.hand.value] + ' - ' + deviceLabelValue();
    if (settings.largerTargets) {
      text += ' - Larger targets';
    }
    main.querySelector('#setup-summary').textContent = text;
  }

  updateSummary();

  capabilityChanged = function () {
    const supported = supportsActivity(activityId, capabilities());
    startButton.disabled = !supported;
    if (practiceButton) {
      practiceButton.disabled = !supported;
    }
    main.querySelector('#pointer-message').hidden = supported;
  };

  function setupSnapshot() {
    const label = deviceLabelValue();
    let device = store.devices.find((item) => item.label === label);
    if (device === undefined || device === null) {
      device = { id: createResultId(), label: label };
    }
    return {
      hand: form.elements.hand.value,
      device: device,
      assisted: Boolean(form.elements.operator) && form.elements.operator.value === 'caregiver',
    };
  }

  async function remember(snapshot) {
    const next = await save(function (current) {
      let device = current.devices.find((item) => item.label === snapshot.device.label);
      if (!device) {
        device = snapshot.device;
        current.devices.push(device);
      }
      current.setup = { hand: snapshot.hand, deviceId: device.id };
      return current;
    });
    snapshot.device = next.devices.find((item) => item.id === next.setup.deviceId);
  }

  form.addEventListener('change', async function () {
    updateSummary();
    const status = main.querySelector('#setup-status');
    try {
      await remember(setupSnapshot());
      status.textContent = 'Setup saved.';
    } catch {
      status.textContent = 'Using this setup for this visit.';
    }
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
  });

  // read aloud
  const speechStatus = main.querySelector('#speech-status');
  const stopSpeech = main.querySelector('#stop-reading');
  const readButton = main.querySelector('#read-instructions');

  readButton.addEventListener('click', function () {
    const text = activity.name + '. ' + activity.instructions.join(' ');
    const supported = readInstructions(text, function () {
      if (disposed) return;
      if (document.activeElement === stopSpeech) {
        main.querySelector('#read-instructions').focus();
      }
      stopSpeech.hidden = true;
      speechStatus.textContent = 'Finished reading.';
    });
    stopSpeech.hidden = !supported;
    if (supported) {
      speechStatus.textContent = 'Reading instructions.';
    } else {
      speechStatus.textContent = 'Read aloud is not available. The instructions are shown above.';
    }
  });

  stopSpeech.addEventListener('click', function () {
    stopReading();
    stopSpeech.hidden = true;
    speechStatus.textContent = 'Reading stopped.';
    main.querySelector('#read-instructions').focus();
  });

  function offerDownload(result, panel) {
    if (panel.querySelector('[data-result-download]')) return;
    const button = document.createElement('button');
    button.dataset.resultDownload = 'true';
    button.type = 'button';
    button.className = 'button button-outline';
    button.textContent = 'Download this result';
    button.addEventListener('click', async function () {
      const ok = await showShareWarning({
        kind: 'result file',
        includeNotes: Boolean(result.notes),
      });
      if (ok) {
        download(
          JSON.stringify(result, null, 2),
          'traceback-result-' + result.createdAt.slice(0, 10) + '.json',
        );
      }
    });
    panel.querySelector('#practice-end-actions').append(button);
  }

  function showComparison(result, savedResult, baseline) {
    const comparison = area.querySelector('.result-comparison');
    if (baseline && savedResult.id === baseline.id) {
      comparison.textContent = 'This is your first saved result for this setup.';
      return;
    }
    if (
      !baseline ||
      !Number.isFinite(baseline.metrics.accuracyPct) ||
      !Number.isFinite(result.metrics.accuracyPct)
    ) {
      return;
    }
    const difference = result.metrics.accuracyPct - baseline.metrics.accuracyPct;
    if (Math.abs(difference) < 0.05) {
      comparison.textContent = 'Accuracy is the same as your first result.';
    } else {
      const direction = difference > 0 ? 'higher' : 'lower';
      comparison.textContent =
        'Accuracy is ' +
        Math.abs(difference).toFixed(1) +
        ' percentage points ' +
        direction +
        ' than your first result.';
    }
  }

  function showRoutineProgress(next, result, routineRun) {
    if (!routineRun || !next.routineSession || next.routineSession.id !== routineRun.sessionId) {
      return;
    }
    const counted = next.routineSession.completed.some(function (step) {
      return step.stepIndex === routineRun.stepIndex && step.resultId === result.id;
    });
    if (!counted) return;

    const step = currentRoutineStep(next);
    const message = document.createElement('p');
    message.className = 'routine-result-message';
    if (step.complete) {
      message.textContent = 'Routine finished. You completed all ' + step.totalSteps + ' games.';
    } else {
      message.textContent = 'Routine step saved. Next: ' + activityById(step.activityId).name + '.';
    }
    area.querySelector('#game-result').append(message);

    const nextButton = document.createElement('button');
    nextButton.type = 'button';
    nextButton.className = 'button';
    nextButton.id = 'routine-next-game';
    nextButton.textContent = step.complete ? 'View routine' : 'Next routine game';
    nextButton.addEventListener('click', openRoutineStep);
    area.querySelector('#practice-end-actions').prepend(nextButton);
  }

  async function saveCompleted(result, snapshot, runId, routineRun = null) {
    try {
      const next = await save(function (current) {
        let device = current.devices.find((item) => item.id === snapshot.device.id);
        if (!device) {
          device = current.devices.find((item) => item.label === snapshot.device.label);
          if (device === undefined || device === null) {
            device = snapshot.device;
          }
          const alreadyThere = current.devices.some((item) => item.id === device.id);
          if (!alreadyThere) {
            current.devices.push(device);
          }
        }
        result.context.deviceId = device.id;
        const updated = appendCompletedResult(current, result);
        if (routineRun) {
          return advanceRoutine(
            updated,
            Object.assign({}, routineRun, { resultId: result.id, activityId: activityId }),
          );
        }
        return updated;
      });

      // the user may have left or started another game while this was saving
      if (disposed || runId !== attempt) return;

      const savedResult = next.results.find((item) => item.id === result.id);
      const series = next.baselineSeries.find((item) => item.id === savedResult.seriesId);
      const baseline = next.results.find((item) => series && item.id === series.baselineResultId);

      area.querySelector('#save-status').textContent =
        'Saved. You can find this result in your weekly report.';
      showComparison(result, savedResult, baseline);

      const reportLink = document.createElement('a');
      reportLink.className = 'button button-outline';
      reportLink.href = '#/report';
      reportLink.textContent = 'Weekly report';
      area.querySelector('#practice-end-actions').append(reportLink);

      pendingResult = null;
      updateRoutineNotice();
      showRoutineProgress(next, result, routineRun);
    } catch {
      if (disposed || runId !== attempt) return;

      area.querySelector('#save-status').textContent =
        'This result was not saved. Download a copy before leaving this page.';
      offerDownload(result, area);

      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'button button-outline';
      retry.textContent = 'Try saving again';
      retry.addEventListener(
        'click',
        function () {
          retry.remove();
          resultSave = saveCompleted(result, snapshot, runId, routineRun);
        },
        { once: true },
      );
      area.querySelector('#practice-end-actions').append(retry);
    }
  }

  function headingFor(state, practice) {
    if (state === 'completed') {
      return practice ? 'Practice finished' : 'Game finished';
    }
    if (state === 'stopped') {
      return 'Game stopped';
    }
    return 'Game stopped';
  }

  async function start(practice = false) {
    if (active || disposed || !supportsActivity(activityId, capabilities())) return;
    if (resultSave) {
      await resultSave;
    }
    if (active || disposed) return;

    if (pendingResult) {
      const leave = await confirmLeaveResult(
        'Download the result first if you want to keep it.',
        'Start another game',
      );
      if (!leave) return;
    }
    if (active || disposed) return;
    pendingResult = null;

    active = true;

    // remember which routine step this game was started for (practice never counts)
    const stepAtStart = currentRoutineStep(store);
    let routineRun = null;
    if (
      !practice &&
      stepAtStart &&
      !stepAtStart.complete &&
      stepAtStart.activityId === activityId
    ) {
      routineRun = { sessionId: stepAtStart.sessionId, stepIndex: stepAtStart.stepIndex };
    }

    startButton.disabled = true;
    if (practiceButton) {
      practiceButton.disabled = true;
    }

    const snapshot = setupSnapshot();
    try {
      await remember(snapshot);
    } catch {
      // the game can still run, and we offer a download if saving fails later
    }
    if (disposed) {
      active = false;
      return;
    }

    if (runner) {
      runner.dispose();
    }
    stopReading();
    ready.hidden = true;
    area.hidden = false;
    area.innerHTML = practiceMarkup(
      activityId,
      settings.largerTargets,
      snapshot.assisted,
      practice,
    );

    const surface = area.querySelector('.practice-surface');
    area.scrollIntoView({ block: 'start' });
    surface.focus({ preventScroll: true });

    let measured = surface;
    if (activityId === 'trace') {
      const svg = surface.querySelector('svg');
      if (svg) {
        measured = svg;
      }
    }
    const rect = measured.getBoundingClientRect();

    attempt++;
    const runId = attempt;
    const createdAt = new Date().toISOString();
    const context = {
      hand: snapshot.hand,
      deviceId: snapshot.device.id,
      pointerType: activityId === 'hold' ? 'mouse' : inputType,
      surfaceCssWidth: Math.round(rect.width),
      surfaceCssHeight: Math.round(rect.height),
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      dpr: devicePixelRatio || 1,
      fatigue: null,
      caregiverSetupHelp: settings.caregiverMode,
      assistedInput: snapshot.assisted,
      caregiverProvidedInput: snapshot.assisted,
    };

    runner = mountActivity({
      activityId: activityId,
      panel: area,
      largerTargets: settings.largerTargets,
      pointerType: context.pointerType,
      onEnd: function (state, payload) {
        active = false;
        capabilityChanged();
        const completed = state === 'completed';

        area.querySelector('#practice-heading').textContent = headingFor(state, practice);
        if (completed) {
          area.querySelector('#practice-status').textContent = 'Your result is below.';
        } else {
          area.querySelector('#practice-status').textContent =
            'This game did not finish. No result was saved.';
        }
        area.querySelector('#practice-timer').textContent = '';
        area.querySelector('#stop-practice').hidden = true;
        area.querySelector('#finish-practice').hidden = true;
        area.querySelector('#practice-end-actions').hidden = false;
        surface.inert = true;
        surface.removeAttribute('tabindex');
        surface.hidden = true;
        area.querySelector('#practice-feedback').hidden = true;
        area.querySelector('.practice-controls').hidden = true;

        if (completed) {
          showResult(area, activity, payload, practice);
          if (!practice) {
            let pointerType = payload.pointerType;
            if (pointerType === undefined || pointerType === null) {
              pointerType = context.pointerType;
            }
            const result = {
              id: createResultId(),
              activityId: activityId,
              protocolVersion: activity.protocolVersion,
              metricVersion: activity.metricVersion,
              createdAt: createdAt,
              durationMs: payload.durationMs,
              status: 'complete',
              context: Object.assign({}, context, { pointerType: pointerType }),
              config: {
                pathId: activityId === 'trace' ? 'spiral-v' + activity.protocolVersion : null,
                targetSizeMode: settings.largerTargets ? 'larger' : 'standard',
              },
              metrics: payload.metrics,
              quality: payload.quality,
              notes: '',
              isDemo: false,
            };
            pendingResult = result;
            resultSave = saveCompleted(result, snapshot, runId, routineRun);
          }
        }

        area.scrollIntoView({ block: 'start' });
        area.querySelector('#practice-heading').focus({ preventScroll: true });
      },
    });

    area.querySelector('#stop-practice').addEventListener(
      'click',
      function () {
        runner.stop();
      },
      { once: true },
    );

    area.querySelector('#practice-again').addEventListener('click', function () {
      start(practice);
    });

    area.querySelector('#change-setup').addEventListener('click', async function () {
      if (resultSave) {
        await resultSave;
      }
      if (pendingResult) {
        const leave = await confirmLeaveResult(
          'Download the result first if you want to keep it.',
          'Change setup',
        );
        if (!leave) return;
      }
      pendingResult = null;
      if (runner) {
        runner.dispose();
      }
      area.hidden = true;
      ready.hidden = false;
      main.querySelector('#setup-options').open = true;
      startButton.focus();
    });
  }

  // remember what kind of pointer pressed the start button
  const buttons = [startButton];
  if (practiceButton) {
    buttons.push(practiceButton);
  }
  for (const button of buttons) {
    button.addEventListener('pointerdown', function (event) {
      if (event.isPrimary && POINTER_TYPES.includes(event.pointerType)) {
        inputType = event.pointerType;
      }
    });
  }

  startButton.addEventListener('click', function () {
    start(false);
  });
  if (practiceButton) {
    practiceButton.addEventListener('click', function () {
      start(true);
    });
  }

  function onBeforeUnload(event) {
    if (pendingResult) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
  window.addEventListener('beforeunload', onBeforeUnload);

  return function () {
    disposed = true;
    if (runner) {
      runner.dispose();
    }
    stopReading();
    capabilityChanged = function () {};
    beforeLeave = async function () {
      return true;
    };
    window.removeEventListener('beforeunload', onBeforeUnload);
    if (active) {
      storageStatus.textContent = 'The game was stopped when you left. No result was saved.';
    }
  };
}

// keep in sync when another tab changes the saved data
window.addEventListener('storage', function (event) {
  if (event.key !== storageKey && event.key !== null) return;

  // A tab can observe saved data created elsewhere before making its own write.
  // Use the event snapshot because later writes/deletions may already be queued.
  if (
    event.key === storageKey &&
    (typeof event.newValue === 'string' || typeof event.oldValue === 'string')
  ) {
    previouslySaved = true;
  }

  if (event.newValue === null && previouslySaved) {
    dataRemoved = true;
    storageStatus.textContent = REMOVED_MESSAGE;
  }

  const latest = readStore(storage, storageKey);
  if (latest.ok) {
    store = latest.store;
    if (reportRefresh) {
      reportRefresh();
    }
  }
  if (dataRemoved) return;

  if (latest.ok) {
    storageStatus.textContent =
      'Saved data changed in another tab. Reload to update your settings.';
  } else {
    storageStatus.textContent = 'Saved data could not be read. It has not been changed.';
  }
});

function renderPage(route) {
  reportRefresh = null;
  beforeLeave = async function () {
    return true;
  };

  let title;
  let cleanup;

  switch (route.page) {
    case 'home':
      title = 'Home';
      main.innerHTML = homePage(capabilities());
      break;

    case 'activities':
      title = 'Games';
      main.innerHTML = libraryPage(capabilities());
      break;

    case 'activity':
      title = activityById(route.activityId).name;
      main.innerHTML = activityPage(route.activityId, settings, capabilities());
      cleanup = bindActivity(route.activityId);
      break;

    case 'progress':
    case 'report':
      title = route.page === 'progress' ? 'Your results' : 'Weekly report';
      reportRefresh = function () {
        const earlier = readStore(storage);
        const currentIds = new Set(store.results.map((result) => result.id));
        const earlierResultsCount = earlier.ok
          ? earlier.store.results.filter((result) => !currentIds.has(result.id)).length
          : 0;
        return renderHistoryPage(main, {
          store: store,
          mode: route.page,
          download: function (filename, text, type) {
            download(text, filename, type);
          },
          confirmShare: showShareWarning,
          earlierResultsCount: earlierResultsCount,
        });
      };
      reportRefresh();
      break;

    case 'settings':
      title = 'Settings';
      main.innerHTML = settingsPage();
      bindSettings();
      break;

    case 'routines':
      title = 'Routines';
      cleanup = bindRoutines();
      break;

    case 'information':
      title = 'Brain injury information';
      main.innerHTML = informationPage();
      bindInformation(main);
      break;

    case 'about':
      title = 'About TraceBack';
      main.innerHTML = aboutPage();
      break;

    default:
      title = 'Page not found';
      main.innerHTML =
        '<div class="page-intro"><h1>Page not found</h1><p>This page is not available.</p></div>' +
        '<a class="button" href="#/home">Go to home</a>';
  }

  return { title: title, cleanup: cleanup };
}

createRouter(renderPage, {
  beforeLeave: function () {
    return beforeLeave();
  },
});
