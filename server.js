// ALERTS: Create an alert and notify all registered emergency contacts.
app.post('/api/alerts', (req, res) => {
  try {
    const reason = String(req.body?.reason || 'Emergency alert').trim();
    const location = String(
      req.body?.location || 'Unknown location'
    ).trim();

    // Prefer explicitly supplied recipients when valid.
    let recipients = Array.isArray(req.body?.recipients)
      ? req.body.recipients.filter(
          r =>
            r &&
            String(r.name || '').trim() &&
            String(r.phone || '').trim()
        )
      : [];

    // Otherwise, use registered emergency contacts.
    if (recipients.length === 0) {
      recipients = db.prepare(`
        SELECT id, name, phone, relation
        FROM contacts
        ORDER BY id DESC
      `).all();
    }

    if (recipients.length === 0) {
      return res.status(400).json({
        ok: false,
        message: 'No registered emergency contacts found. Register at least one contact first.'
      });
    }

    const createdAt =
      req.body?.createdAt &&
      !Number.isNaN(Date.parse(req.body.createdAt))
        ? new Date(req.body.createdAt).toISOString()
        : now();

    const createAlert = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO alerts
          (reason, location, status, created_at, updated_at)
        VALUES (?, ?, 'active', ?, ?)
      `).run(reason, location, createdAt, createdAt);

      const alertId = Number(result.lastInsertRowid);

      const insertRecipient = db.prepare(`
        INSERT INTO alert_recipients
          (alert_id, contact_id, name, phone, relation, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'pending', ?)
      `);

      let insertedCount = 0;

      for (const recipient of recipients) {
        const name = String(recipient.name || '').trim();
        const phone = String(recipient.phone || '').trim();

        if (!name || !phone) continue;

        const possibleId = Number(recipient.id);

        const contact =
          Number.isFinite(possibleId) && possibleId > 0
            ? db.prepare(
                'SELECT id FROM contacts WHERE id = ?'
              ).get(possibleId)
            : null;

        insertRecipient.run(
          alertId,
          contact ? contact.id : null,
          name,
          phone,
          String(recipient.relation || 'Neighbourhood'),
          createdAt
        );

        insertedCount++;
      }

      if (insertedCount === 0) {
        throw new Error('No valid alert recipients could be inserted.');
      }

      addLog(
        'Alert',
        `Emergency alert sent to ${insertedCount} contacts`,
        `${reason} · ${location} · Alert ID: ${alertId}`,
        'alert',
        createdAt
      );

      return alertId;
    });

    const alertId = createAlert();

    return res.status(201).json({
      ok: true,
      alert: getAlert(alertId)
    });
  } catch (error) {
    console.error('Emergency alert creation failed:', error);

    return res.status(500).json({
      ok: false,
      message: 'Failed to create emergency alert.',
      error: error.message
    });
  }
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
