import { esc } from '../../scripts/lib/api.mjs';

export default async function ({ i18n }) {
  return `<section class="search-widget" data-empty="${esc(i18n('search_empty'))}" data-unavailable="${esc(i18n('search_unavailable'))}"><input type="search" class="search-input" aria-label="${esc(i18n('search_title'))}" placeholder="${esc(i18n('search_placeholder'))}" autocomplete="off"><div class="search-results" aria-live="polite"></div></section>`;
}
