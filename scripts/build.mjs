import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { preprocess as mermaidPreprocess, postprocess as mermaidPostprocess } from './lib/mermaid.mjs';

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

  console.log('[build] Step 1.5/4: mermaid preprocess');
  const { preprocess: mermaidPre } = await import('./lib/mermaid.mjs');
  const contentDir = join(ROOT, 'content');
  const smdFiles = [];
  const collectSMD = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) collectSMD(full);
      else if (entry.name.endsWith('.smd')) smdFiles.push(full);
    }
  };
  collectSMD(contentDir);
  let mermaidCount = 0;
  for (const file of smdFiles) {
    const raw = readFileSync(file, 'utf-8');
    const processed = mermaidPre(raw);
    if (processed !== raw) {
      writeFileSync(file, processed);
      mermaidCount++;
    }
  }
  if (mermaidCount > 0) console.log(`[mermaid] Preprocessed ${mermaidCount} files`);

  console.log('[build] Step 2/4: zine build');
  execSync('zine release --force', { stdio: 'inherit', cwd: ROOT });

  console.log('[build] Step 2.5/4: OG images');
  const ogSource = join(ROOT, 'assets', '.cache', 'og-images');
  if (existsSync(ogSource) && readdirSync(ogSource).length > 0) {
    execSync('cp -r assets/.cache/og-images/* public/', { stdio: 'inherit', cwd: ROOT });
  } else {
    console.log('[build] No OG images to copy (disabled or no pages with titles)');
  }

  console.log('[build] Step 2.5.1/4: badge CSS');
  const badgesCSS = join(ROOT, 'modules', 'badges', 'badges.css');
  if (existsSync(badgesCSS)) {
    execSync('mkdir -p public/badges && cp modules/badges/badges.css public/badges/badges.css', { stdio: 'inherit', cwd: ROOT });
  }

  console.log('[build] Step 2.6/4: mermaid postprocess');
  const { postprocess: mermaidPost, injectMermaidCSS } = await import('./lib/mermaid.mjs');
  const { loadConfig: loadCfg } = await import('./lib/config.mjs');
  const config = loadCfg(ROOT);
  const mermaidPages = await mermaidPost(join(ROOT, 'public'), config);
  if (mermaidPages.length > 0) {
    console.log(`[mermaid] Rendered diagrams on ${mermaidPages.length} pages`);
    const mermaidCSS = injectMermaidCSS(config);
    if (mermaidCSS) {
      for (const file of mermaidPages) {
        let html = readFileSync(file, 'utf-8');
        if (html.includes('</head>')) {
          html = html.replace('</head>', `<style>${mermaidCSS}</style></head>`);
          writeFileSync(file, html);
        }
      }
    }
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
