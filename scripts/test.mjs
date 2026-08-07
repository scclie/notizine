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
assert(indexHtml.includes('<p>Welcome'), 'Center slot renders content in index.html');

const assetsJsonPath = join(process.cwd(), 'assets', '.cache', 'per-page-assets.json');
assert(existsSync(assetsJsonPath), 'per-page-assets.json exists after build');

// Test: page without companion files has no unwanted artifacts
const postsHtml = readFileSync(join(PUBLIC, 'posts', 'hello-world', 'index.html'), 'utf-8');
const injectedCount = (postsHtml.match(/per-page-assets/g) || []).length;
assert(injectedCount === 0, 'Pages without companion files have no per-page-assets references');
// 1. Content not duplicated (task-2: body text should appear exactly once)
const helloHtml = readFileSync(join(PUBLIC, 'posts', 'hello-world', 'index.html'), 'utf-8');
const bodyCount = (helloHtml.match(/Hello! This is an example post/g) || []).length;
assert(bodyCount === 1, 'Content body not duplicated in post page');

// 2. .recent-meta used instead of <time> for recents display
const recentsHtml = readFileSync(join(PUBLIC, 'recents', 'index.html'), 'utf-8');
const recentMetaCount = (recentsHtml.match(/class="recent-meta"/g) || []).length;
assert(recentMetaCount > 0, '.recent-meta present in output');

// 3. per-page-assets.json has wordcount/readtime for a known page
const assetsJson = JSON.parse(readFileSync(join(process.cwd(), 'assets', '.cache', 'per-page-assets.json'), 'utf-8'));
const helloKey = '/posts/hello-world/';
assert(typeof assetsJson[helloKey].wordcount === 'number', 'Page has wordcount');
assert(typeof assetsJson[helloKey].readtime === 'number', 'Page has readtime');

// section.shtml renders subpages
const postsSectionHtml = readFileSync(join(PUBLIC, 'posts', 'index.html'), 'utf-8');
assert(postsSectionHtml.includes('Hello, World!'), 'Posts section lists subpages');

// _recents uses section-based filtering (no URL filter)
assert(!recentsHtml.includes('/tags/"'), 'No tags link in recents items');
assert(!recentsHtml.includes('/search/'), 'No search link in recents items');

// No _recents URL filter remnants in base.shtml (explorer filters are separate)
const baseHtml = readFileSync(join(process.cwd(), 'layouts', 'templates', 'base.shtml'), 'utf-8');
const oldRecentsFilter = (baseHtml.match(/endsWith\('posts\/'\)/g) || []).length;
assert(oldRecentsFilter === 0, 'No _recents URL filter remnants in base.shtml');

console.log(`[test] ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
