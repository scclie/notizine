export default async function generate(siteData) {
  const title = siteData.zineConfig.locales[0]?.site_title || siteData.config.site?.title || '';
  const homeLink = '/';
  const html = `<a href="${homeLink}" class="site-title">${escapeHTML(title)}</a>`;
  return { html };
}
function escapeHTML(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
