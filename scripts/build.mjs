import { execSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = process.cwd();

async function main() {
  console.log('[build] Starting...');

  const skipGen = process.argv.includes('--skip-generate');
  if (!skipGen) {
    console.log('[build] Step 1/3: generate');
    await import('./generate.mjs');
  } else {
    console.log('[build] Skipping generation (--skip-generate)');
  }

  console.log('[build] Step 2/3: zine release');
  execSync('zine release --force', { stdio: 'inherit', cwd: ROOT });

  console.log('[build] Step 3/3: purge');
  const { default: purge } = await import('./purge.mjs');
  await purge(join(ROOT, 'public'));

  console.log('[build] Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
