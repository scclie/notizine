import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { stripZiggy, loadConfig, checkZineConfigSync } from '../../lib/config.mjs';

test('stripZiggy removes comments and trailing commas', () => {
  const raw = '{\n  // c\n  "a": 1, // x\n  "b": [1, 2,],\n}';
  assert.deepEqual(JSON.parse(stripZiggy(raw)), { a: 1, b: [1, 2] });
});

test('loadConfig fails without theme', () => {
  const root = '/tmp/opencode/notizine-cfg-empty';
  mkdirSync(root, { recursive: true });
  mkdirSync(`${root}/assets`, { recursive: true });
  writeFileSync(`${root}/assets/notizine.ziggy`, '{\n}');
  assert.throws(() => loadConfig(root, {}), /theme/);
});

test('checkZineConfigSync throws on host drift', () => {
  const cfg = { site: { host_url: 'https://a', locales: [{ code: 'en' }] } };
  const root = '/tmp/opencode/notizine-cfg-zine';
  mkdirSync(root, { recursive: true });
  writeFileSync(`${root}/zine.ziggy`, '.host_url = "https://b",');
  assert.throws(() => checkZineConfigSync(cfg, root), /drift/);
});

test('stripZiggy keeps // inside string values', () => {
  const raw = '{\n  "host_url": "https://example.com",\n  "b": [1, 2,],\n}';
  assert.deepEqual(JSON.parse(stripZiggy(raw)), { host_url: 'https://example.com', b: [1, 2] });
});

test('stripZiggy removes block comments across lines', () => {
  const raw = '{\n  /* c1\n  c2 */\n  "a": 1,\n}';
  assert.deepEqual(JSON.parse(stripZiggy(raw)), { a: 1 });
});

test('checkZineConfigSync throws on locale drift', () => {
  const cfg = { site: { host_url: 'https://a', locales: [{ code: 'en' }] } };
  const root = '/tmp/opencode/notizine-cfg-locales';
  mkdirSync(root, { recursive: true });
  writeFileSync(`${root}/zine.ziggy`, '.host_url = "https://a", .locales = [.{ .code = "en" }, .{ .code = "fr" }],');
  assert.throws(() => checkZineConfigSync(cfg, root), /locale/);
});
