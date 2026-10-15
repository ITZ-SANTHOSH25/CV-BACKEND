'use strict';

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
app.use(cors({ origin: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json({ limit: '1mb' }));

// On Render, set DB_PATH=/var/data/carvanta.db and attach a persistent disk at /var/data.
const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'carvanta.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    relation TEXT NOT NULL DEFAULT 'Neighbourhood',
    type TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reason TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS alert_recipients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_id INTEGER NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    contact_id INTEGER,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    relation TEXT NOT NULL DEFAULT 'Neighbourhood',
    status TEXT NOT NULL DEFAULT 'pending',
    response TEXT,
    responded_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_alert_recipients_alert ON alert_recipients(alert_id);
  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL DEFAULT 'System',
    message TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'ok',
    time TEXT NOT NULL
  );
`);

const now = () => new Date().toISOString();
const log = db.prepare('INSERT INTO activity_logs (type,message,detail,status,time) VALUES (?,?,?,?,?)');
function addLog(type, message, detail = '', status = 'ok', time = now()) {
  log.run(type, message, detail, status, time);
}
function cleanContact(row) {
  return { id: row.id, name: row.name, phone: row.phone, relation: row.relation, type: row.type, createdAt: row.created_at, updatedAt: row.updated_at };
}
function getAlert(id) {
  const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(Number(id));
  if (!alert) return null;
  const recipients = db.prepare('SELECT * FROM alert_recipients WHERE alert_id = ? ORDER BY id').all(alert.id).map(r => ({
    id: r.id, contactId: r.contact_id, name: r.name, phone: r.phone, relation: r.relation,
    status: r.status, response: r.response, respondedAt: r.responded_at
  }));
  return { id: alert.id, reason: alert.reason, location: alert.location, status: alert.status, createdAt: alert.created_at, updatedAt: alert.updated_at, recipients };
}

app.get('/', (_req, res) => res.json({ ok: true, service: 'CARVANTA Emergency API', message: 'Backend is running', endpoints: ['/api/health', '/api/contacts', '/api/alerts', '/api/logs'] }));
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'CARVANTA Emergency API', database: 'connected', time: now() }));

// CONTACTS: neighbourhood/family contact CRUD
app.get('/api/contacts', (_req, res) => {
  const contacts = db.prepare('SELECT * FROM contacts ORDER BY id DESC').all().map(cleanContact);
  res.json({ ok: true, contacts });
});
app.post('/api/contacts', (req, res) => {
  const name = String(req.body.name || '').trim();
  const phone = String(req.body.phone || req.body.mobile || '').trim();
  const relation = String(req.body.relation || req.body.relationship || 'Neighbourhood').trim();
  const type = String(req.body.type || '').trim();
  if (!name || !phone) return res.status(400).json({ ok: false, message: 'Name and phone number are required.' });
  if (!/^[+0-9()\-\s]{7,20}$/.test(phone)) return res.status(400).json({ ok: false, message: 'Enter a valid phone number.' });
  if (db.prepare('SELECT id FROM contacts WHERE phone = ?').get(phone)) return res.status(409).json({ ok: false, message: 'This phone number is already registered.' });
  const time = now();
  const result = db.prepare('INSERT INTO contacts (name,phone,relation,type,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(name, phone, relation, type, time, time);
  const contact = cleanContact(db.prepare('SELECT * FROM contacts WHERE id = ?').get(result.lastInsertRowid));
  addLog('System', 'Emergency contact added', `${contact.name} · ${contact.phone} · ${contact.relation}`, 'ok');
  res.status(201).json({ ok: true, contact });
});
app.put('/api/contacts/:id', (req, res) => {
  const id = Number(req.params.id);
  const old = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
  if (!old) return res.status(404).json({ ok: false, message: 'Contact not found.' });
  const name = String(req.body.name ?? old.name).trim();
  const phone = String(req.body.phone ?? old.phone).trim();
  const relation = String(req.body.relation ?? req.body.relationship ?? old.relation).trim();
  const type = String(req.body.type ?? old.type).trim();
  if (!name || !phone) return res.status(400).json({ ok: false, message: 'Name and phone number are required.' });
  try {
    db.prepare('UPDATE contacts SET name=?, phone=?, relation=?, type=?, updated_at=? WHERE id=?').run(name, phone, relation, type, now(), id);
  } catch (e) {
    if (String(e.code).includes('SQLITE_CONSTRAINT')) return res.status(409).json({ ok: false, message: 'This phone number is already registered.' });
    throw e;
  }
  const contact = cleanContact(db.prepare('SELECT * FROM contacts WHERE id = ?').get(id));
  addLog('System', 'Emergency contact updated', `${contact.name} · ${contact.phone}`, 'ok');
  res.json({ ok: true, contact });
});
app.delete('/api/contacts/:id', (req, res) => {
  const id = Number(req.params.id);
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
  if (!contact) return res.status(404).json({ ok: false, message: 'Contact not found.' });
  db.prepare('DELETE FROM contacts WHERE id = ?').run(id);
  addLog('System', 'Emergency contact removed', `${contact.name} · ${contact.phone}`, 'warn');
  res.json({ ok: true, message: 'Contact deleted.' });
});

// ALERTS: create an alert and create a status row for each registered recipient
app.get('/api/alerts', (_req, res) => {
  const rows = db.prepare("SELECT id FROM alerts WHERE status NOT IN ('ended','resolved','cancelled') ORDER BY id DESC").all();
  res.json({ ok: true, alerts: rows.map(row => getAlert(row.id)) });
});
app.post('/api/alerts', (req, res) => {
  const reason = String(req.body.reason || 'Emergency alert').trim();
  const location = String(req.body.location || '').trim();
  // Use recipients supplied by the caller when available.
// Otherwise, load registered family/neighbourhood contacts.
let supplied = Array.isArray(req.body.recipients)
  ? req.body.recipients.filter(r =>
      r &&
      String(r.name || '').trim() &&
      String(r.phone || '').trim()
    )
  : [];

if (supplied.length === 0) {
  supplied = db.prepare(`
    SELECT id, name, phone, relation
    FROM contacts
    ORDER BY id DESC
  `).all();
}

if (supplied.length === 0) {
  return res.status(400).json({
    ok: false,
    message: 'No registered emergency contacts found. Register at least one contact first.'
  });
}
  const createdAt = req.body.createdAt && !Number.isNaN(Date.parse(req.body.createdAt)) ? new Date(req.body.createdAt).toISOString() : now();
  const create = db.transaction(() => {
    const result = db.prepare('INSERT INTO alerts (reason,location,status,created_at,updated_at) VALUES (?,?,?,?,?)').run(reason, location, 'active', createdAt, createdAt);
    const alertId = Number(result.lastInsertRowid);
    const insertRecipient = db.prepare('INSERT INTO alert_recipients (alert_id,contact_id,name,phone,relation,status,created_at) VALUES (?,?,?,?,?,?,?)');
    for (const r of supplied) {
      const phone = String(r.phone || '').trim();
      const name = String(r.name || '').trim();
      if (!phone || !name) continue;
      const possibleId = Number(r.id);
      const contact = Number.isFinite(possibleId) && possibleId > 0 ? db.prepare('SELECT id FROM contacts WHERE id=?').get(possibleId) : null;
      insertRecipient.run(alertId, contact ? contact.id : null, name, phone, String(r.relation || 'Neighbourhood'), 'pending', createdAt);
    }
    addLog('Alert', `Emergency alert sent to ${supplied.length} contacts`, `${reason} · ${location} · Alert ID: ${alertId}`, 'alert', createdAt);
    return alertId;
  });
  for (const r of supplied) {
  const alertId = create();
  res.status(201).json({ ok: true, alert: getAlert(alertId) });
});

// Individual contact response: both Acknowledge and Decline are persisted and logged.
app.post('/api/alerts/:id/recipients/:contactId/respond', (req, res) => {
  const alertId = Number(req.params.id);
  const recipientId = Number(req.params.contactId);
  const alert = db.prepare('SELECT * FROM alerts WHERE id=?').get(alertId);
  if (!alert) return res.status(404).json({ ok: false, message: 'Alert not found.' });
  const recipient = db.prepare('SELECT * FROM alert_recipients WHERE alert_id=? AND (id=? OR contact_id=?) ORDER BY CASE WHEN id=? THEN 0 ELSE 1 END LIMIT 1').get(alertId, recipientId, recipientId, recipientId);
  if (!recipient) return res.status(404).json({ ok: false, message: 'Recipient not found for this alert.' });
  const response = String(req.body.response || req.body.status || '').toLowerCase();
  if (!['acknowledged', 'declined'].includes(response)) return res.status(400).json({ ok: false, message: 'Response must be acknowledged or declined.' });
  if (['acknowledged','declined'].includes(recipient.status)) {
    return res.json({ ok: true, alert: getAlert(alertId), message: 'This recipient already responded.' });
  }
  const respondedAt = req.body.respondedAt && !Number.isNaN(Date.parse(req.body.respondedAt)) ? new Date(req.body.respondedAt).toISOString() : now();
  db.prepare('UPDATE alert_recipients SET status=?, response=?, responded_at=? WHERE id=?').run(response, response, respondedAt, recipient.id);
  const action = response === 'acknowledged' ? 'acknowledged' : 'declined';
  addLog('Acknowledgement', `${recipient.name} ${action} emergency alert`, `Alert ID: ${alertId} · ${recipient.phone} · ${respondedAt}`, response === 'acknowledged' ? 'ok' : 'warn', respondedAt);
  const pending = db.prepare("SELECT COUNT(*) AS n FROM alert_recipients WHERE alert_id=? AND status NOT IN ('acknowledged','declined')").get(alertId).n;
  if (pending === 0) db.prepare('UPDATE alerts SET status=?, updated_at=? WHERE id=?').run('resolved', now(), alertId);
  res.json({ ok: true, recipient: { id: recipient.id, name: recipient.name, phone: recipient.phone, status: response, respondedAt }, alert: getAlert(alertId) });
});

// Device-level acknowledgement from the lock-screen overlay. If no recipient ID is sent,
// record the device acknowledgement as an activity log without guessing which contact responded.
app.post('/api/alerts/:id/acknowledge', (req, res) => {
  const alertId = Number(req.params.id);
  const alert = db.prepare('SELECT * FROM alerts WHERE id=?').get(alertId);
  if (!alert) return res.status(404).json({ ok: false, message: 'Alert not found.' });
  const acknowledgedAt = req.body.acknowledgedAt && !Number.isNaN(Date.parse(req.body.acknowledgedAt)) ? new Date(req.body.acknowledgedAt).toISOString() : now();
  const who = String(req.body.acknowledgedBy || 'recipient-device');
  addLog('Acknowledgement', 'Emergency alert acknowledged on recipient device', `Alert ID: ${alertId} · By: ${who} · ${acknowledgedAt}`, 'ok', acknowledgedAt);
  res.json({ ok: true, alertId, acknowledgedAt, message: 'Device acknowledgement saved to activity log.' });
});

// ACTIVITY LOGS. No demo rows are seeded.
app.get('/api/logs', (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
  const logs = db.prepare('SELECT * FROM activity_logs ORDER BY id DESC LIMIT ?').all(limit).map(r => ({ id: r.id, type: r.type, message: r.message, detail: r.detail, status: r.status, time: r.time }));
  res.json({ ok: true, logs });
});
app.post('/api/logs', (req, res) => {
  const type = String(req.body.type || 'System').trim();
  const message = String(req.body.message || '').trim();
  if (!message) return res.status(400).json({ ok: false, message: 'Log message is required.' });
  const detail = String(req.body.detail || '').trim();
  const status = String(req.body.status || 'ok').trim();
  const time = req.body.time && !Number.isNaN(Date.parse(req.body.time)) ? new Date(req.body.time).toISOString() : now();
  const result = log.run(type, message, detail, status, time);
  res.status(201).json({ ok: true, log: { id: Number(result.lastInsertRowid), type, message, detail, status, time } });
});
app.delete('/api/logs', (_req, res) => {
  db.prepare('DELETE FROM activity_logs').run();
  res.json({ ok: true, message: 'Activity logs cleared.' });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ ok: false, message: 'Internal server error.', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, '0.0.0.0', () => console.log(`CARVANTA API listening on port ${port}; SQLite DB: ${dbPath}`));
