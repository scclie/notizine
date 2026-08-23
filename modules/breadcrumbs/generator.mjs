import { esc, homeLink } from '../../scripts/lib/api.mjs';

export default async function ({ page, site, params, i18n }) {
  if (!Array.isArray(site?.pages) || page?.isSection !== false) return '';
  const home = homeLink(site, page);
  const parent = site.pages.find(p => p.locale === page.locale && p.link === page.parentLink);
  const parts = [`<a href="${home}">${i18n('home')}</a>`];
  if (parent && parent.link !== '/' && parent.link !== home) {
    parts.push(`<a href="${parent.link}">${esc(parent.title)}</a>`);
  }
  parts.push(`<span>${esc(page.title)}</span>`);
  return `<nav class="breadcrumbs">${parts.join('<span class="crumb-sep">/</span>')}</nav>`;
}
