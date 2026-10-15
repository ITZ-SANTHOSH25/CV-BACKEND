'use strict';

/**
 * Cross-cutting data helpers shared by route modules.
 */

const { parseJson } = require('./middleware/helpers');

/** Append an activity log entry. */
function addLog(db, entry) {
  const row = {
    time: entry.time || Date.now(),
    type: entry.type || 'System',
    message: entry.message || '',
    detail: entry.detail || '',
    status: entry.status || 'ok',
  };
  const info = db
    .prepare(
      `INSERT INTO logs (time, type, message, detail, status)
       VALUES (@time, @type, @message, @detail, @status)`
    )
    .run(row);

  // Keep the log table bounded (mirror frontend's 200-entry cap).
  db.prepare(
    `DELETE FROM logs WHERE id NOT IN (SELECT id FROM logs ORDER BY time DESC LIMIT 200)`
  ).run();

  return { id: info.lastInsertRowid, ...row };
}

/** Read the single bystander row. */
function getBystander(db) {
  return db.prepare('SELECT * FROM bystander WHERE id = 1').get() || null;
}

/** Read the single watch row (normalised booleans). */
function getWatch(db) {
  const w = db.prepare('SELECT * FROM watch WHERE id = 1').get();
  if (!w) return null;
  return {
    deviceName: w.device_name,
    connected: !!w.connected,
    battery: w.battery,
    signal: w.signal,
    rate: w.rate,
    updated: w.updated,
  };
}

/** Map a hospital row into API shape (parse JSON columns). */
function mapHospital(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    type: row.type,
    beds: row.beds,
    phone: row.phone,
    facilities: parseJson(row.facilities, {}),
    blood: parseJson(row.blood, {}),
    updated: row.updated,
  };
}

/** Map an alert row + recipients into API shape. */
function mapAlert(db, row) {
  if (!row) return null;
  const recipients = db
    .prepare('SELECT * FROM alert_recipients WHERE alert_id = ? ORDER BY id')
    .all(row.id)
    .map((r) => ({
      id: r.id,
      contactId: r.contact_id,
      name: r.name,
      phone: r.phone,
      relation: r.relation,
      status: r.status,
      acknowledgedAt: r.ack_at,
    }));
  return {
    id: row.id,
    reason: row.reason,
    location: row.location,
    status: row.status,
    start: row.start,
    endedAt: row.ended_at,
    recipients,
    acknowledgedCount: recipients.filter((r) => r.status === 'acknowledged').length,
    recipientCount: recipients.length,
  };
}

module.exports = { addLog, getBystander, getWatch, mapHospital, mapAlert };
