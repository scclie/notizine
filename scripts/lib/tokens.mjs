const SCALE = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
export function renderTokens(config) {
  const L = config.layout ?? {};
  const k = L.spacing ?? 1;
  const lines = [':root {'];
  SCALE.forEach((s, i) => lines.push(`--sp-${i + 1}: ${(s * k).toFixed(3)}rem;`));
  lines.push(`--col-gap: ${L.gap ?? '1.5rem'};`);
  lines.push(`--page-width: ${L.width ?? '720px'};`);
  const cols = L.columns ?? ['auto', '720px', 'auto'];
  lines.push(`--col-left: ${cols[0]};`, `--col-right: ${cols[cols.length - 1]};`);
  if (L.left_width) lines.push(`--sidebar-left-max: ${L.left_width};`);
  if (L.right_width) lines.push(`--sidebar-right-max: ${L.right_width};`);
  for (const part of ['body', 'heading', 'code']) {
    if (config.fonts?.[part]) lines.push(`--font-${part}: ${config.fonts[part]};`);
  }
  return lines.join('\n') + '\n}\n';
}
