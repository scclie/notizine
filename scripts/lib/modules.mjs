import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function discoverModules(root) {
  const base = join(root, 'modules');
  const out = {};
  if (!existsSync(base)) return out;
  for (const entry of readdirSync(base).sort()) {
    const dir = join(base, entry);
    if (!statSync(dir).isDirectory()) continue;
    const mf = join(dir, 'module.ziggy');
    if (!existsSync(mf)) continue;
    const name = readFileSync(mf, 'utf-8').match(/\.name\s*=\s*"([^"]+)"/)?.[1];
    if (!name) throw new Error(`module ${entry}: .name missing in module.ziggy`);
    out[name] = { dir };
  }
  return out;
}

function normalizeRow(rows, zone, modules, ids) {
  return rows.map(row => row.map(entry => {
    const inst = typeof entry === 'string' ? { module: entry } : { ...entry };
    if (!modules[inst.module]) throw new Error(`slots/${zone}: unknown module "${inst.module}"`);
    inst.id ??= inst.module;
    inst.align ??= 'left';
    if (ids.has(inst.id)) throw new Error(`slots/${zone}: duplicate instance id "${inst.id}"`);
    ids.add(inst.id);
    inst.file = `${inst.id}.html`;
    return inst;
  }));
}

export function resolveSlots(config, modules) {
  const ids = new Set();
  const zones = {};
  for (const [zone, rows] of Object.entries(config.slots ?? {})) {
    zones[zone] = normalizeRow(rows, zone, modules, ids);
  }
  const order = [...ids];
  return { zones, order };
}

export function applyOverrides(zones, overrides, link, modules) {
  const hits = Object.keys(overrides ?? {})
    .filter(prefix => prefix === '/' ? link === '/' : prefix !== '' && link.startsWith(prefix))
    .sort((a, b) => a.length - b.length);
  if (!hits.length) return zones;
  const merged = JSON.parse(JSON.stringify(zones));
  const ids = new Set(Object.values(zones).flat(2).map(i => i.id));
  for (const prefix of hits) {
    for (const [zone, rows] of Object.entries(overrides[prefix])) {
      merged[zone] = normalizeRow(rows, `${prefix}${zone}`, modules, ids);
    }
  }
  return merged;
}
