import { esc } from '../../scripts/lib/api.mjs';

export default async function ({ page, i18n }) {
  return `<input type="search" id="search-input" data-locale="${esc(page.locale)}" placeholder="${esc(i18n('search_placeholder'))}" autocomplete="off"><div id="search-results"></div>`;
}
