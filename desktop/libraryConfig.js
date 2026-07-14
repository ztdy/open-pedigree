'use strict';

// Resolves WHERE the pedigree library lives, and remembers the user's choice.
//
// Priority:
//   1. OPEN_PEDIGREE_LIBRARY env var    — dev / tests / power users; never persisted
//   2. A previously-saved choice        — from the first-run picker
//   3. First run: ask the user (default vs. a folder they pick), then persist
//
// Portable builds keep BOTH the tiny config pointer AND the default data folder next
// to the .exe (via PORTABLE_EXECUTABLE_DIR, which electron-builder's portable target
// sets to the directory the exe was launched from). That way the whole thing travels
// on a USB stick with no dependency on %APPDATA%. Installed builds keep them under the
// OS user-data dir (%APPDATA%\Open Pedigree), independent of the install location.

const fs = require('fs');
const path = require('path');
const i18n = require('./i18n');
const t = (k) => i18n.t(k);

function portableDir() {
  const d = process.env.PORTABLE_EXECUTABLE_DIR;
  return d && d.trim() ? d : null;
}
function isPortable() { return !!portableDir(); }

// Where we remember the chosen library path.
function configPath(app) {
  const pd = portableDir();
  if (pd) return path.join(pd, 'open-pedigree-data.json');
  return path.join(app.getPath('userData'), 'library-location.json');
}

// The out-of-the-box default location for this build kind.
function defaultLibraryDir(app) {
  const pd = portableDir();
  if (pd) return path.join(pd, 'OpenPedigree-Data');
  return path.join(app.getPath('userData'), 'pedigrees');
}

function readSavedDir(app) {
  try {
    const cfg = JSON.parse(fs.readFileSync(configPath(app), 'utf8'));
    if (cfg && typeof cfg.libraryDir === 'string' && cfg.libraryDir.trim()) {
      return cfg.libraryDir.trim();
    }
  } catch (e) { /* no config yet, or unreadable — fall through to first-run */ }
  return null;
}

function saveDir(app, libraryDir) {
  try {
    fs.writeFileSync(configPath(app), JSON.stringify({ libraryDir: libraryDir }, null, 2));
    return true;
  } catch (e) {
    // Best effort. If we can't persist (e.g. read-only USB), we still return the chosen
    // path for this session; next launch will simply ask again.
    return false;
  }
}

// Resolve the library dir, showing a one-time picker on first run. `deps` = { app, dialog }
// so this stays unit-testable without an Electron runtime.
async function resolveLibraryDir(deps) {
  const app = deps.app;
  const dialog = deps.dialog;

  // 1. explicit override wins and is never persisted (keeps tests/power-users hermetic).
  const envDir = process.env.OPEN_PEDIGREE_LIBRARY;
  if (envDir && envDir.trim()) return { dir: envDir.trim(), source: 'env' };

  // 2. remembered choice.
  const saved = readSavedDir(app);
  if (saved) return { dir: saved, source: 'saved' };

  // 3. first run — let the user pick. If dialog is unavailable (headless), take the default.
  const def = defaultLibraryDir(app);
  if (!dialog || !dialog.showMessageBox) { saveDir(app, def); return { dir: def, source: 'default' }; }

  const detail = isPortable()
    ? t('Portable mode. By default your data is stored next to the app, in:\n\n')
      + def + '\n\n' + t('That keeps everything together so it travels with the app (e.g. on a USB drive). You can also pick another folder.')
    : t('By default your pedigree library is stored in:\n\n')
      + def + '\n\n' + t('You can also pick another folder.');

  const { response } = await dialog.showMessageBox({
    type: 'question',
    buttons: [t('Use default location'), t('Choose folder…')],
    defaultId: 0,
    cancelId: 0,
    title: t('Where should Open Pedigree store your data?'),
    message: t('Choose your data folder'),
    detail: detail
  });

  let chosen = def;
  if (response === 1) {
    const pick = await dialog.showOpenDialog({
      title: t('Choose a folder for your Open Pedigree library'),
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: def
    });
    if (!pick.canceled && Array.isArray(pick.filePaths) && pick.filePaths.length) {
      chosen = pick.filePaths[0];
    }
  }
  saveDir(app, chosen);
  return { dir: chosen, source: response === 1 ? 'picked' : 'default' };
}

module.exports = {
  resolveLibraryDir,
  defaultLibraryDir,
  configPath,
  isPortable,
  _test: { readSavedDir, saveDir }
};
