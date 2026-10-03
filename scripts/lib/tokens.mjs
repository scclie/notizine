const SCALE = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
export function renderTokens(config) {
  const L = config.layout ?? {};
  const k = L.spacing ?? 1;
  const lines = [':root {'];
  SCALE.forEach((s, i) => lines.push(`--sp-${i + 1}: ${(s * k).toFixed(3)}rem;`));
  const cols = L.columns ?? ['auto', '720px', 'auto'];
  const rows = L.rows ?? ['auto', '1fr', 'auto'];
  lines.push(
    `--grid-col-1: ${cols[0]};`,
    `--grid-col-2: ${cols[1]};`,
    `--grid-col-3: ${cols[2]};`,
    `--grid-row-1: ${rows[0]};`,
    `--grid-row-2: ${rows[1]};`,
    `--grid-row-3: ${rows[2]};`,
    `--grid-gap: ${L.gap ?? '1.5rem'};`
  );
  lines.push(`--page-width: ${L.width ?? cols[1]};`);
  lines.push(`--sidebar-left-max: ${L.left_width || '300px'};`);
  lines.push(`--sidebar-right-max: ${L.right_width || '300px'};`);
  for (const part of ['body', 'heading', 'code']) {
    if (config.fonts?.[part]) lines.push(`--font-${part}: ${config.fonts[part]};`);
  }
  return lines.join('\n') + '\n}\n';
}
