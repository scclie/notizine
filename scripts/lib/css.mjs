import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { discoverModules, resolveSlots } from './modules.mjs';
import { renderTokens } from './tokens.mjs';

function orderedModuleNames(config, modules, installed) {
  const slots = resolveSlots(config, modules);
  const byId = new Map();
  for (const rows of Object.values(slots.zones)) {
    for (const row of rows) {
      for (const inst of row) byId.set(inst.id, inst.module);
    }
  }
  const seen = new Set();
  const names = [];
  const push = name => {
    if (!name || seen.has(name) || !installed.has(name)) return;
    seen.add(name);
    names.push(name);
  };
  for (const id of slots.order) push(byId.get(id));
  for (const zoneMap of Object.values(config.slots_overrides ?? {})) {
    for (const rows of Object.values(zoneMap ?? {})) {
      for (const row of rows ?? []) {
        for (const inst of row) push(inst.module);
      }
    }
  }
  return names;
}

export function bundleCSS(config, installedModules, root) {
  const modules = discoverModules(root);
  const parts = [renderTokens(config)];
  parts.push(readFileSync(join(root, 'assets', 'css', 'base.css'), 'utf-8'));
  parts.push(readFileSync(join(root, 'assets', 'css', 'code.css'), 'utf-8'));
  parts.push(readFileSync(join(root, 'assets', 'themes', `${config.theme}.css`), 'utf-8'));
  const seenStyles = new Set();
  for (const name of orderedModuleNames(config, modules, installedModules)) {
    for (const asset of modules[name].assets) {
      if (asset.delivery !== 'critical' || !asset.source.endsWith('.css')) continue;
      const stylePath = join(modules[name].dir, asset.source);
      if (!existsSync(stylePath) || seenStyles.has(stylePath)) continue;
      seenStyles.add(stylePath);
      parts.push(readFileSync(stylePath, 'utf-8'));
    }
  }
  if (config.custom_css) {
    parts.push(readFileSync(join(root, 'assets', config.custom_css), 'utf-8'));
  }
  mkdirSync(join(root, 'assets', '.cache'), { recursive: true });
  writeFileSync(join(root, 'assets', '.cache', 'all.css'), parts.join('\n') + '\n');
  if (config.features?.inline_mode === false) {
    mkdirSync(join(root, 'assets', 'css'), { recursive: true });
    copyFileSync(
      join(root, 'assets', '.cache', 'all.css'),
      join(root, 'assets', 'css', 'generated.css')
    );
  } else {
    rmSync(join(root, 'assets', 'css', 'generated.css'), { force: true });
  }
}
