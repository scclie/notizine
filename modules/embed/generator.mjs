/**
 * embed module - generates iframe for external content
 * Usage in slots: { "module": "embed", "url": "https://...", "height": "770", "title": "..." }
 */
export default async ({ params }) => {
  const url = params.url || '';
  const height = params.height || '400';
  const title = params.title || 'Embedded content';
  const width = params.width || '100%';

  if (!url) return '';

  return `
<div class="embed-container">
  <iframe
    src="${url}"
    style="width: ${width}; height: ${height}px; border: 1px solid var(--secondary, #ccc); border-radius: 8px;"
    loading="lazy"
    title="${title}"
    allowfullscreen
  ></iframe>
</div>`;
};
