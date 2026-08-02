export default async function generate(siteData) {
  const i18n = siteData.i18n[siteData.config.language_primary] || Object.values(siteData.i18n)[0] || {};
  const prevLabel = i18n.previous_page || 'Previous';
  const nextLabel = i18n.next_page || 'Next';

  const pages = {};
  const nonSection = siteData.pages.filter(p => !p.isSection);
  for (let i = 0; i < nonSection.length; i++) {
    const page = nonSection[i];
    const prev = i > 0 ? nonSection[i - 1] : null;
    const next = i < nonSection.length - 1 ? nonSection[i + 1] : null;
    if (!prev && !next) {
      pages[page.link] = '';
      continue;
    }
    let html = '<nav class="prev-next">';
    if (prev) html += `<a href="/${prev.link}">${prevLabel}: ${escapeHTML(prev.title)}</a>`;
    if (next) html += `<a href="/${next.link}">${nextLabel}: ${escapeHTML(next.title)}</a>`;
    html += '</nav>';
    pages[page.link] = html;
  }
  return { pages };
}

function escapeHTML(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
