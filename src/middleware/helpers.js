'use strict';

/**
 * Shared utilities: response envelope, validation, geo helpers.
 */

/** Error with an HTTP status code. */
class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
  static badRequest(msg, details) { return new ApiError(400, msg || 'Bad request', details); }
  static notFound(msg) { return new ApiError(404, msg || 'Resource not found'); }
  static conflict(msg) { return new ApiError(409, msg || 'Conflict'); }
  static unprocessable(msg, details) { return new ApiError(422, msg || 'Unprocessable entity', details); }
}

/** Wrap an async route handler so thrown errors reach the error middleware. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Success envelope. */
function ok(res, data, status = 200) {
  return res.status(status).json({ ok: true, data });
}

/** Great-circle distance in kilometres between two {lat,lng} points. */
function distanceKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Coerce a value to a finite number or return undefined. */
function toNum(v) {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Basic required-field validator. Returns an array of problem strings. */
function requireFields(body, fields) {
  const problems = [];
  fields.forEach((f) => {
    const v = body ? body[f] : undefined;
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
      problems.push(`"${f}" is required`);
    }
  });
  return problems;
}

/** Validate latitude/longitude ranges. */
function validLatLng(lat, lng) {
  const problems = [];
  if (lat !== undefined && (lat < -90 || lat > 90)) problems.push('"lat" must be between -90 and 90');
  if (lng !== undefined && (lng < -180 || lng > 180)) problems.push('"lng" must be between -180 and 180');
  return problems;
}

/** Safely parse a JSON column. */
function parseJson(str, fallback = {}) {
  try {
    return str ? JSON.parse(str) : fallback;
  } catch {
    return fallback;
  }
}

module.exports = {
  ApiError,
  asyncHandler,
  ok,
  distanceKm,
  isFiniteNum,
  toNum,
  requireFields,
  validLatLng,
  parseJson,
};
