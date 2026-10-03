import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { discoverModules, resolveSlots, applyOverrides } from '../../lib/modules.mjs';

function writeModule(root, folder, manifest, files = {}) {
  const dir = join(root, 'modules', folder);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'module.ziggy'), manifest);
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return dir;
}

function counterManifest(extra = '') {
  return `.{
    .name = "counter",
    .type = "dynamic",
    .description = "Counter",
    .delivery = "critical",
    .params = .{
      .count = .{ .type = "integer", .default = 2, .minimum = 1 },
      .mode = .{ .type = "enum", .values = ["up", "down"], .default = "up" },
    },
    ${extra}
  }`;
}

test('discoverModules finds folders with module.ziggy and skips others', () => {
  const root = '/tmp/opencode/notizine-mod-discover';
  mkdirSync(join(root, 'modules', 'alpha'), { recursive: true });
  mkdirSync(join(root, 'modules', 'plain'), { recursive: true });
  writeFileSync(join(root, 'modules', 'alpha', 'module.ziggy'), '.name = "alpha",');
  writeFileSync(join(root, 'modules', 'plain', 'readme.md'), 'x');
  writeFileSync(join(root, 'modules', 'loose.txt'), 'x');
  const mods = discoverModules(root);
  assert.deepEqual(mods.alpha, {
    name: 'alpha', type: 'builtin', description: '', params: {}, delivery: 'critical', assets: [],
    dir: join(root, 'modules', 'alpha'),
  });
  assert.equal(mods.plain, undefined);
});

test('discoverModules takes name from manifest not folder name', () => {
  const root = '/tmp/opencode/notizine-mod-name';
  mkdirSync(join(root, 'modules', 'folder-x'), { recursive: true });
  writeFileSync(join(root, 'modules', 'folder-x', 'module.ziggy'), '.name = "beta"');
  const mods = discoverModules(root);
  assert.deepEqual(mods.beta, {
    name: 'beta', type: 'builtin', description: '', params: {}, delivery: 'critical', assets: [],
    dir: join(root, 'modules', 'folder-x'),
  });
  assert.equal(mods['folder-x'], undefined);
});

test('discoverModules throws when .name missing', () => {
  const root = '/tmp/opencode/notizine-mod-noname';
  mkdirSync(join(root, 'modules', 'anon'), { recursive: true });
  writeFileSync(join(root, 'modules', 'anon', 'module.ziggy'), '.title = "x"');
  assert.throws(() => discoverModules(root), /missing/);
});

test('discoverModules parses per-asset delivery and local output declarations', () => {
  const root = '/tmp/opencode/notizine-mod-manifest';
  const dir = writeModule(root, 'counter', counterManifest('.assets = [.{ .source = "client.js", .delivery = "deferred", .output = "/assets/modules/counter.js" }],'), { 'client.js': 'counter();' });

  assert.deepEqual(discoverModules(root).counter, {
    name: 'counter',
    type: 'dynamic',
    description: 'Counter',
    delivery: 'critical',
    assets: [{ source: 'client.js', delivery: 'deferred', output: '/assets/modules/counter.js' }],
    params: {
      count: { type: 'integer', default: 2, minimum: 1 },
      mode: { type: 'enum', values: ['up', 'down'], default: 'up' },
    },
    dir,
  });
});

test('discoverModules rejects asset delivery escalation and invalid external sources', () => {
  const escalationRoot = '/tmp/opencode/notizine-mod-asset-escalation';
  writeModule(escalationRoot, 'counter', counterManifest('.delivery = "deferred", .assets = [.{ .source = "client.js", .delivery = "critical" }],'), { 'client.js': 'counter();' });
  assert.throws(() => discoverModules(escalationRoot), /assets\[0\]\.delivery: cannot be more critical than module delivery/);

  const remoteRoot = '/tmp/opencode/notizine-mod-asset-remote';
  writeModule(remoteRoot, 'counter', counterManifest('.assets = [.{ .source = "http://cdn.example/counter.css", .delivery = "external" }],'));
  assert.throws(() => discoverModules(remoteRoot), /assets\[0\]\.source: remote URL must use HTTPS/);
});

test('discoverModules rejects duplicate names, missing local assets, and invalid delivery', () => {
  const duplicateRoot = '/tmp/opencode/notizine-mod-duplicate';
  writeModule(duplicateRoot, 'one', counterManifest());
  writeModule(duplicateRoot, 'two', counterManifest());
  assert.throws(() => discoverModules(duplicateRoot), /duplicate module name "counter"/);

  const assetRoot = '/tmp/opencode/notizine-mod-asset';
  writeModule(assetRoot, 'counter', counterManifest('.assets = ["missing.css"],'));
  assert.throws(() => discoverModules(assetRoot), /assets\[0\]: local asset "missing\.css" not found/);

  const deliveryRoot = '/tmp/opencode/notizine-mod-delivery';
  writeModule(deliveryRoot, 'counter', counterManifest('.delivery = "eventually",'));
  assert.throws(() => discoverModules(deliveryRoot), /delivery: expected one of critical, deferred, external/);
});

test('resolveSlots applies manifest defaults and validates instance params', () => {
  const root = '/tmp/opencode/notizine-mod-params';
  writeModule(root, 'counter', counterManifest());
  const modules = discoverModules(root);
  const config = { slots: { middle_center: [[{ module: 'counter', params: { count: 3 } }]] } };

  assert.deepEqual(resolveSlots(config, modules).zones.middle_center[0][0].params, { count: 3, mode: 'up' });
  assert.throws(() => resolveSlots({ slots: {
    middle_center: [[{ module: 'counter', params: { nope: true } }]],
  } }, modules), /params\.nope: unknown parameter for module "counter"/);
  assert.throws(() => resolveSlots({ slots: {
    middle_center: [[{ module: 'counter', params: { mode: 'sideways' } }]],
  } }, modules), /params\.mode: expected one of up, down/);
});

test('resolveSlots applies defaults only to omitted params and rejects explicit null', () => {
  const root = '/tmp/opencode/notizine-mod-null';
  writeModule(root, 'toggle', `.{
    .name = "toggle",
    .type = "dynamic",
    .description = "Toggle",
    .delivery = "critical",
    .params = .{
      .enabled = .{ .type = "boolean", .default = true },
      .url = .{ .type = "url", .required = true },
    },
  }`);
  const modules = discoverModules(root);

  assert.equal(resolveSlots({ slots: { middle_center: [[{
    module: 'toggle', params: { url: 'https://example.test/' },
  }]] } }, modules).zones.middle_center[0][0].params.enabled, true);
  assert.throws(() => resolveSlots({ slots: { middle_center: [[{
    module: 'toggle', params: { enabled: null, url: 'https://example.test/' },
  }]] } }, modules), /params\.enabled: expected boolean/);
  assert.throws(() => resolveSlots({ slots: { middle_center: [[{
    module: 'toggle', params: { url: null },
  }]] } }, modules), /params\.url: expected URL string/);
});

test('manifest and nested params reject reserved instance fields', () => {
  const manifestRoot = '/tmp/opencode/notizine-mod-reserved-schema';
  writeModule(manifestRoot, 'bad', `.{
    .name = "bad",
    .type = "dynamic",
    .description = "Bad",
    .delivery = "critical",
    .params = .{ .module = .{ .type = "string" } },
  }`);
  assert.throws(() => discoverModules(manifestRoot), /params\.module: reserved instance field/);

  const paramsRoot = '/tmp/opencode/notizine-mod-reserved-nested';
  writeModule(paramsRoot, 'counter', counterManifest());
  const modules = discoverModules(paramsRoot);
  assert.throws(() => resolveSlots({ slots: { middle_center: [[{
    module: 'counter', params: { id: 'nested-id' },
  }]] } }, modules), /params\.id: reserved instance field/);
});

test('resolveSlots rejects missing required params and keeps reserved fields outside params', () => {
  const root = '/tmp/opencode/notizine-mod-reserved';
  writeModule(root, 'embed', `.{
    .name = "embed",
    .type = "dynamic",
    .description = "Embed",
    .delivery = "critical",
    .params = .{ .url = .{ .type = "url", .required = true } },
  }`);
  const modules = discoverModules(root);

  assert.throws(() => resolveSlots({ slots: { middle_center: [['embed']] } }, modules),
    /params\.url: required parameter for module "embed"/);
  const instance = resolveSlots({ slots: { middle_center: [[{
    module: 'embed', id: 'video', align: 'center', delivery: 'deferred', legacyZone: 'footer',
    params: { url: 'https://example.test/video' },
  }]] } }, modules).zones.middle_center[0][0];
  assert.deepEqual(instance, {
    module: 'embed', id: 'video', align: 'center', delivery: 'deferred', legacyZone: 'footer',
    file: 'video.html', params: { url: 'https://example.test/video' },
  });
  assert.throws(() => resolveSlots({ slots: { middle_center: [[{
    module: 'embed', delivery: 'eventually', params: { url: 'https://example.test/video' },
  }]] } }, modules), /delivery: expected one of critical, deferred, external/);
});

test('resolveSlots normalizes canonical grid instances and builds order', () => {
  const modules = { recents: { dir: '/m/recents' }, spacer: { dir: '/m/spacer' } };
  const config = { slots: { middle_left: [[{ module: 'recents', id: 'r1' }], ['spacer']] } };
  const { zones, order } = resolveSlots(config, modules);
  assert.deepEqual(zones.middle_left[0][0], { id: 'r1', module: 'recents', file: 'r1.html', align: 'left' });
  assert.deepEqual(zones.middle_left[1][0], { module: 'spacer', file: 'spacer.html', align: 'left', id: 'spacer' });
  assert.deepEqual(order, ['r1', 'spacer']);
});

test('resolveSlots creates deterministic ids for repeated canonical instances', () => {
  const modules = { divider: { dir: '/m/divider' } };
  const config = {
    slots: {
      top_center: [[{ module: 'divider', legacyZone: 'before_main' }]],
      middle_center: [['divider']],
      bottom_center: [[{ module: 'divider', id: 'keepme' }, 'divider']],
    },
  };

  const { zones, order } = resolveSlots(config, modules);
  assert.deepEqual(zones.top_center[0][0], {
    module: 'divider', legacyZone: 'before_main', id: 'divider', file: 'divider.html', align: 'left',
  });
  assert.deepEqual(zones.middle_center[0][0], {
    module: 'divider', id: 'divider_1', file: 'divider_1.html', align: 'left',
  });
  assert.deepEqual(zones.bottom_center[0], [
    { module: 'divider', id: 'keepme', file: 'keepme.html', align: 'left' },
    { module: 'divider', id: 'divider_3', file: 'divider_3.html', align: 'left' },
  ]);
  assert.deepEqual(order, ['divider', 'divider_1', 'keepme', 'divider_3']);
});

test('resolveSlots throws on unknown module', () => {
  const config = { slots: { middle_left: [['nope']] } };
  assert.throws(() => resolveSlots(config, {}), /unknown module/);
});

test('resolveSlots throws on duplicate instance id across zones', () => {
  const modules = { recents: { dir: '/m/recents' } };
  const config = { slots: { middle_left: [['recents']], middle_right: [[{ module: 'recents', id: 'recents' }]] } };
  assert.throws(() => resolveSlots(config, modules), /duplicate instance id/);
});

test('applyOverrides longest prefix wins and / matches only root', () => {
  const modules = { recents: { dir: '/m/recents' }, search: { dir: '/m/search' } };
  const base = resolveSlots({ slots: { middle_center: [['recents']] } }, modules).zones;
  const overrides = {
    '/': { middle_center: [['search']] },
    '/posts/': { middle_center: [[{ module: 'search', id: 'post-search' }]] },
  };
  const postsZones = applyOverrides(base, overrides, '/posts/', modules);
  assert.deepEqual(postsZones.middle_center.flat().map(i => i.id), ['post-search']);
  const homeZones = applyOverrides(base, overrides, '/', modules);
  assert.deepEqual(homeZones.middle_center.flat().map(i => i.id), ['search']);
  const otherZones = applyOverrides(base, overrides, '/about/', modules);
  assert.deepEqual(otherZones.middle_center.flat().map(i => i.id), ['recents']);
});
