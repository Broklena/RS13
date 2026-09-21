// language: JavaScript, file: 6_ui.js, target: modern browsers
// ReconStrike V16 -- UI with 14 tabs (SYNAPSE + DARWIN included)

(function(){
'use strict';
if(!window.ReconCore || window.__RS13_UI__) return;
window.__RS13_UI__ = true;

var core = window.ReconCore;
var eventBus = core.eventBus;
var storage = core.storage;
var secure = core.secure;
var mods = core.modules || (core.modules = {});

var CSS = ''
+ '*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}'
+ '.rs-root{--bg:#09090b;--sf:#111114;--sf2:#18181b;--bd:#27272a;--bd2:#1a1a1e;--tx:#fafafa;--tx2:#a1a1aa;--tx3:#71717a;--tx4:#52525b;'
+ '--ac:#ef4444;--su:#22c55e;--wa:#f59e0b;--in:#3b82f6;--pu:#a855f7;--cy:#06b6d4;'
+ 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;'
+ 'font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif;'
+ 'color:var(--tx);-webkit-font-smoothing:antialiased}'
+ '.rs-root *{font-family:inherit}'
+ '.rs-fab{position:absolute;bottom:calc(24px + env(safe-area-inset-bottom,0px));right:20px;width:56px;height:56px;'
+ 'background:linear-gradient(135deg,#dc2626,#7f1d1d);border:1px solid rgba(255,255,255,.15);border-radius:14px;'
+ 'display:flex;align-items:center;justify-content:center;font-size:22px;color:#fff;'
+ 'box-shadow:0 8px 24px rgba(220,38,38,.35),0 2px 8px rgba(0,0,0,.6);cursor:pointer;pointer-events:auto}'
+ '.rs-fab:active{transform:scale(.94)}'
+ '.rs-fab-dot{position:absolute;top:-3px;right:-3px;min-width:20px;height:20px;padding:0 5px;background:var(--ac);color:#fff;'
+ 'font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;border-radius:10px;'
+ 'border:2px solid #0a0a0b;font-family:ui-monospace,monospace}'
+ '.rs-panel{position:absolute;inset:0;background:var(--bg);display:none;flex-direction:column;pointer-events:auto;overflow:hidden}'
+ '.rs-panel.open{display:flex}'
+ '.rs-hd{display:flex;align-items:center;justify-content:space-between;gap:8px;'
+ 'padding:calc(12px + env(safe-area-inset-top,0px)) 16px 12px;border-bottom:1px solid var(--bd2);background:var(--bg);flex-shrink:0}'
+ '.rs-brand{display:flex;align-items:center;gap:9px}'
+ '.rs-logo{width:26px;height:26px;background:linear-gradient(135deg,#dc2626,#991b1b);border-radius:7px;'
+ 'display:flex;align-items:center;justify-content:center;font-size:14px;color:#fff}'
+ '.rs-name{font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase}'
+ '.rs-ver{font-size:9px;font-weight:600;color:var(--tx3);font-family:ui-monospace,monospace;'
+ 'padding:2px 5px;border:1px solid var(--bd);border-radius:3px}'
+ '.rs-hd-actions{display:flex;gap:6px;align-items:center}'
+ '.rs-lock{width:30px;height:30px;background:var(--sf2);border:1px solid var(--bd);color:var(--tx3);border-radius:8px;'
+ 'font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-weight:600}'
+ '.rs-lock.on{color:#4ade80;border-color:#4ade80}'
+ '.rs-close{width:30px;height:30px;background:var(--sf2);border:1px solid var(--bd);color:var(--tx2);border-radius:8px;'
+ 'font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-weight:600}'
+ '.rs-search-wrap{padding:10px 16px 6px;flex-shrink:0}'
+ '.rs-search{width:100%;height:36px;background:var(--sf);border:1px solid var(--bd);border-radius:9px;'
+ 'padding:0 12px;color:var(--tx);font-size:13px;outline:none}'
+ '.rs-search:focus{border-color:var(--ac)}'
+ '.rs-search::placeholder{color:var(--tx4)}'
+ '.rs-body{flex:1;overflow-y:auto;padding:10px 16px 170px;-webkit-overflow-scrolling:touch}'
+ '.rs-sec{margin-bottom:18px}'
+ '.rs-sec-h{display:flex;align-items:baseline;justify-content:space-between;margin:14px 0 8px}'
+ '.rs-sec-t{font-size:11px;font-weight:700;letter-spacing:.1em;color:var(--tx3);text-transform:uppercase}'
+ '.rs-sec-c{font-size:10px;font-weight:600;color:var(--tx4);font-family:ui-monospace,monospace}'
+ '.rs-stats{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px}'
+ '.rs-stat{background:var(--sf);border:1px solid var(--bd);border-radius:10px;padding:12px;position:relative;overflow:hidden}'
+ '.rs-stat::before{content:"";position:absolute;top:0;left:0;width:3px;height:100%;background:var(--c,var(--bd))}'
+ '.rs-stat-l{font-size:10px;font-weight:600;color:var(--tx3);letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px;padding-left:10px}'
+ '.rs-stat-v{font-size:24px;font-weight:700;font-family:ui-monospace,monospace;line-height:1;padding-left:10px}'
+ '.rs-stat-u{font-size:10px;color:var(--tx4);font-weight:500;margin-left:4px}'
+ '.rs-item{background:var(--sf);border:1px solid var(--bd);border-radius:10px;padding:11px 12px;margin-bottom:6px;cursor:pointer;transition:background .12s}'
+ '.rs-item:active{background:var(--sf2)}'
+ '.rs-item-h{display:flex;align-items:center;gap:8px;margin-bottom:4px}'
+ '.rs-item-t{font-size:12.5px;font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:ltr;text-align:left}'
+ '.rs-item-s{font-size:11px;color:var(--tx3);font-family:ui-monospace,monospace;direction:ltr;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
+ '.rs-item-x{font-size:11.5px;color:var(--tx2);font-family:ui-monospace,monospace;direction:ltr;text-align:left;'
+ 'word-break:break-all;line-height:1.5;margin-top:6px;padding-top:6px;border-top:1px solid var(--bd2);display:none}'
+ '.rs-item.exp .rs-item-x{display:block}'
+ '.rs-tag{display:inline-flex;align-items:center;height:16px;padding:0 6px;border-radius:4px;font-size:9px;'
+ 'font-weight:700;letter-spacing:.04em;font-family:ui-monospace,monospace;text-transform:uppercase;flex-shrink:0}'
+ '.rs-tag.c{background:rgba(239,68,68,.15);color:#f87171}'
+ '.rs-tag.h{background:rgba(245,158,11,.15);color:#fbbf24}'
+ '.rs-tag.m{background:rgba(234,179,8,.15);color:#eab308}'
+ '.rs-tag.l{background:rgba(100,116,139,.2);color:#94a3b8}'
+ '.rs-tag.n{background:rgba(59,130,246,.15);color:#60a5fa}'
+ '.rs-tag.g{background:rgba(34,197,94,.15);color:#4ade80}'
+ '.rs-tag.p{background:rgba(168,85,247,.15);color:#c084fc}'
+ '.rs-tag.i{background:rgba(6,182,212,.15);color:#22d3ee}'
+ '.rs-tag.f{background:rgba(100,116,139,.15);color:#94a3b8}'
+ '.rs-empty{text-align:center;padding:40px 20px;color:var(--tx4);font-size:12px}'
+ '.rs-empty-i{font-size:28px;margin-bottom:10px;opacity:.4}'
+ '.rs-tabs{position:absolute;bottom:0;left:0;right:0;height:calc(60px + env(safe-area-inset-bottom,0px));'
+ 'padding-bottom:env(safe-area-inset-bottom,0px);background:rgba(9,9,11,.94);overflow-x:auto;overflow-y:hidden;'
+ 'backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-top:1px solid var(--bd2);display:flex;'
+ '-webkit-overflow-scrolling:touch;scrollbar-width:none}'
+ '.rs-tabs::-webkit-scrollbar{display:none}'
+ '.rs-tab{flex:0 0 68px;min-width:68px;background:none;border:none;color:var(--tx4);cursor:pointer;display:flex;flex-direction:column;'
+ 'align-items:center;justify-content:center;gap:3px;padding:0}'
+ '.rs-tab-i{font-size:16px;line-height:1}'
+ '.rs-tab-l{font-size:8.5px;font-weight:600}'
+ '.rs-tab.on{color:var(--ac)}'
+ '.rs-acts{position:absolute;bottom:calc(60px + env(safe-area-inset-bottom,0px));left:0;right:0;padding:8px 12px 12px;'
+ 'background:linear-gradient(180deg,transparent,rgba(9,9,11,.96) 30%);display:flex;gap:5px;overflow-x:auto;'
+ 'scrollbar-width:none}'
+ '.rs-acts::-webkit-scrollbar{display:none}'
+ '.rs-act{flex:0 0 auto;min-width:80px;height:38px;padding:0 12px;border-radius:9px;border:1px solid var(--bd);background:var(--sf);color:var(--tx);'
+ 'font-size:11px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;white-space:nowrap}'
+ '.rs-act.p{background:var(--ac);border-color:var(--ac);color:#fff}'
+ '.rs-act:disabled{opacity:.5}'
+ '.rs-toast{position:absolute;top:calc(16px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%) translateY(-40px);'
+ 'background:var(--sf2);border:1px solid var(--bd);color:var(--tx);padding:10px 16px;border-radius:10px;font-size:12px;font-weight:500;'
+ 'box-shadow:0 8px 24px rgba(0,0,0,.5);opacity:0;transition:opacity .2s,transform .2s;pointer-events:none;z-index:20;'
+ 'max-width:calc(100% - 32px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
+ '.rs-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}'
+ '.rs-prog{position:absolute;top:0;left:0;right:0;height:2px;background:var(--bd2);overflow:hidden;display:none;z-index:30}'
+ '.rs-prog.on{display:block}'
+ '.rs-prog-i{height:100%;width:40%;background:linear-gradient(90deg,transparent,var(--ac),transparent);animation:rs-prog 1.2s infinite}'
+ '@keyframes rs-prog{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}'
+ '.rs-sk{background:linear-gradient(90deg,#111114 0%,#18181b 50%,#111114 100%);background-size:200% 100%;'
+ 'animation:rs-sk 1.4s infinite;border-radius:9px;height:56px;margin-bottom:6px}'
+ '@keyframes rs-sk{0%{background-position:100% 0}100%{background-position:-100% 0}}'
+ '.rs-bar{height:6px;background:var(--bd2);border-radius:3px;overflow:hidden;margin-top:6px}'
+ '.rs-bar-i{height:100%;background:var(--in);transition:width .3s}';

var HTML = ''
+ '<div class="rs-root">'
+ '<div class="rs-prog" id="prog"><div class="rs-prog-i"></div></div>'
+ '<div class="rs-fab" id="fab">⚔<span class="rs-fab-dot" id="fabDot" style="display:none">0</span></div>'
+ '<div class="rs-panel" id="panel">'
+ '<div class="rs-hd">'
+ '<div class="rs-brand"><div class="rs-logo">⚔</div><div class="rs-name">ReconStrike</div><div class="rs-ver">V16</div></div>'
+ '<div class="rs-hd-actions">'
+ '<button class="rs-lock" id="lock" title="التشفير">🔓</button>'
+ '<button class="rs-close" id="close">✕</button>'
+ '</div>'
+ '</div>'
+ '<div class="rs-search-wrap"><input class="rs-search" id="search" placeholder="ابحث..."/></div>'
+ '<div class="rs-body" id="body"></div>'
+ '<div class="rs-acts">'
+ '<button class="rs-act p" id="scan">⚡ فحص</button>'
+ '<button class="rs-act" id="crawl">🕸 زحف</button>'
+ '<button class="rs-act" id="chain">🎯 استغلال</button>'
+ '<button class="rs-act" id="validate">✓ تحقق</button>'
+ '<button class="rs-act" id="probe">⊙ مسارات</button>'
+ '<button class="rs-act" id="export">↓ تصدير</button>'
+ '</div>'
+ '<div class="rs-tabs" id="tabs"></div>'
+ '</div>'
+ '<div class="rs-toast" id="toast"></div>'
+ '</div>';

var hostId = 'rs13-ui-root';
var sh = core.mountShadow(hostId, CSS, HTML);
if(!sh){ return; }
var $ = function(sel){ return sh.querySelector(sel); };

var TABS = [
  { id: 'chains',    i: '⛓', l: 'سلاسل' },
  { id: 'operator',  i: '⏱', l: 'OPERATOR' },
  { id: 'darwin',    i: '⌬', l: 'DARWIN' },
  { id: 'synapse',   i: '◎', l: 'SYNAPSE' },
  { id: 'dash',      i: '◉', l: 'الرئيسية' },
  { id: 'recon',     i: '◈', l: 'استطلاع' },
  { id: 'vuln',      i: '⚠', l: 'ثغرات' },
  { id: 'offensive', i: '⌁', l: 'هجومي' },
  { id: 'exploit',   i: '⚔', l: 'استغلال' },
  { id: 'net',       i: '⟁', l: 'شبكة' },
  { id: 'argus',     i: '◈', l: 'ARGUS' },
  { id: 'pulsar',    i: '⚡', l: 'PULSAR' },
  { id: 'remote',    i: '☁', l: 'خادم' },
  { id: 'ghost',     i: '◌', l: 'GHOST' }
];
var active = 'chains';
var query = '';
var expanded = new Set();
var busy = false;

function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
  });
}
function sevClass(s){
  var v = String(s || '').toUpperCase();
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
  t.__tm = setTimeout(function(){ t.classList.remove('show'); }, 2400);
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
  try { return JSON.stringify(obj).toLowerCase().indexOf(q.toLowerCase()) !== -1; }
  catch (e) { return true; }
}
function isPanelOpen(){
  var p = $('#panel');
  return p && p.classList.contains('open');
}
function updateLockIcon(){
  var el = $('#lock');
  if(!el || !secure) return;
  if(secure.enabled()){ el.textContent = '🔒'; el.classList.add('on'); }
  else { el.textContent = '🔓'; el.classList.remove('on'); }
}
function fmtAge(ms){
  if(!ms || ms < 0) return '--';
  var s = Math.floor(ms / 1000);
  if(s < 60) return s + 'ث';
  var m = Math.floor(s / 60);
  if(m < 60) return m + 'د';
  var h = Math.floor(m / 60);
  if(h < 24) return h + 'س';
  var d = Math.floor(h / 24);
  return d + 'ي';
}
function pct(n){
  return Math.round(n * 100) + '%';
}

async function loadAll(){
  var stores = ['endpoints','secrets','cors','jwt','forms','cookies','sri','sw','srcmaps','storage','network','graphql','meta'];
  var out = {};
  for(var i = 0; i < stores.length; i++){
    try { out[stores[i]] = await storage.getAll(stores[i]); }
    catch(e){ out[stores[i]] = []; }
  }
  return out;
}

function itemHTML(id, tag, tagCls, title, sub, detail){
  var exp = expanded.has(id) ? ' exp' : '';
  return '<div class="rs-item' + exp + '" data-id="' + esc(id) + '">'
    + '<div class="rs-item-h">'
    + (tag ? '<span class="rs-tag ' + tagCls + '">' + esc(tag) + '</span>' : '')
    + '<div class="rs-item-t">' + esc(title) + '</div>'
    + '</div>'
    + (sub ? '<div class="rs-item-s">' + esc(sub) + '</div>' : '')
    + (detail ? '<div class="rs-item-x">' + detail + '</div>' : '')
    + '</div>';
}
function emptyHTML(msg, icon){
  return '<div class="rs-empty"><div class="rs-empty-i">' + (icon || '○') + '</div>' + esc(msg) + '</div>';
}
function statCard(label, value, unit, color){
  return '<div class="rs-stat" style="--c:' + color + '">'
    + '<div class="rs-stat-l">' + esc(label) + '</div>'
    + '<div class="rs-stat-v">' + esc(String(value))
    + (unit ? '<span class="rs-stat-u">' + esc(unit) + '</span>' : '')
    + '</div></div>';
}
function barHTML(frac, color){
  var p = Math.max(0, Math.min(1, frac));
  return '<div class="rs-bar"><div class="rs-bar-i" style="width:' + (p*100).toFixed(1) + '%;background:' + (color || 'var(--in)') + '"></div></div>';
}

// ══════════════════════════════════════════════════════════════
// DARWIN
// ══════════════════════════════════════════════════════════════
function renderDarwin(d){
  var dw = core.darwin;
  var h = '';

  if(!dw){
    h += emptyHTML('وحدة DARWIN غير محمّلة -- تأكد من وجود 16_darwin.js', '⌬');
    return h;
  }

  var st = dw.state();
  var hall = dw.hall();
  var pool = dw.genePool();
  var defender = dw.defender();
  var meta = dw.meta();

  h += '<div class="rs-stats">';
  h += statCard('Hall', st.hallOfFame, '', 'var(--pu)');
  h += statCard('GenePool', st.genePool, '', 'var(--in)');
  h += statCard('Defender', st.defenderRules, '', 'var(--wa)');
  h += statCard('Novelty', st.noveltyArchive, '', 'var(--cy)');
  h += '</div>';

  h += '<div class="rs-sec">';
  h += '<div class="rs-item" style="cursor:default">'
    + '<div class="rs-item-h"><span class="rs-tag ' + (st.running ? 'g' : 'l') + '">' + (st.running ? 'يعمل' : 'متوقف') + '</span>'
    + '<div class="rs-item-t">الحالة</div></div>'
    + '<div class="rs-item-s">أجيال: ' + (st.stats.generations || 0) + ' · تقييمات: ' + (st.stats.evaluations || 0) + ' · اكتشافات: ' + (st.stats.discoveries || 0) + '</div>'
    + '</div>';
  h += '</div>';

  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">تحكم</div><div class="rs-sec-c"></div></div>';
  h += '<div class="rs-item" id="rs-dw-run" style="cursor:pointer"><div class="rs-item-h"><span class="rs-tag c">▶</span><div class="rs-item-t">تشغيل DARWIN</div></div><div class="rs-item-s">4 جزر × 10 أجيال</div></div>';
  h += '<div class="rs-item" id="rs-dw-run-long" style="cursor:pointer"><div class="rs-item-h"><span class="rs-tag h">▶▶</span><div class="rs-item-t">تشغيل مطوّل</div></div><div class="rs-item-s">4 جزر × 20 جيل</div></div>';
  h += '<div class="rs-item" id="rs-dw-stop" style="cursor:pointer"><div class="rs-item-h"><span class="rs-tag f">■</span><div class="rs-item-t">إيقاف</div></div></div>';
  h += '<div class="rs-item" id="rs-dw-export" style="cursor:pointer"><div class="rs-item-h"><span class="rs-tag i">↓</span><div class="rs-item-t">تصدير النظام البيئي</div></div><div class="rs-item-s">Hall + GenePool + Defender + Meta</div></div>';
  h += '<div class="rs-item" id="rs-dw-reset" style="cursor:pointer"><div class="rs-item-h"><span class="rs-tag c">✕</span><div class="rs-item-t">تصفير النظام</div></div></div>';
  h += '</div>';

  // Hall of Fame
  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">Hall of Fame</div><div class="rs-sec-c">' + hall.length + '</div></div>';
  if(hall.length){
    hall.slice(0, 15).forEach(function(x, i){
      var detail = '<div style="color:var(--cy);font-size:10px">impact: ' + (x.impact || 0).toFixed(2)
        + ' · stealth: ' + (x.stealth || 0).toFixed(2)
        + ' · novelty: ' + (x.novelty || 0).toFixed(2) + '</div>'
        + '<div style="color:var(--tx3);font-size:10px;margin-top:4px">' + esc(x.genome && x.genome.method || 'GET') + ' ' + esc(x.genome && x.genome.path || '') + '</div>'
        + ((x.reasons || []).length ? '<div style="color:#fbbf24;font-size:10px;margin-top:4px">' + esc(x.reasons.join(', ')) + '</div>' : '');
      h += itemHTML('h' + i, (x.impact || 0).toFixed(1), 'p', x.sig ? String(x.sig).slice(0, 40) : '', (x.reasons || []).join(' · '), detail);
    });
  } else h += emptyHTML('لا نتائج بعد', '⌬');
  h += '</div>';

  // Gene Pool
  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">Gene Pool</div><div class="rs-sec-c">' + pool.length + '</div></div>';
  if(pool.length){
    pool.slice(0, 20).forEach(function(g, i){
      var detail = '<div style="color:var(--tx3);font-size:10px">weight: ' + (g.weight || 0).toFixed(2)
        + ' · success: ' + (g.success || 0) + ' · usage: ' + (g.usage || 0) + '</div>'
        + barHTML(Math.min(1, (g.weight || 0) / 3), 'var(--in)');
      h += itemHTML('gp' + i, g.type || '?', 'i', String(g.value || '').slice(0, 50), 'w=' + (g.weight || 0).toFixed(2), detail);
    });
  } else h += emptyHTML('المسبح فارغ', '◈');
  h += '</div>';

  // Defender
  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">Defender Model</div><div class="rs-sec-c">' + defender.length + '</div></div>';
  if(defender.length){
    defender.slice(0, 20).forEach(function(r, i){
      var detail = '<div style="color:var(--tx3);font-size:10px">hits: ' + (r.hits || 0)
        + ' · misses: ' + (r.misses || 0) + ' · weight: ' + (r.w || 0).toFixed(2) + '</div>'
        + barHTML(Math.min(1, r.w || 0), 'var(--ac)');
      h += itemHTML('df' + i, (r.w || 0).toFixed(2), (r.w || 0) > 0.6 ? 'c' : 'h', String(r.pattern || '').slice(0, 40), '', detail);
    });
  } else h += emptyHTML('لا قواعد بعد', '⚠');
  h += '</div>';

  // Meta learning
  var ops = (meta && meta.ops) ? meta.ops : {};
  var opKeys = Object.keys(ops);
  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">Meta-Learning</div><div class="rs-sec-c">' + opKeys.length + '</div></div>';
  if(opKeys.length){
    opKeys.forEach(function(op, i){
      var o = ops[op];
      var total = (o.wins || 0) + (o.losses || 0);
      var rate = total ? (o.wins / total) : 0;
      var detail = '<div style="color:var(--tx3);font-size:10px">wins: ' + (o.wins || 0)
        + ' · losses: ' + (o.losses || 0) + ' · rate: ' + pct(rate) + '</div>'
        + barHTML(rate, rate > 0.5 ? 'var(--su)' : 'var(--wa)');
      h += itemHTML('mt' + i, pct(rate), rate > 0.5 ? 'g' : 'l', op, '', detail);
    });
  } else h += emptyHTML('لم يُتعلّم بعد', '◈');
  h += '</div>';

  // Wire buttons
  setTimeout(function(){
    function wire(id, fn){
      var el = $('#rs-' + id);
      if(el) el.addEventListener('click', fn);
    }
    wire('dw-run', async function(){
      if(busy) return; busy = true;
      toast('DARWIN يبدأ...');
      progress(true);
      var r = await dw.evolve({ population: 10, generations: 10 });
      progress(false); busy = false;
      if(r.ok) toast('انتهى: ' + r.summary.evaluations + ' تقييم');
      else toast('فشل: ' + (r.reason || ''));
      render();
    });
    wire('dw-run-long', async function(){
      if(busy) return; busy = true;
      toast('DARWIN مطوّل...');
      progress(true);
      var r = await dw.evolve({ population: 12, generations: 20 });
      progress(false); busy = false;
      if(r.ok) toast('انتهى: ' + r.summary.evaluations + ' تقييم');
      else toast('فشل');
      render();
    });
    wire('dw-stop', function(){
      dw.stop();
      toast('إيقاف');
      render();
    });
    wire('dw-export', function(){
      try {
        var json = dw.export();
        var blob = new Blob([json], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'darwin-ecosystem-' + Date.now() + '.json';
        a.click();
        setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
        toast('تصدير');
      } catch(e){ toast('فشل'); }
    });
    wire('dw-reset', function(){
      if(!window.confirm('تصفير Hall + GenePool + Defender + Meta؟')) return;
      if(!window.confirm('تأكيد أخير.')) return;
      dw.reset();
      toast('تم التصفير');
      render();
    });
  }, 50);

  return h;
}

// ══════════════════════════════════════════════════════════════
// SYNAPSE
// ══════════════════════════════════════════════════════════════
function renderSynapse(d){
  var sy = core.synapse;
  var h = '';

  if(!sy){
    h += emptyHTML('وحدة SYNAPSE غير محمّلة -- تأكد من وجود 15_synapse.js', '◎');
    return h;
  }

  var st = sy.state();
  var profile = (d.meta||[]).filter(function(m){ return m.kind === 'synapse-profile'; });
  var probes = (d.meta||[]).filter(function(m){ return m.kind === 'synapse-probe'; });
  var payloads = (d.meta||[]).filter(function(m){ return m.kind === 'synapse-payload'; });
  var hits = payloads.filter(function(p){ return p.interesting; });

  h += '<div class="rs-stats">';
  h += statCard('Probes', st.probes, '', 'var(--in)');
  h += statCard('Payloads', st.payloads, '', 'var(--pu)');
  h += statCard('Techs', st.learnedTechs, '', 'var(--wa)');
  h += statCard('Targets', st.targets || 0, '', 'var(--cy)');
  h += '</div>';

  h += '<div class="rs-sec">';
  h += '<div class="rs-item" style="cursor:default">'
    + '<div class="rs-item-h"><span class="rs-tag ' + (st.running ? 'g' : 'l') + '">' + (st.running ? 'يعمل' : 'متوقف') + '</span>'
    + '<div class="rs-item-t">الحالة</div></div>'
    + '<div class="rs-item-s">فحوصات: ' + (st.stats.probes || 0) + ' · حمولات: ' + (st.stats.payloads || 0) + ' · إصابات: ' + (st.stats.hits || 0) + '</div>'
    + '</div>';
  h += '</div>';

  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">تحكم</div><div class="rs-sec-c"></div></div>';
  h += '<div class="rs-item" id="rs-sy-run" style="cursor:pointer"><div class="rs-item-h"><span class="rs-tag c">▶</span><div class="rs-item-t">تشغيل SYNAPSE</div></div><div class="rs-item-s">استدلال بايزي + فحوصات نشطة</div></div>';
  h += '<div class="rs-item" id="rs-sy-stop" style="cursor:pointer"><div class="rs-item-h"><span class="rs-tag f">■</span><div class="rs-item-t">إيقاف</div></div></div>';
  h += '<div class="rs-item" id="rs-sy-export" style="cursor:pointer"><div class="rs-item-h"><span class="rs-tag i">↓</span><div class="rs-item-t">تصدير التعلّم</div></div><div class="rs-item-s">priors + feedback</div></div>';
  h += '<div class="rs-item" id="rs-sy-reset" style="cursor:pointer"><div class="rs-item-h"><span class="rs-tag c">✕</span><div class="rs-item-t">تصفير التعلّم</div></div></div>';
  h += '</div>';

  // Latest profile
  if(profile.length){
    var latest = profile[profile.length - 1];
    h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">آخر بصمة</div><div class="rs-sec-c">' + profile.length + '</div></div>';
    var stack = latest.stack || {};
    var stackLines = [];
    if(stack.server) stackLines.push('server: ' + stack.server);
    if(stack.runtime) stackLines.push('runtime: ' + stack.runtime);
    if(stack.cms) stackLines.push('cms: ' + stack.cms);
    if(stack.framework) stackLines.push('framework: ' + stack.framework);
    if(stack.extras && stack.extras.length) stackLines.push('extras: ' + stack.extras.join(', '));
    var sigs = latest.signals || {};
    var sigKeys = Object.keys(sigs);
    var detail = '<div style="color:var(--cy);font-size:11px">fingerprint: ' + esc(String(latest.fingerprint || '').slice(0, 16)) + '</div>'
      + '<div style="color:var(--tx3);font-size:11px;margin-top:4px">' + esc(stackLines.join(' · ')) + '</div>'
      + '<div style="color:var(--tx4);font-size:10px;margin-top:6px">signals (' + sigKeys.length + '): ' + esc(sigKeys.slice(0, 12).join(', ')) + '</div>';
    h += itemHTML('prof', 'P', 'p', latest.host || '', stack.cms || stack.framework || stack.runtime || 'unknown', detail);
    h += '</div>';
  }

  // Probes fired
  var fired = probes.filter(function(p){ return p.fired; });
  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">Probes Fired</div><div class="rs-sec-c">' + fired.length + '</div></div>';
  if(fired.length){
    fired.slice(-20).reverse().forEach(function(p, i){
      var detail = '<div style="color:var(--tx3);font-size:10px">status: ' + (p.status || 0)
        + ' · len: ' + (p.len || 0) + ' · ms: ' + Math.round(p.ms || 0) + '</div>';
      h += itemHTML('pf' + i, '✓', 'g', p.url || '', p.tech || '', detail);
    });
  } else h += emptyHTML('لا فحوصات ناجحة', '◎');
  h += '</div>';

  // Payload hits
  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">Payload Hits</div><div class="rs-sec-c">' + hits.length + '</div></div>';
  if(hits.length){
    hits.slice(-20).reverse().forEach(function(p, i){
      var detail = '<div style="color:#f87171;font-size:11px">' + esc((p.signals || []).join(' · ')) + '</div>'
        + '<div style="color:var(--tx3);font-size:10px">status: ' + (p.status || 0) + ' · len: ' + (p.len || 0) + '</div>';
      h += itemHTML('ph' + i, p.tech || 'x', 'c', p.url || '', (p.signals || []).join(','), detail);
    });
  } else h += emptyHTML('لا إصابات بعد', '◈');
  h += '</div>';

  setTimeout(function(){
    function wire(id, fn){
      var el = $('#rs-' + id);
      if(el) el.addEventListener('click', fn);
    }
    wire('sy-run', async function(){
      if(busy) return; busy = true;
      toast('SYNAPSE يستنتج...');
      progress(true);
      var r = await sy.run();
      progress(false); busy = false;
      if(r.ok){
        var sm = r.summary || {};
        toast('انتهى: top=' + ((sm.top && sm.top[0] && sm.top[0].tech) || '?'));
      } else {
        toast('فشل: ' + (r.reason || r.error || ''));
      }
      render();
    });
    wire('sy-stop', function(){
      sy.stop();
      toast('إيقاف');
      render();
    });
    wire('sy-export', function(){
      try {
        var json = sy.exportLearning();
        var blob = new Blob([json], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'synapse-learning-' + Date.now() + '.json';
        a.click();
        setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
        toast('تصدير');
      } catch(e){ toast('فشل'); }
    });
    wire('sy-reset', function(){
      if(!window.confirm('تصفير priors + feedback؟')) return;
      sy.resetLearning();
      toast('تم');
      render();
    });
  }, 50);

  return h;
}

// ══════════════════════════════════════════════════════════════
// OPERATOR
// ══════════════════════════════════════════════════════════════
function renderOperator(d){
  var op = core.operator;
  var h = '';

  if(!op){
    h += emptyHTML('وحدة OPERATOR غير محمّلة', '⏱');
    return h;
  }

  var snaps = (d.meta||[]).filter(function(m){ return m.kind === 'snapshot'; });
  snaps.sort(function(a, b){ return b.at - a.at; });

  var latest = snaps[0] || null;
  var ageMs = latest ? (Date.now() - latest.at) : 0;

  h += '<div class="rs-stats">';
  h += statCard('لقطات', snaps.length, '', 'var(--pu)');
  h += statCard('أحدث', latest ? fmtAge(ageMs) : '--', '', 'var(--in)');
  h += statCard('عناصر', latest ? latest.total : 0, '', 'var(--wa)');
  h += statCard('تلقائي', op.autoEnabled() ? 'مفعّل' : 'موقوف', '', op.autoEnabled() ? 'var(--su)' : 'var(--tx4)');
  h += '</div>';

  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">إجراءات</div><div class="rs-sec-c"></div></div>';
  h += '<div class="rs-item" id="rs-op-snap" style="cursor:pointer"><div class="rs-item-h"><span class="rs-tag g">◉</span><div class="rs-item-t">التقاط لقطة الآن</div></div></div>';
  h += '<div class="rs-item" id="rs-op-diff" style="cursor:pointer"><div class="rs-item-h"><span class="rs-tag i">△</span><div class="rs-item-t">مقارنة مع أحدث لقطة</div></div><div class="rs-item-s">' + (latest ? 'مرّ ' + fmtAge(ageMs) : 'لا لقطات') + '</div></div>';
  h += '<div class="rs-item" id="rs-op-auto" style="cursor:pointer"><div class="rs-item-h"><span class="rs-tag ' + (op.autoEnabled() ? 'g' : 'l') + '">⟳</span><div class="rs-item-t">' + (op.autoEnabled() ? 'إيقاف' : 'تفعيل') + ' التلقائي</div></div></div>';
  h += '</div>';

  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">تقارير</div><div class="rs-sec-c"></div></div>';
  h += '<div class="rs-item" id="rs-op-rep-md" style="cursor:pointer"><div class="rs-item-h"><span class="rs-tag p">MD</span><div class="rs-item-t">تقرير Markdown</div></div></div>';
  h += '<div class="rs-item" id="rs-op-rep-json" style="cursor:pointer"><div class="rs-item-h"><span class="rs-tag i">JSON</span><div class="rs-item-t">تصدير JSON منظّم</div></div></div>';
  h += '<div class="rs-item" id="rs-op-rep-h1" style="cursor:pointer"><div class="rs-item-h"><span class="rs-tag c">H1</span><div class="rs-item-t">تقرير HackerOne</div></div></div>';
  h += '</div>';

  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">السجل الزمني</div><div class="rs-sec-c">' + snaps.length + '</div></div>';
  if(snaps.length){
    snaps.slice(0, 30).forEach(function(s, i){
      var ts = new Date(s.at);
      var dateStr = ts.toLocaleDateString() + ' ' + ts.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
      var counts = s.counts || {};
      var nonZero = Object.keys(counts).filter(function(k){ return counts[k] > 0; });
      var sub = s.label + ' · ' + (s.total || 0) + ' عنصر';
      var detail = '<div style="color:var(--tx3);font-size:10px;font-family:ui-monospace,monospace">'
        + nonZero.slice(0, 8).map(function(k){ return k + ':' + counts[k]; }).join(' · ')
        + '</div>';
      h += '<div class="rs-item" data-snap-id="' + esc(s.id) + '">'
        + '<div class="rs-item-h"><span class="rs-tag n">' + fmtAge(Date.now() - s.at) + '</span><div class="rs-item-t">' + esc(dateStr) + '</div></div>'
        + '<div class="rs-item-s">' + esc(sub) + '</div>'
        + '<div class="rs-item-x">' + detail + '</div>'
        + '</div>';
    });
  } else h += emptyHTML('لا لقطات', '⏱');
  h += '</div>';

  if(d.__operatorDiff){
    var df = d.__operatorDiff;
    h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">نتيجة المقارنة</div><div class="rs-sec-c">' + fmtAge(df.spanMs) + '</div></div>';
    h += '<div class="rs-stats">';
    h += statCard('مضاف', df.totalAdded, '', 'var(--su)');
    h += statCard('محذوف', df.totalRemoved, '', 'var(--ac)');
    h += statCard('بقي', df.totalKept, '', 'var(--in)');
    h += statCard('مدى', fmtAge(df.spanMs), '', 'var(--pu)');
    h += '</div>';
    var stores = Object.keys(df.perStore || {});
    var changed = stores.filter(function(s){
      return df.perStore[s].added > 0 || df.perStore[s].removed > 0;
    });
    if(changed.length){
      changed.forEach(function(s, i){
        var st = df.perStore[s];
        var detail = '';
        if(st.addedPreview && st.addedPreview.length){
          st.addedPreview.slice(0, 5).forEach(function(a){
            detail += '<div style="color:#4ade80;font-size:10px;word-break:break-all">+ ' + esc(a.preview || a.id) + '</div>';
          });
        }
        if(st.removedPreview && st.removedPreview.length){
          st.removedPreview.slice(0, 5).forEach(function(a){
            detail += '<div style="color:#f87171;font-size:10px;word-break:break-all">− ' + esc(a.preview || a.id) + '</div>';
          });
        }
        h += itemHTML('df' + i, '+' + st.added + ' / −' + st.removed, st.added > 0 ? 'g' : 'h', s, st.kept + ' بقي', detail);
      });
    } else h += emptyHTML('لا تغييرات', '=');
    h += '</div>';
  }

  setTimeout(function(){
    function wire(id, fn){
      var el = $('#rs-' + id);
      if(el) el.addEventListener('click', fn);
    }
    wire('op-snap', async function(){
      if(busy) return; busy = true;
      toast('التقاط...');
      progress(true);
      var r = await op.snapshot('manual');
      progress(false); busy = false;
      if(r.ok) toast('لقطة: ' + r.total);
      render();
    });
    wire('op-diff', async function(){
      if(busy) return; busy = true;
      toast('مقارنة...');
      progress(true);
      var r = await op.diffAgainstLatest();
      progress(false); busy = false;
      if(r.ok){
        d.__operatorDiff = r.summary;
        toast('+' + r.summary.totalAdded + ' / −' + r.summary.totalRemoved);
        render();
      } else toast('فشل: ' + (r.reason || ''));
    });
    wire('op-auto', function(){
      var cur = op.autoEnabled();
      op.setAuto(!cur);
      toast(!cur ? 'مفعّل' : 'موقوف');
      render();
    });
    wire('op-rep-md', async function(){
      toast('تقرير...');
      progress(true);
      var r = await op.downloadReport('markdown');
      progress(false);
      if(r.ok) toast('تنزيل: ' + r.len);
    });
    wire('op-rep-json', async function(){
      toast('تصدير...');
      progress(true);
      var r = await op.downloadReport('json');
      progress(false);
      if(r.ok) toast('تنزيل');
    });
    wire('op-rep-h1', async function(){
      toast('H1...');
      progress(true);
      var r = await op.downloadReport('hackerone');
      progress(false);
      if(r.ok) toast('تنزيل');
    });
    sh.querySelectorAll('[data-snap-id]').forEach(function(el){
      el.addEventListener('click', function(){ el.classList.toggle('exp'); });
    });
  }, 50);

  return h;
}

// ══════════════════════════════════════════════════════════════
// CHAINS
// ══════════════════════════════════════════════════════════════
function renderChains(d){
  var chains = (d.meta||[]).filter(function(m){ return m.kind === 'chain-candidate'; }).filter(function(m){ return matches(m, query); });
  var h = '';
  var crit = chains.filter(function(c){ return c.severity === 'CRITICAL'; }).length;
  var high = chains.filter(function(c){ return c.severity === 'HIGH'; }).length;
  var med = chains.filter(function(c){ return c.severity === 'MEDIUM'; }).length;

  h += '<div class="rs-stats">';
  h += statCard('Critical', crit, '', 'var(--ac)');
  h += statCard('High', high, '', 'var(--wa)');
  h += statCard('Medium', med, '', 'var(--in)');
  h += statCard('Total', chains.length, '', 'var(--pu)');
  h += '</div>';

  if(!chains.length){
    h += emptyHTML('لا سلاسل -- اضغط فحص ثم استغلال', '⛓');
    return h;
  }

  var order = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  chains.sort(function(a, b){ return (order[b.severity]||0) - (order[a.severity]||0); });

  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">Attack Chains</div><div class="rs-sec-c">' + chains.length + '</div></div>';
  chains.forEach(function(c, i){
    var detail = '';
    detail += '<div style="color:var(--tx);font-size:11.5px;line-height:1.6;margin-bottom:8px">' + esc(c.narrative || '') + '</div>';
    if(c.cvss) detail += '<div style="color:var(--cy);font-size:10px;font-family:ui-monospace,monospace;margin-bottom:8px">' + esc(c.cvss) + '</div>';
    if(c.poc && c.poc.length){
      detail += '<div style="color:var(--tx4);font-size:10px;margin-top:6px;margin-bottom:2px">STEPS</div>';
      c.poc.forEach(function(s){
        detail += '<div style="color:#fbbf24;font-size:10.5px;font-family:ui-monospace,monospace;padding:2px 0;border-left:2px solid #fbbf24;padding-left:8px;margin:2px 0">' + esc(s) + '</div>';
      });
    }
    if(c.remediation && c.remediation.length){
      detail += '<div style="color:var(--tx4);font-size:10px;margin-top:8px;margin-bottom:2px">REMEDIATION</div>';
      c.remediation.forEach(function(s){
        detail += '<div style="color:#4ade80;font-size:10.5px;padding:1px 0">✓ ' + esc(s) + '</div>';
      });
    }
    h += itemHTML('ch' + i, c.severity, sevClass(c.severity), c.title || 'chain', c.id || '', detail);
  });
  h += '</div>';
  return h;
}

// ══════════════════════════════════════════════════════════════
// DASH
// ══════════════════════════════════════════════════════════════
function renderDash(d){
  var h = '';
  var crit = (d.secrets||[]).filter(function(s){ return String(s.severity||'').toUpperCase() === 'CRITICAL'; }).length;
  var chains = (d.meta||[]).filter(function(m){ return m.kind === 'chain-candidate'; });
  var argusHits = (d.meta||[]).filter(function(m){ return m.kind === 'argus-hit'; });
  var pulsarHits = (d.meta||[]).filter(function(m){ return /^pulsar-/.test(m.kind || ''); });
  var dwState = core.darwin ? core.darwin.state() : { hallOfFame: 0 };
  var syState = core.synapse ? core.synapse.state() : { stats: { hits: 0 } };

  h += '<div class="rs-stats">';
  h += statCard('سلاسل', chains.length, '', 'var(--pu)');
  h += statCard('DARWIN', dwState.hallOfFame, '', 'var(--in)');
  h += statCard('SYNAPSE', (syState.stats && syState.stats.hits) || 0, '', 'var(--cy)');
  h += statCard('أسرار', (d.secrets||[]).length, '', crit > 0 ? 'var(--ac)' : 'var(--wa)');
  h += '</div>';

  if(secure && secure.enabled()){
    h += '<div class="rs-sec"><div style="background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.3);border-radius:8px;padding:8px 12px;color:#4ade80;font-size:11px">🔒 التشفير مفعّل</div></div>';
  }

  var net = (d.network||[]).slice(-6).reverse().filter(function(n){ return matches(n, query); });
  if(net.length){
    h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">آخر الطلبات</div><div class="rs-sec-c">' + (d.network||[]).length + '</div></div>';
    net.forEach(function(n, i){ h += itemHTML('net' + i, n.method || 'GET', 'n', n.url || '', n.source || '', ''); });
    h += '</div>';
  }

  var sec = (d.secrets||[]).slice(-6).reverse().filter(function(s){ return matches(s, query); });
  if(sec.length){
    h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">آخر الأسرار</div><div class="rs-sec-c">' + (d.secrets||[]).length + '</div></div>';
    sec.forEach(function(s, i){
      var detail = '<div style="color:#f87171;font-size:11px;font-family:ui-monospace,monospace">' + esc(s.maskedValue || s.value || '') + '</div>';
      h += itemHTML('sec' + i, s.severity || 'LOW', sevClass(s.severity), s.name || 'secret', s.source || '', detail);
    });
    h += '</div>';
  }

  if(!net.length && !sec.length) h += emptyHTML('لا نتائج', '◉');
  return h;
}

// ══════════════════════════════════════════════════════════════
// RECON
// ══════════════════════════════════════════════════════════════
function renderRecon(d){
  var h = '';
  var eps = (d.endpoints||[]).filter(function(e){ return matches(e, query); }).slice(-80).reverse();
  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">المسارات</div><div class="rs-sec-c">' + eps.length + '</div></div>';
  if(eps.length){
    eps.forEach(function(e, i){
      var url = e.url || e.path || JSON.stringify(e).slice(0, 100);
      var score = e.interestScore || 0;
      var tag = score >= 60 ? 'HOT' : (e.inScope ? 'IN' : 'EXT');
      var cls = score >= 60 ? 'c' : (e.inScope ? 'g' : 'l');
      var detail = '<div style="color:var(--tx3);font-size:10px">'
        + (score ? 'اهتمام: ' + score + '/100' : '')
        + (e.type ? ' · ' + esc(e.type) : '')
        + '</div>';
      h += itemHTML('ep' + i, tag, cls, url, e.source || '', detail);
    });
  } else h += emptyHTML('لا مسارات', '◈');
  h += '</div>';

  var sec = (d.secrets||[]).filter(function(s){ return matches(s, query); }).slice(-60).reverse();
  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">الأسرار</div><div class="rs-sec-c">' + sec.length + '</div></div>';
  if(sec.length){
    sec.forEach(function(s, i){
      var detail = '<div style="color:#f87171;font-size:11px;font-family:ui-monospace,monospace">' + esc(s.maskedValue || s.value || '') + '</div>';
      h += itemHTML('sc' + i, s.severity || 'LOW', sevClass(s.severity), s.name || 'secret', '', detail);
    });
  } else h += emptyHTML('لا أسرار', '◆');
  h += '</div>';

  var vals = (d.meta||[]).filter(function(m){ return m.kind === 'secret-validation'; }).filter(function(m){ return matches(m, query); });
  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">التحقق من الأسرار</div><div class="rs-sec-c">' + vals.length + '</div></div>';
  if(vals.length){
    vals.forEach(function(v, i){
      var tag = v.valid === true ? 'VALID' : (v.valid === false ? 'INVALID' : 'SKIP');
      var cls = v.valid === true ? 'c' : (v.valid === false ? 'f' : 'l');
      var detail = '';
      if(v.evidence) detail += '<div style="color:#f87171;font-size:11px">' + esc(v.evidence) + '</div>';
      if(v.scopes) detail += '<div style="color:var(--tx3);font-size:10px">scopes: ' + esc(String(v.scopes)) + '</div>';
      if(v.reason) detail += '<div style="color:var(--tx4);font-size:10px">' + esc(v.reason) + '</div>';
      h += itemHTML('val' + i, tag, cls, v.name || 'secret', v.subject || '', detail);
    });
  } else h += emptyHTML('لا نتائج تحقق -- اضغط ✓ تحقق', '✓');
  h += '</div>';

  var jw = (d.jwt||[]).filter(function(j){ return matches(j, query); });
  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">JWT</div><div class="rs-sec-c">' + jw.length + '</div></div>';
  if(jw.length){
    jw.forEach(function(j, i){
      var alg = (j.header && j.header.alg) || '?';
      var detail = '<div style="font-size:11px;color:var(--tx3);font-family:ui-monospace,monospace">alg: ' + esc(alg) + ' · admin: ' + (j.hasAdminRole ? 'نعم' : 'لا') + '</div>';
      h += itemHTML('jw' + i, alg === 'none' ? 'CRITICAL' : 'TOKEN', alg === 'none' ? 'c' : 'p', j.source || 'JWT', '', detail);
    });
  } else h += emptyHTML('لا JWT', '⚿');
  h += '</div>';

  var st = (d.storage||[]).filter(function(s){ return matches(s, query); }).slice(0, 30);
  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">التخزين</div><div class="rs-sec-c">' + st.length + '</div></div>';
  if(st.length){
    st.forEach(function(s, i){
      var detail = '<div style="color:#38bdf8;font-size:11px;font-family:ui-monospace,monospace">' + esc(s.value || '') + '</div>';
      h += itemHTML('st' + i, s.risk || 'LOW', sevClass(s.risk), (s.store || '') + ' · ' + (s.key || ''), '', detail);
    });
  } else h += emptyHTML('لا عناصر', '▤');
  h += '</div>';

  return h;
}

// ══════════════════════════════════════════════════════════════
// VULN
// ══════════════════════════════════════════════════════════════
function renderVuln(d){
  var h = '';

  var cspItems = (d.meta||[]).filter(function(m){ return m.kind === 'csp'; }).filter(function(m){ return matches(m, query); });
  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">CSP</div><div class="rs-sec-c">' + cspItems.length + '</div></div>';
  if(cspItems.length){
    cspItems.forEach(function(c, i){
      var findings = c.findings || [];
      var worst = 'NONE';
      var RANK = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0 };
      findings.forEach(function(f){
        var sv = String(f.sev || 'LOW').toUpperCase();
        if((RANK[sv] || 0) > (RANK[worst] || 0)) worst = sv;
      });
      var src = c.source || 'meta';
      var title = src === 'http-header' ? (c.url || '') : 'Meta tag -- ' + (c.host || '');
      var sub = findings.length ? findings.length + ' finding(s)' : 'no issues';
      var detail = '';
      findings.forEach(function(f){
        detail += '<div style="margin-top:4px"><span class="rs-tag ' + sevClass(f.sev) + '">' + esc(f.sev || '') + '</span><span style="color:#f87171;font-size:11px">' + esc(f.issue || '') + '</span></div>';
      });
      h += itemHTML('csp' + i, worst, sevClass(worst), title, sub, detail);
    });
  } else h += emptyHTML('لا CSP', '⛨');
  h += '</div>';

  var cors = (d.cors||[]).filter(function(c){ return matches(c, query); });
  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">CORS</div><div class="rs-sec-c">' + cors.length + '</div></div>';
  if(cors.length){
    cors.forEach(function(c, i){
      var detail = '<div style="color:var(--tx2);font-size:11px">Origin: <code style="color:#38bdf8">' + esc(c.origin || '') + '</code></div><div style="color:#f87171;font-size:11px">' + esc(c.issue || '') + '</div>';
      h += itemHTML('co' + i, c.risk || 'LOW', sevClass(c.risk), c.url || '', '', detail);
    });
  } else h += emptyHTML('لا CORS', '⚠');
  h += '</div>';

  var forms = (d.forms||[]).filter(function(f){ return matches(f, query); });
  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">النماذج</div><div class="rs-sec-c">' + forms.length + '</div></div>';
  if(forms.length){
    forms.forEach(function(f, i){
      var hasIssues = f.issues && f.issues.length;
      var detail = '<div style="color:var(--tx3);font-size:11px">CSRF: ' + (f.hasCsrf ? '✓' : '✗') + '</div>';
      if(hasIssues) detail += '<div style="color:#f87171;font-size:11px">' + esc(f.issues.join(' · ')) + '</div>';
      h += itemHTML('fm' + i, f.method || 'GET', hasIssues ? 'h' : 'g', f.action || '', '', detail);
    });
  } else h += emptyHTML('لا نماذج', '▢');
  h += '</div>';

  var ck = (d.cookies||[]).filter(function(c){ return matches(c, query); });
  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">الكوكيز</div><div class="rs-sec-c">' + ck.length + '</div></div>';
  if(ck.length){
    ck.forEach(function(c, i){
      var hasIssues = c.issues && c.issues.length;
      var detail = '<div style="font-size:11px;color:var(--tx3);word-break:break-all">' + esc(String(c.value || '').slice(0, 80)) + '</div>';
      if(hasIssues) detail += '<div style="color:#f87171;font-size:11px">' + esc(c.issues.join(' · ')) + '</div>';
      h += itemHTML('ck' + i, c.sessionLike ? 'SESSION' : 'COOKIE', hasIssues ? 'h' : 'l', c.name || '', '', detail);
    });
  } else h += emptyHTML('لا كوكيز', '◌');
  h += '</div>';

  var sri = (d.sri||[]).filter(function(s){ return matches(s, query); });
  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">SRI</div><div class="rs-sec-c">' + sri.length + '</div></div>';
  if(sri.length){
    sri.slice(0, 30).forEach(function(s, i){
      h += itemHTML('sr' + i, s.risk || 'LOW', sevClass(s.risk), s.url || '', s.tag || '', '<div style="color:#f87171;font-size:11px">' + esc(s.issue || '') + '</div>');
    });
  } else h += emptyHTML('لا SRI', '◈');
  h += '</div>';

  return h;
}

// ══════════════════════════════════════════════════════════════
// OFFENSIVE
// ══════════════════════════════════════════════════════════════
function renderOffensive(d){
  var h = '';

  var gql = (d.graphql||[]).filter(function(g){ return matches(g, query); });
  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">GraphQL</div><div class="rs-sec-c">' + gql.length + '</div></div>';
  if(gql.length){
    gql.forEach(function(g, i){
      var title = g.endpoint || 'graphql';
      var sub = g.kind === 'graphql' ? (g.typeCount || 0) + ' types' : (g.flagged || 0) + ' flagged';
      var detail = '';
      if(g.kind === 'graphql' && g.mutations && g.mutations.length) detail += '<div style="color:#c084fc;font-size:11px">mutations: ' + esc(g.mutations.join(', ')) + '</div>';
      h += itemHTML('gq' + i, g.kind === 'graphql' ? 'SCHEMA' : 'FUZZ', 'p', title, sub, detail);
    });
  } else h += emptyHTML('لا GraphQL', '◈');
  h += '</div>';

  var ws = (d.meta||[]).filter(function(m){ return m.kind === 'ws-socket'; }).filter(function(m){ return matches(m, query); });
  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">WebSocket</div><div class="rs-sec-c">' + ws.length + '</div></div>';
  if(ws.length){
    ws.forEach(function(w, i){
      var sub = (w.sent || 0) + ' sent / ' + (w.received || 0) + ' recv';
      var detail = '';
      (w.messages || []).slice(-10).forEach(function(m){
        detail += '<div style="color:' + (m.dir === 'in' ? '#4ade80' : '#60a5fa') + ';font-size:10px;font-family:ui-monospace,monospace;word-break:break-all">' + (m.dir === 'in' ? '←' : '→') + ' ' + esc(String(m.data || '').slice(0, 150)) + '</div>';
      });
      h += itemHTML('ws' + i, 'WS', 'i', w.url || '', sub, detail);
    });
  } else h += emptyHTML('لا WebSocket', '⟁');
  h += '</div>';

  var race = (d.meta||[]).filter(function(m){ return m.kind === 'race'; }).filter(function(m){ return matches(m, query); });
  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">Race Condition</div><div class="rs-sec-c">' + race.length + '</div></div>';
  if(race.length){
    race.forEach(function(r, i){
      var tag = r.verdict && r.verdict.indexOf('RACE-DETECTED') === 0 ? 'CRITICAL' : 'LOW';
      var detail = '<div style="color:#f87171;font-size:11px">' + esc(r.verdict || '') + '</div>';
      h += itemHTML('rc' + i, tag, sevClass(tag), r.url || '', (r.method || 'POST') + ' x' + (r.n || 0), detail);
    });
  } else h += emptyHTML('لا race', '⚡');
  h += '</div>';

  var crlf = (d.meta||[]).filter(function(m){ return m.kind === 'crlf'; }).filter(function(m){ return matches(m, query); });
  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">CRLF</div><div class="rs-sec-c">' + crlf.length + '</div></div>';
  if(crlf.length){
    crlf.forEach(function(c, i){
      var tag = c.reflected > 0 ? 'HIGH' : 'LOW';
      var detail = '<div style="color:#f87171;font-size:11px">reflected: ' + (c.reflected || 0) + ' of ' + (c.total || 0) + '</div>';
      h += itemHTML('cr' + i, tag, sevClass(tag), c.url || '', '', detail);
    });
  } else h += emptyHTML('لا CRLF', '⌁');
  h += '</div>';

  var pm = (d.meta||[]).filter(function(m){ return m.kind === 'pm-exploit'; }).filter(function(m){ return matches(m, query); });
  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">postMessage</div><div class="rs-sec-c">' + pm.length + '</div></div>';
  if(pm.length){
    pm.forEach(function(p, i){
      h += itemHTML('pm' + i, 'POC', 'm', p.targetOrigin || '', '', '');
    });
  } else h += emptyHTML('لا PoC', '⌘');
  h += '</div>';

  var pg = (d.meta||[]).filter(function(m){ return m.kind === 'proto-gadgets'; }).filter(function(m){ return matches(m, query); });
  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">Prototype Gadgets</div><div class="rs-sec-c">' + pg.length + '</div></div>';
  if(pg.length){
    pg.forEach(function(p, i){
      var detail = '';
      (p.gadgets || []).slice(0, 5).forEach(function(g){
        detail += '<div style="color:#c084fc;font-size:10px"><b>' + esc(g.lib || '') + '</b> → ' + esc(g.sink || '') + '</div>';
      });
      h += itemHTML('pg' + i, 'GADGET', 'p', 'Library gadgets', '', detail);
    });
  } else h += emptyHTML('لا gadgets', '◈');
  h += '</div>';

  return h;
}

// ══════════════════════════════════════════════════════════════
// EXPLOIT
// ══════════════════════════════════════════════════════════════
function renderExploit(d){
  var h = '';

  var runs = (d.meta||[]).filter(function(m){ return m.kind === 'chain-success'; }).filter(function(m){ return matches(m, query); });
  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">نجاحات</div><div class="rs-sec-c">' + runs.length + '</div></div>';
  if(runs.length){
    runs.forEach(function(r, i){
      var ev = JSON.stringify(r.evidence || '').slice(0, 300);
      h += itemHTML('ex' + i, 'EXPLOITED', 'c', r.exploit || 'chain', '', '<div style="color:#f87171;font-size:11px;word-break:break-all">' + esc(ev) + '</div>');
    });
  } else h += emptyHTML('لا نجاحات', '⚔');
  h += '</div>';

  var attempts = (d.meta||[]).filter(function(m){ return m.kind === 'chain-attempt'; }).filter(function(m){ return matches(m, query); });
  var sc = attempts.filter(function(a){ return a.success; }).length;
  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">سجل المحاولات</div><div class="rs-sec-c">' + attempts.length + ' (' + sc + '✓)</div></div>';
  if(attempts.length){
    attempts.slice(-50).reverse().forEach(function(a, i){
      var tag = a.success ? 'SUCCESS' : 'FAILED';
      var cls = a.success ? 'g' : 'f';
      var f = a.finding || {};
      var title = f.url || f.name || f.__kind || 'finding';
      var sub = (a.exploit || '?') + ' -- ' + (a.reason || (a.success ? 'worked' : 'no match'));
      h += itemHTML('at' + i, tag, cls, title, sub, '');
    });
  } else h += emptyHTML('لا محاولات', '⌘');
  h += '</div>';

  var crawls = (d.meta||[]).filter(function(m){ return m.kind === 'crawl'; });
  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">الزحف</div><div class="rs-sec-c">' + crawls.length + '</div></div>';
  if(crawls.length){
    crawls.slice(-5).reverse().forEach(function(c, i){
      var sub = (c.pages || 0) + ' صفحة' + (c.analyzed ? ' · ' + c.analyzed + ' محللة' : '');
      h += itemHTML('cr' + i, 'CRAWL', 'i', sub, c.host || '', '');
    });
  } else h += emptyHTML('لا زحف', '🕸');
  h += '</div>';

  return h;
}

// ══════════════════════════════════════════════════════════════
// NET
// ══════════════════════════════════════════════════════════════
function renderNet(d){
  var h = '';

  var ips = (d.meta||[]).filter(function(m){ return m.kind === 'internal-ip'; }).filter(function(m){ return matches(m, query); });
  if(ips.length){
    var uniq = {};
    ips.forEach(function(r){ if(r.ip) uniq[r.ip] = r; });
    var ipList = Object.keys(uniq);
    h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">Internal IPs</div><div class="rs-sec-c">' + ipList.length + '</div></div>';
    ipList.slice(0, 30).forEach(function(ip, i){
      h += itemHTML('ip' + i, 'INTERNAL', 'h', ip, uniq[ip].source || '', '');
    });
    h += '</div>';
  }

  var probes = (d.meta||[]).filter(function(m){ return m.kind === 'endpoint-probe'; }).filter(function(m){ return matches(m, query); });
  if(probes.length){
    h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">نتائج فحص المسارات</div><div class="rs-sec-c">' + probes.length + '</div></div>';
    probes.slice(-40).reverse().forEach(function(p, i){
      var tag = p.status === 200 ? 'OPEN' : (p.status === 401 || p.status === 403 ? 'AUTH' : (p.status >= 500 ? 'ERROR' : String(p.status)));
      var cls = p.status === 200 ? 'c' : (p.status >= 500 ? 'h' : 'n');
      var detail = '<div style="color:var(--tx3);font-size:10px">' + esc(p.verdict || '') + ' · ' + (p.ms||0) + 'ms · ' + (p.bodyLen||0) + 'B</div>';
      Object.keys(p.headers||{}).slice(0, 6).forEach(function(kh){
        detail += '<div style="color:#38bdf8;font-size:10px">' + esc(kh) + ': ' + esc(p.headers[kh]) + '</div>';
      });
      h += itemHTML('pr' + i, tag, cls, p.url || '', '', detail);
    });
    h += '</div>';
  }

  var net = (d.network||[]).filter(function(n){ return matches(n, query); }).slice(-120).reverse();
  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">الطلبات</div><div class="rs-sec-c">' + net.length + '</div></div>';
  if(net.length){
    net.forEach(function(n, i){
      h += itemHTML('nt' + i, n.method || 'GET', 'n', n.url || '', n.source || '', '');
    });
  } else h += emptyHTML('لا طلبات', '⟁');
  h += '</div>';

  var sw = (d.sw||[]).filter(function(s){ return matches(s, query); });
  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">Service Workers</div><div class="rs-sec-c">' + sw.length + '</div></div>';
  if(sw.length){
    sw.forEach(function(s, i){
      h += itemHTML('sw' + i, s.state || 'SW', 'g', s.scope || '', s.scriptURL || '', '');
    });
  } else h += emptyHTML('لا Service Workers', '⚙');
  h += '</div>';

  var sm = (d.srcmaps||[]).filter(function(s){ return matches(s, query); });
  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">Source Maps</div><div class="rs-sec-c">' + sm.length + '</div></div>';
  if(sm.length){
    sm.forEach(function(s, i){
      h += itemHTML('sm' + i, 'MAP', 'p', s.mapUrl || '', s.source || '', '');
    });
  } else h += emptyHTML('لا Source Maps', '◈');
  h += '</div>';

  return h;
}

// ══════════════════════════════════════════════════════════════
// ARGUS
// ══════════════════════════════════════════════════════════════
function renderArgus(d){
  var argus = core.argus;
  var h = '';
  if(!argus){ h += emptyHTML('وحدة ARGUS غير محمّلة', '◈'); return h; }
  var st = argus.state();

  h += '<div class="rs-stats">';
  h += statCard('عُقد', st.nodes, '', 'var(--pu)');
  h += statCard('فرضيات', st.stats.hypotheses, '', 'var(--in)');
  h += statCard('اختبارات', st.stats.tried, '', 'var(--wa)');
  h += statCard('إصابات', st.stats.hits, '', 'var(--ac)');
  h += '</div>';

  h += '<div class="rs-sec">';
  h += '<div class="rs-item" style="cursor:default"><div class="rs-item-h"><span class="rs-tag ' + (st.running ? 'g' : 'l') + '">' + (st.running ? 'يعمل' : 'متوقف') + '</span><div class="rs-item-t">الحالة</div></div><div class="rs-item-s">قائمة: ' + st.queue + ' · دورات: ' + st.stats.cycles + '</div></div>';
  h += '</div>';

  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">تحكم</div><div class="rs-sec-c"></div></div>';
  h += '<div class="rs-item" id="rs-argus-run" style="cursor:pointer"><div class="rs-item-h"><span class="rs-tag g">▶</span><div class="rs-item-t">تشغيل</div></div></div>';
  h += '<div class="rs-item" id="rs-argus-stop" style="cursor:pointer"><div class="rs-item-h"><span class="rs-tag h">■</span><div class="rs-item-t">إيقاف</div></div></div>';
  h += '</div>';

  var hits = (d.meta||[]).filter(function(m){ return m.kind === 'argus-hit'; }).filter(function(m){ return matches(m, query); });
  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">إصابات</div><div class="rs-sec-c">' + hits.length + '</div></div>';
  if(hits.length){
    hits.slice(-50).reverse().forEach(function(hh, i){
      var detail = '';
      (hh.notes || []).forEach(function(nt){
        detail += '<div style="color:#f87171;font-size:11px">→ ' + esc(nt) + '</div>';
      });
      h += itemHTML('ah' + i, (hh.method || 'GET'), 'c', hh.url || '', (hh.status || '') + ' · ' + (hh.rule || ''), detail);
    });
  } else h += emptyHTML('لا إصابات', '◈');
  h += '</div>';

  setTimeout(function(){
    var r1 = $('#rs-argus-run');
    if(r1) r1.addEventListener('click', async function(){
      toast('يعمل...');
      var d1 = await argus.run();
      if(d1.ok) toast('بدأ: ' + d1.hypotheses);
      else toast('فشل: ' + (d1.reason || ''));
      render();
    });
    var r2 = $('#rs-argus-stop');
    if(r2) r2.addEventListener('click', function(){
      argus.stop();
      toast('إيقاف');
      render();
    });
  }, 50);

  return h;
}

// ══════════════════════════════════════════════════════════════
// PULSAR
// ══════════════════════════════════════════════════════════════
function renderPulsar(d){
  var pulsar = core.pulsar;
  var h = '';
  if(!pulsar){ h += emptyHTML('وحدة PULSAR غير محمّلة', '⚡'); return h; }
  var st = pulsar.state();
  var stealthSt = st.stealth || {};

  h += '<div class="rs-stats">';
  h += statCard('مسارات', st.paths, '', 'var(--in)');
  h += statCard('بارامترات', st.params, '', 'var(--wa)');
  h += statCard('طرق', st.methods, '', 'var(--pu)');
  h += statCard('رؤوس', st.headers, '', 'var(--cy)');
  h += '</div>';

  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">تخفي</div><div class="rs-sec-c"></div></div>';
  h += '<div class="rs-item" style="cursor:default"><div class="rs-item-h"><span class="rs-tag ' + (stealthSt.backoff > 0 ? 'h' : 'g') + '">' + (stealthSt.backoff > 0 ? 'BACKOFF' : 'OK') + '</span><div class="rs-item-t">الانحدار</div></div><div class="rs-item-s">' + (stealthSt.backoff > 0 ? Math.round(stealthSt.backoff/1000) + 'ث' : 'طبيعي') + ' · كوكيز: ' + (stealthSt.cookies || 0) + '</div></div>';
  h += '</div>';

  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">تحكم</div><div class="rs-sec-c">' + (st.running ? 'يعمل' : 'متوقف') + '</div></div>';
  h += '<div class="rs-item" id="rs-pul-full" style="cursor:pointer"><div class="rs-item-h"><span class="rs-tag c">▶</span><div class="rs-item-t">تشغيل كامل</div></div></div>';
  h += '<div class="rs-item" id="rs-pul-paths" style="cursor:pointer"><div class="rs-item-h"><span class="rs-tag n">◈</span><div class="rs-item-t">مسارات فقط</div></div></div>';
  h += '<div class="rs-item" id="rs-pul-stop" style="cursor:pointer"><div class="rs-item-h"><span class="rs-tag f">■</span><div class="rs-item-t">إيقاف</div></div></div>';
  h += '</div>';

  var ph = (d.meta||[]).filter(function(m){ return m.kind === 'pulsar-path'; }).filter(function(m){ return matches(m, query); });
  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">مسارات مكتشفة</div><div class="rs-sec-c">' + ph.length + '</div></div>';
  if(ph.length){
    ph.slice(-60).reverse().forEach(function(p, i){
      var tag = p.status === 200 ? 'OPEN' : (p.status === 401 || p.status === 403 ? 'AUTH' : (p.status >= 500 ? 'ERR' : String(p.status)));
      var cls = p.status === 200 ? 'c' : (p.status === 401 || p.status === 403 ? 'h' : 'n');
      var detail = '<div style="color:var(--tx3);font-size:10px">' + (p.len || 0) + 'B</div>';
      h += itemHTML('pp' + i, tag, cls, p.url || '', p.path || '', detail);
    });
  } else h += emptyHTML('لا مسارات', '◈');
  h += '</div>';

  setTimeout(function(){
    function wire(id, fn){ var el = $('#rs-' + id); if(el) el.addEventListener('click', fn); }
    wire('pul-full', async function(){
      if(busy) return; busy = true;
      progress(true);
      var r = await pulsar.run();
      progress(false); busy = false;
      if(r.ok) toast(r.summary.totalHits + ' من ' + r.summary.totalTested);
      render();
    });
    wire('pul-paths', async function(){
      if(busy) return; busy = true;
      progress(true);
      await pulsar.run({ engines: ['paths'] });
      progress(false); busy = false;
      toast('انتهى'); render();
    });
    wire('pul-stop', function(){ pulsar.stop(); toast('إيقاف'); render(); });
  }, 50);

  return h;
}

// ══════════════════════════════════════════════════════════════
// REMOTE
// ══════════════════════════════════════════════════════════════
function renderRemote(d){
  var remote = core.remote;
  var h = '';
  if(!remote){ h += emptyHTML('وحدة الخادم غير محمّلة', '☁'); return h; }
  var st = remote.status();

  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">حالة الخادم</div><div class="rs-sec-c">' + (st.enabled ? 'متصل' : 'غير مُعدّ') + '</div></div>';
  h += '<div class="rs-stat" style="--c:' + (st.enabled ? 'var(--su)' : 'var(--wa)') + '"><div class="rs-stat-l">Companion</div><div class="rs-stat-v" style="font-size:14px;word-break:break-all;padding-right:10px">' + esc(st.baseUrl || 'لم يُضبط') + '</div></div>';
  if(st.token) h += '<div class="rs-item" style="cursor:default"><div class="rs-item-h"><span class="rs-tag g">OAST</span><div class="rs-item-t">token: ' + esc(String(st.token).slice(0, 12)) + '...</div></div></div>';
  h += '</div>';

  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">إعداد</div><div class="rs-sec-c"></div></div>';
  h += '<div class="rs-item" id="rs-remote-setbase" style="cursor:pointer"><div class="rs-item-h"><span class="rs-tag n">URL</span><div class="rs-item-t">تعيين رابط</div></div></div>';
  h += '<div class="rs-item" id="rs-remote-register" style="cursor:pointer"><div class="rs-item-h"><span class="rs-tag p">OAST</span><div class="rs-item-t">تسجيل OAST</div></div></div>';
  h += '<div class="rs-item" id="rs-remote-poll" style="cursor:pointer"><div class="rs-item-h"><span class="rs-tag i">POLL</span><div class="rs-item-t">استطلاع</div></div></div>';
  h += '<div class="rs-item" id="rs-remote-corstest" style="cursor:pointer"><div class="rs-item-h"><span class="rs-tag c">CORS</span><div class="rs-item-t">اختبار CORS</div></div></div>';
  h += '</div>';

  var hits = (d.meta||[]).filter(function(m){ return m.kind === 'oast-hit'; }).filter(function(m){ return matches(m, query); });
  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">تفاعلات OAST</div><div class="rs-sec-c">' + hits.length + '</div></div>';
  if(hits.length){
    hits.slice(-30).reverse().forEach(function(hh, i){
      var detail = '<div style="font-size:11px;color:var(--tx3)">IP: <code style="color:#38bdf8">' + esc(hh.ip || '') + '</code></div>';
      h += itemHTML('oast' + i, hh.method || 'GET', 'n', hh.path || '', new Date(hh.at).toLocaleTimeString(), detail);
    });
  } else h += emptyHTML('لا تفاعلات', '☁');
  h += '</div>';

  setTimeout(function(){
    var sb = $('#rs-remote-setbase');
    if(sb) sb.addEventListener('click', function(){
      var v = window.prompt('رابط الخادم:', remote.status().baseUrl || '');
      if(!v) return;
      remote.setBase(v.trim()); toast('تم'); render();
    });
    var rg = $('#rs-remote-register');
    if(rg) rg.addEventListener('click', async function(){
      toast('تسجيل...');
      var dr = await remote.oastRegister();
      if(dr.ok){ toast('تم'); remote.startPolling(); }
      else toast('فشل');
      render();
    });
    var pl = $('#rs-remote-poll');
    if(pl) pl.addEventListener('click', async function(){
      toast('استطلاع...');
      var dp = await remote.oastPoll();
      if(dp.ok) toast('تفاعلات: ' + (dp.total || 0));
      render();
    });
    var ct = $('#rs-remote-corstest');
    if(ct) ct.addEventListener('click', async function(){
      toast('CORS...');
      var dc = await remote.corsTest(location.href);
      if(dc.ok){ toast('أخطر: ' + (dc.worst.risk || 'NONE')); render(); }
      else toast('فشل');
    });
  }, 50);

  return h;
}

// ══════════════════════════════════════════════════════════════
// GHOST
// ══════════════════════════════════════════════════════════════
function renderGhost(d){
  var ghost = core.ghost;
  var h = '';
  if(!ghost){ h += emptyHTML('وحدة GHOST غير محمّلة', '◌'); return h; }
  var ts = ghost.timerStatus();

  h += '<div class="rs-stats">';
  h += statCard('Timeouts', ts.timeouts, '', 'var(--in)');
  h += statCard('Intervals', ts.intervals, '', 'var(--wa)');
  h += statCard('مخازن', 15, '', 'var(--pu)');
  h += statCard('آمن', 'نعم', '', 'var(--su)');
  h += '</div>';

  h += '<div class="rs-sec"><div class="rs-sec-h"><div class="rs-sec-t">تنظيف</div><div class="rs-sec-c"></div></div>';
  h += '<div class="rs-item" id="rs-g-audit" style="cursor:pointer"><div class="rs-item-h"><span class="rs-tag n">◉</span><div class="rs-item-t">جرد المخازن</div></div></div>';
  h += '<div class="rs-item" id="rs-g-trim24" style="cursor:pointer"><div class="rs-item-h"><span class="rs-tag h">⌫</span><div class="rs-item-t">حذف أقدم من 24 ساعة</div></div></div>';
  h += '<div class="rs-item" id="rs-g-scrub" style="cursor:pointer"><div class="rs-item-h"><span class="rs-tag i">⌦</span><div class="rs-item-t">مسح الأنماط</div></div></div>';
  h += '<div class="rs-item" id="rs-g-wipe" style="cursor:pointer"><div class="rs-item-h"><span class="rs-tag c">⌦</span><div class="rs-item-t">مسح كل المخازن</div></div></div>';
  h += '<div class="rs-item" id="rs-g-withdraw" style="cursor:pointer"><div class="rs-item-h"><span class="rs-tag c">✕</span><div class="rs-item-t">انسحاب كامل</div></div></div>';
  h += '</div>';

  setTimeout(function(){
    function wire(id, fn){ var el = $('#rs-' + id); if(el) el.addEventListener('click', fn); }
    wire('g-audit', async function(){
      var r = await ghost.audit();
      toast('المجموع: ' + r.total);
      render();
    });
    wire('g-trim24', async function(){
      if(!window.confirm('حذف أقدم من 24 ساعة؟')) return;
      var r = await ghost.trimOlderThan(24);
      toast('حُذف: ' + r.removed);
      render();
    });
    wire('g-scrub', async function(){
      toast('تنظيف...');
      var r = await ghost.scrub();
      toast('ls: ' + r.removed.localStorage + ' · cache: ' + r.removed.cacheAPI);
      render();
    });
    wire('g-wipe', async function(){
      if(!window.confirm('حذف كل النتائج؟')) return;
      if(!window.confirm('تأكيد.')) return;
      await ghost.wipeAll();
      toast('تم'); render();
    });
    wire('g-withdraw', async function(){
      if(!window.confirm('انسحاب كامل؟')) return;
      if(!window.confirm('متأكد؟')) return;
      toast('انسحاب...');
      await ghost.withdraw({ wipe: true });
    });
  }, 50);

  return h;
}

// ══════════════════════════════════════════════════════════════
// MAIN RENDER
// ══════════════════════════════════════════════════════════════
async function render(){
  var body = $('#body');
  if(!body) return;
  body.innerHTML = '<div class="rs-sk"></div><div class="rs-sk"></div><div class="rs-sk"></div>';
  var data;
  try { data = await loadAll(); }
  catch(e){ body.innerHTML = emptyHTML('خطأ: ' + e.message, '⚠'); return; }

  var chains = (data.meta||[]).filter(function(m){ return m.kind === 'chain-candidate'; });
  setBadge(chains.length);

  var h = '';
  if(active === 'chains') h = renderChains(data);
  else if(active === 'operator') h = renderOperator(data);
  else if(active === 'darwin') h = renderDarwin(data);
  else if(active === 'synapse') h = renderSynapse(data);
  else if(active === 'dash') h = renderDash(data);
  else if(active === 'recon') h = renderRecon(data);
  else if(active === 'vuln') h = renderVuln(data);
  else if(active === 'offensive') h = renderOffensive(data);
  else if(active === 'exploit') h = renderExploit(data);
  else if(active === 'net') h = renderNet(data);
  else if(active === 'argus') h = renderArgus(data);
  else if(active === 'pulsar') h = renderPulsar(data);
  else if(active === 'remote') h = renderRemote(data);
  else if(active === 'ghost') h = renderGhost(data);

  body.innerHTML = h || emptyHTML('لا بيانات', '○');

  body.querySelectorAll('.rs-item').forEach(function(el){
    if(el.id && /^rs-/.test(el.id)) return;
    if(el.hasAttribute('data-snap-id')) return;
    el.addEventListener('click', function(){
      var id = el.getAttribute('data-id');
      if(!id) return;
      if(expanded.has(id)) expanded.delete(id); else expanded.add(id);
      el.classList.toggle('exp');
    });
  });
}

var renderTimer = null;
function scheduleRender(){
  clearTimeout(renderTimer);
  renderTimer = setTimeout(function(){
    if(isPanelOpen()) render().catch(function(){});
  }, 250);
}

function buildTabs(){
  var tabs = $('#tabs');
  if(!tabs) return;
  tabs.innerHTML = '';
  TABS.forEach(function(t){
    var b = document.createElement('button');
    b.className = 'rs-tab' + (t.id === active ? ' on' : '');
    b.setAttribute('data-id', t.id);
    b.innerHTML = '<span class="rs-tab-i">' + t.i + '</span><span class="rs-tab-l">' + t.l + '</span>';
    tabs.appendChild(b);
  });
  var activeEl = tabs.querySelector('.rs-tab.on');
  if(activeEl && activeEl.scrollIntoView){
    try { activeEl.scrollIntoView({behavior:'smooth', block:'nearest', inline:'center'}); } catch (e) {}
  }
}

var tabsEl = $('#tabs');
if(tabsEl) tabsEl.addEventListener('click', function(e){
  var b = e.target.closest('.rs-tab');
  if(!b) return;
  active = b.getAttribute('data-id');
  buildTabs();
  render().catch(function(){});
});

var searchEl = $('#search');
if(searchEl) searchEl.addEventListener('input', function(e){
  query = e.target.value.trim();
  render().catch(function(){});
});

var fabEl = $('#fab');
if(fabEl) fabEl.addEventListener('click', function(){
  var p = $('#panel');
  if(p) p.classList.add('open');
  updateLockIcon();
  render().catch(function(){});
});

var closeEl = $('#close');
if(closeEl) closeEl.addEventListener('click', function(){
  var p = $('#panel');
  if(p) p.classList.remove('open');
});

var lockEl = $('#lock');
if(lockEl) lockEl.addEventListener('click', function(){
  if(!secure) return;
  if(secure.enabled()){
    if(window.confirm('قفل التشفير؟')){
      secure.lock(); toast('تم القفل'); updateLockIcon(); render();
    }
    return;
  }
  var pw = window.prompt('كلمة مرور التشفير:', '');
  if(!pw || pw.length < 6){ toast('قصيرة'); return; }
  secure.unlock(pw).then(function(){ toast('مفعّل'); updateLockIcon(); render(); }).catch(function(e){ toast('فشل'); });
});

var scanEl = $('#scan');
if(scanEl) scanEl.addEventListener('click', async function(){
  if(busy) return; busy = true; scanEl.disabled = true;
  progress(true); toast('فحص...');
  try {
    if(mods.scanner && typeof mods.scanner.scan === 'function') await mods.scanner.scan();
    if(mods.crawler && typeof mods.crawler.crawl === 'function') await mods.crawler.crawl({ maxDepth: 1, maxPages: 15, delayMs: 300 });
    if(mods.correlator && typeof mods.correlator.run === 'function') await mods.correlator.run();
    toast('اكتمل');
  } catch(e){ toast('خطأ'); }
  progress(false); busy = false; scanEl.disabled = false;
  await render();
});

var crawlEl = $('#crawl');
if(crawlEl) crawlEl.addEventListener('click', async function(){
  if(busy) return; busy = true; crawlEl.disabled = true;
  progress(true); toast('زحف...');
  try {
    if(mods.crawler && typeof mods.crawler.crawl === 'function') await mods.crawler.crawl({ maxDepth: 2, maxPages: 40, delayMs: 300 });
    if(mods.correlator && typeof mods.correlator.run === 'function') await mods.correlator.run();
    toast('اكتمل');
  } catch(e){ toast('خطأ'); }
  progress(false); busy = false; crawlEl.disabled = false;
  await render();
});

var chainEl = $('#chain');
if(chainEl) chainEl.addEventListener('click', async function(){
  if(busy) return; busy = true; chainEl.disabled = true;
  progress(true); toast('استغلال...');
  try {
    if(mods.chain && typeof mods.chain.runAll === 'function') await mods.chain.runAll({ minSeverity: 'HIGH' });
    if(mods.correlator && typeof mods.correlator.run === 'function') await mods.correlator.run();
    toast('اكتمل');
  } catch(e){ toast('خطأ'); }
  progress(false); busy = false; chainEl.disabled = false;
  await render();
});

var validateEl = $('#validate');
if(validateEl) validateEl.addEventListener('click', async function(){
  if(busy) return; busy = true; validateEl.disabled = true;
  progress(true); toast('تحقق...');
  try {
    if(mods.validators && mods.validators.validateAll){
      var vr = await mods.validators.validateAll({ includeLow: false });
      toast(vr.total + ' -- صالح ' + vr.valid);
    }
  } catch(e){ toast('خطأ'); }
  progress(false); busy = false; validateEl.disabled = false;
  await render();
});

var probeEl = $('#probe');
if(probeEl) probeEl.addEventListener('click', async function(){
  if(busy) return; busy = true; probeEl.disabled = true;
  progress(true); toast('مسارات...');
  try {
    if(mods.validators && mods.validators.probeAll){
      var pr = await mods.validators.probeAll({ max: 30 });
      toast(pr.total + ' -- مفتوح ' + pr.open);
    }
  } catch(e){ toast('خطأ'); }
  progress(false); busy = false; probeEl.disabled = false;
  await render();
});

var exportEl = $('#export');
if(exportEl) exportEl.addEventListener('click', async function(){
  try {
    var op = core.operator;
    if(op && typeof op.downloadReport === 'function'){
      var r = await op.downloadReport('json');
      toast('تصدير: ' + r.len);
      return;
    }
    var data = await loadAll();
    var blob = new Blob([JSON.stringify({ host: location.hostname, url: location.href, time: new Date().toISOString(), data: data }, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'reconstrike-' + location.hostname + '-' + Date.now() + '.json';
    a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
    toast('تم');
  } catch(e){ toast('خطأ'); }
});

eventBus.on('finding:new', scheduleRender);
eventBus.on('crawler:done', scheduleRender);
eventBus.on('crawler:page', scheduleRender);
eventBus.on('scanner:ready', scheduleRender);
eventBus.on('correlator:done', function(e){ scheduleRender(); if(e && e.count) toast('سلاسل: ' + e.count); });
eventBus.on('chain:success', scheduleRender);
eventBus.on('secure:unlocked', function(){ updateLockIcon(); });
eventBus.on('secure:locked', function(){ updateLockIcon(); });
eventBus.on('oast:interaction', scheduleRender);
eventBus.on('remote:ready', scheduleRender);
eventBus.on('argus:tick', scheduleRender);
eventBus.on('argus:hit', scheduleRender);
eventBus.on('argus:done', scheduleRender);
eventBus.on('pulsar:hit', scheduleRender);
eventBus.on('pulsar:engine-done', scheduleRender);
eventBus.on('pulsar:done', scheduleRender);
eventBus.on('pulsar:progress', scheduleRender);
eventBus.on('ghost:withdraw', scheduleRender);
eventBus.on('validators:done', scheduleRender);
eventBus.on('secret:validated', scheduleRender);
eventBus.on('probe:done', scheduleRender);
eventBus.on('operator:snapshot', scheduleRender);
eventBus.on('operator:diff', scheduleRender);
eventBus.on('synapse:phase', scheduleRender);
eventBus.on('synapse:progress', scheduleRender);
eventBus.on('synapse:hit', scheduleRender);
eventBus.on('synapse:done', scheduleRender);
eventBus.on('darwin:phase', scheduleRender);
eventBus.on('darwin:generation', scheduleRender);
eventBus.on('darwin:progress', scheduleRender);
eventBus.on('darwin:island', scheduleRender);
eventBus.on('darwin:migration', scheduleRender);
eventBus.on('darwin:done', scheduleRender);

buildTabs();
updateLockIcon();
render().catch(function(){});
setTimeout(function(){ toast('ReconStrike V16 جاهز'); }, 500);

setInterval(function(){
  if(isPanelOpen() && !busy) render().catch(function(){});
}, 12000);

})();