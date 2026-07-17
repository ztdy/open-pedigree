'use strict';

// Security regression: a project name is user/file-controlled (it comes from the stored
// .opedigree envelope), and the library page renders the project filter from it. It must NOT
// be possible for a crafted project name to inject an HTML attribute / inline event handler
// into the filter's <option> markup (the library CSP allows 'unsafe-inline', so an injected
// onmouseover would execute and could drive the library IPC to rename/copy/trash documents).
//
// Boots the real library.html with the shipped preload, serves doc:list with a malicious
// project name, and asserts the rendered option carries the name verbatim as its .value with
// no injected event attribute.

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const i18n = require('./i18n');

app.disableHardwareAcceleration();

const LIBRARY_HTML = path.join(__dirname, 'library.html');
const results = [];
const check = (n, ok, d) => { results.push({ ok: !!ok }); console.log((ok ? 'PASS  ' : 'FAIL  ') + n + (d ? '  — ' + d : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const js = (win, e) => win.webContents.executeJavaScript(e, true);

// The attack payload: a quote that would break out of value="…" plus an event handler.
const EVIL_PROJECT = 'p" onmouseover="window.__xss=1';

function registerIpc() {
  const h = (c, fn) => ipcMain.handle(c, (_e, ...a) => fn(...a));
  h('doc:list', () => [{
    documentId: '11111111-1111-4111-8111-111111111111',
    title: 'victim', project: EVIL_PROJECT, createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z', isEmpty: false, clinical: { people: 1 }
  }]);
  h('app:get-locale', () => i18n.getLocale());
  h('app:set-locale', (loc) => { i18n.setLocale(loc); return { ok: true, persisted: true, locale: i18n.getLocale() }; });
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
  i18n.setLocale('en');
  registerIpc();

  const win = new BrowserWindow({ width: 1100, height: 800, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });

  try {
    await loadLibrary(win);
    await sleep(700); // let boot() fetch the dictionary + refresh() render the filter

    // options[0] = "All projects"; options[1] = our crafted project.
    const optCount = await js(win, "document.getElementById('project-filter').querySelectorAll('option').length");
    check('project filter rendered exactly the expected options', optCount === 2, String(optCount));

    const val = await js(win, "(function(){var o=document.getElementById('project-filter').options[1];return o?o.value:null;})()");
    check('malicious project name is preserved verbatim as the option value', val === EVIL_PROJECT, JSON.stringify(val));

    // The security assertion: the double-quote must NOT have broken out into a real attribute.
    const injected = await js(win, "(function(){var o=document.getElementById('project-filter').options[1];return o?o.getAttribute('onmouseover'):'NO-OPTION';})()");
    check('no onmouseover attribute was injected (breakout prevented)', injected === null, JSON.stringify(injected));

    // Belt-and-suspenders: simulate the hover that a real injection would fire on, then confirm
    // the payload never ran.
    await js(win, "(function(){var o=document.getElementById('project-filter').options[1];if(o){var ev=new Event('mouseover');o.dispatchEvent(ev);}})()");
    const ran = await js(win, "!!window.__xss");
    check('injected handler did not execute', ran === false, String(ran));
  } catch (e) {
    check('scenario ran without throwing', false, String(e && e.message || e));
  }

  const passed = results.filter((r) => r.ok).length;
  console.log('==== library XSS: ' + passed + '/' + results.length + ' passed ====');
  app.exit(passed === results.length ? 0 : 1);
});
