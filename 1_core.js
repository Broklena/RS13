// language: JavaScript, file: 1_core.js, target: modern browsers
// ReconStrike V17 -- Layer 1 Core (orchestrator-integrated)

(function () {
  'use strict';
  if (window.ReconCore && window.ReconCore.version) return;

  var NS = 'rs13';
  var DB_NAME = 'reconstrike_v13';
  var DB_VERSION = 2;
  var STORES = ['endpoints','secrets','cors','jwt','forms','cookies','sri','sw','srcmaps','storage','network','graphql','meta','payloads','targets'];
  var SENSITIVE_STORES = ['secrets', 'jwt', 'cookies', 'storage'];
  var SALT_KEY = NS + '_salt';
  var ENC_KEY = NS + '_enc';
  var TTL_MS = 7 * 24 * 60 * 60 * 1000;
  var MAX_PER_STORE = 5000;

  function isSensitive(store) {
    for (var i = 0; i < SENSITIVE_STORES.length; i++) {
      if (SENSITIVE_STORES[i] === store) return true;
    }
    return false;
  }

  // ── HASH (delegates to orchestrator when available) ──
  function fnv32(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
  }

  function hashKey(s) {
    try {
      if (window.RS_ORCH && typeof window.RS_ORCH.hash64 === 'function') {
        return window.RS_ORCH.hash64(s);
      }
    } catch (e) {}
    return fnv32(String(s));
  }

  // ── EVENT BUS ──
  var eventBus = (function () {
    var m = new Map();
    return {
      on: function (ev, fn) {
        if (!m.has(ev)) m.set(ev, new Set());
        m.get(ev).add(fn);
        return function () { m.get(ev).delete(fn); };
      },
      emit: function (ev, d) {
        var set = m.get(ev);
        if (set) {
          set.forEach(function (fn) { try { fn(d); } catch (e) {} });
        }
        // Mirror to orchestrator signal bus for debounced events
        try {
          if (window.RS_ORCH && window.RS_ORCH.signal) {
            var heavyEvents = ['finding:new', 'crawler:page', 'pulsar:hit', 'pulsar:progress', 'argus:tick', 'argus:hit', 'synapse:progress', 'darwin:progress'];
            if (heavyEvents.indexOf(ev) !== -1) {
              window.RS_ORCH.signal(ev, d);
            }
          }
        } catch (e) {}
      },
      events: function () { return Array.from(m.keys()); }
    };
  })();

  // ── SCOPE ──
  var scope = (function () {
    var currentHost = location.hostname;
    var parts = currentHost.split('.');
    var baseDomain = parts.length > 2 ? parts.slice(-2).join('.') : currentHost;
    function inScope(url) {
      if (!url) return false;
      if (url.charAt(0) === '/' || url.indexOf('./') === 0 || url.indexOf('../') === 0) return true;
      try {
        var u = new URL(url, location.href);
        return u.hostname === currentHost || u.hostname.slice(-(baseDomain.length + 1)) === '.' + baseDomain;
      } catch (e) { return false; }
    }
    return { currentHost: currentHost, baseDomain: baseDomain, inScope: inScope };
  })();

  // ── CRYPTO ──
  var cryptoAPI = (function () {
    var enc = new TextEncoder();
    var dec = new TextDecoder();
    function b64e(u8) {
      var s = '';
      for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
      return btoa(s);
    }
    function b64d(s) {
      var bin = atob(s);
      var u8 = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return u8;
    }
    async function deriveKey(password, saltB64) {
      var salt = saltB64 ? b64d(saltB64) : window.crypto.getRandomValues(new Uint8Array(16));
      var km = await window.crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
      var key = await window.crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' },
        km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
      );
      return { key: key, salt: b64e(salt) };
    }
    async function encrypt(key, plaintext) {
      var iv = window.crypto.getRandomValues(new Uint8Array(12));
      var ct = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, enc.encode(plaintext));
      return { iv: b64e(iv), ct: b64e(new Uint8Array(ct)) };
    }
    async function decrypt(key, ivB64, ctB64) {
      var pt = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(ivB64) }, key, b64d(ctB64));
      return dec.decode(pt);
    }
    return { deriveKey: deriveKey, encrypt: encrypt, decrypt: decrypt, b64e: b64e, b64d: b64d };
  })();

  // ── SECURE (before storage, since storage reads it) ──
  var secure = (function () {
    var key = null;

    async function unlock(password) {
      var salt = localStorage.getItem(SALT_KEY);
      var d = await cryptoAPI.deriveKey(password, salt);
      key = d.key;
      if (!salt) localStorage.setItem(SALT_KEY, d.salt);
      localStorage.setItem(ENC_KEY, '1');
      eventBus.emit('secure:unlocked', {});
      return true;
    }

    function lock() {
      key = null;
      eventBus.emit('secure:locked', {});
    }

    function enabled() { return !!key; }

    async function _sealRecord(record) {
      if (!key) throw new Error('locked');
      var json = JSON.stringify(record);
      var enc = await cryptoAPI.encrypt(key, json);
      return {
        enc: true,
        iv: enc.iv,
        ct: enc.ct,
        id: record.id,
        timestamp: record.timestamp || Date.now()
      };
    }

    async function _unsealRecord(row) {
      if (!row || !row.enc) return row;
      if (!key) throw new Error('locked');
      var json = await cryptoAPI.decrypt(key, row.iv, row.ct);
      return JSON.parse(json);
    }

    return { unlock: unlock, lock: lock, enabled: enabled, _sealRecord: _sealRecord, _unsealRecord: _unsealRecord };
  })();

  // ── STORAGE ──
  var storage = (function () {
    var dbp = null;
    var idbFailed = false;
    var mem = new Map();

    function memGet(store) {
      if (!mem.has(store)) mem.set(store, new Map());
      return mem.get(store);
    }

    function open() {
      if (idbFailed) return Promise.reject(new Error('idb unavailable'));
      if (dbp) return dbp;
      dbp = new Promise(function (res, rej) {
        var r;
        try { r = indexedDB.open(DB_NAME, DB_VERSION); }
        catch (e) { idbFailed = true; rej(e); return; }

        r.onupgradeneeded = function (ev) {
          var db = r.result;
          if (ev.oldVersion < 2) {
            STORES.forEach(function (s) {
              if (db.objectStoreNames.contains(s)) db.deleteObjectStore(s);
            });
          }
          STORES.forEach(function (s) {
            if (!db.objectStoreNames.contains(s)) {
              var os = db.createObjectStore(s, { keyPath: 'id' });
              os.createIndex('timestamp', 'timestamp');
            }
          });
        };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { idbFailed = true; rej(r.error); };
        r.onblocked = function () { idbFailed = true; rej(new Error('blocked')); };
      });
      return dbp;
    }

    async function tx(store, mode, fn) {
      var db = await open();
      return new Promise(function (res, rej) {
        var t = db.transaction(store, mode);
        var req = fn(t.objectStore(store));
        t.oncomplete = function () { res(req && 'result' in req ? req.result : undefined); };
        t.onerror = function () { rej(t.error); };
        t.onabort = function () { rej(t.error || new Error('aborted')); };
      });
    }

    async function putRaw(store, record) {
      memGet(store).set(record.id, record);
      if (idbFailed) return record.id;
      try {
        await tx(store, 'readwrite', function (os) { return os.put(record); });
        if (Math.random() < 0.02) prune(store).catch(function () {});
        return record.id;
      } catch (e) {
        return record.id;
      }
    }

    async function put(store, record, key) {
      record = Object.assign({}, record);
      record.timestamp = record.timestamp || Date.now();
      if (key) record.id = key;
      else if (!record.id) record.id = hashKey(JSON.stringify(record));

      memGet(store).set(record.id, record);

      if (idbFailed) return record.id;

      if (isSensitive(store) && secure.enabled()) {
        try {
          var sealed = await secure._sealRecord(record);
          return await putRaw(store, sealed);
        } catch (e) {
          // fall through to plaintext
        }
      }

      return await putRaw(store, record);
    }

    async function getAllRaw(store) {
      if (idbFailed) return Array.from(memGet(store).values());
      try {
        var rows = await tx(store, 'readonly', function (os) { return os.getAll(); });
        return rows || [];
      } catch (e) {
        return Array.from(memGet(store).values());
      }
    }

    async function getAll(store) {
      var rows = await getAllRaw(store);

      if (!isSensitive(store)) return rows;

      if (!secure.enabled()) {
        var fromMem = Array.from(memGet(store).values());
        if (fromMem.length) return fromMem;
        return rows;
      }

      var out = [];
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (r && r.enc) {
          try { out.push(await secure._unsealRecord(r)); }
          catch (e) { out.push({ __decrypt_error: true, id: r.id }); }
        } else {
          out.push(r);
        }
      }
      return out;
    }

    async function get(store, id) {
      var r;
      if (idbFailed) {
        r = memGet(store).get(id);
      } else {
        try { r = await tx(store, 'readonly', function (os) { return os.get(id); }); }
        catch (e) { r = memGet(store).get(id); }
      }

      if (!r) return r;
      if (!isSensitive(store)) return r;

      if (secure.enabled() && r.enc) {
        try { return await secure._unsealRecord(r); }
        catch (e) { return { __decrypt_error: true, id: r.id }; }
      }

      return memGet(store).get(id) || r;
    }

    async function remove(store, id) {
      memGet(store).delete(id);
      if (idbFailed) return;
      try { await tx(store, 'readwrite', function (os) { return os.delete(id); }); }
      catch (e) {}
    }

    async function clear(store) {
      memGet(store).clear();
      if (idbFailed) return;
      try { await tx(store, 'readwrite', function (os) { return os.clear(); }); }
      catch (e) {}
    }

    async function count(store) {
      if (idbFailed) return memGet(store).size;
      try { return await tx(store, 'readonly', function (os) { return os.count(); }); }
      catch (e) { return memGet(store).size; }
    }

    async function prune(store) {
      var rows = await getAllRaw(store);
      if (rows.length <= MAX_PER_STORE) return;
      var sorted = rows.slice().sort(function (a, b) { return (a.timestamp || 0) - (b.timestamp || 0); });
      var toRemove = sorted.slice(0, rows.length - MAX_PER_STORE);
      for (var i = 0; i < toRemove.length; i++) await remove(store, toRemove[i].id);
    }

    async function pruneAll() {
      var cutoff = Date.now() - TTL_MS;
      for (var s = 0; s < STORES.length; s++) {
        var store = STORES[s];
        try {
          var rows = await getAllRaw(store);
          for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            if (r.timestamp && r.timestamp < cutoff) await remove(store, r.id);
          }
          await prune(store);
        } catch (e) {}
      }
    }

    return {
      open: open,
      put: put,
      get: get,
      getAll: getAll,
      remove: remove,
      clear: clear,
      count: count,
      prune: prune,
      pruneAll: pruneAll,
      stores: function () { return STORES.slice(); },
      isIDBFailed: function () { return idbFailed; },
      hashKey: hashKey
    };
  })();

  // ── WORKER POOL ──
  var worker = (function () {
    var size = Math.max(2, Math.min(6, navigator.hardwareConcurrency || 2));
    var pool = [];
    var queue = [];
    var evalBlocked = false;
    var url = null;

    try {
      var code = 'self.onmessage = async function(e){ var d=e.data; try { var f = new Function("return (" + d.fn + ")")(); var r = await f.apply(null, d.args); self.postMessage({id:d.id, ok:true, result:r}); } catch(err){ self.postMessage({id:d.id, ok:false, error: err.message || String(err)}); } };';
      url = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
    } catch (e) {
      evalBlocked = true;
    }

    function spawn() {
      var w = new Worker(url);
      w.pending = new Map();
      w.busy = false;
      w.onmessage = function (e) {
        var d = e.data;
        var r = w.pending.get(d.id);
        if (!r) return;
        w.pending.delete(d.id);
        w.busy = false;
        d.ok ? r.resolve(d.result) : r.reject(new Error(d.error));
        drain();
      };
      w.onerror = function () { w.busy = false; drain(); };
      return w;
    }

    function ensure() {
      while (pool.length < size) pool.push(spawn());
    }

    function runOn(w, t) {
      w.busy = true;
      var id = Math.random().toString(36).slice(2);
      w.pending.set(id, t);
      w.postMessage({ id: id, fn: t.fn, args: t.args });
    }

    function drain() {
      while (queue.length) {
        var free = pool.find(function (w) { return !w.busy; });
        if (!free) return;
        runOn(free, queue.shift());
      }
    }

    async function run(fn) {
      var args = Array.prototype.slice.call(arguments, 1);
      if (evalBlocked) return await fn.apply(null, args);
      ensure();
      return new Promise(function (resolve, reject) {
        var done = false;
        var task = {
          fn: fn.toString(),
          args: args,
          resolve: function (v) {
            if (done) return;
            done = true;
            clearTimeout(tm);
            resolve(v);
          },
          reject: function (e) {
            if (done) return;
            done = true;
            clearTimeout(tm);
            reject(e);
          }
        };
        var tm = setTimeout(function () {
          if (done) return;
          done = true;
          evalBlocked = true;
          try { resolve(fn.apply(null, args)); }
          catch (e) { reject(e); }
        }, 2000);

        var free = pool.find(function (w) { return !w.busy; });
        if (free) runOn(free, task);
        else queue.push(task);
      });
    }

    function terminate() {
      pool.forEach(function (w) { try { w.terminate(); } catch (e) {} });
      pool.length = 0;
      queue.length = 0;
      if (url) {
        try { URL.revokeObjectURL(url); } catch (e) {}
        url = null;
      }
    }

    return {
      run: run,
      size: size,
      pending: function () { return queue.length + pool.filter(function (w) { return w.busy; }).length; },
      evalBlocked: function () { return evalBlocked; },
      terminate: terminate
    };
  })();

  // ── SHADOW DOM MOUNT ──
  var _shadowCache = {};
  function mountShadow(hostId, css, html) {
    if (_shadowCache[hostId]) return _shadowCache[hostId];
    var existing = document.getElementById(hostId);
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    var h = document.createElement('div');
    h.id = hostId;
    h.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
    var sh = h.attachShadow({ mode: 'closed' });
    _shadowCache[hostId] = sh;
    var st = document.createElement('style');
    st.textContent = css;
    sh.appendChild(st);
    var w = document.createElement('div');
    w.style.pointerEvents = 'auto';
    w.innerHTML = html;
    sh.appendChild(w);
    document.body.appendChild(h);
    return sh;
  }

  // ── PUBLIC API ──
  window.ReconCore = {
    version: '14.0',
    eventBus: eventBus,
    scope: scope,
    crypto: cryptoAPI,
    storage: storage,
    worker: worker,
    secure: secure,
    mountShadow: mountShadow,
    modules: {},
    STORES: STORES,
    SENSITIVE_STORES: SENSITIVE_STORES,
    hashKey: hashKey
  };

  // ── ORCHESTRATOR INTEGRATION ──
  try {
    var orch = window.RS_ORCH;
    if (orch) {
      // Set target on context
      if (typeof orch.setContext === 'function') {
        orch.setContext({
          target: scope.currentHost,
          url: location.href,
          scope: { host: scope.currentHost, base: scope.baseDomain }
        });
      }
      // Register worker pool cleanup
      if (typeof orch.onCleanup === 'function') {
        orch.onCleanup(function () {
          try { worker.terminate(); } catch (e) {}
        });
        orch.onCleanup(function () {
          try { window.ReconCore = undefined; } catch (e) {}
        });
      }
    }
  } catch (e) {}

  // ── BOOT: prune old data ──
  setTimeout(function () {
    try { storage.pruneAll(); } catch (e) {}
  }, 3000);

  // ── SIGNALS ──
  try {
    window.dispatchEvent(new CustomEvent('rs-core:ready', {
      detail: { version: '14.0', stores: STORES.length, pool: worker.size }
    }));
  } catch (e) {}

  eventBus.emit('core:ready', { version: '14.0', stores: STORES.length, pool: worker.size });

  if (typeof completion === 'function') completion(true);
})();