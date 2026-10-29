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

export function attachSearchIndex(assets, instances) {
  if (!instances.some(instance => instance.module === 'search')) return assets;
  return {
    ...assets,
    deferredScripts: '<script defer src="/.cache/search.js"></script>' + assets.deferredScripts,
    localAssets: [...new Set(['.cache/search.js', ...assets.localAssets])],
  };
}

export function buildSearchIndex(model, root) {
  const byLocale = {};
  const seen = new Set();
  for (const p of model.pages) {
    if (!p.filePath || seen.has(p.link)) continue;
    seen.add(p.link);
    const raw = readFileSync(p.filePath, 'utf-8');
    (byLocale[p.locale] ??= []).push({
      t: p.title,
      u: p.link,
      d: p.description || '',
      x: extractText(raw),
    });
  }
  for (const loc of Object.keys(byLocale)) {
    byLocale[loc].sort((a, b) => String(a.u).localeCompare(String(b.u)));
  }
  const js = 'window.SEARCH_INDEX=' + JSON.stringify(byLocale).replace(/</g, '\\u003c') + ';\n';
  mkdirSync(join(root, 'assets', '.cache'), { recursive: true });
  writeFileSync(searchIndexPath(root), js);
}
