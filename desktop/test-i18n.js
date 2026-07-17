'use strict';
// Unit tests for the desktop-shell i18n module (desktop/i18n.js): locale detection,
// t() fallback, Chinese coverage of shell strings, and on-disk locale persistence.
// Pure Node — no Electron/display needed.

const assert = require('assert');
const os = require('os');
const fs = require('fs');
const path = require('path');
const i18n = require('./i18n');

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); console.log('PASS  ' + name); pass++; }
  catch (e) { console.log('FAIL  ' + name + '  — ' + (e && e.message || e)); fail++; }
}

// A fake Electron `app` backed by a temp userData dir.
function fakeApp(locale) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'op-i18n-'));
  return { dir, getLocale: () => locale, getPath: () => dir };
}

check('defaults to English before init (t falls back to source)', () => {
  // Fresh require state: getLocale with no app detects 'en'; t returns the key.
  i18n.init(null);
  assert.strictEqual(i18n.getLocale(), 'en');
  assert.strictEqual(i18n.t('Save'), 'Save');
  assert.strictEqual(i18n.t('Untitled pedigree'), 'Untitled pedigree');
});

check('detects Chinese from the OS locale', () => {
  const app = fakeApp('zh-CN');
  i18n.init(app);
  assert.strictEqual(i18n.getLocale(), 'zh');
});

check('detects English from a non-Chinese OS locale', () => {
  i18n.init(fakeApp('en-US'));
  assert.strictEqual(i18n.getLocale(), 'en');
});

check('translates shell strings to Chinese', () => {
  i18n.init(fakeApp('zh'));
  assert.strictEqual(i18n.t('Save'), '保存');
  assert.strictEqual(i18n.t('+ New pedigree'), '+ 新建家系图');
  assert.strictEqual(i18n.t('Untitled pedigree'), '未命名家系图');
  assert.strictEqual(i18n.t(' (copy)'), '（副本）');
  // Concatenated fragments read naturally in Chinese (no stray ASCII spaces around the name).
  assert.strictEqual(i18n.t('Move ') + '“张三”' + i18n.t(' to the trash?'), '将“张三”移到回收站？');
  // The locale-persistence-failure notice (shown by both the library page and the editor) is
  // covered so the library's T() render path yields Chinese rather than the English source.
  assert.notStrictEqual(
    i18n.t('The language was changed for now, but could not be saved and may reset next time.'),
    'The language was changed for now, but could not be saved and may reset next time.');
});

check('unknown keys fall back to the source string', () => {
  i18n.init(fakeApp('zh'));
  assert.strictEqual(i18n.t('Totally Unknown String 123'), 'Totally Unknown String 123');
});

check('messages() returns the full dictionary for the locale', () => {
  i18n.init(fakeApp('zh'));
  const m = i18n.messages();
  assert.ok(Object.keys(m).length > 50, 'expected a substantial dictionary');
  assert.strictEqual(m['Open'], '打开');
  const en = i18n.messages('en');
  assert.deepStrictEqual(en, {}, 'English has no dictionary (source == key)');
});

check('setLocale persists to disk, returns true, and getLocale reads it back', () => {
  const app = fakeApp('en'); // OS default English...
  i18n.init(app);
  assert.strictEqual(i18n.setLocale('zh'), true, 'a writable dir reports persisted=true');
  assert.strictEqual(i18n.getLocale(), 'zh');
  const file = path.join(app.dir, 'ui-locale.json');
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { locale: 'zh' });
  // A fresh init (new "process") must recover the saved choice, not the OS default.
  i18n.init(app);
  assert.strictEqual(i18n.getLocale(), 'zh');
});

check('setLocale ignores unsupported locales (returns false)', () => {
  const app = fakeApp('en');
  i18n.init(app);
  assert.strictEqual(i18n.setLocale('fr'), false);
  assert.strictEqual(i18n.getLocale(), 'en');
});

check('setLocale returns false when the dir is unwritable (honest failure)', () => {
  // Point userData at a path under a regular file so writeFileSync fails.
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'op-ro-'));
  const notADir = path.join(base, 'afile');
  fs.writeFileSync(notADir, 'x');
  i18n.init({ getLocale: () => 'en', getPath: () => notADir }); // getPath returns a FILE, not a dir
  assert.strictEqual(i18n.setLocale('zh'), false, 'unwritable dir reports persisted=false');
  assert.strictEqual(i18n.getLocale(), 'zh', 'in-memory cache still updates for this session');
});

console.log('==== desktop i18n: ' + pass + ' passed, ' + fail + ' failed ====');
process.exit(fail ? 1 : 0);
