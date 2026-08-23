import { esc, siblingsOf } from '../../scripts/lib/api.mjs';

export default async function ({ page, site, params, i18n }) {
  if (!site?.pages || page?.isSection !== false) return '';
  const sib = siblingsOf(site, page);
  const i = sib.findIndex(p => p.link === page.link);
  const prev = i > 0 ? sib[i - 1] : null;
  const next = i >= 0 && i < sib.length - 1 ? sib[i + 1] : null;
  if (!prev && !next) return '';
  const a = prev ? `<a href="${prev.link}" class="pn-prev">${i18n('previous_page')}: ${esc(prev.title)}</a>` : '<span></span>';
  const b = next ? `<a href="${next.link}" class="pn-next">${i18n('next_page')}: ${esc(next.title)}</a>` : '<span></span>';
  return `<nav class="prev-next">${a}${b}</nav>`;
}
