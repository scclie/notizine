import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default function generateOG(siteData) {
  if (!siteData.config.features?.og_images) return;
  console.warn('[generate-og] OG image generation deferred to v2.1 (node-canvas dependency pending)');
}
