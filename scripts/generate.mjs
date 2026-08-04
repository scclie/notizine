import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, basename, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { default as generateOG } from './generate-og.mjs';

const ROOT = process.cwd();
const CACHE_DIR = join(ROOT, 'assets', '.cache', 'modules');
const CONFIG_PATH = join(ROOT, 'assets', 'notizine.ziggy');
const MODULES_DIR = join(ROOT, 'modules');
const I18N_DIR = join(ROOT, 'i18n');
const CONTENT_DIR = join(ROOT, 'content');
const ZINE_CONFIG_PATH = join(ROOT, 'zine.ziggy');

function stripZiggyComments(raw) {
  return raw
    .replace(/\/\/.*$/gm, '')
    .replace(/,(\s*[}\]])/g, '$1');
}

function readConfig() {
  const raw = readFileSync(CONFIG_PATH, 'utf-8');
  return JSON.parse(stripZiggyComments(raw));
}

function readZineConfig() {
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

function readI18n() {
  const result = {};
  const files = readdirSync(I18N_DIR).filter(f => f.endsWith('.ziggy'));
  for (const file of files) {
    const lang = file.replace('.ziggy', '');
    const raw = readFileSync(join(I18N_DIR, file), 'utf-8');
    result[lang] = JSON.parse(stripZiggyComments(raw));
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

function parseSMDFrontmatter(filePath, locale, parentSection) {
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
  return { link, title, description, date, tags, isSection: false, locale: locale.code, parentSection, filePath };
}

function scanPages(zineConfig) {
  const pages = [];
  const walked = new Set();
  for (const locale of zineConfig.locales) {
    const dir = join(CONTENT_DIR, locale.content_dir_path.replace('content/', ''));
    walkSMD(dir, locale, pages, walked);
  }
  return pages;
}

function walkSMD(dir, locale, pages, walked, parentSection = null) {
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
        const page = parseSMDFrontmatter(indexSmd, locale, parentSection);
        page.isSection = true;
        page.subpages = [];
        pages.push(page);
        walkSMD(full, locale, pages, walked, page);
      }
    } else if (entry === 'index.smd') {
      const page = parseSMDFrontmatter(full, locale, parentSection);
      page.isSection = true;
      page.subpages = [];
      pages.push(page);
    } else if (entry.endsWith('.smd')) {
      const page = parseSMDFrontmatter(full, locale, parentSection);
      if (parentSection) parentSection.subpages.push(page);
      pages.push(page);
    }
  }
}

function discoverModules() {
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

function sanitizePath(link) {
  return link.replace(/\/+$/, '').replace(/^\//, '');
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderHeader(siteData, page, align) {
  const locale = siteData.zineConfig.locales.find(l => l.code === page.locale);
  const title = locale?.site_title || '';
  const link = page.locale === 'en' ? '/' : `/${page.locale}/`;
  return `<div class="${align}"><a href="${link}" class="site-title">${escapeHtml(title)}</a></div>`;
}

function renderFooterText(siteData, page, align) {
  const i18n = siteData.i18n;
  const generatedBy = i18n[page.locale]?.generated_by || 'Generated by';
  const withWord = i18n[page.locale]?.with || 'with';
  return `<div class="${align}"><p class="footer-text"><span>${escapeHtml(generatedBy)}</span> <a href="https://zine-ssg.io">Zine</a> <span>${escapeHtml(withWord)}</span> <a href="https://notizine.sccl.cc">notizine</a></p></div>`;
}

function renderSpacer(siteData, page, align) {
  return '<span class="flex-spacer"></span>';
}

function renderThemeToggle(siteData, page, align) {
  if (!siteData.config.features?.darkmode) return '';
  return `<div class="${align}"><div class="theme-toggle"><input type="checkbox" id="theme-dark" onchange="localStorage.setItem('notizine-theme',this.checked?'dark':'light');document.documentElement.setAttribute('data-theme',this.checked?'dark':'')"><label for="theme-dark" title="Toggle theme"></label></div></div>`;
}

function renderLangNav(siteData, page, align) {
  const locales = siteData.zineConfig.locales;
  if (locales.length < 2) return '';
  const i18n = siteData.i18n;
  const pagePath = page.link;
  const ownLocale = page.locale;
  const relPath = ownLocale === 'en'
    ? pagePath
    : pagePath.replace(/^[a-z]{2}\//, '');

  const items = locales.map(loc => {
    const locPath = loc.code === 'en'
      ? (loc.output_prefix !== null ? loc.output_prefix + '/' + relPath : relPath)
      : (loc.output_prefix !== null ? loc.output_prefix + '/' + relPath : loc.code + '/' + relPath);
    const clean = locPath.replace(/\/+/g, '/');
    return { code: loc.code, link: '/' + clean.replace(/^\//, '') };
  });

  if (locales.length > 2) {
    const options = items.map(it =>
      `<option value="${it.link}">${it.code}</option>`
    ).join('');
    return `<div class="${align}"><nav class="lang-nav"><select onchange="location=this.value">${options}</select></nav></div>`;
  }
  const links = items.map(it =>
    `<a href="${it.link}">${it.code}</a>`
  ).join('');
  return `<div class="${align}"><nav class="lang-nav">${links}</nav></div>`;
}

function renderBreadcrumbsFull(siteData, page, align) {
  if (!siteData.config.features?.breadcrumbs || page.isSection) return '';
  const i18n = siteData.i18n;
  const home = i18n[page.locale]?.home || 'Home';
  const parent = page.parentSection;
  const homeLink = page.locale === 'en' ? '/' : `/${page.locale}/`;
  let html = `<nav class="breadcrumbs"><a href="${homeLink}">${escapeHtml(home)}</a><span> / </span>`;
  if (parent && parent.link) {
    html += `<a href="/${parent.link.replace(/^\//, '')}">${escapeHtml(parent.title)}</a><span> / </span>`;
  }
  html += `<span>${escapeHtml(page.title)}</span></nav>`;
  return html;
}

function renderPrevNextFull(siteData, page, align) {
  if (page.isSection) return '';
  const i18n = siteData.i18n;
  const prevLabel = i18n[page.locale]?.previous_page || 'Previous';
  const nextLabel = i18n[page.locale]?.next_page || 'Next';
  const nonSection = siteData.pages.filter(p => !p.isSection && p.locale === page.locale);

  let html = '';
  const idx = nonSection.findIndex(p => p.link === page.link);
  if (idx === -1) return '';

  if (idx > 0) {
    const prev = nonSection[idx - 1];
    html += `<a href="/${prev.link.replace(/^\//, '')}">${escapeHtml(prevLabel)}: ${escapeHtml(prev.title)}</a>`;
  }
  if (idx < nonSection.length - 1) {
    const next = nonSection[idx + 1];
    html += `<a href="/${next.link.replace(/^\//, '')}">${escapeHtml(nextLabel)}: ${escapeHtml(next.title)}</a>`;
  }
  if (!html) return '';
  return `<nav class="prev-next">${html}</nav>`;
}

function renderRecentsFull(siteData, page, align) {
  if (!siteData.config.features?.recents) return '';
  const count = siteData.config.modules?.recents?.count || 5;
  const i18n = siteData.i18n;
  const title = i18n[page.locale]?.recents_title || 'Recent';
  const seeMore = i18n[page.locale]?.see_more || 'See more';
  const recents = siteData.pages
    .filter(p => !p.isSection && p.locale === page.locale && p.title)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, count);
  if (!recents.length) return '';
  const items = recents.map(r =>
    `<div class="recent-item"><a href="/${r.link.replace(/^\//, '')}">${escapeHtml(r.title)}</a><time>${r.date.slice(0, 10)}</time></div>`
  ).join('');
  const recentsLink = page.locale === 'en' ? '/recents/' : `/${page.locale}/recents/`;
  return `<div class="${align}"><div class="module module-recents"><a href="${recentsLink}"><h3>${escapeHtml(title)}</h3></a>${items}<a href="${recentsLink}" class="see-more">${escapeHtml(seeMore)}</a></div></div>`;
}

function renderExplorerFull(siteData, page, align) {
  if (!siteData.config.features?.explorer) return '';
  const treePages = siteData.pages.filter(p =>
    p.locale === page.locale &&
    !p.link.endsWith('tags/') &&
    !p.link.endsWith('search/') &&
    !p.link.endsWith('recents/') &&
    !p.link.endsWith('explorer/')
  );
  const rootSections = treePages.filter(p => p.isSection && !p.parentSection);
  function renderTreeItem(p) {
    const link = '/' + p.link.replace(/^\//, '');
    if (p.isSection && p.subpages && p.subpages.length > 0) {
      const subs = p.subpages
        .filter(sub => treePages.some(tp => tp.link === sub.link))
        .map(renderTreeItem).join('\n');
      return `<details><summary><a href="${link}">${escapeHtml(p.title)}</a></summary>${subs ? `<ul>${subs}</ul>` : ''}</details>`;
    }
    if (p.isSection) {
      return `<details><summary><a href="${link}">${escapeHtml(p.title)}</a></summary></details>`;
    }
    const subs = (p.subpages || []).filter(sub => treePages.some(tp => tp.link === sub.link));
    if (subs.length > 0) {
      const subItems = subs.map(renderTreeItem).join('\n');
      return `<li><a href="${link}">${escapeHtml(p.title)}</a>${subItems ? `<ul>${subItems}</ul>` : ''}</li>`;
    }
    return `<li><a href="${link}">${escapeHtml(p.title)}</a></li>`;
  }
  const items = rootSections.map(s => {
    const inner = renderTreeItem(s);
    return `<li>${inner}</li>`;
  }).join('\n');
  if (!items) return '';
  return `<ul class="explorer-tree">${items}</ul>`;
}

function renderBackToTop(siteData, page, align) {
  const i18n = siteData.i18n;
  const label = i18n[page.locale]?.back_to_top || 'Back to top';
  return `<div class="${align}"><a href="#" class="back-to-top">${escapeHtml(label)}</a></div>`;
}

function renderModule(siteData, page, moduleName, modules) {
  const mod = modules[moduleName];

  if (moduleName === '_header') return renderHeader;
  if (moduleName === '_footer_text') return renderFooterText;
  if (moduleName === '_spacer') return renderSpacer;
  if (moduleName === '_theme_toggle') return renderThemeToggle;
  if (moduleName === '_lang_nav') return renderLangNav;
  if (moduleName === '_breadcrumbs') return renderBreadcrumbsFull;
  if (moduleName === '_prev_next') return renderPrevNextFull;
  if (moduleName === '_recents') return renderRecentsFull;
  if (moduleName === '_explorer') return renderExplorerFull;
  if (moduleName === '_back_to_top' || moduleName === 'back_to_top') return renderBackToTop;

  if (mod) {
    return loadCachedModule;
  }

  return null;
}

function loadCachedModule(siteData, page, align, moduleName) {
  const cachePath = join(CACHE_DIR, moduleName + '.html');
  if (!existsSync(cachePath)) return '';
  const html = readFileSync(cachePath, 'utf-8');
  return `<div class="${align}">${html}</div>`;
}

function writeZoneFiles(siteData, modules) {
  const zonesDir = join(ROOT, 'assets', '.cache', 'zones');
  const slotZones = siteData.config.slots || {};
  const zoneNames = ['header', 'before_main', 'left', 'center', 'right', 'after_main', 'footer'];

  for (const page of siteData.pages) {
    for (const zoneName of zoneNames) {
      const rows = (zoneName === 'center')
        ? []
        : (slotZones[zoneName] || []);
      if (rows.length === 0) {
        const clean = page.link === '/' ? 'index' : page.link.replace(/^\//, '');
        const outDir = join(zonesDir, clean);
        mkdirSync(outDir, { recursive: true });
        writeFileSync(join(outDir, zoneName + '.html'), '');
        continue;
      }

      let html = '';
      for (const row of rows) {
        html += '<div class="slot-row">';
        for (const item of row) {
          const parts = item.split(':');
          const moduleName = parts[0];
          let align = 'left';
          if (parts.length > 1) {
            const suffix = parts[parts.length - 1];
            if (suffix === 'center' || suffix === 'right') align = suffix;
          }

          const renderFn = renderModule(siteData, page, moduleName, modules);
          if (!renderFn) continue;

          if (renderFn === loadCachedModule) {
            html += renderFn(siteData, page, align, moduleName);
          } else {
            html += renderFn(siteData, page, align);
          }
        }
        html += '</div>';
      }

      const clean = page.link === '/' ? 'index' : page.link.replace(/^\//, '');
      const outDir = join(zonesDir, clean);
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, zoneName + '.html'), html);
    }
  }
  console.log(`[generate] Wrote zone files for ${siteData.pages.length} pages`);
}

async function runGenerators(modules, siteData) {
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

function writeCombinedCSS(config, modules) {
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

function writeManifest(modules, siteData) {
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

async function main() {
  console.log('[generate] Starting pre-generation...');
  const config = readConfig();
  const zineConfig = readZineConfig();
  const i18n = readI18n();
  const pages = scanPages(zineConfig);
  const siteData = { config, zineConfig, i18n, pages };

  await generateOG(siteData);

  const modules = discoverModules();
  console.log(`[generate] Found ${Object.keys(modules).length} modules`);

  const imageMappings = collectImageMappings(siteData);
  const totalImages = Object.values(imageMappings).reduce((sum, arr) => sum + arr.length, 0);
  console.log(`[generate] Found ${totalImages} images to process`);
  writeFileSync(join(dirname(CACHE_DIR), 'image-map.json'), JSON.stringify(imageMappings));

  await runGenerators(modules, siteData);
  writeZoneFiles(siteData, modules);
  writeCombinedCSS(config, modules);
  writeManifest(modules, siteData);
  console.log('[generate] Done.');
}

await main().catch(err => { console.error(err); process.exit(1); });
