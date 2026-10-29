import { esc } from '../../scripts/lib/api.mjs';

export default async function ({ params = {} }) {
  if (!params.text) return '';
  return `<p class="footer-text">${esc(params.text)}</p>`;
}
