export default async function generate(siteData) {
  if (!siteData.config.features?.darkmode) return { html: '' };
  const html = `<div class="theme-toggle">
  <input type="checkbox" id="theme-dark" onchange="localStorage.setItem('notizine-theme',this.checked?'dark':'light');document.documentElement.setAttribute('data-theme',this.checked?'dark':'')">
  <label for="theme-dark" title="Toggle theme"></label>
</div>`;
  return { html };
}
