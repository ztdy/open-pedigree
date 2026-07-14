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

module.exports = { initAutoUpdate };
