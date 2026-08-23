import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async function ({ page, site, zone }) {
  if (zone === 'before_main') {
    const overrides = site.config?.slots_overrides ?? {};
    let header = site.config?.slots?.header;
    for (const prefix of Object.keys(overrides)
      .filter(p => page.link.startsWith(p))
      .sort((a, b) => a.length - b.length)) {
      if (overrides[prefix]?.header) header = overrides[prefix].header;
    }
    const instances = (header ?? []).flat().filter(Boolean);
    if (!instances.length) return '';
  }
  return readFileSync(join(import.meta.dirname, 'template.html'), 'utf-8');
}
