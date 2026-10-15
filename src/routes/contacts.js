'use strict';

const express = require('express');
const { getDb } = require('../db');
const { ok, asyncHandler, ApiError, requireFields } = require('../middleware/helpers');
const { addLog } = require('../services');

const router = express.Router();

const MAX_CONTACTS = 5;

// GET /api/contacts
router.get(
  '/',
  asyncHandler((req, res) => {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM contacts ORDER BY created_at, id').all();
    ok(res, { contacts: rows, count: rows.length, max: MAX_CONTACTS });
  })
);

// GET /api/contacts/:id
router.get(
  '/:id',
  asyncHandler((req, res) => {
    const row = getDb().prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
    if (!row) throw ApiError.notFound(`Contact ${req.params.id} not found`);
    ok(res, row);
  })
);

// POST /api/contacts — create (enforces max 5)
router.post(
  '/',
  asyncHandler((req, res) => {
    const db = getDb();
    const body = req.body || {};
    const problems = requireFields(body, ['name', 'phone']);
    if (problems.length) throw ApiError.unprocessable('Invalid payload', problems);

    const count = db.prepare('SELECT COUNT(*) AS n FROM contacts').get().n;
    if (count >= MAX_CONTACTS) {
      throw ApiError.conflict(`Maximum of ${MAX_CONTACTS} emergency contacts reached`);
    }

    const id = body.id || 'c' + Date.now();
    if (db.prepare('SELECT 1 FROM contacts WHERE id = ?').get(id)) {
      throw ApiError.conflict(`Contact ${id} already exists`);
    }

    const row = {
      id,
      name: String(body.name).trim(),
      phone: String(body.phone).trim(),
      relation: body.relation ?? 'Family',
      type: body.type ?? '',
      created_at: Date.now(),
    };
    db.prepare(
      `INSERT INTO contacts (id, name, phone, relation, type, created_at)
       VALUES (@id, @name, @phone, @relation, @type, @created_at)`
    ).run(row);

    addLog(db, { type: 'System', message: 'Emergency contact added', detail: `${row.name} \u00b7 ${row.relation}`, status: 'ok' });
    ok(res, row, 201);
  })
);

// PUT /api/contacts/:id — full update
router.put(
  '/:id',
  asyncHandler((req, res) => {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
    if (!existing) throw ApiError.notFound(`Contact ${req.params.id} not found`);
    const body = req.body || {};
    const problems = requireFields(body, ['name', 'phone']);
    if (problems.length) throw ApiError.unprocessable('Invalid payload', problems);

    const row = {
      id: existing.id,
      name: String(body.name).trim(),
      phone: String(body.phone).trim(),
      relation: body.relation ?? existing.relation,
      type: body.type ?? existing.type,
      created_at: existing.created_at,
    };
    db.prepare(
      `UPDATE contacts SET name=@name, phone=@phone, relation=@relation, type=@type WHERE id=@id`
    ).run(row);

    addLog(db, { type: 'System', message: 'Emergency contact updated', detail: `${row.name} \u00b7 ${row.phone}`, status: 'ok' });
    ok(res, row);
  })
);

// PATCH /api/contacts/:id — partial update
router.patch(
  '/:id',
  asyncHandler((req, res) => {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
    if (!existing) throw ApiError.notFound(`Contact ${req.params.id} not found`);
    const body = req.body || {};
    const row = {
      id: existing.id,
      name: body.name !== undefined ? String(body.name).trim() : existing.name,
      phone: body.phone !== undefined ? String(body.phone).trim() : existing.phone,
      relation: body.relation ?? existing.relation,
      type: body.type ?? existing.type,
    };
    db.prepare(`UPDATE contacts SET name=@name, phone=@phone, relation=@relation, type=@type WHERE id=@id`).run(row);
    addLog(db, { type: 'System', message: 'Emergency contact updated', detail: `${row.name}`, status: 'ok' });
    ok(res, row);
  })
);

// DELETE /api/contacts/:id
router.delete(
  '/:id',
  asyncHandler((req, res) => {
    const db = getDb();
    const info = db.prepare('DELETE FROM contacts WHERE id = ?').run(req.params.id);
    if (info.changes === 0) throw ApiError.notFound(`Contact ${req.params.id} not found`);
    addLog(db, { type: 'System', message: 'Emergency contact removed', detail: `Contact ID ${req.params.id}`, status: 'warn' });
    ok(res, { deleted: req.params.id });
  })
);

module.exports = router;
