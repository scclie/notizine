import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import * as search from '../../lib/search.mjs';
import purge from '../../purge.mjs';

test('search renders an accessible widget without inline index or fixed duplicate ids', async () => {
  const gen = (await import('../../../modules/search/generator.mjs')).default;
  const html = await gen({ page: { locale: 'en' }, i18n: key => key });
  assert.match(html, /<input type="search" class="search-input" aria-label="search_title" placeholder="search_placeholder" autocomplete="off">/);
  assert.match(html, /<div class="search-results" aria-live="polite"><\/div>/);
  assert.ok(!html.includes('<script'), 'no inline index script emitted');
  assert.ok(!html.includes(' id='), 'multiple instances cannot duplicate element ids');
  assert.ok(!html.includes('/ru/posts/'), 'the generator does not embed page data');
});

test('search escapes placeholder and never emits raw markup', async () => {
  const gen = (await import('../../../modules/search/generator.mjs')).default;
  const html = await gen({ page: { locale: 'en' }, i18n: key => `"${key}" & <q>` });
  assert.match(html, /placeholder="&quot;search_placeholder&quot; &amp; &lt;q&gt;"/);
  assert.ok(!html.includes('<script'), 'script-closing sequences cannot escape');
});

test('index includes home sections canonical 404 and every locale with full body text', () => {
  const root = mkdtempSync('/tmp/opencode/notizine-search-index-');
  try {
    const filePath = join(root, 'page.smd');
    writeFileSync(filePath, '---\n.title = "private metadata",\n---\n' + 'body '.repeat(1000) + 'late-sentinel');
    const pages = ['/', '/posts/', '/posts/a/', '/404/', '/ru/about/'].map(link => ({
      link, title: link, locale: link.startsWith('/ru/') ? 'ru' : 'en', filePath,
      isSection: ['/', '/posts/'].includes(link),
    }));
    search.buildSearchIndex({ pages: [...pages, pages[0], { link: '/virtual/', locale: 'en' }] }, root);
    const context = { window: {} };
    vm.runInNewContext(readFileSync(search.searchIndexPath(root), 'utf8'), context);
    const entries = JSON.parse(JSON.stringify(Object.values(context.window.SEARCH_INDEX).flat()));
    assert.deepEqual(entries.map(p => p.u).sort(), ['/', '/404/', '/posts/', '/posts/a/', '/ru/about/']);
    for (const entry of entries) {
      assert.ok(entry.x.includes('late-sentinel'));
      assert.ok(!entry.x.includes('private metadata'));
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('search index is registered once before client only on resolved search consumers', () => {
  assert.equal(typeof search.attachSearchIndex, 'function');
  const assets = { deferredScripts: '<script defer src="/assets/modules/search.js"></script>', localAssets: [] };
  assert.deepEqual(search.attachSearchIndex(assets, [{ module: '_header' }]), assets);
  const result = search.attachSearchIndex(assets, [{ module: 'search' }, { module: 'search' }]);
  assert.deepEqual(result.localAssets, ['.cache/search.js']);
  assert.ok(result.deferredScripts.indexOf('/.cache/search.js') < result.deferredScripts.indexOf('/assets/modules/search.js'));
  assert.equal(result.deferredScripts.match(/src="\/.cache\/search.js"/g).length, 1);
});

// only the DOM boundary is substituted; the actual shipped client performs all rendering/filtering
class Element {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.dataset = {}; this.value = ''; this.listeners = {}; this._text = ''; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  set innerHTML(_) { throw new Error('indexed text must not be interpreted as html'); }
  append(...items) { this.children.push(...items.flatMap(item => item.tagName === '#fragment' ? item.children : [item])); }
  appendChild(item) { this.append(item); return item; }
  replaceChildren(...items) { this.children = []; this._text = ''; this.append(...items); }
  addEventListener(event, callback) { this.listeners[event] = callback; }
  setAttribute(name, value) { this[name] = String(value); }
  querySelector(selector) { return selector.includes('input') ? this.input : this.results; }
}
function runClient(index, count = 1) {
  const widgets = Array.from({ length: count }, () => {
    const widget = new Element('section');
    widget.input = new Element('input'); widget.results = new Element();
    widget.dataset = { empty: 'nothing found', unavailable: 'search unavailable' };
    return widget;
  });
  vm.runInNewContext(readFileSync(new URL('../../../modules/search/client.js', import.meta.url), 'utf8'), {
    window: { SEARCH_INDEX: index }, URL,
    document: {
      querySelectorAll: () => widgets,
      getElementById: () => null,
      createElement: tag => new Element(tag),
      createDocumentFragment: () => new Element('#fragment'),
    },
  });
  return widgets;
}
function links(node) { return [ ...(node.tagName === 'a' ? [node] : []), ...node.children.flatMap(links) ]; }
const INDEX = { en: [
  { t: '<img onerror=bad()>', u: '/', d: 'home', x: 'welcome' },
  { t: 'a post', u: '/posts/a/', d: '', x: 'body needle' },
], ru: [{ t: 'заметка', u: '/ru/a/', d: '', x: 'текст' }] };

test('client shows all pages initially filters full text and clearing restores catalog', () => {
  const [widget] = runClient(INDEX);
  assert.deepEqual(links(widget.results).map(a => a.href), ['/', '/posts/a/', '/ru/a/']);
  assert.equal(links(widget.results)[0].textContent, '<img onerror=bad()>');
  widget.input.value = ' NEEDLE '; widget.input.listeners.input();
  assert.deepEqual(links(widget.results).map(a => a.href), ['/posts/a/']);
  widget.input.value = ''; widget.input.listeners.input();
  assert.equal(links(widget.results).length, 3);
  widget.input.value = 'not-present'; widget.input.listeners.input();
  assert.equal(widget.results.textContent, 'nothing found');
});

test('client supports independent widgets without shared state or unsafe urls', () => {
  const widgets = runClient({ en: [...INDEX.en, { t: 'bad', u: 'javascript:alert(1)' }, { t: 'remote', u: '//evil.test/' }] }, 2);
  assert.equal(links(widgets[0].results).length, 2);
  widgets[0].input.value = 'needle'; widgets[0].input.listeners.input();
  assert.equal(links(widgets[0].results).length, 1);
  assert.equal(links(widgets[1].results).length, 2);
});

test('client distinguishes unavailable index from an empty catalog', () => {
  assert.equal(runClient(undefined)[0].results.textContent, 'search unavailable');
  assert.equal(runClient({ en: [] })[0].results.textContent, 'nothing found');
});

test('catalog and matches do not silently stop at thirty results', () => {
  const [widget] = runClient({ en: Array.from({ length: 40 }, (_, i) => ({
    t: `page ${i}`, u: `/page-${i}/`, d: '', x: 'shared word',
  })) });
  assert.equal(links(widget.results).length, 40);
  widget.input.value = 'shared'; widget.input.listeners.input();
  assert.equal(links(widget.results).length, 40);
  assert.equal(links(widget.results).at(-1).href, '/page-39/');
});

test('search result links retain theme styles after real purge before dynamic results exist', async () => {
  const root = mkdtempSync('/tmp/opencode/notizine-search-style-');
  try {
    const css = readFileSync(new URL('../../../modules/search/style.css', import.meta.url), 'utf8');
    writeFileSync(join(root, 'index.html'), `<style>${css}</style><a href="/">home</a><p>search</p><section class="search-widget"><input class="search-input"><div class="search-results"></div></section>`);
    await purge(root);
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    assert.match(html, /\.search-results a\{[^}]*color:var\(--accent\)/);
    assert.match(html, /\.search-results\s*>\s*\*\{[^}]*margin-block:/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
