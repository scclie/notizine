import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadI18n } from '../../lib/i18n.mjs';

test('loadI18n loads locales and falls back to key', () => {
  const root = '/tmp/opencode/notizine-i18n';
  mkdirSync(join(root, 'i18n'), { recursive: true });
  writeFileSync(join(root, 'i18n', 'ru.ziggy'), '{\n  // nav\n  "nav.home": "Главная",\n}');
  writeFileSync(join(root, 'i18n', 'en.ziggy'), '{ "nav.home": "Home" }');
  writeFileSync(join(root, 'i18n', 'readme.md'), 'x');
  const i18n = loadI18n(root);
  assert.equal(i18n.ru('nav.home'), 'Главная');
  assert.equal(i18n.en('nav.home'), 'Home');
  assert.equal(i18n.ru('missing.key'), 'missing.key');
});
