import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('security policy applies before scripts and styles are loaded', () => {
  const policyTag = html.match(
    /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"\s*\/>/,
  );
  assert.ok(policyTag, 'The entry document must have a CSP');
  assert.ok(policyTag.index < html.indexOf('<script'));
  assert.ok(policyTag.index < html.indexOf('<link'));
  const policy = Object.fromEntries(
    policyTag[1]
      .split(';')
      .filter((part) => part.trim())
      .map((part) => {
        const [name, ...sources] = part.trim().split(/\s+/);
        return [name, sources];
      }),
  );
  assert.deepEqual(policy['script-src'], ["'self'"]);
  for (const directive of ['connect-src', 'object-src', 'base-uri', 'form-action', 'worker-src']) {
    assert.deepEqual(policy[directive], ["'none'"], `${directive} must be disabled`);
  }
  assert.deepEqual(policy['img-src'], ["'self'", 'data:', 'blob:']);
  assert.deepEqual(policy['font-src'], ["'self'"]);
});

test('entry page uses a same-origin module and does not send a referrer', () => {
  assert.match(html, /<meta name="referrer" content="no-referrer"\s*\/>/);
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  assert.match(scripts[0][1], /type="module"/);
  assert.match(scripts[0][1], /src="\.\/js\/app\.js"/);
  assert.equal(scripts[0][2].trim(), '', 'Inline scripts are forbidden');
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, 'Entry markup must not use inline event handlers');
  assert.doesNotMatch(html, /javascript\s*:/i);
});
