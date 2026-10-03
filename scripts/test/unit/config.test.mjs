import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stripZiggy, loadConfig, assertZineConfigSync } from '../../lib/config.mjs';

function siteConfig() {
  return {
    site: {
      host_url: 'https://example.test',
      locales: [{
        code: 'en',
        name: 'English',
        site_title: 'Notizine',
        content_dir_path: 'content/en',
        output_prefix_override: '',
      }],
    },
  };
}

function zineConfig(locale = siteConfig().site.locales[0]) {
  return `.zine_version = "0.13.0",
.site = .multilingual(.{
    .host_url = "https://example.test",
    .i18n_dir_path = "i18n",
    .layouts_dir_path = "layouts",
    .assets_dir_path = "assets",
    .locales = [
        .{
            .code = "${locale.code}",
            .name = "${locale.name}",
            .site_title = "${locale.site_title}",
            .content_dir_path = "${locale.content_dir_path}",
            .output_prefix_override = "${locale.output_prefix_override}",
        },
    ],
}),
`;
}

function fixtureRoot({ zine }) {
  const root = mkdtempSync(join(tmpdir(), 'notizine-cfg-'));
  writeFileSync(join(root, 'zine.ziggy'), zine);
  return root;
}

test('stripZiggy removes comments and trailing commas', () => {
  const raw = '{\n  // c\n  "a": 1, // x\n  "b": [1, 2,],\n}';
  assert.deepEqual(JSON.parse(stripZiggy(raw)), { a: 1, b: [1, 2] });
});

test('loadConfig fails without theme', () => {
  const root = mkdtempSync(join(tmpdir(), 'notizine-cfg-empty-'));
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'assets', 'notizine.ziggy'), '{\n}');
  assert.throws(() => loadConfig(root, {}), /theme/);
});

test('loadConfig migrates root and legacy overrides with one migration warning', () => {
  const root = mkdtempSync(join(tmpdir(), 'notizine-cfg-layout-'));
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'assets', 'notizine.ziggy'), JSON.stringify({
    theme: 'nord-default',
    site: {
      host_url: 'https://example.test',
      locales: [{ code: 'en', name: 'English', site_title: 'Notizine', content_dir_path: 'content/en' }],
    },
    layout: { columns: ['12rem', '1fr', '12rem'], rows: ['auto', '1fr', 'auto'], gap: '1rem' },
    slots: { left: [['_explorer']], center: [['_content', '_recents']] },
    slots_overrides: { '/search/': { center: [['search']] } },
  }));
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = message => warnings.push(message);
  try {
    const config = loadConfig(root, {});
    assert.deepEqual(config.slots.middle_left, [[{ module: '_explorer', legacyZone: 'left' }]]);
    assert.deepEqual(config.slots.middle_center, [[{ module: '_recents', legacyZone: 'center' }]]);
    assert.deepEqual(config.slots_overrides['/search/'].middle_center, [[{ module: 'search', legacyZone: 'center' }]]);
    assert.deepEqual(warnings, [
      '[config] legacy seven-zone slots were migrated to the 3×3 grid',
      '[config] _content is implicit and was removed from slots',
    ]);
  } finally {
    console.warn = originalWarn;
  }
});

test('stripZiggy keeps // inside string values', () => {
  const raw = '{\n  "host_url": "https://example.com",\n  "b": [1, 2,],\n}';
  assert.deepEqual(JSON.parse(stripZiggy(raw)), { host_url: 'https://example.com', b: [1, 2] });
});

test('stripZiggy removes block comments across lines', () => {
  const raw = '{\n  /* c1\n  c2 */\n  "a": 1,\n}';
  assert.deepEqual(JSON.parse(stripZiggy(raw)), { a: 1 });
});

test('assertZineConfigSync reports host URL drift without writing', () => {
  const root = fixtureRoot({ zine: zineConfig().replace('https://example.test', 'https://old.test') });
  const before = readFileSync(join(root, 'zine.ziggy'), 'utf8');

  assert.throws(() => assertZineConfigSync(siteConfig(), root), /config: zine\.ziggy drift: host_url/);
  assert.equal(readFileSync(join(root, 'zine.ziggy'), 'utf8'), before);
});

test('assertZineConfigSync reports locale code drift without writing', () => {
  const locale = { ...siteConfig().site.locales[0], code: 'old-en' };
  const root = fixtureRoot({ zine: zineConfig(locale) });
  const before = readFileSync(join(root, 'zine.ziggy'), 'utf8');

  assert.throws(() => assertZineConfigSync(siteConfig(), root), /config: zine\.ziggy drift: locale "en"\.code/);
  assert.equal(readFileSync(join(root, 'zine.ziggy'), 'utf8'), before);
});

for (const [field, oldValue] of [
  ['name', 'Old English'],
  ['site_title', 'Old Notizine'],
  ['content_dir_path', 'content/old'],
  ['output_prefix_override', 'old'],
]) {
  test(`assertZineConfigSync reports locale ${field} drift without writing`, () => {
    const locale = { ...siteConfig().site.locales[0], [field]: oldValue };
    const root = fixtureRoot({ zine: zineConfig(locale) });
    const before = readFileSync(join(root, 'zine.ziggy'), 'utf8');

    assert.throws(
      () => assertZineConfigSync(siteConfig(), root),
      new RegExp(`config: zine\\.ziggy drift: locale "en"\\.${field}`),
    );
    assert.equal(readFileSync(join(root, 'zine.ziggy'), 'utf8'), before);
  });
}
