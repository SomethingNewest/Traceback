import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DRAG_ROUNDS,
  SPIRAL_POINTS,
  isPrimaryActivation,
  withinInterval,
  holdStage,
  movingTargetPosition,
  holdCenterAt,
} from '../js/activities/protocol.js';
import { mountTap } from '../js/activities/tap.js';
import { mountDrag } from '../js/activities/drag.js';
import { mountHold } from '../js/activities/hold.js';
import { mountTrace } from '../js/activities/trace.js';
import { bindSelection } from '../js/activities/extra-protocol.js';
import { scoreMovingHold } from '../js/metrics/scoring.js';

function gameScope(pointerType = 'mouse') {
  const controller = new AbortController(),
    captures = new Set();
  const element = () =>
    Object.assign(new EventTarget(), {
      style: {},
      dataset: {},
      hidden: false,
      textContent: '',
      setAttribute(name, value) {
        this[name] = value;
      },
      append(child) {
        this.children ??= [];
        this.children.push(child);
      },
    });
  const target = element(),
    tile = element(),
    zone = element(),
    circle = element(),
    ink = element(),
    finish = element();
  const surface = element();
  const selectors = {
    '.activity-target': target,
    '.drag-tile': tile,
    '.drop-zone': zone,
    '.hold-circle': circle,
    '.trace-ink': ink,
  };
  surface.querySelector = (selector) => selectors[selector];
  const dimensions = { left: 0, top: 0, width: 480, height: 480 };
  surface.getBoundingClientRect = () => dimensions;
  surface.setPointerCapture = (id) => captures.add(id);
  surface.hasPointerCapture = (id) => captures.has(id);
  surface.releasePointerCapture = (id) => captures.delete(id);
  let time = 0;
  const completions = [];
  const scope = {
    surface,
    panel: { querySelector: () => finish },
    signal: controller.signal,
    largerTargets: false,
    pointerType,
    now: () => time,
    setTime: (value) => {
      time = value;
    },
    status: (text) => {
      scope.lastStatus = text;
    },
    feedback: (text) => {
      scope.lastFeedback = text;
    },
    timer: (text) => {
      scope.lastTimer = text;
    },
    complete: (payload) => {
      completions.push(payload);
      controller.abort();
    },
    interrupt: () => {
      scope.interrupted = true;
      controller.abort();
    },
    completions,
    frame: (callback) => {
      scope.tick = (value) => {
        time = value;
        callback(value);
      };
    },
    target,
    dimensions,
    tile,
    zone,
    ink,
    finish,
    pointer(type = 'pointerdown', overrides = {}) {
      const event = new Event(type, { cancelable: true });
      Object.assign(event, {
        isPrimary: true,
        button: 0,
        pointerType: 'mouse',
        pointerId: 1,
        clientX: 240,
        clientY: 240,
        ...overrides,
      });
      Object.defineProperty(event, 'target', {
        value: { closest: (selector) => (overrides.hit === false ? null : selectors[selector]) },
      });
      surface.dispatchEvent(event);
    },
  };
  return scope;
}

test('complex spiral has four turns, sufficient samples and eight distinct repeatable drag routes', () => {
  assert.equal(SPIRAL_POINTS.length, 1600);
  assert.equal(SPIRAL_POINTS[0].x, 0.56);
  let angle = 0;
  for (let i = 1; i < SPIRAL_POINTS.length; i++) {
    const a = Math.atan2(SPIRAL_POINTS[i - 1].y - 0.5, SPIRAL_POINTS[i - 1].x - 0.5),
      b = Math.atan2(SPIRAL_POINTS[i].y - 0.5, SPIRAL_POINTS[i].x - 0.5);
    angle += ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  }
  assert.ok(Math.abs(angle - Math.PI * 8) < 1e-10);
  assert.ok(Math.abs(SPIRAL_POINTS.at(-1).x - 0.92) < 1e-10);
  assert.equal(DRAG_ROUNDS.length, 8);
  for (const round of DRAG_ROUNDS)
    assert.ok(Math.hypot(round.from.x - round.to.x, round.from.y - round.to.y) > 0.4);
});
test('primary pointer guard rejects concurrent contacts, alternate buttons and changed type', () => {
  const event = { isPrimary: true, button: 0, pointerType: 'mouse' };
  assert.equal(isPrimaryActivation(event), true);
  assert.equal(isPrimaryActivation({ ...event, isPrimary: false }), false);
  assert.equal(isPrimaryActivation({ ...event, button: 2 }), false);
  assert.equal(isPrimaryActivation({ ...event, pointerType: 'touch' }, 'mouse'), false);
});
test('timer includes start and excludes the exact end', () => {
  assert.equal(withinInterval(100, 100), true);
  assert.equal(withinInterval(99, 100), false);
  assert.equal(withinInterval(10099, 100), true);
  assert.equal(withinInterval(10100, 100), false);
});
test('tap counts real primary pointerdowns and misses, excludes duplicate events and late hits', () => {
  const scope = gameScope();
  mountTap(scope);
  scope.pointer('click');
  scope.pointer('pointerdown', { clientX: 20, clientY: 20 });
  scope.pointer('pointerup');
  const center = movingTargetPosition(100, 480, 480, 80);
  scope.setTime(100);
  scope.pointer('pointerdown', { clientX: center.x, clientY: center.y });
  scope.pointer();
  scope.pointer('pointerup');
  scope.pointer('pointerdown', { isPrimary: false });
  scope.pointer('pointerdown', { pointerType: 'touch' });
  scope.setTime(10000);
  scope.pointer();
  scope.tick(10000);
  const result = scope.completions[0];
  assert.equal(result.metrics.hitCount, 1);
  assert.equal(result.metrics.missCount, 1);
  assert.equal(result.metrics.accuracyPct, 50);
  assert.equal(result.durationMs, 10000);
  assert.equal(result.pointerType, 'mouse');
  scope.tick(11000);
  assert.equal(scope.completions.length, 1);
});
test('moving tap target stays in bounds and hit tests the current time rather than a stale DOM target', () => {
  for (const diameter of [80, 112])
    for (let t = 0; t <= 10000; t += 31) {
      const point = movingTargetPosition(t, 320, 320, diameter);
      assert.ok(point.x >= diameter / 2 && point.x <= 320 - diameter / 2);
      assert.ok(point.y >= diameter / 2 && point.y <= 320 - diameter / 2);
    }
  const scope = gameScope();
  mountTap(scope);
  scope.tick(1000);
  assert.notEqual(scope.target.style.left, '240px');
  scope.setTime(2000);
  scope.pointer('pointerdown', { clientX: 240, clientY: 240 });
  scope.pointer('pointerup');
  const center = movingTargetPosition(2000, 480, 480, 80);
  scope.pointer('pointerdown', { hit: false, clientX: center.x, clientY: center.y });
  scope.pointer('pointerup');
  scope.tick(10000);
  assert.equal(scope.completions[0].metrics.hitCount, 1);
  assert.equal(scope.completions[0].metrics.missCount, 1);
});
test('zero tap run completes with no accuracy and the chosen pointer type', () => {
  const scope = gameScope('touch');
  mountTap(scope);
  scope.tick(10000);
  assert.equal(scope.completions[0].metrics.accuracyPct, null);
  assert.equal(scope.completions[0].pointerType, 'touch');
});
test('timed drag repeats routes, counts misses, awards points and finishes at thirty seconds', () => {
  const scope = gameScope();
  mountDrag(scope);
  scope.pointer('click');
  assert.equal(scope.lastFeedback, '0 points - 0 placed - 0 misses');
  const drag = (from, to, move = true) => {
    scope.setTime(scope.now() + 100);
    scope.pointer('pointerdown', { clientX: from.x * 480, clientY: from.y * 480 });
    if (move) scope.pointer('pointermove', { clientX: to.x * 480, clientY: to.y * 480 });
    scope.setTime(scope.now() + 100);
    scope.pointer('pointerup', { clientX: to.x * 480, clientY: to.y * 480 });
  };
  drag(DRAG_ROUNDS[0].from, DRAG_ROUNDS[0].from, false);
  assert.equal(scope.completions.length, 0);
  for (let repeat = 0; repeat < 2; repeat++)
    for (const round of DRAG_ROUNDS) drag(round.from, round.to);
  assert.equal(scope.completions.length, 0);
  assert.match(scope.lastFeedback, /1600 points/);
  drag(DRAG_ROUNDS[0].from, DRAG_ROUNDS[0].from, false);
  assert.match(scope.lastFeedback, /1575 points/);
  scope.tick(30000);
  assert.equal(scope.completions.length, 1);
  assert.equal(scope.completions[0].durationMs, 30000);
  assert.equal(scope.completions[0].metrics.hitCount, 16);
  assert.equal(scope.completions[0].metrics.missCount, 2);
  assert.equal(scope.completions[0].metrics.scorePoints, 1575);
  assert.ok(Math.abs(scope.completions[0].metrics.accuracyPct - 1600 / 18) < 1e-10);
});
test('drag excludes releases at the timer boundary and releases an unfinished capture', () => {
  const scope = gameScope();
  mountDrag(scope);
  const route = DRAG_ROUNDS[0];
  scope.pointer('pointerdown', { clientX: route.from.x * 480, clientY: route.from.y * 480 });
  scope.setTime(29999);
  scope.pointer('pointermove', { clientX: route.to.x * 480, clientY: route.to.y * 480 });
  scope.setTime(30000);
  scope.pointer('pointerup', { clientX: route.to.x * 480, clientY: route.to.y * 480 });
  assert.equal(scope.completions.length, 1);
  assert.equal(scope.completions[0].metrics.scorePoints, 0);
  assert.equal(scope.completions[0].metrics.accuracyPct, null);
  assert.equal(scope.surface.hasPointerCapture(1), false);
  scope.tick(31000);
  assert.equal(scope.completions.length, 1);
});
test('hold readiness resets, starts at exactly 3 seconds and includes outside measurement time', () => {
  let stage = { readyAt: null, startedAt: null };
  stage = holdStage({ ...stage, now: 0, inside: true });
  stage = holdStage({ ...stage, now: 2500, inside: false });
  assert.equal(stage.readyAt, null);
  stage = holdStage({ ...stage, now: 4000, inside: true });
  stage = holdStage({ ...stage, now: 7500, inside: true });
  assert.equal(stage.startedAt, 7000);
  assert.equal(holdStage({ ...stage, now: 17000, inside: false }).state, 'complete');
});
test('moving hold ignores touch/pen and measures stationary and outside cursor time', () => {
  const scope = gameScope();
  mountHold(scope);
  scope.pointer('pointermove', { pointerType: 'touch' });
  scope.tick(3000);
  assert.equal(scope.lastTimer, 'Ready');
  scope.pointer('pointermove', { pointerType: 'pen' });
  scope.tick(4000);
  assert.equal(scope.lastTimer, 'Ready');
  scope.setTime(5000);
  scope.pointer('pointermove');
  scope.tick(8000);
  assert.equal(scope.lastTimer, '10s left');
  scope.setTime(13000);
  scope.pointer('pointerleave', { clientX: 500, clientY: 240 });
  scope.tick(18000);
  assert.equal(scope.completions.length, 1);
  assert.ok(
    scope.completions[0].metrics.accuracyPct > 0 && scope.completions[0].metrics.accuracyPct < 50,
  );
  assert.equal(scope.completions[0].metrics.outsideSurfaceSeconds, 5);
});
test('moving hold starts after static readiness and scores identically across delayed frames', () => {
  const run = (ticks) => {
    const scope = gameScope();
    mountHold(scope);
    scope.pointer('pointermove');
    for (const t of ticks) scope.tick(t);
    return scope;
  };
  const delayed = run([14000]),
    smooth = run(Array.from({ length: 130 }, (_, i) => (i + 1) * 100));
  assert.equal(delayed.completions[0].durationMs, 10000);
  assert.equal(
    delayed.completions[0].metrics.accuracyPct,
    smooth.completions[0].metrics.accuracyPct,
  );
  assert.ok(delayed.completions[0].metrics.accuracyPct < 30);
  const scope = gameScope();
  mountHold(scope);
  scope.pointer('pointermove');
  scope.tick(3000);
  assert.equal(scope.surface.querySelector('.hold-circle').style.left, '240px');
  scope.tick(5000);
  const center = holdCenterAt(2000);
  assert.equal(scope.surface.querySelector('.hold-circle').style.left, `${center.x * 480}px`);
});
test('trace Finish rejects empty/dot input and saves a short aligned section without reaching End', () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'document');
  globalThis.document = { createElementNS: () => ({ setAttribute() {} }) };
  try {
    const scope = gameScope();
    mountTrace(scope);
    scope.finish.dispatchEvent(new Event('click'));
    assert.equal(scope.completions.length, 0);
    assert.match(scope.lastFeedback, /short line/);
    scope.pointer('pointerdown', {
      clientX: SPIRAL_POINTS[0].x * 480,
      clientY: SPIRAL_POINTS[0].y * 480,
    });
    scope.pointer('pointerup', {
      clientX: SPIRAL_POINTS[0].x * 480,
      clientY: SPIRAL_POINTS[0].y * 480,
    });
    scope.finish.dispatchEvent(new Event('click'));
    assert.equal(scope.completions.length, 0);
    scope.pointer('pointerdown', {
      clientX: SPIRAL_POINTS[0].x * 480,
      clientY: SPIRAL_POINTS[0].y * 480,
    });
    for (let i = 1; i < 50; i++) {
      scope.setTime(i * 20);
      scope.pointer('pointermove', {
        clientX: SPIRAL_POINTS[i].x * 480,
        clientY: SPIRAL_POINTS[i].y * 480,
      });
    }
    scope.pointer('pointerup', {
      clientX: SPIRAL_POINTS[49].x * 480,
      clientY: SPIRAL_POINTS[49].y * 480,
    });
    scope.finish.dispatchEvent(new Event('click'));
    assert.equal(scope.completions.length, 1);
    assert.equal(scope.completions[0].metrics.accuracyPct, 100);
    assert.ok(scope.completions[0].metrics.coveragePct < 90);
    scope.finish.dispatchEvent(new Event('click'));
    assert.equal(scope.completions.length, 1);
  } finally {
    if (saved) Object.defineProperty(globalThis, 'document', saved);
    else delete globalThis.document;
  }
});

test('trace records an off-guide line as lower accuracy instead of blocking its start', () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'document');
  globalThis.document = { createElementNS: () => ({ setAttribute() {} }) };
  try {
    const scope = gameScope();
    mountTrace(scope);
    scope.pointer('pointerdown', { clientX: 0, clientY: 0 });
    scope.setTime(100);
    scope.pointer('pointermove', { clientX: 40, clientY: 0 });
    scope.pointer('pointerup', { clientX: 40, clientY: 0 });
    scope.finish.dispatchEvent(new Event('click'));
    assert.equal(scope.completions.length, 1);
    assert.equal(scope.completions[0].metrics.accuracyPct, 0);
  } finally {
    if (saved) Object.defineProperty(globalThis, 'document', saved);
    else delete globalThis.document;
  }
});

test('trace maps pointer coordinates to the visible SVG inside an accessibility border', () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'document');
  globalThis.document = { createElementNS: () => ({ setAttribute() {} }) };
  try {
    const scope = gameScope(),
      originalQuery = scope.surface.querySelector;
    const drawing = { getBoundingClientRect: () => ({ left: 2, top: 2, width: 476, height: 476 }) };
    // Forced-colors mode gives the 480px surface a 2px border on every side.
    scope.surface.querySelector = (selector) =>
      selector === 'svg' ? drawing : originalQuery(selector);
    mountTrace(scope);
    const line = SPIRAL_POINTS.slice(1100, 1250),
      client = (point) => ({ clientX: 2 + point.x * 476, clientY: 2 + point.y * 476 });
    scope.pointer('pointerdown', client(line[0]));
    for (let i = 1; i < line.length; i++) {
      scope.setTime(i * 20);
      scope.pointer('pointermove', client(line[i]));
    }
    scope.pointer('pointerup', client(line.at(-1)));
    scope.finish.dispatchEvent(new Event('click'));
    assert.equal(scope.completions.length, 1);
    assert.equal(scope.completions[0].metrics.accuracyPct, 100);
    assert.ok(scope.completions[0].metrics.meanDistancePctWidth < 1e-10);
  } finally {
    if (saved) Object.defineProperty(globalThis, 'document', saved);
    else delete globalThis.document;
  }
});

test('trace runtime gives partial credit to a nearby line using the comfortable accuracy scale', () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'document');
  globalThis.document = { createElementNS: () => ({ setAttribute() {} }) };
  try {
    const scope = gameScope();
    mountTrace(scope);
    // This line is 7.2px from the guide. It should score below a perfectly
    // aligned section, with useful partial credit for a nearby attempt.
    const line = SPIRAL_POINTS.slice(1200, 1250).map((point) => {
      const radius = Math.hypot(point.x - 0.5, point.y - 0.5);
      return {
        x: point.x + ((point.x - 0.5) / radius) * 0.015,
        y: point.y + ((point.y - 0.5) / radius) * 0.015,
      };
    });
    scope.pointer('pointerdown', { clientX: line[0].x * 480, clientY: line[0].y * 480 });
    for (let i = 1; i < line.length; i++) {
      scope.setTime(i * 20);
      scope.pointer('pointermove', { clientX: line[i].x * 480, clientY: line[i].y * 480 });
    }
    scope.pointer('pointerup', { clientX: line.at(-1).x * 480, clientY: line.at(-1).y * 480 });
    scope.finish.dispatchEvent(new Event('click'));
    assert.equal(scope.completions.length, 1);
    assert.ok(scope.completions[0].metrics.accuracyPct > 65);
    assert.ok(scope.completions[0].metrics.accuracyPct < 85);
    assert.ok(scope.completions[0].metrics.meanDistancePctWidth > 1.4);
  } finally {
    if (saved) Object.defineProperty(globalThis, 'document', saved);
    else delete globalThis.document;
  }
});

test('trace reaching its point limit on a new stroke does not capture the pointer after interruption', () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'document');
  globalThis.document = { createElementNS: () => ({ setAttribute() {} }) };
  try {
    const scope = gameScope();
    mountTrace(scope);
    scope.pointer('pointerdown');
    scope.pointer('pointermove', {
      getCoalescedEvents: () =>
        Array.from({ length: 99997 }, () => ({
          clientX: 240,
          clientY: 240,
        })),
    });
    scope.pointer('pointerup');
    assert.equal(scope.interrupted, undefined);
    assert.equal(scope.surface.hasPointerCapture(1), false);
    scope.pointer('pointerdown');
    assert.equal(scope.interrupted, true);
    assert.equal(scope.surface.hasPointerCapture(1), false);
    assert.equal(scope.completions.length, 0);
  } finally {
    if (saved) Object.defineProperty(globalThis, 'document', saved);
    else delete globalThis.document;
  }
});

test('tap and selection games accept a new contact after cancellation or lost capture', () => {
  for (const event of ['pointercancel', 'lostpointercapture']) {
    const tap = gameScope();
    mountTap(tap);
    const first = movingTargetPosition(0, 480, 480, 80);
    tap.pointer('pointerdown', { clientX: first.x, clientY: first.y });
    tap.pointer(event);
    tap.setTime(100);
    const second = movingTargetPosition(100, 480, 480, 80);
    tap.pointer('pointerdown', { clientX: second.x, clientY: second.y });
    tap.pointer('pointerup');
    tap.tick(10000);
    assert.equal(tap.completions[0].metrics.hitCount, 2, event);
    assert.equal(tap.completions[0].metrics.missCount, 0, event);

    const selection = gameScope();
    let selected = 0;
    bindSelection(selection, '.drag-tile', () => selected++);
    selection.pointer();
    selection.pointer(event);
    selection.pointer();
    selection.pointer('pointerup');
    assert.equal(selected, 2, event);
  }
});

test('a canceled drag resets the tile without recording a drop and allows another attempt', () => {
  for (const event of ['pointercancel', 'lostpointercapture']) {
    const scope = gameScope();
    mountDrag(scope);
    const route = DRAG_ROUNDS[0];
    const from = { clientX: route.from.x * 480, clientY: route.from.y * 480 };
    const to = { clientX: route.to.x * 480, clientY: route.to.y * 480 };
    scope.pointer('pointerdown', from);
    scope.pointer('pointermove', to);
    scope.pointer(event, to);
    scope.pointer('pointerup', to);
    assert.equal(scope.interrupted, undefined, event);
    assert.equal(scope.surface.hasPointerCapture(1), false, event);
    assert.equal(scope.lastFeedback, '0 points - 0 placed - 0 misses', event);
    assert.equal(scope.tile.style.left, `${from.clientX}px`, event);
    assert.equal(scope.zone.dataset.ready, 'false', event);

    scope.setTime(100);
    scope.pointer('pointerdown', from);
    scope.pointer('pointermove', to);
    scope.pointer('pointerup', to);
    scope.tick(30000);
    assert.equal(scope.completions.length, 1, event);
    assert.equal(scope.completions[0].metrics.hitCount, 1, event);
    assert.equal(scope.completions[0].metrics.missCount, 0, event);
    assert.equal(scope.completions[0].metrics.scorePoints, 100, event);
  }
});

test('drag cancellation immediately after resize keeps the restarted tile in the current layout', () => {
  const scope = gameScope();
  mountDrag(scope);
  const route = DRAG_ROUNDS[0];
  scope.pointer('pointerdown', {
    clientX: route.from.x * 480,
    clientY: route.from.y * 480,
  });
  scope.dimensions.width = 320;
  scope.dimensions.height = 320;
  scope.pointer('pointercancel');
  scope.tick(100);
  assert.ok(Math.abs(parseFloat(scope.tile.style.left) - route.from.x * 320) < 1e-10);
  scope.pointer('pointerdown', {
    clientX: route.from.x * 320,
    clientY: route.from.y * 320,
  });
  scope.pointer('pointermove', { clientX: route.to.x * 320, clientY: route.to.y * 320 });
  scope.pointer('pointerup', { clientX: route.to.x * 320, clientY: route.to.y * 320 });
  scope.tick(30000);
  assert.equal(scope.completions[0].metrics.hitCount, 1);
  assert.equal(scope.completions[0].metrics.missCount, 0);
});

test('a canceled trace keeps its existing ink and accepts another stroke and Finish', () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'document');
  globalThis.document = { createElementNS: () => ({ setAttribute() {} }) };
  try {
    for (const event of ['pointercancel', 'lostpointercapture']) {
      const scope = gameScope();
      mountTrace(scope);
      const line = SPIRAL_POINTS.slice(0, 100);
      const client = (point) => ({ clientX: point.x * 480, clientY: point.y * 480 });
      scope.pointer('pointerdown', client(line[0]));
      for (let i = 1; i < 50; i++) {
        scope.setTime(i * 20);
        scope.pointer('pointermove', client(line[i]));
      }
      scope.pointer(event, { clientX: 0, clientY: 0 });
      scope.pointer('pointerup', { clientX: 0, clientY: 0 });
      assert.equal(scope.interrupted, undefined, event);
      assert.equal(scope.surface.hasPointerCapture(1), false, event);
      scope.setTime(1000);
      scope.pointer('pointerdown', client(line[50]));
      for (let i = 51; i < 100; i++) {
        scope.setTime(i * 20);
        scope.pointer('pointermove', client(line[i]));
      }
      scope.pointer('pointerup', client(line.at(-1)));
      scope.finish.dispatchEvent(new Event('click'));
      assert.equal(scope.ink.children.length, 2, event);
      assert.equal(scope.completions.length, 1, event);
      assert.equal(scope.completions[0].metrics.accuracyPct, 100, event);
    }
  } finally {
    if (saved) Object.defineProperty(globalThis, 'document', saved);
    else delete globalThis.document;
  }
});

test('drag and moving ring adapt to resized surfaces while their timers continue', () => {
  const drag = gameScope();
  mountDrag(drag);
  drag.dimensions.width = 320;
  drag.dimensions.height = 320;
  drag.tick(5000);
  const route = DRAG_ROUNDS[0];
  assert.ok(Math.abs(parseFloat(drag.tile.style.left) - route.from.x * 320) < 1e-10);
  assert.ok(Math.abs(parseFloat(drag.zone.style.left) - route.to.x * 320) < 1e-10);
  assert.equal(drag.lastTimer, '25s left');
  drag.pointer('pointerdown', { clientX: route.from.x * 320, clientY: route.from.y * 320 });
  drag.pointer('pointermove', { clientX: route.to.x * 320, clientY: route.to.y * 320 });
  drag.pointer('pointerup', { clientX: route.to.x * 320, clientY: route.to.y * 320 });
  drag.tick(30000);
  assert.equal(drag.completions[0].metrics.hitCount, 1);

  const hold = gameScope();
  mountHold(hold);
  hold.pointer('pointermove');
  hold.tick(3000);
  hold.dimensions.width = 320;
  hold.dimensions.height = 320;
  hold.tick(5000);
  const center = holdCenterAt(2000);
  const circle = hold.surface.querySelector('.hold-circle');
  assert.equal(circle.style.left, `${center.x * 320}px`);
  assert.equal(circle.style.top, `${center.y * 320}px`);
  assert.equal(circle.style.width, `${(32 / 480) * 2 * 320}px`);
  assert.equal(hold.lastTimer, '8s left');
  hold.tick(13000);
  assert.equal(hold.completions.length, 1);
  assert.equal(hold.completions[0].durationMs, 10000);
});

test('resizing or repositioning the ring surface rechecks a stationary cursor before starting', () => {
  for (const geometry of [
    { width: 320, height: 320 },
    { left: 200, top: 200 },
  ]) {
    const scope = gameScope();
    mountHold(scope);
    scope.pointer('pointermove');
    assert.equal(scope.lastTimer, 'Starting in 3');
    Object.assign(scope.dimensions, geometry);
    scope.tick(3000);
    assert.equal(scope.lastTimer, 'Ready');
    assert.equal(scope.completions.length, 0);
    assert.equal(scope.surface.querySelector('.hold-circle').dataset.inside, 'false');

    scope.setTime(4000);
    scope.pointer('pointermove', {
      clientX: scope.dimensions.left + scope.dimensions.width / 2,
      clientY: scope.dimensions.top + scope.dimensions.height / 2,
    });
    scope.tick(7000);
    assert.equal(scope.lastTimer, '10s left');
  }
});

test('ring resize reprojects a stationary cursor only from the geometry change onward', () => {
  const scope = gameScope();
  mountHold(scope);
  scope.pointer('pointermove');
  scope.tick(3000);
  scope.dimensions.width = 960;
  scope.dimensions.height = 960;
  scope.tick(4000);
  assert.equal(scope.lastTimer, '9s left');
  assert.equal(scope.lastFeedback, 'Move back into the circle.');
  scope.tick(13000);
  const expected = scoreMovingHold(
    [
      { x: 0.5, y: 0.5, t: 0, inSurface: true },
      { x: 0.25, y: 0.25, t: 4000, inSurface: true },
    ],
    { start: 3000, durationMs: 10000 },
    { radius: 32 / 480 },
  );
  assert.deepEqual(scope.completions[0].metrics, expected.metrics);
});

function withFocusEnvironment(run) {
  const saved = Object.fromEntries(
    ['window', 'document'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  const window = new EventTarget();
  const document = Object.assign(new EventTarget(), {
    hidden: false,
    createElementNS: () => ({ setAttribute() {} }),
  });
  Object.assign(globalThis, { window, document });
  try {
    run({
      loseFocus(reason) {
        if (reason === 'hidden') {
          document.hidden = true;
          document.dispatchEvent(new Event('visibilitychange'));
        } else {
          window.dispatchEvent(new Event('blur'));
        }
      },
      returnFocus() {
        document.hidden = false;
        document.dispatchEvent(new Event('visibilitychange'));
      },
    });
  } finally {
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test('focus loss clears missed releases without pausing timers or blocking the next selection', () => {
  for (const reason of ['blur', 'hidden']) {
    withFocusEnvironment(({ loseFocus, returnFocus }) => {
      const tap = gameScope();
      mountTap(tap);
      const center = movingTargetPosition(0, 480, 480, 80);
      const client = { clientX: center.x, clientY: center.y };
      tap.pointer('pointerdown', client);
      loseFocus(reason);
      returnFocus();
      tap.setTime(100);
      const next = movingTargetPosition(100, 480, 480, 80);
      tap.pointer('pointerdown', { clientX: next.x, clientY: next.y, pointerId: 2 });
      tap.pointer('pointerup', { pointerId: 2 });
      tap.tick(10000);
      assert.equal(tap.completions[0].metrics.hitCount, 2, reason);

      const selection = gameScope();
      let selected = 0;
      bindSelection(selection, '.drag-tile', () => selected++);
      selection.pointer();
      loseFocus(reason);
      returnFocus();
      selection.pointer('pointerdown', { pointerId: 2 });
      selection.pointer('pointerup', { pointerId: 2 });
      assert.equal(selected, 2, reason);

      const drag = gameScope();
      mountDrag(drag);
      const route = DRAG_ROUNDS[0];
      const from = { clientX: route.from.x * 480, clientY: route.from.y * 480 };
      const to = { clientX: route.to.x * 480, clientY: route.to.y * 480 };
      drag.pointer('pointerdown', from);
      drag.pointer('pointermove', to);
      loseFocus(reason);
      returnFocus();
      drag.pointer('pointermove', { ...to, buttons: 0 });
      assert.equal(drag.lastFeedback, '0 points - 0 placed - 0 misses', reason);
      drag.pointer('pointerdown', from);
      drag.pointer('pointermove', to);
      drag.pointer('pointerup', to);
      drag.tick(30000);
      assert.equal(drag.completions[0].metrics.hitCount, 1, reason);
      assert.equal(drag.completions[0].metrics.missCount, 0, reason);

      const trace = gameScope();
      mountTrace(trace);
      const line = SPIRAL_POINTS.slice(0, 60);
      trace.pointer('pointerdown', { clientX: line[0].x * 480, clientY: line[0].y * 480 });
      for (let i = 1; i < line.length; i++) {
        trace.setTime(i * 20);
        trace.pointer('pointermove', { clientX: line[i].x * 480, clientY: line[i].y * 480 });
      }
      loseFocus(reason);
      returnFocus();
      trace.pointer('pointermove', { clientX: 0, clientY: 0, buttons: 0 });
      trace.finish.dispatchEvent(new Event('click'));
      assert.equal(trace.completions.length, 1, reason);
      assert.equal(trace.completions[0].metrics.accuracyPct, 100, reason);
      assert.equal(trace.surface.hasPointerCapture(1), false, reason);
    });
  }
});

test('ring treats an unknown cursor as outside after focus loss while its timer continues', () => {
  for (const reason of ['blur', 'hidden']) {
    withFocusEnvironment(({ loseFocus, returnFocus }) => {
      const scope = gameScope();
      mountHold(scope);
      scope.pointer('pointermove');
      scope.tick(3000);
      scope.setTime(4000);
      loseFocus(reason);
      scope.dimensions.width = 960;
      scope.dimensions.height = 960;
      scope.tick(5000);
      assert.equal(scope.lastTimer, '8s left', reason);
      assert.equal(scope.surface.querySelector('.hold-circle').dataset.inside, 'false', reason);
      returnFocus();
      scope.setTime(6000);
      const center = holdCenterAt(3000);
      scope.pointer('pointermove', { clientX: center.x * 960, clientY: center.y * 960 });
      assert.equal(scope.lastFeedback, 'Cursor inside', reason);
      scope.tick(13000);
      assert.equal(scope.completions[0].metrics.outsideSurfaceSeconds, 2, reason);
      assert.equal(scope.completions[0].durationMs, 10000, reason);
    });
  }
});

test('mouse or pen moves with no buttons end held gestures before adding ink or scoring a drop', () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'document');
  globalThis.document = { createElementNS: () => ({ setAttribute() {} }) };
  try {
    for (const pointerType of ['mouse', 'pen']) {
      const trace = gameScope(pointerType);
      mountTrace(trace);
      const line = SPIRAL_POINTS.slice(0, 60);
      trace.pointer('pointerdown', {
        pointerType,
        clientX: line[0].x * 480,
        clientY: line[0].y * 480,
      });
      for (let i = 1; i < line.length; i++) {
        trace.setTime(i * 20);
        trace.pointer('pointermove', {
          pointerType,
          buttons: 1,
          clientX: line[i].x * 480,
          clientY: line[i].y * 480,
        });
      }
      trace.pointer('pointermove', { pointerType, clientX: 0, clientY: 0, buttons: 0 });
      trace.finish.dispatchEvent(new Event('click'));
      assert.equal(trace.completions.length, 1, pointerType);
      assert.equal(trace.completions[0].metrics.accuracyPct, 100, pointerType);

      const drag = gameScope(pointerType);
      mountDrag(drag);
      const route = DRAG_ROUNDS[0];
      drag.pointer('pointerdown', {
        pointerType,
        clientX: route.from.x * 480,
        clientY: route.from.y * 480,
      });
      drag.pointer('pointermove', {
        pointerType,
        buttons: 0,
        clientX: route.to.x * 480,
        clientY: route.to.y * 480,
      });
      drag.pointer('pointerup', { pointerType });
      drag.tick(30000);
      assert.equal(drag.completions[0].metrics.accuracyPct, null, pointerType);
      assert.equal(drag.completions[0].metrics.scorePoints, 0, pointerType);
    }
  } finally {
    if (saved) Object.defineProperty(globalThis, 'document', saved);
    else delete globalThis.document;
  }
});
