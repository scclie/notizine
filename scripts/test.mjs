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

// Test: center slot renders content
const indexHtml = readFileSync(join(PUBLIC, 'index.html'), 'utf-8');
assert(indexHtml.includes('is a starter'), 'Center slot renders content in index.html');

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

// Test: page without companion files has no unwanted artifacts
const postsHtml = readFileSync(join(PUBLIC, 'notes', 'getting-started', 'index.html'), 'utf-8');
const injectedCount = (postsHtml.match(/per-page-assets/g) || []).length;
assert(injectedCount === 0, 'Pages without companion files have no per-page-assets references');
// 1. Content not duplicated (task-2: body text should appear exactly once)
const helloHtml = readFileSync(join(PUBLIC, 'notes', 'getting-started', 'index.html'), 'utf-8');
  const bodyCount = (helloHtml.match(/nix-shell/g) || []).length;
assert(bodyCount === 1, 'Content body not duplicated in docs page');

// 2. .recent-meta used instead of <time> for recents display
const recentsHtml = readFileSync(join(PUBLIC, 'recents', 'index.html'), 'utf-8');
const recentMetaCount = (recentsHtml.match(/class="recent-meta"/g) || []).length;
assert(recentMetaCount > 0, '.recent-meta present in output');

// 3. per-page-assets.json has wordcount/readtime for a known page
const assetsJson = JSON.parse(readFileSync(join(process.cwd(), 'assets', '.cache', 'per-page-assets.json'), 'utf-8'));
const helloKey = '/notes/getting-started/';
assert(typeof assetsJson[helloKey].wordcount === 'number', 'Page has wordcount');
assert(typeof assetsJson[helloKey].readtime === 'number', 'Page has readtime');

// section.shtml renders subpages
const updatesSectionHtml = readFileSync(join(PUBLIC, 'updates', 'index.html'), 'utf-8');
assert(updatesSectionHtml.includes('Module engine'), 'Updates section lists subpages');

const postsSectionHtml = readFileSync(join(PUBLIC, 'posts', 'index.html'), 'utf-8');
assert(postsSectionHtml.includes('Posts'), 'Section without custom.view renders through section.shtml');

// _recents uses section-based filtering (no URL filter); scope to widget items
// (explorer in the sidebar may legitimately link /tags/ and /search/)
const recentItemLinks = [...recentsHtml.matchAll(/<div class="recent-item"><a href="([^"]*)"/g)].map(m => m[1]);
assert(recentItemLinks.length > 0, 'recents items have links');
assert(!recentItemLinks.some(l => l.includes('/tags/') || l.includes('/search/')), 'No tags/search link in recents items');

// No _recents URL filter remnants in base.shtml (explorer filters are separate)
const baseHtml = readFileSync(join(process.cwd(), 'layouts', 'templates', 'base.shtml'), 'utf-8');
const oldRecentsFilter = (baseHtml.match(/endsWith\('posts\/'\)/g) || []).length;
assert(oldRecentsFilter === 0, 'No _recents URL filter remnants in base.shtml');

console.log(`[test] ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
