import { test } from 'node:test';
import assert from 'node:assert/strict';

const loadGen = async name => (await import(new URL(`../../../modules/${name}/generator.mjs`, import.meta.url).href)).default;

function pg(locale, link, extra = {}) {
  return {
    locale,
    link,
    title: '',
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
  config: {
    site: {
      locales: [
        { code: 'en', output_prefix_override: '' },
        { code: 'ru', output_prefix_override: null },
      ],
    },
  },
  pages: [
    pg('en', '/', { title: 'Home', isSection: true }),
    pg('en', '/posts/', { title: 'Posts', isSection: true, parentLink: '/' }),
    pg('en', '/posts/nested/', { title: 'Nested', isSection: true, parentLink: '/posts/' }),
    pg('en', '/posts/nested/deep/', { title: 'Deep Leaf', date: '2026-02-01', parentLink: '/posts/nested/' }),
    pg('en', '/posts/a/', { title: 'Post A', date: '2026-01-01', parentLink: '/posts/' }),
    pg('en', '/about/', { title: 'About', date: '2026-01-02', parentLink: '/' }),
    pg('en', '/tags/', { title: 'Tags', date: '2026-01-03', parentLink: '/' }),
    pg('ru', '/ru/', { title: 'Главная', isSection: true }),
    pg('ru', '/ru/posts/', { title: 'Записи', isSection: true, parentLink: null }),
    pg('ru', '/ru/posts/б/', { title: 'Пост Б', date: '2026-03-01', parentLink: '/ru/posts/' }),
  ],
};

test('explorer nests details for child sections and lists direct leaves', async () => {
  const gen = await loadGen('explorer');
  const html = await gen({ page: MODEL.pages[4], site: MODEL, params: {}, i18n: k => k });
  assert.equal(
    html,
    '<ul class="explorer-tree">' +
    '<li class="explorer-node"><details open><summary><a href="/posts/">Posts</a></summary><ul>' +
    '<li class="explorer-node"><details open><summary><a href="/posts/nested/">Nested</a></summary><ul>' +
    '<li><a href="/posts/nested/deep/">Deep Leaf</a></li>' +
    '</ul></details></li>' +
    '<li><a href="/posts/a/">Post A</a></li>' +
    '</ul></details></li>' +
    '<li><a href="/tags/">Tags</a></li>' +
    '<li><a href="/about/">About</a></li>' +
    '</ul>'
  );
});

test('explorer exclude param removes utility links', async () => {
  const gen = await loadGen('explorer');
  const html = await gen({
    page: MODEL.pages[4],
    site: MODEL,
    params: { exclude: ['/tags/', '/search/', '/recents/', '/explorer/'] },
    i18n: k => k,
  });
  assert.ok(!html.includes('href="/tags/"'), 'tags excluded');
  assert.ok(html.includes('href="/about/"'), 'regular leaves stay');
  assert.ok(html.includes('<summary><a href="/posts/nested/">Nested</a></summary>'));
});

test('explorer root pointing at a section renders its subtree without wrapping node', async () => {
  const gen = await loadGen('explorer');
  const html = await gen({ page: MODEL.pages[4], site: MODEL, params: { root: '/posts/' }, i18n: k => k });
  assert.equal(
    html,
    '<ul class="explorer-tree">' +
    '<li class="explorer-node"><details open><summary><a href="/posts/nested/">Nested</a></summary><ul>' +
    '<li><a href="/posts/nested/deep/">Deep Leaf</a></li>' +
    '</ul></details></li>' +
    '<li><a href="/posts/a/">Post A</a></li>' +
    '</ul>'
  );
});

test('explorer isolates locales and tolerates null top-level parentLink', async () => {
  const gen = await loadGen('explorer');
  const html = await gen({ page: MODEL.pages[9], site: MODEL, params: {}, i18n: k => k });
  assert.equal(
    html,
    '<ul class="explorer-tree">' +
    '<li class="explorer-node"><details open><summary><a href="/ru/posts/">Записи</a></summary><ul>' +
    '<li><a href="/ru/posts/б/">Пост Б</a></li>' +
    '</ul></details></li>' +
    '</ul>'
  );
  assert.ok(!html.includes('/posts/a/'), 'no en links leak into ru tree');
});

test('explorer escapes attribute and text interpolations', async () => {
  const gen = await loadGen('explorer');
  const spiky = {
    config: MODEL.config,
    pages: [
      pg("en", "/p/o'brien/", { title: 'Q & <R> "S"', isSection: true, parentLink: null }),
      pg("en", "/p/o'brien/x/", { title: "Won't", parentLink: "/p/o'brien/" }),
    ],
  };
  const html = await gen({ page: spiky.pages[1], site: spiky, params: {}, i18n: k => k });
  assert.ok(html.includes('<summary><a href="/p/o&#39;brien/">Q &amp; &lt;R&gt; &quot;S&quot;</a></summary>'));
  assert.ok(html.includes('<li><a href="/p/o&#39;brien/x/">Won&#39;t</a></li>'));
  assert.ok(!html.includes(`href="/p/o'brien/`), 'no raw apostrophe in href attributes');
  assert.ok(!html.includes('"S"') , 'no raw double quotes from titles outside entities');
});

test('explorer returns empty string for a leafless root section or pageless locale', async () => {
  const gen = await loadGen('explorer');
  const hollow = {
    config: MODEL.config,
    pages: [pg('en', '/', { title: 'Home', isSection: true }), pg('en', '/empty/', { title: 'Empty', isSection: true, parentLink: '/' })],
  };
  assert.equal(await gen({ page: hollow.pages[1], site: hollow, params: { root: '/empty/' }, i18n: k => k }), '');
  const enOnly = {
    config: MODEL.config,
    pages: [pg('en', '/', { title: 'Home', isSection: true }), pg('en', '/a/', { title: 'A', parentLink: '/' })],
  };
  assert.equal(await gen({ page: pg('ru', '/ru/'), site: enOnly, params: {}, i18n: k => k }), '');
});
