import { esc } from '../../scripts/lib/api.mjs';

export default async function ({ site }) {
  const social = site?.config?.social || {};
  const links = [];
  if (social.github) {
    links.push(`<a href="https://github.com/${esc(social.github)}" class="social-link" target="_blank" rel="noopener">GitHub</a>`);
  }
  if (social.mastodon) {
    links.push(`<a href="${esc(social.mastodon)}" rel="me" class="social-link">Mastodon</a>`);
  }
  if (links.length === 0) return '';
  return `<div class="module module-social">${links.join('')}</div>`;
}
