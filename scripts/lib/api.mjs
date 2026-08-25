import { prefixOf } from './model.mjs';

export function cacheKey(link) {
  return link === '/' ? 'index' : link;
}

export function sectionLeaves(model, localeCode, sectionLink) {
  return model.pages
    .filter(p => p.locale === localeCode && !p.isSection && p.link.startsWith(sectionLink))
    .sort((x, y) => String(y.date).localeCompare(String(x.date)));
}

export function siblingsOf(model, page) {
  return model.pages
    .filter(p => p.locale === page.locale && p.parentLink === page.parentLink && !p.isSection)
    .sort((x, y) => String(x.date).localeCompare(String(y.date)));
}

export function sectionSiblingsOf(model, page, section) {
  return model.pages
    .filter(p => p.locale === page.locale && !p.isSection && p.link.startsWith(section) && p.parentLink?.startsWith(section))
    .sort((x, y) => String(x.date).localeCompare(String(y.date)));
}

export function childSections(model, localeCode, parentLink) {
  return model.pages
    .filter(p => p.locale === localeCode && p.isSection && p.parentLink === parentLink)
    .sort((x, y) => String(x.date).localeCompare(String(y.date)));
}

const MONTHS = [['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'], ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']];
export function formatDate(iso, lang) {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const mi = Number(m[2]) - 1;
  return lang === 'ru'
    ? `${Number(m[3])} ${MONTHS[0][mi]} ${m[1]}`
    : `${MONTHS[1][mi]} ${Number(m[3])}, ${m[1]}`;
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function localeConfig(model, code) {
  return model.config.site.locales.find(l => l.code === code);
}

function homeLinkFor(model, code) {
  const loc = localeConfig(model, code);
  const link = '/' + (loc ? prefixOf(loc) : `${code}/`);
  return link.endsWith('/') ? link : `${link}/`;
}

export function homeLink(model, page) {
  return homeLinkFor(model, page.locale);
}

export function requireSection(model, localeCode, sectionLink) {
  const section = model.pages.find(p => p.locale === localeCode && p.isSection && p.link === sectionLink);
  if (!section) throw new Error(`section "${sectionLink}" not found`);
  return section;
}

export function altLink(model, page, code) {
  const own = localeConfig(model, page.locale);
  const ownPrefix = own ? prefixOf(own) : `${page.locale}/`;
  const target = localeConfig(model, code);
  const targetPrefix = target ? prefixOf(target) : `${code}/`;
  const rest = page.link.slice(1 + ownPrefix.length);
  const candidate = ('/' + targetPrefix + rest).replace(/\/\/+/g, '/');
  const found = model.pages.find(p => p.locale === code && p.link === candidate);
  return found ? found.link : homeLinkFor(model, code);
}
