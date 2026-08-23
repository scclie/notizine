import { test } from 'node:test';
import assert from 'node:assert/strict';

const loadGen = async name => (await import(new URL(`../../../modules/${name}/generator.mjs`, import.meta.url).href)).default;

function pg(locale, link, title, extra = {}) {
  return {
    locale,
    link,
    title,
    description: '',
    date: '',
    moddate: '',
    tags: [],
    isSection: false,
    parentLink: null,
    wordcount: 0,
    readtime: 0,
    filePath: '',
    ...extra,
  };
}

const MODEL = {
  config: {},
  pages: [
    pg('en', '/posts/a/', 'Post A'),
    pg('en', '/posts/b/', 'Post & <B>'),
    pg('en', '/about/', 'About', { isSection: true }),
    pg('ru', '/ru/posts/б/', 'Пост Б'),
  ],
};

test('search renders locale-scoped input without inline index', async () => {
  const gen = await loadGen('search');
  const html = await gen({ page: MODEL.pages[0], site: MODEL, params: {}, i18n: k => k });
  assert.match(html, /<input type="search" id="search-input" data-locale="en" placeholder="search_placeholder" autocomplete="off">/);
  assert.match(html, /<div id="search-results"><\/div>/);
  assert.ok(!html.includes('<script'), 'no inline index script emitted');
  assert.ok(!html.includes('/ru/posts/'), 'no foreign-locale links');
});

test('search escapes placeholder and never emits raw markup', async () => {
  const gen = await loadGen('search');
  const spiky = { config: {}, pages: [pg('en', '/x/', '</script> alert')] };
  const html = await gen({
    page: spiky.pages[0],
    site: spiky,
    params: {},
    i18n: k => `"${k}" & <q>`,
  });
  assert.match(html, /placeholder="&quot;search_placeholder&quot; &amp; &lt;q&gt;"/);
  assert.ok(!html.includes('<script'), 'script-closing sequences cannot escape');
});
