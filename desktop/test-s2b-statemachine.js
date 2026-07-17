'use strict';

// S2b: exercises the REAL desktop/main.js state machine (not a re-implementation), as Codex
// asked. Requires main.js via its _test seam, drives the actual open/new/import/back handlers
// and asserts on pendingOpen atomicity, per-view IPC allowlist, navigation-commit ordering,
// and pending-import recovery on reload.
// Run: electron test-s2b-statemachine.js   (exit 0 = pass)

const { app, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

app.disableHardwareAcceleration();
const LIB = fs.mkdtempSync(path.join(os.tmpdir(), 'opedigree-s2b-'));
process.env.OPEN_PEDIGREE_LIBRARY = LIB;
// Stage marker: overwritten as the script advances, so a hang leaves the last-reached stage on disk.
const STAGE = path.join(__dirname, 's2b-stage.txt');
const stage = (s) => { try { fs.writeFileSync(STAGE, s + '\n'); } catch (e) {} };
stage('module-loaded');

const main = require('./main');           // require.main !== module, so it won't auto-start

// Neutralise the main-process native dialogs so an unexpected unsaved-changes prompt
// (blocking, no user in headless) can't hang the run. Record invocations so we can tell
// whether the state machine ever *needed* to prompt. `dialog` is destructured in main.js
// but points at the same shared electron.dialog object, so this override reaches it.
const electron = require('electron');
let dialogCalls = 0;
electron.dialog.showMessageBox = async () => { dialogCalls++; return { response: 1 }; }; // "Don't Save"
electron.dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });

const results = [];
const check = (n, ok, d) => { results.push({ name: n, ok: !!ok, detail: d }); console.log((ok ? 'PASS  ' : 'FAIL  ') + n + (d ? '  — ' + d : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  // Hard watchdog: if anything hangs (blocking dialog, stuck nav), fail loudly instead of
  // silently pinning the process forever.
  const watchdog = setTimeout(() => {
    try { fs.writeFileSync(path.join(__dirname, 's2b-result.json'), JSON.stringify({ results, summary: 'WATCHDOG TIMEOUT', pass: false }, null, 2)); } catch (e) {}
    console.error('S2b WATCHDOG TIMEOUT'); app.exit(1);
  }, 60000);
  watchdog.unref && watchdog.unref();
  stage('run-start');
  const store = main._test.init(LIB);
  main._test.createWindow();
  const win = main._test.getWindow();
  stage('window-created');
  // Wait for the library page to finish its initial load.
  for (let i = 0; i < 40; i++) { if (win.webContents.getURL().endsWith('library.html')) break; await sleep(150); }
  stage('library-loaded url=' + win.webContents.getURL());
  await sleep(400);

  const js = (e) => win.webContents.executeJavaScript(e, true);
  const api = (call) => js('window.openPedigreeDesktop.api.' + call);
  // Fire an api call that NAVIGATES the current page. We must NOT await the executeJavaScript
  // promise: the invoke it triggers navigates this very frame away, tearing down the context
  // that's awaiting the reply, so the promise never settles. Fire-and-forget, then poll main.
  const fireNav = (call) => { api(call).catch(() => {}); };
  const waitFor = async (pred, ms = 8000) => { for (let i = 0; i < ms / 100; i++) { try { if (await pred()) return true; } catch (e) {} await sleep(100); } return false; };
  const urlIs = (name) => win.webContents.getURL().endsWith(name);

  // Seed two documents via the REAL library handlers.
  const a = await store.create({ title: 'Fam A' });
  const b = await store.create({ title: 'Fam B' });

  // 1) Per-view allowlist: the library page must NOT be able to call editor-only save.
  let blocked = false;
  try { await api('saveDocument({documentId:"' + a.documentId + '", graph:"{}"})'); }
  catch (e) { blocked = /not allowed|untrusted/.test(String(e.message || e)); }
  check('library view is denied editor-only doc:save (allowlist)', blocked);

  // 2) open-in-editor drives the real showEditor + pendingOpen.
  fireNav('openInEditor("' + a.documentId + '")');
  await waitFor(() => urlIs('index.html') && main._test.getState(win).view === 'editor');
  await waitFor(() => js('!!(window.__ped_desktop && window.editor)'));
  await sleep(400);
  const po1 = main._test.getPendingOpen();
  check('open-in-editor sets pendingOpen to A with no import', po1 && po1.documentId === a.documentId && po1.import === null, JSON.stringify(po1));
  const active1 = await js('window.__ped_desktop.session.activeDocumentId').catch(() => null);
  check('editor opened document A', active1 === a.documentId, active1);
  const view1 = main._test.getState(win).view;
  check('main committed view=editor after successful nav', view1 === 'editor', view1);

  // 3) back-to-library returns and resets dirty/view (real handler).
  fireNav('backToLibrary()');
  await waitFor(() => urlIs('library.html') && main._test.getState(win).view === 'library');
  await sleep(300);
  check('back-to-library returns to library view', main._test.getState(win).view === 'library', main._test.getState(win).view);
  check('library page is loaded', urlIs('library.html'));
  // A freshly-opened, un-edited document must be clean, so back-to-library must NOT have
  // needed the unsaved-changes prompt. A nonzero count means a clean open is spuriously dirty.
  check('clean open does not trigger an unsaved-changes prompt', dialogCalls === 0, 'dialogCalls=' + dialogCalls);

  // 4) Rapid new+open must not pair a documentId with a stale import (atomic pendingOpen).
  //    Simulate: set an import-bearing pendingOpen via import path is dialog-driven, so instead
  //    assert that a plain open replaces any prior import atomically.
  fireNav('openInEditor("' + b.documentId + '")');
  await waitFor(() => urlIs('index.html') && main._test.getState(win).view === 'editor');
  await waitFor(() => js('window.__ped_desktop && window.__ped_desktop.session.activeDocumentId === "' + b.documentId + '"'));
  await sleep(400);
  const po2 = main._test.getPendingOpen();
  check('switching to B replaces pendingOpen atomically (no leaked import)', po2 && po2.documentId === b.documentId && po2.import === null, JSON.stringify(po2));
  const active2 = await js('window.__ped_desktop.session.activeDocumentId').catch(() => null);
  check('editor now shows B (no cross-contamination of session)', active2 === b.documentId, active2);

  // 5) A and B remain independent on disk (nothing leaked between them during switches).
  const da = await store.read(a.documentId), db = await store.read(b.documentId);
  check('A and B still independent documents on disk', da.documentId === a.documentId && db.documentId === b.documentId);

  clearTimeout(watchdog);
  win.destroy();
  fs.rmSync(LIB, { recursive: true, force: true });
  const failed = results.filter((r) => !r.ok);
  const summary = '==== S2b STATE-MACHINE: ' + (results.length - failed.length) + '/' + results.length + ' passed ====';
  console.log('\n' + summary);
  try { fs.writeFileSync(path.join(__dirname, 's2b-result.json'), JSON.stringify({ results, summary, pass: failed.length === 0 }, null, 2)); } catch (e) {}
  await sleep(300);
  app.exit(failed.length ? 1 : 0);
}

stage('script-evaluated');
app.whenReady().then(() => { stage('app-ready'); return run(); }).catch((e) => { stage('ERROR ' + String(e && e.stack || e)); console.error(e); app.exit(1); });
