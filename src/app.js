import PedigreeEditor from './script/pedigree';
import PedigreeExport from './script/model/export';
import PedigreeImport from './script/model/import';
import I18n from './script/i18n';
import { DesktopSession, createDesktopBackend, attachDirtyTracking } from './script/desktop/desktopBackend';

import '@fortawesome/fontawesome-free/js/fontawesome'
import '@fortawesome/fontawesome-free/js/solid'

import '../public/vendor/xwiki/xwiki-min.css';
import '../public/vendor/xwiki/fullScreen.css';
import '../public/vendor/xwiki/colibri.css';
import '../public/vendor/phenotips/Widgets.css';
import '../public/vendor/phenotips/DateTimePicker.css';
import '../public/vendor/phenotips/Skin.css';

var editor;

document.observe('dom:loaded',function() {
  var bridge = window.openPedigreeDesktop;
  if (bridge && bridge.isDesktop && bridge.api) {
    // The desktop shell (main + library page) owns the authoritative locale on disk; adopt
    // it before mounting so a switch made on the library page shows up here too. If it
    // differs from what this page last used, reconcile and reload once, then boot.
    syncDesktopLocaleThen(bridge, function() { bootstrapDesktop(bridge); });
  } else {
    editor = new PedigreeEditor();
    // Test seam: expose the exporter/importer so the e2e harness can assert on PED/SVG/GA4GH
    // output, and drive the parsers with hostile input, without going through the
    // Export/ImportSelector UI. The importer is exposed raw on purpose: saveLoadEngine wraps
    // every parse in a catch-all, which would hide the difference between "rejected the file"
    // and "crashed on it". Harmless in production.
    window.PedigreeExport = PedigreeExport;
    window.PedigreeImport = PedigreeImport;
    installLanguageSwitcher();
  }
});

// Reconcile the editor's locale with the desktop shell's on-disk choice. Reloads once if
// they differ (so all labels render in the shared locale), otherwise proceeds immediately.
function syncDesktopLocaleThen(bridge, proceed) {
  var api = bridge && bridge.api;
  if (!api || typeof api.getLocale !== 'function') { proceed(); return; }
  var settled = false;
  var go = function() { if (!settled) { settled = true; proceed(); } };
  try {
    var p = api.getLocale();
    if (!p || typeof p.then !== 'function') { go(); return; }
    p.then(function(loc) {
      if (!loc || loc === I18n.getLocale() || I18n.SUPPORTED.indexOf(loc) === -1) { go(); return; }
      // Reconcile to the shell's locale by reloading once. Guard only against a *loop on the
      // same target*: if we already tried to adopt this exact locale and it didn't stick
      // (e.g. localStorage can't persist), proceed without reloading again. A different
      // target later (e.g. switched on the library page) still reconciles normally.
      var lastTried = null;
      try { lastTried = window.sessionStorage.getItem('op_locale_sync_attempt'); } catch (e) {}
      if (lastTried === loc) { go(); return; }
      I18n.setLocaleNoReload(loc);
      try { window.sessionStorage.setItem('op_locale_sync_attempt', loc); } catch (e) {}
      if (!settled) { settled = true; try { window.location.reload(); } catch (e) { proceed(); } }
    }, go);
  } catch (e) { go(); }
}

// A small language switcher pinned to the top-right corner. Switching locale persists the
// choice and reloads (see i18n.setLocale) so every label + the node menu re-render. Added
// after the editor mounts because Workspace does $('body').update(...), which would wipe
// anything inserted earlier. No inline handlers (the CSP forbids inline scripts).
function installLanguageSwitcher() {
  if (document.getElementById('op-lang-switch')) { return; }
  var box = new Element('div', { 'id': 'op-lang-switch', 'style':
    'position:fixed;top:8px;right:10px;z-index:100001;font-family:sans-serif;font-size:12px;' +
    'background:rgba(255,255,255,.9);border:1px solid #ccc;border-radius:14px;padding:2px;' +
    'box-shadow:0 1px 4px rgba(0,0,0,.15);user-select:none;' });
  var current = I18n.getLocale();
  var options = [ { code: 'en', label: 'EN' }, { code: 'zh', label: '中文' } ];
  options.each(function(opt) {
    var active = (opt.code === current);
    var btn = new Element('span', { 'style':
      'display:inline-block;padding:3px 10px;border-radius:12px;cursor:pointer;' +
      (active ? 'background:#2e7d32;color:#fff;' : 'color:#333;') });
    btn.update(opt.label);
    if (!active) {
      btn.observe('click', function() { switchLocale(opt.code); });
    }
    box.insert(btn);
  });
  document.body.insert(box);
}

// Switch UI language. Desktop autosave is off and I18n.setLocale reloads the page, which
// would silently drop unsaved edits (the unsaved-changes guard only covers window-close and
// back-to-library). So in the desktop editor, if the session is dirty, save it FIRST and only
// switch on success; if the save fails, keep editing and don't reload (the red toast already
// reports it). A clean session — or the web build — switches immediately.
function switchLocale(code) {
  var desktop = null;
  try { desktop = window.__ped_desktop; } catch (e) {}
  if (desktop && typeof desktop.isDirty === 'function' && desktop.isDirty() && typeof desktop.saveNow === 'function') {
    desktop.saveNow().then(function() { I18n.setLocale(code); }, function() { /* save failed: stay put */ });
    return;
  }
  I18n.setLocale(code);
}

function bootstrapDesktop(bridge) {
  var db = createDesktopBackend(bridge);
  bridge.api.bootstrap().then(function(meta) {
    if (!meta || !meta.documentId) { throw new Error('no document could be opened or created'); }
    DesktopSession.activeDocumentId = meta.documentId;
    DesktopSession.activeTitle = meta.title;
    DesktopSession.pendingImport = meta.pendingImport || null;
    editor = new PedigreeEditor({
      backend: db.backend,
      desktop: true,
      autosave: false
    });
    attachDirtyTracking(bridge);
    installSaveToast();
    installLanguageSwitcher();
    bridge.api.onSaveAndClose(function() {
      return db.saveNow().then(function() {
        // Report whether an edit landed during the save so main can decide to proceed.
        return { stillDirty: DesktopSession.editRevision !== DesktopSession.savedRevision };
      });
    });
    if (meta.pendingImport) { runPendingImport(bridge, meta.documentId, meta.pendingImport); }
    // Read-only test seam: lets end-to-end tests observe dirty/session state.
    window.__ped_desktop = {
      session: DesktopSession,
      saveNow: db.saveNow,
      isDirty: function() { return DesktopSession.editRevision !== DesktopSession.savedRevision; },
      exportGA4GH: function() { return PedigreeExport.exportAsGA4GH(editor.getGraph().DG, 'all'); }
    };
  }, function(err) {
    // In the desktop shell a failed bootstrap means we have no place to save. Do NOT fall
    // back to a web editor that looks editable but silently discards work (Codex M1 #5).
    showFatalBootstrapError(err);
  });
}

// Small non-blocking toast so the user gets visible confirmation that a save landed (or
// failed) — the Save button otherwise gives no feedback at all.
function installSaveToast() {
  if (document.getElementById('desktop-toast')) { return; }
  var style = new Element('style').update(
    '#desktop-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%) translateY(24px);' +
    'z-index:100000;padding:10px 20px;border-radius:20px;font-family:sans-serif;font-size:14px;' +
    'color:#fff;background:#2e7d32;box-shadow:0 4px 14px rgba(0,0,0,.25);opacity:0;pointer-events:none;' +
    'transition:opacity .25s ease,transform .25s ease;}' +
    '#desktop-toast.show{opacity:1;transform:translateX(-50%) translateY(0);}' +
    '#desktop-toast.error{background:#c62828;}');
  document.body.insert(style);
  var toast = new Element('div', { 'id': 'desktop-toast' });
  document.body.insert(toast);
  var hideTimer = null;
  var show = function(msg, isError) {
    toast.update(msg);
    if (isError) { toast.addClassName('error'); } else { toast.removeClassName('error'); }
    toast.addClassName('show');
    if (hideTimer) { window.clearTimeout(hideTimer); }
    hideTimer = window.setTimeout(function() { toast.removeClassName('show'); }, isError ? 4000 : 1800);
  };
  document.observe('pedigree:save:complete', function() { show(I18n.t('✓ Saved'), false); });
  document.observe('pedigree:save:failed',   function() { show(I18n.t('✕ Save failed'), true); });
}

function runPendingImport(bridge, documentId, imp) {
  // Import the chosen file into the fresh document once the editor is laid out. Success is
  // reported by createGraphFromImportData itself: 'pedigree:load:finish' on success,
  // 'pedigree:import:fail' on error (it swallows parser errors internally). A node-count
  // heuristic was wrong for single-person imports — a fresh doc already has node 0, so a
  // valid one-individual import produced no growth and was trashed (Codex review #6).
  var attempts = 0;
  var tryImport = function() {
    if (!window.editor || !editor.getGraph) {
      if (attempts++ < 20) { setTimeout(tryImport, 150); return; }
    }
    DesktopSession.pendingImport = null;
    DesktopSession.suppressDirty = false;

    var finished = false;
    var onFinish, onFail;
    var finish = function(ok) {
      if (finished) { return; }
      finished = true;
      document.stopObserving('pedigree:load:finish', onFinish);
      document.stopObserving('pedigree:import:fail', onFail);
      try { bridge.api.importDone({ documentId: documentId, ok: ok, autoCreated: true }); } catch (e) {}
      if (!ok) {
        // Failed import: keep the session clean (nothing was applied) so an empty doc can't
        // be saved by accident; main will trash the auto-created doc and return to the library.
        DesktopSession.savedRevision = DesktopSession.editRevision;
        try { bridge.api.notifyDirty(false); } catch (e) {}
      }
    };
    onFinish = function() { finish(true); };
    onFail   = function() { finish(false); };
    document.observe('pedigree:load:finish', onFinish);
    document.observe('pedigree:import:fail', onFail);

    try {
      // Use the SAME defaults the in-editor ImportSelector applies, so importing a file via the
      // library matches importing it inside the editor: keep source IDs as external IDs, and treat
      // non-standard phenotype values as new disorders rather than silently dropping them.
      var importOptions = { markEvaluated: false, externalIdMark: true, acceptUnknownPhenotypes: true };
      editor.getSaveLoadEngine().createGraphFromImportData(imp.content, imp.importType, importOptions, false, true);
    } catch (e) { finish(false); }
    // The above fires its outcome event synchronously; this is just a safety net.
    if (!finished) { finish(false); }
  };
  setTimeout(tryImport, 250);
}

function showFatalBootstrapError(err) {
  var msg = (err && err.message) ? err.message : String(err);
  document.body.innerHTML = '';
  var box = new Element('div', { 'style':
    'max-width:560px;margin:12% auto;padding:28px 32px;font-family:sans-serif;color:#333;' +
    'border:1px solid #e0b4b4;background:#fff6f6;border-radius:8px;' });
  box.insert(new Element('h2', { 'style': 'margin:0 0 10px;color:#912d2b;' }).update(I18n.t('Could not start Open Pedigree')));
  box.insert(new Element('p').update(I18n.t('The pedigree library could not be opened, so editing is disabled to avoid losing data.')));
  box.insert(new Element('pre', { 'style': 'white-space:pre-wrap;background:#f3f3f3;padding:8px;border-radius:4px;font-size:12px;' }).update(msg.escapeHTML ? msg.escapeHTML() : msg));
  var retry = new Element('button', { 'style': 'margin-top:12px;padding:8px 18px;cursor:pointer;' }).update(I18n.t('Retry'));
  retry.observe('click', function() { window.location.reload(); });
  box.insert(retry);
  document.body.insert(box);
}
