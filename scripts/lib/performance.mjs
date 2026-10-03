import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const CRITICAL_SHELL_START = '<!-- notizine-performance:critical-shell:start -->';
const CRITICAL_SHELL_END = '<!-- notizine-performance:critical-shell:end -->';
const PAGE_BODY_START = '<!-- notizine-performance:page-body:start -->';
const PAGE_BODY_END = '<!-- notizine-performance:page-body:end -->';

export function parseByteBudget(value) {
  if (typeof value !== 'string') {
    throw new Error(`performance: invalid gzip budget ${JSON.stringify(value)}`);
  }
  const match = /^(\d+(?:\.\d+)?)kb$/i.exec(value);
  if (!match) throw new Error(`performance: invalid gzip budget ${JSON.stringify(value)}`);
  return Math.round(Number(match[1]) * 1024);
}

function normalizePerformancePolicy(policy = {}) {
  const budgetValue = policy.criticalHtmlGzipBudget
    ?? policy.critical_html_gzip_budget
    ?? '14kb';
  const criticalHtmlGzipBudget = typeof budgetValue === 'number'
    ? budgetValue
    : parseByteBudget(budgetValue);
  if (!Number.isFinite(criticalHtmlGzipBudget) || criticalHtmlGzipBudget < 0) {
    throw new Error(`performance: invalid gzip budget ${JSON.stringify(budgetValue)}`);
  }

  const onBudgetExceeded = policy.onBudgetExceeded
    ?? policy.on_budget_exceeded
    ?? 'warn';
  if (onBudgetExceeded !== 'warn' && onBudgetExceeded !== 'error') {
    throw new Error(`performance: invalid budget policy ${JSON.stringify(onBudgetExceeded)}`);
  }
  return { criticalHtmlGzipBudget, onBudgetExceeded };
}

function markerRange(html, startMarker, endMarker) {
  const start = html.indexOf(startMarker);
  if (start === -1) return null;
  const contentStart = start + startMarker.length;
  const end = html.indexOf(endMarker, contentStart);
  if (end === -1) return null;
  return { start, contentStart, end, contentEnd: end + endMarker.length };
}

function removeMarkers(html) {
  return html
    .replaceAll(CRITICAL_SHELL_START, '')
    .replaceAll(CRITICAL_SHELL_END, '')
    .replaceAll(PAGE_BODY_START, '')
    .replaceAll(PAGE_BODY_END, '');
}

function extractPerformanceFragments(html) {
  const shell = markerRange(html, CRITICAL_SHELL_START, CRITICAL_SHELL_END);
  const shellHtml = shell === null ? html : html.slice(shell.contentStart, shell.end);
  const body = markerRange(shellHtml, PAGE_BODY_START, PAGE_BODY_END);
  if (body === null) {
    return { content: html, criticalShell: removeMarkers(shellHtml), total: html };
  }
  return {
    content: shellHtml.slice(body.contentStart, body.end),
    criticalShell: removeMarkers(shellHtml.slice(0, body.start) + shellHtml.slice(body.contentEnd)),
    total: html,
  };
}

function gzipBytes(value) {
  return gzipSync(value, { level: 9 }).byteLength;
}

function countDeferredReferences(html) {
  const scripts = html.match(/<script\b(?=[^>]*\bdefer\b)[^>]*\bsrc\s*=\s*["'][^"']+["'][^>]*>/gi) ?? [];
  const styles = html.match(/<link\b(?=[^>]*\brel\s*=\s*["']stylesheet["'])(?=[^>]*\bmedia\s*=\s*["']print["'])[^>]*>/gi) ?? [];
  return scripts.length + styles.length;
}

function countExternalReferences(html) {
  const styles = html.match(/<link\b(?=[^>]*\brel\s*=\s*["']stylesheet["'])(?=[^>]*\bhref\s*=\s*["'](?:https?:)?\/\/)[^>]*>/gi) ?? [];
  const scripts = html.match(/<script\b(?=[^>]*\bsrc\s*=\s*["'](?:https?:)?\/\/)[^>]*>/gi) ?? [];
  return styles.length + scripts.length;
}

function createAuditRecord(fragments, policy, file = null) {
  const contentGzipBytes = gzipBytes(fragments.content);
  const criticalShellGzipBytes = gzipBytes(fragments.criticalShell);
  const totalHtmlGzipBytes = gzipBytes(fragments.total);
  const budgetStatus = criticalShellGzipBytes > policy.criticalHtmlGzipBudget
    ? policy.onBudgetExceeded
    : 'ok';

  if (budgetStatus === 'error') {
    throw new Error(
      `performance: ${file ?? 'HTML'} exceeds critical HTML gzip budget `
      + `(${criticalShellGzipBytes} bytes > ${policy.criticalHtmlGzipBudget} bytes)`,
    );
  }

  return {
    file,
    contentGzipBytes,
    criticalShellGzipBytes,
    totalHtmlGzipBytes,
    deferredReferences: countDeferredReferences(fragments.total),
    externalReferences: countExternalReferences(fragments.total),
    budgetStatus,
  };
}

export function auditHtml(html, policy) {
  return createAuditRecord(extractPerformanceFragments(html), normalizePerformancePolicy(policy));
}

function htmlFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...htmlFiles(path));
    else if (entry.isFile() && extname(entry.name).toLowerCase() === '.html') files.push(path);
  }
  return files;
}

export function auditPublicDirectory(publicDir, policy) {
  const normalizedPolicy = normalizePerformancePolicy(policy);
  return htmlFiles(publicDir).sort().map((file) => createAuditRecord(
    extractPerformanceFragments(readFileSync(file, 'utf8')),
    normalizedPolicy,
    relative(publicDir, file).split(sep).join('/'),
  ));
}
