export default async function ({ page, site }) {
  if (!site?.config?.features?.rss) return '';
  const posts = (site.pages ?? []).find(p => p.locale === page.locale && p.isSection && p.link.endsWith('/posts/'));
  if (!posts) return '';
  return `<a href="${posts.link}index.xml" class="rss-link">RSS</a>`;
}
