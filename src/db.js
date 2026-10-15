'use strict';

/**
 * SQLite data layer for CARVANTA.
 * Uses better-sqlite3 (synchronous, fast, no external server).
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { seedDatabase } = require('./seed');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'carvanta.db');

let db = null;

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS bystander (
  id       INTEGER PRIMARY KEY CHECK (id = 1),
  lat      REAL NOT NULL,
  lng      REAL NOT NULL,
  label    TEXT,
  address  TEXT,
  updated  INTEGER
);

CREATE TABLE IF NOT EXISTS ambulances (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  callsign  TEXT,
  lat       REAL NOT NULL,
  lng       REAL NOT NULL,
  status    TEXT NOT NULL DEFAULT 'available',
  type      TEXT,
  crew      INTEGER DEFAULT 0,
  eta       INTEGER DEFAULT 0,
  phone     TEXT,
  updated   INTEGER
);

CREATE TABLE IF NOT EXISTS hospitals (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  lat         REAL NOT NULL,
  lng         REAL NOT NULL,
  type        TEXT,
  beds        INTEGER DEFAULT 0,
  phone       TEXT,
  facilities  TEXT NOT NULL DEFAULT '{}',
  blood       TEXT NOT NULL DEFAULT '{}',
  updated     INTEGER
);

CREATE TABLE IF NOT EXISTS contacts (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL,
  relation    TEXT,
  type        TEXT,
  created_at  INTEGER
);

CREATE TABLE IF NOT EXISTS alerts (
  id         TEXT PRIMARY KEY,
  reason     TEXT NOT NULL,
  location   TEXT,
  status     TEXT NOT NULL DEFAULT 'active',
  start      INTEGER NOT NULL,
  ended_at   INTEGER
);

CREATE TABLE IF NOT EXISTS alert_recipients (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_id   TEXT NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  contact_id TEXT,
  name       TEXT,
  phone      TEXT,
  relation   TEXT,
  status     TEXT NOT NULL DEFAULT 'ringing',
  ack_at     INTEGER
);

CREATE TABLE IF NOT EXISTS logs (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  time     INTEGER NOT NULL,
  type     TEXT NOT NULL,
  message  TEXT NOT NULL,
  detail   TEXT,
  status   TEXT NOT NULL DEFAULT 'ok'
);

CREATE TABLE IF NOT EXISTS watch (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  device_name TEXT,
  connected   INTEGER NOT NULL DEFAULT 0,
  battery     INTEGER DEFAULT 82,
  signal      INTEGER DEFAULT -58,
  rate        TEXT DEFAULT '0 Hz',
  updated     INTEGER
);

CREATE TABLE IF NOT EXISTS watch_readings (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  time      INTEGER NOT NULL,
  ax        REAL, ay REAL, az REAL,
  gx        REAL, gy REAL, gz REAL,
  hr        INTEGER,
  magnitude REAL
);

CREATE TABLE IF NOT EXISTS falls (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  time       INTEGER NOT NULL,
  confidence TEXT,
  impact     REAL,
  alerted    INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_logs_time   ON logs(time DESC);
CREATE INDEX IF NOT EXISTS idx_logs_type   ON logs(type);
CREATE INDEX IF NOT EXISTS idx_alerts_start ON alerts(start DESC);
CREATE INDEX IF NOT EXISTS idx_rec_alert   ON alert_recipients(alert_id);
CREATE INDEX IF NOT EXISTS idx_readings_time ON watch_readings(time DESC);
`;

/**
 * Get (and lazily initialise) the shared database connection.
 * @returns {import('better-sqlite3').Database}
 */
function getDb() {
  if (db) return db;

  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

  db = new Database(DB_FILE);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);

  // Seed only if the database is empty (first run).
  const hasData = db.prepare('SELECT COUNT(*) AS n FROM ambulances').get().n > 0;
  if (!hasData) seedDatabase(db);

  return db;
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, closeDb, DB_FILE };
