import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'path';

function extractText(raw) {
  return raw
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[`*_~#\[\]()!>|]/g, ' ')
    .replace(/^\s*[-+]\s+/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function searchIndexPath(root) {
  return join(root, 'assets', '.cache', 'search.js');
}

export function removeSearchIndex(root) {
  rmSync(searchIndexPath(root), { force: true });
}

export function buildSearchIndex(model, root) {
  const byLocale = {};
  for (const p of model.pages) {
    if (p.isSection || !p.filePath) continue;
    if (p.link.endsWith('/404/')) continue;
    const raw = readFileSync(p.filePath, 'utf-8');
    (byLocale[p.locale] ??= []).push({
      t: p.title,
      u: p.link,
      d: p.description || '',
      x: extractText(raw).slice(0, 4000),
    });
  }
  for (const loc of Object.keys(byLocale)) {
    byLocale[loc].sort((a, b) => String(a.u).localeCompare(String(b.u)));
  }
  const js = 'window.SEARCH_INDEX=' + JSON.stringify(byLocale).replace(/</g, '\\u003c') + ';\n';
  mkdirSync(join(root, 'assets', '.cache'), { recursive: true });
  writeFileSync(searchIndexPath(root), js);
}
