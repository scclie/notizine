import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DELIVERY_STRATEGIES, parseModuleManifest, validateModuleParams } from './module-manifest.mjs';

const RESERVED_INSTANCE_FIELDS = new Set(['module', 'id', 'align', 'delivery', 'legacyZone', 'params', 'file']);

export function discoverModules(root) {
  const base = join(root, 'modules');
  const out = {};
  if (!existsSync(base)) return out;
  for (const entry of readdirSync(base).sort()) {
    const dir = join(base, entry);
    if (!statSync(dir).isDirectory()) continue;
    const manifestPath = join(dir, 'module.ziggy');
    if (!existsSync(manifestPath)) continue;
    const manifest = parseModuleManifest(readFileSync(manifestPath, 'utf-8'), manifestPath);
    if (out[manifest.name]) throw new Error(`duplicate module name "${manifest.name}"`);
    const module = { ...manifest, dir };
    Object.defineProperty(module, 'legacyParams', { value: manifest.legacyParams, enumerable: false });
    out[manifest.name] = module;
  }
  return out;
}

function normalizedManifest(module, name) {
  return {
    ...module,
    name: module.name ?? name,
    params: module.params ?? {},
    delivery: module.delivery ?? 'critical',
    legacyParams: module.legacyParams === true || module.name === undefined,
    legacyRecord: module.name === undefined,
  };
}

function normalizedParams(entry, manifest, path) {
  if (entry.params !== undefined && (entry.params === null || typeof entry.params !== 'object' || Array.isArray(entry.params))) {
    throw new Error(`${path}.params: expected params object`);
  }
  const flatParams = Object.fromEntries(Object.entries(entry)
    .filter(([name]) => !RESERVED_INSTANCE_FIELDS.has(name)));
  const params = { ...flatParams, ...(entry.params ?? {}) };
  return manifest.legacyParams ? params : validateModuleParams(manifest, params, `${path}.params`);
}

function makeGeneratedId(moduleName, ids, generatedIds) {
  let index = generatedIds.get(moduleName) ?? 0;
  let id = index === 0 ? moduleName : `${moduleName}_${index}`;
  while (ids.has(id)) {
    index += 1;
    id = `${moduleName}_${index}`;
  }
  generatedIds.set(moduleName, index + 1);
  return id;
}

function normalizeRows(rows, zone, modules, ids, generatedIds) {
  return rows.map((row, rowIndex) => row.map((entry, entryIndex) => {
    const source = typeof entry === 'string' ? { module: entry } : { ...entry };
    if (!modules[source.module]) throw new Error(`slots/${zone}: unknown module "${source.module}"`);
    const manifest = normalizedManifest(modules[source.module], source.module);
    const path = `slots/${zone}[${rowIndex}][${entryIndex}]`;
    const delivery = source.delivery ?? manifest.delivery;
    if (!DELIVERY_STRATEGIES.includes(delivery)) {
      throw new Error(`${path}.delivery: expected one of critical, deferred, external`);
    }
    const params = normalizedParams(source, manifest, path);
    const id = source.id === undefined
      ? makeGeneratedId(source.module, ids, generatedIds)
      : source.id;
    if (source.id !== undefined) {
      generatedIds.set(source.module, (generatedIds.get(source.module) ?? 0) + 1);
    }
    if (ids.has(id)) throw new Error(`slots/${zone}: duplicate instance id "${id}"`);
    ids.add(id);
    return {
      module: source.module,
      ...(source.legacyZone === undefined ? {} : { legacyZone: source.legacyZone }),
      id,
      file: `${id}.html`,
      align: source.align ?? 'left',
      ...(manifest.legacyRecord ? {} : { delivery, params }),
    };
  }));
}

function idsAndGeneratedIds(zones) {
  const ids = new Set();
  const generatedIds = new Map();
  for (const instance of Object.values(zones).flat(2)) {
    ids.add(instance.id);
    const match = instance.id === instance.module
      ? 0
      : instance.id.match(new RegExp(`^${instance.module.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_(\\d+)$`))?.[1];
    if (match !== undefined) generatedIds.set(instance.module, Math.max(generatedIds.get(instance.module) ?? 0, Number(match) + 1));
  }
  return { ids, generatedIds };
}

export function resolveSlots(config, modules) {
  const ids = new Set();
  const generatedIds = new Map();
  const zones = {};
  for (const [zone, rows] of Object.entries(config.slots ?? {})) {
    zones[zone] = normalizeRows(rows, zone, modules, ids, generatedIds);
  }
  return { zones, order: [...ids] };
}

export function applyOverrides(zones, overrides, link, modules) {
  const hits = Object.keys(overrides ?? {})
    .filter(prefix => prefix === '/' ? link === '/' : prefix !== '' && link.startsWith(prefix))
    .sort((a, b) => a.length - b.length);
  if (!hits.length) return zones;
  const merged = JSON.parse(JSON.stringify(zones));
  for (const prefix of hits) {
    for (const [zone, rows] of Object.entries(overrides[prefix])) {
      delete merged[zone];
      const { ids, generatedIds } = idsAndGeneratedIds(merged);
      merged[zone] = normalizeRows(rows, `${prefix}${zone}`, modules, ids, generatedIds);
    }
  }
  return merged;
}
