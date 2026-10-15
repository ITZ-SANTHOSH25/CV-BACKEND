'use strict';

const express = require('express');
const { getDb } = require('../db');
const {
  ok,
  asyncHandler,
  ApiError,
  requireFields,
  validLatLng,
  distanceKm,
} = require('../middleware/helpers');
const { getBystander, addLog } = require('../services');

const router = express.Router();

const STATUSES = ['available', 'en-route', 'busy'];

function withDistance(db, row) {
  const b = getBystander(db);
  return { ...row, distanceKm: b ? Number(distanceKm(b, row).toFixed(3)) : null };
}

// GET /api/ambulances — list (filters: status, type, q, sort=distance|name)
router.get(
  '/',
  asyncHandler((req, res) => {
    const db = getDb();
    const { status, type, q, sort } = req.query;

    let rows = db.prepare('SELECT * FROM ambulances').all();
    if (status) rows = rows.filter((r) => r.status === status);
    if (type) rows = rows.filter((r) => (r.type || '').toLowerCase().includes(String(type).toLowerCase()));
    if (q) {
      const needle = String(q).toLowerCase();
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(needle) ||
          (r.callsign || '').toLowerCase().includes(needle) ||
          r.id.toLowerCase().includes(needle)
      );
    }

    rows = rows.map((r) => withDistance(db, r));
    if (sort === 'distance') rows.sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
    else if (sort === 'name') rows.sort((a, b) => a.name.localeCompare(b.name));
    else rows.sort((a, b) => a.id.localeCompare(b.id));

    ok(res, rows, 200);
  })
);

// GET /api/ambulances/:id
router.get(
  '/:id',
  asyncHandler((req, res) => {
    const db = getDb();
    const row = db.prepare('SELECT * FROM ambulances WHERE id = ?').get(req.params.id);
    if (!row) throw ApiError.notFound(`Ambulance ${req.params.id} not found`);
    ok(res, withDistance(db, row));
  })
);

// POST /api/ambulances — create
router.post(
  '/',
  asyncHandler((req, res) => {
    const db = getDb();
    const body = req.body || {};
    const problems = requireFields(body, ['id', 'name', 'lat', 'lng']);
    if (problems.length) throw ApiError.unprocessable('Invalid payload', problems);
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const geo = validLatLng(lat, lng);
    if (geo.length) throw ApiError.unprocessable('Invalid coordinates', geo);
    if (body.status && !STATUSES.includes(body.status)) {
      throw ApiError.unprocessable('Invalid status', [`"status" must be one of ${STATUSES.join(', ')}`]);
    }
    if (db.prepare('SELECT 1 FROM ambulances WHERE id = ?').get(body.id)) {
      throw ApiError.conflict(`Ambulance ${body.id} already exists`);
    }

    db.prepare(
      `INSERT INTO ambulances (id, name, callsign, lat, lng, status, type, crew, eta, phone, updated)
       VALUES (@id, @name, @callsign, @lat, @lng, @status, @type, @crew, @eta, @phone, @updated)`
    ).run({
      id: body.id,
      name: body.name,
      callsign: body.callsign ?? '',
      lat,
      lng,
      status: body.status ?? 'available',
      type: body.type ?? '',
      crew: Number(body.crew ?? 0),
      eta: Number(body.eta ?? 0),
      phone: body.phone ?? '',
      updated: Date.now(),
    });

    addLog(db, { type: 'System', message: `Ambulance ${body.id} added`, detail: body.name, status: 'ok' });
    const row = db.prepare('SELECT * FROM ambulances WHERE id = ?').get(body.id);
    ok(res, withDistance(db, row), 201);
  })
);

// PATCH /api/ambulances/:id — partial update (status, lat, lng, eta, crew, ...)
router.patch(
  '/:id',
  asyncHandler((req, res) => {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM ambulances WHERE id = ?').get(req.params.id);
    if (!existing) throw ApiError.notFound(`Ambulance ${req.params.id} not found`);

    const body = req.body || {};
    if (body.status && !STATUSES.includes(body.status)) {
      throw ApiError.unprocessable('Invalid status', [`"status" must be one of ${STATUSES.join(', ')}`]);
    }
    const lat = body.lat !== undefined ? Number(body.lat) : existing.lat;
    const lng = body.lng !== undefined ? Number(body.lng) : existing.lng;
    const geo = validLatLng(lat, lng);
    if (geo.length) throw ApiError.unprocessable('Invalid coordinates', geo);

    const merged = {
      id: existing.id,
      name: body.name ?? existing.name,
      callsign: body.callsign ?? existing.callsign,
      lat,
      lng,
      status: body.status ?? existing.status,
      type: body.type ?? existing.type,
      crew: body.crew !== undefined ? Number(body.crew) : existing.crew,
      eta: body.eta !== undefined ? Number(body.eta) : existing.eta,
      phone: body.phone ?? existing.phone,
      updated: Date.now(),
    };

    db.prepare(
      `UPDATE ambulances SET name=@name, callsign=@callsign, lat=@lat, lng=@lng,
         status=@status, type=@type, crew=@crew, eta=@eta, phone=@phone, updated=@updated
       WHERE id=@id`
    ).run(merged);

    if (body.status && body.status !== existing.status) {
      addLog(db, {
        type: 'System',
        message: `Ambulance ${existing.id} status changed`,
        detail: `${existing.status} \u2192 ${body.status}`,
        status: 'ok',
      });
    }

    ok(res, withDistance(db, merged));
  })
);

// DELETE /api/ambulances/:id
router.delete(
  '/:id',
  asyncHandler((req, res) => {
    const db = getDb();
    const info = db.prepare('DELETE FROM ambulances WHERE id = ?').run(req.params.id);
    if (info.changes === 0) throw ApiError.notFound(`Ambulance ${req.params.id} not found`);
    addLog(db, { type: 'System', message: `Ambulance ${req.params.id} removed`, status: 'warn' });
    ok(res, { deleted: req.params.id });
  })
);

module.exports = router;
