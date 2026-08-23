import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildModel } from '../../lib/model.mjs';
import {
  altLink,
  cacheKey,
  childSections,
  esc,
  formatDate,
  homeLink,
  requireSection,
  sectionLeaves,
  siblingsOf,
} from '../../lib/api.mjs';

const fixtureRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

const cfg = {
  site: {
    locales: [
      { code: 'en', site_title: 'notizine', content_dir_path: 'content/en', output_prefix_override: '' },
      { code: 'ru', site_title: 'notizine', content_dir_path: 'content/ru' },
    ],
  },
};

const syntheticModel = () => ({
  config: {
    site: {
      locales: [
        { code: 'en', site_title: 't', content_dir_path: 'content/en', output_prefix_override: '' },
        { code: 'ru', site_title: 't', content_dir_path: 'content/ru' },
      ],
    },
  },
  pages: [
    { locale: 'en', link: '/posts/', isSection: true, parentLink: null, date: '2026-01-01T00:00:00' },
    { locale: 'en', link: '/posts/a/', isSection: false, parentLink: '/posts/', date: '2026-02-01T00:00:00' },
    { locale: 'en', link: '/posts/b/', isSection: false, parentLink: '/posts/', date: '2026-03-01T00:00:00' },
    { locale: 'en', link: '/notes/', isSection: true, parentLink: null, date: '2026-04-01T00:00:00' },
    { locale: 'en', link: '/notes/deep/', isSection: false, parentLink: '/notes/', date: '2026-05-01T00:00:00' },
    { locale: 'en', link: '/about/', isSection: false, parentLink: null, date: '2026-06-01T00:00:00' },
    { locale: 'ru', link: '/ru/posts/', isSection: true, parentLink: null, date: '2026-01-01T00:00:00' },
    { locale: 'ru', link: '/ru/about/', isSection: false, parentLink: null, date: '2026-02-01T00:00:00' },
  ],
});

test('cacheKey maps root to index and keeps other links', () => {
  assert.equal(cacheKey('/'), 'index');
  assert.equal(cacheKey('/posts/a/'), '/posts/a/');
});

test('sectionLeaves returns non-section descendants date DESC on fixtures', () => {
  const model = buildModel(cfg, fixtureRoot);
  const leaves = sectionLeaves(model, 'en', '/posts/');
  assert.deepEqual(leaves.map(p => p.link), ['/posts/b/', '/posts/a/']);
});

test('sectionLeaves filters locale, sections and honours prefix scope', () => {
  const model = syntheticModel();
  assert.deepEqual(sectionLeaves(model, 'en', '/posts/').map(p => p.link), ['/posts/b/', '/posts/a/']);
  assert.deepEqual(sectionLeaves(model, 'en', '/').map(p => p.link), [
    '/about/',
    '/notes/deep/',
    '/posts/b/',
    '/posts/a/',
  ]);
  assert.deepEqual(sectionLeaves(model, 'ru', '/posts/'), []);
});

test('siblingsOf returns parent children date ASC on fixtures', () => {
  const model = buildModel(cfg, fixtureRoot);
  const a = model.pages.find(p => p.link === '/posts/a/');
  assert.deepEqual(siblingsOf(model, a).map(p => p.link), ['/posts/a/', '/posts/b/']);
});

test('siblingsOf excludes sections, other parents and other locales', () => {
  const model = syntheticModel();
  const a = model.pages.find(p => p.link === '/posts/a/');
  assert.deepEqual(siblingsOf(model, a).map(p => p.link), ['/posts/a/', '/posts/b/']);
});

test('childSections returns direct section children date ASC', () => {
  const model = syntheticModel();
  assert.deepEqual(childSections(model, 'en', null).map(p => p.link), ['/posts/', '/notes/']);
  assert.deepEqual(childSections(model, 'ru', null).map(p => p.link), ['/ru/posts/']);
  assert.deepEqual(childSections(model, 'en', '/posts/'), []);
});

test('formatDate renders ru and en forms', () => {
  assert.equal(formatDate('2025-03-12', 'ru'), '12 мар 2025');
  assert.equal(formatDate('2025-03-12', 'en'), 'Mar 12, 2025');
  assert.equal(formatDate('2025-01-05', 'ru'), '5 янв 2025');
  assert.equal(formatDate('not-a-date', 'ru'), '');
});

test('esc escapes html-sensitive characters', () => {
  assert.equal(esc('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  assert.equal(esc(7), '7');
});

test('homeLink derives locale home from model config', () => {
  const model = syntheticModel();
  const en = model.pages.find(p => p.link === '/about/');
  const ru = model.pages.find(p => p.link === '/ru/about/');
  assert.equal(homeLink(model, en), '/');
  assert.equal(homeLink(model, ru), '/ru/');
});

test('requireSection returns the section or throws with exact message', () => {
  const model = buildModel(cfg, fixtureRoot);
  const section = requireSection(model, 'en', '/posts/');
  assert.equal(section.link, '/posts/');
  assert.equal(section.isSection, true);
  assert.throws(() => requireSection(model, 'en', '/nope/'), {
    message: 'section "/nope/" not found',
  });
});

test('altLink finds translation or falls back to locale home', () => {
  const model = syntheticModel();
  const enAbout = model.pages.find(p => p.link === '/about/');
  const enB = model.pages.find(p => p.link === '/posts/b/');
  const ruAbout = model.pages.find(p => p.link === '/ru/about/');
  assert.equal(altLink(model, enAbout, 'ru'), '/ru/about/');
  assert.equal(altLink(model, enB, 'ru'), '/ru/');
  assert.equal(altLink(model, ruAbout, 'en'), '/about/');
});
