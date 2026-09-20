// language: JavaScript, file: 4_stealth.js, target: modern browsers
// ReconStrike V13.1 -- Layer 4 Stealth (repaired)

(function () {
  'use strict';
  if (!window.ReconCore) return;
  var core = window.ReconCore;
  var eventBus = core.eventBus;
  var storage = core.storage;
  var scope = core.scope;
  var mods = core.modules = core.modules || {};

  // ══════════════════════════════════════════════════════════════
  // MODULE 1 -- Stealth Hook Wrapper
  // Preserves Function.prototype.toString() so hooked functions still
  // appear native to fingerprinting code.
  // ══════════════════════════════════════════════════════════════
  mods.stealth = (function () {
    var nativeToString = Function.prototype.toString;
    var originals = new WeakMap();

    var toStringProxy = new Proxy(nativeToString, {
      apply: function (target, thisArg, args) {
        var real = originals.get(thisArg);
        if (real) return nativeToString.call(real);
        return Reflect.apply(target, thisArg, args);
      }
    });

    try {
      Function.prototype.toString = toStringProxy;
    } catch (e) {}

    var sessionId = (function () {
      var arr = crypto.getRandomValues(new Uint8Array(6));
      var s = '';
      for (var i = 0; i < arr.length; i++) s += arr[i].toString(16).padStart(2, '0');
      return s;
    })();

    function wrap(obj, key, newFn) {
      var original;
      try { original = obj[key]; } catch (e) { return false; }
      if (typeof original !== 'function') return false;
      var proxy;
      try {
        proxy = new Proxy(original, {
          apply: function (target, thisArg, args) {
            return newFn.call(thisArg, target, args);
          },
          construct: function (target, args) {
            return Reflect.construct(target, args);
          }
        });
      } catch (e) { return false; }
      originals.set(proxy, original);
      try {
        Object.defineProperty(obj, key, { value: proxy, writable: true, configurable: true });
      } catch (e) { return false; }
      return true;
    }

    function hide(obj, key) {
      try {
        var d = Object.getOwnPropertyDescriptor(obj, key);
        if (d) Object.defineProperty(obj, key, Object.assign({}, d, { enumerable: false }));
      } catch (e) {}
    }

    return { wrap: wrap, hide: hide, sessionId: sessionId, originals: originals };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 2 -- Anti-Detection Fingerprinting
  // ══════════════════════════════════════════════════════════════
  mods.antiDetect = (function () {
    var enabled = false;
    var replaced = [];

    function neutralise() {
      if (enabled) return { already: true };
      enabled = true;

      try {
        Object.defineProperty(window, 'ReconCore', { enumerable: false, configurable: true, writable: true });
      } catch (e) {}

      try {
        var origGOPN = Object.getOwnPropertyNames;
        var wrapped = new Proxy(origGOPN, {
          apply: function (target, thisArg, args) {
            var res = Reflect.apply(target, thisArg, args);
            if (thisArg === window) {
              return res.filter(function (k) {
                return k !== 'ReconCore' && k.indexOf('rs13_') !== 0 && k.indexOf('__rs') !== 0;
              });
            }
            return res;
          }
        });
        Object.getOwnPropertyNames = wrapped;
        replaced.push('getOwnPropertyNames');
      } catch (e) {}

      try {
        var origQSA = Document.prototype.querySelectorAll;
        var hostId = 'rs13-ui-root';
        var wrappedQSA = function () {
          var res = origQSA.apply(this, arguments);
          try {
            var host = document.getElementById(hostId);
            if (!host) return res;
            var arr = Array.prototype.slice.call(res);
            var filtered = arr.filter(function (el) { return el !== host; });
            if (filtered.length === arr.length) return res;
            return filtered;
          } catch (e) { return res; }
        };
        wrappedQSA.__rsHooked = true;
        Document.prototype.querySelectorAll = wrappedQSA;
        replaced.push('querySelectorAll');
      } catch (e) {}

      try {
        var origPrepare = Error.prepareStackTrace;
        Error.prepareStackTrace = function (err, stack) {
          try {
            var formatted = origPrepare ? origPrepare(err, stack) : String(stack);
            return String(formatted).split('\n').filter(function (l) {
              return !/reconstrike|rs13|ReconCore/i.test(l);
            }).join('\n');
          } catch (e) { return String(stack); }
        };
        replaced.push('prepareStackTrace');
      } catch (e) {}

      eventBus.emit('stealth:antidetect', { replaced: replaced });
      return { ok: true, replaced: replaced };
    }

    function restore() {
      enabled = false;
    }

    return {
      neutralise: neutralise,
      restore: restore,
      enabled: function () { return enabled; },
      replaced: replaced
    };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 3 -- Timing Evasion & Rate Limiter
  // ══════════════════════════════════════════════════════════════
  mods.timing = (function () {
    var config = { minMs: 100, maxMs: 800, enabled: true, maxConcurrent: 3 };
    var active = 0;

    async function gate() {
      if (!config.enabled) return;
      while (active >= config.maxConcurrent) {
        await new Promise(function (r) { setTimeout(r, 25); });
      }
      active++;
      var wait = config.minMs + Math.random() * (config.maxMs - config.minMs);
      await new Promise(function (r) { setTimeout(r, wait); });
    }

    function release() {
      active = Math.max(0, active - 1);
    }

    async function politeFetch(url, opts) {
      await gate();
      try {
        return await fetch(url, opts);
      } finally {
        release();
      }
    }

    function setConfig(c) {
      config = Object.assign({}, config, c || {});
    }

    return {
      politeFetch: politeFetch,
      setConfig: setConfig,
      config: function () { return Object.assign({}, config); },
      active: function () { return active; }
    };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 4 -- Origin Spoof Check (DISABLED)
  // The `Origin` request header is a forbidden header name per the Fetch
  // spec -- the browser strips any value set by JS and replaces it with
  // the page's real origin. Testing CORS reflection requires an external
  // page on a different origin. This module is intentionally disabled.
  // ══════════════════════════════════════════════════════════════
  mods.originSpoof = (function () {
    var CANDIDATE_ORIGINS = [
      'https://evil.com',
      'https://' + scope.currentHost + '.evil.com',
      'https://evil.' + scope.currentHost,
      'null',
      'https://localhost',
      'http://localhost'
    ];

    async function probe(url) {
      return {
        url: url,
        results: [],
        worst: { risk: 'NONE', origin: null, acao: null, acac: null },
        note: 'Origin header is forbidden by Fetch spec from JS. Test CORS externally by loading a page from another origin and issuing a cross-origin fetch with credentials.'
      };
    }

    return { probe: probe, CANDIDATE_ORIGINS: CANDIDATE_ORIGINS, disabled: true };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 5 -- Tab Sync (BroadcastChannel)
  // ══════════════════════════════════════════════════════════════
  mods.tabSync = (function () {
    var channelName = 'rs13:' + scope.currentHost;
    var ch = null;
    var peers = new Set();
    var heartbeatId = null;

    var tabId = (function () {
      var arr = crypto.getRandomValues(new Uint8Array(4));
      var s = '';
      for (var i = 0; i < arr.length; i++) s += arr[i].toString(16).padStart(2, '0');
      return s;
    })();

    function start() {
      if (!('BroadcastChannel' in window)) return { ok: false, reason: 'no BroadcastChannel' };
      if (ch) return { ok: true, tabId: tabId, channel: channelName };

      try {
        ch = new BroadcastChannel(channelName);
      } catch (e) { return { ok: false, error: e.message }; }

      ch.onmessage = async function (ev) {
        var d = ev.data || {};
        if (!d.kind || d.from === tabId) return;

        if (d.kind === 'heartbeat') {
          peers.add(d.from);
          try { ch.postMessage({ from: tabId, kind: 'heartbeat-ack', payload: { t: Date.now() } }); } catch (e) {}
        } else if (d.kind === 'heartbeat-ack') {
          peers.add(d.from);
        } else if (d.kind === 'finding') {
          peers.add(d.from);
          try {
            await storage.put('meta', {
              kind: 'finding-from-peer',
              peer: d.from,
              payload: d.payload
            }, 'peer::' + d.from + '::' + Date.now());
          } catch (e) {}
          eventBus.emit('tabsync:finding', { peer: d.from, payload: d.payload });
        } else if (d.kind === 'state-req') {
          peers.add(d.from);
          try {
            var eps = await storage.getAll('endpoints');
            ch.postMessage({
              from: tabId,
              kind: 'state-res',
              payload: { endpoints: eps.slice(-200) }
            });
          } catch (e) {}
        } else if (d.kind === 'state-res') {
          peers.add(d.from);
        }
      };

      heartbeatId = setInterval(function () {
        try {
          ch.postMessage({ from: tabId, kind: 'heartbeat', payload: { url: location.href, t: Date.now() } });
        } catch (e) {}
      }, 15000);

      eventBus.on('finding:new', function (f) {
        try { ch && ch.postMessage({ from: tabId, kind: 'finding', payload: f }); } catch (e) {}
      });

      return { ok: true, tabId: tabId, channel: channelName };
    }

    function stop() {
      if (heartbeatId) { clearInterval(heartbeatId); heartbeatId = null; }
      if (ch) { try { ch.close(); } catch (e) {} ch = null; }
      peers.clear();
    }

    function broadcast(kind, payload) {
      try { ch && ch.postMessage({ from: tabId, kind: kind, payload: payload }); } catch (e) {}
    }

    function peersList() { return Array.from(peers); }

    return { start: start, stop: stop, broadcast: broadcast, peers: peersList, tabId: tabId };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 6 -- Passive Capture via Service Worker (documented as blocked)
  // Blob-backed Service Workers are not permitted by the W3C SW spec.
  // Real SW registration requires a same-origin script file. This module
  // exists only to expose the constraint cleanly to the operator.
  // ══════════════════════════════════════════════════════════════
  mods.swCapture = (function () {
    async function register() {
      if (!('serviceWorker' in navigator)) return { ok: false, reason: 'serviceWorker unsupported' };
      if (location.protocol !== 'https:') return { ok: false, reason: 'insecure origin (https required)' };
      return {
        ok: false,
        reason: 'blob-service-worker forbidden by spec',
        hint: 'To enable passive capture, host a real file at https://' + scope.currentHost + '/rs13-sw.js and register it manually.'
      };
    }

    async function dump() {
      return { ok: false, reason: 'not registered' };
    }

    return { register: register, dump: dump };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 7 -- DOM Obfuscation
  // ══════════════════════════════════════════════════════════════
  mods.domObf = (function () {
    function rnd(n) {
      n = n || 8;
      var arr = crypto.getRandomValues(new Uint8Array(n));
      var s = '';
      for (var i = 0; i < arr.length; i++) s += arr[i].toString(16).padStart(2, '0');
      return s;
    }

    function randomizeAttrs(el) {
      if (!el || typeof el.setAttribute !== 'function') return;
      try {
        el.setAttribute('data-rs', rnd(6));
        el.setAttribute('aria-hidden', 'true');
        el.setAttribute('role', 'presentation');
        var oldId = el.getAttribute('id');
        if (oldId && /rs13|reconstrike/i.test(oldId)) el.removeAttribute('id');
      } catch (e) {}
    }

    function sweep(root) {
      if (!root || typeof root.querySelectorAll !== 'function') return 0;
      var n = 0;
      try {
        root.querySelectorAll('[id*="rs13"], [id*="reconstrike"], [class*="rs13"]').forEach(function (el) {
          randomizeAttrs(el);
          n++;
        });
      } catch (e) {}
      return n;
    }

    return { randomizeAttrs: randomizeAttrs, sweep: sweep, rnd: rnd };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 8 -- Detection Sensor (WAF / Bot Detection Feedback)
  // ══════════════════════════════════════════════════════════════
  mods.detector = (function () {
    var signals = [];

    var detectors = [
      { name: 'Cloudflare Bot Mgmt', test: function () { return !!document.querySelector('#challenge-form, #cf-challenge-running, [data-cf-chl]'); } },
      { name: 'DataDome',            test: function () { return !!document.querySelector('iframe[src*="datadome"], script[src*="datadome"]'); } },
      { name: 'PerimeterX',          test: function () { return !!window._pxAppId || !!document.querySelector('script[src*="perimeterx"]'); } },
      { name: 'Akamai BMP',          test: function () { return !!(window._abck || window.bmak); } },
      { name: 'reCAPTCHA',           test: function () { return !!document.querySelector('iframe[src*="recaptcha"], script[src*="recaptcha"]'); } },
      { name: 'hCaptcha',            test: function () { return !!document.querySelector('script[src*="hcaptcha"]'); } },
      { name: 'Turnstile',           test: function () { return !!document.querySelector('script[src*="challenges.cloudflare.com"]'); } },
      { name: 'FingerprintJS',       test: function () { return !!window.Fingerprint || !!document.querySelector('script[src*="fingerprintjs"]'); } }
    ];

    function scan() {
      signals = [];
      detectors.forEach(function (d) {
        try {
          if (d.test()) signals.push({ name: d.name, present: true, t: Date.now() });
        } catch (e) {}
      });
      if (signals.length) eventBus.emit('detector:hit', signals);
      return signals;
    }

    function watchResponses() {
      var origFetch = window.fetch;
      if (!origFetch || origFetch.__rsDetectorHooked) return { 403: 0, 429: 0, 503: 0 };
      var counts = { 403: 0, 429: 0, 503: 0 };
      var wrapped = async function () {
        var r = await origFetch.apply(this, arguments);
        if (counts[r.status] !== undefined) {
          counts[r.status]++;
          if (counts[r.status] === 5) eventBus.emit('detector:spike', { status: r.status, count: counts[r.status] });
        }
        return r;
      };
      wrapped.__rsDetectorHooked = true;
      window.fetch = wrapped;
      return counts;
    }

    return {
      scan: scan,
      watchResponses: watchResponses,
      signals: function () { return signals.slice(); }
    };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 9 -- Session Orchestrator
  // ══════════════════════════════════════════════════════════════
  mods.orchestrator = (function () {
    var booted = false;
    var sweepId = null;

    async function boot(opts) {
      opts = opts || {};
      if (booted) return { ok: false, reason: 'already booted' };
      booted = true;

      if (opts.antidetect !== false && mods.antiDetect) mods.antiDetect.neutralise();
      if (opts.tabSync !== false && mods.tabSync) mods.tabSync.start();
      if (opts.timing !== false && mods.timing) {
        mods.timing.setConfig({ minMs: 120, maxMs: 900, maxConcurrent: 2 });
      }

      if (mods.detector) {
        mods.detector.watchResponses();
        mods.detector.scan();
      }

      sweepId = setInterval(function () {
        if (mods.domObf && document.body) mods.domObf.sweep(document.body);
      }, 5000);

      eventBus.emit('orchestrator:booted', { ts: Date.now() });
      return { ok: true, sessionId: mods.stealth.sessionId, tabId: mods.tabSync.tabId };
    }

    function status() {
      return {
        booted: booted,
        sessionId: mods.stealth.sessionId,
        peers: mods.tabSync.peers(),
        timing: mods.timing.config(),
        detectors: mods.detector.signals().length,
        antidetect: mods.antiDetect.enabled()
      };
    }

    return { boot: boot, status: status };
  })();

  // ══════════════════════════════════════════════════════════════
  // PUBLIC SURFACE
  // ══════════════════════════════════════════════════════════════
  core.stealth = {
    boot: function (opts) { return mods.orchestrator.boot(opts); },
    status: function () { return mods.orchestrator.status(); },
    anti: function () { return mods.antiDetect.neutralise(); },
    timing: function (c) { return mods.timing.setConfig(c); },
    origin: function (url) { return mods.originSpoof.probe(url); },
    capture: function () { return mods.swCapture.register(); },
    dump: function () { return mods.swCapture.dump(); },
    tabs: function () { return mods.tabSync.peers(); },
    detect: function () { return mods.detector.scan(); },
    session: function () { return mods.stealth.sessionId; }
  };

  eventBus.emit('stealth:ready', {
    modules: ['stealth', 'antiDetect', 'timing', 'originSpoof', 'tabSync', 'swCapture', 'domObf', 'detector', 'orchestrator']
  });

  if (typeof completion === 'function') completion(true);
})();