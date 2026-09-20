// language: JavaScript, file: reconstrike_v13_core.js, target: modern browsers
// Layer 1 of 4. Foundation for all subsequent offensive modules.

(function () {
  'use strict';

  const NS = 'rs13';
  const DB_NAME = 'reconstrike_v13';
  const DB_VERSION = 1;
  const STORES = ['endpoints','secrets','cors','jwt','forms','cookies','sri','sw','srcmaps','storage','network','graphql','meta','payloads','targets'];
  const SALT_KEY = `${NS}_salt`;
  const ENC_KEY  = `${NS}_enc`;

  // ── EVENT BUS ──
  const eventBus = (() => {
    const m = new Map();
    return {
      on(ev, fn){ if(!m.has(ev)) m.set(ev, new Set()); m.get(ev).add(fn); return () => m.get(ev).delete(fn); },
      emit(ev, d){ (m.get(ev) || []).forEach(fn => { try { fn(d); } catch (e) {} }); },
      events(){ return Array.from(m.keys()); }
    };
  })();

  // ── WEB CRYPTO -- AES-GCM 256 + PBKDF2 100k ──
  const cryptoAPI = (() => {
    const enc = new TextEncoder();
    const dec = new TextDecoder();
    const b64e = (u8) => { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); };
    const b64d = (s) => { const bin = atob(s); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; };

    async function deriveKey(password, saltB64) {
      const salt = saltB64 ? b64d(saltB64) : window.crypto.getRandomValues(new Uint8Array(16));
      const km = await window.crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
      const key = await window.crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
      );
      return { key, salt: b64e(salt) };
    }
    async function encrypt(key, plaintext) {
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const ct = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
      return { iv: b64e(iv), ct: b64e(new Uint8Array(ct)) };
    }
    async function decrypt(key, ivB64, ctB64) {
      const pt = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(ivB64) }, key, b64d(ctB64));
      return dec.decode(pt);
    }
    return { deriveKey, encrypt, decrypt, b64e, b64d };
  })();

  // ── INDEXEDDB ──
  const storage = (() => {
    let dbp;
    function open() {
      if (dbp) return dbp;
      dbp = new Promise((res, rej) => {
        const r = indexedDB.open(DB_NAME, DB_VERSION);
        r.onupgradeneeded = () => {
          const db = r.result;
          STORES.forEach(s => {
            if (!db.objectStoreNames.contains(s)) {
              const os = db.createObjectStore(s, { keyPath: 'id', autoIncrement: true });
              os.createIndex('timestamp', 'timestamp');
            }
          });
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
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
    return {
      open,
      put:     (s, r) => { r.timestamp = r.timestamp || Date.now(); return tx(s, 'readwrite', os => os.put(r)); },
      get:     (s, id) => tx(s, 'readonly',  os => os.get(id)),
      getAll:  (s)     => tx(s, 'readonly',  os => os.getAll()),
      remove:  (s, id) => tx(s, 'readwrite', os => os.delete(id)),
      clear:   (s)     => tx(s, 'readwrite', os => os.clear()),
      count:   (s)     => tx(s, 'readonly',  os => os.count()),
      stores:  () => STORES.slice()
    };
  })();

  // ── WORKER POOL -- inline via Blob URL, no external files ──
  const worker = (() => {
    const size = Math.max(2, Math.min(8, navigator.hardwareConcurrency || 4));
    const pool = [];
    const queue = [];
    const code = `self.onmessage = async e => { const {id, fn, args} = e.data; try { const f = new Function('return (' + fn + ')')(); const r = await f(...args); self.postMessage({id, ok:true, result:r}); } catch(err){ self.postMessage({id, ok:false, error: err.message || String(err)}); } };`;
    const url = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));

    function spawn() {
      const w = new Worker(url);
      w.pending = new Map();
      w.busy = false;
      w.onmessage = (e) => {
        const { id, ok, result, error } = e.data;
        const r = w.pending.get(id);
        if (!r) return;
        w.pending.delete(id);
        w.busy = false;
        ok ? r.resolve(result) : r.reject(new Error(error));
        drain();
      };
      w.onerror = (err) => { w.busy = false; drain(); };
      return w;
    }
    function ensure(){ while (pool.length < size) pool.push(spawn()); }
    function runOn(w, t) {
      w.busy = true;
      const id = Math.random().toString(36).slice(2);
      w.pending.set(id, t);
      w.postMessage({ id, fn: t.fn, args: t.args });
    }
    function drain() {
      while (queue.length) {
        const free = pool.find(w => !w.busy);
        if (!free) return;
        runOn(free, queue.shift());
      }
    }
    return {
      run(fn, ...args) {
        ensure();
        return new Promise((resolve, reject) => {
          const t = { fn: fn.toString(), args, resolve, reject };
          const free = pool.find(w => !w.busy);
          if (free) runOn(free, t); else queue.push(t);
        });
      },
      size,
      pending(){ return queue.length + pool.filter(w => w.busy).length; },
      terminate(){ pool.forEach(w => w.terminate()); pool.length = 0; URL.revokeObjectURL(url); }
    };
  })();

  // ── SHADOW DOM MOUNT ──
  function mountShadow(hostId, css, html) {
    let h = document.getElementById(hostId);
    if (h) return h.shadowRoot;
    h = document.createElement('div');
    h.id = hostId;
    h.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
    const sh = h.attachShadow({ mode: 'closed' });
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

  // ── SECURE STORE -- encrypted bridge over IndexedDB ──
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
    function lock(){ key = null; eventBus.emit('secure:locked', {}); }
    function enabled(){ return !!key; }
    async function put(store, record) {
      if (!enabled()) return storage.put(store, record);
      const { iv, ct } = await cryptoAPI.encrypt(key, JSON.stringify(record));
      return storage.put(store, { enc: true, iv, ct, timestamp: record.timestamp || Date.now() });
    }
    async function getAll(store) {
      const rows = await storage.getAll(store);
      if (!enabled()) return rows;
      const out = [];
      for (const r of rows) {
        if (r && r.enc) {
          try { out.push(JSON.parse(await cryptoAPI.decrypt(key, r.iv, r.ct))); }
          catch (e) { out.push({ __decrypt_error: true, id: r.id }); }
        } else out.push(r);
      }
      return out;
    }
    return { unlock, lock, enabled, put, getAll };
  })();

  // ── PUBLIC API ──
  window.ReconCore = {
    version: '13.0',
    eventBus,
    crypto: cryptoAPI,
    storage,
    worker,
    secure,
    mountShadow,
    STORES
  };

  eventBus.emit('core:ready', { version: '13.0', stores: STORES.length, pool: worker.size });
  if (typeof completion === 'function') completion(true);
})();