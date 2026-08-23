import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const loadGen = async name => (await import(new URL(`../../../modules/${name}/generator.mjs`, import.meta.url).href)).default;

function leaf(locale, link, extra = {}) {
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
    leaf('en', '/posts/', { title: 'Posts', isSection: true }),
    leaf('en', '/posts/a/', { title: 'Post A', date: '2025-03-12', parentLink: '/posts/', readtime: 3, wordcount: 600 }),
    leaf('en', '/posts/b/', { title: 'Post B', date: '2025-02-10', parentLink: '/posts/' }),
    leaf('en', '/posts/c/', { title: 'Post C', date: '2025-01-05', parentLink: '/posts/' }),
    leaf('en', '/about/', { title: 'About', parentLink: '/' }),
    leaf('ru', '/ru/posts/', { title: 'Записи', isSection: true }),
    leaf('ru', '/ru/posts/а/', { title: 'Пост А', date: '2025-04-01', parentLink: '/ru/posts/' }),
    leaf('en', '/empty/', { title: 'Empty', isSection: true }),
  ],
};

const t = map => key => map[key] ?? key;
const I18N = t({ recents_title: 'Recent Notes', see_more: 'See more', random_note: 'random note', min_short: 'min', words_short: 'words' });

test('recents renders items with data-urls JSON of every section link', async () => {
  const gen = await loadGen('recents');
  const html = await gen({
    page: MODEL.pages[1],
    site: MODEL,
    params: { section: '/posts/' },
    i18n: I18N,
  });
  assert.equal(
    html,
    '<div class="module module-recents"><h3 class="recents-title">Recent Notes</h3>' +
    '<div class="recent-item"><a href="/posts/a/">Post A</a></div>' +
    '<div class="recent-item"><a href="/posts/b/">Post B</a></div>' +
    '<div class="recent-item"><a href="/posts/c/">Post C</a></div>' +
    '<div class="recent-footer"><div class="recent-footer-top"><a href="/posts/" class="see-more">See more</a>' +
    '<a href="#" class="random-note" data-urls="[&quot;/posts/a/&quot;,&quot;/posts/b/&quot;,&quot;/posts/c/&quot;]">random note</a></div>' +
    '<div class="recent-footer-bottom"><a href="/posts/b/" class="recent-nav-prev">prev_short</a><span class="flex-spacer"></span></div></div></div>'
  );
  const urlsAttr = html.match(/data-urls="([^"]*)"/);
  assert.ok(urlsAttr, 'data-urls attribute present');
  assert.deepEqual(
    JSON.parse(urlsAttr[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')),
    ['/posts/a/', '/posts/b/', '/posts/c/']
  );
});

test('recents filters by page locale and escapes titles', async () => {
  const gen = await loadGen('recents');
  const ru = await gen({
    page: MODEL.pages[6],
    site: MODEL,
    params: { section: '/ru/posts/' },
    i18n: I18N,
  });
  assert.ok(ru.includes('href="/ru/posts/а/">Пост А</a>'));
  assert.deepEqual(
    JSON.parse(ru.match(/data-urls="([^"]*)"/)[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')),
    ['/ru/posts/а/']
  );
  assert.ok(!ru.includes('/posts/a/'));
});

test('recents show flags compose recent-meta bits and count slices list', async () => {
  const gen = await loadGen('recents');
  const both = await gen({
    page: MODEL.pages[1],
    site: MODEL,
    params: { section: '/posts/', show: ['date', 'meta'], title: 'Latest' },
    i18n: I18N,
  });
  assert.ok(both.includes('<h3 class="recents-title">Latest</h3>'));
  assert.ok(both.includes('<div class="recent-meta">Mar 12, 2025 | 3 min | 600 words</div>'));
  const dateOnly = await gen({
    page: MODEL.pages[1],
    site: MODEL,
    params: { section: '/posts/', show: ['date'] },
    i18n: I18N,
  });
  assert.ok(dateOnly.includes('<div class="recent-meta">Mar 12, 2025</div>'));
  assert.ok(!dateOnly.includes('min'));
  const bare = await gen({
    page: MODEL.pages[1],
    site: MODEL,
    params: { section: '/posts/', count: 2 },
    i18n: I18N,
  });
  assert.equal(bare.match(/class="recent-item"/g).length, 2);
  assert.ok(!bare.includes('recent-meta'));
});

test('recents throws for unknown section and returns empty for leafless one', async () => {
  const gen = await loadGen('recents');
  await assert.rejects(
    () => gen({ page: MODEL.pages[1], site: MODEL, params: { section: '/nope/' }, i18n: I18N }),
    /section "\/nope\/" not found/
  );
  assert.equal(await gen({ page: MODEL.pages[1], site: MODEL, params: { section: '/empty/' }, i18n: I18N }), '');
});

test('recents escapes apostrophes inside data-urls and href attributes', async () => {
  const gen = await loadGen('recents');
  const spiky = {
    config: MODEL.config,
    pages: [
      leaf('en', "/p/it's/", { title: "Don't", isSection: true }),
      leaf('en', "/p/it's/a/", { title: "Won't", date: '2025-03-12', parentLink: "/p/it's/" }),
    ],
  };
  const html = await gen({ page: spiky.pages[1], site: spiky, params: { section: "/p/it's/" }, i18n: I18N });
  const attr = html.match(/data-urls="([^"]*)"/);
  assert.ok(attr, 'double-quoted data-urls attribute present');
  assert.ok(!attr[1].includes("'"), 'no raw single quote inside attribute value');
  assert.ok(!html.includes(`href="/p/it's/"`), 'no raw single quote in href');
  const decoded = JSON.parse(attr[1]
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&'));
  assert.deepEqual(decoded, ["/p/it's/a/"]);
});

test('random-note ships delegated client reading data-urls', () => {
  const client = readFileSync(join(REPO, 'modules', 'recents', 'client.js'), 'utf-8');
  assert.ok(client.includes("addEventListener('click'"), 'delegated document-level listener');
  assert.ok(client.includes("closest('.random-note')"));
  assert.ok(client.includes('dataset.urls'));
});
