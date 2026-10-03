import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './lib/config.mjs';
import { auditPublicDirectory } from './lib/performance.mjs';

const ROOT = process.cwd();
const PUBLIC_DIRECTORY = join(ROOT, 'public');
const REPORT_PATH = join(PUBLIC_DIRECTORY, 'notizine-performance.json');
const NOTE = 'Static gzip byte counts only. Independently compressed fragments are diagnostic and non-additive; this audit does not measure network performance.';

function configuredOverflowPolicy(performance = {}) {
  return performance.on_budget_exceeded ?? performance.onBudgetExceeded ?? 'warn';
}

function main() {
  const config = loadConfig(ROOT);
  const policy = config.performance ?? {};
  const onBudgetExceeded = configuredOverflowPolicy(policy);
  const reportPolicy = onBudgetExceeded === 'error'
    ? { ...policy, on_budget_exceeded: 'warn', onBudgetExceeded: undefined }
    : policy;
  const pages = auditPublicDirectory(PUBLIC_DIRECTORY, reportPolicy).map((page) => (
    onBudgetExceeded === 'error' && page.budgetStatus === 'warn'
      ? { ...page, budgetStatus: 'error' }
      : page
  ));

  for (const page of pages) {
    console.log(
      `[performance] ${page.file}: critical=${page.criticalShellGzipBytes}B `
      + `content=${page.contentGzipBytes}B total=${page.totalHtmlGzipBytes}B `
      + `deferred=${page.deferredReferences} external=${page.externalReferences} `
      + `budget=${page.budgetStatus}`,
    );
  }

  writeFileSync(REPORT_PATH, `${JSON.stringify({ note: NOTE, pages }, null, 2)}\n`);
  if (onBudgetExceeded === 'error' && pages.some(page => page.budgetStatus === 'error')) {
    process.exitCode = 1;
  }
}

main();
