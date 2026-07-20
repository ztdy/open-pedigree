'use strict';
// Internationalisation for the legacy (Prototype/Raphael, no-framework) editor.
//
//   1. t(key) — translate a UI string. Keys ARE the English source text, so any string
//      not yet in the dictionary falls back to English automatically.
//   2. formatName(first, last) — order a person's name for the current locale (Western
//      "given family" vs Chinese "family+given", no separator).
//
// Locale is persisted in localStorage and defaults to the browser/OS language. Switching
// locale reloads the page (setLocale) so every label + the node menu re-render — simplest
// reliable way to re-translate legacy widgets that build their DOM once.

var STORAGE_KEY = 'op_locale';
var SUPPORTED = ['en', 'zh'];

// Chinese dictionary. Keys are the exact English source strings used at each render point.
var MESSAGES = {
  zh: {
    // ---- node menu: field labels ----
    'Gender': '性别',
    'Sex assigned at birth': '出生指定性别',
    'Not recorded': '未记录',
    'Assigned male (AMAB)': '出生指定男性 (AMAB)',
    'Assigned female (AFAB)': '出生指定女性 (AFAB)',
    'Unassigned (UAAB)': '出生未指定 (UAAB)',
    'Assisted reproduction': '辅助生殖角色',
    'Not applicable': '不适用',
    'Gamete donor (D)': '配子捐赠者（D）',
    'Gestational carrier (G)': '妊娠携带者（G）',
    'First name': '名',
    'Last name': '姓',
    'Identifier': '标识符',
    'Identifier(s)': '标识符',
    'Proband (index case — shows P + ↙ arrow)': '先证者（索引病例 — 显示 P + ↙ 箭头）',
    'Consultand (seeking counseling — shows a bare ↙ arrow)': '咨询者（前来遗传咨询 — 显示不带 P 的 ↙ 箭头）',
    'Carrier status': '携带者状态',
    'Pre-symptomatic (gene-positive, not yet affected)': '症状前（携带致病变异、尚未发病）',
    'Documented evaluation': '已记录的评估',
    'Disorders': '疾病',
    'Genes': '基因',
    'Genotype / variant': '基因型 / 变异',
    'Phenotypic features': '表型特征',
    'Date of birth': '出生日期',
    'Date of death': '死亡日期',
    'Individual is': '个体状态',
    'Gestation age': '孕龄',
    'Heredity options': '遗传选项',
    'Adopted': '收养',
    'Monozygotic twin': '同卵双胞胎',
    'Unknown zygosity': '合子型未知',
    'Not in contact with proband': '与先证者失去联系',
    'Placeholder node': '占位节点',
    'Comments': '备注',
    'Number of persons in this group': '该组人数',
    'Known disorders<br>(common to all individuals in the group)': '已知疾病<br>（该组所有个体共有）',
    'All individuals in the group are': '该组所有个体',
    'Consanguinity of this relationship': '该关系的近亲程度',
    'Separated': '已分居',

    // ---- node menu: radio / select option labels ----
    'Male': '男',
    'Female': '女',
    'Unknown': '未知',
    'Not affected': '未患病',
    'Carrier': '携带者',
    'Affected': '患病',
    'colour + pattern = affected': '病色 + 图案 = 患病',
    'pattern only (no fill) = carrier': '仅图案（无填充）= 携带',
    'In this family:': '本家系已有：',
    'Add to this individual': '添加到此成员',
    'Pre-symptomatic': '症状前',
    'Alive': '存活',
    'Stillborn': '死产',
    'Deceased': '已故',
    'Miscarriage': '流产',
    'Ectopic': '异位妊娠',
    'Unborn': '未出生',
    'Aborted': '人工流产',
    'None': '无',
    'Childless': '无子女',
    'Infertile': '不孕不育',
    'Automatic': '自动',
    'Yes': '是',
    'No': '否',
    'week': '周',
    'weeks': '周',

    // ---- node-type selection bubble ----
    'Twins': '双胞胎',
    'Multiple': '多个',
    'No children': '无子女',
    'Create a person of male gender': '创建一个男性个体',
    'Create a person of female gender': '创建一个女性个体',
    'Create a person of unknown gender': '创建一个性别未知的个体',
    'Create twins (expandable to triplets or more)': '创建双胞胎（可扩展为三胞胎或更多）',
    'Create a node representing multiple siblings': '创建代表多个兄弟姐妹的节点',
    'Mark as childless by choice': '标记为自愿无子女',
    'Mark as infertile': '标记为不孕不育',
    'show more options': '显示更多选项',
    'create': '创建',

    // ---- workspace toolbar + view controls ----
    'Unsuported browser mode': '不支持的浏览器模式',
    'Export': '导出',
    'Close': '关闭',
    'Templates': '模板',
    'Import': '导入',
    'Save': '保存',
    'Undo': '撤销',
    'Redo': '重做',
    'Clear all': '清空全部',
    // Advisory consistency check (opt-in; non-blocking).
    'Check consistency': '检查一致性',
    'Consistency check': '一致性检查',
    'No issues found.': '未发现问题。',
    'These are advisory only — nothing was changed.': '以下仅为提示，未对家系做任何改动。',
    'Death year is before the birth year.': '卒年早于生年。',
    'A parent is recorded as younger than their child.': '父母被记录为比子女年幼。',
    'A non-live-birth pregnancy is recorded as a parent.': '未出生的妊娠（死胎/流产/异位）被记录为父母。',
    'Monozygotic (identical) twins are recorded with different sex assigned at birth.': '同卵（同基因）双胞胎被记录为不同的出生指定性别。',
    'Pan': '平移',
    'Pan up': '向上平移',
    'Pan down': '向下平移',
    'Pan left': '向左平移',
    'Pan right': '向右平移',
    'Pan home': '回到中心',
    'Zoom': '缩放',
    'Drag to zoom': '拖动以缩放',
    'Zoom in': '放大',
    'Zoom out': '缩小',

    // ---- person hoverbox handle tooltips ----
    'Click to create a sibling or drag to an existing parentless person (valid choices will be highlighted in green)':
      '点击创建兄弟姐妹，或拖动到已存在的无父母个体（有效选择会高亮为绿色）',
    'Click to create new nodes for the parents or drag to an existing person or partnership (valid choices will be highlighted in green). Dragging to a person will create a new relationship.':
      '点击为父母创建新节点，或拖动到已存在的个体或配偶关系（有效选择会高亮为绿色）。拖动到某个个体会创建一段新的关系。',
    'Click to create a new child node or drag to an existing parentless person (valid choices will be highlighted in green)':
      '点击创建新的子女节点，或拖动到已存在的无父母个体（有效选择会高亮为绿色）',
    'Click to create a new partner node or drag to an existing node (valid choices will be highlighted in green)':
      '点击创建新的配偶节点，或拖动到已存在的节点（有效选择会高亮为绿色）',

    // ---- legend ----
    'case': '例',
    'cases': '例',
    'Click to change color': '点击更改颜色',
    'Candidate Genes': '候选基因',
    'Phenotypes': '表型',

    // ---- export dialog ----
    'Data format:': '数据格式：',
    'Which of the following fields should be used to generate person IDs?': '用于生成个体 ID 的字段？',
    'External ID': '外部 ID',
    'Name': '姓名',
    'None, generate new numeric ID for everyone': '无，为每个人生成新的数字 ID',
    'Privacy export options:': '隐私导出选项：',
    'All data': '全部数据',
    'Remove personal information (name and age)': '移除个人信息（姓名和年龄）',
    'Remove personal information and free-form comments': '移除个人信息和自由格式备注',
    'PDF export options:': 'PDF 导出选项：',
    'Page Size ': '页面大小 ',
    'Page Orientation ': '页面方向 ',
    'Legend Position ': '图例位置 ',
    'Landscape': '横向',
    'Portrait': '纵向',
    'Top Left': '左上',
    'Top Right': '右上',
    'Bottom Left': '左下',
    'Bottom Right': '右下',
    'Options:': '选项：',
    'Cancel': '取消',
    'Pedigree export': '家系图导出',
    'PDF export failed: ': 'PDF 导出失败：',

    // ---- import dialog ----
    'Import data:': '导入数据：',
    'Select a local file to be imported': '选择要导入的本地文件',
    'Treat non-standard phenotype values as new disorders': '将非标准表型值视为新疾病',
    'Treat non-standard phenotype values as "no information"': '将非标准表型值视为“无信息”',
    "Mark all patients with known disorder status with 'documented evaluation' mark":
      '为所有已知疾病状态的患者标记“已记录的评估”',
    "Save individual IDs as given in the input data as 'external ID'":
      '将输入数据中给出的个体 ID 保存为“外部 ID”',
    'Pedigree import': '家系图导入',
    'Nothing to import!': '没有可导入的内容！',

    // ---- template selector ----
    'Loading list of templates...': '正在加载模板列表…',
    'Please select a pedigree template': '请选择一个家系图模板',
    'Loading...': '加载中…',

    // ---- person alerts ----
    'This person already has the specified disorder': '该个体已有指定的疾病',
    'This disorder name cannot be stored exactly as typed, so it has not been added. Please rephrase it, avoiding a doubled underscore and sequences like _L_ or _u0041_.': '该疾病名称无法按原样保存，因此未被添加。请改写名称：避免连续两个下划线，以及 _L_、_u0041_ 之类的序列。',
    'This phenotype name cannot be stored exactly as typed, so it has not been added. Please rephrase it, avoiding a doubled underscore and sequences like _L_ or _u0041_.': '该表型名称无法按原样保存，因此未被添加。请改写名称：避免连续两个下划线，以及 _L_、_u0041_ 之类的序列。',
    'This person doesn\'t have the specified disorder': '该个体没有指定的疾病',
    'This person already has the specified phenotype': '该个体已有指定的表型',
    'This person doesn\'t have the specified HPO term': '该个体没有指定的 HPO 术语',

    // ---- canvas markers / age labels ----
    'SB': '死产',
    'not born yet': '尚未出生',
    'day': '天',
    'days': '天',
    'wk': '周',
    'mo': '月',
    'y': '岁',

    // ---- save/load + import engine alerts ----
    'your browser is unsupported': '您的浏览器不受支持',
    'Error loading the graph': '加载家系图时出错',
    'Error importing pedigree: ': '导入家系图时出错：',

    // ---- node menu: tab headers ----
    'Personal': '个人信息',
    'Clinical': '临床信息',

    // ---- controller: destructive-remove confirmation ----
    'All highlighted nodes will be removed. Do you want to proceed?': '所有高亮的节点都将被删除。是否继续？',

    // ---- app.js chrome ----
    '✓ Saved': '✓ 已保存',
    '✕ Save failed': '✕ 保存失败',
    'Could not start Open Pedigree': '无法启动 Open Pedigree',
    'The pedigree library could not be opened, so editing is disabled to avoid losing data.':
      '无法打开家系图库，为避免丢失数据已禁用编辑。',
    'Retry': '重试',
    'The language was changed for now, but could not be saved and may reset next time.':
      '语言已临时切换，但未能保存，下次启动可能会恢复。',

    // ---- desktop backend alerts (renderer side) ----
    'This pedigree could not be opened (its data may be from an incompatible version or corrupted): ':
      '无法打开该家系图（其数据可能来自不兼容的版本或已损坏）：',
    'Could not load pedigree: ': '无法加载家系图：',

    // ---- long error / warning alerts ----
    'Your browser does not support all the features required for Pedigree Editor, so pedigree is displayed in read-only mode (and may have quirks).\n\nSupported browsers include Firefox v3.5+, Internet Explorer v9+, Chrome, Safari v4+, Opera v10.5+ and most mobile browsers.':
      '您的浏览器不支持家系图编辑器所需的全部功能，因此家系图以只读模式显示（可能存在一些异常）。\n\n受支持的浏览器包括 Firefox v3.5+、Internet Explorer v9+、Chrome、Safari v4+、Opera v10.5+ 以及大多数移动端浏览器。',
    'Your browser is not supported and is unable to load and display any pedigrees.\n\nSuported browsers include Internet Explorer version 9 and higher, Safari version 4 and higher, Firefox version 3.6 and higher, Opera version 10.5 and higher, any version of Chrome and most other modern browsers (including mobile). IE8 is able to display pedigrees in read-only mode.':
      '您的浏览器不受支持，无法加载和显示任何家系图。\n\n受支持的浏览器包括 Internet Explorer 9 及以上、Safari 4 及以上、Firefox 3.6 及以上、Opera 10.5 及以上、任意版本的 Chrome 以及大多数其它现代浏览器（含移动端）。IE8 可以只读模式显示家系图。',
    'Unsupported GEDCOM version detected: [': '检测到不支持的 GEDCOM 版本：[',
    ']. ': ']。',
    'Import will continue but the correctness is not guaranteed. Supportede versions are 5.5 and 5.5.1':
      '导入将继续，但无法保证正确性。受支持的版本为 5.5 和 5.5.1',
    'Some families with no children were found in the imported pedigree: this is not supported at the moment, so a child was added to each childless family':
      '在导入的家系图中发现了没有子女的家庭：目前不支持这种情况，因此已为每个无子女的家庭各添加了一个子女',

    // ---- language switcher ----
    'Language': '语言',
    'English': 'English',
    '中文': '中文'
  }
};

var current = null;

function detectDefault() {
  var lang = '';
  try { lang = (window.navigator.language || window.navigator.userLanguage || '').toLowerCase(); } catch (e) {}
  return lang.indexOf('zh') === 0 ? 'zh' : 'en';
}

function getLocale() {
  if (current) { return current; }
  var saved = null;
  try { saved = window.localStorage.getItem(STORAGE_KEY); } catch (e) {}
  current = (SUPPORTED.indexOf(saved) !== -1) ? saved : detectDefault();
  return current;
}

// Persist and reload so every label + the node menu re-render in the new locale. In the
// desktop build, also push the choice to the shell (main-process dialogs + library page)
// via IPC and wait for that write before reloading, so all three stay in sync.
function setLocale(locale) {
  if (SUPPORTED.indexOf(locale) === -1) { return; }
  try { window.localStorage.setItem(STORAGE_KEY, locale); } catch (e) {}
  current = locale;
  var reload = function () { try { window.location.reload(); } catch (e) {} };
  var desktop = null;
  try { desktop = window.openPedigreeDesktop; } catch (e) {}
  if (desktop && desktop.api && typeof desktop.api.setLocale === 'function') {
    try {
      var p = desktop.api.setLocale(locale);
      if (p && typeof p.then === 'function') {
        p.then(function (res) {
          // Main tells us whether the choice reached disk. If it didn't (read-only/unavailable
          // userData), the switch still applies this session but would revert on restart — say
          // so instead of silently pretending it stuck.
          if (res && res.persisted === false) {
            try { window.alert(t('The language was changed for now, but could not be saved and may reset next time.')); } catch (e) {}
          }
          reload();
        }, reload);
        return;
      }
    } catch (e) { /* fall through to plain reload */ }
  }
  reload();
}

// Set without reloading — for tests / programmatic use.
function setLocaleNoReload(locale) {
  if (SUPPORTED.indexOf(locale) === -1) { return; }
  try { window.localStorage.setItem(STORAGE_KEY, locale); } catch (e) {}
  current = locale;
}

function t(key) {
  var loc = getLocale();
  var table = MESSAGES[loc];
  if (table && Object.prototype.hasOwnProperty.call(table, key)) {
    return table[key];
  }
  return key; // fall back to the English source string
}

// Order a name for the current locale. Chinese: family + given, no space. Others:
// given + space + family. Missing parts are handled gracefully.
function formatName(first, last) {
  first = first || '';
  last = last || '';
  if (getLocale() === 'zh') {
    return (last + first).trim();
  }
  return (first + (first && last ? ' ' : '') + last).trim();
}

var I18n = { t: t, formatName: formatName, getLocale: getLocale, setLocale: setLocale,
             setLocaleNoReload: setLocaleNoReload, SUPPORTED: SUPPORTED };

// Expose for tests and for any non-module UI glue.
try { window.OPI18n = I18n; } catch (e) {}

export default I18n;
