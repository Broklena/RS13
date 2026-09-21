// language: JavaScript, file: 10_validators.js, target: modern browsers
// ReconStrike V14 -- Active Validators (secrets + endpoints)

(function () {
  'use strict';
  if (!window.ReconCore) return;
  var core = window.ReconCore;
  var eventBus = core.eventBus;
  var storage = core.storage;
  var mods = core.modules = core.modules || {};

  async function tryFetch(url, opts) {
    opts = opts || {};
    try {
      return await fetch(url, Object.assign({
        method: 'GET',
        credentials: 'omit',
        mode: 'cors',
        redirect: 'follow'
      }, opts));
    } catch (e) {
      if (core.remote && core.remote.proxiedFetch) {
        try {
          var d = await core.remote.proxiedFetch(url, {
            method: opts.method || 'GET',
            headers: opts.headers || {},
            body: opts.body
          });
          return {
            ok: d.status >= 200 && d.status < 300,
            status: d.status,
            headers: {
              get: function (k) { return (d.headers || {})[String(k).toLowerCase()] || null; }
            },
            json: async function () { try { return JSON.parse(d.body); } catch (err) { return null; } },
            text: async function () { return d.body || ''; },
            _viaProxy: true
          };
        } catch (e2) {}
      }
      throw e;
    }
  }

  var VALIDATORS = {};

  VALIDATORS['GitHub PAT'] = async function (token) {
    try {
      var r = await tryFetch('https://api.github.com/user', {
        headers: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });
      if (r.status === 401) return { valid: false, reason: 'token rejected (401)' };
      if (!r.ok) return { valid: false, reason: 'status ' + r.status };
      var user = await r.json();

      var scopes = r.headers.get('x-oauth-scopes') || '';
      var repos = [];
      try {
        var rr = await tryFetch('https://api.github.com/user/repos?per_page=10&sort=updated', {
          headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' }
        });
        if (rr.ok) {
          var list = await rr.json();
          repos = (list || []).map(function (x) {
            return (x.full_name || '?') + (x.private ? ' [PRIVATE]' : '');
          });
        }
      } catch (e) {}

      return {
        valid: true,
        subject: user.login,
        scopes: scopes,
        repos: repos,
        evidence: 'Authenticated as @' + user.login + ' -- ' + repos.length + ' repos visible'
      };
    } catch (e) {
      return { valid: null, error: e.message };
    }
  };

  VALIDATORS['Stripe Secret'] = async function (key) {
    try {
      var r = await tryFetch('https://api.stripe.com/v1/charges?limit=1', {
        headers: { Authorization: 'Bearer ' + key }
      });
      if (r.status === 401) return { valid: false, reason: 'rejected (401)' };
      if (!r.ok) return { valid: false, reason: 'status ' + r.status };
      var d = await r.json();
      var balance = null;
      try {
        var br = await tryFetch('https://api.stripe.com/v1/balance', {
          headers: { Authorization: 'Bearer ' + key }
        });
        if (br.ok) balance = await br.json();
      } catch (e) {}
      return {
        valid: true,
        chargesVisible: (d && d.data ? d.data.length : 0),
        balance: balance,
        evidence: 'Live Stripe secret key -- charges list accessible'
      };
    } catch (e) {
      return { valid: null, error: e.message };
    }
  };

  VALIDATORS['Stripe Restricted'] = VALIDATORS['Stripe Secret'];

  VALIDATORS['OpenAI Key'] = async function (key) {
    try {
      var r = await tryFetch('https://api.openai.com/v1/models', {
        headers: { Authorization: 'Bearer ' + key }
      });
      if (r.status === 401) return { valid: false, reason: 'rejected (401)' };
      if (r.status === 403) return { valid: false, reason: 'forbidden (403)' };
      if (!r.ok) return { valid: false, reason: 'status ' + r.status };
      var d = await r.json();
      var models = (d && d.data ? d.data : []).map(function (x) { return x.id; });
      return {
        valid: true,
        modelCount: models.length,
        sample: models.slice(0, 8),
        evidence: 'OpenAI key works -- ' + models.length + ' models accessible'
      };
    } catch (e) {
      return { valid: null, error: e.message };
    }
  };

  VALIDATORS['Anthropic Key'] = async function (key) {
    try {
      var r = await tryFetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: '.' }]
        })
      });
      if (r.status === 401) return { valid: false, reason: 'rejected (401)' };
      if (r.status === 403) return { valid: false, reason: 'forbidden (403)' };
      if (r.status === 200 || r.status === 400) return { valid: true, evidence: 'Key accepted by Anthropic API' };
      return { valid: false, reason: 'status ' + r.status };
    } catch (e) {
      return { valid: null, error: e.message };
    }
  };

  VALIDATORS['Slack'] = async function (token) {
    if (/xoxb-|xoxp-/.test(token)) {
      try {
        var r = await tryFetch('https://slack.com/api/auth.test?token=' + encodeURIComponent(token));
        var d = await r.json();
        if (d && d.ok) return { valid: true, evidence: 'Authenticated as ' + (d.user || '?') + ' in ' + (d.team || '?') };
        return { valid: false, reason: (d && d.error) || 'rejected' };
      } catch (e) {
        return { valid: null, error: e.message };
      }
    }
    if (/hooks\.slack\.com/.test(token)) {
      try {
        var r2 = await tryFetch(token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: 'ReconStrike validation ping' })
        });
        if (r2.status === 200) return { valid: true, evidence: 'Webhook accepted payload' };
        return { valid: false, reason: 'webhook returned ' + r2.status };
      } catch (e) {
        return { valid: null, error: e.message };
      }
    }
    return { valid: null, reason: 'unrecognized slack token format' };
  };

  VALIDATORS['SendGrid'] = async function (key) {
    try {
      var r = await tryFetch('https://api.sendgrid.com/v3/scopes', {
        headers: { Authorization: 'Bearer ' + key }
      });
      if (r.status === 401) return { valid: false, reason: 'rejected (401)' };
      if (!r.ok) return { valid: false, reason: 'status ' + r.status };
      var d = await r.json();
      var scopes = (d && d.scopes) || [];
      return {
        valid: true,
        scopes: scopes.length,
        sample: scopes.slice(0, 8),
        evidence: 'SendGrid key works -- ' + scopes.length + ' scopes'
      };
    } catch (e) {
      return { valid: null, error: e.message };
    }
  };

  VALIDATORS['Twilio SID'] = async function (sid) {
    try {
      var r = await tryFetch('https://api.twilio.com/2010-04-01/Accounts/' + sid + '.json');
      if (r.status === 401) return { valid: false, reason: 'needs auth token (SID format valid)' };
      if (!r.ok) return { valid: false, reason: 'status ' + r.status };
      return { valid: true, evidence: 'Twilio account SID format valid' };
    } catch (e) {
      return { valid: null, error: e.message };
    }
  };

  VALIDATORS['Google API'] = async function (key) {
    try {
      var r = await tryFetch('https://maps.googleapis.com/maps/api/geocode/json?address=1600+Amphitheatre+Parkway&key=' + encodeURIComponent(key));
      if (r.status === 403) {
        var d = await r.json().catch(function () { return null; });
        if (d && d.error_message && /not authorized/i.test(d.error_message)) {
          return { valid: true, evidence: 'API key valid but service not enabled', error: d.error_message };
        }
        return { valid: false, reason: 'forbidden -- ' + (d && d.error_message || 'check API restrictions') };
      }
      if (!r.ok) return { valid: false, reason: 'status ' + r.status };
      var d2 = await r.json();
      if (d2 && d2.status === 'OK') return { valid: true, evidence: 'Geocoding API accessible' };
      if (d2 && d2.status === 'REQUEST_DENIED') return { valid: false, reason: d2.error_message || 'denied' };
      return { valid: true, evidence: 'Key accepted, response: ' + (d2 && d2.status || '?') };
    } catch (e) {
      return { valid: null, error: e.message };
    }
  };

  VALIDATORS['Supabase'] = async function (key) {
    try {
      var r = await tryFetch('https://api.supabase.com/v1/projects', {
        headers: { Authorization: 'Bearer ' + key }
      });
      if (r.status === 401) return { valid: false, reason: 'rejected (401)' };
      if (!r.ok) return { valid: false, reason: 'status ' + r.status };
      var d = await r.json();
      return {
        valid: true,
        projects: (d || []).length,
        evidence: 'Supabase management key -- ' + (d || []).length + ' projects'
      };
    } catch (e) {
      return { valid: null, error: e.message };
    }
  };

  VALIDATORS['HuggingFace'] = async function (token) {
    try {
      var r = await tryFetch('https://huggingface.co/api/whoami-v2', {
        headers: { Authorization: 'Bearer ' + token }
      });
      if (r.status === 401) return { valid: false, reason: 'rejected (401)' };
      if (!r.ok) return { valid: false, reason: 'status ' + r.status };
      var d = await r.json();
      return {
        valid: true,
        user: d.name,
        orgs: (d.orgs || []).map(function (o) { return o.name; }),
        evidence: 'HF token -- user ' + (d.name || '?')
      };
    } catch (e) {
      return { valid: null, error: e.message };
    }
  };

  VALIDATORS['AWS Access Key'] = async function (key) {
    return {
      valid: null,
      reason: 'AWS SigV4 requires HMAC-SHA256 with secret -- cannot validate client-side. Test: aws sts get-caller-identity --access-key-id ' + key
    };
  };

  VALIDATORS['Private Key'] = async function () {
    return {
      valid: null,
      reason: 'PEM private key detected. Usage requires infrastructure context (SSH target or TLS cert).'
    };
  };

  async function validateSecret(secret) {
    var v = VALIDATORS[secret.name];
    if (!v) return { name: secret.name, valid: null, reason: 'no validator for this type' };
    try {
      var r = await v(secret.value);
      r.name = secret.name;
      r.masked = secret.maskedValue;

      try {
        await storage.put('meta', {
          kind: 'secret-validation',
          name: secret.name,
          masked: secret.maskedValue,
          valid: r.valid,
          subject: r.subject || null,
          scopes: r.scopes || null,
          evidence: r.evidence || null,
          reason: r.reason || null,
          error: r.error || null
        }, 'val::' + secret.name + '::' + storage.hashKey(secret.maskedValue || ''));
      } catch (e) {}

      eventBus.emit('secret:validated', r);
      return r;
    } catch (e) {
      return { name: secret.name, valid: null, error: e.message };
    }
  }

  async function validateAll(opts) {
    opts = opts || {};
    var secrets = await storage.getAll('secrets');
    var seen = {};
    var results = [];

    for (var i = 0; i < secrets.length; i++) {
      var s = secrets[i];
      if (!s.value) continue;
      var k = s.name + '::' + s.value;
      if (seen[k]) continue;
      seen[k] = true;
      if (!opts.includeLow && s.severity === 'LOW') continue;

      var r = await validateSecret(s);
      results.push(r);
      await new Promise(function (res) { setTimeout(res, 300 + Math.random() * 400); });
    }

    var valid = results.filter(function (r) { return r.valid === true; }).length;
    eventBus.emit('validators:done', { total: results.length, valid: valid });
    return { total: results.length, valid: valid, results: results };
  }

  var INTERESTING_HEADERS = [
    'server', 'x-powered-by', 'x-aspnet-version', 'x-aspnetmvc-version',
    'x-generator', 'x-drupal-cache', 'x-runtime', 'x-rack-cache',
    'x-vercel-id', 'x-amz-cf-id', 'x-served-by', 'via',
    'x-debug-token', 'x-debug-token-link', 'x-symfony-cache',
    'x-backend-server', 'x-envoy-upstream-service-time'
  ];

  async function probeEndpoint(url) {
    try {
      var t0 = Date.now();
      var r = await tryFetch(url, { method: 'GET', redirect: 'manual' });
      var ms = Date.now() - t0;

      var headers = {};
      INTERESTING_HEADERS.forEach(function (h) {
        var v = r.headers.get(h);
        if (v) headers[h] = String(v).slice(0, 200);
      });

      var location = r.headers.get('location');
      var body = '';
      var bodyLen = 0;
      if (r.status >= 200 && r.status < 500) {
        try {
          var text = await r.text();
          bodyLen = text.length;
          body = text.slice(0, 800);
        } catch (e) {}
      }

      var verdict = 'unknown';
      if (r.status === 200) verdict = 'open';
      else if (r.status === 401) verdict = 'auth-required';
      else if (r.status === 403) verdict = 'forbidden';
      else if (r.status === 404) verdict = 'not-found';
      else if (r.status >= 500) verdict = 'server-error';
      else if (r.status >= 300 && r.status < 400) verdict = 'redirect → ' + (location || '?');
      else if (r.status === 0) verdict = 'blocked';

      var result = {
        url: url,
        status: r.status,
        ms: ms,
        verdict: verdict,
        location: location,
        bodyLen: bodyLen,
        headers: headers,
        bodyPreview: body.slice(0, 200),
        viaProxy: !!r._viaProxy
      };

      try {
        await storage.put('meta', {
          kind: 'endpoint-probe',
          url: url,
          status: r.status,
          ms: ms,
          verdict: verdict,
          location: location,
          bodyLen: bodyLen,
          headers: headers
        }, 'probe::' + storage.hashKey(url));
      } catch (e) {}

      return result;
    } catch (e) {
      return { url: url, status: 0, error: e.message, verdict: 'failed' };
    }
  }

  async function probeAll(opts) {
    opts = opts || {};
    var max = opts.max || 30;
    var eps = await storage.getAll('endpoints');
    var seen = {};
    var targets = [];
    for (var i = 0; i < eps.length && targets.length < max; i++) {
      var u = eps[i].url;
      if (!u || seen[u]) continue;
      seen[u] = true;
      targets.push(u);
    }

    var results = [];
    for (var j = 0; j < targets.length; j++) {
      var r = await probeEndpoint(targets[j]);
      results.push(r);
      await new Promise(function (res) { setTimeout(res, 400 + Math.random() * 600); });
    }

    var open = results.filter(function (r) { return r.status === 200; }).length;
    var auth = results.filter(function (r) { return r.status === 401 || r.status === 403; }).length;
    var errors = results.filter(function (r) { return r.status >= 500; }).length;

    eventBus.emit('probe:done', { total: results.length, open: open, auth: auth, errors: errors });
    return { total: results.length, open: open, auth: auth, errors: errors, results: results };
  }

  // Debounced auto-validation -- يمنع التشغيل المتكرر عند تدفّق findings
  var validateTimer = null;
  eventBus.on('finding:new', function () {
    if (validateTimer) clearTimeout(validateTimer);
    validateTimer = setTimeout(function () {
      validateTimer = null;
      validateAll({ includeLow: false }).catch(function () {});
    }, 2500);
  });

  mods.validators = {
    validate: validateSecret,
    validateAll: validateAll,
    probe: probeEndpoint,
    probeAll: probeAll,
    list: function () { return Object.keys(VALIDATORS); }
  };
  core.validators = mods.validators;

  eventBus.emit('validators:ready', { count: Object.keys(VALIDATORS).length });
  if (typeof completion === 'function') completion(true);
})();