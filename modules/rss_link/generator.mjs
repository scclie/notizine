export default async function generate(siteData) {
  if (!siteData.config.features?.rss) return { html: '' };
  const html = `<a href="/rss.xml" class="rss-link">RSS</a>`;
  return { html };
}
