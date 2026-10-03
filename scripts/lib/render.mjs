import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cacheKey, homeLink } from './api.mjs';
import { applyOverrides } from './modules.mjs';

const GRID_CELL_ORDER = Object.freeze([
  'top_left', 'top_center', 'top_right',
  'middle_left', 'middle_center', 'middle_right',
  'bottom_left', 'bottom_center', 'bottom_right',
]);

function rootPage(model) {
  const out = [];
  for (const loc of model.config.site.locales) {
    const link = homeLink(model, { locale: loc.code });
    if (!model.pages.some(p => p.locale === loc.code && p.link === link)) {
      out.push({
        locale: loc.code,
        link,
        filePath: null,
        title: '',
        description: '',
        date: '',
        moddate: '',
        tags: [],
        isSection: true,
        parentLink: null,
        wordcount: 0,
        readtime: 1,
      });
    }
  }
  return out;
}

async function loadGenerator(modules, name, cache) {
  if (!cache[name]) {
    const p = join(modules[name].dir, 'generator.mjs');
    cache[name] = await import(pathToFileURL(p).href);
  }
  return cache[name].default;
}

export async function renderZones(model, i18n, root, modules, slots) {
  const genCache = {};
  const tplCache = {};
  const installed = new Set();
  const baseDir = join(root, 'assets', '.cache', 'zones');
  mkdirSync(baseDir, { recursive: true });
  const manifest = {};
  const pageInstances = {};
  for (const page of model.pages.concat(rootPage(model))) {
    const pageZones = applyOverrides(slots.zones, model.config.slots_overrides, page.link, modules);
    const key = cacheKey(page.link);
    const dir = join(baseDir, key);
    mkdirSync(dir, { recursive: true });
    const pageManifest = {};
    for (const [zone, rows] of Object.entries(pageZones)) {
      pageManifest[zone] = rows.map(row => row.map(({ id, file, align }) => ({ id, file, align })));
      for (const inst of rows.flat()) {
        installed.add(inst.module);
        let html = '';
        const genPath = join(modules[inst.module].dir, 'generator.mjs');
        if (existsSync(genPath)) {
          const gen = await loadGenerator(modules, inst.module, genCache);
          try {
            html = String(await gen({
              page,
              site: model,
              params: modules[inst.module].legacyParams
                ? { ...inst.params, id: inst.id, module: inst.module }
                : inst.params,
              cell: zone,
              legacyZone: inst.legacyZone,
              i18n: i18n[page.locale] ?? (k => k),
            }) ?? '');
          } catch (e) {
            throw new Error(`instance "${inst.id}" (${inst.module}) on ${page.link}: ${e.message}`);
          }
        } else {
          const tp = join(modules[inst.module].dir, 'template.html');
          html = tplCache[tp] ??= existsSync(tp) ? readFileSync(tp, 'utf-8') : '';
        }
        writeFileSync(join(dir, inst.file), html);
      }
    }
    manifest[key] = pageManifest;
    pageInstances[key] = GRID_CELL_ORDER.flatMap(zone => pageZones[zone]?.flat() ?? []);
  }
  const validKeys = Object.keys(manifest).map(k => k.replace(/^\//, ''));
  for (const entry of readdirSync(baseDir)) {
    const alive = validKeys.some(k => k === entry || k.startsWith(entry + '/'));
    if (!alive) rmSync(join(baseDir, entry), { recursive: true, force: true });
  }
  writeFileSync(join(root, 'assets', '.cache', 'zones-manifest.json'),
    JSON.stringify(manifest));
  return { installed, pageInstances };
}
