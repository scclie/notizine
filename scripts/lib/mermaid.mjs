import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execSync } from 'node:child_process';

const MERMAID_CSS = `
.mermaid-rendered {
  display: flex;
  justify-content: center;
  margin: 1.5rem 0;
  overflow-x: auto;
  padding: 1rem 0;
}
.mermaid-rendered svg {
  max-width: 100%;
  height: auto;
}
`;

const MARKER = 'x_mermaid_block_';

export function preprocess(content) {
  let idx = 0;
  return content.replace(/```mermaid\n([\s\S]*?)```/g, (_, code) => {
    const tag = MARKER + idx++;
    return '```\n' + tag + '\n' + code + '\n' + tag + '\n```';
  });
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, '');
}

function unescape(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function collectHTML(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectHTML(full));
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

export async function postprocess(publicDir, config) {
  if (!config.features?.mermaid) return [];

  const files = collectHTML(publicDir);
  const mermaidPages = [];

  for (const file of files) {
    let html = readFileSync(file, 'utf-8');
    if (!html.includes(MARKER)) continue;

    const re = /<pre><code>([\s\S]*?)<\/code><\/pre>/g;
    let changed = false;
    let newHtml = '';
    let lastIdx = 0;
    let match;

    while ((match = re.exec(html)) !== null) {
      const [full, inner] = match;
      if (!inner.includes(MARKER)) continue;

      const text = stripTags(inner);
      const tagRe = new RegExp(MARKER + '\\d+\\n([\\s\\S]*?)\\n' + MARKER + '\\d+');
      const tagMatch = text.match(tagRe);
      if (!tagMatch) continue;

      const code = unescape(tagMatch[1]);
      try {
        const tmpMmd = '/tmp/mermaid_' + Date.now() + '.mmd';
        const tmpSvg = '/tmp/mermaid_' + Date.now() + '.svg';
        writeFileSync(tmpMmd, code);
        execSync(
          `nix-shell -p mermaid-cli --run "mmdc -i ${tmpMmd} -o ${tmpSvg} -t dark -b transparent" 2>/dev/null`,
          { encoding: 'utf-8', timeout: 60000 }
        );
        const svg = readFileSync(tmpSvg, 'utf-8').trim();
        newHtml += html.slice(lastIdx, match.index) + '<div class="mermaid-rendered">' + svg + '</div>';
        lastIdx = match.index + full.length;
        changed = true;
      } catch (e) {
        console.warn(`[mermaid] Failed to render block in ${basename(file)}: ${e.message.split('\n')[0]}`);
      }
    }

    if (changed) {
      newHtml += html.slice(lastIdx);
      writeFileSync(file, newHtml);
      mermaidPages.push(file);
    }
  }

  return mermaidPages;
}

export function injectMermaidCSS(config) {
  return config.features?.mermaid ? MERMAID_CSS : '';
}
