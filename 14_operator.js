// language: JavaScript, file: 14_operator.js, target: modern browsers
// OPERATOR -- Time Machine: snapshots, diffs, unified reports

(function () {
  'use strict';
  if (!window.ReconCore) return;
  var core = window.ReconCore;
  var eventBus = core.eventBus;
  var storage = core.storage;
  var scope = core.scope;
  var mods = core.modules = core.modules || {};

  var TRACKED_STORES = [
    'endpoints','secrets','cors','jwt','forms','cookies','sri',
    'sw','srcmaps','storage','network','graphql','meta'
  ];
  var MAX_IDS_PER_STORE = 2000;
  var MAX_SNAPSHOTS_PER_HOST = 30;

  // ══════════════════════════════════════════════════════════════
  // SNAPSHOT
  // ══════════════════════════════════════════════════════════════
  async function collectIds(store) {
    var rows;
    try { rows = await storage.getAll(store); }
    catch (e) { return []; }
    if (store === 'meta') {
      rows = rows.filter(function (r) {
        return r && r.kind && r.kind !== 'snapshot';
      });
    }
    var seen = {};
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r || !r.id) continue;
      if (seen[r.id]) continue;
      seen[r.id] = true;
      out.push(r.id);
      if (out.length >= MAX_IDS_PER_STORE) break;
    }
    return out;
  }

  function previewFor(store, row) {
    try {
      if (store === 'endpoints') return row.url || '';
      if (store === 'secrets') return (row.name || 'secret') + ' -- ' + (row.maskedValue || '');
      if (store === 'cors') return (row.url || '') + ' -- ' + (row.risk || '');
      if (store === 'jwt') return (row.source || 'jwt') + ' -- alg=' + ((row.header && row.header.alg) || '?');
      if (store === 'forms') return (row.method || '') + ' ' + (row.action || '');
      if (store === 'cookies') return row.name || '';
      if (store === 'sri') return row.url || '';
      if (store === 'sw') return row.scope || '';
      if (store === 'srcmaps') return row.mapUrl || '';
      if (store === 'storage') return (row.store || '') + ':' + (row.key || '');
      if (store === 'network') return (row.method || '') + ' ' + (row.url || '');
      if (store === 'graphql') return row.endpoint || '';
      if (row.kind) {
        var extra = row.url || row.endpoint || row.name || row.exploit || row.rule || '';
        return row.kind + (extra ? ' -- ' + extra : '');
      }
      return JSON.stringify(row).slice(0, 80);
    } catch (e) { return ''; }
  }

  async function snapshot(label) {
    var host = scope.currentHost;
    var at = Date.now();
    var id = 'snap::' + host + '::' + at;

    var counts = {};
    var ids = {};
    var samples = {};
    var total = 0;

    for (var i = 0; i < TRACKED_STORES.length; i++) {
      var s = TRACKED_STORES[i];
      var list = await collectIds(s);
      counts[s] = list.length;
      ids[s] = list;

      var rows = [];
      try { rows = await storage.getAll(s); }
      catch (e) { rows = []; }
      if (s === 'meta') {
        rows = rows.filter(function (r) { return r && r.kind && r.kind !== 'snapshot'; });
      }
      var byId = {};
      for (var j = 0; j < rows.length; j++) {
        if (rows[j] && rows[j].id) byId[rows[j].id] = rows[j];
      }
      var samplesList = [];
      for (var k = 0; k < list.length && samplesList.length < 20; k++) {
        var row = byId[list[k]];
        if (!row) continue;
        samplesList.push({ id: list[k], preview: previewFor(s, row) });
      }
      samples[s] = samplesList;
      total += list.length;
    }

    var payload = {
      kind: 'snapshot',
      label: label || 'auto',
      host: host,
      url: location.href,
      at: at,
      counts: counts,
      ids: ids,
      samples: samples,
      total: total
    };

    try { await storage.put('meta', payload, id); }
    catch (e) {}

    await pruneSnapshots(host);
    eventBus.emit('operator:snapshot', { id: id, at: at, label: payload.label, total: total });
    return { ok: true, id: id, at: at, counts: counts, total: total };
  }

  async function pruneSnapshots(host) {
    try {
      var all = await storage.getAll('meta');
      var snaps = all.filter(function (r) {
        return r && r.kind === 'snapshot' && r.host === host;
      });
      if (snaps.length <= MAX_SNAPSHOTS_PER_HOST) return;
      snaps.sort(function (a, b) { return a.at - b.at; });
      var toRemove = snaps.slice(0, snaps.length - MAX_SNAPSHOTS_PER_HOST);
      for (var i = 0; i < toRemove.length; i++) {
        try { await storage.remove('meta', toRemove[i].id); } catch (e) {}
      }
    } catch (e) {}
  }

  // ══════════════════════════════════════════════════════════════
  // LIST / GET / REMOVE
  // ══════════════════════════════════════════════════════════════
  async function list(hostFilter) {
    var host = hostFilter || scope.currentHost;
    var all;
    try { all = await storage.getAll('meta'); }
    catch (e) { all = []; }
    var snaps = all.filter(function (r) {
      return r && r.kind === 'snapshot' && r.host === host;
    });
    snaps.sort(function (a, b) { return b.at - a.at; });
    return snaps.map(function (r) {
      return {
        id: r.id,
        at: r.at,
        label: r.label || 'auto',
        total: r.total || 0,
        counts: r.counts || {}
      };
    });
  }

  async function get(id) {
    try { return await storage.get('meta', id); }
    catch (e) { return null; }
  }

  async function remove(id) {
    try { await storage.remove('meta', id); return { ok: true }; }
    catch (e) { return { ok: false, error: e.message }; }
  }

  // ══════════════════════════════════════════════════════════════
  // DIFF
  // ══════════════════════════════════════════════════════════════
  function indexById(snap, store) {
    var out = {};
    var list = (snap.ids && snap.ids[store]) || [];
    var samples = (snap.samples && snap.samples[store]) || [];
    for (var i = 0; i < list.length; i++) out[list[i]] = true;
    var prev = {};
    for (var j = 0; j < samples.length; j++) {
      prev[samples[j].id] = samples[j].preview;
    }
    return { ids: out, previews: prev };
  }

  async function diff(idA, idB) {
    var A = await get(idA);
    var B = await get(idB);
    if (!A || !B) return { ok: false, reason: 'snapshot not found' };

    var perStore = {};
    var totalAdded = 0;
    var totalRemoved = 0;
    var totalKept = 0;

    for (var i = 0; i < TRACKED_STORES.length; i++) {
      var s = TRACKED_STORES[i];
      var IA = indexById(A, s);
      var IB = indexById(B, s);

      var addedIds = [];
      var removedIds = [];
      var kept = 0;

      var keysB = Object.keys(IB.ids);
      for (var j = 0; j < keysB.length; j++) {
        if (IA.ids[keysB[j]]) kept++;
        else addedIds.push(keysB[j]);
      }
      var keysA = Object.keys(IA.ids);
      for (var k = 0; k < keysA.length; k++) {
        if (!IB.ids[keysA[k]]) removedIds.push(keysA[k]);
      }

      var addedPrev = addedIds.slice(0, 30).map(function (id) {
        return { id: id, preview: IB.previews[id] || null };
      });
      var removedPrev = removedIds.slice(0, 30).map(function (id) {
        return { id: id, preview: IA.previews[id] || null };
      });

      perStore[s] = {
        added: addedIds.length,
        removed: removedIds.length,
        kept: kept,
        addedPreview: addedPrev,
        removedPreview: removedPrev
      };

      totalAdded += addedIds.length;
      totalRemoved += removedIds.length;
      totalKept += kept;
    }

    var summary = {
      host: A.host,
      fromAt: A.at,
      toAt: B.at,
      fromLabel: A.label,
      toLabel: B.label,
      spanMs: B.at - A.at,
      totalAdded: totalAdded,
      totalRemoved: totalRemoved,
      totalKept: totalKept,
      perStore: perStore
    };

    eventBus.emit('operator:diff', summary);
    return { ok: true, summary: summary, a: A, b: B };
  }

  async function diffAgainstLatest() {
    var snaps = await list();
    if (!snaps.length) return { ok: false, reason: 'no snapshots yet' };
    var latest = snaps[0];

    var live = {
      host: scope.currentHost,
      at: Date.now(),
      label: 'live-now',
      ids: {},
      samples: {},
      counts: {}
    };

    for (var i = 0; i < TRACKED_STORES.length; i++) {
      var s = TRACKED_STORES[i];
      var rows;
      try { rows = await storage.getAll(s); }
      catch (e) { rows = []; }
      if (s === 'meta') {
        rows = rows.filter(function (r) { return r && r.kind && r.kind !== 'snapshot'; });
      }
      var seen = {};
      var idList = [];
      var sampleList = [];
      for (var j = 0; j < rows.length; j++) {
        var r = rows[j];
        if (!r || !r.id || seen[r.id]) continue;
        seen[r.id] = true;
        idList.push(r.id);
        if (sampleList.length < 20) {
          sampleList.push({ id: r.id, preview: previewFor(s, r) });
        }
        if (idList.length >= MAX_IDS_PER_STORE) break;
      }
      live.ids[s] = idList;
      live.samples[s] = sampleList;
      live.counts[s] = idList.length;
    }

    var originalGet = get;
    get = async function (id) {
      if (id === '__live__') return live;
      return originalGet(id);
    };
    var r = await diff(latest.id, '__live__');
    get = originalGet;
    return r;
  }

  // ══════════════════════════════════════════════════════════════
  // AUTO-REPORT
  // ══════════════════════════════════════════════════════════════
  async function generateReport(format) {
    format = format || 'markdown';
    var host = scope.currentHost;
    var now = new Date().toISOString();

    var eps = await safeAll('endpoints');
    var sec = await safeAll('secrets');
    var cors = await safeAll('cors');
    var jwt = await safeAll('jwt');
    var forms = await safeAll('forms');
    var cks = await safeAll('cookies');
    var sri = await safeAll('sri');
    var meta = await safeAll('meta');

    var chains = meta.filter(function (m) { return m.kind === 'chain-candidate'; });
    var argusHits = meta.filter(function (m) { return m.kind === 'argus-hit'; });
    var pulsarHits = meta.filter(function (m) { return /^pulsar-/.test(m.kind || ''); });
    var validations = meta.filter(function (m) { return m.kind === 'secret-validation'; });
    var cspItems = meta.filter(function (m) { return m.kind === 'csp'; });
    var oastHits = meta.filter(function (m) { return m.kind === 'oast-hit'; });

    var validSecrets = validations.filter(function (v) { return v.valid === true; });
    var criticalChains = chains.filter(function (c) { return c.severity === 'CRITICAL'; });

    var counts = {
      endpoints: eps.length,
      secrets: sec.length,
      cors: cors.length,
      jwt: jwt.length,
      forms: forms.length,
      cookies: cks.length,
      sri: sri.length,
      chains: chains.length,
      criticalChains: criticalChains.length,
      argusHits: argusHits.length,
      pulsarHits: pulsarHits.length,
      validSecrets: validSecrets.length,
      oastInteractions: oastHits.length
    };

    if (format === 'json') {
      return JSON.stringify({
        host: host,
        url: location.href,
        generated: now,
        summary: counts,
        chains: chains,
        validSecrets: validSecrets,
        cors: cors.filter(function (c) { return c.risk === 'CRITICAL' || c.risk === 'HIGH'; }),
        csp: cspItems,
        argusHits: argusHits.slice(-50),
        pulsarHits: pulsarHits.slice(-50),
        oastInteractions: oastHits.slice(-50),
        endpoints: eps.slice(-200),
        secrets: sec.map(function (s) {
          return { name: s.name, severity: s.severity, masked: s.maskedValue, source: s.source };
        }),
        jwt: jwt.map(function (j) {
          return { source: j.source, alg: j.header && j.header.alg, admin: j.hasAdminRole };
        }),
        forms: forms,
        cookies: cks,
        sri: sri
      }, null, 2);
    }

    if (format === 'hackerone') {
      var primary = criticalChains[0] || chains[0];
      if (!primary) {
        return JSON.stringify({
          title: 'Recon findings on ' + host,
          vulnerability_information: 'No exploit chains detected. Structured findings available.',
          severity: 'low',
          structured_scope: [{ asset_identifier: host, asset_type: 'URL' }]
        }, null, 2);
      }
      return JSON.stringify({
        title: primary.title || ('Vulnerability chain on ' + host),
        vulnerability_information: primary.narrative || '',
        severity: String(primary.severity || 'high').toLowerCase(),
        cvss_vector: primary.cvss || '',
        impact: (primary.poc || []).join('\n'),
        remediation: (primary.remediation || []).join('\n'),
        structured_scope: [{ asset_identifier: host, asset_type: 'URL' }]
      }, null, 2);
    }

    // Markdown
    var md = '';
    md += '# ReconStrike Report\n\n';
    md += '**Target:** `' + host + '`\n\n';
    md += '**URL:** ' + location.href + '\n\n';
    md += '**Generated:** ' + now + '\n\n';
    md += '---\n\n';

    md += '## Summary\n\n';
    md += '| Category | Count |\n|---|---|\n';
    md += '| Endpoints | ' + counts.endpoints + ' |\n';
    md += '| Secrets | ' + counts.secrets + ' |\n';
    md += '| Valid Secrets | **' + counts.validSecrets + '** |\n';
    md += '| CORS issues | ' + counts.cors + ' |\n';
    md += '| JWT tokens | ' + counts.jwt + ' |\n';
    md += '| Forms | ' + counts.forms + ' |\n';
    md += '| Cookies | ' + counts.cookies + ' |\n';
    md += '| SRI issues | ' + counts.sri + ' |\n';
    md += '| **Attack chains** | **' + counts.chains + '** |\n';
    md += '| Critical chains | ' + counts.criticalChains + ' |\n';
    md += '| ARGUS hits | ' + counts.argusHits + ' |\n';
    md += '| PULSAR hits | ' + counts.pulsarHits + ' |\n';
    md += '| OAST interactions | ' + counts.oastInteractions + ' |\n\n';

    if (chains.length) {
      md += '## Attack Chains\n\n';
      var order = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      chains.sort(function (a, b) { return (order[b.severity] || 0) - (order[a.severity] || 0); });
      chains.forEach(function (c, i) {
        md += '### ' + (i + 1) + '. ' + (c.title || 'chain') + '\n\n';
        md += '**Severity:** ' + c.severity + '  \n';
        if (c.cvss) md += '**CVSS:** `' + c.cvss + '`  \n';
        md += '\n' + (c.narrative || '') + '\n\n';
        if (c.poc && c.poc.length) {
          md += '**Steps:**\n\n';
          c.poc.forEach(function (s) { md += '- ' + s + '\n'; });
          md += '\n';
        }
        if (c.remediation && c.remediation.length) {
          md += '**Remediation:**\n\n';
          c.remediation.forEach(function (s) { md += '- ' + s + '\n'; });
          md += '\n';
        }
        md += '---\n\n';
      });
    }

    if (validSecrets.length) {
      md += '## Valid Secrets (live)\n\n';
      validSecrets.forEach(function (v) {
        md += '- **' + v.name + '** -- ' + (v.subject || v.evidence || 'validated') + '\n';
        if (v.evidence) md += '  - ' + v.evidence + '\n';
        if (v.scopes) md += '  - scopes: ' + v.scopes + '\n';
      });
      md += '\n';
    }

    var riskyCors = cors.filter(function (c) { return c.risk === 'CRITICAL' || c.risk === 'HIGH'; });
    if (riskyCors.length) {
      md += '## CORS\n\n';
      riskyCors.forEach(function (c) {
        md += '- **' + c.risk + '** `' + (c.url || '') + '` -- ' + (c.issue || '') + '\n';
      });
      md += '\n';
    }

    if (cspItems.length) {
      md += '## CSP Findings\n\n';
      cspItems.forEach(function (c) {
        var findings = c.findings || [];
        if (findings.length) {
          md += '- `' + (c.url || c.host || '') + '` (' + c.source + ')\n';
          findings.forEach(function (f) {
            md += '  - [' + f.sev + '] ' + f.issue + '\n';
          });
        }
      });
      md += '\n';
    }

    if (argusHits.length) {
      md += '## ARGUS Autonomous Hits\n\n';
      argusHits.slice(-30).reverse().forEach(function (h) {
        md += '- **' + (h.method || 'GET') + '** `' + (h.url || '') + '` -- ' + (h.status || '') + '  \n';
        (h.notes || []).forEach(function (n) { md += '  - ' + n + '\n'; });
      });
      md += '\n';
    }

    if (pulsarHits.length) {
      md += '## PULSAR Fuzzing Hits\n\n';
      pulsarHits.slice(-30).reverse().forEach(function (p) {
        var pth = p.path || p.param || p.header || '';
        md += '- **' + p.kind + '** `' + (p.url || '') + '`' + (pth ? ' -- ' + pth : '') + ' (' + (p.status || '') + ')\n';
      });
      md += '\n';
    }

    if (oastHits.length) {
      md += '## OAST Interactions\n\n';
      oastHits.slice(-20).reverse().forEach(function (o) {
        md += '- **' + (o.method || 'GET') + '** from `' + (o.ip || '') + '` -- ' + (o.path || '') + '  \n';
        md += '  - UA: `' + String(o.ua || '').slice(0, 80) + '`\n';
      });
      md += '\n';
    }

    md += '## Appendix -- Top Endpoints\n\n';
    eps.slice(-50).reverse().forEach(function (e) {
      md += '- `' + (e.url || '') + '`';
      if (e.interestScore) md += ' _(score ' + e.interestScore + ')_';
      md += '\n';
    });
    md += '\n';

    return md;
  }

  async function safeAll(store) {
    try { return await storage.getAll(store); }
    catch (e) { return []; }
  }

  async function downloadReport(format) {
    format = format || 'markdown';
    var body = await generateReport(format);
    var mime = (format === 'json' || format === 'hackerone') ? 'application/json' : 'text/markdown';
    var ext = format === 'markdown' ? 'md' : 'json';
    var blob = new Blob([body], { type: mime });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'reconstrike-report-' + scope.currentHost + '-' + Date.now() + '.' + ext;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
    return { ok: true, len: body.length, format: format };
  }

  // ══════════════════════════════════════════════════════════════
  // AUTO-SNAPSHOT
  // ══════════════════════════════════════════════════════════════
  var autoTimer = null;
  var autoEnabled = true;

  function scheduleAuto(label) {
    if (!autoEnabled) return;
    if (autoTimer) clearTimeout(autoTimer);
    autoTimer = setTimeout(function () {
      autoTimer = null;
      snapshot(label || 'auto').catch(function () {});
    }, 3000);
  }

  eventBus.on('crawler:done', function () { scheduleAuto('post-crawl'); });
  eventBus.on('pulsar:done', function () { scheduleAuto('post-pulsar'); });
  eventBus.on('correlator:done', function () { scheduleAuto('post-correlator'); });

  function setAuto(v) {
    autoEnabled = !!v;
    return { auto: autoEnabled };
  }

  // ══════════════════════════════════════════════════════════════
  // PUBLIC
  // ══════════════════════════════════════════════════════════════
  mods.operator = {
    snapshot: snapshot,
    list: list,
    get: get,
    remove: remove,
    diff: diff,
    diffAgainstLatest: diffAgainstLatest,
    report: generateReport,
    downloadReport: downloadReport,
    setAuto: setAuto,
    autoEnabled: function () { return autoEnabled; }
  };
  core.operator = mods.operator;

  eventBus.emit('operator:ready', { stores: TRACKED_STORES.length, max: MAX_SNAPSHOTS_PER_HOST });

  if (typeof completion === 'function') completion(true);
})();