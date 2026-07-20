'use strict';
// i18n for the desktop shell (main process + library.html), which cannot import the
// renderer bundle's src/script/i18n.js. Same contract: t(key) with English-source keys
// that fall back to English, and locale persisted to a single on-disk file so the main
// process, the library page and the editor all agree.
//
// Sync: the editor (renderer) writes the chosen locale here via IPC (app:set-locale);
// main reads it directly; library.html fetches {locale, messages} via IPC (app:get-i18n).

const fs = require('fs');
const path = require('path');

const SUPPORTED = ['en', 'zh'];

const MESSAGES = {
  zh: {
    // ---- library.html ----
    'Open Pedigree — Library': 'Open Pedigree — 家系图库',
    '+ New pedigree': '+ 新建家系图',
    'Import…': '导入…',
    'Project': '项目',
    'Search pedigrees…': '搜索家系图…',
    'Sort': '排序',
    'Recently updated': '最近更新',
    'Title A–Z': '标题 A–Z',
    // Help / About group (D1-D4, D6)
    'About / Help': '关于 / 帮助',
    'About Open Pedigree': '关于 Open Pedigree',
    'An offline pedigree drawing tool following NSGC 2022/2025 nomenclature.': '遵循 NSGC 2022/2025 命名法的离线家系图绘制工具。',
    'License: LGPL-2.1. Derived from PhenoTips open-pedigree.': '许可证：LGPL-2.1。衍生自 PhenoTips open-pedigree。',
    'Nomenclature: Bennett RL et al., J Genet Couns 2022;31:1238-1248 (updated 2025).': '命名法依据：Bennett RL 等，J Genet Couns 2022;31:1238-1248（2025 勘误）。',
    "What's new in 0.2: per-condition affected/carrier status (hatched carrier fill), redesigned legend with a fill key, and in-place disorder renaming.": '0.2 新特性：按病记录患病/携带状态（携带用斜线填充）、重新设计的图例（含填充图例说明）、在图例中直接重命名疾病。',
    'Close': '关闭',
    'About': '关于',
    'Feedback': '反馈',
    'Help': '帮助',
    'User Guide': '使用手册',
    'The user guide could not be opened.': '无法打开使用手册。',
    'The manual file is missing. Please reinstall the app.': '手册文件缺失，请重新安装本软件。',
    'The manual file is damaged. Please reinstall the app.': '手册文件已损坏，请重新安装本软件。',
    'Send feedback': '反馈问题',
    'Check for updates…': '检查更新…',
    'Check for updates': '检查更新',
    'Update checking is only available in the installed app.': '仅安装版支持检查更新。',
    'You are up to date.': '已是最新版本。',
    ' is the latest version.': ' 是最新版本。',
    'You are on ': '当前版本 ',
    'Could not check for updates.': '无法检查更新。',
    'You may be offline. Please try again later.': '可能处于离线状态，请稍后重试。',
    'Loading…': '加载中…',
    'Ungrouped': '未分组',
    'All projects': '所有项目',
    'Could not read the library': '无法读取库',
    'No matches': '无匹配项',
    'No pedigrees yet': '还没有家系图',
    'Create your first one with “New pedigree”.': '点击“+ 新建家系图”创建第一个。',
    'unreadable': '无法读取',
    '(untitled)': '（无标题）',
    'HPO': 'HPO',
    'disorder': '种疾病',
    'disorders': '种疾病',
    'person': '人',
    'people': '人',
    'This file could not be parsed.': '无法解析此文件。',
    'Updated ': '更新于 ',
    'Open': '打开',
    'Rename': '重命名',
    'Duplicate': '复制',
    'Duplicated': '已复制',
    'Delete': '删除',
    'Move ': '将',
    ' to the trash?': '移到回收站？',
    'this pedigree': '此家系图',
    'Moved to trash': '已移到回收站',
    'Project:': '项目：',
    '＋ New project…': '＋ 新建项目…',
    'New project name': '新项目名称',
    'Moved to ': '已移动到',
    'Removed from project': '已移出项目',
    'Renamed': '已重命名',
    'Could not create: ': '无法创建：',
    'Import failed: ': '导入失败：',
    'Desktop bridge unavailable': '桌面桥接不可用',

    // ---- main.js dialogs ----
    'Save': '保存',
    "Don't Save": '不保存',
    'Cancel': '取消',
    'This pedigree has unsaved changes.': '此家系图有未保存的更改。',
    'Do you want to save first?': '是否先保存？',
    'Proceed anyway': '仍然继续',
    'Still has unsaved changes.': '仍有未保存的更改。',
    'Edits kept arriving while saving. Proceed and discard the latest, or cancel?':
      '保存期间仍有编辑到达。继续并丢弃最新更改，还是取消？',
    'Saving failed.': '保存失败。',
    'Import pedigree as a new document': '将家系图导入为新文档',
    'Pedigree files': '家系图文件',
    'All files': '所有文件',
    'File too large': '文件过大',
    'This file is ': '此文件大小为 ',
    ' MB; the limit is 8 MB.': ' MB；上限为 8 MB。',
    'Could not read file': '无法读取文件',
    'Export failed': '导出失败',
    'The file could not be saved.': '文件未能保存。',
    'The original file was not changed. It may be open in another program, read-only, or the disk may be full. Try a different name or location.':
      '原文件未被更改。它可能正被其他程序打开、为只读，或磁盘空间已满。请换一个文件名或位置重试。',
    'OK': '确定',
    'Could not use your saved data folder': '无法使用您保存的数据文件夹',
    'This location was unavailable (removed drive or no write access):\n\n':
      '此位置不可用（驱动器已移除或无写入权限）：\n\n',
    '\n\nUsing the default folder instead:\n\n': '\n\n改用默认文件夹：\n\n',
    'Open Pedigree': 'Open Pedigree',
    'Could not create or write to any data folder, so the app cannot start.\n\nCheck folder permissions or set OPEN_PEDIGREE_LIBRARY to a writable path.':
      '无法创建或写入任何数据文件夹，应用无法启动。\n\n请检查文件夹权限，或将 OPEN_PEDIGREE_LIBRARY 设置为一个可写路径。',

    // ---- default document titles (shown in the library) ----
    'Untitled pedigree': '未命名家系图',
    'Imported pedigree': '已导入的家系图',
    ' (copy)': '（副本）',

    // ---- libraryConfig first-run dialog ----
    'Portable mode. By default your data is stored next to the app, in:\n\n':
      '便携模式。默认情况下，您的数据存储在应用旁边：\n\n',
    'That keeps everything together so it travels with the app (e.g. on a USB drive). You can also pick another folder.':
      '这样所有内容都在一起，可随应用一起携带（例如放在 U 盘上）。您也可以选择其它文件夹。',
    'By default your pedigree library is stored in:\n\n': '默认情况下，您的家系图库存储在：\n\n',
    'You can also pick another folder.': '您也可以选择其它文件夹。',
    'Use default location': '使用默认位置',
    'Choose folder…': '选择文件夹…',
    'Where should Open Pedigree store your data?': 'Open Pedigree 应将您的数据存储在哪里？',
    'Choose your data folder': '选择您的数据文件夹',
    'Choose a folder for your Open Pedigree library': '为您的 Open Pedigree 库选择一个文件夹',

    // ---- updater dialogs ----
    'Restart now': '立即重启',
    'Later': '稍后',
    'Update ready': '更新已就绪',
    'Open Pedigree ': 'Open Pedigree ',
    ' has been downloaded.': ' 已下载完成。',
    ' is available.': ' 已可用。',
    'Restart the app to install the update.': '重启应用以安装更新。',
    'Open download page': '打开下载页',
    'Update available': '有可用更新',
    'The portable build cannot update itself — download the new version from the releases page.':
      '便携版无法自我更新 —— 请从发布页下载新版本。',

    // ---- language switcher (library page) ----
    'Language': '语言',
    'The language was changed for now, but could not be saved and may reset next time.':
      '语言已临时切换，但未能保存，下次启动可能会恢复。'
  }
};

let _app = null;
let _cache = null;

function init(app) { _app = app; _cache = null; }

function localeFile() {
  var dir = _app ? _app.getPath('userData') : '.';
  return path.join(dir, 'ui-locale.json');
}

function detectDefault() {
  try {
    var l = (_app && _app.getLocale ? _app.getLocale() : '').toLowerCase();
    return l.indexOf('zh') === 0 ? 'zh' : 'en';
  } catch (e) { return 'en'; }
}

function getLocale() {
  if (_cache) { return _cache; }
  try {
    var j = JSON.parse(fs.readFileSync(localeFile(), 'utf8'));
    if (SUPPORTED.indexOf(j.locale) !== -1) { return (_cache = j.locale); }
  } catch (e) { /* no file yet */ }
  return (_cache = detectDefault());
}

// Returns true only if the choice was actually persisted to disk. A read-only/unavailable
// userData dir updates the in-memory cache for this session but returns false, so callers
// (the IPC handler) can report honestly rather than claim success that won't survive restart.
function setLocale(locale) {
  if (SUPPORTED.indexOf(locale) === -1) { return false; }
  _cache = locale;
  try { fs.writeFileSync(localeFile(), JSON.stringify({ locale: locale })); return true; }
  catch (e) { return false; }
}

function t(key, locale) {
  locale = locale || getLocale();
  var tbl = MESSAGES[locale];
  return (tbl && Object.prototype.hasOwnProperty.call(tbl, key)) ? tbl[key] : key;
}

// Full dictionary for the current locale (library.html pulls this via IPC to translate
// locally without a round-trip per string).
function messages(locale) {
  return MESSAGES[locale || getLocale()] || {};
}

module.exports = { init, getLocale, setLocale, t, messages, SUPPORTED };
