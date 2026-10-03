import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeLayoutConfig } from './layout.mjs';

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
  return normalizeLayoutConfig({ ...parsed, theme });
}

function ziggyString(s) {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

export function renderZineConfig(config) {
  const locales = config.site.locales.map((l) => {
    const lines = [
      `            .code = ${ziggyString(l.code)},`,
      `            .name = ${ziggyString(l.name)},`,
      `            .site_title = ${ziggyString(l.site_title)},`,
      `            .content_dir_path = ${ziggyString(l.content_dir_path)},`,
    ];
    if (l.output_prefix_override !== undefined && l.output_prefix_override !== null) {
      lines.push(`            .output_prefix_override = ${ziggyString(l.output_prefix_override)},`);
    }
    return `        .{\n${lines.join('\n')}\n        },`;
  });

  return `.zine_version = "0.13.0",
.site = .multilingual(.{
    .host_url = ${ziggyString(config.site.host_url)},
    .i18n_dir_path = "i18n",
    .layouts_dir_path = "layouts",
    .assets_dir_path = "assets",
    .locales = [
${locales.join('\n')}
    ],
}),
`;
}

function readZiggyField(source, field) {
  const match = source.match(new RegExp(`\\.${field}\\s*=\\s*"((?:\\\\.|[^"\\\\])*)"`));
  return match === null ? undefined : JSON.parse(`"${match[1]}"`);
}

function readZineSiteConfig(source) {
  const localesSection = source.match(/\.locales\s*=\s*\[([\s\S]*?)\]\s*,/);
  const locales = localesSection === null
    ? []
    : [...localesSection[1].matchAll(/\.\{\s*([\s\S]*?)\s*\},/g)].map(([, locale]) => ({
      code: readZiggyField(locale, 'code'),
      name: readZiggyField(locale, 'name'),
      site_title: readZiggyField(locale, 'site_title'),
      content_dir_path: readZiggyField(locale, 'content_dir_path'),
      output_prefix_override: readZiggyField(locale, 'output_prefix_override') ?? null,
    }));
  return { host_url: readZiggyField(source, 'host_url'), locales };
}

function findZineConfigDrift(config, current) {
  const expectedSite = config.site;
  const actualSite = readZineSiteConfig(current);
  if (actualSite.host_url !== expectedSite.host_url) return 'host_url';
  if (actualSite.locales.length !== expectedSite.locales.length) return 'locales';

  for (const [index, expected] of expectedSite.locales.entries()) {
    const actual = actualSite.locales[index];
    for (const field of ['code', 'name', 'site_title', 'content_dir_path', 'output_prefix_override']) {
      const expectedValue = field === 'output_prefix_override'
        ? expected[field] ?? null
        : expected[field];
      if (actual[field] !== expectedValue) return `locale "${expected.code}".${field}`;
    }
  }
  return 'content';
}

export function assertZineConfigSync(config, root = process.cwd()) {
  const zinePath = join(root, 'zine.ziggy');
  const current = readFileSync(zinePath, 'utf8');
  const expected = renderZineConfig(config);
  if (current !== expected) {
    const drift = findZineConfigDrift(config, current);
    throw new Error(`config: zine.ziggy drift: ${drift}; run npm run sync:zine`);
  }
}

export function syncZineConfig(config, root = process.cwd()) {
  const content = renderZineConfig(config);
  const zinePath = join(root, 'zine.ziggy');
  const current = readFileSync(zinePath, 'utf8');
  if (current !== content) {
    writeFileSync(zinePath, content);
    return true;
  }
  return false;
}
