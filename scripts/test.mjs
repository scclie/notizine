import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const PUBLIC = join(process.cwd(), 'public');
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log(`  PASS ${msg}`); }
  else { failed++; console.error(`  FAIL ${msg}`); }
}

function findAllHTML(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...findAllHTML(full));
    } else if (extname(entry) === '.html') {
      results.push(full);
    }
  }
  return results;
}

console.log('[test] Checking...');

const htmlFiles = findAllHTML(PUBLIC);
console.log(`[test] Found ${htmlFiles.length} HTML files`);

for (const file of htmlFiles) {
  const content = readFileSync(file, 'utf-8');
  const rel = file.replace(PUBLIC, '');

  const emptyStyle = content.match(/<style><\/style>/g) || [];
  assert(emptyStyle.length === 0, `No empty <style> in ${rel}`);

  const emDash = content.match(/[\u2014\u2013]/g) || [];
  assert(emDash.length === 0, `No em-dash in ${rel}`);
}

const expectedHtmlRoutes = [
  '/404.html',
  '/404/index.html',
  '/about/index.html',
  '/explorer/index.html',
  '/index.html',
  '/posts/first-post/index.html',
  '/posts/index.html',
  '/recents/index.html',
  '/search/index.html',
  '/tags/index.html',
].sort();
const actualHtmlRoutes = htmlFiles.map(file => file.slice(PUBLIC.length)).sort();
assert(
  JSON.stringify(actualHtmlRoutes) === JSON.stringify(expectedHtmlRoutes),
  'Generated HTML routes exactly match the compact route matrix and 404 alias',
);

// The compact personal starter exposes exactly the supported public route matrix.
const requiredRoutes = [
  ['home', join(PUBLIC, 'index.html')],
  ['posts section', join(PUBLIC, 'posts', 'index.html')],
  ['first post', join(PUBLIC, 'posts', 'first-post', 'index.html')],
  ['about', join(PUBLIC, 'about', 'index.html')],
  ['search', join(PUBLIC, 'search', 'index.html')],
  ['tags', join(PUBLIC, 'tags', 'index.html')],
  ['recents', join(PUBLIC, 'recents', 'index.html')],
  ['explorer', join(PUBLIC, 'explorer', 'index.html')],
  ['404', join(PUBLIC, '404', 'index.html')],
];
for (const [name, route] of requiredRoutes) {
  assert(existsSync(route), `${name} route exists`);
}

const removedRoutes = [
  ['notes', join(PUBLIC, 'notes', 'index.html')],
  ['updates', join(PUBLIC, 'updates', 'index.html')],
  ['notes modules', join(PUBLIC, 'notes', 'modules', 'index.html')],
  ['notes delivery', join(PUBLIC, 'notes', 'delivery', 'index.html')],
  ['notes validation and performance', join(PUBLIC, 'notes', 'validation-and-performance', 'index.html')],
];
for (const [name, route] of removedRoutes) {
  assert(!existsSync(route), `${name} route is absent`);
}
for (const directory of ['notes', 'updates']) {
  assert(!existsSync(join(PUBLIC, directory)), `${directory} output directory is absent`);
}

const indexHtml = readFileSync(join(PUBLIC, 'index.html'), 'utf-8');
for (const [name, file] of [['home', 'index.html'], ['about', 'about/index.html']]) {
  assert(!/<script[^>]+src="[^"]*search\.js"/.test(readFileSync(join(PUBLIC, file), 'utf8')),
    `${name} does not load the search client or index`);
}
const searchHtml = readFileSync(join(PUBLIC, 'search/index.html'), 'utf8');
assert(searchHtml.includes('class="search-widget"'), 'Search page renders its widget');
assert(searchHtml.indexOf('src="/.cache/search.js"') >= 0
  && searchHtml.indexOf('src="/.cache/search.js"') < searchHtml.indexOf('src="/assets/modules/search.js"'),
  'Search index loads before its client on the search page');
assert(indexHtml.includes('welcome'), 'Home renders the personal welcome');
assert(indexHtml.includes('href="/posts/"'), 'Home links to posts');
assert(indexHtml.includes('href="/about/"'), 'Home links to about');

const gridCells = [
  'top-left', 'top-center', 'top-right',
  'middle-left', 'middle-center', 'middle-right',
  'bottom-left', 'bottom-center', 'bottom-right',
];
for (const cell of gridCells) {
  assert(indexHtml.includes(`grid-cell-${cell}`), `grid-cell-${cell} renders in index.html`);
}
assert(!/\bzone-(left|center|right)\b/.test(indexHtml), 'No legacy structural zone classes render in index.html');

const assetsJsonPath = join(process.cwd(), 'assets', '.cache', 'per-page-assets.json');
assert(existsSync(assetsJsonPath), 'per-page-assets.json exists after build');

const firstPostPath = join(PUBLIC, 'posts', 'first-post', 'index.html');
const firstPostHtml = existsSync(firstPostPath) ? readFileSync(firstPostPath, 'utf-8') : '';
const injectedCount = (firstPostHtml.match(/per-page-assets/g) || []).length;
assert(injectedCount === 0, 'First post has no per-page-assets references');
assert(firstPostHtml.includes('first post'), 'First post renders its title');
assert(
  firstPostHtml.includes('<nav class="breadcrumbs"><a href="/">home</a><span class="crumb-sep" aria-hidden="true">›</span><a href="/posts/">posts</a><span class="crumb-sep" aria-hidden="true">›</span><span>first post</span></nav>'),
  'First post renders the generated › breadcrumb',
);
const firstPostCss = [...firstPostHtml.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
  .map(match => match[1]).join('\n');
assert(
  /\.breadcrumbs\s+:is\(a,\s*span:not\(\.crumb-sep\)\)\s*\{[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*anywhere(?:;|\})/.test(firstPostCss),
  'Built first-post CSS preserves the descendant selector for long breadcrumb label wrapping',
);
const footerHtml = firstPostHtml.match(/<footer\b[^>]*>[\s\S]*?<\/footer>/)?.[0] ?? '';
assert(footerHtml.includes('class="footer-text"'), 'First post renders the compact footer text');
assert(!footerHtml.includes('module-badges'), 'First post footer has no badges');
assert(!footerHtml.includes('notizine'), 'First post footer has no attribution');
assert(firstPostHtml.includes('<time>2026-10-11</time>'), 'First post renders its date');
assert(
  firstPostHtml.includes('href="/tags/?tag=personal"')
    && firstPostHtml.includes('href="/tags/?tag=notes"'),
  'First post renders its tags',
);
assert(firstPostHtml.includes('<a href="/about/">about page</a>'), 'First post renders its link');
assert(/<pre><code(?:\s[^>]*)?>/.test(firstPostHtml), 'First post renders its fenced code block');

const recentsHtml = readFileSync(join(PUBLIC, 'recents', 'index.html'), 'utf-8');
const recentMetaCount = (recentsHtml.match(/class="recent-meta"/g) || []).length;
assert(recentMetaCount > 0, '.recent-meta present in output');

const assetsJson = JSON.parse(readFileSync(assetsJsonPath, 'utf-8'));
const firstPostKey = '/posts/first-post/';
assert(typeof assetsJson[firstPostKey]?.wordcount === 'number', 'First post has wordcount');
assert(typeof assetsJson[firstPostKey]?.readtime === 'number', 'First post has readtime');

const postsSectionHtml = readFileSync(join(PUBLIC, 'posts', 'index.html'), 'utf-8');
assert(postsSectionHtml.includes('first post'), 'Posts section lists the first post');

// _recents uses section-based filtering (no URL filter); scope to widget items.
const recentItemLinks = [...recentsHtml.matchAll(/<div class="recent-item"><a href="([^"]*)"/g)].map(m => m[1]);
assert(recentItemLinks.includes('/posts/first-post/'), 'recents includes the first post');
assert(!recentItemLinks.some(l => l.includes('/tags/') || l.includes('/search/')), 'No tags/search link in recents items');

// No _recents URL filter remnants in base.shtml (explorer filters are separate).
const baseHtml = readFileSync(join(process.cwd(), 'layouts', 'templates', 'base.shtml'), 'utf-8');
const oldRecentsFilter = (baseHtml.match(/endsWith\('posts\/'\)/g) || []).length;
assert(oldRecentsFilter === 0, 'No _recents URL filter remnants in base.shtml');
assert(baseHtml.includes('<!-- notizine-performance:critical-shell:start -->'), 'Performance critical-shell start marker exists in base.shtml');
assert(baseHtml.includes('<!-- notizine-performance:critical-shell:end -->'), 'Performance critical-shell end marker exists in base.shtml');
assert(baseHtml.includes('<!-- notizine-performance:page-body:start -->'), 'Performance page-body start marker exists in base.shtml');
assert(baseHtml.includes('<!-- notizine-performance:page-body:end -->'), 'Performance page-body end marker exists in base.shtml');

const configSource = readFileSync(join(process.cwd(), 'assets', 'notizine.ziggy'), 'utf-8');
const gridCellNames = [
  'top_left', 'top_center', 'top_right',
  'middle_left', 'middle_center', 'middle_right',
  'bottom_left', 'bottom_center', 'bottom_right',
];
const rootSlotsSource = configSource.match(/"slots": \{([\s\S]*?)\n  \},/)?.[1] ?? '';
for (const cell of gridCellNames) {
  assert(new RegExp(`"${cell}"\\s*:`).test(rootSlotsSource), `Personal starter slots explicitly include ${cell}`);
}
assert(rootSlotsSource.includes('"module": "_explorer", "root": "/"'), 'Personal starter explorer is rooted at /');
assert(rootSlotsSource.includes('"module": "_recents", "section": "/posts/"'), 'Personal starter recents are rooted at /posts/');
assert(!configSource.includes('"module": "active_modules"'), 'Personal starter omits active_modules');
assert(!configSource.includes('"module": "badges"'), 'Personal starter omits promotional badges');
assert(!configSource.includes('"module": "_rss_link"'), 'Personal starter omits the RSS footer link');
assert(!configSource.includes('"/notes/modules/"'), 'Personal starter omits the module-catalog override');

const searchOverrideSource = configSource.match(/"\/search\/": \{([\s\S]*?)\n    \}\n  \}/)?.[1] ?? '';
if (searchOverrideSource) {
  for (const cell of gridCellNames) {
    assert(new RegExp(`"${cell}"\\s*:`).test(searchOverrideSource), `Search override explicitly includes ${cell}`);
  }
  assert(!searchOverrideSource.includes('"module": "active_modules"'), 'Search override omits active_modules');
  assert(!searchOverrideSource.includes('"module": "badges"'), 'Search override omits promotional badges');
  assert(!searchOverrideSource.includes('"module": "_rss_link"'), 'Search override omits the RSS footer link');
}

console.log(`[test] ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
