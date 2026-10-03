import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildPageAssets, writePageAssets } from '../../lib/module-assets.mjs';

function freshRoot(name) {
  const root = join('/tmp/opencode', name);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(join(root, 'modules'), { recursive: true });
  return root;
}

function writeAsset(root, module, source, content) {
  const dir = join(root, 'modules', module);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, source), content);
  return dir;
}

function module(root, name, delivery, assets) {
  return { name, delivery, dir: join(root, 'modules', name), assets };
}

test('emits critical, deferred, and external module assets per page', () => {
  const root = freshRoot('notizine-module-assets-strategies');
  const criticalDir = writeAsset(root, 'critical', 'critical.css', '.critical{color:red}');
  const deferredDir = writeAsset(root, 'deferred', 'deferred.js', 'window.deferred = true;');
  const modules = {
    critical: { ...module(root, 'critical', 'critical', [{ source: 'critical.css', delivery: 'critical' }]), dir: criticalDir },
    deferred: { ...module(root, 'deferred', 'deferred', [{ source: 'deferred.js', delivery: 'deferred', output: '/assets/modules/deferred.js' }]), dir: deferredDir },
    external: module(root, 'external', 'critical', [{ source: 'https://cdn.example/widget.css', delivery: 'external' }]),
  };

  const assets = buildPageAssets({
    pageKey: 'posts/example',
    instances: [{ module: 'critical' }, { module: 'deferred' }, { module: 'external' }],
    modules,
    root,
  });

  assert.match(assets.criticalStyles, /critical\.css/);
  assert.match(assets.deferredScripts, /<script defer src="\/assets\/modules\/deferred\.js"><\/script>/);
  assert.match(assets.externalStyles, /rel="stylesheet" href="https:\/\/cdn\.example\/widget\.css"/);
  assert.doesNotMatch(assets.criticalStyles, /deferred\.css/);
  assert.equal(readFileSync(join(root, 'assets', 'assets', 'modules', 'deferred.js'), 'utf8'), 'window.deferred = true;');
  assert.deepEqual(assets.localAssets, ['assets/modules/deferred.js']);
});

test('omits globally bundled critical styles when requested', () => {
  const root = freshRoot('notizine-module-assets-global-critical');
  const dir = writeAsset(root, 'critical', 'style.css', '.critical{}');
  const assets = buildPageAssets({
    pageKey: 'index',
    instances: [{ module: 'critical' }],
    modules: { critical: { ...module(root, 'critical', 'critical', [{ source: 'style.css', delivery: 'critical' }]), dir } },
    root,
    includeCriticalStyles: false,
  });

  assert.equal(assets.criticalStyles, '');
});

test('deduplicates assets in effective page order and preserves override-only modules', () => {
  const root = freshRoot('notizine-module-assets-order');
  const firstDir = writeAsset(root, 'first', 'first.js', 'first();');
  const overrideDir = writeAsset(root, 'override', 'override.js', 'override();');
  const modules = {
    first: { ...module(root, 'first', 'deferred', [{ source: 'first.js', output: '/assets/modules/first.js' }]), dir: firstDir },
    override: { ...module(root, 'override', 'external', [{ source: 'override.js', output: '/assets/modules/override.js' }]), dir: overrideDir },
    later: module(root, 'later', 'critical', [{ source: 'https://cdn.example/later.js', delivery: 'external' }]),
  };

  const assets = buildPageAssets({
    pageKey: 'docs/page',
    instances: [{ module: 'override' }, { module: 'first' }, { module: 'later' }, { module: 'override' }],
    modules,
    root,
  });

  assert.match(assets.externalScripts, /\/assets\/modules\/override\.js/);
  assert.match(assets.deferredScripts, /\/assets\/modules\/first\.js/);
  assert.equal((assets.externalScripts.match(/override\.js/g) ?? []).length, 1);
  assert.ok(assets.externalScripts.indexOf('override.js') < assets.externalScripts.indexOf('later.js'));
  assert.deepEqual(
    buildPageAssets({ pageKey: 'empty', instances: [], modules, root }),
    {
      criticalStyles: '', criticalScripts: '', deferredStyles: '', deferredScripts: '',
      externalStyles: '', externalScripts: '', localAssets: [],
    }
  );
});

test('copies local external assets only to their manifest output path', () => {
  const root = freshRoot('notizine-module-assets-local-external');
  const dir = writeAsset(root, 'badges', 'badges.css', '.badges{}');
  const assets = buildPageAssets({
    pageKey: 'index',
    instances: [{ module: 'badges' }],
    modules: {
      badges: {
        ...module(root, 'badges', 'critical', [{ source: 'badges.css', delivery: 'external', output: '/badges/badges.css' }]),
        dir,
      },
    },
    root,
  });

  assert.equal(assets.externalStyles, '<link rel="stylesheet" href="/badges/badges.css">');
  assert.equal(readFileSync(join(root, 'assets', 'badges', 'badges.css'), 'utf8'), '.badges{}');
  assert.equal(existsSync(join(root, 'assets', 'assets', 'modules', 'badges.css')), false);
  assert.deepEqual(assets.localAssets, ['badges/badges.css']);
});

test('rejects unsafe or missing asset sources and delivery escalation', () => {
  const root = freshRoot('notizine-module-assets-validation');
  const localDir = writeAsset(root, 'local', 'widget.css', '.widget{}');
  const base = module(root, 'local', 'deferred', [{ source: 'widget.css', delivery: 'deferred', output: '/assets/modules/widget.css' }]);
  const modules = { local: { ...base, dir: localDir } };

  assert.throws(() => buildPageAssets({
    pageKey: 'x', instances: [{ module: 'local' }], modules: {
      local: { ...base, assets: [{ source: 'http://cdn.example/widget.css', delivery: 'external' }], dir: localDir },
    }, root,
  }), /HTTPS/);
  assert.throws(() => buildPageAssets({
    pageKey: 'x', instances: [{ module: 'local' }], modules: {
      local: { ...base, assets: [{ source: 'missing.css', delivery: 'deferred', output: '/assets/modules/missing.css' }], dir: localDir },
    }, root,
  }), /not found/);
  assert.throws(() => buildPageAssets({
    pageKey: 'x', instances: [{ module: 'local', delivery: 'deferred' }], modules: {
      local: { ...base, delivery: 'critical', assets: [{ source: 'widget.css', delivery: 'critical' }], dir: localDir },
    }, root,
  }), /more critical/);
  assert.throws(() => buildPageAssets({
    pageKey: 'x', instances: [{ module: 'missing' }], modules, root,
  }), /unknown module/);
});

test('writes asset records keyed by cache key', () => {
  const root = freshRoot('notizine-module-assets-write');
  writePageAssets({ index: { criticalStyles: '<style></style>' } }, root);
  const path = join(root, 'assets', '.cache', 'page-assets.json');
  assert.ok(existsSync(path));
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), { index: { criticalStyles: '<style></style>' } });
});
