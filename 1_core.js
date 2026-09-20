// language: JavaScript, file: 1_core.js, target: modern browsers
// ReconStrike V13.1 -- Layer 1 Core (repaired)

(function () {
  'use strict';
  if (window.ReconCore && window.ReconCore.version) return;

  const NS = 'rs13';
  const DB_NAME = 'reconstrike_v13';
  const DB_VERSION = 2;
  const STORES = ['endpoints','secrets','cors','jwt','forms','cookies','sri','sw','srcmaps','storage','network','graphql','meta','payloads','targets'];
  const SALT_KEY = `${NS}_salt`;
  const ENC_KEY  = `${NS}_enc`;
  const TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const MAX_PER_STORE = 5000;

  // ── EVENT BUS ──
  const eventBus = (() => {
    const m = new Map();
    return {
      on(ev, fn){
        if(!m.has(ev)) m.set(ev, new Set());
        m.get(ev).add(fn);
        return () => m.get(ev).delete(fn);
      },
      emit(ev, d){
        const set = m.get(ev);
        if(!set) return;
        set.forEach(fn => { try { fn(d); } catch (e) {} });
      },
      events(){ return Array.from(m.keys()); }
    };
  })();

  // ── SCOPE ──
  const scope = (() => {
    const currentHost = location.hostname;
    const parts = currentHost.split('.');
    const baseDomain = parts.length > 2 ? parts.slice(-2).join('.') : currentHost;
    function inScope(url) {
      if (!url) return false;
      if (url.charAt(0) === '/' || url.indexOf('./') === 0 || url.indexOf('../') === 0) return true;
      try {
        const u = new URL(url, location.href);
        return u.hostname === currentHost || u.hostname.endsWith('.' + baseDomain);
      } catch (e) { return false; }
    }
    return { currentHost, baseDomain, inScope };
  })();

  // ── CRYPTO ──
  const cryptoAPI = (() => {
    const enc = new TextEncoder();
    const dec = new TextDecoder();
    const b64e = (u8) => {
      let s = '';
      for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
      return btoa(s);
    };
    const b64d = (s) => {
      const bin = atob(s);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return u8;
    };
    async function deriveKey(password, saltB64) {
      const salt = saltB64 ? b64d(saltB64) : window.crypto.getRandomValues(new Uint8Array(16));
      const km = await window.crypto.subtle.importKey(
        'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
      );
      const key = await window.crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
      );
      return { key, salt: b64e(salt) };
    }
    async function encrypt(key, plaintext) {
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const ct = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv }, key, enc.encode(plaintext)
      );
      return { iv: b64e(iv), ct: b64e(new Uint8Array(ct)) };
    }
    async function decrypt(key, ivB64, ctB64) {
      const pt = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: b64d(ivB64) }, key, b64d(ctB64)
      );
      return dec.decode(pt);
    }
    return { deriveKey, encrypt, decrypt, b64e, b64d };
  })();

  // ── STORAGE ──
  const storage = (() => {
    let dbp = null;
    let idbFailed = false;
    const mem = new Map();

    function memGet(store) {
      if (!mem.has(store)) mem.set(store, new Map());
      return mem.get(store);
    }

    function hashKey(s) {
      let h = 0x811c9dc5;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      return (h >>> 0).toString(36);
    }

    function open() {
      if (idbFailed) return Promise.reject(new Error('idb unavailable'));
      if (dbp) return dbp;
      dbp = new Promise((res, rej) => {
        let r;
        try { r = indexedDB.open(DB_NAME, DB_VERSION); }
        catch (e) { idbFailed = true; rej(e); return; }

        r.onupgradeneeded = (ev) => {
          const db = r.result;
          if (ev.oldVersion < 2) {
            STORES.forEach(s => {
              if (db.objectStoreNames.contains(s)) db.deleteObjectStore(s);
            });
          }
          STORES.forEach(s => {
            if (!db.objectStoreNames.contains(s)) {
              const os = db.createObjectStore(s, { keyPath: 'id' });
              os.createIndex('timestamp', 'timestamp');
            }
          });
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => { idbFailed = true; rej(r.error); };
        r.onblocked = () => { idbFailed = true; rej(new Error('blocked')); };
      });
      return dbp;
    }

    async function tx(store, mode, fn) {
      const db = await open();
      return new Promise((res, rej) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => res(req && 'result' in req ? req.result : undefined);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error || new Error('aborted'));
      });
    }

    async function put(store, record, key) {
      record = Object.assign({}, record);
      record.timestamp = record.timestamp || Date.now();
      if (key) record.id = key;
      else if (!record.id) record.id = hashKey(JSON.stringify(record));

      memGet(store).set(record.id, record);

      if (idbFailed) return record.id;

      try {
        await tx(store, 'readwrite', os => os.put(record));
        if (Math.random() < 0.02) prune(store).catch(() => {});
        return record.id;
      } catch (e) {
        return record.id;
      }
    }

    async function getAll(store) {
      if (idbFailed) return Array.from(memGet(store).values());
      try {
        const rows = await tx(store, 'readonly', os => os.getAll());
        return rows || [];
      } catch (e) {
        return Array.from(memGet(store).values());
      }
    }

    async function get(store, id) {
      if (idbFailed) return memGet(store).get(id);
      try { return await tx(store, 'readonly', os => os.get(id)); }
      catch (e) { return memGet(store).get(id); }
    }

    async function remove(store, id) {
      memGet(store).delete(id);
      if (idbFailed) return;
      try { await tx(store, 'readwrite', os => os.delete(id)); } catch (e) {}
    }

    async function clear(store) {
      memGet(store).clear();
      if (idbFailed) return;
      try { await tx(store, 'readwrite', os => os.clear()); } catch (e) {}
    }

    async function count(store) {
      if (idbFailed) return memGet(store).size;
      try { return await tx(store, 'readonly', os => os.count()); }
      catch (e) { return memGet(store).size; }
    }

    async function prune(store) {
      const rows = await getAll(store);
      if (rows.length <= MAX_PER_STORE) return;
      const sorted = rows.slice().sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      const toRemove = sorted.slice(0, rows.length - MAX_PER_STORE);
      for (const r of toRemove) await remove(store, r.id);
    }

    async function pruneAll() {
      const cutoff = Date.now() - TTL_MS;
      for (const store of STORES) {
        try {
          const rows = await getAll(store);
          for (const r of rows) {
            if (r.timestamp && r.timestamp < cutoff) await remove(store, r.id);
          }
          await prune(store);
        } catch (e) {}
      }
    }

    return {
      open, put, get, getAll, remove, clear, count, prune, pruneAll,
      stores: () => STORES.slice(),
      isIDBFailed: () => idbFailed,
      hashKey
    };
  })();

  // ── SECURE ──
  const secure = (() => {
    let key = null;

    async function unlock(password) {
      const salt = localStorage.getItem(SALT_KEY);
      const { key: k, salt: s } = await cryptoAPI.deriveKey(password, salt);
      key = k;
      if (!salt) localStorage.setItem(SALT_KEY, s);
      localStorage.setItem(ENC_KEY, '1');
      eventBus.emit('secure:unlocked', {});
      return true;
    }

    function lock() {
      key = null;
      eventBus.emit('secure:locked', {});
    }

    function enabled() { return !!key; }

    async function seal(store, record, id) {
      if (!key) throw new Error('secure: locked');
      const { iv, ct } = await cryptoAPI.encrypt(key, JSON.stringify(record));
      return storage.put(store, { enc: true, iv, ct, timestamp: Date.now() }, id);
    }

    async function unseal(record) {
      if (!record || !record.enc || !key) return record;
      try { return JSON.parse(await cryptoAPI.decrypt(key, record.iv, record.ct)); }
      catch (e) { return { __decrypt_error: true, id: record.id }; }
    }

    return { unlock, lock, enabled, seal, unseal };
  })();

  // ── WORKER POOL ──
  const worker = (() => {
    const size = Math.max(2, Math.min(6, navigator.hardwareConcurrency || 2));
    const pool = [];
    const queue = [];
    let evalBlocked = false;
    let url = null;

    try {
      const code = `self.onmessage = async e => { const {id, fn, args} = e.data; try { const f = new Function('return (' + fn + ')')(); const r = await f(...args); self.postMessage({id, ok:true, result:r}); } catch(err){ self.postMessage({id, ok:false, error: err.message || String(err)}); } };`;
      url = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
    } catch (e) {
      evalBlocked = true;
    }

    function spawn() {
      const w = new Worker(url);
      w.pending = new Map();
      w.busy = false;
      w.onmessage = (e) => {
        const d = e.data;
        const r = w.pending.get(d.id);
        if (!r) return;
        w.pending.delete(d.id);
        w.busy = false;
        d.ok ? r.resolve(d.result) : r.reject(new Error(d.error));
        drain();
      };
      w.onerror = () => { w.busy = false; drain(); };
      return w;
    }

    function ensure() {
      while (pool.length < size) pool.push(spawn());
    }

    function runOn(w, t) {
      w.busy = true;
      const id = Math.random().toString(36).slice(2);
      w.pending.set(id, t);
      w.postMessage({ id: id, fn: t.fn, args: t.args });
    }

    function drain() {
      while (queue.length) {
        const free = pool.find(w => !w.busy);
        if (!free) return;
        runOn(free, queue.shift());
      }
    }

    async function run(fn, ...args) {
      if (evalBlocked) return await fn(...args);
      ensure();
      return new Promise((resolve, reject) => {
        let done = false;
        const task = {
          fn: fn.toString(),
          args: args,
          resolve: (v) => {
            if (done) return;
            done = true;
            clearTimeout(tm);
            resolve(v);
          },
          reject: (e) => {
            if (done) return;
            done = true;
            clearTimeout(tm);
            reject(e);
          }
        };
        const tm = setTimeout(() => {
          if (done) return;
          done = true;
          evalBlocked = true;
          try { resolve(fn(...args)); }
          catch (e) { reject(e); }
        }, 2000);

        const free = pool.find(w => !w.busy);
        if (free) runOn(free, task);
        else queue.push(task);
      });
    }

    return {
      run: run,
      size: size,
      pending(){ return queue.length + pool.filter(w => w.busy).length; },
      evalBlocked: () => evalBlocked,
      terminate(){
        pool.forEach(w => w.terminate());
        pool.length = 0;
        if (url) URL.revokeObjectURL(url);
      }
    };
  })();

  // ── SHADOW DOM MOUNT ──
  const _shadowCache = {};
  function mountShadow(hostId, css, html) {
    if (_shadowCache[hostId]) return _shadowCache[hostId];
    const existing = document.getElementById(hostId);
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    const h = document.createElement('div');
    h.id = hostId;
    h.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
    const sh = h.attachShadow({ mode: 'closed' });
    _shadowCache[hostId] = sh;
    const st = document.createElement('style');
    st.textContent = css;
    sh.appendChild(st);
    const w = document.createElement('div');
    w.style.pointerEvents = 'auto';
    w.innerHTML = html;
    sh.appendChild(w);
    document.body.appendChild(h);
    return sh;
  }

  // ── PUBLIC API ──
  window.ReconCore = {
    version: '13.1',
    eventBus: eventBus,
    scope: scope,
    crypto: cryptoAPI,
    storage: storage,
    worker: worker,
    secure: secure,
    mountShadow: mountShadow,
    modules: {},
    STORES: STORES
  };

  setTimeout(() => { storage.pruneAll().catch(() => {}); }, 3000);

  eventBus.emit('core:ready', { version: '13.1', stores: STORES.length, pool: worker.size });
  if (typeof completion === 'function') completion(true);
})();