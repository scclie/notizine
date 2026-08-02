export default async function generate(siteData) {
  const social = siteData.config.social || {};
  const links = [];
  if (social.github) {
    links.push(`<a href="https://github.com/${social.github}" class="social-link" target="_blank" rel="noopener">GitHub</a>`);
  }
  if (social.mastodon) {
    links.push(`<a href="${social.mastodon}" rel="me" class="social-link">Mastodon</a>`);
  }
  if (links.length === 0) return { html: '' };
  return { html: `<div class="module module-social">${links.join('')}</div>` };
}
