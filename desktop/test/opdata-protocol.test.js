'use strict';
// Headless check: the opdata:// privileged scheme resolves from a real file:// page,
// via both fetch() and XMLHttpRequest (what the legacy Suggest widget uses).
const { app, BrowserWindow, protocol } = require('electron');
const path = require('path');
const offlineData = require('../offlineData');

protocol.registerSchemesAsPrivileged([{
  scheme: 'opdata',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, bypassCSP: true }
}]);

function handler() {
  protocol.handle('opdata', async (request) => {
    const u = new URL(request.url);
    const q = u.searchParams.get('q') || '';
    const payload = u.hostname === 'genes' ? await offlineData.searchGenes(q)
      : u.hostname === 'hpo' ? await offlineData.searchHpo(q)
      : u.hostname === 'disorders' ? await offlineData.searchDisorders(q, u.searchParams.get('lang') || 'en')
      : null;
    if (!payload) return new Response('nf', { status: 404 });
    return new Response(JSON.stringify(payload), {
      status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  });
}

app.whenReady().then(async () => {
  handler();
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadFile(path.join(__dirname, '..', 'library.html'));
  const result = await win.webContents.executeJavaScript(`(async () => {
    const out = {};
    // 1. fetch()
    try {
      const r = await fetch('opdata://genes/?q=brca');
      out.fetchGenes = (await r.json()).docs.map(d => d.symbol).slice(0,4);
    } catch (e) { out.fetchGenes = 'ERR:' + e.message; }
    // 2. XMLHttpRequest (Prototype Ajax path)
    out.xhrHpo = await new Promise((res) => {
      try {
        const x = new XMLHttpRequest();
        x.open('GET', 'opdata://hpo/?q=seizure', true);
        x.onreadystatechange = () => {
          if (x.readyState === 4) {
            try { res({ status: x.status, rows: JSON.parse(x.responseText).rows.map(r=>r.name).slice(0,3) }); }
            catch (e) { res('PARSE_ERR:' + e.message + ' body=' + x.responseText.slice(0,80)); }
          }
        };
        x.onerror = () => res('XHR_ERR status=' + x.status);
        x.send();
      } catch (e) { res('XHR_THROW:' + e.message); }
    });
    // 3. disorders (Orphanet) — the picker queries by prefix in the UI locale...
    try {
      const r = await fetch('opdata://disorders/?lang=zh&q=' + encodeURIComponent('马凡'));
      out.zhPrefix = (await r.json()).rows.map(d => d.name).slice(0, 3);
    } catch (e) { out.zhPrefix = 'ERR:' + e.message; }
    try {
      const r = await fetch('opdata://disorders/?lang=en&q=marfan');
      out.enPrefix = (await r.json()).rows.map(d => d.name).slice(0, 3);
    } catch (e) { out.enPrefix = 'ERR:' + e.message; }
    // ...and Disorder.load queries by exact id when a saved pedigree is reopened.
    try {
      const r = await fetch('opdata://disorders/?lang=zh&q=ORPHA%3A558');
      out.byIdZh = (await r.json()).rows;
    } catch (e) { out.byIdZh = 'ERR:' + e.message; }
    try {
      const r = await fetch('opdata://disorders/?lang=en&q=ORPHA%3A558');
      out.byIdEn = (await r.json()).rows;
    } catch (e) { out.byIdEn = 'ERR:' + e.message; }
    return out;
  })()`);
  console.log('RESULT ' + JSON.stringify(result));

  // Assert both transports actually resolved offline data (not error strings).
  let pass = 0, fail = 0;
  const check = (name, ok, detail) => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  — ' + detail : '')); ok ? pass++ : fail++; };

  const genes = Array.isArray(result.fetchGenes) ? result.fetchGenes : [];
  check('fetch() resolves opdata://genes offline', genes.length > 0 && genes.indexOf('BRCA1') !== -1, JSON.stringify(result.fetchGenes));
  const hpo = result.xhrHpo && typeof result.xhrHpo === 'object' ? result.xhrHpo : null;
  check('XMLHttpRequest resolves opdata://hpo offline (Prototype Suggest path)',
    !!hpo && hpo.status === 200 && Array.isArray(hpo.rows) && hpo.rows.length > 0, JSON.stringify(result.xhrHpo));

  const zhPrefix = Array.isArray(result.zhPrefix) ? result.zhPrefix : [];
  check('fetch() resolves opdata://disorders by CJK prefix (Orphanet)',
    zhPrefix.some((n) => n.indexOf('马凡') === 0), JSON.stringify(result.zhPrefix));
  const enPrefix = Array.isArray(result.enPrefix) ? result.enPrefix : [];
  check('opdata://disorders matches an English name even in the zh dataset',
    enPrefix.length > 0, JSON.stringify(result.enPrefix));
  // Reopening a saved pedigree resolves the stored ORPHA id back to a name — without this the
  // legend would show 'ORPHA:558' instead of the disorder.
  const byIdZh = Array.isArray(result.byIdZh) ? result.byIdZh : [];
  check('opdata://disorders resolves an exact ORPHA id to its zh name',
    byIdZh.length === 1 && byIdZh[0].id === 'ORPHA:558' && byIdZh[0].name === '马凡综合征', JSON.stringify(result.byIdZh));
  const byIdEn = Array.isArray(result.byIdEn) ? result.byIdEn : [];
  check('opdata://disorders resolves an exact ORPHA id to its en name',
    byIdEn.length === 1 && byIdEn[0].name === 'Marfan syndrome', JSON.stringify(result.byIdEn));

  console.log('==== opdata protocol: ' + pass + '/' + (pass + fail) + ' passed ====');
  app.exit(fail ? 1 : 0);
});
