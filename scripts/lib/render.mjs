import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cacheKey, homeLink } from './api.mjs';
import { applyOverrides, discoverModules } from './modules.mjs';

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
              params: inst,
              zone,
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
  }
  const validKeys = Object.keys(manifest).map(k => k.replace(/^\//, ''));
  for (const entry of readdirSync(baseDir)) {
    const alive = validKeys.some(k => k === entry || k.startsWith(entry + '/'));
    if (!alive) rmSync(join(baseDir, entry), { recursive: true, force: true });
  }
  writeFileSync(join(root, 'assets', '.cache', 'zones-manifest.json'),
    JSON.stringify(manifest));
  return installed;
}

const UNMIGRATED_GENERATORS = [];

export function v2Slots(rawSlots) {
  const dropped = new Set();
  const seen = new Map();
  const out = {};
  for (const [zone, rows] of Object.entries(rawSlots ?? {})) {
    out[zone] = rows.map(row => row.map(entry => {
      const name = typeof entry === 'string' ? entry : entry.module;
      if (name === '_content' || UNMIGRATED_GENERATORS.includes(name)) {
        if (!dropped.has(name)) {
          dropped.add(name);
          console.warn(`[generate] v2: dropping ${name} (unmigrated)`);
        }
        return null;
      }
      const inst = typeof entry === 'string' ? { module: name } : { ...entry };
      const n = seen.get(name) ?? 0;
      seen.set(name, n + 1);
      inst.id ??= n === 0 ? name : `${name}_${n}`;
      return inst;
    }).filter(Boolean));
  }
  return out;
}

export function bundleClient(installedNames, order, root) {
  const modules = discoverModules(root);
  const seen = new Set();
  const parts = [];
  for (const name of order) {
    if (!installedNames.has(name) || seen.has(name)) continue;
    seen.add(name);
    const p = join(modules[name].dir, 'client.js');
    if (existsSync(p)) parts.push(`(function(){\n${readFileSync(p, 'utf-8')}\n})();`);
  }
  mkdirSync(join(root, 'assets', '.cache'), { recursive: true });
  writeFileSync(join(root, 'assets', '.cache', 'all.js'), parts.join('\n'));
}
