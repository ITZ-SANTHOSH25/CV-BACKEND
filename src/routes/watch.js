'use strict';

const express = require('express');
const { getDb } = require('../db');
const { ok, asyncHandler, ApiError, requireFields } = require('../middleware/helpers');
const { getWatch, addLog, getBystander } = require('../services');

const router = express.Router();

// GET /api/watch — device state
router.get(
  '/',
  asyncHandler((req, res) => {
    ok(res, getWatch(getDb()));
  })
);

// POST /api/watch/connect — pair the smartwatch and start streaming
router.post(
  '/connect',
  asyncHandler((req, res) => {
    const db = getDb();
    db.prepare("UPDATE watch SET connected = 1, rate = '50 Hz', updated = ? WHERE id = 1").run(Date.now());
    addLog(db, { type: 'Smartwatch', message: 'Smartwatch CARV-W2 connected', detail: 'BLE handshake OK \u00b7 sensor stream active', status: 'ok' });
    ok(res, getWatch(db));
  })
);

// POST /api/watch/disconnect — stop the stream
router.post(
  '/disconnect',
  asyncHandler((req, res) => {
    const db = getDb();
    db.prepare("UPDATE watch SET connected = 0, rate = '0 Hz', updated = ? WHERE id = 1").run(Date.now());
    addLog(db, { type: 'Smartwatch', message: 'Smartwatch disconnected', detail: 'Sensor stream stopped', status: 'warn' });
    ok(res, getWatch(db));
  })
);

// GET /api/watch/readings — recent sensor readings (limit, default 100)
router.get(
  '/readings',
  asyncHandler((req, res) => {
    const db = getDb();
    const limit = Math.min(Number(req.query.limit) || 100, 1000);
    const rows = db.prepare('SELECT * FROM watch_readings ORDER BY time DESC LIMIT ?').all(limit);
    ok(res, { readings: rows.reverse(), count: rows.length });
  })
);

// POST /api/watch/readings — ingest a sensor reading.
// Body: { ax, ay, az, gx, gy, gz, hr }  (magnitude is computed)
// If magnitude exceeds the fall threshold, a fall event is recorded.
router.post(
  '/readings',
  asyncHandler((req, res) => {
    const db = getDb();
    const body = req.body || {};
    const problems = requireFields(body, ['ax', 'ay', 'az']);
    if (problems.length) throw ApiError.unprocessable('Invalid payload', problems);

    const ax = Number(body.ax), ay = Number(body.ay), az = Number(body.az);
    const gx = Number(body.gx ?? 0), gy = Number(body.gy ?? 0), gz = Number(body.gz ?? 0);
    const hr = body.hr !== undefined ? Number(body.hr) : null;
    const magnitude = Math.sqrt(ax * ax + ay * ay + az * az);
    const time = body.time || Date.now();

    const info = db
      .prepare(
        `INSERT INTO watch_readings (time, ax, ay, az, gx, gy, gz, hr, magnitude)
         VALUES (@time, @ax, @ay, @az, @gx, @gy, @gz, @hr, @magnitude)`
      )
      .run({ time, ax, ay, az, gx, gy, gz, hr, magnitude });

    // Trim to the most recent 5000 readings.
    db.prepare(
      `DELETE FROM watch_readings WHERE id NOT IN (SELECT id FROM watch_readings ORDER BY time DESC LIMIT 5000)`
    ).run();

    // Simple fall heuristic: magnitude above threshold.
    const FALL_THRESHOLD = Number(process.env.FALL_THRESHOLD || 2.5);
    let fall = null;
    if (magnitude >= FALL_THRESHOLD) {
      const fInfo = db
        .prepare('INSERT INTO falls (time, confidence, impact, alerted) VALUES (?, ?, ?, 0)')
        .run(time, 'high-confidence', magnitude);
      fall = { id: fInfo.lastInsertRowid, time, confidence: 'high-confidence', impact: magnitude };
      addLog(db, {
        type: 'Fall Detection',
        message: 'Fall detected (high-confidence)',
        detail: `Impact ${magnitude.toFixed(1)}g \u00b7 orientation change detected`,
        status: 'warn',
      });
    }

    ok(res, { id: info.lastInsertRowid, time, ax, ay, az, gx, gy, gz, hr, magnitude: Number(magnitude.toFixed(3)), fall }, 201);
  })
);

// GET /api/watch/falls — list detected falls
router.get(
  '/falls',
  asyncHandler((req, res) => {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM falls ORDER BY time DESC').all();
    ok(res, { falls: rows, count: rows.length });
  })
);

// POST /api/watch/falls — report a fall and optionally trigger an emergency alert
router.post(
  '/falls',
  asyncHandler((req, res) => {
    const db = getDb();
    const body = req.body || {};
    const impact = Number(body.impact ?? 3.4);
    const confidence = body.confidence || 'high-confidence';
    const time = body.time || Date.now();

    const info = db
      .prepare('INSERT INTO falls (time, confidence, impact, alerted) VALUES (?, ?, ?, 0)')
      .run(time, confidence, impact);
    const fallId = info.lastInsertRowid;

    addLog(db, {
      type: 'Fall Detection',
      message: `Fall detected (${confidence})`,
      detail: `Impact ${impact.toFixed(1)}g \u00b7 orientation change detected`,
      status: 'warn',
    });

    let alert = null;
    if (body.triggerAlert !== false) {
      const contacts = db.prepare('SELECT * FROM contacts ORDER BY created_at, id').all();
      if (contacts.length) {
        const bystander = getBystander(db);
        const location =
          body.location ||
          (bystander ? `${bystander.address} \u00b7 ${bystander.lat}, ${bystander.lng}` : 'Unknown location');
        const alertId = 'a' + Date.now();
        const start = Date.now();
        const tx = db.transaction(() => {
          db.prepare(
            `INSERT INTO alerts (id, reason, location, status, start) VALUES (@id, @reason, @location, 'active', @start)`
          ).run({ id: alertId, reason: body.reason || 'Fall detected by smartwatch \u2014 emergency assistance required.', location, start });
          const insRec = db.prepare(
            `INSERT INTO alert_recipients (alert_id, contact_id, name, phone, relation, status)
             VALUES (@alert_id, @contact_id, @name, @phone, @relation, 'ringing')`
          );
          contacts.forEach((c) => insRec.run({ alert_id: alertId, contact_id: c.id, name: c.name, phone: c.phone, relation: c.relation }));
          db.prepare('UPDATE falls SET alerted = 1 WHERE id = ?').run(fallId);
        });
        tx();
        alert = { id: alertId, recipients: contacts.length };
        addLog(db, {
          type: 'Alert',
          message: `Emergency alert sent to ${contacts.length} contacts`,
          detail: 'Fall detected by smartwatch',
          status: 'ok',
        });
      }
    }

    ok(res, { fall: { id: fallId, time, confidence, impact }, alert }, 201);
  })
);

module.exports = router;
