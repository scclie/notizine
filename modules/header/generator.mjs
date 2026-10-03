import { esc, homeLink } from '../../scripts/lib/api.mjs';

export default async function ({ page, site, params }) {
  const home = site.pages.find(p => p.locale === page.locale && p.link === homeLink(site, page));
  const title = (params.site_title ?? home?.title ?? params.title ?? '');
  return `<a href="${home?.link ?? '/'}" class="site-title">${esc(title)}</a>`;
}
