import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyStore } from '../js/data/schema.js';
import { appendCompletedResult } from '../js/data/baselines.js';
import { resultsReportHTML } from '../js/export/report.js';
import { printReportDocument } from '../js/export/print.js';

const now = new Date(2026, 9, 24, 12);

function reportFixture() {
  let store = createEmptyStore();
  store.devices.push(
    { id: 'mouse-a', label: 'Mouse <img src=x onerror="bad()">' },
    { id: 'mouse-b', label: 'Other mouse' },
  );
  const add = (
    id,
    day,
    { activityId = 'tap', deviceId = 'mouse-a', accuracy = 72, note = id, metrics = {} } = {},
  ) => {
    store = appendCompletedResult(
      store,
      {
        id,
        activityId,
        protocolVersion: activityId === 'tap' ? 2 : 1,
        metricVersion: 2,
        createdAt: new Date(2026, 9, day, 12).toISOString(),
        durationMs: 10000,
        status: 'complete',
        context: {
          hand: 'right',
          deviceId,
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
        config: { pathId: null, targetSizeMode: 'standard' },
        metrics: { accuracyPct: accuracy, tapsPerSecond: 2, rhythmCV: 0.37, ...metrics },
        quality: { issues: [] },
        notes: note,
        isDemo: false,
      },
      { createId: () => `series-${id}` },
    );
  };
  add('earlier-starting-point', 1, { accuracy: 55, note: 'EXCLUDED_BASELINE_NOTE' });
  add('outside-range', 10, { note: 'EXCLUDED_OLD_GAME' });
  add('selected-one', 20, { note: 'INCLUDED_FIRST <script>alert("note")</script>' });
  add('selected-two', 24, { accuracy: 77, note: 'INCLUDED_LAST', metrics: { rhythmCV: 0.42 } });
  add('other-setup', 21, { deviceId: 'mouse-b', note: 'EXCLUDED_SETUP' });
  add('other-game', 21, { activityId: 'choice', note: 'EXCLUDED_GAME' });
  add('future-game', 26, { note: 'EXCLUDED_FUTURE' });
  const selected = store.results.find((result) => result.id === 'selected-one');
  for (const [id, overrides] of [
    ['demo', { isDemo: true }],
    ['practice', { isPractice: true }],
    ['unfinished', { status: 'cancelled' }],
  ])
    store.results.push({
      ...structuredClone(selected),
      ...overrides,
      id,
      notes: `EXCLUDED_${id.toUpperCase()}`,
    });
  return { store, comparisonKey: selected.comparisonKey };
}

test('results report exports the selected game, exact setup and date range, retaining the historical starting point', () => {
  const { store, comparisonKey } = reportFixture();
  const html = resultsReportHTML(store, {
    activityId: 'tap',
    comparisonKey,
    timeframe: '7',
    now,
    generatedAt: now,
    includeNotes: true,
  });
  assert.match(html, /Results report/);
  assert.match(html, /2026-10-18 to 2026-10-24/);
  assert.match(html, /Completed games:<\/strong> 2/);
  assert.match(html, /INCLUDED_FIRST/);
  assert.match(html, /INCLUDED_LAST/);
  for (const excluded of [
    'BASELINE_NOTE',
    'OLD_GAME',
    'SETUP',
    'GAME',
    'FUTURE',
    'DEMO',
    'PRACTICE',
    'UNFINISHED',
  ]) {
    assert.ok(
      !html.includes(`EXCLUDED_${excluded}`),
      `${excluded} should not become an exported game`,
    );
  }
  assert.match(html, /Starting point: 55%/);
  assert.match(html, /22 percentage points higher/);
  assert.match(html, /Games played over time/);
  assert.match(html, /Tap accuracy over time/);
  assert.match(html, /Full measurement details/);
  assert.ok(!html.includes('NaN'));
});

test('results report adds a chart for the selected extra measurement without exposing private notes by default', () => {
  const { store, comparisonKey } = reportFixture();
  const options = { activityId: 'tap', comparisonKey, timeframe: '7', now, generatedAt: now };
  const standard = resultsReportHTML(store, options);
  assert.ok(!standard.includes('INCLUDED_FIRST'));
  assert.ok(!standard.includes('Tap rhythm variation over time'));
  const extra = resultsReportHTML(store, { ...options, metricKey: 'rhythmCV' });
  assert.match(extra, /Tap rhythm variation over time/);
  assert.match(extra, /0\.42 CV/);
  assert.match(extra, /Mouse &lt;img src=x onerror=&quot;bad\(\)&quot;&gt;/);
  assert.ok(!extra.includes('<img src=x'));
  const notes = resultsReportHTML(store, { ...options, includeNotes: true });
  assert.match(notes, /INCLUDED_FIRST &lt;script&gt;alert\(&quot;note&quot;\)&lt;\/script&gt;/);
  assert.ok(!notes.includes('<script>alert'));
});

test('results report validates selection inputs and honestly handles an empty selection', () => {
  const { store, comparisonKey } = reportFixture();
  assert.throws(() => resultsReportHTML(store, { activityId: 'unknown', now }), /valid game/);
  assert.throws(() => resultsReportHTML(store, { timeframe: '14', now }), /valid time range/);
  const html = resultsReportHTML(store, {
    activityId: 'choice',
    comparisonKey,
    timeframe: '7',
    now,
    generatedAt: now,
  });
  assert.match(html, /Completed games:<\/strong> 0/);
  assert.match(html, /No saved games in this selection/);
  assert.ok(!html.includes('report-trend-svg'));
  assert.ok(!html.includes('INCLUDED_FIRST'));
});

class Events {
  handlers = new Map();
  addEventListener(name, callback, options = {}) {
    const entries = this.handlers.get(name) ?? [];
    entries.push({ callback, once: options.once });
    this.handlers.set(name, entries);
  }
  async dispatch(name) {
    const entries = [...(this.handlers.get(name) ?? [])];
    this.handlers.set(
      name,
      (this.handlers.get(name) ?? []).filter((entry) => !entry.once),
    );
    await Promise.all(entries.map((entry) => entry.callback()));
  }
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function withPrintDOM(run, { fontsReady = Promise.resolve(), print } = {}) {
  const original = {
    document: globalThis.document,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  };
  const timers = new Map();
  let nextTimer = 0,
    printCalls = 0,
    removeCalls = 0,
    focusCalls = 0;
  const focusOptions = [];
  const previousFocus = {
    isConnected: true,
    focus(options) {
      focusCalls++;
      focusOptions.push(options);
    },
  };
  const view = new Events();
  view.print =
    print ??
    (() => {
      printCalls++;
    });
  const frame = Object.assign(new Events(), {
    style: {},
    attributes: {},
    isConnected: false,
    contentWindow: view,
    contentDocument: { fonts: { ready: fontsReady } },
    setAttribute(key, value) {
      this.attributes[key] = value;
    },
    remove() {
      this.isConnected = false;
      removeCalls++;
    },
  });
  globalThis.document = {
    activeElement: previousFocus,
    createElement(tag) {
      assert.equal(tag, 'iframe');
      return frame;
    },
    body: {
      append(element) {
        assert.equal(element, frame);
        element.isConnected = true;
      },
    },
  };
  globalThis.setTimeout = (callback, delay) => {
    const id = ++nextTimer;
    timers.set(id, { callback, delay });
    return id;
  };
  globalThis.clearTimeout = (id) => timers.delete(id);
  try {
    await run({
      frame,
      view,
      timers,
      previousFocus,
      focusOptions,
      counts: () => ({ printCalls, removeCalls, focusCalls }),
      fireTimer(delay) {
        const entry = [...timers].find(([, timer]) => timer.delay === delay);
        assert.ok(entry, `Expected a ${delay} ms timer`);
        timers.delete(entry[0]);
        entry[1].callback();
      },
    });
  } finally {
    if (original.document === undefined) delete globalThis.document;
    else globalThis.document = original.document;
    globalThis.setTimeout = original.setTimeout;
    globalThis.clearTimeout = original.clearTimeout;
  }
}

test('printing loads the complete report, waits for fonts and cleans up after the dialog closes', async () => {
  const fonts = deferred();
  await withPrintDOM(
    async ({ frame, view, timers, counts, focusOptions }) => {
      const html = '<!doctype html><html><body><svg></svg>Selected results</body></html>';
      const printed = printReportDocument(html);
      assert.equal(frame.srcdoc, html);
      assert.equal(frame.isConnected, true);
      assert.equal(frame.attributes['aria-hidden'], 'true');
      assert.equal(frame.attributes.sandbox, 'allow-same-origin allow-modals');
      assert.equal(frame.tabIndex, -1);
      const loading = frame.dispatch('load');
      assert.equal(counts().printCalls, 0, 'Fonts must finish before opening print');
      fonts.resolve();
      await loading;
      await printed;
      assert.equal(counts().printCalls, 1);
      assert.equal(
        frame.isConnected,
        true,
        'The report remains mounted while the print dialog is open',
      );
      assert.deepEqual(
        [...timers.values()].map((timer) => timer.delay),
        [120000],
      );
      await view.dispatch('afterprint');
      assert.deepEqual(counts(), { printCalls: 1, removeCalls: 1, focusCalls: 1 });
      assert.deepEqual(focusOptions, [{ preventScroll: true }]);
      assert.equal(timers.size, 0);
      await view.dispatch('afterprint');
      assert.equal(counts().removeCalls, 1);
    },
    { fontsReady: fonts.promise },
  );
});

test('unavailable printing rejects with the download fallback and removes the temporary report', async () => {
  await withPrintDOM(async ({ frame, timers, counts }) => {
    frame.contentWindow = null;
    const printed = printReportDocument('<html>Report</html>');
    const rejected = assert.rejects(printed, /Download the report/);
    await frame.dispatch('load');
    await rejected;
    assert.equal(frame.isConnected, false);
    assert.equal(timers.size, 0);
    assert.equal(counts().removeCalls, 1);
  });
});

test('a print exception removes the frame and clears both loading and cleanup timers', async () => {
  await withPrintDOM(
    async ({ frame, timers, counts }) => {
      const printed = printReportDocument('<html>Report</html>');
      const rejected = assert.rejects(printed, /Print service failed/);
      await frame.dispatch('load');
      await rejected;
      assert.equal(frame.isConnected, false);
      assert.equal(timers.size, 0);
      assert.equal(counts().removeCalls, 1);
    },
    {
      print: () => {
        throw new Error('Print service failed');
      },
    },
  );
});

test('a timed-out report cannot print later when its fonts finish loading', async () => {
  const fonts = deferred();
  await withPrintDOM(
    async ({ frame, timers, counts, fireTimer }) => {
      const printed = printReportDocument('<html>Report</html>');
      const rejected = assert.rejects(printed, /print view could not open/);
      const loading = frame.dispatch('load');
      fireTimer(15000);
      await rejected;
      fonts.resolve();
      await loading;
      assert.equal(frame.isConnected, false);
      assert.equal(timers.size, 0);
      assert.deepEqual(counts(), { printCalls: 0, removeCalls: 1, focusCalls: 1 });
    },
    { fontsReady: fonts.promise },
  );
});

test('cleanup still occurs when afterprint is missing and does not focus a departed page', async () => {
  await withPrintDOM(async ({ frame, previousFocus, timers, counts, fireTimer }) => {
    const printed = printReportDocument('<html>Report</html>');
    await frame.dispatch('load');
    await printed;
    previousFocus.isConnected = false;
    fireTimer(120000);
    assert.equal(frame.isConnected, false);
    assert.equal(timers.size, 0);
    assert.deepEqual(counts(), { printCalls: 1, removeCalls: 1, focusCalls: 0 });
  });
});

test('cancelling while report fonts load removes the private frame and prevents late printing', async () => {
  const fonts = deferred();
  await withPrintDOM(
    async ({ frame, timers, counts }) => {
      const controller = new AbortController();
      const printed = printReportDocument('<html>Private report</html>', {
        signal: controller.signal,
      });
      const rejected = assert.rejects(printed, /cancelled/);
      const loading = frame.dispatch('load');
      controller.abort();
      await rejected;
      fonts.resolve();
      await loading;
      assert.equal(frame.isConnected, false);
      assert.equal(timers.size, 0);
      assert.equal(counts().printCalls, 0);
      assert.equal(counts().removeCalls, 1);
    },
    { fontsReady: fonts.promise },
  );
});

test('an already cancelled request cannot create a print frame', async () => {
  await withPrintDOM(async ({ frame, timers }) => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      printReportDocument('<html>Private</html>', { signal: controller.signal }),
      /cancelled/,
    );
    assert.equal(frame.isConnected, false);
    assert.equal(timers.size, 0);
  });
});
