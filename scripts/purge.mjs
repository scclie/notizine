import { PurgeCSS } from 'purgecss';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

export default async function purge(publicDir) {
  const manifestPath = join(process.cwd(), 'assets', '.cache', 'manifest.json');
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf-8')) : null;

  const htmlFiles = findAllHTML(publicDir);
  console.log(`[purge] Processing ${htmlFiles.length} files...`);

  let totalBefore = 0, totalAfter = 0;

  for (const file of htmlFiles) {
    let html = readFileSync(file, 'utf-8');

    const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/);
    if (!styleMatch) continue;

    const originalCSS = styleMatch[1];
    totalBefore += originalCSS.length;

    const purgeResults = await new PurgeCSS().purge({
      content: [{ raw: html, extension: 'html' }],
      css: [{ raw: originalCSS }],
      safelist: {
        standard: [
          /^:root/, /^\*/, /^html/, /^body/,
          /::-webkit-scrollbar/, /^::selection/,
          /^@media/, /^@keyframes/,
          /\.module/, /\.align-/, /\.slot/, /\.zone/,
          /\.flex-spacer/, /\.sr-only/,
        ],
      },
      defaultExtractor: content => content.match(/[\w-/:]+(?<!:)/g) || [],
    });

    const purged = purgeResults[0]?.css || originalCSS;
    const minified = minifyCSS(purged);
    totalAfter += minified.length;

    html = html.replace(styleMatch[0], `<style>${minified}</style>`);
    writeFileSync(file, html);
  }

  const saved = totalBefore - totalAfter;
  console.log(`[purge] CSS: ${(totalBefore/1024).toFixed(1)}KB -> ${(totalAfter/1024).toFixed(1)}KB (saved ${(saved/1024).toFixed(1)}KB)`);
}

function findAllHTML(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...findAllHTML(full));
    } else if (extname(entry) === '.html') {
      results.push(full);
    }
  }
  return results;
}

function minifyCSS(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}
