import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

export default async function processImages(publicDir) {
  const ROOT = process.cwd();
  const CACHE_DIR = join(ROOT, 'assets', '.cache');
  const mapPath = join(CACHE_DIR, 'image-map.json');
  if (!existsSync(mapPath)) {
    console.log('[process-images] No image mappings, skipping');
    return;
  }
  const mappings = JSON.parse(readFileSync(mapPath, 'utf-8'));

  let copied = 0;
  for (const [pageLink, pageMappings] of Object.entries(mappings)) {
    const pageDir = join(publicDir, pageLink.replace(/^\//, ''));
    const htmlPath = join(pageDir, 'index.html');
    if (!existsSync(htmlPath)) {
      console.warn(`[process-images] No index.html for ${pageLink}`);
      continue;
    }
    let html = readFileSync(htmlPath, 'utf-8');

    for (const mapping of pageMappings) {
      if (!html.includes(mapping.original)) continue;
      html = html.replaceAll(mapping.original, mapping.replacement);
      const destPath = join(pageDir, mapping.destName);
      if (!existsSync(destPath)) {
        mkdirSync(dirname(destPath), { recursive: true });
        copyFileSync(mapping.sourcePath, destPath);
        copied++;
      }
    }

    writeFileSync(htmlPath, html);
  }

  console.log(`[process-images] Copied ${copied} images to output`);
}
