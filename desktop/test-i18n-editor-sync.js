'use strict';
// Scenario: the editor (renderer bundle) must adopt the desktop shell's on-disk locale on
// load — src/app.js syncDesktopLocaleThen(). Boots the real index.html with the shipped
// preload + a shell that reports locale over IPC, and asserts:
//   1. a mismatched editor reconciles to the shell locale (one reload, no loop), and
//   2. a LATER change to a *different* target still reconciles (regression guard for the
//      over-aggressive one-shot guard Codex flagged, now fixed to be per-target).

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { DocumentStore } = require('./documentStore');
const i18n = require('./i18n');

app.disableHardwareAcceleration();

const LIB = fs.mkdtempSync(path.join(os.tmpdir(), 'opedigree-locsync-'));
process.env.OPEN_PEDIGREE_LIBRARY = LIB;
const INDEX_HTML = path.join(__dirname, 'renderer', 'index.html');

let store;
let desktopLocale = 'zh';        // what the shell reports over IPC (mutable per phase)
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
  h('app:get-locale', () => desktopLocale);
  h('app:set-locale', (loc) => { desktopLocale = loc; return { ok: true, persisted: true, locale: loc }; });
  h('app:get-i18n', () => ({ locale: desktopLocale, messages: i18n.messages(desktopLocale) }));
  ipcMain.on('doc:dirty', () => {});
}

app.whenReady().then(async () => {
  i18n.init(app);
  store = new DocumentStore(LIB);
  registerIpc();

  const win = new BrowserWindow({ width: 1200, height: 800, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });

  let finishes = 0;
  win.webContents.on('did-finish-load', () => { finishes++; });
  const js = (expr) => win.webContents.executeJavaScript(expr, true).catch(() => null);

  async function waitLocale(expected, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let loc = null;
    while (Date.now() < deadline) {
      loc = await js('window.OPI18n && OPI18n.getLocale()');
      if (loc === expected) return loc;
      await sleep(200);
    }
    return loc;
  }

  // "No reload loop" is proven by the load count going STABLE over time (a loop keeps
  // incrementing). setLocaleNoReload sets the locale synchronously before reload fires, so
  // we can't tie the count to when getLocale flips — we sample twice ~1s apart and require
  // equality plus a small bound.
  async function assertSettled(label, base, bound) {
    await sleep(2000);           // let any pending reload complete
    const s1 = finishes;
    await sleep(900);
    const s2 = finishes;
    check(label, s1 === s2 && (s2 - base) <= bound, 'stable=' + (s1 === s2) + ' count[' + s1 + ',' + s2 + '] delta=' + (s2 - base));
  }

  try {
    // ---- Phase 1: shell=zh, editor should adopt zh ----
    desktopLocale = 'zh';
    await win.loadFile(INDEX_HTML);
    let loc = await waitLocale('zh', 12000);
    check('editor adopts the shell locale (zh) on load', loc === 'zh', JSON.stringify(loc));
    await assertSettled('phase 1 settles with no reload loop', 0, 2);

    // ---- Phase 2: shell switches to en (different target) -> editor must reconcile again ----
    const base = finishes;
    desktopLocale = 'en';
    await win.loadFile(INDEX_HTML);
    loc = await waitLocale('en', 12000);
    check('a later switch to a DIFFERENT target (en) still reconciles', loc === 'en', JSON.stringify(loc));
    await assertSettled('phase 2 (different target) settles with no reload loop', base, 2);
  } catch (e) {
    check('scenario ran without throwing', false, String(e && e.message || e));
  }

  const passed = results.filter((r) => r.ok).length;
  console.log('==== i18n EDITOR-SYNC: ' + passed + '/' + results.length + ' passed ====');
  app.exit(passed === results.length ? 0 : 1);
});
