'use strict';

// S4 scenario (DESKTOP_PLAN.md §10 C2/C4) + regressions for Codex M1 high-sev #1/#2/#3.
// Verifies the dirty/close contract end-to-end:
//   - import marks the session dirty (#3)
//   - an edit made while a save is in flight keeps the doc dirty (#2)
//   - the save-and-close handshake actually acknowledges (#1) and persists
// Run: electron test-s4-dirty-close.js   (exit 0 = pass)

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { DocumentStore } = require('./documentStore');

app.disableHardwareAcceleration();

const LIB = fs.mkdtempSync(path.join(os.tmpdir(), 'opedigree-s4-'));
process.env.OPEN_PEDIGREE_LIBRARY = LIB;
const INDEX_HTML = path.join(__dirname, 'renderer', 'index.html');

let store;
let lastDirty = null;                 // last doc:dirty value main received
const results = [];
const check = (n, ok, d) => { results.push({ name: n, ok: !!ok, detail: d }); console.log((ok ? 'PASS  ' : 'FAIL  ') + n + (d ? '  — ' + d : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function registerIpc() {
  const h = (c, fn) => ipcMain.handle(c, (_e, ...a) => fn(...a));
  h('doc:list', () => store.list());
  h('doc:create', (o) => store.create(o || {}));
  h('doc:open', (id) => store.read(id));
  h('doc:save', (p) => store.save(p || {}));
  h('app:bootstrap', async () => (await store.list()).find((d) => !d.corrupt) || store.create({ title: 'Untitled pedigree' }));
  ipcMain.on('doc:dirty', (_e, v) => { lastDirty = !!v; });
}

function newWindow() {
  return new BrowserWindow({ width: 1200, height: 800, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
}

async function loadEditor(win) {
  await win.loadFile(INDEX_HTML);
  for (let i = 0; i < 40; i++) {
    const ready = await win.webContents.executeJavaScript('!!(window.__ped_desktop && window.editor)').catch(() => false);
    if (ready) break;
    await sleep(250);
  }
  await sleep(600); // let bootstrap suppressDirty release
}

const js = (win, expr) => win.webContents.executeJavaScript(expr, true);

async function run() {
  store = new DocumentStore(LIB);
  registerIpc();
  const win = newWindow();
  await loadEditor(win);
  const docId = (await store.list())[0].documentId;

  // Baseline: freshly bootstrapped empty doc must not be dirty.
  lastDirty = null;
  const cleanStart = await js(win, 'window.__ped_desktop.isDirty()');
  check('fresh bootstrap is not dirty', cleanStart === false, 'isDirty=' + cleanStart);

  // #3: importing must mark dirty (both session + main notified).
  await js(win, `editor.getSaveLoadEngine().createGraphFromImportData("1 1 0 0 1 1\\n1 2 0 0 2 1\\n1 3 1 2 2 1","ped",{},true,true);`);
  await sleep(300);
  const dirtyAfterImport = await js(win, 'window.__ped_desktop.isDirty()');
  check('import marks the document dirty (#3)', dirtyAfterImport === true && lastDirty === true, 'isDirty=' + dirtyAfterImport + ' mainSaw=' + lastDirty);

  // #2: an edit during an in-flight save must keep the doc dirty.
  const stillDirty = await js(win, `(async function(){
    var d = window.__ped_desktop;
    var p = d.saveNow();                                   // dispatch save (captures current revision)
    document.fire('pedigree:node:modify');                // edit BEFORE save resolves -> bumps revision
    await p;                                               // save of the old snapshot completes
    return d.isDirty();                                   // must still be dirty (new edit not persisted)
  })()`);
  check('edit during in-flight save stays dirty (#2)', stillDirty === true, 'isDirty=' + stillDirty);

  // Clean save (no concurrent edit) clears dirty.
  await js(win, 'window.__ped_desktop.saveNow()');
  await sleep(300);
  const cleanAfterSave = await js(win, 'window.__ped_desktop.isDirty()');
  check('plain save clears dirty', cleanAfterSave === false && lastDirty === false, 'isDirty=' + cleanAfterSave + ' mainSaw=' + lastDirty);

  // #1: the save-and-close handshake must acknowledge (not time out) and persist.
  // Make an edit, then simulate main's close-save request and capture the ack.
  await js(win, `document.fire('pedigree:node:modify');`);
  await sleep(100);
  const ackOk = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, reason: 'timeout' }), 8000);
    ipcMain.once('doc:save-ack', (event, payload) => {
      clearTimeout(timer);
      resolve({ ok: payload && payload.ok, requestId: payload && payload.requestId, fromThisWin: event.sender === win.webContents });
    });
    win.webContents.send('doc:save-and-close', { requestId: 'test-req-1' });
  });
  check('save-and-close is acknowledged, not timed out (#1)',
    ackOk.ok === true && ackOk.requestId === 'test-req-1' && ackOk.fromThisWin === true,
    JSON.stringify(ackOk));
  const persisted = await store.read(docId);
  check('save-and-close persisted the graph', !!(persisted && persisted.graph), persisted && persisted.graph ? 'graph present' : 'missing');

  win.destroy();
  fs.rmSync(LIB, { recursive: true, force: true });
  const failed = results.filter((r) => !r.ok);
  const summary = `==== S4 DIRTY/CLOSE: ${results.length - failed.length}/${results.length} passed ====`;
  console.log('\n' + summary);
  try { fs.writeFileSync(path.join(__dirname, 's4-result.json'), JSON.stringify({ results, summary, pass: failed.length === 0 }, null, 2)); } catch (e) {}
  await sleep(300);
  app.exit(failed.length ? 1 : 0);
}

app.whenReady().then(run).catch((e) => { console.error(e); app.exit(1); });
