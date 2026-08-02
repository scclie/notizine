export default async function generate(siteData) {
  const locales = siteData.zineConfig.locales || [];
  if (locales.length <= 1) return { html: '' };

  const links = locales.map(l => {
    const prefix = l.output_prefix !== null ? l.output_prefix : l.code + '/';
    return `<a href="/${prefix}">${l.code.toUpperCase()}</a>`;
  });

  const html = `<nav class="lang-nav">${links.join('')}</nav>`;
  return { html };
}
