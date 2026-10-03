import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { renderZones } from '../../lib/render.mjs';
import { buildPageAssets } from '../../lib/module-assets.mjs';
import { normalizeLayoutConfig } from '../../lib/layout.mjs';
import { discoverModules, resolveSlots } from '../../lib/modules.mjs';
import dividerGenerator from '../../../modules/divider/generator.mjs';

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
    slots: { middle_left: [['echo']] },
  };
  const modules = discoverModules(root);
  const slots = resolveSlots(config, modules);
  const model = { config, pages: [page('en', '/a/', { title: 'A' }), page('en', '/b/')] };
  const rendered = await renderZones(model, { en: k => k }, root, modules, slots);
  assert.deepEqual([...rendered.installed], ['echo']);
  assert.deepEqual(rendered.pageInstances, {
    index: [{ module: 'echo', id: 'echo', file: 'echo.html', align: 'left', delivery: 'critical', params: {} }],
    '/a/': [{ module: 'echo', id: 'echo', file: 'echo.html', align: 'left', delivery: 'critical', params: {} }],
    '/b/': [{ module: 'echo', id: 'echo', file: 'echo.html', align: 'left', delivery: 'critical', params: {} }],
  });
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
    index: { middle_left: [row] },
    '/a/': { middle_left: [row] },
    '/b/': { middle_left: [row] },
  });
});

test('renderZones keeps visual grid-cell order for partial overrides and page assets', async () => {
  const root = '/tmp/opencode/notizine-render-effective-order';
  const assetModule = name => ({
    'module.ziggy': `.{ .name = "${name}", .delivery = "critical", .assets = [.{ .source = "client.js", .delivery = "deferred", .output = "/assets/modules/${name}.js" }] }`,
    'client.js': `${name}();`,
  });
  for (const name of ['left', 'center', 'override', 'right']) writeModule(root, name, assetModule(name));
  const config = {
    site: { locales: [{ code: 'en', output_prefix_override: '' }] },
    slots: {
      middle_left: [['left']],
      middle_center: [['center']],
      middle_right: [['right']],
    },
    slots_overrides: {
      '/docs/': { middle_center: [['override']] },
    },
  };
  const modules = discoverModules(root);
  const slots = resolveSlots(config, modules);
  const model = { config, pages: [page('en', '/docs/example/')] };

  const rendered = await renderZones(model, {}, root, modules, slots);
  const instances = rendered.pageInstances['/docs/example/'];
  const assets = buildPageAssets({ pageKey: '/docs/example/', instances, modules, root });

  assert.deepEqual(instances.map(instance => instance.module), ['left', 'override', 'right']);
  assert.equal(
    assets.deferredScripts,
    '<script defer src="/assets/modules/left.js"></script>' +
    '<script defer src="/assets/modules/override.js"></script>' +
    '<script defer src="/assets/modules/right.js"></script>'
  );
});

test('renderZones passes cell and legacy zone to module generators', async () => {
  const root = '/tmp/opencode/notizine-render-generator-context';
  mkdirSync(root, { recursive: true });
  writeModule(root, 'context', {
    'module.ziggy': '.name = "context"',
    'generator.mjs': "export default async ({ cell, legacyZone }) => cell + ':' + legacyZone;",
  });
  const modules = discoverModules(root);
  const slots = {
    zones: {
      top_center: [[{
        module: 'context',
        id: 'context',
        file: 'context.html',
        align: 'left',
        legacyZone: 'before_main',
      }]],
    },
  };
  const model = {
    config: { site: { locales: [{ code: 'en', output_prefix_override: '' }] } },
    pages: [page('en', '/a/')],
  };

  await renderZones(model, {}, root, modules, slots);

  assert.equal(
    readFileSync(join(root, 'assets', '.cache', 'zones', 'a', 'context.html'), 'utf-8'),
    'top_center:before_main'
  );
});

test('divider preserves before_main compatibility without suppressing new top_center dividers', async () => {
  const site = { config: { slots: { header: [] }, slots_overrides: {} } };
  const pageContext = { page: { link: '/' }, site };

  assert.equal(await dividerGenerator({ ...pageContext, legacyZone: 'before_main' }), '');
  assert.match(await dividerGenerator({ ...pageContext, cell: 'top_center' }), /<hr/);
});

test('divider renders a legacy before_main divider when normalized legacy slots include a header', async () => {
  const config = normalizeLayoutConfig({
    layout: { columns: ['auto', '1fr', 'auto'], rows: ['auto', '1fr', 'auto'] },
    slots: {
      header: [['_header']],
      before_main: [['divider']],
    },
  }, { warn: () => {} });
  const divider = config.slots.top_center[1][0];

  assert.equal(divider.legacyZone, 'before_main');
  assert.equal(
    await dividerGenerator({ page: { link: '/' }, site: { config }, legacyZone: divider.legacyZone }),
    '<hr class="divider">'
  );
});

test('divider recognizes a normalized legacy header in a matching override cell', async () => {
  const config = normalizeLayoutConfig({
    layout: { columns: ['auto', '1fr', 'auto'], rows: ['auto', '1fr', 'auto'] },
    slots: {
      header: [],
      before_main: [['divider']],
    },
    slots_overrides: {
      '/docs/': {
        header: [['_header']],
        before_main: [['divider']],
      },
    },
  }, { warn: () => {} });
  const divider = config.slots_overrides['/docs/'].top_center[1][0];

  assert.equal(divider.legacyZone, 'before_main');
  assert.equal(
    await dividerGenerator({ page: { link: '/docs/page/' }, site: { config }, legacyZone: divider.legacyZone }),
    '<hr class="divider">'
  );
});

test('divider ignores a root override for descendants like applyOverrides', async () => {
  const config = normalizeLayoutConfig({
    layout: { columns: ['auto', '1fr', 'auto'], rows: ['auto', '1fr', 'auto'] },
    slots: {
      header: [['_header']],
      before_main: [['divider']],
    },
    slots_overrides: { '/': {} },
  }, { warn: () => {} });
  const divider = config.slots.top_center[1][0];

  assert.equal(divider.legacyZone, 'before_main');
  assert.equal(
    await dividerGenerator({ page: { link: '/docs/page/' }, site: { config }, legacyZone: divider.legacyZone }),
    '<hr class="divider">'
  );
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
    slots: { middle_left: [[{ module: 'recentsish', id: 'r1', section: '/nope/' }]] },
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
    slots: { bottom_center: [['plain']] },
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

test('legacy layout compatibility preserves source zones, removes implicit content, and generates ids', () => {
  const { result: config, warns } = captureWarn(() => normalizeLayoutConfig({
    layout: { columns: ['12rem', '1fr', '12rem'], rows: ['auto', '1fr', 'auto'], gap: '1rem' },
    slots: {
      before_main: [['_content', 'divider', '_breadcrumbs', '_prev_next']],
      footer: [['divider'], [{ module: 'divider', id: 'keepme' }, 'divider']],
    },
  }));
  const modules = {
    divider: { dir: '/m/divider' },
    _breadcrumbs: { dir: '/m/breadcrumbs' },
    _prev_next: { dir: '/m/prev-next' },
  };
  const slots = resolveSlots(config, modules);

  assert.deepEqual(slots.zones.top_center[0], [
    { module: 'divider', legacyZone: 'before_main', id: 'divider', file: 'divider.html', align: 'left' },
    { module: '_breadcrumbs', legacyZone: 'before_main', id: '_breadcrumbs', file: '_breadcrumbs.html', align: 'left' },
    { module: '_prev_next', legacyZone: 'before_main', id: '_prev_next', file: '_prev_next.html', align: 'left' },
  ]);
  assert.deepEqual(slots.zones.bottom_center[0], [
    { module: 'divider', legacyZone: 'footer', id: 'divider_1', file: 'divider_1.html', align: 'left' },
  ]);
  assert.deepEqual(slots.zones.bottom_center[1], [
    { module: 'divider', legacyZone: 'footer', id: 'keepme', file: 'keepme.html', align: 'left' },
    { module: 'divider', legacyZone: 'footer', id: 'divider_3', file: 'divider_3.html', align: 'left' },
  ]);
  assert.deepEqual(warns, [
    '[config] legacy seven-zone slots were migrated to the 3×3 grid',
    '[config] _content is implicit and was removed from slots',
  ]);
});
