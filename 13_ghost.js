// language: JavaScript, file: 13_ghost.js, target: modern browsers
// GHOST -- anti-forensics, timer management, selective cleanup

(function () {
  'use strict';
  if (!window.ReconCore) return;
  var core = window.ReconCore;
  var eventBus = core.eventBus;
  var storage = core.storage;
  var mods = core.modules = core.modules || {};

  // ══════════════════════════════════════════════════════════════
  // TIMER REGISTRY
  // ══════════════════════════════════════════════════════════════
  var timers = new Set();
  var intervals = new Set();

  function safeTimeout(fn, ms) {
    var id = setTimeout(function () {
      timers.delete(id);
      try { fn(); } catch (e) {}
    }, ms);
    timers.add(id);
    return id;
  }

  function safeInterval(fn, ms) {
    var id = setInterval(function () {
      try { fn(); } catch (e) {}
    }, ms);
    intervals.add(id);
    return id;
  }

  function clearAll() {
    var n = 0;
    timers.forEach(function (id) { clearTimeout(id); n++; });
    intervals.forEach(function (id) { clearInterval(id); n++; });
    timers.clear();
    intervals.clear();
    return { cleared: n };
  }

  function timerStatus() {
    return { timeouts: timers.size, intervals: intervals.size };
  }

  // ══════════════════════════════════════════════════════════════
  // SELECTIVE CLEANUP
  // ══════════════════════════════════════════════════════════════
  var ALL_STORES = [
    'endpoints', 'secrets', 'cors', 'jwt', 'forms', 'cookies', 'sri',
    'sw', 'srcmaps', 'storage', 'network', 'graphql', 'meta', 'payloads', 'targets'
  ];

  async function wipeStores(opts) {
    opts = opts || {};
    var targets = opts.stores || ALL_STORES;
    var cleared = {};
    for (var i = 0; i < targets.length; i++) {
      try {
        await storage.clear(targets[i]);
        cleared[targets[i]] = true;
      } catch (e) {
        cleared[targets[i]] = false;
      }
    }
    return { ok: true, cleared: cleared };
  }

  async function wipeByKind(kind) {
    if (!kind) return { ok: false, reason: 'no kind' };
    var rows;
    try { rows = await storage.getAll('meta'); }
    catch (e) { rows = []; }
    var toDelete = rows.filter(function (r) { return r && r.kind === kind; });
    for (var i = 0; i < toDelete.length; i++) {
      try { await storage.remove('meta', toDelete[i].id); } catch (e) {}
    }
    return { ok: true, kind: kind, removed: toDelete.length };
  }

  async function wipeAll() {
    return wipeStores({});
  }

  // ══════════════════════════════════════════════════════════════
  // SCRUB -- remove identifying traces from this browser
  // ══════════════════════════════════════════════════════════════
  async function scrub() {
    var removed = { config: false, localStorage: 0, cacheAPI: 0, dom: 0 };

    // 1. Remove companion config
    try {
      localStorage.removeItem('rs13_companion');
      removed.config = true;
    } catch (e) {}

    // 2. Remove rs13_* / reconstrike* keys from localStorage
    try {
      var toRemove = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && /rs13_|reconstrike/i.test(k)) toRemove.push(k);
      }
      for (var j = 0; j < toRemove.length; j++) {
        try { localStorage.removeItem(toRemove[j]); removed.localStorage++; } catch (e) {}
      }
    } catch (e) {}

    // 3. Clear Cache API entries we created
    if (typeof caches !== 'undefined' && caches && typeof caches.keys === 'function') {
      try {
        var names = await caches.keys();
        var ours = names.filter(function (n) { return /rs13|reconstrike/i.test(n); });
        for (var c = 0; c < ours.length; c++) {
          try { await caches.delete(ours[c]); removed.cacheAPI++; } catch (e) {}
        }
      } catch (e) {}
    }

    // 4. Remove DOM elements we created
    try {
      var ourHosts = document.querySelectorAll('[id*="rs13"], [id*="reconstrike"], [data-rs]');
      for (var d = 0; d < ourHosts.length; d++) {
        var el = ourHosts[d];
        if (el && el.parentNode) {
          el.parentNode.removeChild(el);
          removed.dom++;
        }
      }
    } catch (e) {}

    return { ok: true, removed: removed };
  }

  // ══════════════════════════════════════════════════════════════
  // WITHDRAW -- stop everything, scrub, optionally wipe, remove tool
  // ══════════════════════════════════════════════════════════════
  async function withdraw(opts) {
    opts = opts || {};
    var report = {
      timers: null,
      modules: [],
      scrub: null,
      wipe: null,
      globals: false,
      errors: []
    };

    // 1. Stop our own timers first
    try { report.timers = clearAll(); }
    catch (e) { report.errors.push('clearTimers: ' + e.message); }

    // 2. Stop running modules
    function tryStop(name, fn) {
      try { fn(); report.modules.push(name); }
      catch (e) { report.errors.push(name + ': ' + e.message); }
    }

    if (mods.scheduler && typeof mods.scheduler.stop === 'function') {
      tryStop('scheduler', mods.scheduler.stop);
    }
    if (mods.tabSync && typeof mods.tabSync.stop === 'function') {
      tryStop('tabSync', mods.tabSync.stop);
    }
    if (mods.remote && typeof mods.remote.stopPolling === 'function') {
      tryStop('remote', mods.remote.stopPolling);
    }
    if (mods.pulsar && typeof mods.pulsar.stop === 'function') {
      tryStop('pulsar', mods.pulsar.stop);
    }
    if (mods.argus && typeof mods.argus.stop === 'function') {
      tryStop('argus', mods.argus.stop);
    }
    if (mods.crawler && typeof mods.crawler.abort === 'function') {
      tryStop('crawler', mods.crawler.abort);
    }
    if (mods.worker && typeof mods.worker.terminate === 'function') {
      tryStop('worker', mods.worker.terminate);
    }

    // 3. Scrub traces (unless explicitly disabled)
    if (opts.scrub !== false) {
      try { report.scrub = await scrub(); }
      catch (e) { report.errors.push('scrub: ' + e.message); }
    }

    // 4. Wipe stores (only if requested)
    if (opts.wipe === true) {
      try { report.wipe = await wipeAll(); }
      catch (e) { report.errors.push('wipe: ' + e.message); }
    }

    // 5. Null out globals
    try {
      window.ReconCore = undefined;
      window.__RS13_UI__ = undefined;
      window.__RS13_SCANNER__ = undefined;
      window.__RS13_LOADED__ = undefined;
      window.__RS13_START__ = undefined;
      window.__RS13_READY__ = undefined;
      window.renderActiveTab = undefined;
      report.globals = true;
    } catch (e) {
      report.errors.push('globals: ' + e.message);
    }

    // Emit before we null everything useful
    try { eventBus.emit('ghost:withdraw', report); } catch (e) {}

    return { ok: true, report: report };
  }

  // ══════════════════════════════════════════════════════════════
  // STORAGE AUDIT
  // ══════════════════════════════════════════════════════════════
  async function audit() {
    var counts = {};
    var total = 0;
    for (var i = 0; i < ALL_STORES.length; i++) {
      var s = ALL_STORES[i];
      try {
        var c = await storage.count(s);
        counts[s] = c;
        total += c;
      } catch (e) {
        counts[s] = 0;
      }
    }
    return { ok: true, total: total, counts: counts };
  }

  // ══════════════════════════════════════════════════════════════
  // TRIM -- remove records older than N hours
  // ══════════════════════════════════════════════════════════════
  async function trimOlderThan(hours) {
    hours = typeof hours === 'number' && hours > 0 ? hours : 24;
    var cutoff = Date.now() - hours * 3600 * 1000;
    var total = 0;

    for (var i = 0; i < ALL_STORES.length; i++) {
      var s = ALL_STORES[i];
      try {
        var rows = await storage.getAll(s);
        for (var j = 0; j < rows.length; j++) {
          var r = rows[j];
          if (r && r.timestamp && r.timestamp < cutoff) {
            try { await storage.remove(s, r.id); total++; } catch (e) {}
          }
        }
      } catch (e) {}
    }
    return { ok: true, removed: total, olderThanHours: hours };
  }

  // ══════════════════════════════════════════════════════════════
  // PUBLIC
  // ══════════════════════════════════════════════════════════════
  mods.ghost = {
    timeout: safeTimeout,
    interval: safeInterval,
    clearTimers: clearAll,
    timerStatus: timerStatus,
    wipeStores: wipeStores,
    wipeByKind: wipeByKind,
    wipeAll: wipeAll,
    scrub: scrub,
    withdraw: withdraw,
    audit: audit,
    trimOlderThan: trimOlderThan
  };
  core.ghost = mods.ghost;

  eventBus.emit('ghost:ready', {});

  if (typeof completion === 'function') completion(true);
})();