import { sectionLeaves, formatDate, esc, requireSection, sectionSiblingsOf } from '../../scripts/lib/api.mjs';

export default async function ({ page, site, params, i18n }) {
  const section = params.section ?? '/posts/';
  requireSection(site, page.locale, section);
  const leaves = sectionLeaves(site, page.locale, section);
  if (!leaves.length) return '';
  const count = Number(params.count ?? 5);
  const show = params.show ?? [];
  const title = params.title ?? i18n('recents_title');
  const items = leaves.slice(0, count).map(p => {
    const metaBits = [];
    if (show.includes('date')) metaBits.push(formatDate(p.date, page.locale));
    if (show.includes('meta')) {
      if (p.readtime) metaBits.push(`${p.readtime} ${i18n('min_short')}`);
      if (p.wordcount) metaBits.push(`${p.wordcount} ${i18n('words_short')}`);
    }
    const meta = metaBits.length ? `<div class="recent-meta">${metaBits.join(' | ')}</div>` : '';
    return `<div class="recent-item"><a href="${esc(p.link)}">${esc(p.title)}</a>${meta}</div>`;
  }).join('');
  const urls = esc(JSON.stringify(leaves.map(p => p.link)));
  const hidden = page.isSection || ['/recents/', '/tags/', '/search/', '/explorer/'].includes(page.link);
  const ownBranch = page.link.startsWith(section) || page.parentLink?.startsWith(section);
  let nav = '';
  if (!hidden && ownBranch && site.config.features?.prev_next) {
    const sibs = sectionSiblingsOf(site, page, section);
    const idx = sibs.findIndex(p => p.link === page.link);
    const prev = idx > 0 ? sibs[idx - 1] : null;
    const next = idx >= 0 && idx < sibs.length - 1 ? sibs[idx + 1] : null;
    if (prev || next) {
      nav = `<div class="recent-footer-bottom">${prev ? `<a href="${esc(prev.link)}" class="recent-nav-prev">${esc(i18n('prev_short'))}</a>` : ''}<span class="flex-spacer"></span>${next ? `<a href="${esc(next.link)}" class="recent-nav-next">${esc(i18n('next_short'))}</a>` : ''}</div>`;
    }
  }
  return `<div class="module module-recents"><h3 class="recents-title">${esc(title)}</h3>${items}<div class="recent-footer"><div class="recent-footer-top"><a href="${esc(section)}" class="see-more">${i18n('see_more')}</a><a href="#" class="random-note" data-urls="${urls}">${i18n('random_note')}</a></div>${nav}</div></div>`;
}
