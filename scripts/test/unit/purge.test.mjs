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
