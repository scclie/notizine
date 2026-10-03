import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { auditHtml, auditPublicDirectory, parseByteBudget } from '../../lib/performance.mjs';

const shellStart = '<!-- notizine-performance:critical-shell:start -->';
const shellEnd = '<!-- notizine-performance:critical-shell:end -->';
const bodyStart = '<!-- notizine-performance:page-body:start -->';
const bodyEnd = '<!-- notizine-performance:page-body:end -->';

function markedHtml(content) {
  return `${shellStart}<head><style>body{color:navy}</style></head><body>${bodyStart}${content}${bodyEnd}</body>${shellEnd}`;
}

test('parses case-insensitive kilobyte gzip budgets', () => {
  assert.equal(parseByteBudget('14kb'), 14 * 1024);
  assert.equal(parseByteBudget('1.5KB'), 1536);
  assert.throws(() => parseByteBudget('14 kB'), /performance: invalid gzip budget/);
});

test('marks an oversized critical shell as warning under warn policy', () => {
  const report = auditHtml('<!doctype html><style>' + 'a{}'.repeat(10_000) + '</style><main>x</main>', {
    criticalHtmlGzipBudget: 100,
    onBudgetExceeded: 'warn',
  });

  assert.equal(report.budgetStatus, 'warn');
  assert.ok(report.totalHtmlGzipBytes > 100);
});

test('throws on an oversized critical shell under error policy', () => {
  const oversizedHtml = '<!doctype html><style>' + 'a{}'.repeat(10_000) + '</style><main>x</main>';

  assert.throws(
    () => auditHtml(oversizedHtml, {
      criticalHtmlGzipBudget: 100,
      onBudgetExceeded: 'error',
    }),
    /performance: .* exceeds critical HTML gzip budget/,
  );
});

test('keeps diagnostic source content separate from the marked critical shell', () => {
  const shortReport = auditHtml(markedHtml('<main>short article</main>'), {
    criticalHtmlGzipBudget: '14kb',
    onBudgetExceeded: 'warn',
  });
  const longArticle = Array.from({ length: 500 }, (_, index) => `<p>paragraph ${index}: ${index.toString(36).padStart(4, '0')}</p>`).join('');
  const longReport = auditHtml(markedHtml(`<main>${longArticle}</main><script defer src="/assets/deferred.js"></script><link rel="stylesheet" href="https://cdn.example.test/external.css">`), {
    criticalHtmlGzipBudget: '14kb',
    onBudgetExceeded: 'warn',
  });

  assert.ok(longReport.totalHtmlGzipBytes > shortReport.totalHtmlGzipBytes);
  assert.ok(longReport.contentGzipBytes > shortReport.contentGzipBytes);
  assert.equal(longReport.criticalShellGzipBytes, shortReport.criticalShellGzipBytes);
  assert.equal(longReport.deferredReferences, 1);
  assert.equal(longReport.externalReferences, 1);
});

test('counts only remote stylesheet URLs as external references', () => {
  const report = auditHtml(markedHtml(
    '<main>references</main><link rel="stylesheet" href="/assets/local.css"><link rel="stylesheet" href="https://cdn.example.test/external.css">',
  ), {
    criticalHtmlGzipBudget: '14kb',
    onBudgetExceeded: 'warn',
  });

  assert.equal(report.externalReferences, 1);
});

test('counts remote scripts without defer as external references', () => {
  const report = auditHtml(markedHtml(
    '<main>references</main><script src="https://cdn.example.test/external.js"></script>',
  ), {
    criticalHtmlGzipBudget: '14kb',
    onBudgetExceeded: 'warn',
  });

  assert.equal(report.externalReferences, 1);
});

test('audits public HTML files in deterministic relative-path order', () => {
  const publicDir = mkdtempSync(join(tmpdir(), 'notizine-performance-'));
  mkdirSync(join(publicDir, 'nested'));
  writeFileSync(join(publicDir, 'z.html'), markedHtml('<main>z</main>'));
  writeFileSync(join(publicDir, 'nested', 'a.html'), markedHtml('<main>a</main>'));

  const report = auditPublicDirectory(publicDir, {
    criticalHtmlGzipBudget: '14kb',
    onBudgetExceeded: 'warn',
  });

  assert.deepEqual(report.map(page => page.file), ['nested/a.html', 'z.html']);
  assert.ok(report.every(page => page.budgetStatus === 'ok'));
});

test('writes a deterministic public audit report without claiming network performance', () => {
  const root = mkdtempSync(join(tmpdir(), 'notizine-performance-cli-'));
  mkdirSync(join(root, 'assets'));
  mkdirSync(join(root, 'public'));
  writeFileSync(join(root, 'assets', 'notizine.ziggy'), JSON.stringify({
    theme: 'nord-default',
    site: {
      host_url: 'https://example.test',
      locales: [{ code: 'en', name: 'English', site_title: 'Notizine', content_dir_path: 'content/en' }],
    },
    layout: { columns: ['1fr', '1fr', '1fr'], rows: ['auto', '1fr', 'auto'] },
    performance: {
      critical_html_gzip_budget: '14kb',
      on_budget_exceeded: 'warn',
    },
  }));
  writeFileSync(join(root, 'public', 'index.html'), markedHtml('<main>audit fixture</main>'));

  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../../audit-performance.mjs', import.meta.url))], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(readFileSync(join(root, 'public', 'notizine-performance.json'), 'utf8'));
  assert.match(report.note, /independently compressed fragments are diagnostic and non-additive/i);
  assert.match(report.note, /does not measure network performance/i);
  assert.deepEqual(report.pages.map(page => page.file), ['index.html']);
});
