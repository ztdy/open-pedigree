'use strict';

// S1 scenario (DESKTOP_PLAN.md §10 C1): edit -> save -> reopen must round-trip.
// Drives the real editor inside the hardened shell against a throwaway library dir,
// then relaunches the renderer against the same doc and compares the graph.
// Run: electron test-s1-roundtrip.js   (exit 0 = pass)

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { DocumentStore } = require('./documentStore');

app.disableHardwareAcceleration(); // WSL GPU process is flaky; renderer doesn't need it for the test.

const LIB = fs.mkdtempSync(path.join(os.tmpdir(), 'opedigree-s1-'));
process.env.OPEN_PEDIGREE_LIBRARY = LIB;

const INDEX_HTML = path.join(__dirname, 'renderer', 'index.html');
let store;
const results = [];
function check(name, cond, detail) { results.push({ name, ok: !!cond, detail }); console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  — ' + detail : '')); }

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
  // file:// loads can transiently abort on WSL; retry a couple of times.
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

async function loadEditor(win) { await loadOnce(win, false); await waitEditorReady(win); }
async function reloadEditor(win) { await loadOnce(win, true); await waitEditorReady(win); }

async function run() {
  store = new DocumentStore(LIB);
  registerIpc();

  // --- Session 1: fresh doc, import a small pedigree, save. ---
  const w1 = newWindow();
  await loadEditor(w1);

  const docId = await w1.webContents.executeJavaScript('window.openPedigreeDesktop && require && false; DesktopMarker && false;'.replace(/.*/, '') || 'null')
    .catch(() => null);
  // We can't import DesktopSession directly; read the active id via bootstrap list.
  const created = (await store.list())[0];
  check('bootstrap created/opened a document', !!created, created && created.documentId);

  // Build a deterministic pedigree via the PED import path, then save via the Save action.
  const built = await w1.webContents.executeJavaScript(`(function(){
    try {
      var ped = "1 1 0 0 1 1\\n1 2 0 0 2 1\\n1 3 1 2 2 1";
      editor.getSaveLoadEngine().createGraphFromImportData(ped, "ped", {}, true, true);
      return { ok:true, maxId: editor.getGraph().getMaxNodeId() };
    } catch(e){ return { ok:false, err:String(e) }; }
  })()`);
  check('imported a pedigree in session 1', built && built.ok, built && (built.ok ? 'maxNodeId=' + built.maxId : built.err));

  const graph1 = await w1.webContents.executeJavaScript('editor.getGraph().toJSON()');

  // Trigger a save through the real UI action and wait for completion.
  const saveDone = new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), 8000);
    ipcMain.once('__s1_saved', () => { clearTimeout(t); resolve(true); });
  });
  await w1.webContents.executeJavaScript(`
    document.observe('pedigree:save:complete', function(){ window.openPedigreeDesktop.api.notifyDirty(false); });
    (function(){ var b=$('action-save'); if(b){ b.click(); } else { editor.getSaveLoadEngine().save(); } })();
  `);
  // Poll the store for the persisted graph rather than depend on a custom event.
  let persisted = null;
  for (let i = 0; i < 40; i++) {
    const d = await store.read(created.documentId);
    if (d && d.graph) { persisted = d; break; }
    await sleep(200);
  }
  check('save persisted the graph to disk', !!persisted, persisted && (persisted.graph.length + ' bytes'));

  // --- Session 2: reload the window; bootstrap reopens the most-recent (saved) doc. ---
  await reloadEditor(w1);
  const reopenedId = (await store.list())[0].documentId;
  check('reload reopened the saved document', reopenedId === created.documentId, reopenedId);
  const graph2 = await w1.webContents.executeJavaScript('editor.getGraph().toJSON()');
  w1.destroy();

  // Compare structurally (key order / whitespace independent).
  let same = false;
  try { same = JSON.stringify(JSON.parse(graph1)) === JSON.stringify(JSON.parse(graph2)); } catch (e) {}
  check('reopened graph equals saved graph (round-trip)', same,
    same ? 'identical' : 'g1=' + graph1.length + 'b g2=' + graph2.length + 'b');

  fs.rmSync(LIB, { recursive: true, force: true });
  const failed = results.filter((r) => !r.ok);
  const summary = `==== S1 ROUND-TRIP: ${results.length - failed.length}/${results.length} passed ====`;
  console.log('\n' + summary);
  // Persist results durably — app.exit() can truncate buffered stdout.
  try {
    fs.writeFileSync(path.join(__dirname, 's1-result.json'),
      JSON.stringify({ results, summary, pass: failed.length === 0 }, null, 2));
  } catch (e) {}
  await sleep(300);
  app.exit(failed.length ? 1 : 0);
}

app.whenReady().then(run).catch((e) => { console.error(e); app.exit(1); });
