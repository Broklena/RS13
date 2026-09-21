// language: JavaScript, file: 12_pulsar.js, target: modern browsers
// ReconStrike V17 -- PULSAR fuzzing engine (orchestrator-integrated)

(function () {
  'use strict';
  if (!window.ReconCore) return;
  var core = window.ReconCore;
  var eventBus = core.eventBus;
  var storage = core.storage;
  var scope = core.scope;
  var mods = core.modules = core.modules || {};

  // ══════════════════════════════════════════════════════════════
  // STEALTH -- UA rotation + header profiles (pacing central)
  // ══════════════════════════════════════════════════════════════
  var Stealth = (function () {
    var UA_POOL = [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Edg/123.0.0.0'
    ];

    var LANGS = [
      'en-US,en;q=0.9',
      'en-GB,en;q=0.9',
      'en-US,en;q=0.8,es;q=0.6',
      'en-US,en;q=0.9,fr;q=0.8'
    ];

    function pickUA() { return UA_POOL[Math.floor(Math.random() * UA_POOL.length)]; }
    function pickLang() { return LANGS[Math.floor(Math.random() * LANGS.length)]; }

    function buildHeaders(profile, extra) {
      var h = Object.assign({}, extra || {});
      var ua = pickUA();
      h['User-Agent'] = ua;
      h['Accept-Language'] = pickLang();

      if (/Chrome/.test(ua) && /Edg/.test(ua)) {
        h['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';
        h['Sec-Ch-Ua'] = '"Microsoft Edge";v="123", "Chromium";v="123", "Not-A.Brand";v="99"';
        h['Sec-Ch-Ua-Mobile'] = '?0';
        h['Sec-Ch-Ua-Platform'] = '"Windows"';
      } else if (/Chrome/.test(ua)) {
        h['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';
        h['Sec-Ch-Ua'] = '"Chromium";v="124", "Not-A.Brand";v="99"';
        h['Sec-Ch-Ua-Mobile'] = '?0';
        if (/Macintosh/.test(ua)) h['Sec-Ch-Ua-Platform'] = '"macOS"';
        else if (/Windows/.test(ua)) h['Sec-Ch-Ua-Platform'] = '"Windows"';
        else h['Sec-Ch-Ua-Platform'] = '"Linux"';
      } else if (/Firefox/.test(ua)) {
        h['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';
      } else {
        h['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
      }

      if (profile === 'navigation') {
        h['Sec-Fetch-Dest'] = 'document';
        h['Sec-Fetch-Mode'] = 'navigate';
        h['Sec-Fetch-Site'] = 'same-origin';
        h['Sec-Fetch-User'] = '?1';
        h['Upgrade-Insecure-Requests'] = '1';
        h['Referer'] = location.origin + '/';
      } else if (profile === 'api') {
        h['Sec-Fetch-Dest'] = 'empty';
        h['Sec-Fetch-Mode'] = 'cors';
        h['Sec-Fetch-Site'] = 'same-origin';
        h['X-Requested-With'] = 'XMLHttpRequest';
        h['Referer'] = location.href;
      }

      return h;
    }

    function variants(path) {
      var v = [path];
      v.push(path + '/');
      v.push(path + '..;/');
      v.push('/' + path);
      v.push('//' + path);
      v.push('/./' + path);
      v.push(path.replace(/\//g, '/%2e/'));
      v.push(path.replace(/\./g, '%2e'));
      v.push(path.toUpperCase());
      var seen = {};
      return v.filter(function (x) {
        if (seen[x]) return false;
        seen[x] = true;
        return true;
      });
    }

    return {
      buildHeaders: buildHeaders,
      variants: variants,
      status: function () { return { ua: UA_POOL.length, langs: LANGS.length }; }
    };
  })();

  // ══════════════════════════════════════════════════════════════
  // WORDLISTS -- paths
  // ══════════════════════════════════════════════════════════════
  var PATHS = [].concat(
    ['admin','admin/','admin/login','admin/dashboard','admin/users','admin/settings','administrator','manage','manager','management','console','control','panel','cpanel','webadmin','sysadmin','root','superuser','god','operator','backend'],
    ['login','login/','signin','signup','register','logout','signout','auth','authenticate','authorize','session','sessions','token','tokens','oauth','oauth2','oidc','sso','saml','2fa','mfa','otp','reset','reset-password','forgot','forgot-password','password','change-password','verify','confirmation','activate','unlock'],
    ['api','api/','api/v1','api/v2','api/v3','api/v4','api/admin','api/users','api/user','api/me','api/profile','api/account','api/accounts','api/config','api/settings','api/debug','api/status','api/health','api/version','api/info','api/token','api/tokens','api/auth','api/login','api/register','api/search','api/upload','api/files','api/export','api/import','api/data','api/products','api/orders','api/cart','api/checkout','api/payment','api/webhook','api/callback','api/notify'],
    ['v1','v2','v3','rest','graphql','gql','graphiql','graphql/console','api/graphql','api/gql','query','mutation','subscription'],
    ['actuator','actuator/','actuator/health','actuator/info','actuator/env','actuator/beans','actuator/mappings','actuator/configprops','actuator/metrics','actuator/threaddump','actuator/heapdump','actuator/loggers','actuator/auditevents','actuator/httptrace','actuator/scheduledtasks','actuator/caches','actuator/conditions','actuator/shutdown'],
    ['server-status','server-info','nginx-status','php-fpm-status','status','info','_status','_info','_health'],
    ['_ignition/health-check','_ignition/execute-solution','_ignition/scripts','_ignition/styles','_ignition/parameters','_ignition/commands'],
    ['_next/static','_next/data','__nextjs_original-stack-frame','_nuxt','__nuxt','.next','.nuxt'],
    ['telescope','telescope/requests','telescope/exceptions','telescope/logs','horizon','nova','nova-api','filament','livewire','ignition'],
    ['wp-admin','wp-login.php','wp-config.php','wp-config.php.bak','wp-content','wp-content/uploads','wp-includes','wp-json','wp-json/wp/v2','wp-json/wp/v2/users','xmlrpc.php','wp-cron.php','wp-signup.php','wp-trackback.php','readme.html'],
    ['drupal','user/login','user/register','admin/config','sites/default/files','sites/default/settings.php','CHANGELOG.txt','core/CHANGELOG.txt','update.php','install.php'],
    ['administrator','components/com_users','modules/mod_login','configuration.php','configuration.php.bak','htaccess.txt','web.config.txt','joomla.xml'],
    ['cgi-bin','cgi-bin/test.cgi','cgi-bin/printenv','cgi-bin/status','cgi-bin/admin.cgi'],
    ['.env','.env.local','.env.production','.env.development','.env.staging','.env.test','.env.backup','.env.old','.env.bak','.env.example','.env.sample','.env.dist','.env.dev','.env.prod','.env.live','.env.save','.env.swp','.env.copy','.env.orig','env','.environment'],
    ['config','config/','config.php','config.php.bak','config.php.old','config.php.save','config.php~','config.php.swp','config.js','config.json','config.yml','config.yaml','config.xml','config.toml','config.ini','config.bak','config.old','config.backup','config.save','config.orig','config.template','config.sample','configuration','configuration.yml','configuration.json'],
    ['settings','settings.json','settings.php','settings.py','settings.xml','settings.yml','settings.yaml','settings.ini','settings.bak','settings.old','preferences','preferences.json'],
    ['app.config','app.config.json','app.settings','appsettings.json','appsettings.Development.json','appsettings.Production.json','appsettings.Staging.json','web.config','web.config.bak','web.config.old','.htaccess','.htaccess.bak','.htpasswd','.htpasswd.bak'],
    ['.git','.git/','.git/HEAD','.git/config','.git/index','.git/logs','.git/logs/HEAD','.git/refs','.git/refs/heads','.git/refs/heads/master','.git/refs/heads/main','.git/objects','.git/description','.git/info','.git/info/exclude','.gitignore','.gitattributes','.gitmodules','.gitlab-ci.yml','.github','.github/workflows','.github/workflows/ci.yml'],
    ['.svn','.svn/','.svn/entries','.svn/wc.db','.svn/pristine','.hg','.hg/','.hg/hgrc','.bzr','.bzr/'],
    ['backup','backup/','backups','backups/','backup.zip','backup.tar','backup.tar.gz','backup.tgz','backup.rar','backup.7z','backup.sql','backup.sql.gz','backup.db','site.zip','site.tar.gz','www.zip','www.tar.gz','web.zip','web.tar.gz','public.zip','public_html.zip','html.zip','public_html.tar.gz'],
    ['backup-2024.zip','backup-2025.zip','backup-2026.zip','backup-01.zip','backup-old.zip','backup-new.zip','backup.bak','site.bak','app.bak','data.bak','db.bak','old.zip','old.tar.gz','archive.zip','archive.tar.gz'],
    ['dump','dump.sql','dump.sql.gz','db.sql','db.sql.gz','database.sql','database.sql.gz','database.sql.bak','database.bak','mysql.sql','backup_database.sql','db_dump.sql','data.sql'],
    ['error.log','errors.log','error_log','errorlog','php_errors.log','php_error.log','debug.log','debug.log.bak','app.log','application.log','access.log','access_log','access-log','server.log','system.log','auth.log','security.log','audit.log','trace.log','logs','logs/','log','log/','logs/error.log','logs/access.log','log/error.log','log/debug.log','var/log','storage/logs','storage/logs/laravel.log','app/storage/logs','tmp/error.log'],
    ['phpmyadmin','phpMyAdmin','phpmyadmin/','pma','PMA','pma/','mysql','mysql/','adminer','adminer.php','adminer/','myadmin','dbadmin','db-admin','sqladmin','db','sql','database','databases','mongo-express','mongo','redis','redis-cli','elastic','elasticsearch','kibana','kibana/','kibana/app','grafana','grafana/','grafana/login','prometheus','prometheus/','prometheus/targets','influxdb','clickhouse'],
    ['jenkins','jenkins/','jenkins/login','hudson','hudson/','ci','ci/','build','builds','gitlab','gitlab/','gitlab/users/sign_in','gitlab-ci','gerrit','gitea','gitea/','gogs','bitbucket','bitbucket/'],
    ['kubernetes','k8s','kube','kube-system','kubelet','etcd','consul','consul/ui','nomad','vault','vault/','vault/ui','docker','docker/','docker-compose.yml','docker-compose.yaml','Dockerfile','.dockerignore','.dockerenv','container','containers','rancher','rancher/','portainer','portainer/','swarm'],
    ['latest/meta-data','latest/meta-data/iam/security-credentials','latest/meta-data/iam/security-credentials/','latest/user-data','latest/meta-data/instance-id','metadata/v1','metadata/v1/instance','metadata/v1/user-data','computeMetadata/v1','computeMetadata/v1/instance','computeMetadata/v1/project','metadata/instance','metadata/identity'],
    ['swagger','swagger/','swagger.json','swagger.yaml','swagger.yml','swagger-ui','swagger-ui.html','swagger-ui/','swagger-ui/index.html','swagger-resources','v2/api-docs','v3/api-docs','v3/api-docs/swagger-config','api-docs','api-docs/','openapi.json','openapi.yaml','openapi.yml','openapi','redoc','redoc.html','docs','docs/','documentation','documentation/','api/docs','api/documentation','developer','developers','dev-docs'],
    ['health','healthz','healthcheck','health-check','health/status','_health','_status','status','status/','status.json','server-health','app-health','livez','readyz','live','ready','ping','pong','version','version/','versions','build','build-info','build-info.json'],
    ['metrics','metric','stats','statistics','analytics','telemetry','prometheus/metrics','metrics/prometheus','internal/metrics'],
    ['robots.txt','sitemap.xml','sitemap.xml.gz','sitemap_index.xml','sitemap/','humans.txt','security.txt','.well-known/security.txt','.well-known/change-password','.well-known/openid-configuration','.well-known/oauth-authorization-server','.well-known/jwks.json','crossdomain.xml','clientaccesspolicy.xml','favicon.ico','favicon.png','manifest.json','manifest.webmanifest','service-worker.js','sw.js','browserconfig.xml'],
    ['readme','README','README.md','README.txt','README.rst','readme.html','readme.php','CHANGELOG','CHANGELOG.md','CHANGELOG.txt','CHANGES','CHANGES.md','HISTORY.md','LICENSE','LICENSE.md','LICENSE.txt','COPYING','AUTHORS','CONTRIBUTORS','VERSION','VERSION.txt','TODO','TODO.md','NOTES.md','notes.txt'],
    ['package.json','package-lock.json','yarn.lock','pnpm-lock.yaml','composer.json','composer.lock','Gemfile','Gemfile.lock','requirements.txt','Pipfile','Pipfile.lock','pyproject.toml','setup.py','poetry.lock','go.mod','go.sum','Cargo.toml','Cargo.lock','mix.exs','build.gradle','pom.xml','.npmrc','.yarnrc','.bowerrc','.nvmrc'],
    ['upload','uploads','uploads/','file','files','files/','download','downloads','downloads/','static','static/','assets','assets/','public','public/','private','private/','internal','internal/','secret','secrets','hidden','tmp','temp','cache','cached','data','db','database','content','media','images','img','video','videos','audio','docs','documents','papers','archive','archives','old','new','backup-old','backup-new','staging','production','prod','dev','development','test','tests','testing','qa','uat','stage'],
    ['img','images','image','assets/img','assets/images','static/img','static/images','media','media/images','uploads/images','content/images','photos','pictures','pics'],
    ['css','js','scripts','styles','fonts','icons','favicons'],
    ['users','users/','user','user/','profiles','profile','members','member','accounts','account','customers','customer','clients','client','employees','staff','team','teams','organizations','orgs','org','companies','company','tenants','tenant'],
    ['orders','order','invoices','invoice','payments','payment','transactions','transaction','receipts','receipt','billing','subscriptions','subscription','plans','pricing','prices','products','product','items','item','catalog','categories','category','tags','tag'],
    ['messages','message','chats','chat','notifications','notification','alerts','alert','emails','email','mails','mail','tickets','ticket','support','help','faq','contact','contacts'],
    ['search','find','lookup','filter','query','browse','explore','discover','list','all','index','home','start','main','default'],
    ['rails/info','rails/info/properties','rails/info/routes','rails/mailers','rails/conductor','sidekiq','resque','delayed_job','active_admin','administrate','blazer','pghero'],
    ['flask','django','django-admin','django-admin/','admin/django','__debug__','__debug__/','__debug__/render_panel','_debug_toolbar','_debug_toolbar/','django-admin/login'],
    ['strapi','strapi/admin','strapi/admin/auth/login','strapi/api','strapi/uploads','ghost','ghost/api','ghost/api/v3','ghost/api/v4','ghost/api/v5','keystone','keystone/admin','payload','payload/admin','payload/api','sanity','sanity/studio','contentful'],
    ['next','next/','_next','_next/webpack-hmr','nextjs','nuxt','nuxt/','_nuxt','vuepress','gatsby','gatsby/','remix','remix/','svelte','sveltekit','astro'],
    ['debug','debug/','debug.php','debug.html','debug.json','test.php','test.html','test.json','info.php','phpinfo.php','phpinfo','php-info','php_info','php_info.php','server.php','sysinfo.php','sys-info.php','system-info','env.php','environment.php','check.php','checker.php','status.php','admin.php','administrator.php','setup.php','install.php','installer.php','install/','setup/'],
    ['jolokia','jolokia/','jolokia/read','jolokia/list','jolokia/version','jolokia/search','jolokia/exec','jolokia/write','heapdump','threaddump','auditevents','httptrace','caches','conditions','shutdown','loggers','mappings','configprops','beans','health'],
    ['slack','slack/','discord','discord/','teams','zoom','meet','jitsi','mattermost','rocket.chat','element'],
    ['null','undefined','none','void','nan','true','false','0','1','-1','../','../../','../../../']
  );

  var PATHS_UNIQUE = (function () {
    var seen = {};
    var out = [];
    for (var i = 0; i < PATHS.length; i++) {
      if (seen[PATHS[i]]) continue;
      seen[PATHS[i]] = true;
      out.push(PATHS[i]);
    }
    return out;
  })();

  // ══════════════════════════════════════════════════════════════
  // WORDLISTS -- params
  // ══════════════════════════════════════════════════════════════
  var PARAMS = [].concat(
    ['id','user','user_id','userId','uid','uuid','guid','account','account_id','accountId','profile','profile_id','username','email','user_email','login','name','fullname','nickname','handle'],
    ['admin','is_admin','isAdmin','administrator','role','roles','user_role','level','user_level','access','access_level','permission','permissions','privilege','privileges','superuser','moderator','staff','employee','owner','manager','group','groups','team','team_id','org','org_id','organization','organization_id','tenant','tenant_id','company','company_id'],
    ['debug','debug_mode','test','testing','dev','developer','development','mode','env','environment','verbose','trace','tracing','log','logging','profile_mode','benchmark','timing','_debug','__debug__','XDEBUG_SESSION_START','XDEBUG_SESSION','XDEBUG_PROFILE','PHPSTORM','_profiler','profiler'],
    ['cmd','exec','execute','command','run','shell','system','process','proc','call','invoke','eval','evaluate','script','code','source','src','script_path','path','file','filename','filepath','file_path','load','include','require','import','template','view','page','module','component','controller','action','method','func','function','handler','callback','procedure','routine','op','operation','action_name','cmdline'],
    ['dir','folder','directory','subdir','subfolder','base','base_path','root','root_dir','home','home_dir','document_root','doc_root','webroot','www_root','backup','backup_file','log_file','logfile','config_file','conf','configuration','cfg','setting','settings','param','params','arg','args','argument','arguments','option','options','flag','flags'],
    ['url','uri','link','redirect','redirect_uri','redirect_url','return','return_url','return_to','returnto','next','next_url','goto','go','dest','destination','target','target_url','to','from','forward','forward_url','continue','continue_url','callback','callback_url','callbackUrl','redir','out','out_url','ref','referer','referrer','domain','host','hostname','origin','site','portal','proxy','proxy_url','fetch','fetch_url','load_url','src_url','href','page_url','image_url','img_url','avatar_url','avatar'],
    ['query','q','s','search','keyword','keywords','term','terms','filter','filters','sort','order','orderby','order_by','sort_by','groupby','group_by','limit','offset','skip','take','count','total','page','per_page','pagesize','page_size','size','start','end','min','max','between','where','having','select','union','join','table','db','database','schema','collection','field','fields','column','columns','row','rows','record','records','item','items','data','result','results','output','format','type','kind','content_type','mime','ext','extension','encoding','charset','lang','language','locale','country','region','timezone','tz','currency','unit','units','version','v','api_version','client','client_id','client_secret','app','app_id','key','api_key','apikey','api-key','secret','token','access_token','auth','auth_token','authToken','password','passwd','pwd','pass','credentials','signature','sig','hash','checksum','nonce','timestamp','ts','t','date','dt','time','at','from_date','to_date','start_date','end_date','start_time','end_time'],
    ['_method','_token','_csrf','csrf','csrf_token','csrfmiddlewaretoken','xsrf','xsrf_token','authenticity_token','__RequestVerificationToken','_wpnonce','nonce','form_id','formId','submit','submit_button','action_url','ajax','xhr','json','xml','raw','format_json','format_xml','_pjax','turbo','turbolinks','_escape','_encode','_decode'],
    ['__proto__','constructor','prototype','toString','valueOf','hasOwnProperty','isPrototypeOf','propertyIsEnumerable','toLocaleString','concat','slice','map','filter','reduce','forEach','indexOf','length'],
    ['pwsh','powershell','wmic','powershell_encoded','b64','base64','document','doc','resource','resources','includes','templates','theme','layout','views','partial','snippet','modules','plugin','plugins','extensions','components','widget','widgets','block','blocks','element','elements']
  );

  var PARAMS_UNIQUE = (function () {
    var seen = {};
    var out = [];
    for (var i = 0; i < PARAMS.length; i++) {
      if (seen[PARAMS[i]]) continue;
      seen[PARAMS[i]] = true;
      out.push(PARAMS[i]);
    }
    return out;
  })();

  // ══════════════════════════════════════════════════════════════
  // HEADERS + METHODS
  // ══════════════════════════════════════════════════════════════
  var HEADERS = [
    'X-Forwarded-For','X-Forwarded-Host','X-Forwarded-Proto','X-Real-IP','X-Client-IP',
    'X-Originating-IP','X-Remote-IP','X-Remote-Addr','X-Host','X-Forwarded-Server',
    'X-Original-URL','X-Rewrite-URL','X-Override-URL','X-Original-Method',
    'X-HTTP-Method-Override','X-HTTP-Method','X-Method-Override',
    'X-Custom-IP-Authorization','X-Proxy-User','X-User-ID','X-User-Role',
    'X-Admin','X-Admin-User','X-Auth-User','X-Authenticated-User',
    'X-Original-Host','X-Backend-Server','X-Forwarded-Prefix','X-Forwarded-Port'
  ];

  var METHODS = [
    'POST','PUT','DELETE','PATCH','HEAD','OPTIONS','TRACE','CONNECT',
    'PROPFIND','PROPPATCH','MKCOL','COPY','MOVE','LOCK','UNLOCK','REPORT',
    'MKACTIVITY','CHECKOUT','MERGE','M-SEARCH','NOTIFY','SUBSCRIBE',
    'UNSUBSCRIBE','PURGE','LINK','UNLINK','VIEW'
  ];

  // ══════════════════════════════════════════════════════════════
  // REQUEST WRAPPER -- uses orchestrator's rate-limited fetch
  // ══════════════════════════════════════════════════════════════
  var baseline = null;

  async function computeBaseline() {
    if (baseline) return baseline;
    var rand = '/__rs13_' + Math.random().toString(36).slice(2, 12) + '__';
    try {
      var r = await tryFetch(rand, { method: 'GET', profile: 'navigation' });
      var t = await r.text();
      baseline = { status: r.status, len: t.length, ct: (r.headers && r.headers.get && r.headers.get('content-type')) || '' };
    } catch (e) {
      baseline = { status: 0, len: 0, ct: '' };
    }
    return baseline;
  }

  function isInteresting(res, base) {
    if (!base) return res.status !== 0;
    if (res.status === 0) return false;
    if (res.status !== base.status) return true;
    if (Math.abs(res.len - base.len) > Math.max(100, base.len * 0.2)) return true;
    return false;
  }

  async function tryFetch(url, opts) {
    opts = opts || {};
    var profile = opts.profile || 'api';
    var headers = Stealth.buildHeaders(profile, opts.headers || {});

    var init = {
      method: opts.method || 'GET',
      credentials: 'include',
      redirect: 'manual',
      headers: headers
    };
    if (opts.body) init.body = opts.body;

    try {
      if (window.RS_ORCH && typeof window.RS_ORCH.rfetch === 'function') {
        return await window.RS_ORCH.rfetch(url, init);
      }
      return await fetch(url, init);
    } catch (e) {
      return {
        ok: false,
        status: 0,
        headers: {
          get: function () { return null; },
          forEach: function () {}
        },
        text: async function () { return ''; },
        _err: e.message
      };
    }
  }

  // ══════════════════════════════════════════════════════════════
  // PATH FUZZER
  // ══════════════════════════════════════════════════════════════
  async function fuzzPaths(opts) {
    opts = opts || {};
    var base = await computeBaseline();
    var origin = location.origin;
    var hits = [];
    var tested = 0;
    var limit = Math.min(opts.limit || PATHS_UNIQUE.length, PATHS_UNIQUE.length);

    for (var i = 0; i < limit; i++) {
      if (!running) break;
      tested++;
      var path = PATHS_UNIQUE[i];
      var useVariants = opts.variants && Math.random() < 0.3;
      var targetPath = useVariants
        ? Stealth.variants(path)[Math.floor(Math.random() * 4)]
        : path;
      var url = origin + '/' + targetPath;
      var t0 = Date.now();
      var r = await tryFetch(url, { method: 'GET', profile: 'navigation' });
      var text = '';
      try { text = await r.text(); } catch (e) {}
      var res = {
        url: url,
        path: targetPath,
        status: r.status,
        len: text.length,
        ms: Date.now() - t0,
        ct: (r.headers && r.headers.get) ? (r.headers.get('content-type') || '') : ''
      };
      if (isInteresting(res, base)) {
        res.interesting = true;
        hits.push(res);
        try {
          await storage.put('meta', {
            kind: 'pulsar-path',
            url: url,
            path: targetPath,
            status: r.status,
            len: text.length,
            ct: res.ct,
            baseline: base
          }, 'path::' + storage.hashKey(url));
        } catch (e) {}
        eventBus.emit('pulsar:hit', { type: 'path', res: res });
      }
      if (tested % 25 === 0) {
        eventBus.emit('pulsar:progress', {
          engine: 'paths',
          tested: tested,
          total: limit,
          hits: hits.length
        });
      }
    }

    eventBus.emit('pulsar:engine-done', { engine: 'paths', tested: tested, hits: hits.length });
    return { engine: 'paths', tested: tested, hits: hits };
  }

  // ══════════════════════════════════════════════════════════════
  // PARAM FUZZER
  // ══════════════════════════════════════════════════════════════
  async function fuzzParams(opts) {
    opts = opts || {};
    var targets = opts.targets || [];
    var maxTargets = opts.maxTargets || 10;

    if (!targets.length) {
      var eps = await storage.getAll('endpoints');
      var seen = {};
      for (var i = 0; i < eps.length && targets.length < maxTargets; i++) {
        var u = eps[i].url;
        if (!u || seen[u]) continue;
        seen[u] = true;
        try {
          var full = new URL(u, location.href).href;
          if (scope.inScope(full)) targets.push(full);
        } catch (e) {}
      }
    }

    var hits = [];
    var tested = 0;
    var limit = Math.min(opts.paramLimit || PARAMS_UNIQUE.length, PARAMS_UNIQUE.length);

    for (var t = 0; t < targets.length; t++) {
      if (!running) break;
      var target = targets[t];

      var baselineRes = null;
      try {
        var br = await tryFetch(target, { method: 'GET', profile: 'navigation' });
        var bt = await br.text();
        baselineRes = { status: br.status, len: bt.length };
      } catch (e) {}

      for (var p = 0; p < limit; p++) {
        if (!running) break;
        tested++;
        try {
          var u2 = new URL(target);
          u2.searchParams.set(PARAMS_UNIQUE[p], 'rs13_' + Math.random().toString(36).slice(2, 6));
          var r2 = await tryFetch(u2.href, { method: 'GET', profile: 'api' });
          var text2 = '';
          try { text2 = await r2.text(); } catch (e) {}
          var res2 = {
            url: u2.href,
            param: PARAMS_UNIQUE[p],
            target: target,
            status: r2.status,
            len: text2.length
          };
          if (baselineRes && (res2.status !== baselineRes.status || Math.abs(res2.len - baselineRes.len) > 200)) {
            res2.interesting = true;
            hits.push(res2);
            try {
              await storage.put('meta', {
                kind: 'pulsar-param',
                url: res2.url,
                param: PARAMS_UNIQUE[p],
                target: target,
                status: r2.status,
                len: text2.length,
                baseline: baselineRes
              }, 'param::' + storage.hashKey(u2.href));
            } catch (e) {}
            eventBus.emit('pulsar:hit', { type: 'param', res: res2 });
          }
        } catch (e) {}
        if (tested % 40 === 0) {
          eventBus.emit('pulsar:progress', {
            engine: 'params',
            tested: tested,
            total: targets.length * limit,
            hits: hits.length
          });
        }
      }
    }

    eventBus.emit('pulsar:engine-done', { engine: 'params', tested: tested, hits: hits.length });
    return { engine: 'params', tested: tested, hits: hits };
  }

  // ══════════════════════════════════════════════════════════════
  // METHOD FUZZER
  // ══════════════════════════════════════════════════════════════
  async function fuzzMethods(opts) {
    opts = opts || {};
    var targets = opts.targets || [];
    var maxTargets = opts.maxTargets || 20;

    if (!targets.length) {
      var eps = await storage.getAll('endpoints');
      var seen = {};
      for (var i = 0; i < eps.length && targets.length < maxTargets; i++) {
        var u = eps[i].url;
        if (!u || seen[u]) continue;
        seen[u] = true;
        try {
          var full = new URL(u, location.href).href;
          if (scope.inScope(full)) targets.push(full);
        } catch (e) {}
      }
    }

    var hits = [];
    var tested = 0;
    var limit = Math.min(opts.methodLimit || METHODS.length, METHODS.length);

    for (var t = 0; t < targets.length; t++) {
      if (!running) break;
      var target = targets[t];

      for (var m = 0; m < limit; m++) {
        if (!running) break;
        tested++;
        var method = METHODS[m];
        try {
          var init = { method: method, profile: 'api' };
          if (/^(POST|PUT|PATCH|PROPFIND|PROPPATCH|REPORT|LOCK|MKCOL|MERGE)$/.test(method)) {
            init.body = '{}';
          }
          var r = await tryFetch(target, init);
          var text = '';
          try { text = await r.text(); } catch (e) {}
          var allow = (r.headers && r.headers.get) ? (r.headers.get('allow') || '') : '';
          var res = {
            url: target,
            method: method,
            status: r.status,
            len: text.length,
            allow: allow
          };

          if (r.status >= 200 && r.status < 300) {
            res.interesting = true;
            hits.push(res);
          } else if (allow && /POST|PUT|DELETE|PATCH|PROPFIND/i.test(allow)) {
            res.interesting = true;
            res.note = 'Allow: ' + allow;
            hits.push(res);
          } else if (method === 'TRACE' && r.status === 200 && /TRACE/i.test(text)) {
            res.interesting = true;
            res.note = 'TRACE reflected';
            hits.push(res);
          }

          if (res.interesting) {
            try {
              await storage.put('meta', {
                kind: 'pulsar-method',
                url: target,
                method: method,
                status: r.status,
                len: text.length,
                note: res.note || null,
                allow: allow || null
              }, 'method::' + storage.hashKey(target + '::' + method));
            } catch (e) {}
            eventBus.emit('pulsar:hit', { type: 'method', res: res });
          }
        } catch (e) {}
      }
    }

    eventBus.emit('pulsar:engine-done', { engine: 'methods', tested: tested, hits: hits.length });
    return { engine: 'methods', tested: tested, hits: hits };
  }

  // ══════════════════════════════════════════════════════════════
  // HEADER FUZZER
  // ══════════════════════════════════════════════════════════════
  async function fuzzHeaders(opts) {
    opts = opts || {};
    var targets = opts.targets || [];
    var maxTargets = opts.maxTargets || 12;

    if (!targets.length) {
      var eps = await storage.getAll('endpoints');
      var seen = {};
      for (var i = 0; i < eps.length && targets.length < maxTargets; i++) {
        var u = eps[i].url;
        if (!u || seen[u]) continue;
        seen[u] = true;
        try {
          var full = new URL(u, location.href).href;
          if (scope.inScope(full)) targets.push(full);
        } catch (e) {}
      }
    }

    var hits = [];
    var tested = 0;
    var values = [
      '127.0.0.1', 'localhost', 'admin', 'internal',
      'http://127.0.0.1', 'https://127.0.0.1',
      '0.0.0.0', '::1', 'http://localhost',
      'https://localhost', 'file:///etc/passwd'
    ];

    for (var t = 0; t < targets.length; t++) {
      if (!running) break;
      var target = targets[t];

      var base = null;
      try {
        var br = await tryFetch(target, { method: 'GET', profile: 'navigation' });
        var bt = await br.text();
        base = { status: br.status, len: bt.length };
      } catch (e) {}

      for (var h = 0; h < HEADERS.length; h++) {
        if (!running) break;
        for (var v = 0; v < values.length; v++) {
          if (!running) break;
          tested++;
          var hdrs = {};
          hdrs[HEADERS[h]] = values[v];
          try {
            var r = await tryFetch(target, { method: 'GET', headers: hdrs, profile: 'api' });
            var text = '';
            try { text = await r.text(); } catch (e) {}
            var res = {
              url: target,
              header: HEADERS[h],
              value: values[v],
              status: r.status,
              len: text.length
            };
            if (base && (res.status !== base.status || Math.abs(res.len - base.len) > 300)) {
              res.interesting = true;
              hits.push(res);
              try {
                await storage.put('meta', {
                  kind: 'pulsar-header',
                  url: target,
                  header: HEADERS[h],
                  value: values[v],
                  status: r.status,
                  len: text.length,
                  baseline: base
                }, 'hdr::' + storage.hashKey(target + '::' + HEADERS[h] + '::' + values[v]));
              } catch (e) {}
              eventBus.emit('pulsar:hit', { type: 'header', res: res });
            }
          } catch (e) {}
        }
      }
    }

    eventBus.emit('pulsar:engine-done', { engine: 'headers', tested: tested, hits: hits.length });
    return { engine: 'headers', tested: tested, hits: hits };
  }

  // ══════════════════════════════════════════════════════════════
  // ORCHESTRATOR
  // ══════════════════════════════════════════════════════════════
  var running = false;

  async function runAll(opts) {
    opts = opts || {};
    if (running) return { ok: false, reason: 'already running' };
    running = true;

    var engines = opts.engines || ['paths', 'params', 'methods', 'headers'];
    var results = [];

    try {
      for (var i = 0; i < engines.length; i++) {
        if (!running) break;
        var e = engines[i];
        if (e === 'paths') results.push(await fuzzPaths(opts));
        else if (e === 'params') results.push(await fuzzParams(opts));
        else if (e === 'methods') results.push(await fuzzMethods(opts));
        else if (e === 'headers') results.push(await fuzzHeaders(opts));
      }
    } catch (e) {
      // continue with what we have
    } finally {
      running = false;
    }

    var summary = {
      totalTested: results.reduce(function (a, b) { return a + (b.tested || 0); }, 0),
      totalHits: results.reduce(function (a, b) { return a + (b.hits ? b.hits.length : 0); }, 0),
      engines: results.map(function (r) {
        return { engine: r.engine, tested: r.tested, hits: r.hits.length };
      }),
      stealth: Stealth.status()
    };

    try {
      await storage.put('meta', {
        kind: 'pulsar-summary',
        summary: summary
      }, 'pulsar-summary::' + Date.now());
    } catch (e) {}

    eventBus.emit('pulsar:done', summary);
    return { ok: true, summary: summary, results: results };
  }

  function stop() { running = false; }

  function state() {
    return {
      running: running,
      paths: PATHS_UNIQUE.length,
      params: PARAMS_UNIQUE.length,
      methods: METHODS.length,
      headers: HEADERS.length,
      stealth: Stealth.status()
    };
  }

  // ── REGISTER WITH ORCHESTRATOR ──
  try {
    var orch = window.RS_ORCH;
    if (orch && typeof orch.onCleanup === 'function') {
      orch.onCleanup(function () {
        try { running = false; } catch (e) {}
      });
    }
  } catch (e) {}

  // ── PUBLIC ──
  mods.pulsar = {
    run: runAll,
    stop: stop,
    state: state,
    fuzzPaths: fuzzPaths,
    fuzzParams: fuzzParams,
    fuzzMethods: fuzzMethods,
    fuzzHeaders: fuzzHeaders,
    stealth: Stealth,
    baseline: function () { return computeBaseline(); },
    words: function () {
      return {
        paths: PATHS_UNIQUE.length,
        params: PARAMS_UNIQUE.length,
        methods: METHODS.length,
        headers: HEADERS.length
      };
    }
  };
  core.pulsar = mods.pulsar;

  eventBus.emit('pulsar:ready', {
    paths: PATHS_UNIQUE.length,
    params: PARAMS_UNIQUE.length,
    methods: METHODS.length,
    headers: HEADERS.length,
    orchestrated: true
  });

  if (typeof completion === 'function') completion(true);
})();