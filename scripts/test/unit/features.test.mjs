import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildSearchIndex, removeSearchIndex } from '../../lib/search.mjs';

const PROJECT_ROOT = new URL('../../../', import.meta.url).pathname;

function buildFixture(name, { inlineMode, search, customCSS = false }) {
  const root = join('/tmp/opencode', name);
  rmSync(root, { recursive: true, force: true });
  cpSync(PROJECT_ROOT, root, {
    recursive: true,
    filter: source => !['.git', 'node_modules', 'public'].includes(basename(source)),
  });
  symlinkSync(join(PROJECT_ROOT, 'node_modules'), join(root, 'node_modules'), 'dir');

  const configPath = join(root, 'assets', 'notizine.ziggy');
  let config = readFileSync(configPath, 'utf-8')
    .replace('"search": true,', `"search": ${search},`)
    .replace('"inline_mode": true,', `"inline_mode": ${inlineMode},`);
  if (customCSS) {
    mkdirSync(join(root, 'assets', 'css'), { recursive: true });
    writeFileSync(join(root, 'assets', 'css', 'task6-once.css'), 'body{--task6-custom-css-marker:once}');
    config = config.replace('"custom_css": "",', '"custom_css": "css/task6-once.css",');
  }
  writeFileSync(configPath, config);

  const result = spawnSync('nix-shell', ['--run', 'npm run build'], {
    cwd: root,
    encoding: 'utf-8',
    timeout: 600000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return join(root, 'public');
}

function occurrences(text, marker) {
  return text.split(marker).length - 1;
}

test('disabling search removes a stale generated search asset', () => {
  const root = join('/tmp/opencode', 'notizine-features-search');
  rmSync(root, { recursive: true, force: true });
  mkdirSync(join(root, 'assets'), { recursive: true });
  // An empty model is sufficient to verify stale generated output cleanup.
  buildSearchIndex({ pages: [] }, root);
  const asset = join(root, 'assets', '.cache', 'search.js');
  assert.equal(existsSync(asset), true, 'enabled search writes its index asset');

  removeSearchIndex(root);

  assert.equal(existsSync(asset), false, 'disabled search removes the stale index asset');
});

test('base template gates feature-owned scripts with their feature flags', () => {
  const template = readFileSync(new URL('../../../layouts/templates/base.shtml', import.meta.url), 'utf-8');
  assert.match(
    template,
    /<ctx :if="\$site\.asset\('notizine\.ziggy'\)\.ziggy\(\)\.get\('features'\)\.get\('darkmode'\)">\s*<script :html="\$site\.asset\('js\/theme\.js'\)\.bytes\(\)"><\/script>\s*<\/ctx>/,
    'dark-mode flash prevention script is emitted only when dark mode is enabled'
  );
  assert.match(
    template,
    /<ctx :if="\$site\.asset\('notizine\.ziggy'\)\.ziggy\(\)\.get\('features'\)\.get\('search'\)">\s*<script defer src="\$site\.asset\('\.cache\/search\.js'\)\.link\(\)"><\/script>\s*<\/ctx>/,
    'search index script is emitted only when search is enabled'
  );
});

test('disabled search omits search markup and generated assets from build output', { timeout: 600000 }, () => {
  const publicDir = buildFixture('notizine-features-disabled-search', {
    inlineMode: true,
    search: false,
    customCSS: true,
  });
  const html = readFileSync(join(publicDir, 'search', 'index.html'), 'utf-8');

  assert.doesNotMatch(html, /search-(input|results)|search\.js/);
  assert.equal(existsSync(join(publicDir, '.cache', 'search.js')), false);
  assert.equal(existsSync(join(publicDir, 'assets', 'modules', 'search.js')), false);
  assert.equal(occurrences(html, '--task6-custom-css-marker:once'), 1);
});

test('linked CSS output contains unique custom CSS exactly once', { timeout: 600000 }, () => {
  const publicDir = buildFixture('notizine-features-linked-css', {
    inlineMode: false,
    search: true,
    customCSS: true,
  });
  const html = readFileSync(join(publicDir, 'index.html'), 'utf-8');
  const css = readFileSync(join(publicDir, 'css', 'generated.css'), 'utf-8');

  assert.equal(occurrences(html, 'generated.css'), 1);
  assert.equal(occurrences(html, '--task6-custom-css-marker:once'), 0);
  assert.equal(occurrences(css, '--task6-custom-css-marker:once'), 1);
});

test('a failed build restores Mermaid source files', () => {
  const root = join('/tmp/opencode', 'notizine-features-mermaid');
  rmSync(root, { recursive: true, force: true });
  mkdirSync(join(root, 'content'), { recursive: true });
  const source = join(root, 'content', 'diagram.smd');
  const original = '```mermaid\ngraph TD\n  A --> B\n```\n';
  writeFileSync(source, original);

  const result = spawnSync(process.execPath, [
    new URL('../../build.mjs', import.meta.url).pathname,
    '--skip-generate',
  ], { cwd: root, encoding: 'utf-8' });

  assert.notEqual(result.status, 0, 'the fixture intentionally fails without the zine executable');
  assert.equal(readFileSync(source, 'utf-8'), original);
});
