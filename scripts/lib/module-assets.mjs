import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const DELIVERY_RANK = Object.freeze({ critical: 0, deferred: 1, external: 2 });
const GROUPS = Object.freeze({
  critical: { css: 'criticalStyles', js: 'criticalScripts' },
  deferred: { css: 'deferredStyles', js: 'deferredScripts' },
  external: { css: 'externalStyles', js: 'externalScripts' },
});

function emptyGroups() {
  return {
    criticalStyles: '',
    criticalScripts: '',
    deferredStyles: '',
    deferredScripts: '',
    externalStyles: '',
    externalScripts: '',
    localAssets: [],
  };
}

function escapeAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function assetType(source) {
  const path = source.split(/[?#]/, 1)[0].toLowerCase();
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.js')) return 'js';
  throw new Error(`asset "${source}" must be a .css or .js file`);
}

function effectiveDelivery(instance, module) {
  const delivery = instance.delivery ?? module.delivery ?? 'critical';
  if (DELIVERY_RANK[delivery] === undefined) {
    throw new Error(`module "${instance.module}" has invalid effective delivery "${delivery}"`);
  }
  return delivery;
}

function isRemote(source) {
  return /^[a-z][a-z0-9+.-]*:/i.test(source);
}

function localSource(module, source) {
  const path = resolve(module.dir, source);
  if (relative(module.dir, path).startsWith('..')) {
    throw new Error(`module "${module.name}" asset "${source}" escapes its module directory`);
  }
  if (!existsSync(path)) throw new Error(`module "${module.name}" asset "${source}" not found`);
  return path;
}

function outputPath(root, output, source) {
  if (typeof output !== 'string' || !output.startsWith('/') || output.startsWith('//')) {
    throw new Error(`local asset "${source}" requires an absolute manifest output path`);
  }
  const path = resolve(root, 'assets', `.${output}`);
  if (relative(join(root, 'assets'), path).startsWith('..')) {
    throw new Error(`local asset "${source}" has an unsafe output path`);
  }
  return path;
}

function orderedDistinctAssets(instances, modules) {
  const seen = new Set();
  const ordered = [];
  for (const instance of instances ?? []) {
    const module = modules[instance.module];
    if (!module) throw new Error(`unknown module "${instance.module}" while building page assets`);
    const delivery = effectiveDelivery(instance, module);
    for (const asset of module.assets ?? []) {
      const assetDelivery = asset.delivery ?? module.delivery ?? 'critical';
      if (DELIVERY_RANK[assetDelivery] === undefined) {
        throw new Error(`module "${module.name}" asset "${asset.source}" has invalid delivery`);
      }
      if (DELIVERY_RANK[assetDelivery] < DELIVERY_RANK[delivery]) {
        throw new Error(`module "${module.name}" asset "${asset.source}" is more critical than its effective module delivery`);
      }
      const source = asset.source;
      if (typeof source !== 'string' || source === '') {
        throw new Error(`module "${module.name}" has an asset without a source`);
      }
      const remote = isRemote(source);
      if (remote && !source.startsWith('https://')) {
        throw new Error(`remote asset "${source}" must use HTTPS`);
      }
      if (remote && assetDelivery !== 'external') {
        throw new Error(`remote asset "${source}" must use external delivery`);
      }
      const localPath = remote ? null : localSource(module, source);
      const fingerprint = remote ? source : localPath;
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      ordered.push({ module, source, localPath, remote, delivery: assetDelivery, output: asset.output });
    }
  }
  return ordered;
}

function renderAsset(asset, root, includeCriticalStyles) {
  const type = assetType(asset.source);
  if (asset.delivery === 'critical' && type === 'css' && !includeCriticalStyles) return null;
  if (asset.delivery === 'critical') {
    const contents = readFileSync(asset.localPath, 'utf8');
    const marker = ` data-module-asset="${escapeAttribute(asset.source)}"`;
    return { group: GROUPS.critical[type], html: type === 'css'
      ? `<style${marker}>${contents}</style>`
      : `<script${marker}>${contents}</script>` };
  }

  const href = asset.remote ? asset.source : asset.output;
  const localAsset = asset.remote ? null : asset.output.slice(1);
  if (!asset.remote) {
    const destination = outputPath(root, asset.output, asset.source);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(asset.localPath, destination);
  }
  const escapedHref = escapeAttribute(href);
  if (type === 'css') {
    if (asset.delivery === 'deferred') {
      return {
        group: GROUPS.deferred.css,
        html: `<link rel="stylesheet" href="${escapedHref}" media="print" onload="this.media='all'"><noscript><link rel="stylesheet" href="${escapedHref}"></noscript>`,
        ...(localAsset === null ? {} : { localAsset }),
      };
    }
    return {
      group: GROUPS.external.css,
      html: `<link rel="stylesheet" href="${escapedHref}">`,
      ...(localAsset === null ? {} : { localAsset }),
    };
  }
  return {
    group: GROUPS[asset.delivery].js,
    html: `<script defer src="${escapedHref}"></script>`,
    ...(localAsset === null ? {} : { localAsset }),
  };
}

export function buildPageAssets({ pageKey, instances, modules, root, includeCriticalStyles = true }) {
  if (typeof pageKey !== 'string' || pageKey === '') throw new Error('pageKey is required');
  const groups = emptyGroups();
  for (const asset of orderedDistinctAssets(instances, modules)) {
    const rendered = renderAsset(asset, root, includeCriticalStyles);
    if (rendered) {
      groups[rendered.group] += rendered.html;
      if (rendered.localAsset) groups.localAssets.push(rendered.localAsset);
    }
  }
  return groups;
}

export function writePageAssets(pageAssets, root) {
  const path = join(root, 'assets', '.cache', 'page-assets.json');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(pageAssets));
}
