'use strict';

// M0 smoke test: launch the hardened shell, load the real renderer, and assert the
// editor actually initialised under contextIsolation/sandbox. Captures a screenshot
// for visual proof and exercises an import parser to prove the bundle's logic runs.
// Run with: ./node_modules/.bin/electron smoke.js   (exit code 0 = pass)

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { DocumentStore } = require('./documentStore');

app.disableHardwareAcceleration();

const LIB = fs.mkdtempSync(path.join(os.tmpdir(), 'opedigree-smoke-'));
process.env.OPEN_PEDIGREE_LIBRARY = LIB;
const INDEX_HTML = path.join(__dirname, 'renderer', 'index.html');
const SHOT = path.join(__dirname, 'm0-smoke.png');

// Minimal desktop IPC harness so app.js's bootstrap path resolves (mirrors main.js).
let store;
function registerIpc() {
  const h = (c, fn) => ipcMain.handle(c, (_e, ...a) => fn(...a));
  h('doc:list', () => store.list());
  h('doc:create', (o) => store.create(o || {}));
  h('doc:open', (id) => store.read(id));
  h('doc:save', (p) => store.save(p || {}));
  h('app:bootstrap', async () => (await store.list()).find((d) => !d.corrupt) || store.create({ title: 'Untitled pedigree' }));
  ipcMain.on('doc:dirty', () => {});
}

const checks = [];
function record(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

async function run() {
  store = new DocumentStore(LIB);
  registerIpc();
  const win = new BrowserWindow({
    width: 1400, height: 900, show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  });

  // The renderer legitimately logs "No save/load function provided for backend" at M0
  // because the DocumentStore backend is not wired until M1. Treat those as expected.
  const EXPECTED_MSG = /No "(save|load)" function provided for backend/;
  const consoleErrors = [];
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 3 && !EXPECTED_MSG.test(message)) consoleErrors.push(message); // 3 = error
  });

  await win.loadFile(INDEX_HTML);
  // Editor inits on dom:loaded after the async bootstrap; poll until ready.
  for (let i = 0; i < 40; i++) {
    const ready = await win.webContents.executeJavaScript('typeof editor !== "undefined" && !!editor && !!(window.editor && window.editor.getGraph)').catch(() => false);
    if (ready) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  await new Promise((r) => setTimeout(r, 700));

  const js = (expr) => win.webContents.executeJavaScript(expr, true);

  // 1) Isolation marker from preload reached the page's main world.
  record('preload bridge exposed (contextIsolation)',
    await js('!!(window.openPedigreeDesktop && window.openPedigreeDesktop.isDesktop)'));

  // 2) Prototype.js loaded and its globals live (proves legacy stack survives isolation).
  //    Read them off window explicitly — bare identifiers can be shadowed in the eval scope.
  // Prototype 1.7: `Class` is an object exposing Class.create(); `$` is a function; `Prototype` an object.
  const proto = await js('({ create: typeof (window.Class && window.Class.create), $: typeof window.$, Prototype: typeof window.Prototype })');
  record('Prototype.js globals present',
    proto.create === 'function' && proto.$ === 'function' && proto.Prototype === 'object',
    `Class.create=${proto.create} $=${proto.$} Prototype=${proto.Prototype}`);

  // 3) The editor singleton initialised.
  const hasEditor = await js('typeof editor !== "undefined" && !!editor && typeof editor.getGraph === "function"');
  record('editor singleton initialised', hasEditor);

  // 4) Raphael actually drew SVG into the workspace.
  const svgCount = await js('document.querySelectorAll("svg, svg *").length');
  record('Raphael SVG rendered', svgCount > 20, `${svgCount} svg nodes`);

  // 5) Toolbar menu rendered (import/export/templates entry points exist).
  const hasMenu = await js('!!document.getElementById("action-import") && !!document.getElementById("action-export")');
  record('editor toolbar rendered', hasMenu);

  // 6) Import parser logic runs inside the bundle (exercise a tiny PED import end-to-end).
  //    We drive it through the public load path and check the graph gains people.
  const importOk = await js(`(function(){
    try {
      var ped = "1 1 0 0 1 1\\n1 2 0 0 2 1\\n1 3 1 2 1 2";
      var before = editor.getGraph().getMaxNodeId();
      editor.getSaveLoadEngine().createGraphFromImportData(ped, "ped", {}, true, true);
      var after = editor.getGraph().getMaxNodeId();
      return { ok: true, before: before, after: after, grew: after > before };
    } catch (e) { return { ok: false, err: String(e) }; }
  })()`);
  record('PED import runs end-to-end', !!(importOk && importOk.ok && importOk.grew),
    importOk && (importOk.ok ? ('maxNodeId ' + importOk.before + '→' + importOk.after) : importOk.err));

  // 7) No renderer console errors during load/import.
  record('no renderer console errors', consoleErrors.length === 0,
    consoleErrors.length ? consoleErrors.slice(0, 3).join(' | ') : 'clean');

  // Visual proof.
  try {
    const img = await win.capturePage();
    fs.writeFileSync(SHOT, img.toPNG());
    console.log('screenshot -> ' + SHOT);
  } catch (e) {
    console.log('screenshot failed: ' + e);
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n==== M0 SMOKE: ${checks.length - failed.length}/${checks.length} passed ====`);
  win.destroy();
  try { fs.rmSync(LIB, { recursive: true, force: true }); } catch (e) {}
  await new Promise((r) => setTimeout(r, 200));
  app.exit(failed.length ? 1 : 0);
}

app.whenReady().then(run).catch((e) => { console.error(e); app.exit(1); });
