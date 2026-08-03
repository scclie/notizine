import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export default async function generateOG(siteData) {
  const og = siteData.config.og || {};
  if (!siteData.config.features?.og_images) {
    console.log('[generate-og] Skipped (og_images disabled)');
    return;
  }

  const colors = {
    bg_top: og.bg_top || '#2e3440',
    bg_bottom: og.bg_bottom || '#3b4252',
    accent: og.accent || '#5e81ac',
    text: og.text || '#eceff4',
    muted: og.muted || '#b48ead',
  };
  const sizes = {
    title: og.title_size || 52,
    desc: og.desc_size || 26,
    site: og.site_size || 22,
    date: og.date_size || 24,
  };
  const font = og.font_family || 'system-ui, sans-serif';
  const showDate = og.show_date !== false;
  const showDesc = og.show_desc !== false;
  const bgImage = og.background_image || '';
  const siteName = og.site_name || '';

  const W = 1200, H = 630;
  const pages = siteData.pages.filter(p => !p.isSection && p.title);
  let count = 0;

  for (const page of pages) {
    const title = escapeXML(truncate(page.title, 50));
    const desc = escapeXML(truncate(page.description, 80));
    const date = page.date ? page.date.slice(0, 10) : '';

    const bgRect = bgImage
      ? `<image href="${bgImage}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>`
      : `<rect width="${W}" height="${H}" fill="url(#bg)"/>`;

    const descBlock = (showDesc && desc)
      ? `<text x="60" y="360" font-family="${font}" font-size="${sizes.desc}px" fill="${colors.text}" opacity="0.85">${desc}</text>`
      : '';
    const dateBlock = (showDate && date)
      ? `<text x="60" y="580" font-family="${font}" font-size="${sizes.date}px" fill="${colors.muted}">${date}</text>`
      : '';

    const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:${colors.bg_top}"/>
      <stop offset="100%" style="stop-color:${colors.bg_bottom}"/>
    </linearGradient>
  </defs>
  ${bgRect}
  <rect x="0" y="0" width="8" height="${H}" fill="${colors.accent}"/>
  <text x="60" y="80" font-family="${font}" font-size="${sizes.site}px" fill="${colors.muted}">${escapeXML(siteName)}</text>
  <text x="60" y="280" font-family="${font}" font-size="${sizes.title}px" fill="${colors.text}" font-weight="bold">${title}</text>
  ${descBlock}
  ${dateBlock}
</svg>`;

    const outDir = join(process.cwd(), 'public', page.link.replace(/^\//, ''));
    mkdirSync(outDir, { recursive: true });
    await sharp(Buffer.from(svg)).png().toFile(join(outDir, 'og.png'));
    count++;
  }

  console.log(`[generate-og] Generated ${count} OG images`);
}

function escapeXML(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function truncate(s, max) {
  if (!s) return '';
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + '...';
}
