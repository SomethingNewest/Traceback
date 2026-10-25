import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../styles/tokens.css', import.meta.url), 'utf8');
const palettes = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]+)\}/g)].map(
  ([, selector, body]) => ({
    selector: selector.trim(),
    tokens: Object.fromEntries(
      [...body.matchAll(/--([\w-]+):\s*(#[\da-f]{3,6})\s*;/gi)].map(([, key, value]) => [
        key,
        value,
      ]),
    ),
  }),
);
function luminance(hex) {
  const full =
    hex.length === 4
      ? hex
          .slice(1)
          .split('')
          .map((c) => c + c)
          .join('')
      : hex.slice(1);
  const linear = full
    .match(/../g)
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

for (const palette of palettes)
  test(`${palette.selector}: text and essential control contrast`, () => {
    const t = palette.tokens;
    for (const bg of ['page', 'surface', 'tint'])
      for (const fg of ['text', 'muted', 'primary'])
        assert.ok(contrast(t[fg], t[bg]) >= 4.5, `${fg}/${bg}`);
    assert.ok(contrast(t['on-primary'], t.primary) >= 4.5, 'button label');
    for (const bg of ['page', 'surface', 'tint'])
      assert.ok(contrast(t['control-border'], t[bg]) >= 3, `control border/${bg}`);
    for (const bg of ['page', 'surface', 'tint'])
      assert.ok(contrast(t.focus, t[bg]) >= 3, `focus ring/${bg}`);
  });

// Resolve the token rules using their attribute matches and specificity, so a
// dark color scheme cannot accidentally defeat the stronger-contrast setting.
function resolvedTokens(attributes) {
  const values = {};
  const priority = {};
  for (const [order, palette] of palettes.entries()) {
    const required = [...palette.selector.matchAll(/\[([\w-]+)="([^"]+)"\]/g)];
    if (!required.every(([, key, value]) => attributes[key] === value)) continue;
    const specificity = (palette.selector.replace(/:where\([^)]*\)/g, '').match(/\[/g) ?? [])
      .length;
    for (const [key, value] of Object.entries(palette.tokens)) {
      if (
        !priority[key] ||
        specificity > priority[key].specificity ||
        (specificity === priority[key].specificity && order > priority[key].order)
      ) {
        values[key] = value;
        priority[key] = { specificity, order };
      }
    }
  }
  return values;
}

for (const theme of ['light', 'dark'])
  for (const scheme of ['lavender', 'ocean', 'forest', 'warm']) {
    test(`${scheme} ${theme}: effective colors retain contrast and stronger contrast takes priority`, () => {
      const attributes = { 'data-theme': theme, 'data-color-scheme': scheme };
      const colors = resolvedTokens(attributes);
      for (const bg of ['page', 'surface', 'tint']) {
        for (const fg of ['text', 'muted', 'primary'])
          assert.ok(contrast(colors[fg], colors[bg]) >= 4.5, `${fg}/${bg}`);
        assert.ok(contrast(colors['control-border'], colors[bg]) >= 3, `control border/${bg}`);
      }
      const stronger = resolvedTokens({ ...attributes, 'data-high-contrast': 'true' });
      const standardStronger = resolvedTokens({
        'data-theme': theme,
        'data-color-scheme': 'lavender',
        'data-high-contrast': 'true',
      });
      assert.deepEqual(stronger, standardStronger);
      assert.ok(contrast(stronger.text, stronger.surface) >= 20);
    });
  }
