// language: JavaScript, file: 0_orchestrator.js, target: modern browsers
// ReconStrike V17 -- Central Orchestrator (loads before everything)

(function () {
  'use strict';
  if (window.RS_ORCH && window.RS_ORCH.version) return;

  // ══════════════════════════════════════════════════════════════
  // CORE OBJECT
  // ══════════════════════════════════════════════════════════════
  var ORCH = {
    version: '1.0',
    bootAt: Date.now(),

    // ── HOOK MANAGER ──────────────────────────────────────────
    hooks: {
      fetch: { original: null, wrapped: null, subscribers: [] },
      xhr: { original: null, wrapped: null, subscribers: [] },
      ws: { original: null, wrapped: null, subscribers: [] },
      beacon: { original: null, wrapped: null, subscribers: [] },
      eventsource: { original: null, wrapped: null, subscribers: [] }
    },

    registerHook: function (type, id, handlers) {
      var h = this.hooks[type];
      if (!h) return false;
      // deduplicate
      for (var i = 0; i < h.subscribers.length; i++) {
        if (h.subscribers[i].id === id) {
          h.subscribers[i].handlers = handlers || {};
          return true;
        }
      }
      h.subscribers.push({ id: id, handlers: handlers || {} });
      return true;
    },

    unregisterHook: function (type, id) {
      var h = this.hooks[type];
      if (!h) return false;
      for (var i = 0; i < h.subscribers.length; i++) {
        if (h.subscribers[i].id === id) {
          h.subscribers.splice(i, 1);
          return true;
        }
      }
      return false;
    },

    _notify: function (type, phase, ctx) {
      var h = this.hooks[type];
      if (!h) return;
      var subs = h.subscribers.slice(); // snapshot to allow mutation during iteration
      for (var i = 0; i < subs.length; i++) {
        try {
          var fn = subs[i].handlers[phase];
          if (typeof fn === 'function') fn(ctx);
        } catch (e) {}
      }
    },

    // ── SCHEDULER ─────────────────────────────────────────────
    scheduler: {
      queue: [],
      running: null,
      lastFinishAt: 0,
      minGapMs: 150
    },

    schedule: function (name, priority, fn) {
      var self = this;
      return new Promise(function (resolve, reject) {
        self.scheduler.queue.push({
          name: name || 'task',
          priority: typeof priority === 'number' ? priority : 5,
          fn: fn,
          resolve: resolve,
          reject: reject,
          enqueuedAt: Date.now()
        });
        self.scheduler.queue.sort(function (a, b) {
          if (a.priority !== b.priority) return a.priority - b.priority;
          return a.enqueuedAt - b.enqueuedAt;
        });
        self._drainScheduler();
      });
    },

    _drainScheduler: function () {
      var s = this.scheduler;
      if (s.running) return;
      var task = s.queue.shift();
      if (!task) return;
      var self = this;
      var sinceLast = Date.now() - s.lastFinishAt;
      var wait = Math.max(0, s.minGapMs - sinceLast);
      setTimeout(function () {
        s.running = task.name;
        Promise.resolve()
          .then(function () { return task.fn(); })
          .then(function (v) {
            s.running = null;
            s.lastFinishAt = Date.now();
            try { task.resolve(v); } catch (e) {}
            self._drainScheduler();
          })
          .catch(function (e) {
            s.running = null;
            s.lastFinishAt = Date.now();
            try { task.reject(e); } catch (err) {}
            self._drainScheduler();
          });
      }, wait);
    },

    // ── RATE LIMITER ──────────────────────────────────────────
    rateLimiter: {
      tokens: 10,
      maxTokens: 10,
      refillPerSec: 2.5,
      lastRefill: Date.now(),
      waiters: []
    },

    acquireToken: function () {
      var self = this;
      var rl = this.rateLimiter;
      return new Promise(function (resolve) {
        self._refill();
        if (rl.tokens >= 1) {
          rl.tokens -= 1;
          resolve(true);
          return;
        }
        rl.waiters.push(resolve);
        self._flushWaiters();
      });
    },

    _refill: function () {
      var rl = this.rateLimiter;
      var now = Date.now();
      var elapsed = (now - rl.lastRefill) / 1000;
      if (elapsed > 0) {
        rl.tokens = Math.min(rl.maxTokens, rl.tokens + elapsed * rl.refillPerSec);
        rl.lastRefill = now;
      }
    },

    _flushWaiters: function () {
      var self = this;
      this._refill();
      var rl = this.rateLimiter;
      while (rl.waiters.length && rl.tokens >= 1) {
        rl.tokens -= 1;
        var r = rl.waiters.shift();
        try { r(true); } catch (e) {}
      }
      if (rl.waiters.length) {
        setTimeout(function () { self._flushWaiters(); }, 250);
      }
    },

    // Rate-limited fetch -- use this instead of raw fetch
    rfetch: async function (url, opts) {
      await this.acquireToken();
      return fetch(url, opts);
    },

    // ── CONTEXT BUS ───────────────────────────────────────────
    context: {
      target: null,
      stack: {},
      findings: {},
      meta: {}
    },

    setContext: function (key, value) {
      var self = this;
      if (typeof key === 'string') {
        this.context[key] = value;
      } else if (key && typeof key === 'object') {
        Object.keys(key).forEach(function (k) { self.context[k] = key[k]; });
      }
      try {
        window.dispatchEvent(new CustomEvent('rs-orch:context', {
          detail: { phase: 'set', key: key }
        }));
      } catch (e) {}
    },

    getContext: function (key) {
      return key ? this.context[key] : this.context;
    },

    // ── SIGNAL BUS (debounced events) ─────────────────────────
    signalBus: {
      subscribers: new Map(),
      pending: new Map(),
      timer: null,
      windowMs: 1400
    },

    subscribe: function (name, fn) {
      var sb = this.signalBus;
      if (!sb.subscribers.has(name)) sb.subscribers.set(name, []);
      sb.subscribers.get(name).push(fn);
    },

    signal: function (name, data) {
      var sb = this.signalBus;
      var agg = sb.pending.get(name);
      if (!agg) {
        agg = { count: 0, last: null, first: Date.now() };
        sb.pending.set(name, agg);
      }
      agg.count++;
      agg.last = data;
      if (sb.timer) return;
      var self = this;
      sb.timer = setTimeout(function () {
        self._flushSignalBatch();
      }, sb.windowMs);
    },

    _flushSignalBatch: function () {
      var sb = this.signalBus;
      if (sb.timer) {
        clearTimeout(sb.timer);
        sb.timer = null;
      }
      var snapshot = new Map(sb.pending);
      sb.pending.clear();
      var names = [];
      snapshot.forEach(function (agg, n) {
        names.push(n);
        var subs = sb.subscribers.get(n) || [];
        var payload = {
          name: n,
          count: agg.count,
          data: agg.last,
          window: sb.windowMs,
          firstAt: agg.first,
          lastAt: Date.now()
        };
        subs.forEach(function (fn) {
          try { fn(payload); } catch (e) {}
        });
      });
      try {
        window.dispatchEvent(new CustomEvent('rs-orch:batch', {
          detail: { names: names }
        }));
      } catch (e) {}
    },

    flushSignals: function () {
      this._flushSignalBatch();
    },

    // ── HASH 64-BIT ───────────────────────────────────────────
    hash64: function (s) {
      s = String(s);
      var h1 = 0x811c9dc5;
      var h2 = 0x5b1c4e17;
      for (var i = 0; i < s.length; i++) {
        var c = s.charCodeAt(i);
        h1 ^= c;
        h1 = Math.imul(h1, 0x01000193);
        h2 ^= (c + i + 0x9e37);
        h2 = Math.imul(h2, 0x01000193);
      }
      // combine into single base36 string (~64 bits)
      return (h1 >>> 0).toString(36) + '-' + (h2 >>> 0).toString(36);
    },

    // ── CLEANUP REGISTRY ──────────────────────────────────────
    cleanups: [],

    onCleanup: function (fn) {
      if (typeof fn === 'function') this.cleanups.push(fn);
    },

    // ── TEARDOWN ──────────────────────────────────────────────
    teardown: function () {
      var self = this;
      var report = { hooks: [], cleanups: 0, queue: 0, timers: 0 };

      // Restore fetch
      try {
        if (this.hooks.fetch.original && window.fetch === this.hooks.fetch.wrapped) {
          window.fetch = this.hooks.fetch.original;
          report.hooks.push('fetch');
        }
      } catch (e) {}

      // Restore XHR
      try {
        if (this.hooks.xhr.original && window.XMLHttpRequest &&
            XMLHttpRequest.prototype.open === this.hooks.xhr.wrapped) {
          XMLHttpRequest.prototype.open = this.hooks.xhr.original;
          report.hooks.push('xhr');
        }
      } catch (e) {}

      // Restore WebSocket
      try {
        if (this.hooks.ws.original && window.WebSocket === this.hooks.ws.wrapped) {
          window.WebSocket = this.hooks.ws.original;
          report.hooks.push('ws');
        }
      } catch (e) {}

      // Restore Beacon
      try {
        if (this.hooks.beacon.original && navigator.sendBeacon === this.hooks.beacon.wrapped) {
          navigator.sendBeacon = this.hooks.beacon.original;
          report.hooks.push('beacon');
        }
      } catch (e) {}

      // Restore EventSource
      try {
        if (this.hooks.eventsource.original && window.EventSource === this.hooks.eventsource.wrapped) {
          window.EventSource = this.hooks.eventsource.original;
          report.hooks.push('eventsource');
        }
      } catch (e) {}

      // Clear subscribers
      Object.keys(this.hooks).forEach(function (k) {
        self.hooks[k].subscribers = [];
      });

      // Clear scheduler
      report.queue = this.scheduler.queue.length;
      this.scheduler.queue = [];
      this.scheduler.running = null;

      // Clear signal bus timer
      if (this.signalBus.timer) {
        clearTimeout(this.signalBus.timer);
        this.signalBus.timer = null;
        report.timers++;
      }
      this.signalBus.pending.clear();

      // Clear rate limiter waiters
      this.rateLimiter.waiters = [];

      // Run user cleanups
      var c = this.cleanups.slice();
      this.cleanups = [];
      c.forEach(function (fn) {
        try { fn(); report.cleanups++; } catch (e) {}
      });

      return report;
    },

    // ── DIAGNOSTICS ───────────────────────────────────────────
    status: function () {
      var self = this;
      var hookStatus = {};
      Object.keys(this.hooks).forEach(function (k) {
        hookStatus[k] = {
          wrapped: !!self.hooks[k].wrapped,
          subscribers: self.hooks[k].subscribers.length
        };
      });
      return {
        version: self.version,
        bootMs: Date.now() - self.bootAt,
        hooks: hookStatus,
        scheduler: {
          running: self.scheduler.running,
          queued: self.scheduler.queue.length
        },
        rateLimiter: {
          tokens: Math.round(self.rateLimiter.tokens * 10) / 10,
          waiters: self.rateLimiter.waiters.length
        },
        signalBus: {
          pending: self.signalBus.pending.size,
          subscribers: self.signalBus.subscribers.size
        },
        context: Object.keys(self.context),
        cleanups: self.cleanups.length
      };
    },

    // ── HOOK SETUP ────────────────────────────────────────────
    _setupHooks: function () {
      var self = this;

      // ── FETCH ──
      try {
        if (window.fetch && !window.fetch.__rsOrchHooked) {
          var origFetch = window.fetch;
          self.hooks.fetch.original = origFetch;
          var wrappedFetch = async function () {
            var args = Array.prototype.slice.call(arguments);
            var url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
            var method = (args[1] && args[1].method) || 'GET';
            var ctx = {
              url: url,
              method: String(method).toUpperCase(),
              args: args,
              type: 'fetch',
              at: Date.now()
            };
            self._notify('fetch', 'before', ctx);
            var res;
            try {
              res = await origFetch.apply(this, args);
            } catch (err) {
              ctx.error = err;
              self._notify('fetch', 'error', ctx);
              throw err;
            }
            ctx.response = res;
            ctx.ms = Date.now() - ctx.at;
            self._notify('fetch', 'after', ctx);
            return res;
          };
          wrappedFetch.__rsOrchHooked = true;
          window.fetch = wrappedFetch;
          self.hooks.fetch.wrapped = wrappedFetch;
        }
      } catch (e) {}

      // ── XHR ──
      try {
        if (window.XMLHttpRequest && !XMLHttpRequest.prototype.open.__rsOrchHooked) {
          var origOpen = XMLHttpRequest.prototype.open;
          self.hooks.xhr.original = origOpen;
          var wrappedOpen = function (method, url) {
            var xhr = this;
            var ctx = {
              method: String(method || 'GET').toUpperCase(),
              url: String(url),
              xhr: xhr,
              type: 'xhr',
              at: Date.now()
            };
            self._notify('xhr', 'before', ctx);
            try {
              xhr.addEventListener('load', function () {
                ctx.response = {
                  status: xhr.status,
                  len: xhr.responseText ? xhr.responseText.length : 0,
                  headers: (function () {
                    try { return xhr.getAllResponseHeaders() || ''; } catch (e) { return ''; }
                  })(),
                  text: xhr.responseText || ''
                };
                ctx.ms = Date.now() - ctx.at;
                self._notify('xhr', 'after', ctx);
              });
              xhr.addEventListener('error', function () {
                ctx.error = 'xhr-error';
                self._notify('xhr', 'error', ctx);
              });
            } catch (e) {}
            return origOpen.apply(xhr, arguments);
          };
          wrappedOpen.__rsOrchHooked = true;
          XMLHttpRequest.prototype.open = wrappedOpen;
          self.hooks.xhr.wrapped = wrappedOpen;
        }
      } catch (e) {}

      // ── WEBSOCKET ──
      try {
        if (window.WebSocket && !window.WebSocket.__rsOrchHooked) {
          var OrigWS = window.WebSocket;
          self.hooks.ws.original = OrigWS;
          var WrappedWS = function (url, protocols) {
            var ws = new OrigWS(url, protocols);
            var ctx = { url: String(url), ws: ws, type: 'ws', at: Date.now() };
            self._notify('ws', 'open', ctx);
            try {
              ws.addEventListener('close', function () {
                ctx.closedAt = Date.now();
                self._notify('ws', 'close', ctx);
              });
              ws.addEventListener('error', function () {
                ctx.error = 'ws-error';
                self._notify('ws', 'error', ctx);
              });
              ws.addEventListener('message', function (ev) {
                ctx.message = ev.data;
                self._notify('ws', 'message', ctx);
              });
            } catch (e) {}
            try {
              var origSend = ws.send.bind(ws);
              ws.send = function (data) {
                ctx.sent = data;
                self._notify('ws', 'send', ctx);
                return origSend(data);
              };
            } catch (e) {}
            return ws;
          };
          WrappedWS.prototype = OrigWS.prototype;
          WrappedWS.CONNECTING = OrigWS.CONNECTING;
          WrappedWS.OPEN = OrigWS.OPEN;
          WrappedWS.CLOSING = OrigWS.CLOSING;
          WrappedWS.CLOSED = OrigWS.CLOSED;
          WrappedWS.__rsOrchHooked = true;
          window.WebSocket = WrappedWS;
          self.hooks.ws.wrapped = WrappedWS;
        }
      } catch (e) {}

      // ── BEACON ──
      try {
        if (navigator.sendBeacon && !navigator.sendBeacon.__rsOrchHooked) {
          var origBeacon = navigator.sendBeacon.bind(navigator);
          self.hooks.beacon.original = origBeacon;
          var wrappedBeacon = function (url, data) {
            var ctx = { url: String(url), data: data, type: 'beacon', at: Date.now() };
            self._notify('beacon', 'before', ctx);
            var r = origBeacon(url, data);
            self._notify('beacon', 'after', ctx);
            return r;
          };
          wrappedBeacon.__rsOrchHooked = true;
          navigator.sendBeacon = wrappedBeacon;
          self.hooks.beacon.wrapped = wrappedBeacon;
        }
      } catch (e) {}

      // ── EVENTSOURCE ──
      try {
        if (window.EventSource && !window.EventSource.__rsOrchHooked) {
          var OrigES = window.EventSource;
          self.hooks.eventsource.original = OrigES;
          var WrappedES = function (url, cfg) {
            var ctx = { url: String(url), type: 'eventsource', at: Date.now() };
            self._notify('eventsource', 'open', ctx);
            var es = new OrigES(url, cfg);
            try {
              es.addEventListener('message', function (ev) {
                ctx.message = ev.data;
                self._notify('eventsource', 'message', ctx);
              });
              es.addEventListener('error', function () {
                ctx.error = 'es-error';
                self._notify('eventsource', 'error', ctx);
              });
            } catch (e) {}
            return es;
          };
          WrappedES.prototype = OrigES.prototype;
          WrappedES.CONNECTING = OrigES.CONNECTING;
          WrappedES.OPEN = OrigES.OPEN;
          WrappedES.CLOSED = OrigES.CLOSED;
          WrappedES.__rsOrchHooked = true;
          window.EventSource = WrappedES;
          self.hooks.eventsource.wrapped = WrappedES;
        }
      } catch (e) {}
    }
  };

  // ── EXPOSE ──
  window.RS_ORCH = ORCH;

  // ── BOOT HOOKS ──
  try { ORCH._setupHooks(); } catch (e) {}

  // ── SIGNAL ──
  try {
    window.dispatchEvent(new CustomEvent('rs-orch:ready', {
      detail: { version: ORCH.version }
    }));
  } catch (e) {}

  if (typeof completion === 'function') completion(true);
})();