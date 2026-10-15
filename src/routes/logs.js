'use strict';

const express = require('express');
const { getDb } = require('../db');
const { ok, asyncHandler, ApiError, requireFields } = require('../middleware/helpers');
const { addLog } = require('../services');

const router = express.Router();

const TYPES = ['Smartwatch', 'Sensor', 'Location', 'Alert', 'Acknowledgement', 'Fall Detection', 'System'];
const STATUSES = ['ok', 'warn', 'fail'];

// GET /api/logs — filters: type, status, limit, since (ms epoch)
router.get(
  '/',
  asyncHandler((req, res) => {
    const db = getDb();
    const { type, status, since } = req.query;
    const limit = Math.min(Number(req.query.limit) || 200, 500);

    const clauses = [];
    const params = [];
    if (type) { clauses.push('type = ?'); params.push(type); }
    if (status) { clauses.push('status = ?'); params.push(status); }
    if (since && Number.isFinite(Number(since))) { clauses.push('time >= ?'); params.push(Number(since)); }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = db
      .prepare(`SELECT * FROM logs ${where} ORDER BY time DESC LIMIT ?`)
      .all(...params, limit);

    ok(res, { logs: rows, count: rows.length });
  })
);

// GET /api/logs/stats — aggregate counts by type
router.get(
  '/stats',
  asyncHandler((req, res) => {
    const db = getDb();
    const byType = db.prepare('SELECT type, COUNT(*) AS n FROM logs GROUP BY type').all();
    const byStatus = db.prepare('SELECT status, COUNT(*) AS n FROM logs GROUP BY status').all();
    const total = db.prepare('SELECT COUNT(*) AS n FROM logs').get().n;
    const count = (t) => (byType.find((r) => r.type === t) || { n: 0 }).n;
    ok(res, {
      total,
      fallDetections: count('Fall Detection'),
      alerts: count('Alert'),
      locationShares: count('Location'),
      byType,
      byStatus,
    });
  })
);

// POST /api/logs — create a log entry
router.post(
  '/',
  asyncHandler((req, res) => {
    const db = getDb();
    const body = req.body || {};
    const problems = requireFields(body, ['message']);
    if (problems.length) throw ApiError.unprocessable('Invalid payload', problems);
    if (body.type && !TYPES.includes(body.type)) {
      throw ApiError.unprocessable('Invalid type', [`"type" must be one of ${TYPES.join(', ')}`]);
    }
    if (body.status && !STATUSES.includes(body.status)) {
      throw ApiError.unprocessable('Invalid status', [`"status" must be one of ${STATUSES.join(', ')}`]);
    }
    const entry = addLog(db, {
      time: body.time,
      type: body.type,
      message: body.message,
      detail: body.detail,
      status: body.status,
    });
    ok(res, entry, 201);
  })
);

// DELETE /api/logs — clear all logs (optional ?type=)
router.delete(
  '/',
  asyncHandler((req, res) => {
    const db = getDb();
    const { type } = req.query;
    let info;
    if (type) info = db.prepare('DELETE FROM logs WHERE type = ?').run(type);
    else info = db.prepare('DELETE FROM logs').run();
    ok(res, { cleared: info.changes });
  })
);

module.exports = router;
