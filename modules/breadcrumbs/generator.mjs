export default async function generate(siteData) {
  if (!siteData.config.features?.breadcrumbs) {
    const pages = {};
    for (const p of siteData.pages) pages[p.link] = '';
    return { pages };
  }
  const i18n = siteData.i18n[siteData.config.language_primary] || Object.values(siteData.i18n)[0] || {};
  const homeLabel = i18n.home || 'Home';

  const pages = {};
  for (const page of siteData.pages) {
    if (page.isSection) { pages[page.link] = ''; continue; }
    const crumbs = [{ link: '/', title: homeLabel }];
    if (page.parentSection) {
      crumbs.push({ link: '/' + page.parentSection.link, title: page.parentSection.title });
    }
    crumbs.push({ link: null, title: page.title });
    const parts = crumbs.map(c =>
      c.link ? `<a href="${c.link}">${escapeHTML(c.title)}</a>` : `<span>${escapeHTML(c.title)}</span>`
    );
    pages[page.link] = `<nav class="breadcrumbs">${parts.join(' <span> / </span>')}</nav>`;
  }
  return { pages };
}

function escapeHTML(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
