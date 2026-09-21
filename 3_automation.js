// language: JavaScript, file: 3_automation.js, target: modern browsers
// ReconStrike V13.2 -- Layer 3 Automation (crawler analyzes HTML)

(function () {
  'use strict';
  if (!window.ReconCore) return;
  var core = window.ReconCore;
  var eventBus = core.eventBus;
  var storage = core.storage;
  var scope = core.scope;
  var mods = core.modules = core.modules || {};

  // ══════════════════════════════════════════════════════════════
  // MODULE 1 -- Auto-Crawler
  // Fetches pages, harvests links, AND feeds page HTML to the scanner
  // so tokens/paths inside page bodies are analyzed.
  // ══════════════════════════════════════════════════════════════
  mods.crawler = (function () {
    var seen = new Set();
    var queue = [];
    var running = false;
    var aborted = false;

    function normalize(href) {
      try {
        var u = new URL(href, location.href);
        u.hash = '';
        return u.href;
      } catch (e) { return null; }
    }

    function harvest(doc, baseUrl) {
      var found = [];
      try {
        doc.querySelectorAll('a[href], area[href]').forEach(function (a) {
          var href = a.getAttribute('href');
          if (!href || /^(?:javascript|mailto|tel|data):/i.test(href)) return;
          var abs;
          try { abs = new URL(href, baseUrl).href; } catch (e) { return; }
          var n = normalize(abs);
          if (n && scope.inScope(n) && !seen.has(n)) found.push(n);
        });
      } catch (e) {}
      try {
        doc.querySelectorAll('form[action]').forEach(function (f) {
          var action = f.getAttribute('action');
          if (!action) return;
          var abs;
          try { abs = new URL(action, baseUrl).href; } catch (e) { return; }
          var n = normalize(abs);
          if (n && scope.inScope(n) && !seen.has(n)) found.push(n);
        });
      } catch (e) {}
      return found;
    }

    async function fetchDoc(url) {
      try {
        var ctrl = new AbortController();
        var t = setTimeout(function () { ctrl.abort(); }, 8000);
        var r = await fetch(url, {
          signal: ctrl.signal,
          credentials: 'include',
          redirect: 'follow'
        });
        clearTimeout(t);
        var ct = r.headers.get('content-type') || '';
        if (!ct.includes('text/html')) {
          return { url: url, finalUrl: r.url || url, status: r.status, type: 'non-html', ct: ct };
        }
        var text = await r.text();
        var doc = new DOMParser().parseFromString(text, 'text/html');
        return {
          url: url,
          finalUrl: r.url || url,
          status: r.status,
          type: 'html',
          doc: doc,
          text: text
        };
      } catch (e) {
        return { url: url, error: e.message || String(e) };
      }
    }

    async function crawl(opts) {
      opts = opts || {};
      var maxDepth = typeof opts.maxDepth === 'number' ? opts.maxDepth : 2;
      var maxPages = typeof opts.maxPages === 'number' ? opts.maxPages : 50;
      var delayMs = typeof opts.delayMs === 'number' ? opts.delayMs : 300;

      if (running) return { ok: false, reason: 'already running' };

      running = true;
      aborted = false;
      queue = [];
      seen = new Set();

      var start = location.href;
      seen.add(start);
      queue.push({ url: start, depth: 0 });

      var results = [];
      var crawled = 0;
      var analyzed = 0;

      while (queue.length && crawled < maxPages && !aborted) {
        var item = queue.shift();
        var res = await fetchDoc(item.url);
        results.push({
          url: item.url,
          finalUrl: res.finalUrl,
          depth: item.depth,
          status: res.status,
          error: res.error,
          type: res.type
        });
        eventBus.emit('crawler:page', {
          url: item.url,
          finalUrl: res.finalUrl,
          depth: item.depth,
          status: res.status,
          crawled: crawled
        });

        // FEED PAGE HTML TO SCANNER
        if (res.text && mods.scanner && typeof mods.scanner.analyze === 'function') {
          try {
            var sliced = res.text.length > 500000 ? res.text.slice(0, 500000) : res.text;
            mods.scanner.analyze(sliced, 'crawl:' + item.url, 'FIRM', false);
            analyzed++;
          } catch (e) {}
        }

        // HARVEST LINKS FOR NEXT DEPTH
        if (res.doc && item.depth < maxDepth) {
          var baseForHarvest = res.finalUrl || item.url;
          var found = harvest(res.doc, baseForHarvest);
          found.forEach(function (f) {
            if (!seen.has(f)) {
              seen.add(f);
              queue.push({ url: f, depth: item.depth + 1 });
            }
          });
        }

        crawled++;
        await new Promise(function (r) {
          setTimeout(r, delayMs + Math.random() * delayMs);
        });
      }

      running = false;
      try {
        await storage.put('meta', {
          kind: 'crawl',
          host: scope.currentHost,
          pages: results.length,
          analyzed: analyzed,
          urls: results.map(function (r) { return r.url; }).slice(0, 200)
        }, 'crawl::' + Date.now());
      } catch (e) {}
      eventBus.emit('crawler:done', {
        pages: results.length,
        analyzed: analyzed,
        aborted: aborted
      });
      return { ok: true, pages: results.length, analyzed: analyzed, results: results };
    }

    return {
      crawl: crawl,
      abort: function () { aborted = true; },
      seen: seen,
      queue: queue,
      status: function () {
        return { running: running, seen: seen.size, queue: queue.length };
      }
    };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 2 -- Diff Engine
  // ══════════════════════════════════════════════════════════════
  mods.diff = (function () {

    function normalizeBody(s) {
      if (!s) return '';
      return String(s)
        .replace(/\b[0-9a-f]{32,}\b/gi, '<HEX>')
        .replace(/\b\d{4}-\d{2}-\d{2}T[\d:.]+Z?\b/g, '<DATE>')
        .replace(/\b1[0-9]{12}\b/g, '<TS>')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function similarity(a, b) {
      if (!a && !b) return 1;
      if (!a || !b) return 0;
      var A = new Set(a.split(' ').slice(0, 500));
      var B = new Set(b.split(' ').slice(0, 500));
      var inter = 0;
      A.forEach(function (x) { if (B.has(x)) inter++; });
      var denom = A.size + B.size;
      return denom ? (2 * inter) / denom : 0;
    }

    async function fetchPair(reqA, reqB) {
      async function one(req) {
        try {
          var r = await fetch(req.url, {
            method: req.method || 'GET',
            headers: req.headers || {},
            credentials: req.credentials || 'include'
          });
          var t = await r.text();
          return {
            s: r.status,
            t: t,
            h: (r.headers && typeof r.headers.forEach === 'function')
              ? (function () {
                  var arr = [];
                  r.headers.forEach(function (v, k) { arr.push(k + ': ' + v); });
                  return arr.join('\n');
                })()
              : ''
          };
        } catch (e) {
          return { s: 0, t: '', h: '', error: e.message };
        }
      }
      return await Promise.all([one(reqA), one(reqB)]);
    }

    async function compareAtoB(reqA, reqB) {
      var pair = await fetchPair(reqA, reqB);
      var a = pair[0];
      var b = pair[1];
      var na = normalizeBody(a.t);
      var nb = normalizeBody(b.t);
      var sim = similarity(na, nb);
      var statusDiff = a.s !== b.s;
      var lenDiff = Math.abs(a.t.length - b.t.length) / Math.max(a.t.length, b.t.length, 1);

      var verdict = 'identical-ish';
      if (statusDiff) verdict = 'STATUS-DIFF: ' + a.s + ' vs ' + b.s;
      else if (sim < 0.5) verdict = 'BODY-DIVERGENT: <50% similarity -- possible auth/logic leak';
      else if (sim < 0.85) verdict = 'BODY-VARIANT: content differs -- check field-level';

      return {
        verdict: verdict,
        sim: sim,
        statusA: a.s,
        statusB: b.s,
        lenA: a.t.length,
        lenB: b.t.length,
        lenDiff: lenDiff,
        errorA: a.error,
        errorB: b.error
      };
    }

    async function bolaProbe(baseUrl, param, samples) {
      if (!Array.isArray(samples) || samples.length < 2) {
        return { results: [], flagged: [], verdict: 'need at least 2 samples' };
      }
      var results = [];
      for (var i = 0; i < samples.length - 1; i++) {
        var uA, uB;
        try {
          uA = new URL(baseUrl, location.href);
          uA.searchParams.set(param, String(samples[i]));
          uB = new URL(baseUrl, location.href);
          uB.searchParams.set(param, String(samples[i + 1]));
        } catch (e) { continue; }

        var r = await compareAtoB(
          { url: uA.href, credentials: 'include' },
          { url: uB.href, credentials: 'include' }
        );
        results.push({
          pair: [samples[i], samples[i + 1]],
          urlA: uA.href,
          urlB: uB.href,
          verdict: r.verdict,
          sim: r.sim,
          statusA: r.statusA,
          statusB: r.statusB
        });
      }
      var flagged = results.filter(function (r) {
        return r.sim < 0.85 || r.statusA !== r.statusB;
      });
      return {
        results: results,
        flagged: flagged,
        verdict: flagged.length
          ? flagged.length + '/' + results.length + ' pairs diverge -- BOLA candidate'
          : 'no BOLA signal'
      };
    }

    return {
      compareAtoB: compareAtoB,
      bolaProbe: bolaProbe,
      normalizeBody: normalizeBody,
      similarity: similarity
    };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 3 -- CVSS 3.1 Scorer
  // ══════════════════════════════════════════════════════════════
  mods.cvss = (function () {
    var W = {
      AV: { N: 0.85, A: 0.62, L: 0.55, P: 0.2 },
      AC: { L: 0.77, H: 0.44 },
      PR: { N: 0.85, L: { u: 0.62, c: 0.68 }, H: { u: 0.27, c: 0.5 } },
      UI: { N: 0.85, R: 0.62 },
      CIA: { H: 0.56, L: 0.22, N: 0 }
    };

    function score(o) {
      o = o || {};
      var AV = o.AV || 'N';
      var AC = o.AC || 'L';
      var PR = o.PR || 'N';
      var UI = o.UI || 'N';
      var S = o.S || 'U';
      var C = o.C || 'H';
      var I = o.I || 'H';
      var A = o.A || 'H';

      var scopeChanged = (S === 'C');
      var prValue = (typeof W.PR[PR] === 'object')
        ? W.PR[PR][scopeChanged ? 'c' : 'u']
        : W.PR[PR];

      var iss = 1 - ((1 - W.CIA[C]) * (1 - W.CIA[I]) * (1 - W.CIA[A]));
      var impact = scopeChanged
        ? 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15)
        : 6.42 * iss;

      var expl = 8.22 * W.AV[AV] * W.AC[AC] * prValue * W.UI[UI];
      var base = impact <= 0 ? 0 : Math.min(10, (scopeChanged ? 1.08 : 1) * (impact + expl));
      var rounded = Math.ceil(base * 10) / 10;
      var vector = 'CVSS:3.1/AV:' + AV + '/AC:' + AC + '/PR:' + PR + '/UI:' + UI + '/S:' + S + '/C:' + C + '/I:' + I + '/A:' + A;
      var severity = rounded >= 9 ? 'CRITICAL'
        : rounded >= 7 ? 'HIGH'
        : rounded >= 4 ? 'MEDIUM'
        : rounded > 0 ? 'LOW'
        : 'NONE';

      return { score: rounded, vector: vector, severity: severity };
    }

    function autoScore(finding) {
      var t = String((finding && (finding.type || finding.name)) || '').toLowerCase();
      if (/rce|deserial|command inj/.test(t)) return score({ AV: 'N', AC: 'L', PR: 'N', UI: 'N', S: 'C', C: 'H', I: 'H', A: 'H' });
      if (/sqli|sql inj/.test(t)) return score({ AV: 'N', AC: 'L', PR: 'N', UI: 'N', S: 'C', C: 'H', I: 'H', A: 'L' });
      if (/cors/.test(t) && /cred/.test(t)) return score({ AV: 'N', AC: 'L', PR: 'N', UI: 'R', S: 'U', C: 'H', I: 'N', A: 'N' });
      if (/cors/.test(t)) return score({ AV: 'N', AC: 'L', PR: 'N', UI: 'R', S: 'U', C: 'L', I: 'N', A: 'N' });
      if (/aws|stripe live|private key|github pat/.test(t)) return score({ AV: 'N', AC: 'L', PR: 'N', UI: 'N', S: 'C', C: 'H', I: 'H', A: 'N' });
      if (/jwt.*none|alg.*none/.test(t)) return score({ AV: 'N', AC: 'L', PR: 'N', UI: 'N', S: 'C', C: 'H', I: 'H', A: 'N' });
      if (/xss/.test(t)) return score({ AV: 'N', AC: 'L', PR: 'N', UI: 'R', S: 'C', C: 'L', I: 'L', A: 'N' });
      if (/csrf/.test(t)) return score({ AV: 'N', AC: 'L', PR: 'N', UI: 'R', S: 'U', C: 'L', I: 'L', A: 'N' });
      if (/open redirect/.test(t)) return score({ AV: 'N', AC: 'L', PR: 'N', UI: 'R', S: 'U', C: 'L', I: 'N', A: 'N' });
      if (/sri missing|no sri/.test(t)) return score({ AV: 'N', AC: 'H', PR: 'N', UI: 'R', S: 'C', C: 'L', I: 'L', A: 'N' });
      if (/missing.*httponly|cookie/.test(t)) return score({ AV: 'N', AC: 'H', PR: 'N', UI: 'R', S: 'U', C: 'L', I: 'L', A: 'N' });
      if (/prototype pollution/.test(t)) return score({ AV: 'N', AC: 'H', PR: 'N', UI: 'R', S: 'C', C: 'L', I: 'L', A: 'L' });
      return score({ AV: 'N', AC: 'H', PR: 'N', UI: 'R', S: 'U', C: 'L', I: 'N', A: 'N' });
    }

    return { score: score, autoScore: autoScore };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 4 -- Local AI Triage (TF-IDF)
  // ══════════════════════════════════════════════════════════════
  mods.triage = (function () {
    var CORPUS = [
      { label: 'RCE',    tokens: 'eval function constructor rce deserialize exec shell command injection code execution'.split(' ') },
      { label: 'SQLi',   tokens: 'sql injection union select error syntax'.split(' ') },
      { label: 'XSS',    tokens: 'xss cross site script innerhtml dangerouslyset v-html alert payload'.split(' ') },
      { label: 'SSRF',   tokens: 'ssrf server side request forgery metadata callback internal'.split(' ') },
      { label: 'IDOR',   tokens: 'idor bola object reference user id uuid account tenant'.split(' ') },
      { label: 'AUTH',   tokens: 'auth oauth jwt token session login password credential bypass none alg'.split(' ') },
      { label: 'SECRET', tokens: 'secret key token api credential aws stripe github private leak exposure'.split(' ') },
      { label: 'CORS',   tokens: 'cors origin credentials wildcard allow methods header access control'.split(' ') },
      { label: 'CONFIG', tokens: 'config csp hsts sri header cookie clickjacking meta policy'.split(' ') },
      { label: 'INFO',   tokens: 'comment version banner debug stack trace source map disclosure'.split(' ') },
      { label: 'PROTO',  tokens: 'prototype pollution proto chain gadget clobber merge'.split(' ') }
    ];

    var df = {};
    CORPUS.forEach(function (c) {
      var unique = {};
      c.tokens.forEach(function (t) { unique[t] = true; });
      Object.keys(unique).forEach(function (t) {
        df[t] = (df[t] || 0) + 1;
      });
    });
    var N = CORPUS.length;
    var idf = {};
    Object.keys(df).forEach(function (t) {
      idf[t] = Math.log((N + 1) / (df[t] + 1)) + 1;
    });

    function vector(tokens) {
      var tf = {};
      tokens.forEach(function (t) { tf[t] = (tf[t] || 0) + 1; });
      var v = {};
      Object.keys(tf).forEach(function (t) {
        if (idf[t]) v[t] = (tf[t] / tokens.length) * idf[t];
      });
      return v;
    }

    function cosine(a, b) {
      var dot = 0, na = 0, nb = 0;
      Object.keys(a).forEach(function (k) {
        na += a[k] * a[k];
        if (b[k]) dot += a[k] * b[k];
      });
      Object.keys(b).forEach(function (k) { nb += b[k] * b[k]; });
      return (na && nb) ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
    }

    function classify(finding) {
      var text = [
        finding && finding.name,
        finding && finding.type,
        finding && finding.snippet,
        finding && finding.issue,
        finding && finding.detail
      ].filter(Boolean).join(' ').toLowerCase();
      var tokens = text.split(/\W+/).filter(function (t) { return t.length > 2; });
      var qv = vector(tokens);
      var scored = CORPUS.map(function (c) {
        return { label: c.label, score: cosine(qv, vector(c.tokens)) };
      });
      scored.sort(function (a, b) { return b.score - a.score; });
      return {
        label: scored[0].label,
        confidence: Math.round(scored[0].score * 100),
        alternatives: scored.slice(1, 3)
      };
    }

    async function triageAll(findings) {
      return findings.map(function (f) {
        return Object.assign({}, f, { __triage: classify(f) });
      });
    }

    return { classify: classify, triageAll: triageAll };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 5 -- OAST Integration (stub)
  // ══════════════════════════════════════════════════════════════
  mods.oast = (function () {
    var session = null;

    async function register() {
      return {
        ok: false,
        reason: 'oast.fun does not implement the interactsh register protocol. Provide a self-hosted interactsh-server URL to enable.'
      };
    }

    function unique(label) {
      var id = Math.random().toString(36).slice(2, 10);
      if (!session) return id + '.' + (label || 'rs') + '.oast.local';
      return id + '.' + (label || 'rs') + '.' + session.domain;
    }

    async function poll() { return { ok: false, reason: 'not registered' }; }
    async function watchLoop() { return { ok: false, reason: 'not registered' }; }

    return { register: register, unique: unique, poll: poll, watchLoop: watchLoop, session: function () { return session; } };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 6 -- Report Exporters
  // ══════════════════════════════════════════════════════════════
  mods.exporters = (function () {

    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    function toBurpIssue(finding) {
      var cvss = mods.cvss.autoScore(finding);
      return {
        serial_number: '1',
        type: '1049088',
        name: finding.name || 'Finding',
        host: {
          ip: '',
          hostname: scope.currentHost,
          port: location.port || (location.protocol === 'https:' ? '443' : '80'),
          protocol: location.protocol.replace(':', '')
        },
        location: { url: finding.url || location.href },
        severity: cvss.severity.toLowerCase(),
        confidence: finding.confidence === 'FIRM' ? 'firm' : 'tentative',
        issue_background: '',
        remediation_background: '',
        issue_detail: (finding.issue || '') + '\n\nCVSS: ' + cvss.vector + '\nScore: ' + cvss.score,
        remediation_detail: finding.remediation || ''
      };
    }

    function toBurpXML(findings) {
      var items = findings.map(function (f) {
        var i = toBurpIssue(f);
        return '<issue>'
          + '<serialNumber>' + i.serial_number + '</serialNumber>'
          + '<type>' + i.type + '</type>'
          + '<name>' + esc(i.name) + '</name>'
          + '<host ip="' + esc(i.host.ip) + '">' + esc(i.host.hostname) + '</host>'
          + '<path>' + esc(i.location.url) + '</path>'
          + '<location>' + esc(i.location.url) + '</location>'
          + '<severity>' + i.severity + '</severity>'
          + '<confidence>' + i.confidence + '</confidence>'
          + '<issueBackground>' + esc(i.issue_background) + '</issueBackground>'
          + '<issueDetail>' + esc(i.issue_detail) + '</issueDetail>'
          + '<remediationBackground>' + esc(i.remediation_background) + '</remediationBackground>'
          + '<remediationDetail>' + esc(i.remediation_detail) + '</remediationDetail>'
          + '</issue>';
      }).join('');
      return '<?xml version="1.0"?><issues burpVersion="2024.1">' + items + '</issues>';
    }

    function toHAR(requests) {
      return {
        log: {
          version: '1.2',
          creator: { name: 'ReconStrike', version: '13.2' },
          entries: requests.map(function (r) {
            return {
              startedDateTime: new Date(r.timestamp || Date.now()).toISOString(),
              time: 0,
              request: { method: r.method, url: r.url, httpVersion: 'HTTP/1.1', headers: [], queryString: [], cookies: [], headersSize: -1, bodySize: -1 },
              response: { status: 0, statusText: '', httpVersion: 'HTTP/1.1', headers: [], cookies: [], content: { size: 0, mimeType: '' }, redirectURL: '', headersSize: -1, bodySize: -1 },
              cache: {},
              timings: { send: 0, wait: 0, receive: 0 }
            };
          })
        }
      };
    }

    function toNucleiTemplate(finding) {
      var name = String(finding.name || 'finding').toLowerCase().replace(/\W+/g, '-');
      var cvss = mods.cvss.autoScore(finding);
      return 'id: ' + name + '\n'
        + 'info:\n'
        + '  name: ' + (finding.name || 'Finding') + '\n'
        + '  author: reconstrike\n'
        + '  severity: ' + cvss.severity.toLowerCase() + '\n'
        + '  description: ' + (finding.issue || '') + '\n'
        + 'requests:\n'
        + '  - method: GET\n'
        + '    path:\n'
        + '      - "{{BaseURL}}' + (finding.path || '/') + '"\n'
        + '    matchers:\n'
        + '      - type: word\n'
        + '        words:\n'
        + '          - "' + String(finding.marker || '').replace(/"/g, '\\"') + '"\n';
    }

    function toMarkdown(findings) {
      var md = '# ReconStrike Report\n\n';
      md += '**Host:** ' + scope.currentHost + '\n';
      md += '**Generated:** ' + new Date().toISOString() + '\n';
      md += '**Findings:** ' + findings.length + '\n\n';
      findings.forEach(function (f, i) {
        var cvss = mods.cvss.autoScore(f);
        md += '## ' + (i + 1) + '. ' + (f.name || 'Finding') + '\n';
        md += '- **CVSS:** ' + cvss.score + ' (' + cvss.severity + ') -- `' + cvss.vector + '`\n';
        md += '- **Location:** `' + (f.url || location.href) + '`\n';
        md += '- **Issue:** ' + (f.issue || f.detail || '') + '\n';
        if (f.snippet) md += '- **Snippet:** `' + String(f.snippet).slice(0, 300) + '`\n';
        md += '\n';
      });
      return md;
    }

    function toHackerOne(findings) {
      if (!findings.length) return '{}';
      var sorted = findings.slice().sort(function (a, b) {
        return mods.cvss.autoScore(b).score - mods.cvss.autoScore(a).score;
      });
      var top = sorted[0];
      var cvss = mods.cvss.autoScore(top);
      return JSON.stringify({
        title: (top.name || 'Finding') + ' on ' + scope.currentHost,
        vulnerability_information: findings.map(function (f) {
          return '- ' + f.name + ': ' + (f.issue || f.detail || '');
        }).join('\n'),
        severity: cvss.severity.toLowerCase(),
        cvss_vector: cvss.vector,
        impact: findings.map(function (f) { return f.issue || f.detail; }).filter(Boolean).join('\n'),
        structured_scope: [{ asset_identifier: scope.currentHost, asset_type: 'URL' }]
      }, null, 2);
    }

    function download(data, name, mime) {
      var b = new Blob(
        [typeof data === 'string' ? data : JSON.stringify(data, null, 2)],
        { type: mime || 'text/plain' }
      );
      var a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = name;
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    }

    return {
      toBurpXML: toBurpXML,
      toBurpIssue: toBurpIssue,
      toHAR: toHAR,
      toNucleiTemplate: toNucleiTemplate,
      toMarkdown: toMarkdown,
      toHackerOne: toHackerOne,
      download: download
    };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 7 -- Webhook Notifier
  // ══════════════════════════════════════════════════════════════
  mods.notify = (function () {
    var config = { slack: null, discord: null, minSeverity: 'HIGH' };
    var SEV_RANK = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0 };

    function setConfig(c) {
      config = Object.assign({}, config, c || {});
    }

    async function send(finding) {
      var sev = mods.cvss.autoScore(finding).severity;
      if (SEV_RANK[sev] < SEV_RANK[config.minSeverity]) return { skipped: true };

      var text = '[' + sev + '] ' + (finding.name || 'Finding') + ' on ' + scope.currentHost + '\n'
        + (finding.issue || finding.detail || '') + '\n'
        + (finding.url || '');

      var results = [];
      if (config.slack) {
        try {
          var r = await fetch(config.slack, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text })
          });
          results.push({ slack: r.status });
        } catch (e) { results.push({ slack: e.message }); }
      }
      if (config.discord) {
        try {
          var r2 = await fetch(config.discord, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: text })
          });
          results.push({ discord: r2.status });
        } catch (e) { results.push({ discord: e.message }); }
      }
      return { sent: true, results: results };
    }

    eventBus.on('finding:new', function (f) {
      if (f && f.name) send(f).catch(function () {});
    });

    return { setConfig: setConfig, send: send };
  })();

  // ══════════════════════════════════════════════════════════════
  // MODULE 8 -- Scheduled Background Scans
  // ══════════════════════════════════════════════════════════════
  mods.scheduler = (function () {
    var jobId = null;

    async function start(opts) {
      opts = opts || {};
      var intervalMs = typeof opts.intervalMs === 'number' ? opts.intervalMs : 60000;
      var task = opts.task;
      stop();
      if (typeof task !== 'function') return { ok: false, reason: 'no task function' };
      jobId = setInterval(async function () {
        try {
          await task();
          eventBus.emit('scheduler:tick', { t: Date.now() });
        } catch (e) {
          eventBus.emit('scheduler:error', { error: e.message || String(e) });
        }
      }, intervalMs);
      return { ok: true, intervalMs: intervalMs };
    }

    function stop() {
      if (jobId) {
        clearInterval(jobId);
        jobId = null;
      }
    }

    function status() {
      return { running: !!jobId };
    }

    return { start: start, stop: stop, status: status };
  })();

  core.exporters = mods.exporters;

  eventBus.emit('automation:ready', {
    modules: ['crawler', 'diff', 'cvss', 'triage', 'oast', 'exporters', 'notify', 'scheduler']
  });

  if (typeof completion === 'function') completion(true);
})();