'use strict';

const path = require('path');
const fsp = require('fs').promises;
const os = require('os');

// The offline manual ships INSIDE the app at renderer/user-guide.html (built from
// docs/USER_GUIDE.md by build-guide.js), so it works with no network and never 404s.
const GUIDE_HTML = path.join(__dirname, 'renderer', 'user-guide.html');

// Fallback for when the EMBEDDED guide window can't render the page. The manual is a single
// image-heavy (~1.9 MB, 24 inline images) document, and on some GPUs the sandboxed on-screen
// renderer's GPU process crashes while compositing it — loadFile then rejects and the window
// is blank. Rather than dead-end on a scary "reinstall" box, copy the very same offline HTML
// to a temp file and hand it to the OS browser, which renders it reliably (and offline).
//
// GUIDE_HTML may live inside app.asar — a virtual path the OS browser cannot open — so we copy
// it out first (fs reads transparently from asar). Returns { ok, path, error }.
async function openGuideExternally(shell) {
  try {
    const tmp = path.join(os.tmpdir(), 'open-pedigree-user-guide.html');
    await fsp.writeFile(tmp, await fsp.readFile(GUIDE_HTML));
    const error = await shell.openPath(tmp); // '' on success, a message on failure
    return { ok: !error, path: tmp, error: error || null };
  } catch (e) {
    return { ok: false, path: null, error: String((e && e.message) || e) };
  }
}

module.exports = { GUIDE_HTML, openGuideExternally };
