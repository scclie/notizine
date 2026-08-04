import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname, dirname, relative } from 'node:path';

export default function injectZones(publicDir) {
  const ROOT = process.cwd();
  const ZONES_DIR = join(ROOT, 'assets', '.cache', 'zones');
  if (!existsSync(ZONES_DIR)) {
    console.log('[inject-zones] No zone cache, skipping');
    return [];
  }

  const htmlFiles = findAllHTML(publicDir);
  const zoneNames = ['header', 'before_main', 'left', 'right', 'after_main', 'footer'];

  for (const htmlFile of htmlFiles) {
    let html = readFileSync(htmlFile, 'utf-8');

    const relPath = relative(publicDir, htmlFile);
    const dirLink = dirname(relPath).replace(/\\/g, '/');
    const pageLink = dirLink === '.' ? '/' : (dirLink + '/');

    for (const zoneName of zoneNames) {
      const placeholder = `<!-- ZONE:${zoneName} -->`;
      if (!html.includes(placeholder)) continue;

      const clean = pageLink === '/' ? 'index' : pageLink.replace(/^\//, '');
      let zonePath = join(ZONES_DIR, clean, zoneName + '.html');
      if (!existsSync(zonePath)) {
        const cleanNoSlash = clean.replace(/\/$/, '');
        zonePath = join(ZONES_DIR, cleanNoSlash, zoneName + '.html');
        if (!existsSync(zonePath)) continue;
      }
      const zoneHtml = readFileSync(zonePath, 'utf-8');
      html = html.replace(placeholder, zoneHtml);
    }

    writeFileSync(htmlFile, html);
  }
}

function findAllHTML(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) results.push(...findAllHTML(full));
    else if (extname(entry) === '.html') results.push(full);
  }
  return results;
}
