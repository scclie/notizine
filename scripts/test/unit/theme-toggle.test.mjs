import { test } from 'node:test';
import assert from 'node:assert/strict';

const loadGen = async name => (await import(new URL(`../../../modules/${name}/generator.mjs`, import.meta.url).href)).default;

test('theme_toggle emits checkbox markup when darkmode enabled', async () => {
  const gen = await loadGen('theme_toggle');
  const site = { config: { features: { darkmode: true } }, pages: [] };
  const html = await gen({ page: {}, site, params: {}, i18n: k => k });
  assert.match(html, /class="theme-toggle"/);
  assert.match(html, /id="theme-dark"/);
  assert.match(html, /<label for="theme-dark" class="theme-dark-label" title="Toggle theme"><\/label>/);
});

test('theme_toggle emits nothing when darkmode disabled or missing', async () => {
  const gen = await loadGen('theme_toggle');
  const off = { config: { features: { darkmode: false } }, pages: [] };
  assert.equal(await gen({ page: {}, site: off, params: {}, i18n: k => k }), '');
  const missing = { config: {}, pages: [] };
  assert.equal(await gen({ page: {}, site: missing, params: {}, i18n: k => k }), '');
});
