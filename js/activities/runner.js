import { mountTrace } from './trace.js';
import { mountTap } from './tap.js';
import { mountDrag } from './drag.js';
import { mountHold } from './hold.js';
import { mountSequence } from './sequence.js';
import { mountMemory } from './memory.js';
import { mountChoice } from './choice.js';

// Drag & Place still uses the old saved id "aim"
const engines = {
  trace: mountTrace,
  tap: mountTap,
  aim: mountDrag,
  hold: mountHold,
  sequence: mountSequence,
  memory: mountMemory,
  choice: mountChoice,
};

const POINTER_TYPES = ['mouse', 'touch', 'pen'];
const STOPPED_MESSAGE = 'Activity stopped. You can start again.';

function isValidPayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (!payload.metrics || !payload.quality) return false;
  if (!Array.isArray(payload.quality.issues)) return false;

  const accuracy = payload.metrics.accuracyPct;
  if (accuracy !== null) {
    if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100) return false;
  }

  if (!Number.isFinite(payload.durationMs) || payload.durationMs < 0) return false;
  if (!POINTER_TYPES.includes(payload.pointerType)) return false;
  return true;
}

// Runs one game. When it ends, every listener, pointer capture and
// animation frame it set up gets cleaned up.
export function mountActivity({
  activityId,
  panel,
  largerTargets = false,
  pointerType = 'mouse',
  onEnd,
}) {
  const controller = new AbortController();
  const signal = controller.signal;
  const surface = panel.querySelector('.practice-surface');
  const frames = new Set();
  const pointers = new Set();
  let ended = false;

  function release() {
    controller.abort();
    for (const id of frames) {
      cancelAnimationFrame(id);
    }
    frames.clear();
    for (const id of pointers) {
      if (surface.hasPointerCapture && surface.hasPointerCapture(id)) {
        surface.releasePointerCapture(id);
      }
    }
    pointers.clear();
    surface.dataset.active = 'false';
  }

  function end(state, payload) {
    if (ended) return;
    ended = true;
    release();
    onEnd(state, payload);
  }

  function interrupt(message) {
    let text = 'The activity stopped. Start again when you are ready.';
    if (typeof message === 'string') {
      text = message;
    }
    end('interrupted', { message: text });
  }

  function write(selector, value) {
    const element = panel.querySelector(selector);
    if (element && element.textContent !== value) {
      element.textContent = value;
    }
  }

  const scope = {
    panel: panel,
    surface: surface,
    signal: signal,
    largerTargets: largerTargets,
    pointerType: pointerType,
    now: function () {
      return performance.now();
    },
    status: function (value) {
      write('#practice-status', value);
    },
    feedback: function (value) {
      write('#practice-feedback', value);
    },
    timer: function (value) {
      write('#practice-timer', value);
    },
    complete: function (payload) {
      if (!isValidPayload(payload)) {
        interrupt();
        return;
      }
      end('completed', payload);
    },
    interrupt: interrupt,
    frame: function (callback) {
      function schedule() {
        const id = requestAnimationFrame(function () {
          frames.delete(id);
          if (signal.aborted) return;
          try {
            callback(performance.now());
          } catch {
            interrupt();
            return;
          }
          if (!signal.aborted) {
            schedule();
          }
        });
        frames.add(id);
      }
      schedule();
    },
  };

  surface.dataset.active = 'true';
  surface.addEventListener(
    'pointerdown',
    function (event) {
      pointers.add(event.pointerId);
    },
    { signal: signal },
  );
  function forgetPointer(event) {
    pointers.delete(event.pointerId);
  }
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    surface.addEventListener(event, forgetPointer, { signal: signal });
  }

  panel.addEventListener(
    'keydown',
    function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        end('stopped', { message: STOPPED_MESSAGE });
      }
    },
    { signal: signal },
  );

  try {
    if (!engines[activityId] || !POINTER_TYPES.includes(pointerType)) {
      throw new Error('Unsupported activity input.');
    }
    if (activityId === 'hold' && pointerType !== 'mouse') {
      throw new Error('Unsupported activity input.');
    }
    engines[activityId](scope);
  } catch {
    interrupt();
  }

  return {
    stop: function () {
      end('stopped', { message: STOPPED_MESSAGE });
    },
    dispose: function () {
      ended = true;
      release();
    },
  };
}

export const mountPractice = mountActivity;
