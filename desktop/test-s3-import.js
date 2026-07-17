'use strict';

// S3 scenario (DESKTOP_PLAN.md §10 C3): import hardening.
//  - "import as new" plumbing for each format populates a fresh doc, marks it dirty,
//    and persists on save (reopen shows the people).
//  - a corrupt import does NOT damage the current graph (rollback).
//  - detectImportType maps every format correctly.
// Run: electron test-s3-import.js   (exit 0 = pass)

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { DocumentStore } = require('./documentStore');
const { detectImportType } = require('./importDetect');

app.disableHardwareAcceleration();
const LIB = fs.mkdtempSync(path.join(os.tmpdir(), 'opedigree-s3-'));
process.env.OPEN_PEDIGREE_LIBRARY = LIB;
const INDEX_HTML = path.join(__dirname, 'renderer', 'index.html');
const FX = path.join(__dirname, 'fixtures');

let store;
let pendingDocId = null;
let pendingImport = null;
const results = [];
const check = (n, ok, d) => { results.push({ name: n, ok: !!ok, detail: d }); console.log((ok ? 'PASS  ' : 'FAIL  ') + n + (d ? '  — ' + d : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const js = (win, e) => win.webContents.executeJavaScript(e, true);

function registerIpc() {
  const h = (c, fn) => ipcMain.handle(c, (_e, ...a) => fn(...a));
  h('doc:list', () => store.list());
  h('doc:create', (o) => store.create(o || {}));
  h('doc:open', (id) => store.read(id));
  h('doc:save', (p) => store.save(p || {}));
  h('app:bootstrap', async () => {
    const consume = () => { const p = pendingImport; pendingImport = null; return p || null; };
    let meta;
    if (pendingDocId) meta = (await store.list()).find((d) => d.documentId === pendingDocId);
    meta = meta || (await store.list()).find((d) => !d.corrupt) || (await store.create({ title: 'x' }));
    return Object.assign({}, meta, { pendingImport: consume() });
  });
  h('app:import-done', () => ({ ok: true }));
  ipcMain.on('doc:dirty', () => {});
}

function newWindow() {
  return new BrowserWindow({ show: false, webPreferences: {
    preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
}
async function loadEditor(win) {
  for (let a = 0; a < 4; a++) { try { await win.loadFile(INDEX_HTML); break; } catch (e) { if (a === 3) throw e; await sleep(400); } }
  for (let i = 0; i < 60; i++) { if (await js(win, '!!(window.__ped_desktop && window.editor)').catch(() => false)) break; await sleep(200); }
  // Neutralise blocking native dialogs so an import error (alert) can't hang the run.
  await js(win, 'window.__alerts=[]; window.alert=function(m){window.__alerts.push(String(m));};').catch(() => {});
  await sleep(700); // allow runPendingImport (300ms) + layout
}

// Simulate main's import-as-new: read fixture, detect type, create doc, set pending, open.
async function importAsNew(win, fixtureFile) {
  const content = fs.readFileSync(path.join(FX, fixtureFile), 'utf8');
  const importType = detectImportType(fixtureFile, content);
  const meta = await store.create({ title: fixtureFile });
  pendingDocId = meta.documentId;
  pendingImport = { importType, content };
  await loadEditor(win);
  return { meta, importType };
}

async function run() {
  store = new DocumentStore(LIB);
  registerIpc();
  const win = newWindow();

  // detectImportType unit coverage (all four).
  check('detect .ped -> ped', detectImportType('a.ped', '1 1 0 0 1 1') === 'ped');
  check('detect .ged -> gedcom', detectImportType('a.ged', '0 HEAD') === 'gedcom');
  check('detect .json -> GA4GH', detectImportType('a.json', '{"resourceType":"Bundle"}') === 'GA4GH');
  check('detect .boadicea -> BOADICEA', detectImportType('a.boadicea', 'BOADICEA import pedigree file format 2.0') === 'BOADICEA');
  check('detect by content sniff (no ext)', detectImportType('noext', 'BOADICEA import pedigree file format 2.0\n') === 'BOADICEA');

  // Import-as-new for each available fixture.
  const fixtures = ['family.ped', 'family.ged', 'family.boadicea'];
  if (fs.existsSync(path.join(FX, 'family.json'))) fixtures.push('family.json');

  for (const fx of fixtures) {
    const { meta } = await importAsNew(win, fx);
    const nodes = await js(win, 'editor.getGraph().getMaxNodeId()');
    const dirty = await js(win, 'window.__ped_desktop.isDirty()');
    check('import-as-new ' + fx + ' populated the graph', nodes > 0, 'maxNodeId=' + nodes);
    check('import-as-new ' + fx + ' marked dirty', dirty === true, 'dirty=' + dirty);
    await js(win, 'window.__ped_desktop.saveNow()');
    await sleep(300);
    const disk = await store.read(meta.documentId);
    const people = disk && disk.graph ? (JSON.parse(disk.graph).GG || []).length : 0;
    check('import-as-new ' + fx + ' persisted people to disk', people > 0, 'GG=' + people);
  }

  // Rollback: import a corrupt file into an existing graph -> graph unchanged.
  const base = await importAsNew(win, 'family.ped');
  const before = await js(win, 'editor.getGraph().toJSON()');
  const corrupt = fs.readFileSync(path.join(FX, 'corrupt.ped'), 'utf8');
  await js(win, 'try { editor.getSaveLoadEngine().createGraphFromImportData(' + JSON.stringify(corrupt) + ',"ped",{},false,true); } catch(e){}');
  await sleep(300);
  const after = await js(win, 'editor.getGraph().toJSON()');
  check('corrupt import leaves current graph unchanged (rollback)', before === after, before === after ? 'unchanged' : 'CHANGED');

  win.destroy();
  fs.rmSync(LIB, { recursive: true, force: true });
  const failed = results.filter((r) => !r.ok);
  const summary = '==== S3 IMPORT: ' + (results.length - failed.length) + '/' + results.length + ' passed ====';
  console.log('\n' + summary);
  try { fs.writeFileSync(path.join(__dirname, 's3-result.json'), JSON.stringify({ results, summary, pass: failed.length === 0 }, null, 2)); } catch (e) {}
  await sleep(300);
  app.exit(failed.length ? 1 : 0);
}

app.whenReady().then(run).catch((e) => { console.error(e); app.exit(1); });
