import { defineConfig } from 'vite';
import { resolve } from 'path';
import http from 'http';
import https from 'https';
import { URL } from 'url';

/**
 * Vite plugin: HA Ingress Proxy
 *
 * Proxies  /ha-proxy/<encoded-ha-origin>/<path>
 *     →    <ha-origin>/<path>
 *
 * Avoids CORS during development and forwards auth headers.
 */
function haIngressProxy() {
  return {
    name: 'ha-ingress-proxy',
    configureServer(server) {
      server.middlewares.use('/ha-proxy', (req, res, next) => {
        // ── CORS preflight ──
        if (req.method === 'OPTIONS') {
          res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, GROCY-API-KEY',
            'Access-Control-Max-Age': '86400',
          });
          res.end();
          return;
        }

        // ── Parse target URL from path ──
        const rest = req.url.replace(/^\//, '');
        const slashIdx = rest.indexOf('/');
        if (slashIdx === -1) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing target URL segment' }));
          return;
        }

        let targetOrigin;
        try {
          targetOrigin = decodeURIComponent(rest.substring(0, slashIdx));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Bad encoded origin' }));
          return;
        }

        const pathAndQuery = rest.substring(slashIdx); // "/api/..."
        const targetUrl = targetOrigin + pathAndQuery;

        let parsed;
        try {
          parsed = new URL(targetUrl);
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid target URL: ' + targetUrl }));
          return;
        }

        console.log(`[ha-proxy] ${req.method} → ${targetUrl}`);

        // ── Build clean outgoing headers ──
        // Only forward headers that are meaningful; strip browser-added noise.
        const outHeaders = {};
        const forward = [
          'authorization', 'content-type', 'accept', 'content-length',
          'accept-encoding', 'user-agent', 'cookie',
        ];
        for (const h of forward) {
          if (req.headers[h]) outHeaders[h] = req.headers[h];
        }
        outHeaders['host'] = parsed.host;

        const lib = parsed.protocol === 'https:' ? https : http;

        // ── Collect request body ──
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          const bodyBuf = chunks.length ? Buffer.concat(chunks) : null;

          const reqOpts = {
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: parsed.pathname + parsed.search,
            method: req.method,
            headers: outHeaders,
            timeout: 15000,
          };

          const proxyReq = lib.request(reqOpts, (proxyRes) => {
            console.log(`[ha-proxy] ← ${proxyRes.statusCode} from ${parsed.host}${parsed.pathname}`);

            // Collect the full body so we can log it on errors
            const resChunks = [];
            proxyRes.on('data', (c) => resChunks.push(c));
            proxyRes.on('end', () => {
              const body = Buffer.concat(resChunks);
              if (proxyRes.statusCode >= 400) {
                console.log(`[ha-proxy]   body: ${body.toString().substring(0, 500)}`);
              }

              const resHeaders = { ...proxyRes.headers };
              resHeaders['access-control-allow-origin'] = '*';
              resHeaders['access-control-allow-methods'] = 'GET,POST,PUT,DELETE,OPTIONS';
              resHeaders['access-control-allow-headers'] = 'Content-Type, Authorization, GROCY-API-KEY';
              // Remove content-encoding since we buffered the full body
              delete resHeaders['transfer-encoding'];
              resHeaders['content-length'] = body.length;
              res.writeHead(proxyRes.statusCode, resHeaders);
              res.end(body);
            });
          });

          proxyReq.on('error', (err) => {
            console.error(`[ha-proxy] ERROR: ${err.message}`);
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Proxy error: ' + err.message }));
          });

          proxyReq.on('timeout', () => {
            proxyReq.destroy();
            console.error(`[ha-proxy] TIMEOUT`);
            res.writeHead(504, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Proxy timeout connecting to ' + parsed.host }));
          });

          if (bodyBuf) proxyReq.write(bodyBuf);
          proxyReq.end();
        });
      });
    },
  };
}

export default defineConfig({
  root: '.',
  base: './',
  plugins: [haIngressProxy()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
    },
  },
  server: {
    port: 3000,
    host: true,
  },
});
