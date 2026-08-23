import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(process.argv[2] || 'public');
const PORT = Number(process.env.PORT || process.argv[3] || 8788);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/rss+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

const NOT_FOUND = join(ROOT, '404.html');

function fileAt(path) {
  const full = resolve(join(ROOT, decodeURIComponent(path)));
  if (!full.startsWith(ROOT)) return null;
  if (existsSync(full) && statSync(full).isFile()) return full;
  const asIndex = join(full, 'index.html');
  if (existsSync(asIndex)) return asIndex;
  return null;
}

createServer((req, res) => {
  const path = normalize(req.url.split('?')[0]);
  let file = fileAt(path);
  let status = 200;
  if (!file) {
    file = NOT_FOUND;
    status = 404;
  }
  if (!existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('404 - not even a fallback page here');
    return;
  }
  res.writeHead(status, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
  console.log(`[${new Date().toISOString()}] ${status} ${req.method} ${path}`);
}).listen(PORT, () => {
  console.log(`[serve] http://localhost:${PORT}/ (root: ${ROOT}, fallback: 404.html)`);
});
