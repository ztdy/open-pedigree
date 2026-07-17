'use strict';

// S2 scenario (DESKTOP_PLAN.md §10 C2): multi-document library must not cross-contaminate.
// Uses the REAL main.js process (so it exercises view-switching + bootstrap + IPC as shipped),
// pointed at a throwaway library. Drives: create two docs, edit each distinctly, and verify
// that editing B never leaked into A on disk, and that reopening each shows its own graph.
// Run: electron main.js is not directly scriptable, so we spawn it and talk over a tiny probe.
//
// Simpler + hermetic: reuse main.js's building blocks in-process (like S1/S4) but exercise the
// library view-switch handlers through DocumentStore + the same open/new semantics.

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { DocumentStore } = require('./documentStore');

app.disableHardwareAcceleration();

const LIB = fs.mkdtempSync(path.join(os.tmpdir(), 'opedigree-s2-'));
process.env.OPEN_PEDIGREE_LIBRARY = LIB;
const INDEX_HTML = path.join(__dirname, 'renderer', 'index.html');

let store;
let pendingDocId = null;
const results = [];
const check = (n, ok, d) => { results.push({ name: n, ok: !!ok, detail: d }); console.log((ok ? 'PASS  ' : 'FAIL  ') + n + (d ? '  — ' + d : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function registerIpc() {
  const h = (c, fn) => ipcMain.handle(c, (_e, ...a) => fn(...a));
  h('doc:list', () => store.list());
  h('doc:create', (o) => store.create(o || {}));
  h('doc:open', (id) => store.read(id));
  h('doc:save', (p) => store.save(p || {}));
  h('app:bootstrap', async () => {
    if (pendingDocId) { const m = (await store.list()).find((d) => d.documentId === pendingDocId); if (m) return m; }
    return (await store.list()).find((d) => !d.corrupt) || store.create({ title: 'Untitled' });
  });
  ipcMain.on('doc:dirty', () => {});
}

function newWindow() {
  return new BrowserWindow({ width: 1200, height: 800, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
}
const js = (win, e) => win.webContents.executeJavaScript(e, true);

async function openDocInEditor(win, docId) {
  pendingDocId = docId;
  // Repeated file:// loads on the same window transiently abort on WSL; retry.
  for (let attempt = 0; attempt < 4; attempt++) {
    try { await win.loadFile(INDEX_HTML); break; }
    catch (e) { if (attempt === 3) throw e; await sleep(500); }
  }
  for (let i = 0; i < 50; i++) {
    const ready = await js(win, '!!(window.__ped_desktop && window.editor)').catch(() => false);
    if (ready) break;
    await sleep(200);
  }
  await sleep(500);
  // Confirm the editor actually opened the requested doc.
  return js(win, 'window.__ped_desktop.session.activeDocumentId');
}

// Import a distinct, CONNECTED pedigree (two founders + `children` kids) and save. Build
// the PED in-page from an array joined on a real newline to avoid source-escaping issues.
async function editAndSave(win, children) {
  const lines = ['1 1 0 0 1 1', '1 2 0 0 2 1'];
  for (let c = 1; c <= children; c++) lines.push('1 ' + (2 + c) + ' 1 2 ' + ((c % 2) + 1) + ' 1');
  const arr = JSON.stringify(lines);
  await js(win, 'editor.getSaveLoadEngine().createGraphFromImportData(' + arr + '.join(String.fromCharCode(10)),"ped",{},true,true);');
  await sleep(150);
  await js(win, 'window.__ped_desktop.saveNow()');
  await sleep(350);
}

async function run() {
  store = new DocumentStore(LIB);
  registerIpc();

  const A = await store.create({ title: 'Family A' });
  const B = await store.create({ title: 'Family B' });
  const win = newWindow();

  // Open A, put 3 people, save.
  const openedA = await openDocInEditor(win, A.documentId);
  check('opened document A', openedA === A.documentId, openedA);
  await editAndSave(win, 3);
  const aMax1 = await js(win, 'editor.getGraph().getMaxNodeId()');

  // Snapshot A on disk right after saving it.
  const aDiskAfterA = await store.read(A.documentId);
  const aPeopleAfterA = (JSON.parse(aDiskAfterA.graph).GG || []).length;

  // Switch to B (session must reset), put 5 founders, save.
  const openedB = await openDocInEditor(win, B.documentId);
  check('switching to B resets active document (no leak)', openedB === B.documentId, openedB);
  await editAndSave(win, 5);
  const bMax = await js(win, 'editor.getGraph().getMaxNodeId()');
  check('B has its own larger graph', bMax > aMax1, 'A max=' + aMax1 + ' B max=' + bMax);

  // The real anti-contamination guarantee: editing/saving B must not have touched A's file.
  const aDiskAfterB = await store.read(A.documentId);
  check('A on disk is byte-identical after editing B (no cross-contamination)',
    aDiskAfterB.graph === aDiskAfterA.graph, 'A.graph stable=' + (aDiskAfterB.graph === aDiskAfterA.graph));

  // And the two documents persisted independently with different content.
  const db = await store.read(B.documentId);
  const bPeople = (JSON.parse(db.graph).GG || []).length;
  check('A and B persisted independently on disk', aPeopleAfterA !== bPeople && aPeopleAfterA > 0 && bPeople > 0,
    'A.GG=' + aPeopleAfterA + ' B.GG=' + bPeople);

  win.destroy();
  fs.rmSync(LIB, { recursive: true, force: true });
  const failed = results.filter((r) => !r.ok);
  const summary = '==== S2 LIBRARY: ' + (results.length - failed.length) + '/' + results.length + ' passed ====';
  console.log('\n' + summary);
  try { fs.writeFileSync(path.join(__dirname, 's2-result.json'), JSON.stringify({ results, summary, pass: failed.length === 0 }, null, 2)); } catch (e) {}
  await sleep(300);
  app.exit(failed.length ? 1 : 0);
}

app.whenReady().then(run).catch((e) => { console.error(e); app.exit(1); });
