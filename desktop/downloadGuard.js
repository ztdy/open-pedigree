'use strict';

// Export (PED/SVG/PDF/GA4GH) goes through the renderer's FileSaver, which surfaces here as a
// Chromium download. FileSaver fires its own "success" synchronously and never learns the real
// write result, so a failed OVERWRITE (target locked/read-only, disk full, permission denied)
// would otherwise be swallowed silently — the user thinks the file was replaced when it wasn't.
//
// This main-process hook on the session's download 'done' event is the only place that sees the
// real outcome. 'completed' = fine; 'cancelled' = the user dismissed the Save dialog (no warning);
// 'interrupted' = the write actually failed → warn, and make clear the original file is intact.
function attachDownloadFailureGuard(session, getWindow, dialog, t) {
  const tr = typeof t === 'function' ? t : (s) => s;
  session.on('will-download', (event, item) => {
    item.once('done', (e, state) => {
      if (state !== 'interrupted') { return; }
      const win = typeof getWindow === 'function' ? getWindow() : getWindow;
      let target = '';
      try { target = item.getSavePath() || item.getFilename() || ''; } catch (err) { /* item gone */ }
      Promise.resolve(dialog.showMessageBox(win || undefined, {
        type: 'error',
        title: tr('Export failed'),
        message: tr('The file could not be saved.'),
        detail: (target ? target + '\n\n' : '') +
          tr('The original file was not changed. It may be open in another program, read-only, or the disk may be full. Try a different name or location.'),
        buttons: [tr('OK')],
        defaultId: 0
      })).catch(() => {});
    });
  });
}

module.exports = { attachDownloadFailureGuard };
