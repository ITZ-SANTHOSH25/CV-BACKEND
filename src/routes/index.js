'use strict';

const express = require('express');

const router = express.Router();

// API index — describes available resources.
router.get('/', (req, res) => {
  res.json({
    ok: true,
    data: {
      name: 'CARVANTA API',
      version: require('../../package.json').version,
      endpoints: {
        health: 'GET /api/health',
        summary: 'GET /api/summary',
        bystander: 'GET /api/bystander · PUT /api/bystander · GET /api/bystander/nearest',
        ambulances: 'GET /api/ambulances · POST /api/ambulances · GET/PATCH/DELETE /api/ambulances/:id',
        hospitals: 'GET /api/hospitals · POST /api/hospitals · GET/PATCH/DELETE /api/hospitals/:id',
        contacts: 'GET /api/contacts · POST /api/contacts · GET/PUT/PATCH/DELETE /api/contacts/:id',
        alerts: 'GET /api/alerts · POST /api/alerts · POST /api/alerts/:id/acknowledge|deliver|close · DELETE /api/alerts/:id',
        logs: 'GET /api/logs · GET /api/logs/stats · POST /api/logs · DELETE /api/logs',
        watch: 'GET /api/watch · POST /api/watch/connect|disconnect · GET/POST /api/watch/readings · GET/POST /api/watch/falls',
      },
    },
  });
});

router.use('/', require('./health'));
router.use('/bystander', require('./bystander'));
router.use('/ambulances', require('./ambulances'));
router.use('/hospitals', require('./hospitals'));
router.use('/contacts', require('./contacts'));
router.use('/alerts', require('./alerts'));
router.use('/logs', require('./logs'));
router.use('/watch', require('./watch'));

module.exports = router;
