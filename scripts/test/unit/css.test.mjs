import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { bundleCSS } from '../../lib/css.mjs';

function freshRoot(name) {
  const root = join('/tmp/opencode', name);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(join(root, 'assets', 'themes'), { recursive: true });
  mkdirSync(join(root, 'assets', 'css'), { recursive: true });
  writeFileSync(join(root, 'assets', 'css', 'base.css'), '');
  writeFileSync(join(root, 'assets', 'css', 'code.css'), '');
  return root;
}

function writeModule(root, name, files) {
  const dir = join(root, 'modules', name);
  mkdirSync(dir, { recursive: true });
  for (const [file, content] of Object.entries(files)) {
    writeFileSync(join(dir, file), content);
  }
}

test('bundleCSS writes tokens then theme then installed module styles', () => {
  const root = freshRoot('notizine-css-basic');
  writeFileSync(join(root, 'assets', 'themes', 't1.css'), '.themed{color:red}');
  writeModule(root, 'aa', { 'module.ziggy': '.name = "aa", .assets = [.{ .source = "style.css", .delivery = "critical" }]', 'style.css': '.a{color:green}' });
  writeModule(root, 'bb', { 'module.ziggy': '.name = "bb", .assets = [.{ .source = "style.css", .delivery = "critical" }]', 'style.css': '.b{color:blue}' });
  writeModule(root, 'cc', { 'module.ziggy': '.name = "cc", .assets = [.{ .source = "style.css", .delivery = "deferred", .output = "/assets/modules/cc.css" }]', 'style.css': '.c{color:black}' });
  const config = {
    theme: 't1',
    layout: { spacing: 1 },
    slots: { middle_left: [['bb'], ['cc'], ['aa']] },
  };
  bundleCSS(config, new Set(['aa', 'bb', 'cc']), root);
  const css = readFileSync(join(root, 'assets', '.cache', 'all.css'), 'utf-8');
  assert.match(css, /--sp-1:/);
  assert.match(css, /\.themed\{color:red\}/);
  assert.ok(css.indexOf('--sp-1:') < css.indexOf('.themed'), 'tokens before theme rule');
  assert.ok(css.indexOf('.b{') < css.indexOf('.a{'), 'module styles follow slots.order');
  assert.doesNotMatch(css, /\.c\{/);
});

test('bundleCSS skips uninstalled module styles and dedupes shared modules', () => {
  const root = freshRoot('notizine-css-filter');
  writeFileSync(join(root, 'assets', 'themes', 't2.css'), '.theme2{}');
  writeModule(root, 'aa', { 'module.ziggy': '.name = "aa", .assets = [.{ .source = "style.css", .delivery = "critical" }]', 'style.css': '.a{}' });
  writeModule(root, 'dd', { 'module.ziggy': '.name = "dd", .assets = [.{ .source = "style.css", .delivery = "critical" }]', 'style.css': '.d{}' });
  const config = {
    theme: 't2',
    slots: { middle_left: [[{ module: 'aa' }, { module: 'aa', id: 'aa_1' }], ['dd']] },
  };
  bundleCSS(config, new Set(['aa']), root);
  const css = readFileSync(join(root, 'assets', '.cache', 'all.css'), 'utf-8');
  assert.equal(css.split('.a{}').length - 1, 1);
  assert.doesNotMatch(css, /\.d\{/);
});

test('bundleCSS appends custom_css after theme and module styles', () => {
  const root = freshRoot('notizine-css-custom');
  writeFileSync(join(root, 'assets', 'themes', 't3.css'), '.theme3{}');
  mkdirSync(join(root, 'assets', 'css'), { recursive: true });
  writeFileSync(join(root, 'assets', 'css', 'extra.css'), '.custom-rule{}');
  const config = { theme: 't3', custom_css: 'css/extra.css', slots: {} };
  bundleCSS(config, new Set(), root);
  const css = readFileSync(join(root, 'assets', '.cache', 'all.css'), 'utf-8');
  assert.ok(
    css.indexOf('.theme3{}') < css.indexOf('.custom-rule{}'),
    'custom css last'
  );
});

test('bundleCSS copies all.css to generated.css only in link mode', () => {
  const root = freshRoot('notizine-css-link');
  writeFileSync(join(root, 'assets', 'themes', 't4.css'), '.theme4{}');
  const linked = { theme: 't4', features: { inline_mode: false }, slots: {} };
  bundleCSS(linked, new Set(), root);
  const generatedPath = join(root, 'assets', 'css', 'generated.css');
  assert.ok(existsSync(generatedPath), 'link mode writes generated.css');
  assert.equal(
    readFileSync(generatedPath, 'utf-8'),
    readFileSync(join(root, 'assets', '.cache', 'all.css'), 'utf-8')
  );
  const inlined = { theme: 't4', features: { inline_mode: true }, slots: {} };
  bundleCSS(inlined, new Set(), root);
  assert.ok(!existsSync(generatedPath), 'inline mode leaves no generated.css');
});

test('base template leaves custom CSS ownership to bundleCSS', () => {
  const template = readFileSync(new URL('../../../layouts/templates/base.shtml', import.meta.url), 'utf-8');
  assert.doesNotMatch(template, /custom_css/, 'custom CSS must not be inserted a second time by the template');
});

test('Nord breadcrumbs wrap with accent links outside generic header-nav controls', () => {
  const breadcrumbs = readFileSync(new URL('../../../modules/breadcrumbs/style.css', import.meta.url), 'utf-8');
  const base = readFileSync(new URL('../../../assets/css/base.css', import.meta.url), 'utf-8');
  const nord = readFileSync(new URL('../../../assets/themes/nord-default.css', import.meta.url), 'utf-8');

  assert.match(breadcrumbs, /\.breadcrumbs\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap;[^}]*align-items:\s*baseline;[^}]*gap:\s*0\.25rem;[^}]*margin:\s*0;[^}]*color:\s*var\(--text-muted\);/s);
  assert.match(breadcrumbs, /\.breadcrumbs a\s*\{[^}]*color:\s*var\(--accent\);[^}]*text-decoration:\s*underline;[^}]*text-underline-offset:\s*3px;/s);
  assert.match(breadcrumbs, /\.breadcrumbs :is\(a, span:not\(\.crumb-sep\)\)\s*\{[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*anywhere;/s, 'long breadcrumb links and current-page labels can shrink and wrap');
  assert.match(breadcrumbs, /\.breadcrumbs \.crumb-sep\s*\{\s*color:\s*var\(--accent2\);\s*\}/);
  assert.doesNotMatch(base, /#header a\s*\{/, 'generic header links must not override breadcrumb links');
  assert.match(base, /#header \.site-title\s*\{/, 'site-title styling does not target breadcrumb links');
  assert.doesNotMatch(base, /#header nav\s*\{/, 'generic header navigation must not override breadcrumb layout');
  assert.match(base, /#header nav:not\(\.breadcrumbs\)\s*\{/, 'header controls exclude breadcrumb navigation');
  assert.doesNotMatch(base, /#header nav a\s*\{/, 'generic header-nav links must not override breadcrumb links');
  assert.match(base, /#header nav:not\(\.breadcrumbs\) a\s*\{/, 'header control links exclude breadcrumb navigation');

  const darkBlocks = [
    /\[data-theme='dark'\]\s*\{([^}]*)\}/s,
    /:root:not\(:has\(#theme-dark\)\)\s*\{([^}]*)\}/s,
    /:root:has\(#theme-dark:checked\)\s*\{([^}]*)\}/s,
  ];
  for (const blockPattern of darkBlocks) {
    const block = nord.match(blockPattern);
    assert.ok(block, 'missing dark-mode token block');
    assert.match(block[1], /--fg-muted:\s*#a3be8c;/, 'dark mode uses readable muted text');
    assert.doesNotMatch(block[1], /--fg-muted:\s*#4c566a;/, 'dark mode does not use unreadable muted text');
  }
});
