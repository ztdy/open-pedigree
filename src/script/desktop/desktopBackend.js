/**
 * Desktop backend: bridges the editor's SaveLoadEngine to the Electron main process
 * via the preload contextBridge (window.openPedigreeDesktop.api). Replaces the default
 * XWiki REST save/load. See DESKTOP_PLAN.md §M1.
 *
 * The session holds a mutable activeDocumentId (the plan's DocumentSession) so the app
 * can switch pedigrees at runtime — unlike the original closed-over patientDataUrl.
 *
 * Dirty tracking uses a monotonic edit revision rather than a boolean, so an edit made
 * WHILE a save is in flight is never lost: the save only clears "dirty" if the revision
 * it captured at dispatch still matches the current one (Codex M1 review, high-sev #2).
 */

import I18n from 'pedigree/i18n';

var DesktopSession = {
  activeDocumentId: null,
  activeTitle: null,
  // Monotonic counters. dirty := editRevision !== savedRevision.
  editRevision: 0,
  savedRevision: 0,
  // While true, graph-change events are NOT treated as user edits. Brackets the initial
  // bootstrap load so opening a saved pedigree does not mark it dirty.
  suppressDirty: true,
  // { importType, content } when this session was opened to import a file as a new pedigree.
  pendingImport: null,
  _lastSave: null
};

function isDirty() {
  return DesktopSession.editRevision !== DesktopSession.savedRevision;
}

function createDesktopBackend(bridge) {
  var api = bridge.api;

  function notify() {
    try { api.notifyDirty(isDirty()); } catch (e) {}
  }

  var backend = {
    // args: { patientDataUrl, jsonData, setSaveInProgress, svgData }
    save: function(args) {
      if (!DesktopSession.activeDocumentId) {
        DesktopSession._lastSave = Promise.resolve();
        return DesktopSession._lastSave;
      }
      // Snapshot the revision this save corresponds to.
      var savingRevision = DesktopSession.editRevision;
      var promise = api.saveDocument({
        documentId: DesktopSession.activeDocumentId,
        title: DesktopSession.activeTitle,
        graph: args.jsonData,
        svg: args.svgData
      }).then(function(meta) {
        if (meta && meta.title != null) DesktopSession.activeTitle = meta.title;
        // Only advance savedRevision to what we actually persisted. If the user edited
        // during the save (editRevision moved past savingRevision), the doc stays dirty.
        if (savingRevision > DesktopSession.savedRevision) {
          DesktopSession.savedRevision = savingRevision;
        }
        notify();
        document.fire('pedigree:save:complete');
        return meta;
      }, function(err) {
        // Surface the failure via the non-blocking red toast (installSaveToast) rather than
        // a blocking alert. Keep the details on the console for diagnostics.
        try { console.warn('save failed'); } catch (e) {}
        document.fire('pedigree:save:failed');
        throw err;
      });
      DesktopSession._lastSave = promise;
      return promise;
    },

    // args: { patientDataUrl, onSuccess, onFailure }
    load: function(args) {
      var finishBootstrap = function() {
        // Let load-driven change events flush, then re-enable dirty tracking and mark clean.
        setTimeout(function() {
          DesktopSession.suppressDirty = false;
          DesktopSession.savedRevision = DesktopSession.editRevision;
          notify();
        }, 0);
      };
      // This session was opened to import a file into a fresh doc: skip the normal load and
      // the template picker; app.js runs the import after construction. Keep suppressDirty
      // true until then so only the import (not startup) marks the doc dirty.
      if (DesktopSession.pendingImport) {
        DesktopSession.savedRevision = DesktopSession.editRevision; // clean empty baseline
        return;
      }
      if (!DesktopSession.activeDocumentId) {
        try { args.onFailure(); } finally { finishBootstrap(); }
        return;
      }
      api.openDocument(DesktopSession.activeDocumentId).then(function(doc) {
        if (doc && doc.title != null) DesktopSession.activeTitle = doc.title;
        // onSuccess -> versionUpdater can throw on a malformed-but-valid-JSON graph.
        // Guard it so suppressDirty is always released (Codex M1 review, high-sev #4),
        // and surface the failure instead of pretending a clean, editable document.
        try {
          if (doc && typeof doc.graph === 'string' && doc.graph.trim()) {
            args.onSuccess(doc.graph);
          } else {
            args.onFailure();
          }
        } catch (e) {
          try { document.fire('pedigree:load:finish'); } catch (e2) {}
          alert(I18n.t('This pedigree could not be opened (its data may be from an incompatible '
            + 'version or corrupted): ') + (e && e.message ? e.message : e));
        } finally {
          finishBootstrap();
        }
      }, function(err) {
        try { args.onFailure(); } finally {
          finishBootstrap();
          alert(I18n.t('Could not load pedigree: ') + (err && err.message ? err.message : err));
        }
      });
    }
  };

  function saveNow() {
    if (!window.editor) return Promise.resolve();
    window.editor.getSaveLoadEngine().save();
    return DesktopSession._lastSave || Promise.resolve();
  }

  return { backend: backend, saveNow: saveNow, session: DesktopSession };
}

// Direct user-edit events (mirrors the autosave trigger list).
var DIRTY_EVENTS = [
  'pedigree:graph:clear',
  'pedigree:undo',
  'pedigree:redo',
  'pedigree:node:remove',
  'pedigree:node:setproperty',
  'pedigree:node:modify',
  'pedigree:person:drag:newparent',
  'pedigree:person:drag:newpartner',
  'pedigree:person:drag:newsibling',
  'pedigree:person:newparent',
  'pedigree:person:newsibling',
  'pedigree:person:newpartnerandchild',
  'pedigree:partnership:newchild',
  'pedigree:legend:color-changed'
];

/**
 * Start marking the session dirty on user edits and notifying main.
 * Also treats a post-bootstrap graph replacement (import / template selection, which fire
 * pedigree:load:finish but none of the granular edit events) as a user edit — otherwise
 * "import then close" would silently drop the import (Codex M1 review, high-sev #3).
 */
function attachDirtyTracking(bridge) {
  var api = bridge.api;
  var markDirty = function() {
    if (DesktopSession.suppressDirty) return;
    DesktopSession.editRevision++;           // advance even if already dirty
    try { api.notifyDirty(true); } catch (e) {}
  };
  DIRTY_EVENTS.forEach(function(evt) {
    document.observe(evt, markDirty);
  });
  // Import / template replace. During bootstrap suppressDirty is true, so the initial
  // disk load does not count; any later replacement does.
  document.observe('pedigree:load:finish', markDirty);
}

export { DesktopSession, createDesktopBackend, attachDirtyTracking };
