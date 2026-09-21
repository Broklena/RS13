// language: JavaScript, file: 7_scanner.js, target: modern browsers
// ReconStrike V17 -- Layer 7 Scanner (orchestrator-integrated)

(function(){
'use strict';
if(!window.ReconCore || window.__RS13_SCANNER__) return;
window.__RS13_SCANNER__ = true;

var core = window.ReconCore;
var eventBus = core.eventBus;
var storage = core.storage;
var scope = core.scope;
var mods = core.modules = core.modules || {};

var MAX_BODY = 500000;
var MAX_DOM = 500000;
var SCAN_DEBOUNCE_MS = 600;

// ── ENDPOINT RULES ──
var ENDPOINT_RULES = [
  { type: 'GraphQL', regex: /(?:https?:\/\/[^\s"'`]+)?\/(?:graphql|gql)[^\s"'`]*/gi },
  { type: 'API', regex: /(?:https?:\/\/[^\s"'`]+)?\/(?:api|v[0-9]|rest|internal|service|oauth|auth)[a-zA-Z0-9_\-.\/]*(?:\?[^\s"'`]*)?/gi },
  { type: 'Admin', regex: /(?:https?:\/\/[^\s"'`]+)?\/(?:admin|debug|dashboard|actuator|swagger|api-docs|metrics|env|profiler)[a-zA-Z0-9_\-.\/]*/gi },
  { type: 'Cloud', regex: /https?:\/\/(?:[a-zA-Z0-9.\-_]+\.s3(?:[.\-][a-z0-9\-_]+)?\.amazonaws\.com|[a-zA-Z0-9.\-_]+\.blob\.core\.windows\.net|storage\.googleapis\.com\/[a-zA-Z0-9.\-_]+)/gi },
  { type: 'WebSocket', regex: /wss?:\/\/[a-zA-Z0-9.\-_:]+(?:\/[^\s"'`]*)?/gi },
  { type: 'WellKnown', regex: /\/\.well-known\/[a-zA-Z0-9_\-.\/]*/gi }
];

// ── SECRET RULES ──
var SECRET_RULES = [
  { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/g, severity: 'CRITICAL', vrt: 'P1' },
  { name: 'AWS Secret', regex: /(?:aws_secret_access_key|aws_secret)\s*[:=]\s*["']?([A-Za-z0-9\/+=]{40})["']?/gi, severity: 'CRITICAL', vrt: 'P1' },
  { name: 'Stripe Secret', regex: /sk_live_[0-9a-zA-Z]{24,}/g, severity: 'CRITICAL', vrt: 'P1' },
  { name: 'GitHub PAT', regex: /(?:ghp|gho|ghu|ghs|ghr|github_pat)_[0-9a-zA-Z_]{36,}/g, severity: 'CRITICAL', vrt: 'P1' },
  { name: 'Private Key', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, severity: 'CRITICAL', vrt: 'P1' },
  { name: 'OpenAI Key', regex: /(?:sk-[a-zA-Z0-9]{20,}|sk-proj-[a-zA-Z0-9_\-]{40,})/g, severity: 'CRITICAL', vrt: 'P1' },
  { name: 'Anthropic Key', regex: /sk-ant-[a-zA-Z0-9_\-]{40,}/g, severity: 'CRITICAL', vrt: 'P1' },
  { name: 'HuggingFace', regex: /hf_[a-zA-Z0-9]{34}/g, severity: 'HIGH', vrt: 'P2' },
  { name: 'SendGrid', regex: /SG\.[a-zA-Z0-9_\-\.]{66}/g, severity: 'HIGH', vrt: 'P2' },
  { name: 'Supabase', regex: /sbp_[a-zA-Z0-9]{40}/g, severity: 'HIGH', vrt: 'P2' },
  { name: 'Google API', regex: /AIza[0-9A-Za-z\-_]{35}/g, severity: 'HIGH', vrt: 'P3' },
  { name: 'Slack', regex: /(?:xox[baprs]-[0-9a-zA-Z]{10,48}|hooks\.slack\.com\/services\/[A-Za-z0-9_\/\-]+)/g, severity: 'HIGH', vrt: 'P2' },
  { name: 'JWT', regex: /eyJ[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_.+/=]*/g, severity: 'HIGH', vrt: 'P2' },
  { name: 'Firebase URL', regex: /https:\/\/[a-z0-9\-_]+\.firebaseio\.com/gi, severity: 'MEDIUM', vrt: 'P4' },
  { name: 'Hardcoded Cred', regex: /(?:api_?key|secret|auth_?token|client_secret|access_token)["']?\s*[:=]\s*["']([A-Za-z0-9\-_+=]{16,})["']/gi, severity: 'HIGH', vrt: 'P2' },
  { name: 'Bearer', regex: /Bearer\s+[A-Za-z0-9\-_.=]{20,}/g, severity: 'HIGH', vrt: 'P2' },
  { name: 'Twilio SID', regex: /AC[a-f0-9]{32}/g, severity: 'HIGH', vrt: 'P2' },
  { name: 'Mailgun', regex: /key-[a-f0-9]{32}/g, severity: 'HIGH', vrt: 'P2' }
];

// ── MASKING ──
function maskSensitive(val){
  if(!val || val.length < 8) return '****';
  var p = {
    'AKIA':4, 'AIza':6, 'sk-proj-':8, 'sk-ant-':8, 'sk_live_':8, 'sk-':3,
    'ghp_':4, 'github_pat_':11, 'hf_':3, 'SG.':3, 'sbp_':4, 'pk.':3, 'pk_live_':8, 'eyJ':3
  };
  for(var k in p){
    if(val.indexOf(k) === 0) return val.substring(0, p[k]) + '****[REDACTED]****';
  }
  return val.substring(0, 3) + '****' + val.slice(-2);
}

function scoreEndpoint(url){
  var s = 10;
  if(/admin|dashboard|internal|debug/i.test(url)) s += 35;
  if(/graphql|gql/i.test(url)) s += 30;
  if(/auth|oauth|token|login/i.test(url)) s += 30;
  if(/api\/v[0-9]|rest/i.test(url)) s += 15;
  return Math.min(s, 100);
}

// ── TEXT ANALYZER ──
function analyzeText(text, source, confidence, allowExternal){
  if(!text || typeof text !== 'string') return 0;
  if(text.length > MAX_BODY) text = text.slice(0, MAX_BODY);
  var added = 0;

  ENDPOINT_RULES.forEach(function(rule){
    rule.regex.lastIndex = 0;
    var matches = text.match(rule.regex);
    if(!matches) return;
    matches.forEach(function(m){
      var clean = m.replace(/[)"';,]+$/, '').trim();
      if(clean.length < 4 || clean.indexOf('<') !== -1 || clean.indexOf('>') !== -1) return;
      var isInScope = scope.inScope(clean);
      if(!isInScope && !allowExternal) return;
      storage.put('endpoints', {
        url: clean,
        type: rule.type,
        inScope: isInScope,
        interestScore: scoreEndpoint(clean),
        confidence: confidence || 'TENTATIVE',
        source: source || 'scan'
      }, 'ep::' + storage.hashKey(clean));
      added++;
    });
  });

  SECRET_RULES.forEach(function(rule){
    rule.regex.lastIndex = 0;
    var m;
    while((m = rule.regex.exec(text)) !== null){
      var val = m[1] || m[0];
      if(!val || val.length < 8) continue;
      storage.put('secrets', {
        name: rule.name,
        severity: rule.severity,
        vrt: rule.vrt,
        value: val,
        maskedValue: maskSensitive(val),
        confidence: confidence || 'TENTATIVE',
        source: source || 'scan'
      }, 'sec::' + rule.name + '::' + storage.hashKey(val));
      added++;

      if(rule.name === 'JWT'){
        try {
          var parts = val.split('.');
          if(parts.length >= 2){
            var b64d = function(s){
              var o = s.replace(/-/g, '+').replace(/_/g, '/');
              while(o.length % 4) o += '=';
              return JSON.parse(decodeURIComponent(
                atob(o).split('').map(function(c){
                  return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                }).join('')
              ));
            };
            var b64e = function(o){
              return btoa(unescape(encodeURIComponent(JSON.stringify(o))))
                .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
            };
            var h = b64d(parts[0]);
            var pl = b64d(parts[1]);
            var forged = b64e(Object.assign({}, h, { alg: 'none' }))
              + '.' + b64e(Object.assign({}, pl, { role: 'admin', isAdmin: true }))
              + '.';
            storage.put('jwt', {
              raw: maskSensitive(val),
              header: h,
              payload: pl,
              forgedNone: forged,
              isExpired: pl.exp ? (Date.now() >= pl.exp * 1000) : false,
              isNoneAlg: (h.alg || '').toLowerCase() === 'none',
              hasAdminRole: !!(pl.role === 'admin' || pl.isAdmin || pl.is_admin),
              source: source || 'scan'
            }, 'jwt::' + storage.hashKey(val));
          }
        } catch(e){}
      }
    }
  });

  if(added > 0) eventBus.emit('finding:new', { count: added, source: source });
  return added;
}

// ── CSP AUDIT ──
function auditCSP(policyStr, sourceLabel){
  if(!policyStr || typeof policyStr !== 'string') return;
  var findings = [];
  try {
    if(mods.csp && typeof mods.csp.analyze === 'function'){
      var parsed = mods.csp.analyze(policyStr);
      findings = parsed.findings || [];
    }
  } catch(e){}

  storage.put('meta', {
    kind: 'csp',
    source: sourceLabel,
    url: location.href,
    host: scope.currentHost,
    policy: policyStr.slice(0, 3000),
    findingCount: findings.length,
    findings: findings.slice(0, 15)
  }, 'csp::' + sourceLabel + '::' + scope.currentHost);
}

function scanCSPMeta(){
  try {
    var meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    var policy = meta ? meta.getAttribute('content') : null;
    if(policy){
      auditCSP(policy, 'meta-tag');
    } else {
      storage.put('meta', {
        kind: 'csp',
        source: 'meta-tag',
        url: location.href,
        host: scope.currentHost,
        policy: '',
        findingCount: 1,
        findings: [{ sev: 'MEDIUM', issue: 'No CSP meta tag present', vector: 'Check HTTP response header' }]
      }, 'csp::meta-tag::' + scope.currentHost);
    }
  } catch(e){}
}

// ══════════════════════════════════════════════════════════════
// HOOK REGISTRATION via RS_ORCH
// ══════════════════════════════════════════════════════════════
var HOOK_ID = 'rs13-scanner';

function registerHooks(){
  var orch = window.RS_ORCH;
  if(!orch || typeof orch.registerHook !== 'function'){
    return false;
  }

  // ── FETCH ──
  orch.registerHook('fetch', HOOK_ID, {
    before: function(ctx){
      try {
        if(!ctx.url) return;
        if(!scope.inScope(ctx.url)) return;
        storage.put('network', {
          method: ctx.method || 'GET',
          url: ctx.url,
          source: 'fetch'
        }, 'net::' + storage.hashKey((ctx.method || 'GET') + '::' + ctx.url));
        analyzeText(ctx.url, 'fetch-url', 'CONFIRMED', false);
      } catch(e){}
    },
    after: function(ctx){
      try {
        if(!ctx.response) return;
        if(!ctx.url || !scope.inScope(ctx.url)) return;
        var cspHdr = null;
        try { cspHdr = ctx.response.headers.get('content-security-policy'); } catch(e){}
        if(cspHdr) auditCSP(cspHdr, 'http-header');
        var ct = '';
        try { ct = ctx.response.headers.get('content-type') || ''; } catch(e){}
        if(/json|javascript|text|html|xml/i.test(ct)){
          try {
            ctx.response.clone().text().then(function(b){
              if(b && b.length < MAX_BODY) analyzeText(b, 'fetch-body', 'FIRM', false);
            }).catch(function(){});
          } catch(e){}
        }
      } catch(e){}
    }
  });

  // ── XHR ──
  orch.registerHook('xhr', HOOK_ID, {
    before: function(ctx){
      try {
        if(!ctx.url) return;
        if(!scope.inScope(ctx.url)) return;
        storage.put('network', {
          method: ctx.method || 'GET',
          url: ctx.url,
          source: 'xhr'
        }, 'net::' + storage.hashKey((ctx.method || 'GET') + '::' + ctx.url));
        analyzeText(ctx.url, 'xhr-url', 'CONFIRMED', false);
      } catch(e){}
    },
    after: function(ctx){
      try {
        if(!ctx.response) return;
        if(ctx.response.headers){
          var m = String(ctx.response.headers).match(/content-security-policy:\s*([^\r\n]+)/i);
          if(m && m[1]) auditCSP(m[1], 'http-header');
        }
        if(ctx.response.text && ctx.response.text.length < MAX_BODY){
          analyzeText(ctx.response.text, 'xhr-body', 'FIRM', false);
        }
      } catch(e){}
    }
  });

  // ── WEBSOCKET ──
  orch.registerHook('ws', HOOK_ID, {
    open: function(ctx){
      try {
        if(!ctx.url) return;
        if(!scope.inScope(ctx.url)) return;
        storage.put('network', {
          method: 'WS',
          url: ctx.url,
          source: 'ws'
        }, 'net::ws::' + storage.hashKey(ctx.url));
        analyzeText(ctx.url, 'ws', 'CONFIRMED', false);
      } catch(e){}
    },
    message: function(ctx){
      try {
        if(ctx.message === undefined || ctx.message === null) return;
        var s = typeof ctx.message === 'string' ? ctx.message : '[binary]';
        if(s.length > 0) analyzeText(s.slice(0, MAX_BODY), 'ws-msg', 'FIRM', false);
      } catch(e){}
    },
    send: function(ctx){
      try {
        if(ctx.sent === undefined || ctx.sent === null) return;
        var s = typeof ctx.sent === 'string' ? ctx.sent : '';
        if(s.length > 0) analyzeText(s.slice(0, MAX_BODY), 'ws-send', 'FIRM', false);
      } catch(e){}
    }
  });

  // ── BEACON ──
  orch.registerHook('beacon', HOOK_ID, {
    before: function(ctx){
      try {
        if(!ctx.url) return;
        if(!scope.inScope(ctx.url)) return;
        storage.put('network', {
          method: 'BEACON',
          url: ctx.url,
          source: 'beacon'
        }, 'net::beacon::' + storage.hashKey(ctx.url));
        analyzeText(ctx.url, 'beacon', 'CONFIRMED', false);
      } catch(e){}
    }
  });

  // ── EVENTSOURCE ──
  orch.registerHook('eventsource', HOOK_ID, {
    open: function(ctx){
      try {
        if(!ctx.url) return;
        if(!scope.inScope(ctx.url)) return;
        storage.put('network', {
          method: 'SSE',
          url: ctx.url,
          source: 'sse'
        }, 'net::sse::' + storage.hashKey(ctx.url));
        analyzeText(ctx.url, 'sse', 'CONFIRMED', false);
      } catch(e){}
    },
    message: function(ctx){
      try {
        if(ctx.message === undefined || ctx.message === null) return;
        var s = typeof ctx.message === 'string' ? ctx.message : '';
        if(s.length > 0) analyzeText(s.slice(0, MAX_BODY), 'sse-msg', 'FIRM', false);
      } catch(e){}
    }
  });

  return true;
}

// ══════════════════════════════════════════════════════════════
// DOM SCAN
// ══════════════════════════════════════════════════════════════
async function scanDOM(){
  scanCSPMeta();

  try {
    var html = document.documentElement ? document.documentElement.innerHTML : '';
    if(html){
      if(html.length > MAX_DOM) html = html.slice(0, MAX_DOM);
      analyzeText(html, 'dom-html', 'FIRM', false);
    }
  } catch(e){}

  try {
    document.querySelectorAll('script:not([src])').forEach(function(s){
      if(s.textContent) analyzeText(s.textContent, 'inline-script', 'FIRM', false);
    });
  } catch(e){}

  try {
    document.querySelectorAll('[src],[href],[action],[data-url],[data-href]').forEach(function(el){
      var v = el.getAttribute('src') || el.getAttribute('href') || el.getAttribute('action')
        || el.getAttribute('data-url') || el.getAttribute('data-href');
      if(v) analyzeText(v, 'dom-attr', 'FIRM', false);
    });
  } catch(e){}

  try {
    ['localStorage', 'sessionStorage'].forEach(function(sname){
      var st = window[sname];
      if(!st) return;
      for(var i = 0; i < st.length; i++){
        var k = st.key(i), v = st.getItem(k);
        if(!k || !v) continue;
        analyzeText(k + '=' + v, sname + ':' + k, 'FIRM', false);
        if(/(?:token|auth|jwt|key|secret|user|role|admin|credential)/i.test(k) || v.length > 200){
          storage.put('storage', {
            store: sname,
            key: k,
            value: maskSensitive(v),
            rawLen: v.length,
            risk: /token|auth|jwt|key|secret/i.test(k) ? 'HIGH' : 'MEDIUM'
          }, 'stg::' + sname + '::' + k);
        }
      }
    });
  } catch(e){}

  try {
    document.cookie.split(';').forEach(function(c){
      var trimmed = c.trim();
      if(!trimmed) return;
      var eq = trimmed.indexOf('=');
      if(eq === -1) return;
      var n = trimmed.substring(0, eq);
      var v = trimmed.substring(eq + 1);
      if(!n) return;
      analyzeText(n + '=' + v, 'cookie:' + n, 'FIRM', false);
      var sess = /(?:sess|auth|token|jwt|sid|csrf|xsrf|login|remember)/i.test(n);
      storage.put('cookies', {
        name: n,
        value: maskSensitive(v),
        sessionLike: sess,
        issues: sess ? ['Session-like cookie readable from JS'] : []
      }, 'ck::' + n);
    });
  } catch(e){}

  try {
    document.querySelectorAll('form').forEach(function(f, i){
      var action = f.getAttribute('action') || '(same page)';
      var method = (f.getAttribute('method') || 'GET').toUpperCase();
      var inputs = Array.prototype.slice.call(
        f.querySelectorAll('input,textarea,select')
      ).map(function(inp){
        return {
          name: inp.getAttribute('name'),
          type: (inp.getAttribute('type') || inp.tagName).toLowerCase()
        };
      });
      var hasCsrf = inputs.some(function(inp){
        return /(?:csrf|xsrf|authenticity|token)/i.test(inp.name || '');
      });
      var issues = [];
      if(!hasCsrf && method !== 'GET') issues.push('No CSRF token detected');
      storage.put('forms', {
        index: i,
        action: action,
        method: method,
        inputs: inputs,
        hasCsrf: hasCsrf,
        crossAction: action !== '(same page)' && !scope.inScope(action),
        issues: issues
      }, 'fm::' + storage.hashKey(method + '::' + action + '::' + i));
      analyzeText(action, 'form-action', 'FIRM', false);
    });
  } catch(e){}

  try {
    document.querySelectorAll('script[src],link[rel="stylesheet"]').forEach(function(el){
      var u = el.src || el.href;
      if(!u) return;
      analyzeText(u, 'sri-src', 'FIRM', false);
      var cross = !scope.inScope(u);
      if(cross && !el.hasAttribute('integrity')){
        storage.put('sri', {
          tag: el.tagName.toLowerCase(),
          url: u,
          isCross: true,
          hasIntegrity: false,
          risk: 'HIGH',
          issue: 'Cross-origin without SRI'
        }, 'sri::' + storage.hashKey(u));
      }
    });
  } catch(e){}

  try {
    if('serviceWorker' in navigator){
      var regs = await navigator.serviceWorker.getRegistrations();
      regs.forEach(function(r){
        storage.put('sw', {
          scope: r.scope,
          scriptURL: r.active ? r.active.scriptURL : null,
          state: r.active ? r.active.state : 'unknown'
        }, 'sw::' + storage.hashKey(r.scope));
      });
    }
  } catch(e){}
}

// ── DEBOUNCED TRIGGER ──
var scanTimer = null;
function scheduleScan(){
  if(scanTimer) clearTimeout(scanTimer);
  scanTimer = setTimeout(function(){
    scanTimer = null;
    scanDOM().catch(function(){});
  }, SCAN_DEBOUNCE_MS);
}

// ── INITIAL TRIGGERS ──
setTimeout(scheduleScan, 400);
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', scheduleScan);
} else {
  scheduleScan();
}
window.addEventListener('load', scheduleScan);

eventBus.on('crawler:done', scheduleScan);
eventBus.on('crawler:page', scheduleScan);

// ── REGISTER HOOKS ──
var hooksRegistered = registerHooks();
if(!hooksRegistered){
  // Fallback: RS_ORCH not available -- try again shortly
  setTimeout(function(){
    hooksRegistered = registerHooks();
    if(!hooksRegistered){
      try { console.warn('[rs13-scanner] RS_ORCH unavailable -- network hooks disabled'); } catch(e){}
    }
  }, 300);
}

// ── PUBLIC API ──
mods.scanner = {
  scan: scanDOM,
  analyze: analyzeText,
  schedule: scheduleScan,
  csp: auditCSP,
  hooks: function(){ return hooksRegistered; }
};
core.scanner = mods.scanner;

eventBus.emit('scanner:ready', { csp: true, orchestrated: hooksRegistered });
})();