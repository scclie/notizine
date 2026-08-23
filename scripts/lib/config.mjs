import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function stripZiggy(raw) {
  let out = '';
  let i = 0;
  let inString = false;
  while (i < raw.length) {
    const ch = raw[i];
    const next = raw[i + 1];
    if (!inString) {
      if (ch === '"') {
        inString = true;
        out += ch;
        i += 1;
      } else if (ch === '/' && next === '/') {
        while (i < raw.length && raw[i] !== '\n') i += 1;
      } else if (ch === '/' && next === '*') {
        i += 2;
        while (i < raw.length && !(raw[i] === '*' && raw[i + 1] === '/')) {
          if (raw[i] === '\n') out += '\n';
          i += 1;
        }
        i += 2;
      } else {
        out += ch;
        i += 1;
      }
    } else {
      out += ch;
      if (ch === '\\') {
        out += next ?? '';
        i += 2;
      } else {
        if (ch === '"') inString = false;
        i += 1;
      }
    }
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

export function loadConfig(root = process.cwd(), env = process.env) {
  const parsed = JSON.parse(stripZiggy(readFileSync(join(root, 'assets', 'notizine.ziggy'), 'utf-8')));
  const theme = env.NOTIZINE_THEME || parsed.theme;
  if (!theme) throw new Error('config: theme is not set');
  if (!parsed.site?.host_url) throw new Error('config: site.host_url missing');
  if (!Array.isArray(parsed.site.locales) || parsed.site.locales.length === 0)
    throw new Error('config: site.locales empty');
  return { ...parsed, theme };
}

export function checkZineConfigSync(config, root = process.cwd()) {
  const raw = readFileSync(join(root, 'zine.ziggy'), 'utf-8');
  const host = raw.match(/\.host_url\s*=\s*"([^"]+)"/)?.[1];
  if (host !== config.site.host_url)
    throw new Error(`config: host_url drift zine="${host}" notizine="${config.site.host_url}"`);
  const cfgCodes = Object.values(config.site.locales).map((l) => l.code);
  const zineCodes = [...raw.matchAll(/\.code\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
  const same =
    cfgCodes.length === zineCodes.length &&
    cfgCodes.slice().sort().join(',') === zineCodes.slice().sort().join(',');
  if (!same)
    throw new Error(`config: locale drift zine=[${zineCodes.join(', ')}] notizine=[${cfgCodes.join(', ')}]`);
}
