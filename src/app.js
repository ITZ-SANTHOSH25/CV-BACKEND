'use strict';

/**
 * Express application: mounts the REST API at /api and serves the frontend
 * from /public. No frontend changes are required — the API is additive.
 */

const path = require('path');
const express = require('express');
const compression = require('compression');
const helmet = require('helmet');

const apiRouter = require('./routes');
const { apiNotFound, errorHandler } = require('./middleware/errors');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const ONE_YEAR = 60 * 60 * 24 * 365;

function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // Body parsing (JSON + urlencoded form posts).
  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: true, limit: '256kb' }));

  app.use(compression());

  // Security headers. CSP allows the CDNs the frontend already uses.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          imgSrc: ["'self'", 'data:', 'blob:', 'https://server.arcgisonline.com', 'https://*.arcgisonline.com'],
          connectSrc: ["'self'", 'https://server.arcgisonline.com', 'https://*.arcgisonline.com'],
          workerSrc: ["'self'", 'blob:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'self'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: [],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    })
  );

  // Simple request logger for the API (keeps console output readable).
  app.use('/api', (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      console.log(`[API] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - start}ms)`);
    });
    next();
  });

  // ---- REST API ----
  app.use('/api', apiRouter);
  // Unknown API routes -> JSON 404 (never the HTML shell).
  app.use('/api', apiNotFound);

  // ---- Backend root status ----
  // Keep the root URL independent of the optional public/index.html frontend.
  app.get('/', (req, res) => {
    res.status(200).json({
      ok: true,
      success: true,
      message: 'CARVANTA backend is running successfully',
      api: '/api',
      health: '/api/health',
    });
  });

  // ---- Static frontend ----
  app.use(
    express.static(PUBLIC_DIR, {
      index: 'index.html',
      etag: true,
      lastModified: true,
      maxAge: '1d',
      setHeaders(res, filePath) {
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.html') res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        else if (['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.woff', '.woff2', '.ttf'].includes(ext)) {
          res.setHeader('Cache-Control', `public, max-age=${ONE_YEAR}, immutable`);
        }
      },
    })
  );

  // SPA-safe fallback only when the frontend entry file exists.
  app.get('*', (req, res, next) => {
    if (path.extname(req.path) !== '') return next();
    const indexFile = path.join(PUBLIC_DIR, 'index.html');
    if (!require('fs').existsSync(indexFile)) return next();
    res.sendFile(indexFile, (err) => (err ? next(err) : undefined));
  });

  // Non-API 404 (styled HTML).
  app.use((req, res) => {
    res.status(404).type('html').send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>404 · CARVANTA</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#06070a;color:#eef1f7;font-family:Inter,system-ui,sans-serif;text-align:center">
<div><div style="font-size:84px;font-weight:800;color:#ff2b3d">404</div>
<h1 style="font-size:20px;margin:16px 0 8px">Page not found</h1>
<p style="color:#aab1c2;font-size:14px">The resource you requested does not exist.</p>
<a href="/" style="display:inline-block;margin-top:20px;padding:11px 22px;border-radius:10px;background:#ff2b3d;color:#fff;text-decoration:none;font-weight:600">Return to CARVANTA</a></div>
</body></html>`);
  });

  app.use(errorHandler);

  return app;
}

module.exports = { createApp, PUBLIC_DIR };
