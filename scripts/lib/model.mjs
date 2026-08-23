import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';

function extractZiggyValue(fm, key) {
  const re = new RegExp('\\.' + key + '\\s*=\\s*(?:"([^"]*)"|([^,\n]+))');
  const m = fm.match(re);
  if (!m) return '';
  return m[1] || (m[2] ? m[2].trim() : '');
}

function extractZiggyDate(fm, key) {
  const raw = extractZiggyValue(fm, key);
  const m = raw.match(/\.date\("([^"]+)"\)/);
  return m ? m[1] : raw;
}

function extractZiggyArray(fm, key) {
  const re = new RegExp('\\.' + key + '\\s*=\\s*\\[([^\\]]*)\\]');
  const m = fm.match(re);
  if (!m) return [];
  return m[1].split(',').map(s => s.trim().replace(/"/g, '')).filter(Boolean);
}

function computeStats(rawContent) {
  const body = rawContent.replace(/^---\n[\s\S]*?\n---\n/, '');
  const words = body.trim().split(/\s+/).filter(w => w.length > 0).length;
  return {
    wordcount: words,
    readtime: Math.max(1, Math.ceil(words / 200)),
  };
}

export function prefixOf(loc) {
  return loc.output_prefix_override ?? `${loc.code}/`;
}

function parseSMDFrontmatter(filePath, locale, baseDir, parentLink) {
  const raw = readFileSync(filePath, 'utf-8');
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
  const fm = fmMatch ? fmMatch[1] : '';
  const relPath = relative(baseDir, dirname(filePath));
  const slug = basename(filePath, '.smd') === 'index'
    ? relPath
    : join(relPath, basename(filePath, '.smd'));
  let link = '/' + prefixOf(locale) + slug.replace(/\\/g, '/') + '/';
  link = link.replace(/\/\/+/g, '/');
  const stats = computeStats(raw);
  return {
    locale: locale.code,
    link,
    filePath,
    title: extractZiggyValue(fm, 'title'),
    description: extractZiggyValue(fm, 'description') || '',
    date: extractZiggyDate(fm, 'date') || '',
    moddate: extractZiggyDate(fm, 'moddate') || '',
    tags: extractZiggyArray(fm, 'tags'),
    isSection: false,
    parentLink,
    wordcount: stats.wordcount,
    readtime: stats.readtime,
  };
}

function walk(dir, locale, baseDir, pages, parentLink = null, walked = new Set()) {
  if (!existsSync(dir)) return;
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    if (walked.has(full)) continue;
    walked.add(full);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      const indexSmd = join(full, 'index.smd');
      if (existsSync(indexSmd)) {
        walked.add(indexSmd);
        const page = parseSMDFrontmatter(indexSmd, locale, baseDir, parentLink);
        page.isSection = true;
        pages.push(page);
        walk(full, locale, baseDir, pages, page.link, walked);
      }
    } else if (entry === 'index.smd') {
      const page = parseSMDFrontmatter(full, locale, baseDir, parentLink);
      page.isSection = true;
      pages.push(page);
    } else if (entry.endsWith('.smd')) {
      pages.push(parseSMDFrontmatter(full, locale, baseDir, parentLink));
    }
  }
}

export function buildModel(config, root = process.cwd()) {
  const pages = [];
  for (const loc of config.site.locales) {
    const dir = join(root, loc.content_dir_path);
    walk(dir, loc, dir, pages, null);
  }
  return { config, pages };
}
