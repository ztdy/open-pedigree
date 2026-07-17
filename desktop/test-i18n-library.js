'use strict';

// Scenario: the library landing page (library.html) must translate itself from the
// desktop-shell dictionary served over IPC, and expose a working EN/中文 switcher.
// Boots a real BrowserWindow with the shipped preload + library.html, wires the same
// locale IPC channels main.js registers, forces locale=zh, and asserts Chinese renders.

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const i18n = require('./i18n');

app.disableHardwareAcceleration();

const LIBRARY_HTML = path.join(__dirname, 'library.html');
const results = [];
const check = (n, ok, d) => { results.push({ ok: !!ok }); console.log((ok ? 'PASS  ' : 'FAIL  ') + n + (d ? '  — ' + d : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const js = (win, e) => win.webContents.executeJavaScript(e, true);

function registerIpc() {
  const h = (c, fn) => ipcMain.handle(c, (_e, ...a) => fn(...a));
  h('doc:list', () => []); // empty library -> "No pedigrees yet" empty state
  h('app:get-locale', () => i18n.getLocale());
  h('app:set-locale', (loc) => { i18n.setLocale(loc); return { ok: true, locale: i18n.getLocale() }; });
  h('app:get-i18n', () => ({ locale: i18n.getLocale(), messages: i18n.messages() }));
}

async function loadLibrary(win) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try { await win.loadFile(LIBRARY_HTML); return; }
    catch (e) { if (attempt === 3) throw e; await sleep(500); }
  }
}

app.whenReady().then(async () => {
  i18n.init(app);
  i18n.setLocale('zh'); // user chose Chinese; persisted to userData/ui-locale.json
  registerIpc();

  const win = new BrowserWindow({ width: 1100, height: 800, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });

  try {
    await loadLibrary(win);
    await sleep(600); // let the async boot() fetch the dictionary + render

    const newBtn = await js(win, "document.getElementById('btn-new').textContent");
    check('new-pedigree button is translated', newBtn === '+ 新建家系图', JSON.stringify(newBtn));

    const importBtn = await js(win, "document.getElementById('btn-import').textContent");
    check('import button is translated', importBtn === '导入…', JSON.stringify(importBtn));

    const title = await js(win, "document.title");
    check('page title is translated', title === 'Open Pedigree — 家系图库', JSON.stringify(title));

    const emptyH = await js(win, "(document.querySelector('.empty h2')||{}).textContent");
    check('empty-state heading is translated', emptyH === '还没有家系图', JSON.stringify(emptyH));

    const lang = await js(win, "document.getElementById('lang-switch').textContent");
    check('language switcher shows EN + 中文', /EN/.test(lang) && /中文/.test(lang), JSON.stringify(lang));

    const active = await js(win, "(document.querySelector('#lang-switch a.active')||{}).textContent");
    check('active language is 中文', active === '中文', JSON.stringify(active));

    const htmlLang = await js(win, "document.documentElement.lang");
    check('<html lang> reflects zh', htmlLang === 'zh', JSON.stringify(htmlLang));

    // Flip back to English via the shared IPC path and reload; header must be English again.
    await js(win, "window.openPedigreeDesktop.api.setLocale('en')");
    await loadLibrary(win);
    await sleep(600);
    const newBtnEn = await js(win, "document.getElementById('btn-new').textContent");
    check('switching to EN re-renders in English', newBtnEn === '+ New pedigree', JSON.stringify(newBtnEn));
  } catch (e) {
    check('scenario ran without throwing', false, String(e && e.message || e));
  }

  const passed = results.filter((r) => r.ok).length;
  console.log('==== i18n LIBRARY: ' + passed + '/' + results.length + ' passed ====');
  app.exit(passed === results.length ? 0 : 1);
});
