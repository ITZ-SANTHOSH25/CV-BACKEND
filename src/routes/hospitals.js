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
const { getBystander, mapHospital, addLog } = require('../services');

const router = express.Router();

const FACILITY_KEYS = [
  'bloodBank',
  'icuBeds',
  'operationTheatre',
  'ventilator',
  'emergencyDept',
  'specialists',
  'other',
];
const FACILITY_STATES = ['available', 'low', 'unavailable'];
const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

function withDistance(db, row) {
  const b = getBystander(db);
  return { ...mapHospital(row), distanceKm: b ? Number(distanceKm(b, row).toFixed(3)) : null };
}

// GET /api/hospitals — filters: facility=icuBeds, facilityState=available, blood=O+, q, sort=distance|name
router.get(
  '/',
  asyncHandler((req, res) => {
    const db = getDb();
    const { facility, facilityState, blood, q, sort } = req.query;

    let rows = db.prepare('SELECT * FROM hospitals').all().map(mapHospital);

    if (facility) {
      if (!FACILITY_KEYS.includes(facility)) {
        throw ApiError.badRequest(`Unknown facility "${facility}"`, { allowed: FACILITY_KEYS });
      }
      rows = rows.filter((h) => (facilityState ? h.facilities[facility] === facilityState : h.facilities[facility] === 'available'));
    }
    if (blood) {
      rows = rows.filter((h) => h.blood[blood] === true);
    }
    if (q) {
      const needle = String(q).toLowerCase();
      rows = rows.filter(
        (h) => h.name.toLowerCase().includes(needle) || (h.type || '').toLowerCase().includes(needle)
      );
    }

    const b = getBystander(db);
    rows = rows.map((h) => ({ ...h, distanceKm: b ? Number(distanceKm(b, h).toFixed(3)) : null }));
    if (sort === 'distance') rows.sort((a, b2) => (a.distanceKm ?? 1e9) - (b2.distanceKm ?? 1e9));
    else if (sort === 'name') rows.sort((a, b2) => a.name.localeCompare(b2.name));
    else rows.sort((a, b2) => a.id.localeCompare(b2.id));

    ok(res, rows);
  })
);

// GET /api/hospitals/:id
router.get(
  '/:id',
  asyncHandler((req, res) => {
    const db = getDb();
    const row = db.prepare('SELECT * FROM hospitals WHERE id = ?').get(req.params.id);
    if (!row) throw ApiError.notFound(`Hospital ${req.params.id} not found`);
    ok(res, withDistance(db, row));
  })
);

// POST /api/hospitals
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
    if (db.prepare('SELECT 1 FROM hospitals WHERE id = ?').get(body.id)) {
      throw ApiError.conflict(`Hospital ${body.id} already exists`);
    }

    db.prepare(
      `INSERT INTO hospitals (id, name, lat, lng, type, beds, phone, facilities, blood, updated)
       VALUES (@id, @name, @lat, @lng, @type, @beds, @phone, @facilities, @blood, @updated)`
    ).run({
      id: body.id,
      name: body.name,
      lat,
      lng,
      type: body.type ?? '',
      beds: Number(body.beds ?? 0),
      phone: body.phone ?? '',
      facilities: JSON.stringify(body.facilities ?? {}),
      blood: JSON.stringify(body.blood ?? {}),
      updated: Date.now(),
    });

    addLog(db, { type: 'System', message: `Hospital ${body.id} added`, detail: body.name, status: 'ok' });
    const row = db.prepare('SELECT * FROM hospitals WHERE id = ?').get(body.id);
    ok(res, withDistance(db, row), 201);
  })
);

// PATCH /api/hospitals/:id — update details, facilities or blood availability
router.patch(
  '/:id',
  asyncHandler((req, res) => {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM hospitals WHERE id = ?').get(req.params.id);
    if (!existing) throw ApiError.notFound(`Hospital ${req.params.id} not found`);
    const current = mapHospital(existing);
    const body = req.body || {};

    const lat = body.lat !== undefined ? Number(body.lat) : existing.lat;
    const lng = body.lng !== undefined ? Number(body.lng) : existing.lng;
    const geo = validLatLng(lat, lng);
    if (geo.length) throw ApiError.unprocessable('Invalid coordinates', geo);

    // Validate facility states if provided.
    const facilities = { ...current.facilities, ...(body.facilities || {}) };
    for (const [k, v] of Object.entries(body.facilities || {})) {
      if (!FACILITY_KEYS.includes(k)) {
        throw ApiError.unprocessable('Unknown facility key', [`"${k}" not in ${FACILITY_KEYS.join(', ')}`]);
      }
      if (!FACILITY_STATES.includes(v)) {
        throw ApiError.unprocessable('Invalid facility state', [`"${k}" must be one of ${FACILITY_STATES.join(', ')}`]);
      }
    }
    const blood = { ...current.blood, ...(body.blood || {}) };
    for (const [k, v] of Object.entries(body.blood || {})) {
      if (!BLOOD_TYPES.includes(k)) {
        throw ApiError.unprocessable('Unknown blood type', [`"${k}" not a valid blood type`]);
      }
      if (typeof v !== 'boolean') {
        throw ApiError.unprocessable('Invalid blood value', [`"${k}" must be boolean`]);
      }
    }

    db.prepare(
      `UPDATE hospitals SET name=@name, lat=@lat, lng=@lng, type=@type, beds=@beds,
         phone=@phone, facilities=@facilities, blood=@blood, updated=@updated
       WHERE id=@id`
    ).run({
      id: existing.id,
      name: body.name ?? existing.name,
      lat,
      lng,
      type: body.type ?? existing.type,
      beds: body.beds !== undefined ? Number(body.beds) : existing.beds,
      phone: body.phone ?? existing.phone,
      facilities: JSON.stringify(facilities),
      blood: JSON.stringify(blood),
      updated: Date.now(),
    });

    addLog(db, { type: 'System', message: `Hospital ${existing.id} updated`, detail: existing.name, status: 'ok' });
    const row = db.prepare('SELECT * FROM hospitals WHERE id = ?').get(existing.id);
    ok(res, withDistance(db, row));
  })
);

// DELETE /api/hospitals/:id
router.delete(
  '/:id',
  asyncHandler((req, res) => {
    const db = getDb();
    const info = db.prepare('DELETE FROM hospitals WHERE id = ?').run(req.params.id);
    if (info.changes === 0) throw ApiError.notFound(`Hospital ${req.params.id} not found`);
    addLog(db, { type: 'System', message: `Hospital ${req.params.id} removed`, status: 'warn' });
    ok(res, { deleted: req.params.id });
  })
);

module.exports = router;
