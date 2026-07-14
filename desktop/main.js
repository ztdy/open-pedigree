'use strict';

const { app, BrowserWindow, shell, ipcMain, dialog, Menu, protocol } = require('electron');
const path = require('path');
const fsp = require('fs').promises;
const { DocumentStore } = require('./documentStore');
const { detectImportType } = require('./importDetect');
const { resolveLibraryDir } = require('./libraryConfig');
const offlineData = require('./offlineData');
const { initAutoUpdate } = require('./updater');
const i18n = require('./i18n');
const t = (k) => i18n.t(k);

const MAX_IMPORT_BYTES = 8 * 1024 * 1024; // reject absurdly large import files

// Hardened shell for the legacy renderer. See DESKTOP_PLAN.md §3–4.
// contextIsolation on, nodeIntegration off, sandbox on. All filesystem access lives
// here in main; the renderer only ever sees the narrow contextBridge API from preload.

const RENDERER_DIR = path.join(__dirname, 'renderer');
const INDEX_HTML = path.join(RENDERER_DIR, 'index.html'); // editor (webpack bundle)
const LIBRARY_HTML = path.join(__dirname, 'library.html'); // file-manager landing page

// Managed library location. Resolved at startup by libraryConfig.resolveLibraryDir:
// OPEN_PEDIGREE_LIBRARY env > a saved first-run choice > a one-time picker (portable
// builds default next to the .exe so data travels with the app). Assigned in whenReady.
let LIBRARY_DIR = null;

let store = null;
let mainWindow = null;
let saveReqSeq = 0;
// The editor's next load target, as ONE atomic object so a documentId can never be paired
// with a stale import (Codex M2/M3 review #3/#4). `import` stays set until the renderer
// reports back via app:import-done, so a reload/crash before the import runs can recover it.
let pendingOpen = null;      // { documentId, import: { importType, content } | null }
let navigating = false;      // serialises view transitions

function pathToFileURL(p) {
  return require('url').pathToFileURL(p).toString();
}

// Confirm a directory can actually be created AND written to. A saved/env library path that
// now points at a removed USB drive or a read-only/nonexistent location must be detected
// HERE (with a fallback) rather than blowing up DocumentStore's mkdirSync during whenReady
// and leaving the user with no window (Codex review #5).
function ensureUsableDir(dir) {
  const fs = require('fs');
  fs.mkdirSync(dir, { recursive: true });
  const probe = path.join(dir, '.op-write-probe-' + process.pid);
  fs.writeFileSync(probe, '');
  fs.unlinkSync(probe);
}

// Offline autocomplete transport. The legacy Suggest widget (gene + HPO pickers) does an
// XHR to whatever `script` URL it's given; in the desktop build we point those at
// opdata:// so they resolve against the bundled HGNC/HPO datasets with zero network.
// Registering the scheme as privileged (standard + fetch/CORS enabled) lets file:// pages
// XHR it. Must run before app 'ready'.
function registerOfflineDataProtocol() {
  protocol.handle('opdata', async (request) => {
    try {
      const u = new URL(request.url);
      const kind = u.hostname; // 'genes' | 'hpo'
      const q = u.searchParams.get('q') || '';
      let payload;
      if (kind === 'genes') payload = await offlineData.searchGenes(q);
      else if (kind === 'hpo') payload = await offlineData.searchHpo(q);
      // No OMIM database is bundled (licensing); serve an empty result so the disorders
      // picker degrades to free-text offline instead of firing failing XHRs + alert() spam.
      else if (kind === 'disorders') payload = { rows: [] };
      // Serve the bundled CJK font so PDF export can embed Chinese glyphs offline.
      else if (kind === 'fonts') {
        const map = { sc: 'NotoSansSC-Regular.otf' };
        const key = u.pathname.replace(/^\/+/, '') || 'sc';
        const fname = map[key] || map.sc;
        const buf = await fsp.readFile(path.join(__dirname, 'fonts', fname));
        return new Response(buf, {
          status: 200,
          headers: { 'Content-Type': 'font/otf', 'Access-Control-Allow-Origin': '*' }
        });
      }
      else return new Response('unknown dataset', { status: 404 });
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e && e.message || e) }),
        { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  });
}

// loadFile can transiently abort (observed on WSL when switching views quickly). Retry a
// few times so a flaky load doesn't leave a blank window.
async function loadFileWithRetry(win, file, attempts) {
  attempts = attempts || 3;
  for (let i = 0; i < attempts; i++) {
    try { await win.loadFile(file); return; }
    catch (e) {
      if (i === attempts - 1 || win.isDestroyed()) throw e;
      await new Promise((r) => setTimeout(r, 300));
    }
  }
}

// The two pages the renderer is ever allowed to occupy.
const EDITOR_URL = pathToFileURL(INDEX_HTML);
const LIBRARY_URL = pathToFileURL(LIBRARY_HTML);
const ALLOWED_URLS = [EDITOR_URL, LIBRARY_URL];

// Per-window save/close coordination state.
const winState = new WeakMap(); // BrowserWindow -> { dirty, forceClose, closing, view }

function createWindow() {
  // Drop the default Electron menu bar (File/Edit/View/Window) — it exposes nothing useful
  // for this app and just clutters the window. All actions live in the in-page UI.
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    backgroundColor: '#ffffff',
    title: 'Open Pedigree',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });
  mainWindow = win;
  winState.set(win, { dirty: false, forceClose: false, closing: false, view: 'library' });

  loadFileWithRetry(win, LIBRARY_HTML); // app opens on the file-manager landing page
  win.once('ready-to-show', () => win.show());

  // Lock the renderer to the two packaged pages. Any other navigation (including other
  // file:// targets on local/network shares) is refused so it can never inherit the
  // preload's document API. https: links open in the OS browser (Codex M1 review, #6).
  win.webContents.on('will-navigate', (event, url) => {
    if (ALLOWED_URLS.indexOf(url) !== -1) return;
    event.preventDefault();
    if (/^https?:/i.test(url)) shell.openExternal(url).catch(() => {});
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });

  // Unsaved-changes guard on window close.
  win.on('close', (event) => {
    const st = winState.get(win);
    if (!st || st.forceClose || !st.dirty) return;
    event.preventDefault();
    if (st.closing) return;      // a confirmation flow is already running
    st.closing = true;
    handleCloseWithUnsaved(win)
      .catch((e) => { console.error('close handler failed', e); })
      .then(() => { const s = winState.get(win); if (s) s.closing = false; });
  });

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });
  return win;
}

// Prompt about unsaved changes, then run `onProceed` unless the user cancels.
// Returns true if it proceeded, false if cancelled. Shared by window-close and
// the in-app "back to library" view switch so both honour unsaved edits.
async function confirmUnsavedThen(win, onProceed) {
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: [t('Save'), t("Don't Save"), t('Cancel')],
    defaultId: 0,
    cancelId: 2,
    message: t('This pedigree has unsaved changes.'),
    detail: t('Do you want to save first?')
  });
  if (response === 2) return false; // Cancel
  if (response === 0) { // Save
    try {
      // Save, then verify the doc is actually clean — an edit landing during the async
      // write leaves it dirty; save once more before proceeding (Codex #1). Bounded retry.
      let clean = false;
      for (let attempt = 0; attempt < 3 && !clean; attempt++) {
        const res = await requestRendererSave(win);
        clean = res.clean;
      }
      if (!clean) {
        const { response: r3 } = await dialog.showMessageBox(win, {
          type: 'warning',
          buttons: [t('Proceed anyway'), t('Cancel')],
          defaultId: 1,
          cancelId: 1,
          message: t('Still has unsaved changes.'),
          detail: t('Edits kept arriving while saving. Proceed and discard the latest, or cancel?')
        });
        if (r3 === 1) return false; // Cancel
      }
    } catch (e) {
      const { response: r2 } = await dialog.showMessageBox(win, {
        type: 'error',
        buttons: [t('Proceed anyway'), t('Cancel')],
        defaultId: 1,
        cancelId: 1,
        message: t('Saving failed.'),
        detail: String(e && e.message || e)
      });
      if (r2 === 1) return false; // Cancel
    }
  }
  await onProceed();
  return true;
}

function handleCloseWithUnsaved(win) {
  const st = winState.get(win);
  return confirmUnsavedThen(win, async () => { st.forceClose = true; win.close(); });
}

// Commit view/dirty state ONLY after the navigation actually succeeds, so a failed load
// can't leave main believing a still-dirty editor is a clean library (Codex #9). Restores
// prior state and surfaces the failure if the load ultimately fails.
async function navigateTo(win, file, view) {
  const st = winState.get(win);
  const prev = st ? { view: st.view, dirty: st.dirty } : null;
  try {
    await loadFileWithRetry(win, file);
    if (st) { st.view = view; if (view === 'library') st.dirty = false; }
  } catch (e) {
    if (st && prev) { st.view = prev.view; st.dirty = prev.dirty; }
    throw e;
  }
}

// Switch the window from the editor back to the library landing page.
function showLibrary(win) { return navigateTo(win, LIBRARY_HTML, 'library'); }

// Switch the window to the editor for a document, optionally auto-importing a file.
async function showEditor(win, documentId, importData) {
  if (navigating) return; // ignore rapid re-entrant switches
  navigating = true;
  pendingOpen = { documentId: String(documentId), import: importData || null };
  try {
    await navigateTo(win, INDEX_HTML, 'editor');
  } finally {
    navigating = false;
  }
}

// Ask the renderer to run a save and resolve when it acknowledges (or reject on timeout).
// Correlates by a unique requestId AND verifies the ack came from this window's frame —
// never trusts a renderer-supplied window id (Codex M1 review, high-sev #1 / #10).
function requestRendererSave(win) {
  const requestId = 'save-' + (++saveReqSeq);
  return new Promise((resolve, reject) => {
    const cleanup = () => { ipcMain.removeListener('doc:save-ack', onAck); clearTimeout(timer); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('save timed out')); }, 15000);
    const onAck = (event, payload) => {
      if (event.sender !== win.webContents) return;      // must originate from this window
      if (!payload || payload.requestId !== requestId) return;
      cleanup();
      if (payload.ok) resolve({ clean: payload.clean !== false });
      else reject(new Error(payload.error || 'save failed'));
    };
    ipcMain.on('doc:save-ack', onAck);
    win.webContents.send('doc:save-and-close', { requestId });
  });
}

// Only accept IPC from a real app window sitting on one of our two pages.
function senderIsTrusted(event) {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || !winState.has(win)) return false;
  const url = event.sender.getURL();
  return ALLOWED_URLS.indexOf(url) !== -1 || url === '' /* during initial load */;
}

// Which IPC channels each page is allowed to call (Codex #8). The editor cannot touch
// library management (trash/rename/…) and the library cannot drive save/dirty.
const LIBRARY_CHANNELS = new Set(['doc:list', 'doc:create', 'doc:rename', 'doc:copy', 'doc:trash',
  'doc:set-project', 'app:open-in-editor', 'app:new-in-editor', 'app:import-as-new']);
const EDITOR_CHANNELS = new Set(['app:bootstrap', 'doc:open', 'doc:save', 'app:back-to-library', 'app:import-done']);
// Locale channels are read/written by both pages (the editor persists the user's choice;
// the library reads it to translate itself), so they're allowed from any trusted view.
const UTIL_CHANNELS = new Set(['app:get-locale', 'app:set-locale', 'app:get-i18n']);

function viewFor(event) {
  const url = event.sender.getURL();
  if (url === LIBRARY_URL) return 'library';
  if (url === EDITOR_URL) return 'editor';
  if (url === '') return 'loading';
  return null;
}

function registerIpc() {
  const handle = (channel, fn) => ipcMain.handle(channel, (event, ...args) => {
    if (!senderIsTrusted(event)) throw new Error('ipc: untrusted sender for ' + channel);
    const view = viewFor(event);
    const allowed = (view === 'library' && LIBRARY_CHANNELS.has(channel))
      || (view === 'editor' && EDITOR_CHANNELS.has(channel))
      || (view === 'loading' && (channel === 'app:bootstrap' || UTIL_CHANNELS.has(channel))) // fire during initial load
      || UTIL_CHANNELS.has(channel); // locale sync from either page
    if (!allowed) throw new Error('ipc: channel ' + channel + ' not allowed from ' + view + ' view');
    return fn(...args);
  });

  handle('doc:list', () => store.list());
  handle('doc:create', (opts) => store.create(opts || {}));
  handle('doc:open', (id) => store.read(id));
  handle('doc:save', (payload) => store.save(payload || {}));
  handle('doc:rename', (id, title) => store.rename(id, title));
  handle('doc:copy', (id) => store.copy(id));
  handle('doc:trash', (id) => store.trash(id));
  handle('doc:set-project', (id, project) => store.setProject(id, project));

  // Bootstrap: which document the editor should open, plus any file to auto-import. The
  // import is NOT cleared here — it stays in pendingOpen until the renderer confirms via
  // app:import-done, so a reload/crash before the import runs can recover it (Codex #3).
  handle('app:bootstrap', async () => {
    if (pendingOpen && pendingOpen.documentId) {
      const meta = (await store.list()).find((d) => d.documentId === pendingOpen.documentId && !d.corrupt);
      if (meta) return Object.assign({}, meta, { pendingImport: pendingOpen.import || null });
    }
    // Bare launch / reload with no target: most-recent or a fresh doc, no import.
    const docs = await store.list();
    const usable = docs.find((d) => !d.corrupt);
    const meta = usable || (await store.create({ title: t('Untitled pedigree') }));
    pendingOpen = { documentId: meta.documentId, import: null };
    return Object.assign({}, meta, { pendingImport: null });
  });

  // --- library view-switching (M2) --- each awaits the navigation before resolving.
  handle('app:open-in-editor', async (id) => {
    if (mainWindow) await showEditor(mainWindow, String(id), null);
    return { ok: true };
  });
  handle('app:new-in-editor', async (opts) => {
    const meta = await store.create(opts || {});
    if (mainWindow) await showEditor(mainWindow, meta.documentId, null);
    return meta;
  });
  // Import a file AS A NEW pedigree: pick -> read (with encoding guards) -> detect format
  // -> new doc -> open editor which auto-imports. Parse happens in the editor bundle.
  handle('app:import-as-new', async () => {
    const win = mainWindow;
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: t('Import pedigree as a new document'),
      properties: ['openFile'],
      filters: [
        { name: t('Pedigree files'), extensions: ['ped', 'txt', 'linkage', 'ged', 'gedcom', 'boadicea', 'bd', 'json', 'fhir'] },
        { name: t('All files'), extensions: ['*'] }
      ]
    });
    if (canceled || !filePaths || !filePaths.length) return { canceled: true };
    const file = filePaths[0];
    const stat = await fsp.stat(file);
    if (stat.size > MAX_IMPORT_BYTES) {
      await dialog.showMessageBox(win, { type: 'error', message: t('File too large'),
        detail: t('This file is ') + Math.round(stat.size / 1048576) + t(' MB; the limit is 8 MB.') });
      return { canceled: true, error: 'too large' };
    }
    let content;
    try {
      content = decodeTextFile(await fsp.readFile(file));
    } catch (e) {
      await dialog.showMessageBox(win, { type: 'error', message: t('Could not read file'),
        detail: String(e && e.message || e) });
      return { canceled: true, error: 'decode' };
    }
    const importType = detectImportType(file, content);
    const base = path.basename(file).replace(/\.[^.]+$/, '');
    const meta = await store.create({ title: base || t('Imported pedigree') });
    if (win) await showEditor(win, meta.documentId, { importType: importType, content: content });
    return { ok: true, meta: meta, importType: importType };
  });
  // Renderer reports the outcome of a pending import. Clears it so it isn't replayed; on
  // failure, trashes the empty doc that was auto-created for it (Codex #2/#3).
  handle('app:import-done', async (payload) => {
    payload = payload || {};
    if (pendingOpen && pendingOpen.documentId === payload.documentId) {
      pendingOpen = { documentId: pendingOpen.documentId, import: null };
    }
    if (payload.ok === false && payload.autoCreated && isValidUuid(payload.documentId)) {
      try { await store.trash(payload.documentId); } catch (e) { /* best effort */ }
      if (mainWindow) await showLibrary(mainWindow);
    }
    return { ok: true };
  });
  handle('app:back-to-library', async () => {
    const win = mainWindow;
    const st = win && winState.get(win);
    if (st && st.dirty) await confirmUnsavedThen(win, () => showLibrary(win));
    else if (win) await showLibrary(win);
    return { ok: true };
  });

  // --- UI locale sync --- persisted to a single on-disk file (desktop/i18n.js) so main
  // dialogs, the library page and the editor all agree. The editor writes it on switch;
  // the library reads {locale, messages} to translate itself locally.
  handle('app:get-locale', () => i18n.getLocale());
  handle('app:set-locale', (locale) => { var persisted = i18n.setLocale(locale); return { ok: persisted, persisted: persisted, locale: i18n.getLocale() }; });
  handle('app:get-i18n', () => ({ locale: i18n.getLocale(), messages: i18n.messages() }));

  // One-way dirty updates from renderer -> main (drives close confirmation).
  ipcMain.on('doc:dirty', (e, dirty) => {
    if (!senderIsTrusted(e) || viewFor(e) !== 'editor') return;
    const win = BrowserWindow.fromWebContents(e.sender);
    const st = win && winState.get(win);
    if (st) st.dirty = !!dirty;
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidUuid(id) { return typeof id === 'string' && UUID_RE.test(id); }

// Decode an imported file to text with basic safety: honour UTF-8/UTF-16 BOMs, and reject
// binary (NUL bytes) rather than let a bogus PED parse silently (Codex #6).
function decodeTextFile(buf) {
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) buf = buf.slice(3);
  else if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) return buf.slice(2).toString('utf16le');
  else if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) {
    const swapped = Buffer.from(buf.slice(2)); swapped.swap16(); return swapped.toString('utf16le');
  }
  if (buf.includes(0x00)) throw new Error('file looks binary (contains NUL bytes)');
  return buf.toString('utf8');
}

// Only take over the app lifecycle when run as the real entry point (electron main.js).
// When required by a test we just expose the state machine so it can be driven directly.
if (require.main === module) {
  // Privileged custom scheme for offline autocomplete — MUST be registered before ready.
  protocol.registerSchemesAsPrivileged([{
    scheme: 'opdata',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, bypassCSP: true }
  }]);

  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
  } else {
    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });

    app.whenReady().then(async () => {
      i18n.init(app); // locale for all main-process dialogs + library.html
      // Resolve where the library lives (first-run picker / saved choice / portable default)
      // BEFORE constructing the store, which creates the directory.
      let resolvedDir = null;
      try {
        const resolved = await resolveLibraryDir({ app, dialog });
        resolvedDir = resolved.dir;
      } catch (e) {
        console.error('library location resolve failed', e);
      }
      const fallbackDir = path.join(app.getPath('userData'), 'pedigrees');
      // Try the resolved location, then the OS default. Each must be creatable AND writable;
      // if the saved one fails (removed USB / read-only), fall back and tell the user.
      for (const dir of [resolvedDir, fallbackDir]) {
        if (!dir) continue;
        try {
          ensureUsableDir(dir);
          store = new DocumentStore(dir);
          LIBRARY_DIR = dir;
          if (resolvedDir && dir !== resolvedDir) {
            dialog.showMessageBox({
              type: 'warning',
              message: t('Could not use your saved data folder'),
              detail: t('This location was unavailable (removed drive or no write access):\n\n')
                + resolvedDir + t('\n\nUsing the default folder instead:\n\n') + dir
            }).catch(() => {});
          }
          break;
        } catch (e) {
          console.error('library dir unusable: ' + dir, e);
        }
      }
      if (!store) {
        dialog.showErrorBox(t('Open Pedigree'),
          t('Could not create or write to any data folder, so the app cannot start.\n\nCheck folder permissions or set OPEN_PEDIGREE_LIBRARY to a writable path.'));
        app.quit();
        return;
      }
      registerOfflineDataProtocol();
      registerIpc();
      createWindow();
      // Check for updates a few seconds after launch so it never delays the first paint.
      // No-op in dev / when unpackaged; silent on "no update" and network errors.
      setTimeout(() => {
        try { initAutoUpdate(() => BrowserWindow.getAllWindows()[0] || null); }
        catch (e) { /* auto-update must never break startup */ }
      }, 4000);
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  }

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

// Test seam: lets a test running under Electron drive the REAL handlers/state machine
// (Codex M2/M3 review — S2 must exercise the actual main.js, not a re-implementation).
module.exports = {
  _test: {
    init(libraryDir) { store = new DocumentStore(libraryDir); registerIpc(); return store; },
    createWindow,
    getWindow: () => mainWindow,
    getPendingOpen: () => pendingOpen,
    getState: (win) => winState.get(win),
    isNavigating: () => navigating
  }
};
