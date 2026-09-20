// language: JavaScript, file: 6_ui.js, target: modern browsers
// ReconStrike UI -- professional dark dashboard

(function(){
'use strict';
if(!window.ReconCore || window.__RS13_UI__) return;
window.__RS13_UI__ = true;

var {eventBus, storage} = window.ReconCore;
var mods = window.ReconCore.modules || {};

// ── Design tokens ──
var CSS = [
':host,*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}',
':root,.__{',
'--bg:#09090b;--sf:#111114;--sf2:#18181b;--sf3:#1f1f23;',
'--bd:#27272a;--bd2:#1a1a1e;',
'--tx:#fafafa;--tx2:#a1a1aa;--tx3:#71717a;--tx4:#52525b;',
'--ac:#ef4444;--ac2:#f87171;--su:#22c55e;--wa:#f59e0b;--in:#3b82f6;--pu:#a855f7;--cy:#06b6d4;',
'--ff:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,sans-serif;',
'--fm:ui-monospace,"SF Mono",Menlo,Monaco,"Cascadia Code",monospace;',
'}',
'.rs-root{position:fixed;inset:0;z-index:2147483647;pointer-events:none;font-family:var(--ff);color:var(--tx);-webkit-font-smoothing:antialiased}',
'.rs-fab{position:absolute;bottom:calc(24px + env(safe-area-inset-bottom,0px));right:20px;width:56px;height:56px;background:linear-gradient(135deg,#dc2626,#7f1d1d);border:1px solid rgba(255,255,255,.15);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 8px 24px rgba(220,38,38,.35),0 2px 8px rgba(0,0,0,.6);cursor:pointer;pointer-events:auto;transition:transform .15s ease,box-shadow .15s ease}',
'.rs-fab:active{transform:scale(.94)}',
'.rs-fab-dot{position:absolute;top:-3px;right:-3px;min-width:20px;height:20px;padding:0 5px;background:var(--ac);color:#fff;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;border-radius:10px;border:2px solid #0a0a0b;font-family:var(--fm)}',
'.rs-panel{position:absolute;inset:0;background:var(--bg);display:none;flex-direction:column;pointer-events:auto;overflow:hidden}',
'.rs-panel.open{display:flex}',
// Header
'.rs-hd{height:52px;display:flex;align-items:center;justify-content:space-between;padding:0 16px;border-bottom:1px solid var(--bd2);background:var(--bg);flex-shrink:0;padding-top:env(safe-area-inset-top,0px);height:calc(52px + env(safe-area-inset-top,0px))}',
'.rs-brand{display:flex;align-items:center;gap:9px}',
'.rs-logo{width:24px;height:24px;background:linear-gradient(135deg,#dc2626,#991b1b);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900}',
'.rs-name{font-size:12px;font-weight:700;letter-spacing:.14em;color:var(--tx);text-transform:uppercase}',
'.rs-ver{font-size:9px;font-weight:600;color:var(--tx4);font-family:var(--fm);padding:2px 5px;border:1px solid var(--bd);border-radius:3px;letter-spacing:.05em}',
'.rs-close{width:28px;height:28px;background:var(--sf2);border:1px solid var(--bd);color:var(--tx2);border-radius:7px;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-weight:600}',
'.rs-close:active{background:var(--sf3)}',
// Search
'.rs-search-wrap{padding:10px 16px 6px;flex-shrink:0}',
'.rs-search{width:100%;height:34px;background:var(--sf);border:1px solid var(--bd);border-radius:8px;padding:0 12px;color:var(--tx);font-size:13px;font-family:var(--ff);outline:none;transition:border-color .15s ease}',
'.rs-search:focus{border-color:var(--ac)}',
'.rs-search::placeholder{color:var(--tx4)}',
// Content
'.rs-body{flex:1;overflow-y:auto;padding:8px 16px 100px;-webkit-overflow-scrolling:touch}',
'.rs-sec{margin-bottom:18px}',
'.rs-sec-h{display:flex;align-items:baseline;justify-content:space-between;margin:14px 0 8px}',
'.rs-sec-t{font-size:11px;font-weight:700;letter-spacing:.1em;color:var(--tx3);text-transform:uppercase}',
'.rs-sec-c{font-size:10px;font-weight:600;color:var(--tx4);font-family:var(--fm)}',
// Stat cards
'.rs-stats{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px}',
'.rs-stat{background:var(--sf);border:1px solid var(--bd);border-radius:10px;padding:12px;position:relative;overflow:hidden}',
'.rs-stat::before{content:"";position:absolute;top:0;left:0;width:3px;height:100%;background:var(--c,var(--bd))}',
'.rs-stat-l{font-size:10px;font-weight:600;color:var(--tx3);letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px;padding-left:8px}',
'.rs-stat-v{font-size:24px;font-weight:700;color:var(--tx);font-family:var(--fm);letter-spacing:-.02em;line-height:1;padding-left:8px}',
'.rs-stat-u{font-size:10px;color:var(--tx4);font-weight:500;margin-left:4px}',
// Items
'.rs-item{background:var(--sf);border:1px solid var(--bd);border-radius:9px;padding:11px 12px;margin-bottom:6px;cursor:pointer;transition:background .12s ease,border-color .12s ease;position:relative}',
'.rs-item:active{background:var(--sf2);border-color:var(--bd)}',
'.rs-item-h{display:flex;align-items:center;gap:8px;margin-bottom:4px}',
'.rs-item-t{font-size:12.5px;font-weight:600;color:var(--tx);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:ltr;text-align:left}',
'.rs-item-s{font-size:11px;color:var(--tx3);font-family:var(--fm);direction:ltr;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
'.rs-item-x{font-size:11.5px;color:var(--tx2);font-family:var(--fm);direction:ltr;text-align:left;word-break:break-all;line-height:1.5;margin-top:4px;padding-top:6px;border-top:1px solid var(--bd2);display:none}',
'.rs-item.exp .rs-item-x{display:block}',
// Badges
'.rs-tag{display:inline-flex;align-items:center;height:16px;padding:0 6px;border-radius:4px;font-size:9px;font-weight:700;letter-spacing:.04em;font-family:var(--fm);text-transform:uppercase;flex-shrink:0}',
'.rs-tag.c{background:rgba(239,68,68,.15);color:#f87171}',
'.rs-tag.h{background:rgba(245,158,11,.15);color:#fbbf24}',
'.rs-tag.m{background:rgba(234,179,8,.15);color:#eab308}',
'.rs-tag.l{background:rgba(100,116,139,.2);color:#94a3b8}',
'.rs-tag.n{background:rgba(59,130,246,.15);color:#60a5fa}',
'.rs-tag.g{background:rgba(34,197,94,.15);color:#4ade80}',
'.rs-tag.p{background:rgba(168,85,247,.15);color:#c084fc}',
'.rs-tag.i{background:rgba(6,182,212,.15);color:#22d3ee}',
// Empty
'.rs-empty{text-align:center;padding:40px 20px;color:var(--tx4);font-size:12px}',
'.rs-empty-i{font-size:28px;margin-bottom:10px;opacity:.4}',
// Tab bar
'.rs-tabs{position:absolute;bottom:0;left:0;right:0;height:calc(60px + env(safe-area-inset-bottom,0px));padding-bottom:env(safe-area-inset-bottom,0px);background:rgba(9,9,11,.92);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-top:1px solid var(--bd2);display:flex;align-items:stretch;padding-top:0}',
'.rs-tab{flex:1;background:none;border:none;color:var(--tx4);font-family:var(--ff);cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;transition:color .15s ease;padding:0}',
'.rs-tab-i{font-size:17px;line-height:1}',
'.rs-tab-l{font-size:9px;font-weight:600;letter-spacing:.02em}',
'.rs-tab.on{color:var(--ac)}',
// Actions
'.rs-acts{position:absolute;bottom:calc(60px + env(safe-area-inset-bottom,0px));left:0;right:0;padding:8px 16px;background:linear-gradient(180deg,transparent,rgba(9,9,11,.95) 30%);display:flex;gap:6px}',
'.rs-act{flex:1;height:36px;border-radius:8px;border:1px solid var(--bd);background:var(--sf);color:var(--tx);font-size:11.5px;font-weight:600;font-family:var(--ff);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px}',
'.rs-act:active{background:var(--sf2)}',
'.rs-act.p{background:var(--ac);border-color:var(--ac)}',
'.rs-act.p:active{background:#dc2626}',
// Toast
'.rs-toast{position:absolute;top:calc(16px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%) translateY(-40px);background:var(--sf2);border:1px solid var(--bd);color:var(--tx);padding:9px 16px;border-radius:10px;font-size:12px;font-weight:500;box-shadow:0 8px 24px rgba(0,0,0,.5);opacity:0;transition:opacity .2s ease,transform .2s ease;pointer-events:none;z-index:10;max-width:calc(100% - 32px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
'.rs-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}',
// Skeletons
'.rs-sk{background:linear-gradient(90deg,var(--sf) 0%,var(--sf2) 50%,var(--sf) 100%);background-size:200% 100%;animation:rs-sk 1.4s ease-in-out infinite;border-radius:9px;height:56px;margin-bottom:6px}',
'@keyframes rs-sk{0%{background-position:100% 0}100%{background-position:-100% 0}}',
// Progress
'.rs-prog{position:absolute;top:0;left:0;right:0;height:2px;background:var(--bd2);overflow:hidden;display:none}',
'.rs-prog.on{display:block}',
'.rs-prog-i{height:100%;width:40%;background:linear-gradient(90deg,transparent,var(--ac),transparent);animation:rs-prog 1.2s ease-in-out infinite}',
'@keyframes rs-prog{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}'
].join('');

// ── HTML shell ──
var HTML = [
'<div class="rs-root __">',
'<div class="rs-fab" id="fab"><span>⚔</span><span class="rs-fab-dot" id="fabDot" style="display:none">0</span></div>',
'<div class="rs-panel" id="panel">',
'<div class="rs-prog" id="prog"><div class="rs-prog-i"></div></div>',
'<div class="rs-hd">',
'<div class="rs-brand">',
'<div class="rs-logo">⚔</div>',
'<div><div class="rs-name">ReconStrike</div></div>',
'<div class="rs-ver">V13</div>',
'</div>',
'<button class="rs-close" id="close">✕</button>',
'</div>',
'<div class="rs-search-wrap"><input class="rs-search" id="search" placeholder="ابحث في كل النتائج..."/></div>',
'<div class="rs-body" id="body"></div>',
'<div class="rs-acts">',
'<button class="rs-act p" id="scan">⚡ فحص</button>',
'<button class="rs-act" id="crawl">🕸 زحف</button>',
'<button class="rs-act" id="chain">🎯 استغلال</button>',
'<button class="rs-act" id="export">↓ تصدير</button>',
'</div>',
'<div class="rs-tabs" id="tabs"></div>',
'</div>',
'<div class="rs-toast" id="toast"></div>',
'</div>'
].join('');

// ── State ──
var TABS = [
{id:'dash', i:'◉', l:'الرئيسية'},
{id:'recon', i:'◈', l:'استطلاع'},
{id:'vuln', i:'⚠', l:'ثغرات'},
{id:'exploit', i:'⚔', l:'استغلال'},
{id:'net', i:'⟁', l:'شبكة'}
];

var STORE_MAP = {
dash: [],
recon: ['endpoints', 'secrets', 'jwt', 'storage'],
vuln: ['cors', 'forms', 'cookies', 'sri'],
exploit: ['meta'],
net: ['network', 'graphql', 'srcmaps', 'sw']
};

var active = 'dash';
var query = '';
var expanded = new Set();
var sh, $, allCache = {};

// ── Mount ──
var hostId = 'rs13-ui-' + Math.random().toString(36).slice(2, 8);
sh = window.ReconCore.mountShadow(hostId, CSS, HTML);
$ = function(s){ return sh.querySelector(s); };

// Add __ class to root for scoping
var rootEl = sh.querySelector('.rs-root');
if(rootEl) rootEl.classList.add('__');

// ── Helpers ──
function esc(s){
return String(s==null?'':s).replace(/[&<>"']/g,function(c){
return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
});
}

function sevClass(s){
var v = String(s||'').toUpperCase();
if(v === 'CRITICAL') return 'c';
if(v === 'HIGH') return 'h';
if(v === 'MEDIUM') return 'm';
if(v === 'LOW') return 'l';
return 'n';
}

function toast(msg){
var t = $('#toast');
if(!t) return;
t.textContent = msg;
t.classList.add('show');
clearTimeout(t.__tm);
t.__tm = setTimeout(function(){ t.classList.remove('show'); }, 2200);
}

function progress(on){
var p = $('#prog');
if(p) p.classList[on ? 'add' : 'remove']('on');
}

function setBadge(n){
var d = $('#fabDot');
if(!d) return;
if(n > 0){ d.textContent = n > 99 ? '99+' : String(n); d.style.display = 'flex'; }
else d.style.display = 'none';
}

function matches(obj, q){
if(!q) return true;
var s = JSON.stringify(obj).toLowerCase();
return s.indexOf(q.toLowerCase()) !== -1;
}

// ── Render ──
async function loadAll(){
var stores = ['endpoints','secrets','cors','jwt','forms','cookies','sri','sw','srcmaps','storage','network','graphql','meta'];
var out = {};
for(var i = 0; i < stores.length; i++){
try { out[stores[i]] = await storage.getAll(stores[i]); }
catch(e){ out[stores[i]] = []; }
}
allCache = out;
return out;
}

function itemHTML(id, tag, tagCls, title, sub, detail){
var exp = expanded.has(id) ? ' exp' : '';
return '<div class="rs-item'+exp+'" data-id="'+esc(id)+'">'+
'<div class="rs-item-h">'+
(tag ? '<span class="rs-tag '+tagCls+'">'+esc(tag)+'</span>' : '')+
'<div class="rs-item-t">'+esc(title)+'</div>'+
'</div>'+
(sub ? '<div class="rs-item-s">'+esc(sub)+'</div>' : '')+
(detail ? '<div class="rs-item-x">'+detail+'</div>' : '')+
'</div>';
}

function emptyHTML(msg, icon){
return '<div class="rs-empty"><div class="rs-empty-i">'+(icon||'○')+'</div>'+esc(msg)+'</div>';
}

function statCard(label, value, unit, color){
return '<div class="rs-stat" style="--c:'+color+'">'+
'<div class="rs-stat-l">'+esc(label)+'</div>'+
'<div class="rs-stat-v">'+esc(String(value))+(unit?'<span class="rs-stat-u">'+esc(unit)+'</span>':'')+'</div>'+
'</div>';
}

async function render(){
var body = $('#body');
if(!body) return;
body.innerHTML = '<div class="rs-sk"></div><div class="rs-sk"></div><div class="rs-sk"></div>';

var data = await loadAll();
var h = '';

var totalFindings =
(data.secrets||[]).length +
(data.cors||[]).length +
(data.jwt||[]).length +
(data.forms||[]).length;

// Update badge
setBadge(totalFindings);

if(active === 'dash'){
h += renderDash(data);
} else if(active === 'recon'){
h += renderRecon(data);
} else if(active === 'vuln'){
h += renderVuln(data);
} else if(active === 'exploit'){
h += renderExploit(data);
} else if(active === 'net'){
h += renderNet(data);
}

body.innerHTML = h || emptyHTML('لا توجد بيانات', '○');

// Expand/collapse handler
body.querySelectorAll('.rs-item').forEach(function(el){
el.addEventListener('click', function(){
var id = el.getAttribute('data-id');
if(expanded.has(id)) expanded.delete(id); else expanded.add(id);
el.classList.toggle('exp');
});
});
}

function renderDash(d){
var h = '';

var crit = (d.secrets||[]).filter(function(s){ return String(s.severity||'').toUpperCase() === 'CRITICAL'; }).length;
var high = (d.cors||[]).filter(function(c){ return String(c.risk||'').toUpperCase() === 'HIGH'; }).length;

h += '<div class="rs-stats">';
h += statCard('مسارات', (d.endpoints||[]).length, '', 'var(--in)');
h += statCard('أسرار', (d.secrets||[]).length, '', crit > 0 ? 'var(--ac)' : 'var(--wa)');
h += statCard('CORS', (d.cors||[]).length, '', high > 0 ? 'var(--wa)' : 'var(--su)');
h += statCard('JWT', (d.jwt||[]).length, '', 'var(--pu)');
h += '</div>';

// Recent network
var net = (d.network||[]).slice(-5).reverse().filter(function(n){ return matches(n, query); });
if(net.length){
h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">آخر الطلبات</div><div class="rs-sec-c">'+(d.network||[]).length+'</div></div>';
net.forEach(function(n, i){
h += itemHTML('net'+i, n.method || 'GET', 'n', n.url || '', n.time || '', '');
});
h += '</div>';
}

// Recent secrets
var sec = (d.secrets||[]).slice(-5).reverse().filter(function(s){ return matches(s, query); });
if(sec.length){
h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">آخر الأسرار</div><div class="rs-sec-c">'+(d.secrets||[]).length+'</div></div>';
sec.forEach(function(s, i){
var sc = sevClass(s.severity);
var detail = '<div style="color:#f87171;font-size:11px">'+esc(s.maskedValue || s.value || '')+'</div>';
if(s.source) detail += '<div style="color:var(--tx4);font-size:10px;margin-top:2px">'+esc(s.source)+'</div>';
h += itemHTML('sec'+i, s.severity || 'LOW', sc, s.name || 'secret', s.vrt || '', detail);
});
h += '</div>';
}

if(!net.length && !sec.length){
h += emptyHTML('لا توجد نتائج -- اضغط فحص', '◉');
}

return h;
}

function renderRecon(d){
var h = '';
var secFilter = query;

// Endpoints
var eps = (d.endpoints||[]).filter(function(e){ return matches(e, secFilter); }).slice(-60).reverse();
h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">المسارات</div><div class="rs-sec-c">'+eps.length+'</div></div>';
if(eps.length){
eps.forEach(function(e, i){
var url = e.url || e.path || JSON.stringify(e).slice(0, 100);
var score = e.interestScore || 0;
var tag = score >= 60 ? 'HOT' : (e.inScope ? 'IN' : 'EXT');
var cls = score >= 60 ? 'c' : (e.inScope ? 'g' : 'l');
var detail = '<div style="color:var(--tx3);font-size:10px">'+
(score ? 'اهتمام: '+score+'/100' : '')+
(e.type ? ' · '+esc(e.type) : '')+
'</div>';
h += itemHTML('ep'+i, tag, cls, url, e.source || '', detail);
});
} else h += emptyHTML('لا مسارات بعد', '◈');
h += '</div>';

// Secrets
var sec = (d.secrets||[]).filter(function(s){ return matches(s, secFilter); }).slice(-40).reverse();
h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">الأسرار</div><div class="rs-sec-c">'+sec.length+'</div></div>';
if(sec.length){
sec.forEach(function(s, i){
var sc = sevClass(s.severity);
var detail = '<div style="color:#f87171;font-size:11px;font-family:var(--fm)">'+esc(s.maskedValue || s.value || '')+'</div>';
h += itemHTML('sc'+i, s.severity || 'LOW', sc, s.name || 'secret', s.source || '', detail);
});
} else h += emptyHTML('لا أسرار بعد', '◆');
h += '</div>';

// JWT
var jw = (d.jwt||[]).filter(function(j){ return matches(j, secFilter); });
h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">JWT</div><div class="rs-sec-c">'+jw.length+'</div></div>';
if(jw.length){
jw.forEach(function(j, i){
var alg = (j.header && j.header.alg) || '?';
var detail = '<div style="font-size:11px;color:var(--tx3);font-family:var(--fm)">alg: '+esc(alg)+' · admin: '+(j.hasAdminRole ? 'نعم' : 'لا')+'</div>';
if(j.forgedNone) detail += '<div style="color:#c084fc;font-size:10px;margin-top:4px;word-break:break-all">'+esc(String(j.forgedNone).slice(0, 80))+'...</div>';
h += itemHTML('jw'+i, alg === 'none' ? 'CRITICAL' : 'TOKEN', alg === 'none' ? 'c' : 'p', j.source || 'JWT', '', detail);
});
} else h += emptyHTML('لا JWT بعد', '⚿');
h += '</div>';

// Storage
var st = (d.storage||[]).filter(function(s){ return matches(s, secFilter); }).slice(0, 30);
h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">التخزين المحلي</div><div class="rs-sec-c">'+st.length+'</div></div>';
if(st.length){
st.forEach(function(s, i){
h += itemHTML('st'+i, s.risk || 'LOW', sevClass(s.risk), (s.store || '')+' · '+(s.key || ''), '', '<div style="color:#38bdf8;font-size:11px;font-family:var(--fm)">'+esc(s.value || '')+'</div>');
});
} else h += emptyHTML('لا عناصر', '▤');
h += '</div>';

return h;
}

function renderVuln(d){
var h = '';

var cors = (d.cors||[]).filter(function(c){ return matches(c, query); });
h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">CORS</div><div class="rs-sec-c">'+cors.length+'</div></div>';
if(cors.length){
cors.forEach(function(c, i){
var detail = '<div style="color:var(--tx2);font-size:11px">Origin: <code style="color:#38bdf8">'+esc(c.origin || '')+'</code></div>'+
'<div style="color:var(--tx2);font-size:11px">Credentials: '+esc(c.credentials || 'false')+'</div>'+
'<div style="color:#f87171;font-size:11px;margin-top:4px">'+esc(c.issue || '')+'</div>';
h += itemHTML('co'+i, c.risk || 'LOW', sevClass(c.risk), c.url || '', '', detail);
});
} else h += emptyHTML('لا CORS بعد', '⚠');
h += '</div>';

var forms = (d.forms||[]).filter(function(f){ return matches(f, query); });
h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">النماذج</div><div class="rs-sec-c">'+forms.length+'</div></div>';
if(forms.length){
forms.forEach(function(f, i){
var hasIssues = f.issues && f.issues.length;
var detail = '<div style="color:var(--tx3);font-size:11px">CSRF: '+(f.hasCsrf ? '✓' : '✗')+' · cross: '+(f.crossAction ? 'نعم' : 'لا')+'</div>';
if(hasIssues) detail += '<div style="color:#f87171;font-size:11px;margin-top:4px">'+esc(f.issues.join(' · '))+'</div>';
h += itemHTML('fm'+i, f.method || 'GET', hasIssues ? 'h' : 'g', f.action || '', '', detail);
});
} else h += emptyHTML('لا نماذج', '▢');
h += '</div>';

var ck = (d.cookies||[]).filter(function(c){ return matches(c, query); });
h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">الكوكيز</div><div class="rs-sec-c">'+ck.length+'</div></div>';
if(ck.length){
ck.forEach(function(c, i){
var hasIssues = c.issues && c.issues.length;
var detail = '<div style="font-size:11px;font-family:var(--fm);color:var(--tx3);word-break:break-all">'+esc(String(c.value || '').slice(0, 80))+'</div>';
if(hasIssues) detail += '<div style="color:#f87171;font-size:11px;margin-top:4px">'+esc(c.issues.join(' · '))+'</div>';
h += itemHTML('ck'+i, c.sessionLike ? 'SESSION' : 'COOKIE', hasIssues ? 'h' : 'l', c.name || '', '', detail);
});
} else h += emptyHTML('لا كوكيز', '◌');
h += '</div>';

var sri = (d.sri||[]).filter(function(s){ return matches(s, query); });
h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">SRI</div><div class="rs-sec-c">'+sri.length+'</div></div>';
if(sri.length){
sri.slice(0, 30).forEach(function(s, i){
h += itemHTML('sr'+i, s.risk || 'LOW', sevClass(s.risk), s.url || '', s.tag || '', '<div style="color:#f87171;font-size:11px">'+esc(s.issue || '')+'</div>');
});
} else h += emptyHTML('لا SRI', '◈');
h += '</div>';

return h;
}

function renderExploit(d){
var h = '';
var runs = (d.meta||[]).filter(function(m){ return m.kind === 'chain-success'; }).filter(function(m){ return matches(m, query); });

h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">نجاحات الاستغلال</div><div class="rs-sec-c">'+runs.length+'</div></div>';
if(runs.length){
runs.forEach(function(r, i){
var ev = JSON.stringify(r.evidence || '').slice(0, 300);
h += itemHTML('ex'+i, 'EXPLOITED', 'c', r.exploit || 'chain', '', '<div style="color:#f87171;font-size:11px;word-break:break-all">'+esc(ev)+'</div>');
});
} else h += emptyHTML('لا استغلال بعد -- اضغط استغلال', '⚔');
h += '</div>';

var crawls = (d.meta||[]).filter(function(m){ return m.kind === 'crawl'; });
h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">الزحف</div><div class="rs-sec-c">'+crawls.length+'</div></div>';
if(crawls.length){
crawls.slice(-5).reverse().forEach(function(c, i){
h += itemHTML('cr'+i, 'CRAWL', 'i', (c.pages || 0)+' صفحة', c.host || '', '');
});
} else h += emptyHTML('لا زحف بعد', '🕸');
h += '</div>';

return h;
}

function renderNet(d){
var h = '';

var net = (d.network||[]).filter(function(n){ return matches(n, query); }).slice(-100).reverse();
h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">الطلبات</div><div class="rs-sec-c">'+net.length+'</div></div>';
if(net.length){
net.forEach(function(n, i){
h += itemHTML('nt'+i, n.method || 'GET', 'n', n.url || '', n.time || '', '');
});
} else h += emptyHTML('لا طلبات', '⟁');
h += '</div>';

var sw = (d.sw||[]).filter(function(s){ return matches(s, query); });
h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">Service Workers</div><div class="rs-sec-c">'+sw.length+'</div></div>';
if(sw.length){
sw.forEach(function(s, i){
h += itemHTML('sw'+i, s.state || 'SW', 'g', s.scope || '', s.scriptURL || '', '');
});
} else h += emptyHTML('لا Service Workers', '⚙');
h += '</div>';

var sm = (d.srcmaps||[]).filter(function(s){ return matches(s, query); });
h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">Source Maps</div><div class="rs-sec-c">'+sm.length+'</div></div>';
if(sm.length){
sm.forEach(function(s, i){
h += itemHTML('sm'+i, 'MAP', 'p', s.mapUrl || '', s.source || '', '');
});
} else h += emptyHTML('لا Source Maps', '◈');
h += '</div>';

return h;
}

// ── Event handlers ──
function buildTabs(){
var tabs = $('#tabs');
tabs.innerHTML = '';
TABS.forEach(function(t){
var b = document.createElement('button');
b.className = 'rs-tab' + (t.id === active ? ' on' : '');
b.setAttribute('data-id', t.id);
b.innerHTML = '<span class="rs-tab-i">'+t.i+'</span><span class="rs-tab-l">'+t.l+'</span>';
tabs.appendChild(b);
});
}

$('#tabs').addEventListener('click', function(e){
var b = e.target.closest('.rs-tab');
if(!b) return;
active = b.getAttribute('data-id');
buildTabs();
render();
});

$('#search').addEventListener('input', function(e){
query = e.target.value.trim();
render();
});

$('#fab').addEventListener('click', function(){
$('#panel').classList.add('open');
render();
});

$('#close').addEventListener('click', function(){
$('#panel').classList.remove('open');
});

$('#scan').addEventListener('click', async function(){
progress(true);
toast('جاري الفحص...');
try {
if(mods.crawler && mods.crawler.crawl) await mods.crawler.crawl({maxDepth: 1, maxPages: 15});
toast('تم الفحص');
} catch(e){ toast('خطأ: ' + e.message); }
progress(false);
render();
});

$('#crawl').addEventListener('click', async function(){
progress(true);
toast('جاري الزحف...');
try {
if(mods.crawler && mods.crawler.crawl) await mods.crawler.crawl({maxDepth: 2, maxPages: 40});
toast('تم الزحف');
} catch(e){ toast('خطأ: ' + e.message); }
progress(false);
render();
});

$('#chain').addEventListener('click', async function(){
progress(true);
toast('جاري الاستغلال...');
try {
if(mods.chain && mods.chain.runAll) await mods.chain.runAll({minSeverity: 'HIGH'});
toast('تم');
} catch(e){ toast('خطأ: ' + e.message); }
progress(false);
render();
});

$('#export').addEventListener('click', async function(){
try {
var data = await loadAll();
var summary = {
host: location.hostname,
url: location.href,
time: new Date().toISOString(),
counts: {
endpoints: (data.endpoints||[]).length,
secrets: (data.secrets||[]).length,
cors: (data.cors||[]).length,
jwt: (data.jwt||[]).length,
forms: (data.forms||[]).length,
cookies: (data.cookies||[]).length
},
data: data
};
var blob = new Blob([JSON.stringify(summary, null, 2)], {type: 'application/json'});
var a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = 'reconstrike-' + location.hostname + '-' + Date.now() + '.json';
a.click();
setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
toast('تم التصدير');
} catch(e){ toast('خطأ في التصدير'); }
});

// Live updates
eventBus.on('finding:new', function(){ if($('#panel').classList.contains('open')) render(); });
eventBus.on('crawler:done', function(){ render(); });

// ── Boot ──
buildTabs();
render();
setTimeout(function(){ toast('ReconStrike جاهز'); }, 400);

// Auto refresh every 10s if panel open
setInterval(function(){
if($('#panel') && $('#panel').classList.contains('open')) render();
}, 10000);

})();