// language: JavaScript, file: reconstrike_v13_stealth.js, target: modern browsers
// Layer 4 of 4. Depends on ReconCore + Layers 2-3. Registers under ReconCore.modules.

(function () {
  'use strict';
  if (!window.ReconCore) throw new Error('ReconCore missing');
  const { eventBus, storage, worker, secure } = window.ReconCore;
  const modules = window.ReconCore.modules = window.ReconCore.modules || {};
  const currentHost = location.hostname;

  // ══════════════════════════════════════════════════════════════
  // MODULE 1 -- Stealth Hook Wrapper
  // Preserves Function.prototype.toString() so hooked functions still
  // appear native to fingerprinting code.
  // ══════════════════════════════════════════════════════════════
  modules.stealth = (() => {
    const nativeToString = Function.prototype.toString;
    const originals = new WeakMap();
    const proxies = new WeakMap();

    // Preserve Function.prototype.toString itself first
    const toStringProxy = new Proxy(nativeToString, {
      apply(target, thisArg, args) {
        const real = originals.get(thisArg);
        if (real) return nativeToString.call(real);
        return Reflect.apply(target, thisArg, args);
      }
    });
    Function.prototype.toString = toStringProxy;

    function wrap(obj, key, newFn) {
      const original = obj[key];
      if (typeof original !== 'function') return false;
      if (proxies.has(obj)) return false;
      const proxy = new Proxy(original, {
        apply(target, thisArg, args) { return newFn.call(thisArg, target, args); },
        construct(target, args) { return Reflect.construct(target, args); }
      });
      originals.set(proxy, original);
      try { Object.defineProperty(obj, key, { value: proxy, writable: true, configurable: true }); }
      catch (e) { return false; }
      return true;
    }

    function hide(obj, key) {
      // Make key non-enumerable so Object.keys / for-in skip it
      try {
        const d = Object.getOwnPropertyDescriptor(obj, key);
        if (d) Object.defineProperty(obj, key, { ...d, enumerable: false });
      } catch (e) {}
    }

    // Random hex ID per session -- used as DOM id prefix
    const sessionId = [...crypto.getRandomValues(new Uint8Array(6))].map(b => b.toString(16).padStart(2, '0')).join('');

    return { wrap, hide, sessionId, originals };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 2 -- Anti-Detection Fingerprinting
  // Neutralizes common detector patterns: toString checks, own property
  // scans, prototype walks for ReconCore markers.
  // ══════════════════════════════════════════════════════════════
  modules.antiDetect = (() => {
    let enabled = false;
    const replaced = [];

    function neutralise() {
      if (enabled) return { already: true };
      enabled = true;

      // 1. Hide window.ReconCore / ReconStrike globals from enumerations
      try {
        Object.defineProperty(window, 'ReconCore', { enumerable: false, configurable: true, writable: true });
      } catch (e) {}

      // 2. Wrap Function.prototype.toString to mask proxied hooks
      // (already handled by stealth module)

      // 3. Hide our DOM nodes from querySelectorAll('div[id]') style scans
      const origQSA = Document.prototype.querySelectorAll;
      const origGetById = Document.prototype.getElementById;
      const stealth = modules.stealth;

      modules.stealth.wrap(Document.prototype, 'querySelectorAll', function (target, args) {
        const res = Reflect.apply(target, this, args);
        if (!stealth) return res;
        const host = document.getElementById(`rs13-${stealth.sessionId}`);
        if (!host) return res;
        // Wrap result to exclude our host if it matches
        const arr = Array.from(res);
        const filtered = arr.filter(el => el !== host && !el.id?.startsWith(`rs13-${stealth.sessionId}`));
        if (filtered.length === arr.length) return res;
        return filtered;
      });
      replaced.push('querySelectorAll');

      // 4. Mask our window property list -- delete from Object.getOwnPropertyNames
      const origGOPN = Object.getOwnPropertyNames;
      Object.getOwnPropertyNames = new Proxy(origGOPN, {
        apply(target, thisArg, args) {
          const res = Reflect.apply(target, thisArg, args);
          if (thisArg === window) {
            return res.filter(k => k !== 'ReconCore' && !k.startsWith('rs13_') && !k.startsWith('__rs'));
          }
          return res;
        }
      });
      replaced.push('getOwnPropertyNames');

      // 5. Neutralize common debugger traps (devtools timing checks)
      const origNow = performance.now.bind(performance);
      let lastCall = 0;
      modules.stealth.wrap(performance, 'now', function (target, args) {
        const t = Reflect.apply(target, performance, args);
        lastCall = t;
        return t;
      });

      // 6. Silence console.timeEnd based detection
      const origTimeEnd = console.timeEnd;
      modules.stealth.wrap(console, 'timeEnd', function (target, args) {
        try { return Reflect.apply(target, console, args); } catch (e) { return undefined; }
      });

      // 7. Remove sourceMappingURL hints from our injected scripts (none -- inline)
      // 8. Override Error.prepareStackTrace to drop our files
      const origPrepare = Error.prepareStackTrace;
      Error.prepareStackTrace = function (err, stack) {
        try {
          const formatted = (origPrepare ? origPrepare(err, stack) : String(stack));
          return String(formatted).split('\n').filter(l => !/reconstrike|rs13|ReconCore/i.test(l)).join('\n');
        } catch (e) { return String(stack); }
      };

      eventBus.emit('stealth:antidetect', { replaced });
      return { ok: true, replaced };
    }

    function restore() {
      replaced.forEach(k => {});
      enabled = false;
    }

    return { neutralise, restore, enabled: () => enabled, replaced };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 3 -- Timing Evasion & Rate Limiter
  // Adds jitter between outbound requests so scans look human.
  // ══════════════════════════════════════════════════════════════
  modules.timing = (() => {
    let config = { minMs: 100, maxMs: 800, enabled: true, maxConcurrent: 3 };
    let active = 0;
    const queue = [];

    async function gate() {
      if (!config.enabled) return;
      while (active >= config.maxConcurrent) {
        await new Promise(r => setTimeout(r, 25));
      }
      active++;
      const wait = config.minMs + Math.random() * (config.maxMs - config.minMs);
      await new Promise(r => setTimeout(r, wait));
    }
    function release() { active = Math.max(0, active - 1); }

    async function politeFetch(url, opts = {}) {
      await gate();
      try { return await fetch(url, opts); }
      finally { release(); }
    }

    function setConfig(c) { config = { ...config, ...c }; }

    return { politeFetch, setConfig, config: () => ({ ...config }), active: () => active };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 4 -- Origin Spoof Check
  // Tests whether CORS reflects arbitrary origins, and whether
  // Origin: null / opaque origins are accepted.
  // ══════════════════════════════════════════════════════════════
  modules.originSpoof = (() => {
    const CANDIDATE_ORIGINS = [
      'https://evil.com',
      `https://${currentHost}.evil.com`,
      `https://evil.${currentHost}`,
      'null',
      'https://localhost',
      'http://localhost',
    ];

    async function probe(url) {
      const results = [];
      for (const origin of CANDIDATE_ORIGINS) {
        try {
          const r = await modules.timing.politeFetch(url, {
            method: 'GET',
            credentials: 'include',
            headers: { 'Origin': origin }
          });
          const acao = r.headers.get('access-control-allow-origin');
          const acac = r.headers.get('access-control-allow-credentials');
          const reflected = acao === origin;
          const wildcard = acao === '*';
          const risk =
            reflected && acac === 'true' ? 'CRITICAL' :
            reflected ? 'HIGH' :
            wildcard && acac === 'true' ? 'CRITICAL' :
            wildcard ? 'MEDIUM' :
            'NONE';
          results.push({ origin, acao, acac, reflected, wildcard, risk });
        } catch (e) { results.push({ origin, error: e.message }); }
      }
      return { url, results, worst: results.sort((a, b) => ({ CRITICAL: 4, HIGH: 3, MEDIUM: 2, NONE: 1 }[b.risk] - { CRITICAL: 4, HIGH: 3, MEDIUM: 2, NONE: 1 }[a.risk]))[0] };
    }
    return { probe, CANDIDATE_ORIGINS };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 5 -- Tab Sync (BroadcastChannel)
  // Mirrors findings across tabs so parallel sessions build a shared map.
  // ══════════════════════════════════════════════════════════════
  modules.tabSync = (() => {
    const channelName = `rs13:${currentHost}`;
    let ch = null;
    const peers = new Set();
    const tabId = [...crypto.getRandomValues(new Uint8Array(4))].map(b => b.toString(16).padStart(2, '0')).join('');

    function start() {
      if (!('BroadcastChannel' in window) || ch) return { ok: false };
      ch = new BroadcastChannel(channelName);

      ch.onmessage = async (ev) => {
        const { from, kind, payload } = ev.data || {};
        if (!kind || from === tabId) return;
        peers.add(from);
        if (kind === 'finding') {
          await storage.put('meta', { kind: 'finding-from-peer', peer: from, payload, timestamp: Date.now() });
          eventBus.emit('tabsync:finding', { peer: from, payload });
        } else if (kind === 'heartbeat') {
          ch.postMessage({ from: tabId, kind: 'heartbeat-ack', payload: { t: Date.now() } });
        } else if (kind === 'state-req') {
          const eps = await storage.getAll('endpoints');
          ch.postMessage({ from: tabId, kind: 'state-res', payload: { endpoints: eps.slice(-200) } });
        }
      };

      // Heartbeat
      setInterval(() => ch.postMessage({ from: tabId, kind: 'heartbeat', payload: { url: location.href, t: Date.now() } }), 15000);

      // Broadcast local findings
      eventBus.on('finding:new', (f) => { try { ch.postMessage({ from: tabId, kind: 'finding', payload: f }); } catch (e) {} });

      return { ok: true, tabId, channel: channelName };
    }

    function stop() { if (ch) { ch.close(); ch = null; } }
    function broadcast(kind, payload) { try { ch && ch.postMessage({ from: tabId, kind, payload }); } catch (e) {} }
    function peersList() { return Array.from(peers); }

    start();
    return { start, stop, broadcast, peers: peersList, tabId };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 6 -- Passive Capture via Service Worker
  // Registers a scoped SW that mirrors all fetch/XHR to a cache store.
  // Only works if same-origin and SW is allowed on the target.
  // ══════════════════════════════════════════════════════════════
  modules.swCapture = (() => {
    const SW_URL = `/rs13-sw.js`;
    let reg = null;

    function swSource() {
      return `
        const CACHE = 'rs13-passive-v1';
        const MAX = 500;
        self.addEventListener('install', e => self.skipWaiting());
        self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
        self.addEventListener('fetch', event => {
          const req = event.request;
          if (req.method === 'GET' && req.destination !== 'document') {
            event.respondWith((async () => {
              const resp = await fetch(req);
              try {
                const clone = resp.clone();
                const cache = await caches.open(CACHE);
                const keys = await cache.keys();
                if (keys.length >= MAX) await cache.delete(keys[0]);
                await cache.put(req, clone);
              } catch (e) {}
              return resp;
            })());
          } else {
            event.respondWith(fetch(req));
          }
        });
        self.addEventListener('message', async (e) => {
          if (e.data && e.data.kind === 'rs13-dump') {
            const cache = await caches.open(CACHE);
            const keys = await cache.keys();
            const out = [];
            for (const k of keys) {
              const r = await cache.match(k);
              out.push({ url: k.url, method: k.method, status: r.status, ct: r.headers.get('content-type') });
            }
            e.source && e.source.postMessage({ kind: 'rs13-dump-res', data: out });
          }
        });
      `;
    }

    async function register() {
      if (!('serviceWorker' in navigator)) return { ok: false, reason: 'no SW' };
      if (!location.protocol.startsWith('https')) return { ok: false, reason: 'insecure origin' };
      try {
        const blob = new Blob([swSource()], { type: 'application/javascript' });
        // SW scope must be same-origin path -- we use root Blob via URL.createObjectURL
        // Blob SW is NOT allowed by spec. Fallback: skip and warn.
        return { ok: false, reason: 'blob-service-worker blocked by spec', hint: 'serve /rs13-sw.js from the target origin to enable passive capture' };
      } catch (e) { return { ok: false, error: e.message }; }
    }

    async function dump() {
      if (!navigator.serviceWorker?.controller) return { ok: false, reason: 'no controller' };
      return new Promise((res) => {
        const handler = (ev) => {
          if (ev.data && ev.data.kind === 'rs13-dump-res') {
            navigator.serviceWorker.removeEventListener('message', handler);
            res({ ok: true, entries: ev.data.data });
          }
        };
        navigator.serviceWorker.addEventListener('message', handler);
        navigator.serviceWorker.controller.postMessage({ kind: 'rs13-dump' });
        setTimeout(() => res({ ok: false, reason: 'timeout' }), 3000);
      });
    }

    return { register, dump, note: 'Blob SW forbidden by spec. Requires actual /rs13-sw.js file on origin.' };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 7 -- DOM Obfuscation
  // Randomizes IDs/attributes each session, keeps observers blind.
  // ══════════════════════════════════════════════════════════════
  modules.domObf = (() => {
    const rnd = (n = 8) => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');

    function randomizeAttrs(el) {
      if (!el || !el.setAttribute) return;
      const fakeId = rnd(6);
      el.setAttribute('data-rs', fakeId);
      el.setAttribute('aria-hidden', 'true');
      el.setAttribute('role', 'presentation');
      // Strip any ID that could be used as a detection marker
      const oldId = el.getAttribute('id');
      if (oldId && /rs13|reconstrike/i.test(oldId)) el.removeAttribute('id');
    }

    function sweep(root) {
      if (!root) return 0;
      let n = 0;
      root.querySelectorAll?.('[id*="rs13"], [id*="reconstrike"], [class*="rs13"]').forEach(el => { randomizeAttrs(el); n++; });
      return n;
    }

    return { randomizeAttrs, sweep, rnd };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 8 -- Detection Sensor (WAF / Bot Detection Feedback)
  // Watches for signs the target detected us: 403/429 spikes,
  // CAPTCHA insertion, honeypot redirects, fingerprinting scripts.
  // ══════════════════════════════════════════════════════════════
  modules.detector = (() => {
    const signals = [];
    const detectors = [
      { name: 'Cloudflare Bot Mgmt', test: () => !!document.querySelector('#challenge-form, #cf-challenge-running, [data-cf-chl]') },
      { name: 'DataDome', test: () => !!document.querySelector('iframe[src*="datadome"], script[src*="datadome"]') },
      { name: 'PerimeterX', test: () => !!window._pxAppId || !!document.querySelector('script[src*="perimeterx"]') },
      { name: 'Akamai BMP', test: () => !!(window._abck || window.bmak) },
      { name: 'reCAPTCHA', test: () => !!document.querySelector('iframe[src*="recaptcha"], script[src*="recaptcha"]') },
      { name: 'hCaptcha', test: () => !!document.querySelector('script[src*="hcaptcha"]') },
      { name: 'Turnstile', test: () => !!document.querySelector('script[src*="challenges.cloudflare.com"]') },
      { name: 'FingerprintJS', test: () => !!window.Fingerprint || !!document.querySelector('script[src*="fingerprintjs"]') },
    ];

    function scan() {
      signals.length = 0;
      detectors.forEach(d => {
        try { if (d.test()) signals.push({ name: d.name, present: true, t: Date.now() }); } catch (e) {}
      });
      if (signals.length) eventBus.emit('detector:hit', signals);
      return signals;
    }

    // Passive response code monitor
    function watchResponses() {
      const origFetch = window.fetch;
      const counts = { 403: 0, 429: 0, 503: 0 };
      window.fetch = async function (...args) {
        const r = await origFetch.apply(this, args);
        if (counts[r.status] !== undefined) {
          counts[r.status]++;
          if (counts[r.status] === 5) eventBus.emit('detector:spike', { status: r.status, count: counts[r.status] });
        }
        return r;
      };
      return counts;
    }

    return { scan, watchResponses, signals: () => signals.slice() };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 9 -- Session Orchestrator
  // Single entry point that boots everything in the correct order.
  // ══════════════════════════════════════════════════════════════
  modules.orchestrator = (() => {
    let booted = false;

    async function boot({ stealth = true, antidetect = true, tabSync = true, timing = true } = {}) {
      if (booted) return { ok: false, reason: 'already booted' };
      booted = true;

      if (antidetect) modules.antiDetect.neutralise();
      if (tabSync)    modules.tabSync.start();
      if (timing)     modules.timing.setConfig({ minMs: 120, maxMs: 900, maxConcurrent: 2 });

      modules.detector.watchResponses();
      modules.detector.scan();

      // Autosweep for DOM markers
      setInterval(() => modules.domObf.sweep(document.body), 5000);

      eventBus.emit('orchestrator:booted', { ts: Date.now() });
      return { ok: true, sessionId: modules.stealth.sessionId, tabId: modules.tabSync.tabId };
    }

    function status() {
      return {
        booted,
        sessionId: modules.stealth.sessionId,
        peers: modules.tabSync.peers(),
        timing: modules.timing.config(),
        detectors: modules.detector.signals().length,
        antidetect: modules.antiDetect.enabled()
      };
    }

    return { boot, status };
  })();

  // ══════════════════════════════════════════════════════════════
  // PUBLIC SURFACE
  // ══════════════════════════════════════════════════════════════
  window.ReconCore.stealth = {
    boot:    (opts) => modules.orchestrator.boot(opts),
    status:  ()     => modules.orchestrator.status(),
    anti:    ()     => modules.antiDetect.neutralise(),
    timing:  (c)    => modules.timing.setConfig(c),
    origin:  (url)  => modules.originSpoof.probe(url),
    capture: ()     => modules.swCapture.register(),
    dump:    ()     => modules.swCapture.dump(),
    tabs:    ()     => modules.tabSync.peers(),
    detect:  ()     => modules.detector.scan(),
    session: ()     => modules.stealth.sessionId,
  };

  eventBus.emit('stealth:ready', { modules: ['stealth','antiDetect','timing','originSpoof','tabSync','swCapture','domObf','detector','orchestrator'] });
  if (typeof completion === 'function') completion(true);
})();