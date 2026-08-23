import { childSections, sectionLeaves, homeLink, esc } from '../../scripts/lib/api.mjs';

function node(site, locale, sec, exclude) {
  const kids = childSections(site, locale, sec.link)
    .filter(s => !exclude.includes(s.link));
  const leaves = sectionLeaves(site, locale, sec.link).filter(p => p.parentLink === sec.link);
  const inner = kids.map(k => node(site, locale, k, exclude)).join('');
  const list = leaves.map(p => `<li><a href="${esc(p.link)}">${esc(p.title)}</a></li>`).join('');
  return `<li class="explorer-node"><details open><summary><a href="${esc(sec.link)}">${esc(sec.title)}</a></summary><ul>${inner}${list}</ul></details></li>`;
}

export default async function ({ page, site, params }) {
  const locale = page.locale;
  const exclude = params.exclude ?? [];
  const root = params.root ?? '/';
  const startSec = site.pages.find(p => p.locale === locale && p.isSection && p.link === root);
  const base = startSec ? startSec.link : homeLink(site, page);
  const atBase = p => p.parentLink === base || (base === homeLink(site, page) && p.parentLink === null);
  const secs = site.pages
    .filter(p => p.locale === locale && p.isSection && p.link !== base && atBase(p))
    .sort((x, y) => String(x.date).localeCompare(String(y.date)));
  const leaves = site.pages
    .filter(p => p.locale === locale && !p.isSection && atBase(p))
    .sort((x, y) => String(y.date).localeCompare(String(x.date)));
  const inner = secs.filter(s => !exclude.includes(s.link))
    .map(s => node(site, locale, s, exclude))
    .join('');
  const list = leaves.filter(p => !exclude.includes(p.link))
    .map(p => `<li><a href="${esc(p.link)}">${esc(p.title)}</a></li>`)
    .join('');
  if (!inner && !list) return '';
  return `<ul class="explorer-tree">${inner}${list}</ul>`;
}
