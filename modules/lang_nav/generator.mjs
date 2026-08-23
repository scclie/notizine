import { altLink } from '../../scripts/lib/api.mjs';

export default async function ({ page, site }) {
  const alts = site.config.site.locales
    .map(loc => ({ loc, link: altLink(site, page, loc.code) }))
    .filter(a => a.link && a.loc.code !== page.locale);
  if (!alts.length) return '';
  const items = alts.map(a =>
    `<a href="${a.link}" class="lang-link"><span class="lang-cur">${page.locale}</span><span class="lang-sep">/</span><span class="lang-alt">${a.loc.code}</span></a>`).join('');
  return `<nav class="lang-nav">${items}</nav>`;
}
