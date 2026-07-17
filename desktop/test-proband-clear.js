'use strict';
// Regression (reported bug): new pedigree -> move the proband off node 0 -> Clear all.
// The surviving member must become the explicit proband again (arrow + marker) and stay
// settable. Drives the REAL packaged renderer bundle under Electron via the same handlers
// the UI uses. Run: electron test-proband-clear.js   (exit 0 = pass)

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { DocumentStore } = require('./documentStore');

app.disableHardwareAcceleration();
const LIB = fs.mkdtempSync(path.join(os.tmpdir(), 'opedigree-proband-'));
process.env.OPEN_PEDIGREE_LIBRARY = LIB;
const INDEX_HTML = path.join(__dirname, 'renderer', 'index.html');

let store;
const results = [];
const check = (n, ok, d) => { results.push({ ok: !!ok }); console.log((ok ? 'PASS  ' : 'FAIL  ') + n + (d ? '  — ' + d : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function registerIpc() {
  const h = (c, fn) => ipcMain.handle(c, (_e, ...a) => fn(...a));
  h('doc:list', () => store.list());
  h('doc:create', (o) => store.create(o || {}));
  h('doc:open', (id) => store.read(id));
  h('doc:save', (p) => store.save(p || {}));
  h('app:bootstrap', async () => (await store.list()).find((d) => !d.corrupt) || store.create({ title: 'Untitled pedigree' }));
  h('app:get-locale', () => 'en');
  h('app:get-i18n', () => ({ locale: 'en', messages: {} }));
  ipcMain.on('doc:dirty', () => {});
}

app.whenReady().then(async () => {
  store = new DocumentStore(LIB);
  registerIpc();
  const win = new BrowserWindow({ width: 1400, height: 900, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) console.log('RENDERER-ERR  ' + message); });
  await win.loadFile(INDEX_HTML);
  for (let i = 0; i < 40; i++) {
    const ready = await win.webContents.executeJavaScript('typeof editor !== "undefined" && !!editor && !!(window.editor && window.editor.getGraph)').catch(() => false);
    if (ready) break;
    await sleep(250);
  }
  await sleep(600);

  // A fresh document has no nodes; pick the first template so node 0 (the proband) exists —
  // exactly what "新建家系图" does in the app.
  const pick = await win.webContents.executeJavaScript(`(() => {
    const g = window.editor.getGraph();
    if (g.DG.GG.getMaxRealVertexId() >= 0) return 'already-has-nodes';
    const box = document.querySelector('.picture-box');
    if (box) { box.click(); return 'clicked-template'; }
    return 'no-picker';
  })()`).catch((e) => 'pick-threw:' + e.message);
  console.log('template pick: ' + pick);
  await sleep(1500);

  let r;
  try {
    r = await win.webContents.executeJavaScript(`(() => { let step = 'init'; try {
    const E = window.editor; if (!E) return { __error: 'window.editor is undefined' };
    const c = E.getController(), g = E.getGraph(), view = E.getView();
    const persons = () => { const out = []; const max = g.DG.GG.getMaxRealVertexId();
      for (let i = 0; i <= max; i++) if (g.isPerson(i) && !g.isPersonGroup(i)) out.push(i); return out; };
    const rels = () => { const out = []; const max = g.DG.GG.getMaxRealVertexId();
      for (let i = 0; i <= max; i++) if (g.isRelationship(i)) out.push(i); return out; };
    // build: proband(0) + partner + child, then move the proband to the child
    step = 'addPartnerAndChild';
    const relsBefore = rels();
    c.handlePersonNewPartnerAndChild({ memo: { personID: 0, twins: 1, groupSize: 0, noUndoRedo: true } });
    const newRel = rels().find(r => relsBefore.indexOf(r) === -1);
    step = 'findChild newRel=' + newRel;
    const kids = g.getRelationshipChildrenSortedByOrder(newRel);
    const child = kids && kids[0];
    step = 'setProband child=' + child;
    c.handleSetProperty({ memo: { nodeID: child, properties: { setProband: true }, noUndoRedo: true } });
    step = 'getProbandId';
    const probandBeforeClear = g.getProbandId();
    step = 'clearGraph';
    c.handleClearGraph({ memo: { noUndoRedo: true } });
    step = 'after persons=' + JSON.stringify(persons());
    const after = persons();
    const probandAfter = g.getProbandId();
    step = 'node0Marked nodeMapKeys=' + JSON.stringify(Object.keys(view.getNodeMap()));
    const node0Marked = view.getNodeMap()[0] ? view.getNodeMap()[0].getProband() : '__no-node-0';
    // and it stays settable (not a silent no-op)
    step = 'reset proband on 0';
    c.handleSetProperty({ memo: { nodeID: 0, properties: { setProband: true }, noUndoRedo: true } });
    const n0 = view.getNodeMap()[0];
    const stillProband = !!(n0 && n0.getProband()) && g.getProbandId() === 0;
    return { child, probandBeforeClear, after, probandAfter, node0Marked, stillProband, __step: step };
  } catch (e) { return { __error: 'at step[' + step + '] str=' + String(e) }; } })()`);
  } catch (e) {
    console.log('THREW  ' + (e && e.message || e));
    console.log('==== PROBAND CLEAR: 0/5 passed ====');
    app.exit(2);
    return;
  }

  if (r && r.__error) {
    console.log('INJECT-ERROR  ' + r.__error);
    console.log('==== PROBAND CLEAR: 0/5 passed ====');
    app.exit(2); return;
  }

  check('proband moved to the child before clear', r.probandBeforeClear === r.child, 'proband=' + r.probandBeforeClear + ' child=' + r.child);
  check('only the surviving member remains after clear', JSON.stringify(r.after) === JSON.stringify([0]), JSON.stringify(r.after));
  check('proband falls back to the surviving member', r.probandAfter === 0, 'probandId=' + r.probandAfter);
  check('surviving member is explicitly marked proband (arrow), not fallback-only', r.node0Marked === true, 'node0.getProband()=' + r.node0Marked);
  check('surviving member can still be (re)set as proband', r.stillProband === true, 'stillProband=' + r.stillProband);

  const passed = results.filter((x) => x.ok).length;
  console.log('==== PROBAND CLEAR: ' + passed + '/' + results.length + ' passed ====');
  app.exit(passed === results.length ? 0 : 1);
});
