/**
 * CARVANTA — Emergency Response & Smartwatch Monitoring
 * Node.js hosting backend (Option A: static hosting only — NO API).
 *
 * This server does exactly one job: it hosts and serves the existing
 * frontend (public/index.html) and its assets. It defines no REST
 * endpoints, no JSON routes, and no data API of any kind.
 *
 * The frontend is fully self-contained (all logic + data live in the page),
 * so a static host is all it needs.
 */

'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const compression = require('compression');
const helmet = require('helmet');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const INDEX_FILE = 'index.html';

// One year in seconds (used for immutable, content-hashed-style assets).
const ONE_YEAR = 60 * 60 * 24 * 365;

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
const app = express();

// Trust the platform proxy (Render/Railway/Heroku/nginx) for correct protocol
// and client IP handling. Harmless when running locally.
app.set('trust proxy', 1);

// Remove the "X-Powered-By: Express" fingerprint.
app.disable('x-powered-by');

// Gzip / deflate all compressible responses (HTML, CSS, JS, SVG, JSON).
app.use(compression());

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------
// The page loads a few trusted third-party assets:
//   - Google Fonts          (fonts.googleapis.com / fonts.gstatic.com)
//   - Leaflet (CSS + JS)    (cdnjs.cloudflare.com)
//   - Map tiles             (server.arcgisonline.com)
// The CSP below allows exactly those and nothing more.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com'],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
          'https://cdnjs.cloudflare.com',
        ],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: [
          "'self'",
          'data:',
          'blob:',
          'https://server.arcgisonline.com',
          'https://*.arcgisonline.com',
        ],
        connectSrc: [
          "'self'",
          'https://server.arcgisonline.com',
          'https://*.arcgisonline.com',
        ],
        workerSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
    // Allow the page to be embedded by same-origin frames only.
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);

// ---------------------------------------------------------------------------
// Static file hosting
// ---------------------------------------------------------------------------
// Cache policy:
//   - HTML is always revalidated so page updates appear immediately.
//   - Everything else (CSS/JS/images/fonts) is cached for a long time.
app.use(
  express.static(PUBLIC_DIR, {
    index: INDEX_FILE,
    etag: true,
    lastModified: true,
    maxAge: '1d',
    setHeaders(res, filePath) {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.html') {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      } else if (
        ['.css', '.js', '.mjs', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.eot'].includes(ext)
      ) {
        res.setHeader('Cache-Control', `public, max-age=${ONE_YEAR}, immutable`);
      }
    },
  })
);

// ---------------------------------------------------------------------------
// SPA-safe fallback + 404
// ---------------------------------------------------------------------------
// The dashboard switches views client-side, so any unknown *page* path should
// return the app shell. Requests for real files (with an extension) that are
// missing get a proper 404 instead of the shell.
app.get('*', (req, res, next) => {
  if (req.method !== 'GET') return next();

  // There is intentionally NO API on this server. Any /api/* request is
  // rejected with a 404 so it is unambiguous that no endpoints exist.
  if (req.path === '/api' || req.path.startsWith('/api/')) return next();

  const hasExtension = path.extname(req.path) !== '';
  if (hasExtension) return next(); // let it fall through to the 404 handler

  res.sendFile(path.join(PUBLIC_DIR, INDEX_FILE), (err) => {
    if (err) next(err);
  });
});

// Custom 404
app.use((req, res) => {
  res.status(404).type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>404 · CARVANTA</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #06070a; color: #eef1f7;
    font-family: Inter, system-ui, -apple-system, sans-serif; text-align: center;
    background-image:
      radial-gradient(900px 600px at 12% -5%, rgba(255,43,61,.10), transparent 60%),
      radial-gradient(700px 700px at 50% 120%, rgba(255,43,61,.06), transparent 60%);
  }
  .box { padding: 40px; }
  .code { font-size: 84px; font-weight: 800; letter-spacing: 2px;
          background: linear-gradient(180deg,#fff,#ff2b3d); -webkit-background-clip: text;
          background-clip: text; color: transparent; line-height: 1; }
  h1 { font-size: 20px; margin: 18px 0 8px; }
  p { color: #aab1c2; margin: 0 0 24px; font-size: 14px; }
  a { display: inline-block; padding: 11px 22px; border-radius: 10px;
      background: #ff2b3d; color: #fff; text-decoration: none; font-weight: 600;
      box-shadow: 0 14px 40px -18px rgba(255,43,61,.55); }
  a:hover { background: #ff4d5e; }
</style>
</head>
<body>
  <div class="box">
    <div class="code">404</div>
    <h1>Page not found</h1>
    <p>The resource you requested does not exist on this server.</p>
    <a href="/">Return to CARVANTA</a>
  </div>
</body>
</html>`);
});

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[CARVANTA] Server error:', err && err.message ? err.message : err);
  if (res.headersSent) return;
  res.status(err.status || 500).type('html').send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>500 · CARVANTA</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#06070a;color:#eef1f7;font-family:Inter,system-ui,sans-serif;text-align:center">
  <div>
    <div style="font-size:72px;font-weight:800;color:#ff2b3d">500</div>
    <h1 style="font-size:18px;margin:14px 0 8px">Something went wrong</h1>
    <p style="color:#aab1c2;font-size:14px">The server could not process your request.</p>
  </div>
</body></html>`);
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const server = http.createServer(app);

server.listen(PORT, HOST, () => {
  const shown = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log('');
  console.log('  CARVANTA backend is running');
  console.log('  ------------------------------------------');
  console.log(`  Local:    http://${shown}:${PORT}`);
  console.log(`  Serving:  ${PUBLIC_DIR}`);
  console.log('  Mode:     static hosting (no API)');
  console.log('');
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`\n[CARVANTA] ${signal} received — shutting down...`);
  server.close(() => {
    console.log('[CARVANTA] Server closed.');
    process.exit(0);
  });
  // Force-exit if connections linger.
  setTimeout(() => process.exit(0), 10000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = server;
