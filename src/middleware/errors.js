'use strict';

const { ApiError } = require('./helpers');

/** 404 handler for unknown API routes. */
function apiNotFound(req, res) {
  res.status(404).json({
    ok: false,
    error: { message: `No API route for ${req.method} ${req.originalUrl}`, status: 404 },
  });
}

/** Central error handler. */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err instanceof ApiError ? err.status : err.status || 500;

  if (status >= 500) {
    console.error('[CARVANTA] Error:', err && err.stack ? err.stack : err);
  }

  const payload = {
    ok: false,
    error: {
      message: status >= 500 ? 'Internal server error' : err.message || 'Error',
      status,
    },
  };
  if (err.details) payload.error.details = err.details;

  res.status(status).json(payload);
}

module.exports = { apiNotFound, errorHandler };
