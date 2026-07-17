'use strict';

// Disorders come from the bundled Orphanet dataset on the desktop build. This drives the two
// paths that only exist there, inside the real shell:
//
//   1. the picker's suggestions are served from opdata:// (no network, OMIM not bundled)
//   2. a saved pedigree stores the ORPHA id ALONE, so reopening it has to resolve the id back
//      to a name via Disorder.load -> opdata://. Without that the legend reads "ORPHA:558".
//
// (2) is the reason this is an Electron scenario test and not a browser e2e case: Disorder.load
// takes its desktop branch only when window.openPedigreeDesktop.isDesktop is set.
//
// Run: electron test-disorders-offline.js   (exit 0 = pass)

const { app, BrowserWindow, ipcMain, protocol } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { DocumentStore } = require('./documentStore');
const offlineData = require('./offlineData');

app.disableHardwareAcceleration(); // WSL GPU process is flaky; the renderer doesn't need it.

const LIB = fs.mkdtempSync(path.join(os.tmpdir(), 'opedigree-disorders-'));
process.env.OPEN_PEDIGREE_LIBRARY = LIB;

const INDEX_HTML = path.join(__dirname, 'renderer', 'index.html');
let store;
const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail });
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  — ' + detail : ''));
}

protocol.registerSchemesAsPrivileged([{
  scheme: 'opdata',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, bypassCSP: true }
}]);

function registerOpdata() {
  protocol.handle('opdata', async (request) => {
    const u = new URL(request.url);
    const q = u.searchParams.get('q') || '';
    const lang = u.searchParams.get('lang') || 'en';
    let payload = null;
    if (u.hostname === 'genes') payload = await offlineData.searchGenes(q);
    else if (u.hostname === 'hpo') payload = await offlineData.searchHpo(q);
    else if (u.hostname === 'disorders') payload = await offlineData.searchDisorders(q, lang);
    if (!payload) return new Response('nf', { status: 404 });
    return new Response(JSON.stringify(payload), {
      status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  });
}

function registerIpc() {
  const h = (c, fn) => ipcMain.handle(c, (_e, ...a) => fn(...a));
  h('doc:list', () => store.list());
  h('doc:create', (o) => store.create(o || {}));
  h('doc:open', (id) => store.read(id));
  h('doc:save', (p) => store.save(p || {}));
  h('app:bootstrap', async () => {
    const docs = await store.list();
    const usable = docs.find((d) => !d.corrupt);
    return usable || store.create({ title: 'Untitled pedigree' });
  });
  ipcMain.on('doc:dirty', () => {});
}

function newWindow() {
  return new BrowserWindow({
    width: 1200, height: 800, show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadOnce(win, useReload) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (useReload && attempt === 0) { win.webContents.reload(); await win.webContents.once('did-finish-load'); }
      else { await win.loadFile(INDEX_HTML); }
      return;
    } catch (e) {
      if (attempt === 2) throw e;
      await sleep(400);
    }
  }
}

async function waitEditorReady(win) {
  for (let i = 0; i < 40; i++) {
    const ready = await win.webContents.executeJavaScript(
      'typeof editor !== "undefined" && !!editor && !!(window.openPedigreeDesktop) && !!(window.editor && window.editor.getGraph)'
    ).catch(() => false);
    if (ready) break;
    await sleep(250);
  }
  await sleep(500);
}

async function run() {
  store = new DocumentStore(LIB);
  registerOpdata();
  registerIpc();

  const win = newWindow();
  await loadOnce(win, false);
  await waitEditorReady(win);

  // --- the picker's data source -------------------------------------------------------
  const suggest = await win.webContents.executeJavaScript(`(async () => {
    const get = (url) => new Promise((res) => {
      const x = new XMLHttpRequest();          // the Prototype Suggest transport
      x.open('GET', url, true);
      x.onreadystatechange = () => { if (x.readyState === 4) {
        try { res(JSON.parse(x.responseText)); } catch (e) { res({ err: String(e) }); } } };
      x.onerror = () => res({ err: 'xhr' });
      x.send();
    });
    const zh = await get('opdata://disorders/?lang=zh&q=' + encodeURIComponent('马凡'));
    const en = await get('opdata://disorders/?lang=en&q=marfan');
    return { zh: (zh.rows || []).slice(0, 3), en: (en.rows || []).slice(0, 3) };
  })()`);
  check('the disorder picker gets Orphanet suggestions for a CJK query',
    suggest.zh.some((r) => r.name.indexOf('马凡') === 0 && /^ORPHA:\d+$/.test(r.id)),
    JSON.stringify(suggest.zh.map((r) => r.id + '=' + r.name)));
  check('the disorder picker gets suggestions for an English query',
    suggest.en.length > 0, JSON.stringify(suggest.en.map((r) => r.name)));

  // --- an ORPHA disorder is stored by id, and the id alone --------------------------
  const stored = await win.webContents.executeJavaScript(`(function(){
    try {
      // A fresh desktop document has an empty graph (the template chooser is up), so make one.
      editor.getSaveLoadEngine().createGraphFromImportData('1 1 0 0 1 1', 'ped', {}, true, true);
      // What the picker hands to the editor: id + display name, exactly like a user's pick.
      var d = new (editor.getDisorderLegend().getDisorder('ORPHA:558').constructor)('ORPHA:558', '马凡综合征');
      // Go through the controller, as the menu does: setting it on the view's Person directly
      // updates only the view, and toJSON serializes the model — the disorder would not be saved.
      document.fire('pedigree:node:setproperty',
        { nodeID: 0, properties: { setDisorders: [d] }, noUndoRedo: true });
      return { ok: true, ids: editor.getView().getNode(0).getDisorders().slice(),
               serialized: editor.getSaveLoadEngine().serialize() };
    } catch (e) { return { ok: false, err: String(e && e.stack || e) }; }
  })()`);
  check('an ORPHA disorder is stored under its coded id', stored.ok && stored.ids.length === 1,
    stored.ok ? JSON.stringify(stored.ids) : stored.err);
  check('the stored id decodes back to the ORPHA CURIE',
    stored.ok && stored.ids[0] === 'ORPHA_u003A_558', stored.ok && stored.ids[0]);
  check('the saved file carries the id, not the name (so the name must be resolved on reopen)',
    stored.ok && stored.serialized.indexOf('马凡综合征') === -1 && stored.serialized.indexOf('ORPHA') !== -1);

  // --- reopen: the legend name has to come back from the bundled dataset -------------
  // Reload the window first: opening a saved file in a fresh app means an empty Disorder cache,
  // and resolving out of a warm cache would prove nothing about Disorder.load.
  await loadOnce(win, true);
  await waitEditorReady(win);

  const reopened = await win.webContents.executeJavaScript(`(async () => {
    try {
      editor.getSaveLoadEngine().createGraphFromSerializedData(${JSON.stringify(stored.serialized)}, false, true);
      const after = editor.getView().getNode(0).getDisorders().slice();
      if (!after.length) return { ok: false, err: 'the reloaded graph carries no disorder' };
      const disorder = editor.getDisorderLegend().getDisorder(after[0]);
      for (let i = 0; i < 40 && disorder.getName() === 'loading...'; i++) {
        await new Promise((r) => setTimeout(r, 100));   // load() is an async XHR
      }
      return { ok: true, id: after[0], name: disorder.getName(), locale: window.OPI18n.getLocale() };
    } catch (e) { return { ok: false, err: String(e && e.stack || e) }; }
  })()`);
  if (!reopened.ok) console.log('  DEBUG reopen: ' + reopened.err);
  check('reopening in a fresh window resolves the ORPHA id to its name (not the id, not "loading...")',
    reopened.ok && reopened.name === 'Marfan syndrome',
    reopened.ok ? reopened.id + ' -> ' + reopened.name + ' [locale=' + reopened.locale + ']' : reopened.err);

  // The name is a label resolved at load time, so it follows the UI language rather than
  // whatever was current when the pedigree was saved.
  const zhName = await win.webContents.executeJavaScript(`(async () => {
    try {
      window.OPI18n.setLocaleNoReload('zh');
      editor.getDisorderLegend()._disorderCache = {};   // as if opened fresh in a zh session
      const disorder = editor.getDisorderLegend().getDisorder('ORPHA_u003A_558');
      for (let i = 0; i < 40 && disorder.getName() === 'loading...'; i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      return { ok: true, name: disorder.getName() };
    } catch (e) { return { ok: false, err: String(e) }; }
  })()`);
  check('the resolved disorder name follows the UI language',
    zhName.ok && zhName.name === '马凡综合征', zhName.ok ? zhName.name : zhName.err);

  // --- a MIM number has no offline source: show the number, never hang on "loading..." ---
  const mim = await win.webContents.executeJavaScript(`(async () => {
    try {
      const D = editor.getDisorderLegend().getDisorder('ORPHA:558').constructor;
      const d = new D('154700', null, function(){});
      for (let i = 0; i < 20 && d.getName() === 'loading...'; i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      return { ok: true, name: d.getName() };
    } catch (e) { return { ok: false, err: String(e) }; }
  })()`);
  check('an OMIM MIM id degrades to showing the number rather than a stuck "loading..."',
    mim.ok && mim.name === '154700', mim.ok ? mim.name : mim.err);

  // --- free-text CJK still works and does not collide -------------------------------
  const freeText = await win.webContents.executeJavaScript(`(function(){
    try {
      editor.getSaveLoadEngine().createGraphFromImportData('1 1 0 0 1 1', 'ped', {}, true, true);
      var set = function(v) { document.fire('pedigree:node:setproperty',
        { nodeID: 0, properties: { setDisorders: [v] }, noUndoRedo: true }); };
      var n = editor.getView().getNode(0);
      set('遗传性乳腺癌');
      var idA = n.getDisorders()[0];
      set('先天性心脏病');
      var idB = n.getDisorders()[0];
      return { ok: true, idA: idA, idB: idB,
               nameA: editor.getDisorderLegend().getDisorder(idA).getName() };
    } catch (e) { return { ok: false, err: String(e) }; }
  })()`);
  check('free-text CJK disorders still get distinct ids on the desktop build',
    freeText.ok && freeText.idA !== freeText.idB,
    freeText.ok ? freeText.idA + ' vs ' + freeText.idB : freeText.err);
  check('a free-text CJK disorder keeps its name on the desktop build',
    freeText.ok && freeText.nameA === '遗传性乳腺癌', freeText.ok && freeText.nameA);

  const pass = results.filter((r) => r.ok).length;
  console.log('==== DISORDERS OFFLINE: ' + pass + '/' + results.length + ' passed ====');
  try { fs.rmSync(LIB, { recursive: true, force: true }); } catch (e) { /* temp dir */ }
  app.exit(pass === results.length ? 0 : 1);
}

app.whenReady().then(run).catch((e) => { console.error('FAIL  harness error — ' + e); app.exit(1); });
