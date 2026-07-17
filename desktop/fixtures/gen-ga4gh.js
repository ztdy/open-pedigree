'use strict';
// Generates a valid GA4GH FHIR fixture by importing the PED sample and exporting GA4GH via
// the test seam, so S3 has a real, parser-accepted JSON. Run: electron fixtures/gen-ga4gh.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { DocumentStore } = require('../documentStore');

app.disableHardwareAcceleration();
const LIB = fs.mkdtempSync(path.join(os.tmpdir(), 'opedigree-genfx-'));
process.env.OPEN_PEDIGREE_LIBRARY = LIB;
const INDEX_HTML = path.join(__dirname, '..', 'renderer', 'index.html');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let store;

app.whenReady().then(async () => {
  store = new DocumentStore(LIB);
  const h = (c, fn) => ipcMain.handle(c, (_e, ...a) => fn(...a));
  h('doc:list', () => store.list()); h('doc:create', (o) => store.create(o || {}));
  h('doc:open', (id) => store.read(id)); h('doc:save', (p) => store.save(p || {}));
  h('app:bootstrap', async () => (await store.list()).find((d) => !d.corrupt) || store.create({ title: 'x' }));
  ipcMain.on('doc:dirty', () => {});

  const win = new BrowserWindow({ show: false, webPreferences: {
    preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  await win.loadFile(INDEX_HTML);
  for (let i = 0; i < 40; i++) { if (await win.webContents.executeJavaScript('!!(window.__ped_desktop && window.editor)').catch(() => false)) break; await sleep(200); }
  await sleep(500);

  const ped = fs.readFileSync(path.join(__dirname, 'family.ped'), 'utf8');
  const json = await win.webContents.executeJavaScript(
    'editor.getSaveLoadEngine().createGraphFromImportData(' + JSON.stringify(ped) + ', "ped", {}, true, true);' +
    ' window.__ped_desktop.exportGA4GH();'
  ).catch((e) => { console.log('export error', e); return null; });

  if (json && typeof json === 'string' && json.trim()) {
    fs.writeFileSync(path.join(__dirname, 'family.json'), json);
    console.log('WROTE family.json (' + json.length + ' bytes)');
  } else {
    console.log('COULD NOT EXPORT GA4GH');
  }
  fs.rmSync(LIB, { recursive: true, force: true });
  await sleep(200);
  app.exit(json ? 0 : 1);
});
