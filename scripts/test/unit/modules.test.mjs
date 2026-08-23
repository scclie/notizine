import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { discoverModules, resolveSlots, applyOverrides } from '../../lib/modules.mjs';

test('discoverModules finds folders with module.ziggy and skips others', () => {
  const root = '/tmp/opencode/notizine-mod-discover';
  mkdirSync(join(root, 'modules', 'alpha'), { recursive: true });
  mkdirSync(join(root, 'modules', 'plain'), { recursive: true });
  writeFileSync(join(root, 'modules', 'alpha', 'module.ziggy'), '.name = "alpha",');
  writeFileSync(join(root, 'modules', 'plain', 'readme.md'), 'x');
  writeFileSync(join(root, 'modules', 'loose.txt'), 'x');
  const mods = discoverModules(root);
  assert.deepEqual(mods.alpha, { dir: join(root, 'modules', 'alpha') });
  assert.equal(mods.plain, undefined);
});

test('discoverModules takes name from manifest not folder name', () => {
  const root = '/tmp/opencode/notizine-mod-name';
  mkdirSync(join(root, 'modules', 'folder-x'), { recursive: true });
  writeFileSync(join(root, 'modules', 'folder-x', 'module.ziggy'), '.name = "beta"');
  const mods = discoverModules(root);
  assert.deepEqual(mods.beta, { dir: join(root, 'modules', 'folder-x') });
  assert.equal(mods['folder-x'], undefined);
});

test('discoverModules throws when .name missing', () => {
  const root = '/tmp/opencode/notizine-mod-noname';
  mkdirSync(join(root, 'modules', 'anon'), { recursive: true });
  writeFileSync(join(root, 'modules', 'anon', 'module.ziggy'), '.title = "x"');
  assert.throws(() => discoverModules(root), /missing/);
});

test('resolveSlots normalizes instances and builds order', () => {
  const modules = { recents: { dir: '/m/recents' }, spacer: { dir: '/m/spacer' } };
  const config = { slots: { left: [[{ module: 'recents', id: 'r1' }], ['spacer']] } };
  const { zones, order } = resolveSlots(config, modules);
  assert.deepEqual(zones.left[0][0], { id: 'r1', module: 'recents', file: 'r1.html', align: 'left' });
  assert.deepEqual(zones.left[1][0], { id: 'spacer', module: 'spacer', file: 'spacer.html', align: 'left' });
  assert.deepEqual(order, ['r1', 'spacer']);
});

test('resolveSlots throws on unknown module', () => {
  const config = { slots: { left: [['nope']] } };
  assert.throws(() => resolveSlots(config, {}), /unknown module/);
});

test('resolveSlots throws on duplicate instance id across zones', () => {
  const modules = { recents: { dir: '/m/recents' } };
  const config = { slots: { left: [['recents']], right: [[{ module: 'recents' }]] } };
  assert.throws(() => resolveSlots(config, modules), /duplicate instance id/);
});

test('applyOverrides longest prefix wins and / matches only root', () => {
  const modules = { recents: { dir: '/m/recents' }, search: { dir: '/m/search' } };
  const base = resolveSlots({ slots: { center: [['recents']] } }, modules).zones;
  const overrides = {
    '/': { center: [['search']] },
    '/posts/': { center: [[{ module: 'search', id: 'post-search' }]] },
  };
  const postsZones = applyOverrides(base, overrides, '/posts/', modules);
  assert.deepEqual(postsZones.center.flat().map(i => i.id), ['post-search']);
  const homeZones = applyOverrides(base, overrides, '/', modules);
  assert.deepEqual(homeZones.center.flat().map(i => i.id), ['search']);
  const otherZones = applyOverrides(base, overrides, '/about/', modules);
  assert.deepEqual(otherZones.center.flat().map(i => i.id), ['recents']);
});
