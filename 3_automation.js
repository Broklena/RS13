// language: JavaScript, file: reconstrike_v13_automation.js, target: modern browsers
// Layer 3 of 4. Depends on ReconCore + Layer 2 modules.

(function () {
  'use strict';
  if (!window.ReconCore) throw new Error('ReconCore missing');
  const { eventBus, storage, worker, secure } = window.ReconCore;
  const modules = window.ReconCore.modules = window.ReconCore.modules || {};
  const currentHost = location.hostname;
  const baseDomain = currentHost.split('.').slice(-2).join('.');

  function inScope(url) {
    if (!url) return false;
    if (url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) return true;
    try { const u = new URL(url, location.href); return u.hostname === currentHost || u.hostname.endsWith('.' + baseDomain); }
    catch (e) { return false; }
  }

  // ══════════════════════════════════════════════════════════════
  // MODULE 1 -- Auto-Crawler
  // ══════════════════════════════════════════════════════════════
  modules.crawler = (() => {
    const seen = new Set();
    const queue = [];
    let running = false;
    let aborted = false;

    function normalize(href) {
      try { const u = new URL(href, location.href); u.hash = ''; return u.href; } catch (e) { return null; }
    }

    function harvest(doc, baseUrl) {
      const found = [];
      doc.querySelectorAll('a[href], area[href]').forEach(a => {
        const href = a.getAttribute('href');
        if (!href || /^(?:javascript|mailto|tel|data):/i.test(href)) return;
        const n = normalize(new URL(href, baseUrl).href);
        if (n && inScope(n) && !seen.has(n)) found.push(n);
      });
      doc.querySelectorAll('form[action]').forEach(f => {
        const n = normalize(new URL(f.getAttribute('action'), baseUrl).href);
        if (n && inScope(n) && !seen.has(n)) found.push(n);
      });
      return found;
    }

    async function fetchDoc(url) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
        const r = await fetch(url, { signal: ctrl.signal, credentials: 'include', redirect: 'follow' });
        clearTimeout(t);
        const ct = r.headers.get('content-type') || '';
        if (!ct.includes('text/html')) return { url, status: r.status, type: 'non-html', ct };
        const text = await r.text();
        const doc = new DOMParser().parseFromString(text, 'text/html');
        return { url, status: r.status, type: 'html', doc, text };
      } catch (e) { return { url, error: e.message }; }
    }

    async function crawl({ maxDepth = 2, maxPages = 50, delayMs = 300 } = {}) {
      if (running) return { ok: false, reason: 'already running' };
      running = true; aborted = false;
      const start = location.href;
      seen.add(start);
      queue.push({ url: start, depth: 0 });
      const results = [];
      let crawled = 0;

      while (queue.length && crawled < maxPages && !aborted) {
        const { url, depth } = queue.shift();
        const res = await fetchDoc(url);
        results.push({ url, depth, status: res.status, error: res.error, type: res.type });
        eventBus.emit('crawler:page', { url, depth, status: res.status, crawled });
        if (res.doc && depth < maxDepth) {
          const found = harvest(res.doc, url);
          found.forEach(f => {
            if (!seen.has(f)) { seen.add(f); queue.push({ url: f, depth: depth + 1 }); }
          });
        }
        crawled++;
        await new Promise(r => setTimeout(r, delayMs + Math.random() * delayMs));
      }
      running = false;
      await storage.put('meta', { kind: 'crawl', host: currentHost, pages: results.length, urls: results.map(r => r.url), timestamp: Date.now() });
      eventBus.emit('crawler:done', { pages: results.length, aborted });
      return { ok: true, pages: results.length, results };
    }

    return { crawl, abort: () => { aborted = true; }, seen, queue, status: () => ({ running, seen: seen.size, queue: queue.length }) };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 2 -- Diff Engine
  // ══════════════════════════════════════════════════════════════
  modules.diff = (() => {
    function normalizeBody(s) {
      if (!s) return '';
      return s
        .replace(/[0-9a-f]{8,}/gi, '<HEX>')
        .replace(/\b\d{4}-\d{2}-\d{2}T[\d:.]+Z?\b/g, '<DATE>')
        .replace(/\b\d{10,13}\b/g, '<TS>')
        .replace(/\b\d+\b/g, '<N>')
        .replace(/\s+/g, ' ')
        .trim();
    }

    async function compareAtoB(reqA, reqB) {
      const [a, b] = await Promise.all([fetch(reqA.url, reqA).then(r => r.text().then(t => ({ s: r.status, t, h: [...r.headers].map(x => x.join(': ')).join('\n') }))), fetch(reqB.url, reqB).then(r => r.text().then(t => ({ s: r.status, t, h: [...r.headers].map(x => x.join(': ')).join('\n') })))]);
      const na = normalizeBody(a.t), nb = normalizeBody(b.t);
      const sim = similarity(na, nb);
      const statusDiff = a.s !== b.s;
      const lenDiff = Math.abs(a.t.length - b.t.length) / Math.max(a.t.length, b.t.length, 1);
      let verdict = 'identical-ish';
      if (statusDiff) verdict = `STATUS-DIFF: ${a.s} vs ${b.s}`;
      else if (sim < 0.5) verdict = 'BODY-DIVERGENT: <50% similarity -- possible auth/logic leak';
      else if (sim < 0.85) verdict = 'BODY-VARIANT: content differs -- check field-level';
      return { verdict, sim, statusA: a.s, statusB: b.s, lenA: a.t.length, lenB: b.t.length, lenDiff };
    }

    function similarity(a, b) {
      if (!a && !b) return 1;
      if (!a || !b) return 0;
      const A = new Set(a.split(' ').slice(0, 500));
      const B = new Set(b.split(' ').slice(0, 500));
      let inter = 0; A.forEach(x => { if (B.has(x)) inter++; });
      return (2 * inter) / (A.size + B.size);
    }

    async function bolaProbe(baseUrl, param, samples) {
      const results = [];
      for (let i = 0; i < samples.length - 1; i++) {
        const uA = new URL(baseUrl); uA.searchParams.set(param, samples[i]);
        const uB = new URL(baseUrl); uB.searchParams.set(param, samples[i + 1]);
        const r = await compareAtoB({ url: uA.href, credentials: 'include' }, { url: uB.href, credentials: 'include' });
        results.push({ pair: [samples[i], samples[i + 1]], ...r });
      }
      const flagged = results.filter(r => r.sim < 0.85 || r.statusA !== r.statusB);
      return { results, flagged, verdict: flagged.length ? `${flagged.length}/${results.length} pairs diverge -- BOLA candidate` : 'no BOLA signal' };
    }

    return { compareAtoB, bolaProbe, normalizeBody, similarity };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 3 -- CVSS 3.1 Scorer
  // ══════════════════════════════════════════════════════════════
  modules.cvss = (() => {
    const W = {
      AV: { N: 0.85, A: 0.62, L: 0.55, P: 0.2 },
      AC: { L: 0.77, H: 0.44 },
      PR: { N: 0.85, L: { u: 0.62, c: 0.68 }, H: { u: 0.27, c: 0.5 } },
      UI: { N: 0.85, R: 0.62 },
      CIA: { H: 0.56, L: 0.22, N: 0 },
    };

    function score({ AV = 'N', AC = 'L', PR = 'N', UI = 'N', S = 'U', C = 'H', I = 'H', A = 'H', scopeChanged = false } = {}) {
      const sc = S === 'C' || scopeChanged;
      const pr = W.PR[PR][sc ? 'c' : 'u'];
      const iss = 1 - ((1 - W.CIA[C]) * (1 - W.CIA[I]) * (1 - W.CIA[A]));
      const impact = sc ? 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15) : 6.42 * iss;
      const expl = 8.22 * W.AV[AV] * W.AC[AC] * pr * W.UI[UI];
      const base = impact <= 0 ? 0 : Math.min(10, (sc ? 1.08 : 1) * (impact + expl));
      const rounded = Math.ceil(base * 10) / 10;
      const vector = `CVSS:3.1/AV:${AV}/AC:${AC}/PR:${PR}/UI:${UI}/S:${S}/C:${C}/I:${I}/A:${A}`;
      return { score: rounded, vector, severity: rounded >= 9 ? 'CRITICAL' : rounded >= 7 ? 'HIGH' : rounded >= 4 ? 'MEDIUM' : rounded > 0 ? 'LOW' : 'NONE' };
    }

    function autoScore(finding) {
      const t = (finding.type || finding.name || '').toLowerCase();
      if (/rce|deserial|command inj/.test(t))        return score({ AV: 'N', AC: 'L', PR: 'N', UI: 'N', S: 'C', C: 'H', I: 'H', A: 'H' });
      if (/sqli|sql inj/.test(t))                    return score({ AV: 'N', AC: 'L', PR: 'N', UI: 'N', S: 'C', C: 'H', I: 'H', A: 'L' });
      if (/cors.*cred|wildcard.*cred/.test(t))       return score({ AV: 'N', AC: 'L', PR: 'N', UI: 'R', S: 'U', C: 'H', I: 'N', A: 'N' });
      if (/cors/.test(t))                            return score({ AV: 'N', AC: 'L', PR: 'N', UI: 'R', S: 'U', C: 'L', I: 'N', A: 'N' });
      if (/aws|stripe live|private key|github pat/.test(t)) return score({ AV: 'N', AC: 'L', PR: 'N', UI: 'N', S: 'C', C: 'H', I: 'H', A: 'N' });
      if (/jwt.*none|alg.*none/.test(t))             return score({ AV: 'N', AC: 'L', PR: 'N', UI: 'N', S: 'C', C: 'H', I: 'H', A: 'N' });
      if (/xss/.test(t))                             return score({ AV: 'N', AC: 'L', PR: 'N', UI: 'R', S: 'C', C: 'L', I: 'L', A: 'N' });
      if (/csrf/.test(t))                            return score({ AV: 'N', AC: 'L', PR: 'N', UI: 'R', S: 'U', C: 'L', I: 'L', A: 'N' });
      if (/open redirect/.test(t))                   return score({ AV: 'N', AC: 'L', PR: 'N', UI: 'R', S: 'U', C: 'L', I: 'N', A: 'N' });
      if (/sri missing|no sri/.test(t))              return score({ AV: 'N', AC: 'H', PR: 'N', UI: 'R', S: 'C', C: 'L', I: 'L', A: 'N' });
      if (/missing.*httponly|cookie/.test(t))        return score({ AV: 'N', AC: 'H', PR: 'N', UI: 'R', S: 'U', C: 'L', I: 'L', A: 'N' });
      if (/prototype pollution/.test(t))             return score({ AV: 'N', AC: 'H', PR: 'N', UI: 'R', S: 'C', C: 'L', I: 'L', A: 'L' });
      return score({ AV: 'N', AC: 'H', PR: 'N', UI: 'R', S: 'U', C: 'L', I: 'N', A: 'N' });
    }

    return { score, autoScore };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 4 -- Local AI Triage (TF-IDF, no network)
  // ══════════════════════════════════════════════════════════════
  modules.triage = (() => {
    const CORPUS = [
      { label: 'RCE',      tokens: 'eval function constructor rce deserialize exec shell command injection code execution'.split(' ') },
      { label: 'SQLi',     tokens: 'sql injection union select or 1=1 error syntax'.split(' ') },
      { label: 'XSS',      tokens: 'xss cross site script innerhtml dangeroutslyset v-html alert payload'.split(' ') },
      { label: 'SSRF',     tokens: 'ssrf server side request forgery metadata 169.254 callback internal'.split(' ') },
      { label: 'IDOR',     tokens: 'idor bola object reference user id uuid account tenant'.split(' ') },
      { label: 'AUTH',     tokens: 'auth oauth jwt token session login password credential bypass none alg'.split(' ') },
      { label: 'SECRET',   tokens: 'secret key token api credential aws stripe github private leak exposure'.split(' ') },
      { label: 'CORS',     tokens: 'cors origin credentials wildcard allow methods header access control'.split(' ') },
      { label: 'CONFIG',   tokens: 'config csp hsts sri header cookie clickjacking meta policy'.split(' ') },
      { label: 'INFO',     tokens: 'comment version banner debug stack trace source map disclosure'.split(' ') },
      { label: 'PROTO',    tokens: 'prototype pollution proto chain gadget clobber merge'.split(' ') },
    ];

    // Build IDF
    const df = {};
    CORPUS.forEach(c => new Set(c.tokens).forEach(t => df[t] = (df[t] || 0) + 1));
    const N = CORPUS.length;
    const idf = {};
    Object.keys(df).forEach(t => idf[t] = Math.log((N + 1) / (df[t] + 1)) + 1);

    function vector(tokens) {
      const tf = {};
      tokens.forEach(t => tf[t] = (tf[t] || 0) + 1);
      const v = {};
      Object.keys(tf).forEach(t => { if (idf[t]) v[t] = (tf[t] / tokens.length) * idf[t]; });
      return v;
    }

    function cosine(a, b) {
      let dot = 0, na = 0, nb = 0;
      Object.keys(a).forEach(k => { na += a[k] * a[k]; if (b[k]) dot += a[k] * b[k]; });
      Object.keys(b).forEach(k => { nb += b[k] * b[k]; });
      return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
    }

    function classify(finding) {
      const text = [finding.name, finding.type, finding.snippet, finding.issue, finding.detail].filter(Boolean).join(' ').toLowerCase();
      const tokens = text.split(/\W+/).filter(t => t.length > 2);
      const qv = vector(tokens);
      const scored = CORPUS.map(c => ({ label: c.label, score: cosine(qv, vector(c.tokens)) }));
      scored.sort((a, b) => b.score - a.score);
      return { label: scored[0].label, confidence: Math.round(scored[0].score * 100), alternatives: scored.slice(1, 3) };
    }

    async function triageAll(findings) {
      return findings.map(f => ({ ...f, __triage: classify(f) }));
    }

    return { classify, triageAll };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 5 -- OAST Integration (interactsh-compatible client)
  // ══════════════════════════════════════════════════════════════
  modules.oast = (() => {
    let session = null;

    // Uses public oast.fun / interactsh-server gateway. Server-side registration
    // happens via fetch to a public correlator. Fallback to manual token if unreachable.
    async function register(correlatorUrl = 'https://oast.fun') {
      try {
        const r = await fetch(`${correlatorUrl}/register`, { method: 'POST', credentials: 'omit' });
        if (!r.ok) throw new Error('register status ' + r.status);
        const d = await r.json();
        session = {
          correlator: correlatorUrl,
          id: d['server-id'] || d.serverId,
          secret: d['secret-key'] || d.secretKey,
          domain: d['domain'] || `${d['server-id']}.oast.fun`,
          registered: Date.now()
        };
        eventBus.emit('oast:registered', session);
        return session;
      } catch (e) { return { ok: false, error: e.message }; }
    }

    function unique(label) { return `${Math.random().toString(36).slice(2, 10)}.${label || 'rs'}.${session ? session.domain : 'oast.fun'}`; }

    async function poll() {
      if (!session) return { ok: false, reason: 'not registered' };
      try {
        const r = await fetch(`${session.correlator}/poll?id=${session.id}&secret=${session.secret}`, { credentials: 'omit' });
        if (!r.ok) return { ok: false, status: r.status };
        const d = await r.json();
        return { ok: true, interactions: d.data || d.interactions || [] };
      } catch (e) { return { ok: false, error: e.message }; }
    }

    async function watchLoop(intervalMs = 10000, onHit) {
      if (!session) return { ok: false, reason: 'not registered' };
      let stop = false;
      const loop = async () => {
        while (!stop) {
          const d = await poll();
          if (d.ok && d.interactions.length) {
            d.interactions.forEach(i => { onHit && onHit(i); eventBus.emit('oast:interaction', i); });
          }
          await new Promise(r => setTimeout(r, intervalMs));
        }
      };
      loop();
      return { ok: true, stop: () => { stop = true; } };
    }

    return { register, unique, poll, watchLoop, session: () => session };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 6 -- Report Exporters
  // ══════════════════════════════════════════════════════════════
  modules.exporters = (() => {
    function toBurpIssue(finding) {
      const cvss = modules.cvss.autoScore(finding);
      return {
        serial_number: '1', type: '1049088', name: finding.name || 'Finding',
        host: { ip: '', hostname: currentHost, port: location.port || (location.protocol === 'https:' ? '443' : '80'), protocol: location.protocol.replace(':', '') },
        location: { url: finding.url || location.href },
        severity: cvss.severity.toLowerCase(),
        confidence: finding.confidence === 'FIRM' ? 'firm' : 'tentative',
        issue_background: '', remediation_background: '',
        issue_detail: `${finding.issue || ''}\n\nCVSS: ${cvss.vector}\nScore: ${cvss.score}`,
        remediation_detail: finding.remediation || ''
      };
    }

    function toBurpXML(findings) {
      const items = findings.map(f => {
        const i = toBurpIssue(f);
        return `<issue><serialNumber>${i.serial_number}</serialNumber><type>${i.type}</type><name>${esc(i.name)}</name><host ip="${esc(i.host.ip)}">${esc(i.host.hostname)}</host><path>${esc(i.location.url)}</path><location>${esc(i.location.url)}</location><severity>${i.severity}</severity><confidence>${i.confidence}</confidence><issueBackground>${esc(i.issue_background)}</issueBackground><issueDetail>${esc(i.issue_detail)}</issueDetail><remediationBackground>${esc(i.remediation_background)}</remediationBackground><remediationDetail>${esc(i.remediation_detail)}</remediationDetail></issue>`;
      }).join('');
      return `<?xml version="1.0"?><issues burpVersion="2024.1">${items}</issues>`;
    }

    function toHAR(requests) {
      return {
        log: {
          version: '1.2', creator: { name: 'ReconStrike', version: '13.0' },
          entries: requests.map(r => ({
            startedDateTime: new Date(r.timestamp || Date.now()).toISOString(),
            time: 0, request: { method: r.method, url: r.url, httpVersion: 'HTTP/1.1', headers: [], queryString: [], cookies: [], headersSize: -1, bodySize: -1 },
            response: { status: 0, statusText: '', httpVersion: 'HTTP/1.1', headers: [], cookies: [], content: { size: 0, mimeType: '' }, redirectURL: '', headersSize: -1, bodySize: -1 },
            cache: {}, timings: { send: 0, wait: 0, receive: 0 }
          }))
        }
      };
    }

    function toNucleiTemplate(finding) {
      const name = (finding.name || 'finding').toLowerCase().replace(/\W+/g, '-');
      return `id: ${name}\ninfo:\n  name: ${finding.name || 'Finding'}\n  author: reconstrike\n  severity: ${(modules.cvss.autoScore(finding).severity || 'info').toLowerCase()}\n  description: ${finding.issue || ''}\nrequests:\n  - method: GET\n    path:\n      - "{{BaseURL}}${finding.path || '/'}"\n    matchers:\n      - type: word\n        words:\n          - "${(finding.marker || '').replace(/"/g, '\\"')}"\n`;
    }

    function toMarkdown(findings) {
      let md = `# ReconStrike Report\n\n**Host:** ${currentHost}\n**Generated:** ${new Date().toISOString()}\n**Findings:** ${findings.length}\n\n`;
      findings.forEach((f, i) => {
        const cvss = modules.cvss.autoScore(f);
        md += `## ${i + 1}. ${f.name || 'Finding'}\n`;
        md += `- **CVSS:** ${cvss.score} (${cvss.severity}) -- \`${cvss.vector}\`\n`;
        md += `- **Location:** \`${f.url || location.href}\`\n`;
        md += `- **Issue:** ${f.issue || f.detail || ''}\n`;
        if (f.snippet) md += `- **Snippet:** \`${String(f.snippet).slice(0, 300)}\`\n`;
        md += '\n';
      });
      return md;
    }

    function toHackerOne(findings) {
      const top = findings.sort((a, b) => modules.cvss.autoScore(b).score - modules.cvss.autoScore(a).score)[0];
      if (!top) return '{}';
      const cvss = modules.cvss.autoScore(top);
      return JSON.stringify({
        title: `${top.name || 'Finding'} on ${currentHost}`,
        vulnerability_information: findings.map(f => `- ${f.name}: ${f.issue || f.detail || ''}`).join('\n'),
        severity: cvss.severity.toLowerCase(),
        cvss_vector: cvss.vector,
        impact: findings.map(f => f.issue || f.detail).filter(Boolean).join('\n'),
        structured_scope: [{ asset_identifier: currentHost, asset_type: 'URL' }]
      }, null, 2);
    }

    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

    function download(data, name, mime) {
      const b = new Blob([typeof data === 'string' ? data : JSON.stringify(data, null, 2)], { type: mime || 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    return { toBurpXML, toBurpIssue, toHAR, toNucleiTemplate, toMarkdown, toHackerOne, download };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 7 -- Webhook Notifier
  // ══════════════════════════════════════════════════════════════
  modules.notify = (() => {
    let config = { slack: null, discord: null, minSeverity: 'HIGH' };
    const SEV_RANK = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0 };

    function setConfig(c) { config = { ...config, ...c }; }

    async function send(finding) {
      const sev = modules.cvss.autoScore(finding).severity;
      if (SEV_RANK[sev] < SEV_RANK[config.minSeverity]) return { skipped: true };
      const text = `[${sev}] ${finding.name || 'Finding'} on ${currentHost}\n${finding.issue || finding.detail || ''}\n${finding.url || ''}`;
      const results = [];
      if (config.slack) {
        try { const r = await fetch(config.slack, { method: 'POST', body: JSON.stringify({ text }), headers: { 'Content-Type': 'application/json' } }); results.push({ slack: r.status }); } catch (e) { results.push({ slack: e.message }); }
      }
      if (config.discord) {
        try { const r = await fetch(config.discord, { method: 'POST', body: JSON.stringify({ content: text }), headers: { 'Content-Type': 'application/json' } }); results.push({ discord: r.status }); } catch (e) { results.push({ discord: e.message }); }
      }
      return { sent: true, results };
    }

    eventBus.on('finding:new', f => send(f));
    return { setConfig, send };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 8 -- Scheduled Background Scans
  // ══════════════════════════════════════════════════════════════
  modules.scheduler = (() => {
    let jobId = null;
    async function start({ intervalMs = 60000, task }) {
      stop();
      jobId = setInterval(async () => {
        try { await task(); eventBus.emit('scheduler:tick', { t: Date.now() }); }
        catch (e) { eventBus.emit('scheduler:error', { error: e.message }); }
      }, intervalMs);
      return { ok: true, intervalMs };
    }
    function stop() { if (jobId) { clearInterval(jobId); jobId = null; } }
    function status() { return { running: !!jobId }; }
    return { start, stop, status };
  })();

  window.ReconCore.exporters = modules.exporters;
  eventBus.emit('automation:ready', { modules: ['crawler','diff','cvss','triage','oast','exporters','notify','scheduler'] });
  if (typeof completion === 'function') completion(true);
})();