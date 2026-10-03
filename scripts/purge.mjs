import { PurgeCSS } from 'purgecss';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const SAFELIST = {
  standard: [
    /^:root/, /^\*/, /^html/, /^body/,
    /::-webkit-scrollbar/, /^::selection/,
    /^@media/, /^@keyframes/,
    /\.module/, /\.align-/, /\.slot/, /\.zone/,
    /\.flex-spacer/, /\.sr-only/,
    /^\[data-theme/,
  ],
};

const EXTRACTOR = content => content.match(/[\w-/:]+(?<!:)/g) || [];

export default async function purge(publicDir) {
  const manifestPath = join(process.cwd(), 'assets', '.cache', 'manifest.json');
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf-8')) : null;

  const htmlFiles = findAllHTML(publicDir);
  console.log(`[purge] Processing ${htmlFiles.length} files...`);

  const htmlByFile = htmlFiles.map(file => {
    const html = readFileSync(file, 'utf-8');
    return {
      file,
      html,
      content: html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ''),
    };
  });
  let totalBefore = 0, totalAfter = 0;

  for (const page of htmlByFile) {
    const styles = [...page.html.matchAll(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi)];
    if (styles.length === 0) continue;

    let offset = 0;
    let html = page.html;
    for (const style of styles) {
      const [full, openTag, originalCSS, closeTag] = style;
      totalBefore += originalCSS.length;
      const purgeResults = await new PurgeCSS().purge({
        content: [{ raw: page.content, extension: 'html' }],
        css: [{ raw: originalCSS }],
        safelist: SAFELIST,
        defaultExtractor: EXTRACTOR,
      });
      const minified = minifyCSS(purgeResults[0]?.css || originalCSS);
      totalAfter += minified.length;
      const replacement = `${openTag}${minified}${closeTag}`;
      const start = style.index + offset;
      html = html.slice(0, start) + replacement + html.slice(start + full.length);
      offset += replacement.length - full.length;
    }
    writeFileSync(page.file, html);
  }

  const saved = totalBefore - totalAfter;
  console.log(`[purge] CSS: ${(totalBefore/1024).toFixed(1)}KB -> ${(totalAfter/1024).toFixed(1)}KB (saved ${(saved/1024).toFixed(1)}KB)`);

  const linkedSaved = await purgeGenerated(publicDir, htmlByFile);
  if (htmlByFile.length > 0) {
    console.log(`[purge] generated.css: purged against ${htmlByFile.length} files (saved ${(linkedSaved/1024).toFixed(1)}KB)`);
  }
}

async function purgeGenerated(publicDir, htmlPages) {
  if (htmlPages.length === 0) return 0;
  const cssPath = join(publicDir, 'assets', 'css', 'generated.css');
  if (!existsSync(cssPath)) return 0;
  const originalCSS = readFileSync(cssPath, 'utf-8');
  const content = htmlPages.map(({ content: html }) => ({
    raw: html,
    extension: 'html',
  }));
  const purgeResults = await new PurgeCSS().purge({
    content,
    css: [{ raw: originalCSS }],
    safelist: SAFELIST,
    defaultExtractor: EXTRACTOR,
  });
  const purged = purgeResults[0]?.css || originalCSS;
  const minified = minifyCSS(purged);
  writeFileSync(cssPath, minified);
  return originalCSS.length - minified.length;
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
