import test from 'node:test';
import assert from 'node:assert/strict';
import { createRouter } from '../js/router.js';

test('disposing the router cancels a navigation waiting for permission to leave', async () => {
  const names = ['window', 'document', 'location', 'history', 'requestAnimationFrame'];
  const previous = Object.fromEntries(
    names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
  );
  const handlers = new Map();
  const rendered = [];
  let release;
  let cleanupCount = 0;
  const region = { textContent: '' };
  const fixture = {
    window: {
      addEventListener(name, callback) {
        handlers.set(name, callback);
      },
      removeEventListener(name) {
        handlers.delete(name);
      },
      scrollTo() {},
    },
    document: {
      querySelectorAll: () => [],
      querySelector: (selector) => (selector === '#announcer' ? region : null),
    },
    location: { hash: '#/home' },
    history: { replaceState() {} },
    requestAnimationFrame: (callback) => callback(),
  };
  for (const [name, value] of Object.entries(fixture))
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  try {
    const dispose = createRouter(
      (route) => {
        rendered.push(route.page);
        return { title: route.page, cleanup: () => cleanupCount++ };
      },
      {
        beforeLeave: () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      },
    );
    location.hash = '#/progress';
    const navigate = handlers.get('hashchange');
    const pending = navigate();
    dispose();
    release(true);
    await pending;
    await navigate();
    assert.deepEqual(rendered, ['home']);
    assert.equal(cleanupCount, 1);
    assert.equal(handlers.has('hashchange'), false);
  } finally {
    for (const name of names) {
      if (previous[name]) Object.defineProperty(globalThis, name, previous[name]);
      else delete globalThis[name];
    }
  }
});
