import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import purge from '../../purge.mjs';

test('purge prunes generated.css globally when html has no style block', async () => {
  const root = join('/tmp/opencode', 'notizine-purge-linked');
  rmSync(root, { recursive: true, force: true });
  const pageDir = join(root, 'posts', 'a');
  mkdirSync(pageDir, { recursive: true });
  writeFileSync(
    join(pageDir, 'index.html'),
    '<html><body><p class="kept">x</p></body></html>'
  );
  const cssPath = join(root, 'assets', 'css', 'generated.css');
  mkdirSync(join(root, 'assets', 'css'), { recursive: true });
  writeFileSync(cssPath, '.kept{color:red}\n.dropped{color:blue}\n');
  await purge(root);
  const css = readFileSync(cssPath, 'utf-8');
  assert.match(css, /\.kept/);
  assert.doesNotMatch(css, /\.dropped/);
});

test('purge transforms every inline style block without changing style attributes', async () => {
  const root = join('/tmp/opencode', 'notizine-purge-inline');
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  const htmlPath = join(root, 'index.html');
  writeFileSync(htmlPath,
    '<html><head><style data-first="yes">.first{color:red}.drop-first{color:blue}</style>' +
    '<style media="print">.second{color:green}.drop-second{color:black}</style></head>' +
    '<body><p class="first second">x</p></body></html>'
  );

  await purge(root);

  const html = readFileSync(htmlPath, 'utf-8');
  assert.match(html, /<style data-first="yes">\.first\{color:red\}<\/style>/);
  assert.match(html, /<style media="print">\.second\{color:green\}<\/style>/);
  assert.doesNotMatch(html, /drop-(first|second)/);
});

test('purge uses all pages when pruning shared generated CSS', async () => {
  const root = join('/tmp/opencode', 'notizine-purge-shared');
  rmSync(root, { recursive: true, force: true });
  mkdirSync(join(root, 'with-inline'), { recursive: true });
  mkdirSync(join(root, 'linked-only'), { recursive: true });
  writeFileSync(
    join(root, 'with-inline', 'index.html'),
    '<html><head><style>.inline{color:red}</style></head><body><p class="inline">inline</p></body></html>'
  );
  writeFileSync(
    join(root, 'linked-only', 'index.html'),
    '<html><body><p class="linked">linked</p></body></html>'
  );
  const cssPath = join(root, 'assets', 'css', 'generated.css');
  mkdirSync(join(root, 'assets', 'css'), { recursive: true });
  writeFileSync(cssPath, '.inline{color:red}.linked{color:green}.dropped{color:black}');

  await purge(root);

  const css = readFileSync(cssPath, 'utf-8');
  assert.match(css, /\.inline\{color:red\}/);
  assert.match(css, /\.linked\{color:green\}/);
  assert.doesNotMatch(css, /\.dropped/);
});
