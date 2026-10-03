import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async function ({ page, site, legacyZone }) {
  if (legacyZone === 'before_main') {
    const overrides = site.config?.slots_overrides ?? {};
    let slots = site.config?.slots;
    for (const prefix of Object.keys(overrides)
      .filter(prefix => prefix === '/' ? page.link === '/' : prefix !== '' && page.link.startsWith(prefix))
      .sort((a, b) => a.length - b.length)) {
      if (overrides[prefix]) slots = overrides[prefix];
    }
    const hasLegacyHeader = (slots?.top_center ?? [])
      .flat()
      .some(entry => entry?.legacyZone === 'header');
    if (!hasLegacyHeader) return '';
  }
  return readFileSync(join(import.meta.dirname, 'template.html'), 'utf-8');
}
