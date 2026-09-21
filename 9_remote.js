// language: JavaScript, file: 9_remote.js, target: modern browsers
// ReconStrike V14 -- Remote companion integration

(function () {
  'use strict';
  if (!window.ReconCore) return;
  var core = window.ReconCore;
  var eventBus = core.eventBus;
  var storage = core.storage;
  var scope = core.scope;
  var mods = core.modules = core.modules || {};

  var CONFIG_KEY = 'rs13_companion';
  var DEFAULT_CONFIG = {
    baseUrl: '',
    token: null,
    lastPoll: 0,
    enabled: false
  };

  function loadConfig() {
    try {
      var raw = localStorage.getItem(CONFIG_KEY);
      if (!raw) return Object.assign({}, DEFAULT_CONFIG);
      return Object.assign({}, DEFAULT_CONFIG, JSON.parse(raw));
    } catch (e) {
      return Object.assign({}, DEFAULT_CONFIG);
    }
  }

  function saveConfig(cfg) {
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg)); } catch (e) {}
  }

  var config = loadConfig();

  // ══════════════════════════════════════════════════════════════
  // CORS PROXY -- send requests with a spoofed Origin via companion
  // ══════════════════════════════════════════════════════════════
  async function proxiedFetch(targetUrl, opts) {
    opts = opts || {};
    if (!config.baseUrl) throw new Error('companion not configured');

    var u = new URL(config.baseUrl + '/proxy');
    u.searchParams.set('url', targetUrl);
    if (opts.origin) u.searchParams.set('origin', opts.origin);
    if (opts.method && opts.method !== 'GET') u.searchParams.set('method', opts.method);
    if (opts.headers) {
      try { u.searchParams.set('headers', JSON.stringify(opts.headers)); } catch (e) {}
    }

    var init = { method: opts.method === 'GET' || !opts.method ? 'GET' : opts.method };
    if (opts.body && opts.method && opts.method !== 'GET') {
      init.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
      init.headers = { 'Content-Type': 'application/json' };
    }

    var r = await fetch(u.href, init);
    if (!r.ok) throw new Error('companion proxy ' + r.status);
    return r.json();
  }

  async function corsTest(targetUrl) {
    if (!config.baseUrl) return { ok: false, reason: 'companion not configured' };

    var origins = [
      'https://evil.com',
      'https://' + scope.currentHost + '.evil.com',
      'https://evil.' + scope.currentHost,
      'null',
      'https://localhost',
      'http://localhost'
    ];

    var results = [];
    for (var i = 0; i < origins.length; i++) {
      try {
        var d = await proxiedFetch(targetUrl, { origin: origins[i], method: 'GET' });
        if (!d.ok) { results.push({ origin: origins[i], error: d.error }); continue; }

        var acao = d.headers['access-control-allow-origin'] || null;
        var acac = d.headers['access-control-allow-credentials'] || null;

        var risk = 'NONE';
        var issue = '';
        if (acao === origins[i] && acac === 'true') { risk = 'CRITICAL'; issue = 'Origin reflected + credentials allowed'; }
        else if (acao === origins[i]) { risk = 'HIGH'; issue = 'Origin reflected (no creds)'; }
        else if (acao === '*' && acac === 'true') { risk = 'CRITICAL'; issue = 'Wildcard + credentials'; }
        else if (acao === '*') { risk = 'MEDIUM'; issue = 'Wildcard origin'; }
        else if (acao === 'null' && origins[i] === 'null') { risk = 'HIGH'; issue = 'Null origin reflected'; }

        results.push({ origin: origins[i], acao: acao, acac: acac, risk: risk, issue: issue, status: d.status });
      } catch (e) {
        results.push({ origin: origins[i], error: e.message });
      }
    }

    var worst = results.reduce(function (acc, r) {
      var rank = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, NONE: 1 };
      if ((rank[r.risk] || 0) > (rank[acc.risk] || 0)) return r;
      return acc;
    }, { risk: 'NONE' });

    if (worst.risk !== 'NONE') {
      try {
        await storage.put('cors', {
          url: targetUrl,
          origin: worst.origin,
          acao: worst.acao,
          credentials: worst.acac,
          risk: worst.risk,
          issue: worst.issue,
          source: 'companion-proxy'
        }, 'cors::' + storage.hashKey(targetUrl + '::' + worst.origin));
      } catch (e) {}
    }

    return { ok: true, target: targetUrl, results: results, worst: worst };
  }

  // ══════════════════════════════════════════════════════════════
  // OAST
  // ══════════════════════════════════════════════════════════════
  async function oastRegister() {
    if (!config.baseUrl) return { ok: false, reason: 'companion not configured' };
    try {
      var r = await fetch(config.baseUrl + '/register');
      if (!r.ok) throw new Error('status ' + r.status);
      var d = await r.json();
      if (!d.ok) throw new Error(d.reason || 'register failed');
      config.token = d.token;
      config.lastPoll = 0;
      saveConfig(config);
      return { ok: true, token: d.token };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  function oastUrl(label) {
    if (!config.baseUrl || !config.token) return null;
    var host = new URL(config.baseUrl).host;
    return 'https://' + host + '/log/' + config.token + '/' + (label || 'x');
  }

  async function oastPoll() {
    if (!config.baseUrl || !config.token) return { ok: false, reason: 'no token' };
    try {
      var u = config.baseUrl + '/poll/' + config.token + '?since=' + (config.lastPoll || 0);
      var r = await fetch(u);
      if (!r.ok) throw new Error('status ' + r.status);
      var d = await r.json();
      if (!d.ok) throw new Error(d.reason || 'poll failed');

      if (d.fresh && d.fresh.length) {
        for (var i = 0; i < d.fresh.length; i++) {
          var hit = d.fresh[i];
          config.lastPoll = Math.max(config.lastPoll || 0, hit.t);
          try {
            await storage.put('meta', {
              kind: 'oast-hit',
              token: config.token,
              ip: hit.ip,
              ua: hit.ua,
              method: hit.method,
              path: hit.path,
              body: hit.body,
              headers: hit.headers,
              at: hit.t
            }, 'oast::' + config.token + '::' + hit.t);
          } catch (e) {}
          eventBus.emit('oast:interaction', hit);
        }
        saveConfig(config);
      }

      return { ok: true, hits: d.hits || 0, total: d.total || 0, fresh: d.fresh || [] };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  var pollTimer = null;
  function startPolling() {
    if (pollTimer) return;
    if (!config.token) return;
    pollTimer = setInterval(function () {
      oastPoll().catch(function () {});
    }, 12000);
  }
  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  // ══════════════════════════════════════════════════════════════
  // STATE SYNC
  // ══════════════════════════════════════════════════════════════
  async function pushState(stateToken) {
    if (!config.baseUrl) return { ok: false, reason: 'companion not configured' };
    if (!stateToken) return { ok: false, reason: 'no state token' };
    try {
      var stores = ['endpoints','secrets','cors','jwt','forms','cookies','sri','sw','srcmaps','storage','network','graphql','meta'];
      var payload = { at: Date.now(), host: scope.currentHost };
      for (var i = 0; i < stores.length; i++) {
        try { payload[stores[i]] = await storage.getAll(stores[i]); }
        catch (e) { payload[stores[i]] = []; }
      }
      var r = await fetch(config.baseUrl + '/store/' + stateToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!r.ok) throw new Error('status ' + r.status);
      return await r.json();
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  async function pullState(stateToken) {
    if (!config.baseUrl) return { ok: false, reason: 'companion not configured' };
    if (!stateToken) return { ok: false, reason: 'no state token' };
    try {
      var r = await fetch(config.baseUrl + '/store/' + stateToken);
      if (!r.ok) throw new Error('status ' + r.status);
      var d = await r.json();
      if (!d.ok || !d.state) return { ok: false, reason: 'no state' };

      var stores = ['endpoints','secrets','cors','jwt','forms','cookies','sri','sw','srcmaps','storage','network','graphql','meta'];
      var imported = 0;
      for (var i = 0; i < stores.length; i++) {
        var s = stores[i];
        var rows = d.state[s] || [];
        for (var j = 0; j < rows.length; j++) {
          var row = rows[j];
          try {
            await storage.put(s, row, row.id);
            imported++;
          } catch (e) {}
        }
      }
      return { ok: true, imported: imported, at: d.state.at, host: d.state.host };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // ══════════════════════════════════════════════════════════════
  // PUBLIC
  // ══════════════════════════════════════════════════════════════
  function setBase(baseUrl) {
    config.baseUrl = String(baseUrl || '').replace(/\/+$/, '');
    saveConfig(config);
    if (config.token) startPolling();
    return { ok: true, baseUrl: config.baseUrl };
  }

  function status() {
    return {
      enabled: !!config.baseUrl,
      baseUrl: config.baseUrl,
      token: config.token,
      polling: !!pollTimer,
      lastPoll: config.lastPoll || 0
    };
  }

  mods.remote = {
    setBase: setBase,
    status: status,
    corsTest: corsTest,
    oastRegister: oastRegister,
    oastUrl: oastUrl,
    oastPoll: oastPoll,
    startPolling: startPolling,
    stopPolling: stopPolling,
    pushState: pushState,
    pullState: pullState,
    proxiedFetch: proxiedFetch,
    getConfig: function () { return Object.assign({}, config); }
  };

  core.remote = mods.remote;

  if (config.token) startPolling();

  eventBus.emit('remote:ready', { configured: !!config.baseUrl, hasToken: !!config.token });

  if (typeof completion === 'function') completion(true);
})();