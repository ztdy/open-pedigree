'use strict';

// Isolated-world bridge. The renderer (page main world, where Prototype.js lives)
// only ever sees `window.openPedigreeDesktop` — a fixed set of business methods.
// No fs, no arbitrary paths, no raw ipcRenderer. All args cross IPC as plain
// JSON/strings/ids; never functions, DOM nodes, or Prototype objects.

const { contextBridge, ipcRenderer } = require('electron');

let saveAndCloseListener = null;

const api = {
  bootstrap: () => ipcRenderer.invoke('app:bootstrap'),
  listDocuments: () => ipcRenderer.invoke('doc:list'),
  createDocument: (opts) => ipcRenderer.invoke('doc:create', opts || {}),
  openDocument: (documentId) => ipcRenderer.invoke('doc:open', String(documentId)),
  // payload: { documentId, title, graph (JSON string), svg (string) }
  saveDocument: (payload) => ipcRenderer.invoke('doc:save', {
    documentId: String(payload.documentId),
    title: payload.title != null ? String(payload.title) : undefined,
    graph: String(payload.graph),
    svg: payload.svg != null ? String(payload.svg) : undefined
  }),
  renameDocument: (documentId, title) => ipcRenderer.invoke('doc:rename', String(documentId), String(title)),
  setProject: (documentId, project) => ipcRenderer.invoke('doc:set-project', String(documentId), project == null ? '' : String(project)),
  copyDocument: (documentId) => ipcRenderer.invoke('doc:copy', String(documentId)),
  trashDocument: (documentId) => ipcRenderer.invoke('doc:trash', String(documentId)),

  // Library view-switching (M2) + import-as-new (M3).
  openInEditor: (documentId) => ipcRenderer.invoke('app:open-in-editor', String(documentId)),
  newInEditor: (opts) => ipcRenderer.invoke('app:new-in-editor', opts || {}),
  importAsNew: () => ipcRenderer.invoke('app:import-as-new'),
  backToLibrary: () => ipcRenderer.invoke('app:back-to-library'),
  // Renderer reports how a pending auto-import turned out (clears main's pending state).
  importDone: (info) => ipcRenderer.invoke('app:import-done', {
    documentId: String(info.documentId), ok: !!info.ok, autoCreated: !!info.autoCreated }),

  // Fire-and-forget dirty signal to main (drives the close-confirmation dialog).
  notifyDirty: (dirty) => ipcRenderer.send('doc:dirty', !!dirty),

  // UI locale sync. The editor (renderer) persists locale to the desktop shell via
  // setLocale so main-process dialogs + library.html agree. getI18n returns
  // { locale, messages } for pages (library.html) to translate locally.
  getLocale: () => ipcRenderer.invoke('app:get-locale'),
  setLocale: (locale) => ipcRenderer.invoke('app:set-locale', String(locale)),
  getI18n: () => ipcRenderer.invoke('app:get-i18n'),

  // Register a handler main calls when the user picks "Save" on the close dialog.
  // The handler must return a Promise; we relay success/failure back to main, echoing
  // the requestId so main can correlate the ack (Codex M1 review #1/#10/#11). Only this
  // module's own listener is swapped — no global removeAllListeners side effect.
  onSaveAndClose: (handler) => {
    if (saveAndCloseListener) ipcRenderer.removeListener('doc:save-and-close', saveAndCloseListener);
    saveAndCloseListener = async (_event, msg) => {
      const requestId = msg && msg.requestId;
      let payload = { ok: true, requestId: requestId };
      try {
        const res = await handler();
        // handler may report whether the doc is still dirty after saving.
        payload.clean = !(res && res.stillDirty);
      } catch (e) { payload = { ok: false, error: String(e && e.message || e), requestId: requestId }; }
      ipcRenderer.send('doc:save-ack', payload);
    };
    ipcRenderer.on('doc:save-and-close', saveAndCloseListener);
  }
};

contextBridge.exposeInMainWorld('openPedigreeDesktop', {
  isDesktop: true,
  platform: process.platform,
  api
});
