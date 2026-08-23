export default async function ({ site }) {
  if (!site?.config?.features?.rss) return '';
  return `<a href="/rss.xml" class="rss-link">RSS</a>`;
}
