import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { renderZones, bundleClient, v2Slots } from '../../lib/render.mjs';
import { discoverModules, resolveSlots } from '../../lib/modules.mjs';

const API_URL = new URL('../../lib/api.mjs', import.meta.url).href;

function page(locale, link, extra = {}) {
  return {
    locale,
    link,
    filePath: null,
    title: '',
    description: '',
    date: '',
    moddate: '',
    tags: [],
    isSection: false,
    parentLink: null,
    wordcount: 0,
    readtime: 1,
    ...extra,
  };
}

function writeModule(root, name, files) {
  const dir = join(root, 'modules', name);
  mkdirSync(dir, { recursive: true });
  for (const [file, content] of Object.entries(files)) {
    writeFileSync(join(dir, file), content);
  }
}

test('renderZones writes zone html per page and valid slots.json', async () => {
  const root = '/tmp/opencode/notizine-render-basic';
  mkdirSync(root, { recursive: true });
  writeModule(root, 'echo', {
    'module.ziggy': '.name = "echo"',
    'generator.mjs':
      "export default async ({ page, params, i18n }) =>" +
      " '<p data-i=\"' + i18n('title') + '\">' + params.id + ':' + page.link + '</p>';",
  });
  const config = {
    site: { locales: [{ code: 'en', output_prefix_override: '' }] },
    slots_overrides: {},
    slots: { left: [['echo']] },
  };
  const modules = discoverModules(root);
  const slots = resolveSlots(config, modules);
  const model = { config, pages: [page('en', '/a/', { title: 'A' }), page('en', '/b/')] };
  const installed = await renderZones(model, { en: k => k }, root, modules, slots);
  assert.deepEqual([...installed], ['echo']);
  const homeHtml = readFileSync(join(root, 'assets', '.cache', 'zones', 'index', 'echo.html'), 'utf-8');
  assert.equal(homeHtml, '<p data-i="title">echo:/</p>');
  assert.equal(
    readFileSync(join(root, 'assets', '.cache', 'zones', 'a', 'echo.html'), 'utf-8'),
    '<p data-i="title">echo:/a/</p>'
  );
  assert.equal(
    readFileSync(join(root, 'assets', '.cache', 'zones', 'b', 'echo.html'), 'utf-8'),
    '<p data-i="title">echo:/b/</p>'
  );
  const manifest = JSON.parse(readFileSync(join(root, 'assets', '.cache', 'zones-manifest.json'), 'utf-8'));
  const row = [{ id: 'echo', file: 'echo.html', align: 'left' }];
  assert.deepEqual(manifest, {
    index: { left: [row] },
    '/a/': { left: [row] },
    '/b/': { left: [row] },
  });
});

test('renderZones wraps missing section error from generator', async () => {
  const root = '/tmp/opencode/notizine-render-section';
  mkdirSync(root, { recursive: true });
  writeModule(root, 'recentsish', {
    'module.ziggy': '.name = "recentsish"',
    'generator.mjs':
      "import { requireSection } from '" + API_URL + "';\n" +
      "export default async ({ site, params }) => requireSection(site, 'en', params.section);",
  });
  const config = {
    site: { locales: [{ code: 'en', output_prefix_override: '' }] },
    slots_overrides: {},
    slots: { left: [[{ module: 'recentsish', id: 'r1', section: '/nope/' }]] },
  };
  const modules = discoverModules(root);
  const slots = resolveSlots(config, modules);
  const model = {
    config,
    pages: [page('en', '/a/'), page('en', '/posts/', { isSection: true })],
  };
  await assert.rejects(
    renderZones(model, { en: k => k }, root, modules, slots),
    /instance "r1" \(recentsish\) on \/a\/: section "\/nope\/" not found/
  );
});

test('renderZones falls back to template.html when no generator', async () => {
  const root = '/tmp/opencode/notizine-render-template';
  mkdirSync(root, { recursive: true });
  writeModule(root, 'plain', {
    'module.ziggy': '.name = "plain"',
    'template.html': '<span>tpl</span>',
  });
  const config = {
    site: { locales: [{ code: 'en', output_prefix_override: '' }] },
    slots_overrides: {},
    slots: { footer: [['plain']] },
  };
  const modules = discoverModules(root);
  const slots = resolveSlots(config, modules);
  const model = { config, pages: [page('en', '/a/')] };
  await renderZones(model, {}, root, modules, slots);
  assert.equal(
    readFileSync(join(root, 'assets', '.cache', 'zones', 'a', 'plain.html'), 'utf-8'),
    '<span>tpl</span>'
  );
  assert.equal(
    readFileSync(join(root, 'assets', '.cache', 'zones', 'index', 'plain.html'), 'utf-8'),
    '<span>tpl</span>'
  );
});

test('bundleClient concatenates installed module clients in order', () => {
  const root = '/tmp/opencode/notizine-render-bundle';
  writeModule(root, 'aa', { 'module.ziggy': '.name = "aa"', 'client.js': 'A;' });
  writeModule(root, 'bb', { 'module.ziggy': '.name = "bb"', 'client.js': 'B;' });
  writeModule(root, 'cc', { 'module.ziggy': '.name = "cc"' });
  bundleClient(new Set(['aa', 'bb']), ['bb', 'aa'], root);
  assert.equal(readFileSync(join(root, 'assets', '.cache', 'all.js'), 'utf-8'), '(function(){\nB;\n})();\n(function(){\nA;\n})();');
});

function captureWarn(fn) {
  const warns = [];
  const orig = console.warn;
  console.warn = msg => warns.push(String(msg));
  try {
    return { result: fn(), warns };
  } finally {
    console.warn = orig;
  }
}

test('v2Slots drops _content and warns', () => {
  const { result, warns } = captureWarn(() =>
    v2Slots({ center: [['_content', { module: 'search' }]] })
  );
  assert.deepEqual(result.center, [[{ module: 'search', id: 'search' }]]);
  assert.ok(warns.includes('[generate] v2: dropping _content (unmigrated)'));
});

test('v2Slots renames cross-zone duplicates deterministically and keeps explicit ids', () => {
  const { result } = captureWarn(() =>
    v2Slots({
      before_main: [['divider']],
      footer: [['divider'], [{ module: 'divider', id: 'keepme' }, 'divider']],
    })
  );
  assert.deepEqual(result.before_main, [[{ module: 'divider', id: 'divider' }]]);
  assert.deepEqual(result.footer[0], [{ module: 'divider', id: 'divider_1' }]);
  assert.deepEqual(result.footer[1], [
    { module: 'divider', id: 'keepme' },
    { module: 'divider', id: 'divider_3' },
  ]);
});

test('v2Slots keeps migrated per-page modules and still drops _content', () => {
  const { result, warns } = captureWarn(() =>
    v2Slots({ before_main: [['_breadcrumbs', '_prev_next', '_content']] })
  );
  assert.deepEqual(result.before_main, [
    [
      { module: '_breadcrumbs', id: '_breadcrumbs' },
      { module: '_prev_next', id: '_prev_next' },
    ],
  ]);
  assert.deepEqual(warns, ['[generate] v2: dropping _content (unmigrated)']);
});
