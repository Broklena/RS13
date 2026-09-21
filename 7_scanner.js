// language: JavaScript, file: 7_scanner.js, target: modern browsers
// ReconStrike V13.2 -- Layer 7 Scanner (with CSP audit)

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
        findings: [{ sev: 'MEDIUM', issue: 'No CSP meta tag present in document', vector: 'Check HTTP response header for header-delivered CSP' }]
      }, 'csp::meta-tag::' + scope.currentHost);
    }
  } catch(e){}
}

// ── HOOK: fetch ──
(function(){
  var origFetch = window.fetch;
  if(!origFetch || origFetch.__rsHooked) return;
  var wf = async function(){
    var args = Array.prototype.slice.call(arguments);
    var url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
    var method = (args[1] && args[1].method) || 'GET';
    var capturedUrl = url;
    try {
      if(url && scope.inScope(url)){
        storage.put('network', {
          method: String(method).toUpperCase(),
          url: url,
          source: 'fetch'
        }, 'net::' + storage.hashKey(method + url));
        analyzeText(url, 'fetch-url', 'CONFIRMED', false);
      }
    } catch(e){}

    var res = await origFetch.apply(this, args);

    try {
      if(capturedUrl && scope.inScope(capturedUrl)){
        // CSP from HTTP header
        var cspHdr = res.headers.get('content-security-policy');
        if(cspHdr){
          auditCSP(cspHdr, 'http-header');
        }
        // Body analysis
        var ct = res.headers.get('content-type') || '';
        if(/json|javascript|text|html|xml/i.test(ct)){
          res.clone().text().then(function(b){
            if(b && b.length < MAX_BODY) analyzeText(b, 'fetch-body', 'FIRM', false);
          }).catch(function(){});
        }
      }
    } catch(e){}

    return res;
  };
  wf.__rsHooked = true;
  window.fetch = wf;
})();

// ── HOOK: XHR ──
(function(){
  if(!window.XMLHttpRequest) return;
  var origOpen = XMLHttpRequest.prototype.open;
  if(!origOpen || origOpen.__rsHooked) return;
  var xo = function(method, url){
    try {
      var u = String(url);
      if(scope.inScope(u)){
        storage.put('network', {
          method: String(method || 'GET').toUpperCase(),
          url: u,
          source: 'xhr'
        }, 'net::' + storage.hashKey(method + u));
        analyzeText(u, 'xhr-url', 'CONFIRMED', false);
        var self = this;
        this.addEventListener('load', function(){
          try {
            var cspHdr = self.getResponseHeader && self.getResponseHeader('content-security-policy');
            if(cspHdr) auditCSP(cspHdr, 'http-header');
          } catch(e){}
          try {
            if(self.responseText && self.responseText.length < MAX_BODY){
              analyzeText(self.responseText, 'xhr-body', 'FIRM', false);
            }
          } catch(e){}
        });
      }
    } catch(e){}
    return origOpen.apply(this, arguments);
  };
  xo.__rsHooked = true;
  XMLHttpRequest.prototype.open = xo;
})();

// ── HOOK: WebSocket ──
(function(){
  var OWS = window.WebSocket;
  if(!OWS || OWS.__rsHooked) return;
  var W = function(url, p){
    try {
      if(url && scope.inScope(String(url))){
        storage.put('network', {
          method: 'WS',
          url: String(url),
          source: 'ws'
        }, 'net::ws::' + storage.hashKey(String(url)));
        analyzeText(String(url), 'ws', 'CONFIRMED', false);
      }
    } catch(e){}
    return new OWS(url, p);
  };
  W.prototype = OWS.prototype;
  W.CONNECTING = OWS.CONNECTING;
  W.OPEN = OWS.OPEN;
  W.CLOSING = OWS.CLOSING;
  W.CLOSED = OWS.CLOSED;
  W.__rsHooked = true;
  window.WebSocket = W;
})();

// ── HOOK: sendBeacon ──
(function(){
  if(!navigator.sendBeacon || navigator.sendBeacon.__rsHooked) return;
  var ob = navigator.sendBeacon.bind(navigator);
  var nb = function(url, data){
    try {
      if(url && scope.inScope(String(url))){
        storage.put('network', {
          method: 'BEACON',
          url: String(url),
          source: 'beacon'
        }, 'net::beacon::' + storage.hashKey(String(url)));
        analyzeText(String(url), 'beacon', 'CONFIRMED', false);
      }
    } catch(e){}
    return ob(url, data);
  };
  nb.__rsHooked = true;
  navigator.sendBeacon = nb;
})();

// ── HOOK: EventSource ──
(function(){
  if(!window.EventSource || window.EventSource.__rsHooked) return;
  var OES = window.EventSource;
  var ES = function(url, cfg){
    try {
      if(url && scope.inScope(String(url))){
        storage.put('network', {
          method: 'SSE',
          url: String(url),
          source: 'sse'
        }, 'net::sse::' + storage.hashKey(String(url)));
        analyzeText(String(url), 'sse', 'CONFIRMED', false);
      }
    } catch(e){}
    return new OES(url, cfg);
  };
  ES.prototype = OES.prototype;
  ES.CONNECTING = OES.CONNECTING;
  ES.OPEN = OES.OPEN;
  ES.CLOSED = OES.CLOSED;
  ES.__rsHooked = true;
  window.EventSource = ES;
})();

// ── DOM SCAN ──
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
      }, 'fm::' + storage.hashKey(method + action + i));
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

setTimeout(scheduleScan, 400);
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', scheduleScan);
} else {
  scheduleScan();
}
window.addEventListener('load', scheduleScan);

eventBus.on('crawler:done', scheduleScan);
eventBus.on('crawler:page', scheduleScan);

// ── PUBLIC API ──
mods.scanner = {
  scan: scanDOM,
  analyze: analyzeText,
  schedule: scheduleScan,
  csp: auditCSP
};
core.scanner = mods.scanner;

eventBus.emit('scanner:ready', { csp: true });
})();