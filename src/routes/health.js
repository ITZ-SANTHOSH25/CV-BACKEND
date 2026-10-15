'use strict';

const express = require('express');
const { getDb } = require('../db');
const { ok, asyncHandler, distanceKm } = require('../middleware/helpers');
const { getBystander, getWatch } = require('../services');

const router = express.Router();

// GET /api/health — liveness/readiness probe
router.get(
  '/health',
  asyncHandler((req, res) => {
    const db = getDb();
    const dbOk = db.prepare('SELECT 1 AS ok').get().ok === 1;
    ok(res, {
      status: 'ok',
      service: 'carvanta-api',
      version: require('../../package.json').version,
      uptimeSeconds: Math.floor(process.uptime()),
      database: dbOk ? 'connected' : 'unavailable',
      time: Date.now(),
    });
  })
);

// GET /api/summary — aggregated dashboard stats (used by the frontend header)
router.get(
  '/summary',
  asyncHandler((req, res) => {
    const db = getDb();
    const bystander = getBystander(db);
    const ambulances = db.prepare('SELECT * FROM ambulances').all();
    const hospitals = db.prepare('SELECT * FROM hospitals').all();
    const watch = getWatch(db);

    const available = ambulances.filter((a) => a.status === 'available').length;

    const withDist = (rows) =>
      rows
        .map((r) => ({ r, d: bystander ? distanceKm(bystander, r) : null }))
        .sort((a, b) => (a.d ?? 1e9) - (b.d ?? 1e9));

    const nearestAmb = withDist(ambulances)[0];
    const nearestHosp = withDist(hospitals)[0];

    const logCounts = db
      .prepare('SELECT type, COUNT(*) AS n FROM logs GROUP BY type')
      .all()
      .reduce((acc, r) => ({ ...acc, [r.type]: r.n }), {});

    ok(res, {
      ambulancesAvailable: available,
      ambulancesTotal: ambulances.length,
      hospitalsNearby: hospitals.length,
      nearestAmbulanceKm: nearestAmb && nearestAmb.d != null ? Number(nearestAmb.d.toFixed(2)) : null,
      nearestHospitalKm: nearestHosp && nearestHosp.d != null ? Number(nearestHosp.d.toFixed(2)) : null,
      contacts: db.prepare('SELECT COUNT(*) AS n FROM contacts').get().n,
      activeAlerts: db.prepare("SELECT COUNT(*) AS n FROM alerts WHERE status = 'active'").get().n,
      totalLogs: db.prepare('SELECT COUNT(*) AS n FROM logs').get().n,
      logCounts,
      watch,
      bystander,
    });
  })
);

module.exports = router;
