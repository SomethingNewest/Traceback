import test from 'node:test';
import assert from 'node:assert/strict';
import { mountPractice, mountActivity } from '../js/activities/runner.js';

function environment() {
  const saved = Object.fromEntries(
    [
      'window',
      'document',
      'performance',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'ResizeObserver',
    ].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  const window = new EventTarget();
  const document = new EventTarget();
  document.hidden = false;
  const frames = new Map();
  let nextFrame = 0;
  let resize;
  const surface = new EventTarget();
  surface.dataset = {};
  const dimensions = { width: 480, height: 480, left: 0, top: 0 };
  surface.getBoundingClientRect = () => dimensions;
  const target = { style: {}, dataset: {} };
  surface.querySelector = (selector) => (selector === '.activity-target' ? target : null);
  const outputs = {};
  let time = 0;
  const panel = new EventTarget();
  panel.querySelector = (selector) =>
    selector === '.practice-surface' ? surface : (outputs[selector] ??= { textContent: '' });
  Object.assign(globalThis, {
    window,
    document,
    requestAnimationFrame: (callback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    ResizeObserver: class {
      constructor(callback) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  });
  Object.defineProperty(globalThis, 'performance', {
    configurable: true,
    value: { now: () => time },
  });
  return {
    window,
    document,
    surface,
    panel,
    dimensions,
    frames,
    setTime: (value) => {
      time = value;
    },
    resize: () => resize?.(),
    restore() {
      for (const [key, descriptor] of Object.entries(saved)) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    },
  };
}

test('Stop ends practice once and cancels animation callbacks and interruption listeners', () => {
  const env = environment();
  try {
    const endings = [];
    const runner = mountPractice({
      activityId: 'tap',
      panel: env.panel,
      largerTargets: false,
      onEnd: (...args) => endings.push(args),
    });
    assert.equal(env.frames.size, 1);
    runner.stop();
    runner.stop();
    env.window.dispatchEvent(new Event('blur'));
    assert.equal(endings.length, 1);
    assert.equal(endings[0][0], 'stopped');
    assert.equal(env.frames.size, 0);
    assert.equal(env.surface.dataset.active, 'false');
  } finally {
    env.restore();
  }
});
test('hidden document, blur, resize and pointer cancellation do not pause or end a timed game', () => {
  for (const event of ['hidden', 'blur', 'resize', 'pointercancel']) {
    const env = environment();
    try {
      const endings = [];
      const runner = mountPractice({
        activityId: 'tap',
        panel: env.panel,
        largerTargets: false,
        onEnd: (...args) => endings.push(args),
      });
      if (event === 'hidden') {
        env.document.hidden = true;
        env.document.dispatchEvent(new Event('visibilitychange'));
      } else (event === 'pointercancel' ? env.surface : env.window).dispatchEvent(new Event(event));
      assert.equal(endings.length, 0, event);
      assert.equal(env.frames.size, 1, event);
      assert.equal(env.surface.dataset.active, 'true', event);
      const [id, callback] = env.frames.entries().next().value;
      env.setTime(10000);
      env.frames.delete(id);
      callback();
      assert.equal(endings.length, 1, event);
      assert.equal(endings[0][0], 'completed', event);
      assert.equal(endings[0][1].durationMs, 10000, event);
      assert.equal(env.frames.size, 0, event);
      runner.stop();
      assert.equal(endings.length, 1, event);
    } finally {
      env.restore();
    }
  }
});
test('surface resizing keeps the target in its new bounds and leaves the game active', () => {
  const env = environment();
  try {
    const endings = [];
    const runner = mountPractice({
      activityId: 'tap',
      panel: env.panel,
      largerTargets: false,
      onEnd: (...args) => endings.push(args),
    });
    env.resize();
    assert.equal(endings.length, 0);
    env.dimensions.width = 320;
    env.dimensions.height = 320;
    env.resize();
    const [id, callback] = env.frames.entries().next().value;
    env.setTime(5000);
    env.frames.delete(id);
    callback();
    const target = env.surface.querySelector('.activity-target');
    assert.ok(parseFloat(target.style.left) >= 40 && parseFloat(target.style.left) <= 280);
    assert.ok(parseFloat(target.style.top) >= 40 && parseFloat(target.style.top) <= 280);
    assert.equal(endings.length, 0);
    assert.equal(env.frames.size, 1);
    runner.stop();
  } finally {
    env.restore();
  }
});

test('a trace SVG size change does not stop the drawing', () => {
  const env = environment();
  try {
    const endings = [],
      drawingSize = { width: 476, height: 476 };
    const drawing = { getBoundingClientRect: () => drawingSize };
    env.surface.querySelector = (selector) =>
      selector === 'svg' ? drawing : selector === '.trace-ink' ? { append() {} } : null;
    const originalQuery = env.panel.querySelector;
    const finish = new EventTarget();
    env.panel.querySelector = (selector) =>
      selector === '#finish-practice' ? finish : originalQuery(selector);
    const runner = mountActivity({
      activityId: 'trace',
      panel: env.panel,
      onEnd: (...args) => endings.push(args),
    });
    env.resize();
    assert.equal(endings.length, 0);
    drawingSize.width = 470;
    env.resize();
    assert.equal(env.dimensions.width, 480);
    assert.equal(endings.length, 0);
    assert.equal(env.surface.dataset.active, 'true');
    runner.stop();
  } finally {
    env.restore();
  }
});
test('route cleanup disposes a run without leaving timers or callbacks active', () => {
  const env = environment();
  try {
    const endings = [];
    const runner = mountPractice({
      activityId: 'tap',
      panel: env.panel,
      largerTargets: false,
      onEnd: (...args) => endings.push(args),
    });
    runner.dispose();
    env.window.dispatchEvent(new Event('blur'));
    assert.equal(env.frames.size, 0);
    assert.equal(endings.length, 0);
  } finally {
    env.restore();
  }
});
test('completed timer returns one measured payload and cannot be saved again by a late frame or Stop', () => {
  const env = environment();
  try {
    const endings = [];
    const runner = mountActivity({
      activityId: 'tap',
      pointerType: 'touch',
      panel: env.panel,
      onEnd: (...args) => endings.push(args),
    });
    const [id, callback] = env.frames.entries().next().value;
    env.setTime(10001);
    env.frames.delete(id);
    callback(0);
    callback(performance.now() + 10002);
    runner.stop();
    env.window.dispatchEvent(new Event('blur'));
    assert.equal(endings.length, 1);
    assert.equal(endings[0][0], 'completed');
    const payload = endings[0][1];
    assert.equal(payload.durationMs, 10000);
    assert.equal(payload.pointerType, 'touch');
    assert.equal(payload.metrics.accuracyPct, null);
    assert.equal(payload.metrics.hitCount, 0);
    assert.ok(Array.isArray(payload.quality.issues));
    assert.equal(env.frames.size, 0);
  } finally {
    env.restore();
  }
});
test('invalid activity or touch Hold fails without a score or remaining callbacks', () => {
  for (const options of [
    { activityId: 'unknown', pointerType: 'mouse' },
    { activityId: 'hold', pointerType: 'touch' },
  ]) {
    const env = environment();
    try {
      const endings = [];
      mountActivity({ ...options, panel: env.panel, onEnd: (...args) => endings.push(args) });
      assert.equal(endings.length, 1);
      assert.equal(endings[0][0], 'interrupted');
      assert.equal(endings[0][1].metrics, undefined);
      assert.equal(env.frames.size, 0);
    } finally {
      env.restore();
    }
  }
});
test('Escape stops without metrics and releases held pointer capture', () => {
  const env = environment();
  try {
    const endings = [],
      captured = new Set([4]);
    env.surface.hasPointerCapture = (id) => captured.has(id);
    env.surface.releasePointerCapture = (id) => captured.delete(id);
    mountActivity({ activityId: 'tap', panel: env.panel, onEnd: (...args) => endings.push(args) });
    const pointer = new Event('pointerdown');
    Object.assign(pointer, { pointerId: 4, isPrimary: false });
    env.surface.dispatchEvent(pointer);
    const key = new Event('keydown', { cancelable: true });
    Object.assign(key, { key: 'Escape' });
    env.panel.dispatchEvent(key);
    assert.equal(endings.length, 1);
    assert.equal(endings[0][0], 'stopped');
    assert.equal(endings[0][1].metrics, undefined);
    assert.equal(captured.size, 0);
    assert.equal(env.frames.size, 0);
  } finally {
    env.restore();
  }
});

test('a game frame error interrupts once and cleans up instead of leaving the run active', () => {
  const env = environment();
  try {
    const endings = [];
    const runner = mountActivity({
      activityId: 'tap',
      panel: env.panel,
      onEnd: (...args) => endings.push(args),
    });
    const [id, callback] = env.frames.entries().next().value;
    // Invalid geometry still ends the run safely when a game frame cannot calculate a target.
    env.dimensions.width = 0;
    env.setTime(100);
    env.frames.delete(id);
    assert.doesNotThrow(() => callback());
    assert.equal(endings.length, 1);
    assert.equal(endings[0][0], 'interrupted');
    assert.equal(endings[0][1].metrics, undefined);
    assert.equal(env.frames.size, 0);
    assert.equal(env.surface.dataset.active, 'false');
    callback();
    runner.stop();
    assert.equal(endings.length, 1);
  } finally {
    env.restore();
  }
});
