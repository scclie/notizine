import { existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = process.cwd();

async function main() {
  console.log('[build] Starting...');

  const skipGen = process.argv.includes('--skip-generate');
  if (!skipGen) {
    console.log('[build] Step 1/4: generate');
    await import('./generate.mjs');
  } else {
    console.log('[build] Skipping generation (--skip-generate)');
  }

  console.log('[build] Step 2/4: zine release');
  execSync('zine release --force', { stdio: 'inherit', cwd: ROOT });

  console.log('[build] Step 2.5/4: OG images');
  const ogSource = join(ROOT, 'assets', '.cache', 'og-images');
  if (existsSync(ogSource) && readdirSync(ogSource).length > 0) {
    execSync('cp -r assets/.cache/og-images/* public/', { stdio: 'inherit', cwd: ROOT });
  } else {
    console.log('[build] No OG images to copy (disabled or no pages with titles)');
  }

  console.log('[build] Step 2.7/4: 404 page');
  const notFoundSrc = join(ROOT, 'public', '404', 'index.html');
  if (existsSync(notFoundSrc)) {
    const { copyFileSync: cp } = await import('node:fs');
    cp(notFoundSrc, join(ROOT, 'public', '404.html'));
    console.log('[404] public/404.html written');
  } else {
    console.log('[404] No /404/ page in content, skipping');
  }

  console.log('[build] Step 3/4: purge');
  const { default: purge } = await import('./purge.mjs');
  await purge(join(ROOT, 'public'));

  console.log('[build] Step 4/4: process images');
  const { default: processImages } = await import('./process-images.mjs');
  await processImages(join(ROOT, 'public'));

  console.log('[build] Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
