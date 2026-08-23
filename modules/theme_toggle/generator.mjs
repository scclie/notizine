export default async function ({ site }) {
  if (!site.config.features?.darkmode) return '';
  return `<div class="theme-toggle"><input type="checkbox" id="theme-dark" class="theme-dark-input"><label for="theme-dark" class="theme-dark-label" title="Toggle theme"></label></div>`;
}
