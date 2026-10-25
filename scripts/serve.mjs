import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT ?? 4173);
const baseArg = process.argv.find((arg) => arg.startsWith('--base='))?.slice(7) ?? '/';
const base = `/${baseArg.replace(/^\/+|\/+$/g, '')}${baseArg === '/' ? '' : '/'}`;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const server = http.createServer(async (request, response) => {
  const send = (code, text) => {
    response.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(text);
  };
  if (!['GET', 'HEAD'].includes(request.method)) return send(405, 'Method not allowed');
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (!pathname.startsWith(base)) return send(404, 'Not found');
    let relative = pathname.slice(base.length);
    if (!relative) relative = 'index.html';
    if (
      !(relative === 'index.html' || /^(js|styles|assets)\//.test(relative)) ||
      relative.split('/').some((segment) => segment.startsWith('.'))
    )
      return send(404, 'Not found');
    const path = resolve(root, relative);
    if (!path.startsWith(resolve(root) + sep) || !(await stat(path)).isFile())
      return send(404, 'Not found');
    const type = types[extname(path)];
    if (!type) return send(404, 'Not found');
    const bytes = await readFile(path);
    response.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch {
    send(404, 'Not found');
  }
});
server.on('error', (error) => {
  console.error(`Preview could not start: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () =>
  console.log(`TraceBack preview: http://127.0.0.1:${port}${base}`),
);
