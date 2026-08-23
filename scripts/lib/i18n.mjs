import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { stripZiggy } from './config.mjs';

export function loadI18n(root) {
  const dir = join(root, 'i18n');
  const out = {};
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.ziggy')) continue;
    const code = f.replace(/\.ziggy$/, '');
    const map = JSON.parse(stripZiggy(readFileSync(join(dir, f), 'utf-8')));
    out[code] = key => map[key] ?? key;
  }
  return out;
}
