import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import purge from '../../purge.mjs';

for (const delivery of ['inline', 'linked']) {
  test(`real purge retains mobile empty-zone and theme-focus rules in ${delivery} styles`, async () => {
    const root = mkdtempSync('/tmp/opencode/notizine-css-polish-');
    const css = ['assets/css/base.css', 'modules/theme_toggle/style.css']
      .map(path => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')).join('\n');
    const body = '<div class="layout"><div class="grid-cell grid-cell-top-left"> </div>'
      + '<main class="grid-cell grid-cell-middle-center"><p>content</p></main></div>'
      + '<div class="theme-toggle"><input id="theme-dark" type="checkbox"><label for="theme-dark"></label></div>';
    const htmlPath = join(root, 'index.html');
    const cssPath = join(root, 'assets/css/generated.css');
    try {
      mkdirSync(join(root, 'assets/css'), { recursive: true });
      writeFileSync(htmlPath, delivery === 'inline' ? `<style>${css}</style>${body}` : body);
      if (delivery === 'linked') writeFileSync(cssPath, css);
      await purge(root);
      const output = readFileSync(delivery === 'inline' ? htmlPath : cssPath, 'utf8');
      assert.match(output, /\.grid-cell:not\(:has\(>\s*\*\)\)\{display:none\}/);
      assert.match(output, /\.grid-cell\{grid-area:auto;max-width:100%\}/);
      assert.match(output, /grid-template:none \/ minmax\(0,1fr\)/);
      assert.match(output, /input:focus-visible\s*\+\s*label\{outline:2px solid var\(--accent\);outline-offset:3px;opacity:1\}/);
      assert.match(output, /grid-template-columns:var\(--grid-col-1\) var\(--grid-col-2\) var\(--grid-col-3\)/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
