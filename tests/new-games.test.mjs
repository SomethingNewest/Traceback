import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreSequence, scoreMemory, scoreChoice } from '../js/metrics/game-scores.js';
import {
  NUMBER_LAYOUT,
  MEMORY_LAYOUT,
  CHOICE_ROUNDS,
  shapeMarkup,
} from '../js/activities/extra-protocol.js';
import { mountSequence } from '../js/activities/sequence.js';
import { mountMemory } from '../js/activities/memory.js';
import { mountChoice } from '../js/activities/choice.js';
import { mountActivity } from '../js/activities/runner.js';
import { activityById } from '../js/activities/registry.js';
import { practiceMarkup, activityPage } from '../js/ui/activity-page.js';

function element(dataset = {}) {
  return Object.assign(new EventTarget(), {
    dataset: { ...dataset },
    style: {},
    disabled: false,
    innerHTML: '',
    textContent: '',
    setAttribute(key, value) {
      this[key] = value;
    },
  });
}
function gameScope(pointerType = 'mouse') {
  const controller = new AbortController();
  const numbers = NUMBER_LAYOUT.map((number) => element({ number: String(number) }));
  const cards = MEMORY_LAYOUT.map((shape, index) =>
    element({ shape, card: String(index + 1), revealed: 'false', matched: 'false' }),
  );
  const choices = [0, 1, 2].map((index) => element({ choice: String(index) })),
    sample = element();
  const surface = element();
  surface.querySelector = (selector) => (selector === '.shape-sample' ? sample : null);
  surface.querySelectorAll = (selector) => (selector === '.shape-choice' ? choices : []);
  surface.getBoundingClientRect = () => ({ width: 480, height: 480 });
  let time = 0;
  const scope = {
    controller,
    signal: controller.signal,
    surface,
    pointerType,
    numbers,
    cards,
    choices,
    sample,
    completions: [],
    now: () => time,
    setTime(value) {
      time = value;
    },
    status(value) {
      this.lastStatus = value;
    },
    feedback(value) {
      this.lastFeedback = value;
    },
    timer(value) {
      this.lastTimer = value;
    },
    complete(payload) {
      this.completions.push(payload);
      controller.abort();
    },
    frame(callback) {
      this.tick = (value) => {
        time = value;
        if (!controller.signal.aborted) callback(value);
      };
    },
    pointer(type, button, overrides = {}) {
      const event = new Event(type, { cancelable: true });
      Object.assign(event, { isPrimary: true, pointerId: 1, pointerType, button: 0, ...overrides });
      Object.defineProperty(event, 'target', { value: { closest: () => button } });
      surface.dispatchEvent(event);
    },
    select(button, overrides = {}) {
      this.pointer('pointerdown', button, overrides);
      this.pointer('pointerup', button, overrides);
    },
  };
  return scope;
}

test('new protocols contain six unique numbers, three shape pairs and ten balanced choices', () => {
  assert.deepEqual([...NUMBER_LAYOUT].sort(), [1, 2, 3, 4, 5, 6]);
  for (const shape of new Set(MEMORY_LAYOUT))
    assert.equal(MEMORY_LAYOUT.filter((item) => item === shape).length, 2);
  assert.equal(CHOICE_ROUNDS.length, 10);
  for (const round of CHOICE_ROUNDS) {
    assert.equal(new Set(round.choices).size, 3);
    assert.ok(round.choices.includes(round.sample));
  }
  assert.match(shapeMarkup('triangle'), /Triangle/);
  assert.throws(() => shapeMarkup('<script>'), /Unknown shape/);
});

test('new game scoring keeps accuracy, pair attempts and points distinct', () => {
  const sequence = scoreSequence({ hits: 6, attempts: 8, durationMs: 12500 });
  assert.equal(sequence.metrics.accuracyPct, 75);
  assert.equal(sequence.metrics.missCount, 2);
  assert.equal(sequence.metrics.completionSeconds, 12.5);
  assert.equal(sequence.validity.valid, true);
  const memory = scoreMemory({ matchedPairs: 3, pairAttempts: 5, durationMs: 20000 });
  assert.equal(memory.metrics.accuracyPct, 60);
  assert.equal(memory.metrics.pairAttempts, 5);
  assert.equal(
    scoreMemory({ matchedPairs: 2, pairAttempts: 5, durationMs: 20000 }).validity.valid,
    false,
  );
  const choice = scoreChoice({ correct: 7, rounds: 10, durationMs: 15000 });
  assert.equal(choice.metrics.scorePoints, 700);
  assert.equal(choice.metrics.accuracyPct, 70);
  assert.equal(choice.metrics.missCount, 3);
  assert.equal(scoreSequence({ hits: 0, attempts: 0, durationMs: 0 }).metrics.accuracyPct, null);
  assert.equal(scoreChoice({ correct: 0, rounds: 10, durationMs: 100 }).metrics.accuracyPct, 0);
  for (const args of [
    { hits: 6, attempts: 5, durationMs: 100 },
    { hits: NaN, attempts: 8, durationMs: 100 },
    { hits: 6, attempts: 8, durationMs: Infinity },
  ])
    assert.throws(() => scoreSequence(args));
  assert.throws(() => scoreMemory({ matchedPairs: 4, pairAttempts: 5, durationMs: 100 }));
  assert.throws(() => scoreChoice({ correct: 11, rounds: 10, durationMs: 100 }));
});

test('Number Trail requires correct order, ignores secondary contacts and completes exactly once', () => {
  const scope = gameScope('touch');
  mountSequence(scope);
  const number = (value) => scope.numbers.find((button) => Number(button.dataset.number) === value);
  scope.select(number(4));
  scope.select(number(1), { isPrimary: false });
  scope.select(number(1), { pointerType: 'mouse' });
  scope.select(number(1), { button: 2 });
  assert.equal(number(1).disabled, false);
  scope.pointer('pointerdown', number(1));
  scope.pointer('pointerdown', number(2));
  scope.pointer('pointerup', number(1));
  assert.equal(number(1).disabled, true);
  assert.equal(number(2).disabled, false);
  scope.select(number(1)); // Found numbers cannot create misses.
  for (let value = 2; value <= 6; value++) {
    scope.setTime(value * 1000);
    scope.select(number(value));
  }
  assert.equal(scope.completions.length, 1);
  assert.equal(scope.completions[0].metrics.hitCount, 6);
  assert.equal(scope.completions[0].metrics.missCount, 1);
  assert.ok(Math.abs(scope.completions[0].metrics.accuracyPct - 600 / 7) < 1e-10);
  assert.equal(scope.completions[0].pointerType, 'touch');
  scope.select(number(6));
  assert.equal(scope.completions.length, 1);
});

test('Match Pairs locks a mismatch for 900ms, rejects the same card, and counts pair attempts', () => {
  const scope = gameScope();
  mountMemory(scope);
  scope.select(scope.cards[0]);
  scope.select(scope.cards[0]);
  assert.match(scope.lastStatus, /one more/);
  scope.select(scope.cards[1]);
  assert.equal(scope.cards[0].dataset.revealed, 'true');
  scope.select(scope.cards[5]);
  assert.equal(scope.cards[5].dataset.revealed, 'false');
  scope.tick(899);
  assert.equal(scope.cards[0].dataset.revealed, 'true');
  scope.tick(900);
  assert.equal(scope.cards[0].dataset.revealed, 'false');
  assert.equal(scope.cards[1].dataset.revealed, 'false');
  for (const pair of [
    [0, 5],
    [1, 3],
    [2, 4],
  ]) {
    scope.setTime(scope.now() + 1000);
    scope.select(scope.cards[pair[0]]);
    scope.select(scope.cards[pair[1]]);
  }
  assert.equal(scope.completions.length, 1);
  assert.equal(scope.completions[0].metrics.matchedPairs, 3);
  assert.equal(scope.completions[0].metrics.pairAttempts, 4);
  assert.equal(scope.completions[0].metrics.accuracyPct, 75);
  assert.ok(scope.cards.every((card) => card.disabled && card.dataset.matched === 'true'));
  scope.tick(10000);
  assert.equal(scope.completions.length, 1);
});

test('Shape Pick advances after every choice and awards 100 points only for a correct match', () => {
  const scope = gameScope('pen');
  mountChoice(scope);
  assert.match(scope.sample.innerHTML, /Circle/);
  for (let round = 0; round < 10; round++) {
    const config = CHOICE_ROUNDS[round];
    const button = scope.choices.find(
      (choice) => (choice.dataset.shape === config.sample) === (round % 2 === 0),
    );
    scope.setTime(round * 1000 + 100);
    scope.select(button);
  }
  assert.equal(scope.completions.length, 1);
  const payload = scope.completions[0];
  assert.equal(payload.metrics.scorePoints, 500);
  assert.equal(payload.metrics.accuracyPct, 50);
  assert.equal(payload.metrics.hitCount, 5);
  assert.equal(payload.metrics.missCount, 5);
  assert.equal(payload.pointerType, 'pen');
  scope.select(scope.choices[0]);
  assert.equal(scope.completions.length, 1);
});

test('new game markup supplies readable shape names, larger targets and correct ready durations', () => {
  for (const id of ['sequence', 'memory', 'choice']) {
    const markup = practiceMarkup(id, true, false);
    assert.match(markup, /data-larger-targets="true"/);
    assert.doesNotMatch(markup, /undefined/);
    const ready = activityPage(id, { simplifiedInstructions: true }, { hasFinePointer: true });
    assert.ok(ready.includes(activityById(id).duration));
    assert.equal(activityById(id).protocolVersion, 1);
    assert.equal(activityById(id).metricVersion, 2);
  }
  assert.match(practiceMarkup('memory', false, false), /Triangle/);
  assert.match(practiceMarkup('trace', false, false), /class="trace-label"/);
});

test('Shape Pick has its sample and all three labeled choices before measuring the game surface', () => {
  const markup = practiceMarkup('choice', false, false);
  assert.match(markup, /class="shape-sample"[^>]*aria-label="Find the circle\."[^>]*><svg/);
  assert.equal((markup.match(/class="shape-word"/g) ?? []).length, 4);
  assert.equal((markup.match(/>Circle<\/span>/g) ?? []).length, 2);
  assert.equal((markup.match(/>Square<\/span>/g) ?? []).length, 1);
  assert.equal((markup.match(/>Triangle<\/span>/g) ?? []).length, 1);
  for (const shape of ['circle', 'square', 'triangle']) {
    assert.match(
      markup,
      new RegExp(
        `class="shape-choice"[^>]*data-shape="${shape}"[^>]*aria-label="${shape}"[^>]*><svg`,
      ),
    );
  }
});

test('stopping Match Pairs during its reveal cancels frames and selection listeners', () => {
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
  const scope = gameScope(),
    panel = element(),
    frames = new Map();
  let nextFrame = 0;
  panel.querySelector = (selector) =>
    selector === '.practice-surface' ? scope.surface : element();
  try {
    Object.assign(globalThis, {
      window: new EventTarget(),
      document: Object.assign(new EventTarget(), { hidden: false }),
      requestAnimationFrame: (callback) => {
        frames.set(++nextFrame, callback);
        return nextFrame;
      },
      cancelAnimationFrame: (id) => frames.delete(id),
      ResizeObserver: undefined,
    });
    Object.defineProperty(globalThis, 'performance', {
      configurable: true,
      value: { now: () => 0 },
    });
    const endings = [];
    const runner = mountActivity({
      activityId: 'memory',
      panel,
      pointerType: 'mouse',
      onEnd: (...args) => endings.push(args),
    });
    scope.select(scope.cards[0]);
    scope.select(scope.cards[1]);
    assert.equal(scope.cards[0].dataset.revealed, 'true');
    assert.equal(frames.size, 1);
    runner.stop();
    runner.stop();
    assert.equal(frames.size, 0);
    assert.equal(endings.length, 1);
    assert.equal(endings[0][0], 'stopped');
    assert.equal(endings[0][1].metrics, undefined);
    scope.select(scope.cards[2]);
    assert.equal(scope.cards[2].dataset.revealed, 'false');
  } finally {
    for (const [key, descriptor] of Object.entries(saved))
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
  }
});
