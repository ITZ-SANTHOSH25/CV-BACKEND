'use strict';

const express = require('express');
const { getDb } = require('../db');
const { ok, asyncHandler, ApiError, requireFields, validLatLng, distanceKm } = require('../middleware/helpers');
const { getBystander, addLog } = require('../services');

const router = express.Router();

// GET /api/bystander — current bystander location
router.get(
  '/',
  asyncHandler((req, res) => {
    const b = getBystander(getDb());
    if (!b) throw ApiError.notFound('Bystander location not set');
    ok(res, b);
  })
);

// PUT /api/bystander — update the bystander location
router.put(
  '/',
  asyncHandler((req, res) => {
    const db = getDb();
    const body = req.body || {};
    const problems = requireFields(body, ['lat', 'lng']);
    if (problems.length) throw ApiError.unprocessable('Invalid payload', problems);
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const geo = validLatLng(lat, lng);
    if (geo.length) throw ApiError.unprocessable('Invalid coordinates', geo);

    db.prepare(
      `INSERT INTO bystander (id, lat, lng, label, address, updated)
       VALUES (1, @lat, @lng, @label, @address, @updated)
       ON CONFLICT(id) DO UPDATE SET
         lat=excluded.lat, lng=excluded.lng, label=excluded.label,
         address=excluded.address, updated=excluded.updated`
    ).run({
      lat,
      lng,
      label: body.label ?? 'Bystander',
      address: body.address ?? '',
      updated: Date.now(),
    });

    addLog(db, {
      type: 'Location',
      message: 'Bystander location updated',
      detail: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      status: 'ok',
    });

    ok(res, getBystander(db));
  })
);

// GET /api/bystander/nearest — nearest ambulance & hospital to the bystander
router.get(
  '/nearest',
  asyncHandler((req, res) => {
    const db = getDb();
    const bystander = getBystander(db);
    if (!bystander) throw ApiError.notFound('Bystander location not set');

    const nearest = (table) => {
      const rows = db.prepare(`SELECT * FROM ${table}`).all();
      return rows
        .map((r) => ({ ...r, distanceKm: Number(distanceKm(bystander, r).toFixed(3)) }))
        .sort((a, b) => a.distanceKm - b.distanceKm)[0] || null;
    };

    ok(res, {
      bystander,
      nearestAmbulance: nearest('ambulances'),
      nearestHospital: nearest('hospitals'),
    });
  })
);

module.exports = router;
