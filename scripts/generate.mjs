import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, basename, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { default as generateOG } from './generate-og.mjs';
import { loadConfig, syncZineConfig, stripZiggy } from './lib/config.mjs';
import { buildModel } from './lib/model.mjs';
import { buildSearchIndex } from './lib/search.mjs';
import { discoverModules, resolveSlots } from './lib/modules.mjs';
import { loadI18n } from './lib/i18n.mjs';
import { bundleCSS } from './lib/css.mjs';
import { renderZones, bundleClient, v2Slots } from './lib/render.mjs';

const ROOT = process.cwd();
const CACHE_DIR = join(ROOT, 'assets', '.cache', 'modules');
const ASSETS_JSON = join(ROOT, 'assets', '.cache', 'per-page-assets.json');
const CONFIG_PATH = join(ROOT, 'assets', 'notizine.ziggy');
const MODULES_DIR = join(ROOT, 'modules');
const I18N_DIR = join(ROOT, 'i18n');
const CONTENT_DIR = join(ROOT, 'content');
const ZINE_CONFIG_PATH = join(ROOT, 'zine.ziggy');

function legacyReadConfig() {
  const raw = readFileSync(CONFIG_PATH, 'utf-8');
  return JSON.parse(stripZiggy(raw));
}

function legacyReadZineConfig() {
  const raw = readFileSync(ZINE_CONFIG_PATH, 'utf-8');
  const hostMatch = raw.match(/\.host_url\s*=\s*"([^"]+)"/);
  const locales = [];
  const re = /\.code\s*=\s*"([^"]+)".*?\.name\s*=\s*"([^"]+)".*?\.site_title\s*=\s*"([^"]+)".*?\.content_dir_path\s*=\s*"([^"]+)"(?:\s*,\s*\.output_prefix_override\s*=\s*"([^"]*)")?/gs;
  for (const m of raw.matchAll(re)) {
    locales.push({
      code: m[1],
      name: m[2],
      site_title: m[3],
      content_dir_path: m[4],
      output_prefix: m[5] !== undefined ? m[5] : null,
    });
  }
  return { host_url: hostMatch?.[1] || '', locales };
}

function legacyReadI18n() {
  const result = {};
  const files = readdirSync(I18N_DIR).filter(f => f.endsWith('.ziggy'));
  for (const file of files) {
    const lang = file.replace('.ziggy', '');
    const raw = readFileSync(join(I18N_DIR, file), 'utf-8');
    result[lang] = JSON.parse(stripZiggy(raw));
  }
  return result;
}

function extractZiggyValue(fm, key) {
  const re = new RegExp('\\.' + key + '\\s*=\\s*(?:"([^"]*)"|([^,\\n]+))');
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

function legacyParseSMDFrontmatter(filePath, locale, parentSection) {
  const raw = readFileSync(filePath, 'utf-8');
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
  const fm = fmMatch ? fmMatch[1] : '';
  const relPath = relative(join(CONTENT_DIR, locale.content_dir_path.replace('content/', '')), dirname(filePath));
  const slug = basename(filePath, '.smd') === 'index'
    ? relPath : join(relPath, basename(filePath, '.smd'));
  const title = extractZiggyValue(fm, 'title');
  const description = extractZiggyValue(fm, 'description') || '';
  const date = extractZiggyDate(fm, 'date') || '';
  const tags = extractZiggyArray(fm, 'tags');
  const prefix = locale.output_prefix !== null ? locale.output_prefix : locale.code + '/';
  let link = prefix + slug.replace(/\\/g, '/') + '/';
  link = link.replace(/\/\/+/g, '/');
  const stats = computeStats(raw);
  const moddate = extractZiggyDate(fm, 'moddate') || '';
  return { link, title, description, date, tags, isSection: false, locale: locale.code, parentSection, filePath, wordcount: stats.wordcount, readtime: stats.readtime, moddate };
}

function legacyScanPages(zineConfig) {
  const pages = [];
  const walked = new Set();
  for (const locale of zineConfig.locales) {
    const dir = join(CONTENT_DIR, locale.content_dir_path.replace('content/', ''));
    legacyWalkSMD(dir, locale, pages, walked);
  }
  return pages;
}

function legacyWalkSMD(dir, locale, pages, walked, parentSection = null) {
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
        const page = legacyParseSMDFrontmatter(indexSmd, locale, parentSection);
        page.isSection = true;
        page.subpages = [];
        pages.push(page);
        legacyWalkSMD(full, locale, pages, walked, page);
      }
    } else if (entry === 'index.smd') {
      const page = legacyParseSMDFrontmatter(full, locale, parentSection);
      page.isSection = true;
      page.subpages = [];
      pages.push(page);
    } else if (entry.endsWith('.smd')) {
      const page = legacyParseSMDFrontmatter(full, locale, parentSection);
      if (parentSection) parentSection.subpages.push(page);
      pages.push(page);
    }
  }
}

function legacyDiscoverModules() {
  const modules = {};
  if (!existsSync(MODULES_DIR)) return modules;
  const dirs = readdirSync(MODULES_DIR);
  for (const dir of dirs) {
    const full = join(MODULES_DIR, dir);
    if (!statSync(full).isDirectory()) continue;
    const manifestPath = join(full, 'module.ziggy');
    if (!existsSync(manifestPath)) continue;
    const raw = readFileSync(manifestPath, 'utf-8');
    const name = extractZiggyValue(raw, 'name');
    const type = extractZiggyValue(raw, 'type');
    modules[name] = { name, type, dir: full };
  }
  return modules;
}

function legacyNormalizeSlots(rawSlots) {
  const normalized = {};
  for (const [zone, rows] of Object.entries(rawSlots)) {
    normalized[zone] = rows.map(row =>
      row.map(entry => {
        if (typeof entry === 'string') {
          const result = { module: entry };
          if (entry.startsWith('_recents')) result.section = '';
          return result;
        }
        if (!entry.module) return null;
        if (!entry.align) entry.align = 'left';
        if (entry.module === '_recents' && !entry.section) entry.section = 'posts';
        if (entry.module === '_explorer' && !entry.section) entry.section = '';
        return entry;
      }).filter(Boolean)
    );
  }
  return normalized;
}

async function legacyRunGenerators(modules, siteData) {
  const results = {};
  mkdirSync(CACHE_DIR, { recursive: true });
  for (const [name, mod] of Object.entries(modules)) {
    if (mod.type === 'static') {
      const htmlPath = join(mod.dir, 'template.html');
      const html = existsSync(htmlPath) ? readFileSync(htmlPath, 'utf-8') : '';
      results[name] = { per_page: false, pages: {} };
      writeFileSync(join(CACHE_DIR, name + '.html'), html);
    } else if (mod.type === 'dynamic') {
      const genPath = join(mod.dir, 'generator.mjs');
      if (!existsSync(genPath)) {
        console.warn(`[generate] module "${name}" has type=dynamic but no generator.mjs`);
        continue;
      }
      const gen = await import(pathToFileURL(genPath).href);
      const output = await gen.default(siteData);
      if (output.html !== undefined) {
        results[name] = { per_page: false, pages: {} };
        writeFileSync(join(CACHE_DIR, name + '.html'), output.html);
      } else if (output.pages) {
        results[name] = { per_page: true, pages: {} };
      }
    }
  }
  return results;
}

function legacyWriteCombinedCSS(config, modules) {
  const baseCSS = readFileSync(join(ROOT, 'assets', 'css', 'base.css'), 'utf-8');
  const codeCSS = readFileSync(join(ROOT, 'assets', 'css', 'code.css'), 'utf-8');
  const customCSS = config.custom_css
    ? readFileSync(join(ROOT, 'assets', config.custom_css), 'utf-8') : '';

  let css = baseCSS + '\n' + codeCSS;
  for (const mod of Object.values(modules)) {
    const stylePath = join(mod.dir, 'style.css');
    if (existsSync(stylePath)) {
      css += '\n' + readFileSync(stylePath, 'utf-8');
    }
  }
  css += '\n' + customCSS;

  writeFileSync(join(ROOT, 'assets', '.cache', 'all.css'), css);
}

function legacyWriteManifest(modules, siteData) {
  const manifest = {
    modules: {},
    pages: siteData.pages.map(p => p.link),
  };
  for (const [name] of Object.entries(modules)) {
    manifest.modules[name] = {
      cached: true,
      path: '.cache/modules/' + name,
    };
  }
  writeFileSync(join(ROOT, 'assets', '.cache', 'manifest.json'), JSON.stringify(manifest, null, 2));
}

function collectImageMappings(siteData) {
  const mappings = {};
  for (const page of siteData.pages) {
    if (!page.filePath) continue;
    const content = readFileSync(page.filePath, 'utf-8');
    const pageDir = dirname(page.filePath);

    const imgRegex = /\[\[([^\]|]+?)(?:\|(.+?))?\]\]/g;
    let match;
    const pageMappings = [];

    while ((match = imgRegex.exec(content)) !== null) {
      const imgPath = match[1];
      const flags = match[2] || '';
      const sourcePath = join(pageDir, imgPath);
      if (!existsSync(sourcePath)) {
        console.warn(`[generate] Image not found: ${sourcePath}`);
        continue;
      }
      const imgExt = extname(imgPath);
      const imgBasename = basename(imgPath, imgExt);
      const openable = flags.includes('open');

      let replacement;
      if (openable) {
        replacement = `<figure class="article-image openable"><details><summary><img src="${imgBasename}${imgExt}" loading="lazy" decoding="async"></summary><div class="overlay"><img src="${imgBasename}${imgExt}"></div></details></figure>`;
      } else {
        replacement = `<figure class="article-image"><img src="${imgBasename}${imgExt}" loading="lazy" decoding="async"></figure>`;
      }

      pageMappings.push({
        original: match[0],
        replacement,
        sourcePath,
        destName: imgBasename + imgExt,
      });
    }

    if (pageMappings.length > 0) {
      mappings[page.link] = pageMappings;
    }
  }
  return mappings;
}

function collectPerPageAssets(pages) {
  const assets = {};
  for (const page of pages) {
    if (!page.filePath) continue;
    const dir = dirname(page.filePath);
    const base = basename(page.filePath, '.smd');
    const cssPath = join(dir, base + '.css');
    const jsPath = join(dir, base + '.js');
    const entry = {};
    if (existsSync(cssPath)) {
      const css = readFileSync(cssPath, 'utf-8').trim();
      if (css.length > 0) entry.css = css;
    }
    if (existsSync(jsPath)) {
      const js = readFileSync(jsPath, 'utf-8').trim();
      if (js.length > 0) entry.js = js;
    }
    const metaParts = [];
    if (page.date) metaParts.push(page.date.slice(0, 10));
    if (page.moddate) metaParts.push('updated ' + page.moddate.slice(0, 10));
    if (page.readtime) metaParts.push(page.readtime + ' min');
    if (page.wordcount) metaParts.push(page.wordcount + ' words');
    entry.wordcount = page.wordcount;
    entry.readtime = page.readtime;
    entry.recent_meta = metaParts.join(' | ');
    const key = page.link === '/' ? 'index' : (page.link.startsWith('/') ? page.link : '/' + page.link);
    assets[key] = entry;
  }
  return assets;
}

function writePerPageAssets(pages) {
  const perPageAssets = collectPerPageAssets(pages);
  mkdirSync(dirname(ASSETS_JSON), { recursive: true });
  writeFileSync(ASSETS_JSON, JSON.stringify(perPageAssets));
  console.log(`[generate] Written per-page assets for ${Object.keys(perPageAssets).length} pages`);
}

function computeStats(rawContent) {
  const body = rawContent.replace(/^---\n[\s\S]*?\n---\n/, '');
  const words = body.trim().split(/\s+/).filter(w => w.length > 0).length;
  return {
    wordcount: words,
    readtime: Math.max(1, Math.ceil(words / 200)),
  };
}

async function newGenerate() {
  console.log('[generate] Starting pre-generation...');
  const config = loadConfig(ROOT);
  syncZineConfig(config, ROOT);
  const model = buildModel(config, ROOT);
  buildSearchIndex(model, ROOT);
  writePerPageAssets(model.pages);
  await generateOG({ config, model });
  const modules = discoverModules(ROOT);
  const slots = resolveSlots({ ...config, slots: v2Slots(config.slots) }, modules);
  const i18n = loadI18n(ROOT);
  const installed = await renderZones(model, i18n, ROOT, modules, slots);
  const overrideModules = Object.values(config.slots_overrides ?? {})
    .flatMap(zm => Object.values(zm)).flat(2)
    .map(r => r?.module).filter(Boolean);
  const usedModules = [...new Set([
    ...Object.values(slots.zones).flat(2).map(r => r?.module).filter(Boolean),
    ...overrideModules,
  ])];
  bundleClient(installed, usedModules, ROOT);
  bundleCSS(config, installed, ROOT);
  console.log('[generate] Done.');
}

async function legacyGenerate() {
  console.log('[generate] Starting pre-generation...');
  const config = legacyReadConfig();
  const normalizedSlots = legacyNormalizeSlots(config.slots);
  const SLOTS_JSON = join(dirname(CACHE_DIR), 'slots.json');
  mkdirSync(dirname(SLOTS_JSON), { recursive: true });
  writeFileSync(SLOTS_JSON, JSON.stringify(normalizedSlots));
  const zineConfig = legacyReadZineConfig();
  const i18n = legacyReadI18n();
  const pages = legacyScanPages(zineConfig);
  const siteData = { config, zineConfig, i18n, pages };

  writePerPageAssets(siteData.pages);

  await generateOG({ config, model: { pages: siteData.pages } });

  const modules = legacyDiscoverModules();
  console.log(`[generate] Found ${Object.keys(modules).length} modules`);

  const imageMappings = collectImageMappings(siteData);
  const totalImages = Object.values(imageMappings).reduce((sum, arr) => sum + arr.length, 0);
  console.log(`[generate] Found ${totalImages} images to process`);
  writeFileSync(join(dirname(CACHE_DIR), 'image-map.json'), JSON.stringify(imageMappings));

  await legacyRunGenerators(modules, siteData);
  legacyWriteCombinedCSS(config, modules);
  legacyWriteManifest(modules, siteData);
  console.log('[generate] Done.');
}

async function main() {
  const engine = process.env.NOTIZINE_ENGINE ?? 'new';
  if (engine === 'new') {
    await newGenerate();
  } else if (engine === 'legacy') {
    await legacyGenerate();
  } else {
    throw new Error(`NOTIZINE_ENGINE="${engine}": unknown engine`);
  }
}

await main().catch(err => { console.error(err); process.exit(1); });
