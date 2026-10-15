'use strict';

const express = require('express');
const { getDb } = require('../db');
const { ok, asyncHandler, ApiError } = require('../middleware/helpers');
const { mapAlert, addLog, getBystander } = require('../services');

const router = express.Router();

// GET /api/alerts — list (filter: status=active|acknowledged|closed, limit)
router.get(
  '/',
  asyncHandler((req, res) => {
    const db = getDb();
    const { status, limit } = req.query;
    let rows = db.prepare('SELECT * FROM alerts ORDER BY start DESC').all();
    if (status) rows = rows.filter((a) => a.status === status);
    const lim = Number(limit);
    if (Number.isFinite(lim) && lim > 0) rows = rows.slice(0, lim);
    ok(res, rows.map((a) => mapAlert(db, a)));
  })
);

// GET /api/alerts/:id
router.get(
  '/:id',
  asyncHandler((req, res) => {
    const db = getDb();
    const row = db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id);
    if (!row) throw ApiError.notFound(`Alert ${req.params.id} not found`);
    ok(res, mapAlert(db, row));
  })
);

// POST /api/alerts — trigger an emergency alert to all (or selected) contacts
router.post(
  '/',
  asyncHandler((req, res) => {
    const db = getDb();
    const body = req.body || {};
    const reason = body.reason || 'A fall has been detected.';
    const bystander = getBystander(db);
    const location =
      body.location ||
      (bystander ? `${bystander.address} \u00b7 ${bystander.lat}, ${bystander.lng}` : 'Unknown location');

    // Determine recipients: all contacts, or the subset in contactIds.
    let contacts = db.prepare('SELECT * FROM contacts ORDER BY created_at, id').all();
    if (Array.isArray(body.contactIds) && body.contactIds.length) {
      contacts = contacts.filter((c) => body.contactIds.includes(c.id));
    }
    if (!contacts.length) throw ApiError.conflict('No emergency contacts available to alert');

    const id = 'a' + Date.now();
    const start = Date.now();

    const create = db.transaction(() => {
      db.prepare(
        `INSERT INTO alerts (id, reason, location, status, start) VALUES (@id, @reason, @location, 'active', @start)`
      ).run({ id, reason, location, start });

      const insRec = db.prepare(
        `INSERT INTO alert_recipients (alert_id, contact_id, name, phone, relation, status)
         VALUES (@alert_id, @contact_id, @name, @phone, @relation, 'ringing')`
      );
      contacts.forEach((c) =>
        insRec.run({ alert_id: id, contact_id: c.id, name: c.name, phone: c.phone, relation: c.relation })
      );
    });
    create();

    addLog(db, {
      type: 'Alert',
      message: `Emergency alert sent to ${contacts.length} contacts`,
      detail: `${reason} \u00b7 ${location}`,
      status: 'ok',
    });

    ok(res, mapAlert(db, db.prepare('SELECT * FROM alerts WHERE id = ?').get(id)), 201);
  })
);

// POST /api/alerts/:id/acknowledge — acknowledge one recipient or all
router.post(
  '/:id/acknowledge',
  asyncHandler((req, res) => {
    const db = getDb();
    const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id);
    if (!alert) throw ApiError.notFound(`Alert ${req.params.id} not found`);
    const body = req.body || {};

    const now = Date.now();
    if (body.contactId) {
      const rec = db
        .prepare('SELECT * FROM alert_recipients WHERE alert_id = ? AND contact_id = ?')
        .get(alert.id, body.contactId);
      if (!rec) throw ApiError.notFound(`Recipient ${body.contactId} not part of alert ${alert.id}`);
      db.prepare('UPDATE alert_recipients SET status = ?, ack_at = ? WHERE id = ?').run('acknowledged', now, rec.id);
      addLog(db, { type: 'Acknowledgement', message: `Alert acknowledged by ${rec.name}`, detail: 'Ring & vibration stopped', status: 'ok' });
    } else {
      db.prepare('UPDATE alert_recipients SET status = ?, ack_at = ? WHERE alert_id = ?').run('acknowledged', now, alert.id);
      addLog(db, { type: 'Acknowledgement', message: 'Emergency alert acknowledged', detail: 'All recipients acknowledged \u00b7 ring stopped', status: 'ok' });
    }

    // If everyone acknowledged, close the alert.
    const remaining = db
      .prepare("SELECT COUNT(*) AS n FROM alert_recipients WHERE alert_id = ? AND status != 'acknowledged'")
      .get(alert.id).n;
    if (remaining === 0) {
      db.prepare("UPDATE alerts SET status = 'acknowledged', ended_at = ? WHERE id = ?").run(now, alert.id);
    }

    ok(res, mapAlert(db, db.prepare('SELECT * FROM alerts WHERE id = ?').get(alert.id)));
  })
);

// POST /api/alerts/:id/deliver — mark still-ringing recipients as delivered
router.post(
  '/:id/deliver',
  asyncHandler((req, res) => {
    const db = getDb();
    const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id);
    if (!alert) throw ApiError.notFound(`Alert ${req.params.id} not found`);
    db.prepare("UPDATE alert_recipients SET status = 'delivered' WHERE alert_id = ? AND status = 'ringing'").run(alert.id);
    addLog(db, { type: 'Alert', message: 'Alert ring window ended', detail: 'Recipients marked delivered', status: 'warn' });
    ok(res, mapAlert(db, db.prepare('SELECT * FROM alerts WHERE id = ?').get(alert.id)));
  })
);

// POST /api/alerts/:id/close — dismiss/close an alert
router.post(
  '/:id/close',
  asyncHandler((req, res) => {
    const db = getDb();
    const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id);
    if (!alert) throw ApiError.notFound(`Alert ${req.params.id} not found`);
    db.prepare("UPDATE alerts SET status = 'closed', ended_at = ? WHERE id = ?").run(Date.now(), alert.id);
    addLog(db, { type: 'Alert', message: 'Emergency alert closed', detail: `Alert ${alert.id}`, status: 'ok' });
    ok(res, mapAlert(db, db.prepare('SELECT * FROM alerts WHERE id = ?').get(alert.id)));
  })
);

// DELETE /api/alerts/:id
router.delete(
  '/:id',
  asyncHandler((req, res) => {
    const db = getDb();
    const info = db.prepare('DELETE FROM alerts WHERE id = ?').run(req.params.id);
    if (info.changes === 0) throw ApiError.notFound(`Alert ${req.params.id} not found`);
    ok(res, { deleted: req.params.id });
  })
);

module.exports = router;
