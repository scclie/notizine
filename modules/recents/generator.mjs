export default async function generate(siteData) {
  const i18n = siteData.i18n[siteData.config.language_primary] || Object.values(siteData.i18n)[0] || {};
  const recentsTitle = i18n.recents_title || 'Recent posts';

  const posts = siteData.pages
    .filter(p => !p.isSection && p.title)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  const itemsHTML = posts.map(p => `
    <div class="recent-item">
      <a href="/${p.link}">${escapeHTML(p.title)}</a>
      <time>${p.date.slice(0, 10)}</time>
    </div>
  `).join('');

  const html = `<div class="module module-recents">
  <h3>${recentsTitle}</h3>
  ${itemsHTML}
</div>`;

  return { html };
}

function escapeHTML(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
