// language: JavaScript, file: 8_correlator.js, target: modern browsers
// ReconStrike V17 -- Layer 8 Correlator (evidence + remediation only)

(function () {
  'use strict';
  if (!window.ReconCore) return;
  var core = window.ReconCore;
  var eventBus = core.eventBus;
  var storage = core.storage;
  var mods = core.modules = core.modules || {};

  var STORES = [
    'endpoints', 'secrets', 'cors', 'jwt', 'forms', 'cookies',
    'network', 'graphql', 'sri', 'sw', 'srcmaps', 'storage', 'meta'
  ];
  var CANDIDATE_KIND = 'chain-candidate';
  var ID_PREFIX = 'corr::';
  var running = false;

  function safeStr(v) {
    return String(v == null ? '' : v);
  }

  function lower(v) {
    return safeStr(v).toLowerCase();
  }

  function hostOf(url) {
    try {
      return new URL(url, location.href).hostname;
    } catch (e) {
      return '';
    }
  }

  function pathOf(url) {
    try {
      return new URL(url, location.href).pathname || '/';
    } catch (e) {
      return safeStr(url);
    }
  }

  function sameHost(a, b) {
    var ha = hostOf(a) || a;
    var hb = hostOf(b) || b;
    if (!ha || !hb) return false;
    return ha === hb || ha.slice(-(hb.length + 1)) === '.' + hb || hb.slice(-(ha.length + 1)) === '.' + ha;
  }

  function findingLabel(f) {
    return safeStr(f.name || f.type || f.issue || f.key || f.id || 'finding').slice(0, 120);
  }

  function findingUrl(f) {
    return safeStr(f.url || f.endpoint || f.href || f.source || f.path || '');
  }

  function severityRank(s) {
    var m = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0 };
    return m[safeStr(s).toUpperCase()] || 0;
  }

  function scoreFinding(f) {
    try {
      if (mods.cvss && typeof mods.cvss.autoScore === 'function') {
        return mods.cvss.autoScore(f);
      }
    } catch (e) {}
    var t = lower(findingLabel(f) + ' ' + safeStr(f.value || f.snippet || ''));
    if (/aws|stripe|private key|github pat|rce|sqli/.test(t)) {
      return { score: 9.1, vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:N', severity: 'CRITICAL' };
    }
    if (/jwt|secret|token|cors.*cred|graphql/.test(t)) {
      return { score: 7.5, vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:L/A:N', severity: 'HIGH' };
    }
    if (/cookie|csrf|xss|sri|csp/.test(t)) {
      return { score: 5.3, vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:L/I:L/A:N', severity: 'MEDIUM' };
    }
    return { score: 3.1, vector: 'CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:N/A:N', severity: 'LOW' };
  }

  function maxSeverity(items) {
    var best = { severity: 'LOW', score: 0, vector: '' };
    for (var i = 0; i < items.length; i++) {
      var sc = scoreFinding(items[i]);
      if (severityRank(sc.severity) > severityRank(best.severity)) best = sc;
    }
    return best;
  }

  function stableId(parts) {
    var raw = parts.join('|');
    try {
      if (typeof storage.hashKey === 'function') return ID_PREFIX + storage.hashKey(raw);
      if (core.hashKey) return ID_PREFIX + core.hashKey(raw);
    } catch (e) {}
    var h = 0;
    for (var i = 0; i < raw.length; i++) {
      h = ((h << 5) - h) + raw.charCodeAt(i);
      h |= 0;
    }
    return ID_PREFIX + (h >>> 0).toString(36);
  }

  async function loadBundle() {
    var out = {};
    for (var i = 0; i < STORES.length; i++) {
      var s = STORES[i];
      try {
        out[s] = await storage.getAll(s);
      } catch (e) {
        out[s] = [];
      }
      if (!Array.isArray(out[s])) out[s] = [];
    }
    return out;
  }

  async function clearOwnCandidates() {
    var meta;
    try {
      meta = await storage.getAll('meta');
    } catch (e) {
      return;
    }
    if (!Array.isArray(meta)) return;
    for (var i = 0; i < meta.length; i++) {
      var m = meta[i];
      if (!m || m.kind !== CANDIDATE_KIND) continue;
      var id = m.id || '';
      if (safeStr(id).indexOf(ID_PREFIX) === 0 || m.source === 'correlator') {
        try { await storage.remove('meta', id); } catch (e) {}
      }
    }
  }

  function pushCandidate(list, c) {
    if (!c || !c.title) return;
    list.push(c);
  }

  function correlate(bundle) {
    var candidates = [];
    var endpoints = bundle.endpoints || [];
    var secrets = bundle.secrets || [];
    var jwts = bundle.jwt || [];
    var cors = bundle.cors || [];
    var cookies = bundle.cookies || [];
    var forms = bundle.forms || [];
    var graphql = bundle.graphql || [];
    var network = bundle.network || [];
    var storageRows = bundle.storage || [];

    // 1) Secrets / JWTs sharing host with endpoints
    var authLike = secrets.concat(jwts);
    for (var i = 0; i < authLike.length; i++) {
      var secret = authLike[i];
      var sUrl = findingUrl(secret);
      var linkedEps = [];
      for (var e = 0; e < endpoints.length; e++) {
        var ep = endpoints[e];
        var eUrl = findingUrl(ep);
        if (!eUrl && !sUrl) continue;
        if (sUrl && eUrl && sameHost(sUrl, eUrl)) linkedEps.push(ep);
        else if (!sUrl && eUrl && core.scope && core.scope.inScope && core.scope.inScope(eUrl)) linkedEps.push(ep);
      }
      if (!linkedEps.length && endpoints.length) {
        // fall back: same page host endpoints
        for (var e2 = 0; e2 < endpoints.length && linkedEps.length < 5; e2++) {
          if (core.scope && core.scope.inScope && findingUrl(endpoints[e2]) && core.scope.inScope(findingUrl(endpoints[e2]))) {
            linkedEps.push(endpoints[e2]);
          }
        }
      }
      if (!linkedEps.length) continue;

      var items = [secret].concat(linkedEps.slice(0, 5));
      var sc = maxSeverity(items);
      var epList = linkedEps.slice(0, 5).map(function (x) { return findingUrl(x) || findingLabel(x); });
      var id = stableId(['secret-endpoint', findingLabel(secret), epList.join(',')]);
      pushCandidate(candidates, {
        kind: CANDIDATE_KIND,
        source: 'correlator',
        id: id,
        title: 'Sensitive credential near reachable endpoints',
        severity: sc.severity,
        cvss: sc.vector,
        narrative: 'A sensitive value (' + findingLabel(secret) + ') correlates with ' +
          linkedEps.length + ' in-scope endpoint(s). Treat as a high-priority review: confirm storage, rotation, and whether those endpoints require stronger auth.',
        poc: [
          'Observed credential-like finding: ' + findingLabel(secret) + (sUrl ? ' @ ' + sUrl : ''),
          'Linked endpoint sample: ' + epList.slice(0, 3).join(' | '),
          'Correlation rule: same-host / in-scope overlap between secrets|jwt and endpoints stores'
        ],
        remediation: [
          'Rotate or revoke the exposed credential immediately',
          'Remove secrets from client-visible storage and ship them only via short-lived server sessions',
          'Enforce authz on the linked endpoints and reject unauthenticated access',
          'Add monitoring for reuse of the rotated secret'
        ],
        sources: items.map(function (x) { return { id: x.id, label: findingLabel(x), url: findingUrl(x) }; }),
        timestamp: Date.now()
      });
    }

    // 2) CORS + cookies (credentialed cross-origin risk signal)
    for (var c = 0; c < cors.length; c++) {
      var corsItem = cors[c];
      var corsLabel = findingLabel(corsItem) + ' ' + safeStr(corsItem.issue || corsItem.detail || corsItem.acaOrigin || '');
      var looksPermissive = /credential|wildcard|\*|null|reflect/i.test(corsLabel + ' ' + JSON.stringify(corsItem).slice(0, 400));
      if (!looksPermissive && cookies.length === 0) continue;
      if (!cookies.length && !looksPermissive) continue;

      var sc2 = maxSeverity([corsItem].concat(cookies.slice(0, 3)));
      if (looksPermissive && cookies.length) {
        if (severityRank(sc2.severity) < severityRank('HIGH')) sc2.severity = 'HIGH';
      }
      var id2 = stableId(['cors-cookies', findingLabel(corsItem), String(cookies.length)]);
      pushCandidate(candidates, {
        kind: CANDIDATE_KIND,
        source: 'correlator',
        id: id2,
        title: 'CORS configuration correlated with cookies',
        severity: sc2.severity,
        cvss: sc2.vector,
        narrative: 'CORS finding "' + findingLabel(corsItem) + '" appears alongside ' + cookies.length +
          ' cookie record(s). If Access-Control-Allow-Credentials is enabled with a loose origin policy, session cookies may be exposed to cross-origin reads.',
        poc: [
          'CORS finding: ' + findingLabel(corsItem),
          'Cookie records in store: ' + cookies.length,
          'Correlation rule: cors store + cookies store co-occurrence'
        ],
        remediation: [
          'Allow only explicit trusted origins (no wildcard with credentials)',
          'Set cookies Secure; Prefer HttpOnly and SameSite=Lax or Strict',
          'Avoid reflecting arbitrary Origin headers when credentials are allowed',
          'Regression-test CORS preflight for untrusted origins'
        ],
        sources: [corsItem].concat(cookies.slice(0, 5)).map(function (x) {
          return { id: x.id, label: findingLabel(x), url: findingUrl(x) };
        }),
        timestamp: Date.now()
      });
    }

    // 3) Forms + endpoints (+ optional cookies)
    for (var f = 0; f < forms.length; f++) {
      var form = forms[f];
      var formUrl = findingUrl(form) || safeStr(form.action);
      var formEps = endpoints.filter(function (ep) {
        var u = findingUrl(ep);
        if (!u || !formUrl) return false;
        return sameHost(u, formUrl) || pathOf(u) === pathOf(formUrl);
      }).slice(0, 5);
      if (!formEps.length) continue;
      var formItems = [form].concat(formEps);
      if (cookies.length) formItems = formItems.concat(cookies.slice(0, 2));
      var sc3 = maxSeverity(formItems);
      var id3 = stableId(['form-endpoint', findingLabel(form), formUrl, formEps.map(findingUrl).join(',')]);
      pushCandidate(candidates, {
        kind: CANDIDATE_KIND,
        source: 'correlator',
        id: id3,
        title: 'Form submission surface linked to endpoints',
        severity: sc3.severity,
        cvss: sc3.vector,
        narrative: 'Form "' + findingLabel(form) + '" correlates with ' + formEps.length +
          ' endpoint(s). Review CSRF protections, authz on the action URL, and whether sensitive cookies ride along.',
        poc: [
          'Form: ' + findingLabel(form) + (formUrl ? ' action=' + formUrl : ''),
          'Linked endpoints: ' + formEps.map(findingUrl).join(' | '),
          'Cookie records present: ' + (cookies.length ? 'yes (' + cookies.length + ')' : 'no')
        ],
        remediation: [
          'Require anti-CSRF tokens or SameSite cookies on state-changing forms',
          'Validate and authorize the form action server-side',
          'Avoid putting secrets in hidden fields; keep them server-side',
          'Rate-limit and lock out abusive form submissions'
        ],
        sources: formItems.map(function (x) { return { id: x.id, label: findingLabel(x), url: findingUrl(x) }; }),
        timestamp: Date.now()
      });
    }

    // 4) GraphQL + auth/secret findings
    if (graphql.length && authLike.length) {
      var g = graphql[0];
      var gItems = [g].concat(authLike.slice(0, 5));
      var sc4 = maxSeverity(gItems);
      var id4 = stableId(['graphql-auth', findingUrl(g) || findingLabel(g), String(authLike.length)]);
      pushCandidate(candidates, {
        kind: CANDIDATE_KIND,
        source: 'correlator',
        id: id4,
        title: 'GraphQL surface with credential-like findings',
        severity: sc4.severity,
        cvss: sc4.vector,
        narrative: 'GraphQL evidence correlates with ' + authLike.length +
          ' secret/JWT finding(s). Confirm introspection is locked down, mutations are authorized, and tokens are not over-privileged.',
        poc: [
          'GraphQL finding: ' + (findingUrl(g) || findingLabel(g)),
          'Auth-like findings counted: ' + authLike.length,
          'Correlation rule: graphql store + secrets|jwt stores'
        ],
        remediation: [
          'Disable introspection and unused mutations in production',
          'Enforce field-level authorization on GraphQL resolvers',
          'Use short-lived tokens with least privilege for API access',
          'Log and alert on anomalous GraphQL query shapes'
        ],
        sources: gItems.map(function (x) { return { id: x.id, label: findingLabel(x), url: findingUrl(x) }; }),
        timestamp: Date.now()
      });
    }

    // 5) Client storage + network paths
    if (storageRows.length && network.length) {
      var netSample = network.slice(0, 8);
      var stSample = storageRows.slice(0, 5);
      var sc5 = maxSeverity(stSample.concat(netSample));
      var id5 = stableId(['storage-network', String(storageRows.length), String(network.length)]);
      pushCandidate(candidates, {
        kind: CANDIDATE_KIND,
        source: 'correlator',
        id: id5,
        title: 'Client storage correlated with network activity',
        severity: sc5.severity,
        cvss: sc5.vector,
        narrative: 'Found ' + storageRows.length + ' client-storage record(s) alongside ' + network.length +
          ' network observation(s). Check whether tokens or PII in storage are replayable against those network targets.',
        poc: [
          'Client storage records: ' + storageRows.length,
          'Network observations: ' + network.length,
          'Sample paths: ' + netSample.slice(0, 3).map(findingUrl).filter(Boolean).join(' | ')
        ],
        remediation: [
          'Prefer memory or httpOnly cookies over localStorage for session material',
          'Encrypt or avoid persisting PII/tokens in client storage',
          'Bind tokens to audience/origin and rotate frequently',
          'Purge storage on logout and idle timeout'
        ],
        sources: stSample.concat(netSample).map(function (x) {
          return { id: x.id, label: findingLabel(x), url: findingUrl(x) };
        }),
        timestamp: Date.now()
      });
    }

    // Dedupe by id
    var byId = {};
    for (var d = 0; d < candidates.length; d++) {
      byId[candidates[d].id] = candidates[d];
    }
    return Object.keys(byId).map(function (k) { return byId[k]; });
  }

  async function persistCandidates(list) {
    for (var i = 0; i < list.length; i++) {
      var row = list[i];
      try {
        await storage.put('meta', row, row.id);
      } catch (e) {}
    }
  }

  async function run() {
    if (running) return { ok: false, reason: 'correlator already running', count: 0, chains: [] };
    running = true;
    try {
      var bundle = await loadBundle();
      var chains = correlate(bundle);
      await clearOwnCandidates();
      await persistCandidates(chains);
      eventBus.emit('correlator:done', { count: chains.length });
      return { ok: true, count: chains.length, chains: chains };
    } catch (e) {
      eventBus.emit('correlator:done', { count: 0, error: safeStr(e && e.message) });
      return { ok: false, count: 0, chains: [], error: safeStr(e && e.message) };
    } finally {
      running = false;
    }
  }

  // Debounced auto-run when findings arrive
  var timer = null;
  eventBus.on('finding:new', function () {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      run().catch(function () {});
    }, 2800);
  });

  mods.correlator = {
    run: run,
    status: function () { return { running: running }; }
  };
  core.correlator = mods.correlator;

  eventBus.emit('correlator:ready', { version: '17.0' });
  if (typeof completion === 'function') completion(true);
})();
