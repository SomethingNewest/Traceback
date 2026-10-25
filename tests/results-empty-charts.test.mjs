import assert from 'node:assert/strict';
import test from 'node:test';
import { renderTrendChart, renderFrequencyChart } from '../js/ui/charts.js';

function withDOM(action) {
  const previous = globalThis.document;
  function element(tagName) {
    return {
      tagName,
      children: [],
      attributes: {},
      textContent: '',
      append(...items) {
        this.children.push(...items);
      },
      replaceChildren(...items) {
        this.children = items;
      },
      setAttribute(name, value) {
        this.attributes[name] = String(value);
      },
    };
  }
  globalThis.document = {
    createElement: element,
    createElementNS: (_namespace, name) => element(name),
  };
  try {
    action(element('section'));
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
}

function descendants(element) {
  return [element, ...element.children.flatMap(descendants)];
}

function chart(container) {
  const items = descendants(container);
  const svg = items.find((item) => item.tagName === 'svg');
  assert.ok(svg, 'The empty selection keeps its graph frame');
  assert.equal(svg.attributes.role, 'img');
  assert.equal(svg.attributes.viewBox, '0 0 760 260');
  const references = svg.attributes['aria-labelledby'].split(' ');
  for (const id of references) {
    assert.ok(items.some((item) => item.attributes.id === id));
  }
  assert.equal(items.filter((item) => item.tagName === 'circle').length, 0);
  assert.equal(items.filter((item) => item.attributes['data-chart-point']).length, 0);
  assert.ok(items.some((item) => item.textContent.includes('No data is plotted')));
  assert.ok(!JSON.stringify(items).match(/NaN|Infinity|1970|undefined/));
  return { svg, items };
}

test('an empty percentage trend retains its real scale without invented results or dates', () => {
  withDOM((container) => {
    renderTrendChart(container, {
      results: [],
      metricKey: 'accuracyPct',
      metadata: { label: 'Accuracy', unit: '%' },
    });
    const { items } = chart(container);
    assert.match(container.children[0].textContent, /No games with this setup/);
    const ticks = items.filter((item) => /^\d+$/.test(item.textContent));
    assert.deepEqual(
      ticks.map((item) => item.textContent),
      ['100', '75', '50', '25', '0'],
    );
    assert.ok(items.some((item) => item.textContent === 'Accuracy (%)'));
    assert.equal(items.filter((item) => item.tagName === 'line').length, 5);
  });
});

test('an empty measurement trend does not invent a numeric scale or a baseline', () => {
  withDOM((container) => {
    renderTrendChart(container, {
      results: [],
      metricKey: 'tapsPerSecond',
      metadata: { label: 'Taps per second', unit: 'taps/s' },
      baseline: { createdAt: '2026-10-20T12:00:00.000Z', metrics: { tapsPerSecond: 3 } },
    });
    const { items } = chart(container);
    assert.equal(items.filter((item) => /^\d+$/.test(item.textContent)).length, 0);
    assert.equal(
      items.filter((item) => item.attributes.class === 'results-chart-baseline').length,
      0,
    );
    assert.ok(items.some((item) => item.textContent === 'Taps per second'));
  });
});

test('empty activity graphs preserve the explanation first and have no fabricated counts', () => {
  withDOM((container) => {
    const now = new Date(2026, 9, 25, 12);
    for (const timeframe of ['all', '7', '30']) {
      renderFrequencyChart(container, { results: [], timeframe, now });
      const { items } = chart(container);
      assert.equal(container.children[0].textContent, 'No saved games in this time range.');
      assert.equal(items.filter((item) => item.tagName === 'li').length, 0);
      assert.equal(items.filter((item) => /^\d+$/.test(item.textContent)).length, 0);
      assert.ok(items.some((item) => item.textContent === 'Games played'));
    }
  });
});

test('empty chart accessibility references remain unique across charts and rerenders', () => {
  withDOM((container) => {
    const ids = [];
    for (let index = 0; index < 2; index++) {
      renderTrendChart(container, {
        results: [],
        metricKey: 'accuracyPct',
        metadata: { label: 'Accuracy', unit: '%' },
      });
      ids.push(...chart(container).svg.attributes['aria-labelledby'].split(' '));
      renderFrequencyChart(container, { results: [] });
      ids.push(...chart(container).svg.attributes['aria-labelledby'].split(' '));
    }
    assert.equal(new Set(ids).size, ids.length);
  });
});

test('the empty-state explanation remains readable when SVG is unavailable', () => {
  withDOM((container) => {
    delete document.createElementNS;
    renderTrendChart(container, {
      results: [],
      metricKey: 'accuracyPct',
      metadata: { label: 'Accuracy', unit: '%' },
    });
    assert.equal(container.children.length, 1);
    assert.match(container.children[0].textContent, /No games with this setup/);
    renderFrequencyChart(container, { results: [] });
    assert.equal(container.children.length, 1);
    assert.equal(container.children[0].textContent, 'No saved games in this time range.');
  });
});
