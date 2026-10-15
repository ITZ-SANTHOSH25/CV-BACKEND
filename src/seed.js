'use strict';

/**
 * Seed data for CARVANTA.
 * Mirrors the hardcoded data in the frontend (public/index.html) so the API
 * returns the same ambulances, hospitals, bystander location and contacts.
 */

const bystander = {
  lat: 37.775,
  lng: -122.418,
  label: 'Bystander \u00b7 Accident Scene',
  address: 'Civic Center, Market St & 7th St',
};

const ambulances = [
  { id: 'AMB-01', name: 'Rapid Response 01', callsign: 'Alpha', lat: 37.7788, lng: -122.4152, status: 'available', type: 'Advanced Life Support', crew: 3, eta: 4, phone: '+1 555 0101' },
  { id: 'AMB-02', name: 'Rapid Response 02', callsign: 'Bravo', lat: 37.7712, lng: -122.4235, status: 'available', type: 'Basic Life Support', crew: 2, eta: 6, phone: '+1 555 0102' },
  { id: 'AMB-03', name: 'Trauma Unit 07', callsign: 'Charlie', lat: 37.7805, lng: -122.4088, status: 'en-route', type: 'Mobile ICU', crew: 4, eta: 9, phone: '+1 555 0103' },
  { id: 'AMB-04', name: 'Rapid Response 04', callsign: 'Delta', lat: 37.7669, lng: -122.413, status: 'available', type: 'Basic Life Support', crew: 2, eta: 7, phone: '+1 555 0104' },
  { id: 'AMB-05', name: 'Neonatal Unit 02', callsign: 'Echo', lat: 37.7831, lng: -122.426, status: 'busy', type: 'Neonatal Transport', crew: 3, eta: 14, phone: '+1 555 0105' },
  { id: 'AMB-06', name: 'Rapid Response 06', callsign: 'Foxtrot', lat: 37.77, lng: -122.43, status: 'available', type: 'Advanced Life Support', crew: 3, eta: 5, phone: '+1 555 0106' },
];

const hospitals = [
  {
    id: 'HSP-01', name: 'St. Mercy General Hospital', lat: 37.779, lng: -122.412,
    type: 'Level I Trauma Center', beds: 640, phone: '+1 555 2001',
    facilities: { bloodBank: 'available', icuBeds: 'available', operationTheatre: 'available', ventilator: 'low', emergencyDept: 'available', specialists: 'available', other: 'available' },
    blood: { 'A+': true, 'A-': true, 'B+': true, 'B-': false, 'O+': true, 'O-': true },
  },
  {
    id: 'HSP-02', name: 'Bayview Medical Center', lat: 37.768, lng: -122.426,
    type: 'Level II Trauma Center', beds: 420, phone: '+1 555 2002',
    facilities: { bloodBank: 'low', icuBeds: 'available', operationTheatre: 'available', ventilator: 'available', emergencyDept: 'available', specialists: 'low', other: 'available' },
    blood: { 'A+': true, 'A-': false, 'B+': true, 'B-': true, 'O+': true, 'O-': false },
  },
  {
    id: 'HSP-03', name: 'Northgate City Hospital', lat: 37.786, lng: -122.42,
    type: 'General Emergency', beds: 310, phone: '+1 555 2003',
    facilities: { bloodBank: 'available', icuBeds: 'low', operationTheatre: 'unavailable', ventilator: 'low', emergencyDept: 'available', specialists: 'available', other: 'low' },
    blood: { 'A+': true, 'A-': true, 'B+': false, 'B-': false, 'O+': true, 'O-': true },
  },
  {
    id: 'HSP-04', name: 'Riverside Regional Trauma', lat: 37.771, lng: -122.405,
    type: 'Level I Trauma Center', beds: 780, phone: '+1 555 2004',
    facilities: { bloodBank: 'available', icuBeds: 'available', operationTheatre: 'available', ventilator: 'available', emergencyDept: 'available', specialists: 'available', other: 'available' },
    blood: { 'A+': true, 'A-': true, 'B+': true, 'B-': true, 'O+': true, 'O-': true },
  },
  {
    id: 'HSP-05', name: 'Harborview Community Clinic', lat: 37.762, lng: -122.418,
    type: 'Urgent Care', beds: 90, phone: '+1 555 2005',
    facilities: { bloodBank: 'unavailable', icuBeds: 'unavailable', operationTheatre: 'unavailable', ventilator: 'low', emergencyDept: 'low', specialists: 'unavailable', other: 'low' },
    blood: { 'A+': false, 'A-': false, 'B+': true, 'B-': false, 'O+': true, 'O-': false },
  },
];

const contacts = [
  { id: 'c1', name: 'Aarav Sharma', phone: '+1 555 7301', relation: 'Family', type: 'Primary Guardian' },
  { id: 'c2', name: 'Meera Sharma', phone: '+1 555 7302', relation: 'Family', type: 'Parent' },
  { id: 'c3', name: 'Daniel Okoye', phone: '+1 555 7303', relation: 'Neighbourhood', type: 'Neighbour' },
  { id: 'c4', name: 'Sofia Marino', phone: '+1 555 7304', relation: 'Neighbourhood', type: 'Block Captain' },
];

// Seed logs are generated relative to "now" at seed time.
function seedLogs(now = Date.now()) {
  return [
    { time: now - 1000 * 60 * 42, type: 'Smartwatch', message: 'Smartwatch CARV-W2 connected', detail: 'BLE handshake OK \u00b7 battery 82%', status: 'ok' },
    { time: now - 1000 * 60 * 37, type: 'Sensor', message: 'Sensor stream started', detail: 'Accelerometer + Gyroscope @ 50Hz', status: 'ok' },
    { time: now - 1000 * 60 * 25, type: 'Location', message: 'Live location shared with Bayview Medical Center', detail: 'Bystander coordinates transmitted', status: 'ok' },
    { time: now - 1000 * 60 * 18, type: 'Alert', message: 'Emergency alert sent to 4 contacts', detail: 'Fall event \u00b7 Family & Neighbourhood', status: 'ok' },
    { time: now - 1000 * 60 * 17, type: 'Acknowledgement', message: 'Alert acknowledged by Aarav Sharma', detail: 'Ring & vibration stopped', status: 'ok' },
    { time: now - 1000 * 60 * 9, type: 'Fall Detection', message: 'Fall detected (high-confidence)', detail: 'Impact 3.4g \u00b7 orientation change 78\u00b0', status: 'warn' },
    { time: now - 1000 * 60 * 8, type: 'Location', message: 'Ambulance AMB-01 location sent', detail: 'Shared to dispatch recipient', status: 'ok' },
    { time: now - 1000 * 60 * 3, type: 'Smartwatch', message: 'Smartwatch heartbeat received', detail: 'Signal strength -58 dBm', status: 'ok' },
  ];
}

const watch = {
  deviceName: 'CARV-W2 Smartwatch',
  connected: false,
  battery: 82,
  signal: -58,
  rate: '0 Hz',
};

/**
 * Populate a database instance with the seed data.
 * @param {import('better-sqlite3').Database} db
 * @param {{ reset?: boolean }} [opts]
 */
function seedDatabase(db, opts = {}) {
  const reset = !!opts.reset;

  const run = db.transaction(() => {
    if (reset) {
      db.exec(`
        DELETE FROM alert_recipients;
        DELETE FROM alerts;
        DELETE FROM logs;
        DELETE FROM contacts;
        DELETE FROM hospitals;
        DELETE FROM ambulances;
        DELETE FROM watch_readings;
        DELETE FROM falls;
        DELETE FROM bystander;
        DELETE FROM watch;
      `);
    }

    const now = Date.now();

    // Bystander (single row)
    db.prepare(
      `INSERT INTO bystander (id, lat, lng, label, address, updated)
       VALUES (1, @lat, @lng, @label, @address, @updated)
       ON CONFLICT(id) DO UPDATE SET
         lat=excluded.lat, lng=excluded.lng, label=excluded.label,
         address=excluded.address, updated=excluded.updated`
    ).run({ ...bystander, updated: now });

    // Ambulances
    const insAmb = db.prepare(
      `INSERT INTO ambulances (id, name, callsign, lat, lng, status, type, crew, eta, phone)
       VALUES (@id, @name, @callsign, @lat, @lng, @status, @type, @crew, @eta, @phone)
       ON CONFLICT(id) DO NOTHING`
    );
    ambulances.forEach((a) => insAmb.run(a));

    // Hospitals
    const insHosp = db.prepare(
      `INSERT INTO hospitals (id, name, lat, lng, type, beds, phone, facilities, blood)
       VALUES (@id, @name, @lat, @lng, @type, @beds, @phone, @facilities, @blood)
       ON CONFLICT(id) DO NOTHING`
    );
    hospitals.forEach((h) =>
      insHosp.run({
        ...h,
        facilities: JSON.stringify(h.facilities),
        blood: JSON.stringify(h.blood),
      })
    );

    // Contacts
    const insContact = db.prepare(
      `INSERT INTO contacts (id, name, phone, relation, type, created_at)
       VALUES (@id, @name, @phone, @relation, @type, @created_at)
       ON CONFLICT(id) DO NOTHING`
    );
    contacts.forEach((c) => insContact.run({ ...c, created_at: now }));

    // Logs
    const insLog = db.prepare(
      `INSERT INTO logs (time, type, message, detail, status)
       VALUES (@time, @type, @message, @detail, @status)`
    );
    const logCount = db.prepare('SELECT COUNT(*) AS n FROM logs').get().n;
    if (logCount === 0) seedLogs(now).forEach((l) => insLog.run(l));

    // Watch (single row)
    db.prepare(
      `INSERT INTO watch (id, device_name, connected, battery, signal, rate, updated)
       VALUES (1, @deviceName, @connected, @battery, @signal, @rate, @updated)
       ON CONFLICT(id) DO UPDATE SET
         device_name=excluded.device_name, battery=excluded.battery,
         signal=excluded.signal, rate=excluded.rate, updated=excluded.updated`
    ).run({ ...watch, connected: watch.connected ? 1 : 0, updated: now });
  });

  run();
}

module.exports = { bystander, ambulances, hospitals, contacts, seedLogs, watch, seedDatabase };

// Allow `node src/seed.js [--reset]`
if (require.main === module) {
  const { getDb, closeDb } = require('./db');
  const reset = process.argv.includes('--reset');
  const db = getDb();
  seedDatabase(db, { reset });
  closeDb();
  console.log(`[CARVANTA] Database seeded${reset ? ' (reset)' : ''}.`);
}
