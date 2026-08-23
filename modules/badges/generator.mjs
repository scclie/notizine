import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc } from '../../scripts/lib/api.mjs';

const DEFAULT_HTML = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'template.html'), 'utf-8');

export default async function ({ params }) {
  const items = params?.items;
  if (!Array.isArray(items) || items.length === 0) return DEFAULT_HTML;
  const inner = items
    .map(item => `<a href="${esc(item.href)}"><img src="${esc(item.src)}" width="88" height="31" alt="${esc(item.alt ?? '')}"/></a>`)
    .join('');
  return `<div class="badges" style="display: flex; gap: 6px; margin: 0.8rem 0">${inner}</div>`;
}
