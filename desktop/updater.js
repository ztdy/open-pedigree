'use strict';
// Auto-update for the packaged Windows app.
//
// Feed = the PUBLIC open-source repo (ztdy/open-pedigree) Releases, which is where end
// users get the app, so updates need no token. This is deliberately decoupled from the
// CI publish target (the private ztdy/pedigree repo): binaries are built and published
// there, then promoted to the public release together with their latest.yml
// (scripts/promote-exe-to-oss.sh), and clients check the public release for updates.
//
// NSIS install  -> full flow: download in the background, then offer to restart+install.
// Portable build -> electron-updater cannot replace a running portable .exe, so we only
//                   check and, if a newer version exists, point the user at the download.

const { app, dialog, shell } = require('electron');
const i18n = require('./i18n');
const t = (k) => i18n.t(k);

const FEED = { provider: 'github', owner: 'ztdy', repo: 'open-pedigree' };
const RELEASES_URL = 'https://github.com/ztdy/open-pedigree/releases/latest';

// electron-builder marks portable builds with this env var at runtime.
function isPortable() {
  return !!process.env.PORTABLE_EXECUTABLE_DIR;
}

// Parse a full x.y.z[-pre][+build] version. END-ANCHORED so trailing junk
// ("0.2.1garbage") and truncated input ("0.2") are rejected rather than silently
// accepted. Build metadata is ignored per SemVer. Returns null if not a valid version.
function parseSemver(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(v || '').trim());
  if (!m) { return null; }
  return { core: [+m[1], +m[2], +m[3]], pre: m[4] ? m[4].split('.') : [] };
}

// Minimal SemVer precedence (enough for our x.y.z / x.y.z-pre tags). Returns
// -1/0/1 for a<b / a==b / a>b. Build metadata (+...) is ignored; a prerelease
// sorts BELOW its release; unparseable input sorts lowest.
function semverCompare(a, b) {
  const pa = parseSemver(a), pb = parseSemver(b);
  if (!pa && !pb) { return 0; }
  if (!pa) { return -1; }
  if (!pb) { return 1; }
  for (let i = 0; i < 3; i++) {
    if (pa.core[i] !== pb.core[i]) { return pa.core[i] < pb.core[i] ? -1 : 1; }
  }
  // Equal core: no prerelease outranks a prerelease.
  if (!pa.pre.length && pb.pre.length) { return 1; }
  if (pa.pre.length && !pb.pre.length) { return -1; }
  const n = Math.max(pa.pre.length, pb.pre.length);
  for (let i = 0; i < n; i++) {
    const x = pa.pre[i], y = pb.pre[i];
    if (x === undefined) { return -1; }
    if (y === undefined) { return 1; }
    if (x === y) { continue; }
    const xn = /^\d+$/.test(x), yn = /^\d+$/.test(y);
    if (xn && yn) { return +x < +y ? -1 : 1; }
    if (xn !== yn) { return xn ? -1 : 1; } // numeric identifiers sort below alphanumeric
    return x < y ? -1 : 1;
  }
  return 0;
}

// True only when `remote` is a STRICTLY newer release than `current`. FAILS CLOSED:
// if either version is malformed (e.g. a 2-component "0.2", trailing junk) we return
// false rather than risk classifying an older remote as an "update". Guards against
// offering a downgrade when the app is ahead of the latest published release (running
// 0.2.0 while the public latest is 0.1.13).
function isNewerVersion(remote, current) {
  if (!parseSemver(remote) || !parseSemver(current)) { return false; }
  return semverCompare(remote, current) > 0;
}

let started = false;

// Call once, after the first window exists. getWindow() should return the window to
// parent dialogs to (may return null/undefined — dialogs then show unparented).
function initAutoUpdate(getWindow) {
  // Only meaningful in a packaged build; in dev there is no app-update.yml and
  // electron-updater throws. Guard so `npm start` / tests never hit it.
  if (!app.isPackaged || started) return;
  started = true;

  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (e) {
    return; // dependency missing — degrade to no auto-update rather than crash
  }

  autoUpdater.setFeedURL(FEED);
  // Never interrupt on "no update available" or transient network/errors.
  autoUpdater.on('error', () => {});

  if (isPortable()) {
    autoUpdater.autoDownload = false;
    autoUpdater.on('update-available', (info) => notifyPortable(getWindow, info));
  } else {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('update-downloaded', (info) => promptInstall(getWindow, autoUpdater, info));
  }

  autoUpdater.checkForUpdates().catch(() => {});
}

async function promptInstall(getWindow, autoUpdater, info) {
  const win = getWindow && getWindow();
  const { response } = await dialog.showMessageBox(win || undefined, {
    type: 'info',
    buttons: [t('Restart now'), t('Later')],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
    title: t('Update ready'),
    message: t('Open Pedigree ') + info.version + t(' has been downloaded.'),
    detail: t('Restart the app to install the update.')
  });
  if (response === 0) {
    // Let the dialog close before quitting.
    setImmediate(() => autoUpdater.quitAndInstall());
  }
}

async function notifyPortable(getWindow, info) {
  // Defensive: electron-updater only fires update-available for a newer version,
  // but if a promoted latest.yml ever regressed below the running build, never
  // nag the user to "update" to an older release.
  if (info && info.version && !isNewerVersion(info.version, app.getVersion())) { return; }
  const win = getWindow && getWindow();
  const { response } = await dialog.showMessageBox(win || undefined, {
    type: 'info',
    buttons: [t('Open download page'), t('Later')],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
    title: t('Update available'),
    message: t('Open Pedigree ') + info.version + t(' is available.'),
    detail: t('The portable build cannot update itself — download the new version from the releases page.')
  });
  if (response === 0) shell.openExternal(RELEASES_URL).catch(() => {});
}

// Manual "Check for updates" (D2). Unlike initAutoUpdate (which is silent by design so offline /
// transient failures never interrupt), this one ALWAYS gives feedback — checking / up to date /
// a newer version / could-not-check — and has a hard timeout so a hung network can't leave the
// user staring at nothing. It does not touch the background auto-updater or its offline safety.
async function checkForUpdatesManual(getWindow) {
  const win = (getWindow && getWindow()) || undefined;
  const current = app.getVersion();

  if (!app.isPackaged) {
    await dialog.showMessageBox(win, {
      type: 'info', buttons: ['OK'], noLink: true,
      title: t('Check for updates'),
      message: t('Update checking is only available in the installed app.'),
      detail: t('Open Pedigree ') + current
    });
    return;
  }

  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (e) {
    return couldNotCheck(win);
  }
  autoUpdater.setFeedURL(FEED);
  autoUpdater.autoDownload = false;
  autoUpdater.on('error', () => {});   // handled via the rejected promise below

  try {
    const result = await Promise.race([
      autoUpdater.checkForUpdates(),
      new Promise((_resolve, reject) => setTimeout(() => reject(new Error('timeout')), 15000))
    ]);
    const info = result && result.updateInfo;
    if (info && info.version && isNewerVersion(info.version, current)) {
      const { response } = await dialog.showMessageBox(win, {
        type: 'info', buttons: [t('Open download page'), t('Later')],
        defaultId: 0, cancelId: 1, noLink: true,
        title: t('Update available'),
        message: t('Open Pedigree ') + info.version + t(' is available.'),
        detail: t('You are on ') + current + '.'
      });
      if (response === 0) {
        shell.openExternal(RELEASES_URL).catch(() => {});
      }
    } else {
      await dialog.showMessageBox(win, {
        type: 'info', buttons: ['OK'], noLink: true,
        title: t('Check for updates'),
        message: t('You are up to date.'),
        detail: t('Open Pedigree ') + current + t(' is the latest version.')
      });
    }
  } catch (e) {
    await couldNotCheck(win);
  }
}

async function couldNotCheck(win) {
  await dialog.showMessageBox(win, {
    type: 'warning', buttons: ['OK'], noLink: true,
    title: t('Check for updates'),
    message: t('Could not check for updates.'),
    detail: t('You may be offline. Please try again later.')
  });
}

module.exports = { initAutoUpdate, checkForUpdatesManual, RELEASES_URL, semverCompare, isNewerVersion, parseSemver };
