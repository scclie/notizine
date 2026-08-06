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

console.log(`[test] ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
