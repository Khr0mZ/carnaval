import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const port = Number(process.env.PORT || 4173);
const basePath = process.env.BASE_PATH || '/';
if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(basePath)) throw new Error('BASE_PATH must be a path beginning and ending with /.');
http.createServer((request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (basePath !== '/' && url.pathname === basePath.slice(0, -1)) {
      response.writeHead(308, { Location: basePath + url.search });
      response.end();
      return;
    }
    if (!url.pathname.startsWith(basePath)) throw new Error('Not found');
    const relative = decodeURIComponent(url.pathname.slice(basePath.length)).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) && file !== path.join(root, 'index.html')) throw new Error('Forbidden');
    const stat = statSync(file);
    if (!stat.isFile()) throw new Error('Not found');
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Content-Length': stat.size, 'Cache-Control': 'no-cache' });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('No se ha encontrado esta página.');
  }
}).listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}${basePath}`));
