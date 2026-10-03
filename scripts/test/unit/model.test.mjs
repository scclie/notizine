import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildModel } from '../../lib/model.mjs';

const fixtureRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

const cfg = {
  site: {
    locales: [
      { code: 'en', site_title: 'notizine', content_dir_path: 'content/en', output_prefix_override: '' },
    ],
  },
};

test('buildModel walks fixtures into a page tree', () => {
  const model = buildModel(cfg, fixtureRoot);
  assert.equal(model.config, cfg);
  const post = model.pages.find(p => p.link === '/posts/a/');
  assert.equal(post.parentLink, '/posts/');
  assert.equal(post.isSection, false);
  assert.deepEqual(post.tags, ['x']);
  assert.ok(post.wordcount > 0);
  assert.equal(post.title, 'Post A');
  assert.equal(post.date, '2026-02-01T00:00:00');
  assert.ok(post.filePath.endsWith(join('content', 'en', 'posts', 'a.smd')));
  assert.ok(post.readtime >= 1);
});

test('section index is marked isSection with null parentLink', () => {
  const model = buildModel(cfg, fixtureRoot);
  const section = model.pages.find(p => p.link === '/posts/');
  assert.equal(section.isSection, true);
  assert.equal(section.parentLink, null);
  assert.equal(section.title, 'Posts');
});

test('root page has null parentLink and unprefixed link', () => {
  const model = buildModel(cfg, fixtureRoot);
  const about = model.pages.find(p => p.link === '/about/');
  assert.equal(about.parentLink, null);
  assert.equal(about.isSection, false);
});

test('pages get locale code prefix without output_prefix_override', () => {
  const cfgRu = {
    site: {
      locales: [{ code: 'ru', site_title: 'notizine', content_dir_path: 'content/en' }],
    },
  };
  const model = buildModel(cfgRu, fixtureRoot);
  assert.ok(model.pages.some(p => p.link === '/ru/about/'));
  assert.ok(model.pages.some(p => p.link === '/ru/posts/b/'));
});

test('pages preserve arbitrary parsed frontmatter under meta', () => {
  const root = '/tmp/opencode/notizine-model-meta';
  const content = join(root, 'content', 'en');
  mkdirSync(content, { recursive: true });
  writeFileSync(join(content, 'post.smd'), `---
.title = "Metadata post",
.shitpostness = "maximum",
.rating = 11,
.flags = ["loud", "unserious"],
---

Content.`);
  const model = buildModel({ site: { locales: [
    { code: 'en', content_dir_path: 'content/en', output_prefix_override: '' },
  ] } }, root);
  const page = model.pages.find(item => item.link === '/post/');

  assert.equal(page.title, 'Metadata post');
  assert.deepEqual(page.meta, {
    shitpostness: 'maximum',
    rating: 11,
    flags: ['loud', 'unserious'],
  });
});
