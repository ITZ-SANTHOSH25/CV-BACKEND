/*!
 * CARVANTA API client (optional)
 * A tiny, dependency-free wrapper around the CARVANTA REST API.
 * Include it in any page: <script src="/api-client.js"></script>
 */
(function (global) {
  'use strict';

  var BASE = '/api';

  function request(method, path, body) {
    var opts = {
      method: method,
      headers: { Accept: 'application/json' },
    };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(BASE + path, opts).then(function (res) {
      return res.json().catch(function () {
        return { ok: false, error: { message: 'Invalid JSON response', status: res.status } };
      }).then(function (json) {
        if (!res.ok || json.ok === false) {
          var msg = (json.error && json.error.message) || ('HTTP ' + res.status);
          var err = new Error(msg);
          err.status = res.status;
          err.details = json.error && json.error.details;
          throw err;
        }
        return json.data;
      });
    });
  }

  var api = {
    base: BASE,

    // Meta
    health: function () { return request('GET', '/health'); },
    summary: function () { return request('GET', '/summary'); },

    // Bystander
    getBystander: function () { return request('GET', '/bystander'); },
    updateBystander: function (data) { return request('PUT', '/bystander', data); },
    nearest: function () { return request('GET', '/bystander/nearest'); },

    // Ambulances
    listAmbulances: function (params) { return request('GET', '/ambulances' + qs(params)); },
    getAmbulance: function (id) { return request('GET', '/ambulances/' + id); },
    createAmbulance: function (data) { return request('POST', '/ambulances', data); },
    updateAmbulance: function (id, data) { return request('PATCH', '/ambulances/' + id, data); },
    deleteAmbulance: function (id) { return request('DELETE', '/ambulances/' + id); },

    // Hospitals
    listHospitals: function (params) { return request('GET', '/hospitals' + qs(params)); },
    getHospital: function (id) { return request('GET', '/hospitals/' + id); },
    createHospital: function (data) { return request('POST', '/hospitals', data); },
    updateHospital: function (id, data) { return request('PATCH', '/hospitals/' + id, data); },
    deleteHospital: function (id) { return request('DELETE', '/hospitals/' + id); },

    // Contacts
    listContacts: function () { return request('GET', '/contacts'); },
    getContact: function (id) { return request('GET', '/contacts/' + id); },
    createContact: function (data) { return request('POST', '/contacts', data); },
    updateContact: function (id, data) { return request('PUT', '/contacts/' + id, data); },
    deleteContact: function (id) { return request('DELETE', '/contacts/' + id); },

    // Alerts
    listAlerts: function (params) { return request('GET', '/alerts' + qs(params)); },
    getAlert: function (id) { return request('GET', '/alerts/' + id); },
    triggerAlert: function (data) { return request('POST', '/alerts', data || {}); },
    acknowledgeAlert: function (id, contactId) {
      return request('POST', '/alerts/' + id + '/acknowledge', contactId ? { contactId: contactId } : {});
    },
    deliverAlert: function (id) { return request('POST', '/alerts/' + id + '/deliver', {}); },
    closeAlert: function (id) { return request('POST', '/alerts/' + id + '/close', {}); },
    deleteAlert: function (id) { return request('DELETE', '/alerts/' + id); },

    // Logs
    listLogs: function (params) { return request('GET', '/logs' + qs(params)); },
    logStats: function () { return request('GET', '/logs/stats'); },
    createLog: function (data) { return request('POST', '/logs', data); },
    clearLogs: function (type) { return request('DELETE', '/logs' + qs(type ? { type: type } : null)); },

    // Watch
    getWatch: function () { return request('GET', '/watch'); },
    connectWatch: function () { return request('POST', '/watch/connect', {}); },
    disconnectWatch: function () { return request('POST', '/watch/disconnect', {}); },
    getReadings: function (params) { return request('GET', '/watch/readings' + qs(params)); },
    postReading: function (data) { return request('POST', '/watch/readings', data); },
    listFalls: function () { return request('GET', '/watch/falls'); },
    reportFall: function (data) { return request('POST', '/watch/falls', data || {}); },
  };

  function qs(params) {
    if (!params) return '';
    var parts = [];
    Object.keys(params).forEach(function (k) {
      if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
        parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
      }
    });
    return parts.length ? '?' + parts.join('&') : '';
  }

  global.CarvantaAPI = api;
})(window);
