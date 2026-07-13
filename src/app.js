import PedigreeEditor from './script/pedigree';
import PedigreeExport from './script/model/export';
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
    bootstrapDesktop(bridge);
  } else {
    editor = new PedigreeEditor();
  }
});

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
  document.observe('pedigree:save:complete', function() { show('✓ Saved', false); });
  document.observe('pedigree:save:failed',   function() { show('✕ Save failed', true); });
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
      editor.getSaveLoadEngine().createGraphFromImportData(imp.content, imp.importType, {}, false, true);
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
  box.insert(new Element('h2', { 'style': 'margin:0 0 10px;color:#912d2b;' }).update('Could not start Open Pedigree'));
  box.insert(new Element('p').update('The pedigree library could not be opened, so editing is disabled to avoid losing data.'));
  box.insert(new Element('pre', { 'style': 'white-space:pre-wrap;background:#f3f3f3;padding:8px;border-radius:4px;font-size:12px;' }).update(msg.escapeHTML ? msg.escapeHTML() : msg));
  var retry = new Element('button', { 'style': 'margin-top:12px;padding:8px 18px;cursor:pointer;' }).update('Retry');
  retry.observe('click', function() { window.location.reload(); });
  box.insert(retry);
  document.body.insert(box);
}
