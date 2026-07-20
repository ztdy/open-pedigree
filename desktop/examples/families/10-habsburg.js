'use strict';

// The Spanish Habsburg dynasty — the textbook pedigree of royal inbreeding, ending in the
// disabled, infertile Charles II of Spain (Carlos II, 1661–1700) and the extinction of the
// line. Six documented consanguineous unions (two uncle–niece, four cousin) converge on him;
// the app detects the shared ancestry from the structure alone and draws the consanguinity
// double-lines automatically. The "Habsburg jaw" (mandibular prognathism) is marked on the
// best-documented cases to show a trait clustering with, and worsening along, the inbred line.
//
// Structure transcribed from the standard Spanish-Habsburg genealogy; inbreeding coefficients
// (Carlos II F≈0.254, higher than a parent–child union) computed by:
//   Alvarez G, Ceballos FC, Quinteiro C. "The Role of Inbreeding in the Extinction of a
//   European Royal Dynasty." PLoS ONE 2009;4(4):e5174. doi:10.1371/journal.pone.0005174
//
// This is a REAL historical family; the genealogical structure is faithful, and only the most
// prominent, well-documented jaw cases are marked as affected. Proband: Carlos II.

var J = 'Habsburg jaw (mandibular prognathism)';
var M = function (n) { return { sex: 'M', note: n }; };
var F = function (n) { return { sex: 'F', note: n }; };

module.exports = {
  id: 'e315fa49-c7a3-45dc-99f0-0af6a2d3d2d7',
  title: '西班牙哈布斯堡王朝近亲婚配 · Spanish Habsburg inbreeding',
  project: '示例家系 · Example pedigrees',
  size: 'large',
  inheritance: 'Consanguinity showcase (inbreeding depression)',
  condition: J,
  citation: 'Alvarez G et al. PLoS ONE 2009;4:e5174 (doi:10.1371/journal.pone.0005174).',
  provenance: '真实历史家系：西班牙哈布斯堡王朝谱系依史料转录。卡洛斯二世的近交系数 F≈0.254 是 Alvarez et al. 2009 在完整约 3000 人、16 代谱系上算出的公开值；本示例只呈现导致其近交的主要环路（子集），并非用于复算该系数。REAL dynasty; the F≈0.254 figure is Alvarez 2009’s value computed on the FULL genealogy, not reproduced by this subset.',
  description: '王室近亲婚配的教科书范例：连续的叔侄婚与表亲婚使近交系数逐代累积，终结于身心残疾、无嗣的卡洛斯二世，哈布斯堡西班牙支绝嗣（其近交系数 F≈0.254 为 Alvarez 2009 在完整谱系上算出的公开值；本示例呈现的是主要近亲环路，非用于复算）。软件仅凭家系结构即自动识别 6 桩近亲婚配并画出双横线；「哈布斯堡下颌」（下颌前突）标注在文献记载最明确的个体上，可见该性状沿近交主线聚集并加重。先证者为卡洛斯二世。',
  descriptionEn: 'The textbook pedigree of royal inbreeding: successive uncle–niece and cousin marriages compound the inbreeding coefficient generation by generation, ending in the disabled, infertile Charles II and the extinction of the Spanish Habsburgs (his F≈0.254 is Alvarez 2009’s figure from the FULL genealogy — this showcase renders the principal consanguineous loops, not the exact coefficient). From the structure alone the app auto-detects six consanguineous unions and draws the double-lines; the "Habsburg jaw" (mandibular prognathism) is marked on the best-documented cases, clustering along the inbred line. Proband: Charles II.',
  proband: 'Carlos II de España',

  people: {
    // ---- Apex founders ----
    'Fernando II de Aragón': M('天主教国王斐迪南二世'),
    'Isabel I de Castilla': F('天主教女王伊莎贝拉一世'),
    'Maximiliano I': { sex: 'M', affected: J, note: '神圣罗马皇帝马克西米利安一世——「哈布斯堡下颌」的著名早期病例。' },
    'María de Borgoña': F('勃艮第的玛丽'),
    'Manuel I de Portugal': M('葡萄牙国王曼努埃尔一世（娶阿拉贡的玛丽亚）'),
    'Ana de Bohemia': F('波希米亚与匈牙利的安娜（斐迪南一世之妻）'),
    'Ana de Baviera': F('巴伐利亚的玛丽亚·安娜（内奥地利大公卡尔二世之妻）'),
    'Ana de Baviera II': F('巴伐利亚的玛丽亚·安娜（皇帝斐迪南二世之妻）'),

    // ---- Gen 2 ----
    'Juana I de Castilla': F('胡安娜一世（疯女胡安娜）'),
    'María de Aragón': F('阿拉贡的玛丽亚（伊莎贝拉一世之女）'),
    'Felipe I el Hermoso': M('美男子腓力一世'),
    'Isabel de Portugal': F('葡萄牙的伊莎贝拉'),

    // ---- Gen 3 ----
    'Carlos V': { sex: 'M', affected: J, note: '查理五世 / 卡洛斯一世——下颌前突显著，进食困难见于史载。' },
    'Fernando I': M('斐迪南一世（哈布斯堡奥地利支祖）'),

    // ---- Gen 4 ----
    'Felipe II': M('腓力二世'),
    'María de Austria': F('奥地利的玛丽亚（查理五世之女）'),
    'Maximiliano II': M('神圣罗马皇帝马克西米利安二世'),
    'Carlos II de Estiria': M('内奥地利大公卡尔二世'),

    // ---- Gen 5 ----
    'Ana de Austria': F('奥地利的安娜（腓力二世第四任妻，同时是其外甥女）'),
    'Margarita de Austria': F('奥地利的玛格丽特（腓力三世之妻）'),
    'Fernando II Emperador': M('神圣罗马皇帝斐迪南二世'),

    // ---- Gen 6 ----
    'Felipe III': M('腓力三世'),
    'Fernando III Emperador': M('神圣罗马皇帝斐迪南三世'),

    // ---- Gen 7 ----
    'Felipe IV': { sex: 'M', affected: J, note: '腓力四世——下颌前突明显。' },
    'María Ana de España': F('西班牙的玛丽亚·安娜（腓力四世之姐）'),

    // ---- Gen 8 ----
    'Mariana de Austria': F('奥地利的玛丽安娜（腓力四世之侄女，后为其妻）'),

    // ---- Gen 9 ----
    'Carlos II de España': { sex: 'M', affected: J, consultand: true, note: '卡洛斯二世（1661–1700）：近交系数 F≈0.254，「哈布斯堡下颌」极重，身心残疾、无嗣，西班牙哈布斯堡支绝嗣。' },
    'Margarita Teresa': F('玛格丽特·特蕾莎（后嫁其舅舅利奥波德一世）'),
  },

  unions: [
    { a: 'Fernando II de Aragón', b: 'Isabel I de Castilla', children: ['Juana I de Castilla', 'María de Aragón'] },
    { a: 'Maximiliano I', b: 'María de Borgoña', children: ['Felipe I el Hermoso'] },
    { a: 'Manuel I de Portugal', b: 'María de Aragón', children: ['Isabel de Portugal'] },
    { a: 'Felipe I el Hermoso', b: 'Juana I de Castilla', children: ['Carlos V', 'Fernando I'] },
    { a: 'Carlos V', b: 'Isabel de Portugal', children: ['Felipe II', 'María de Austria'] },          // 表亲
    { a: 'Fernando I', b: 'Ana de Bohemia', children: ['Maximiliano II', 'Carlos II de Estiria'] },
    { a: 'Maximiliano II', b: 'María de Austria', children: ['Ana de Austria'] },                       // 一代表亲
    { a: 'Carlos II de Estiria', b: 'Ana de Baviera', children: ['Margarita de Austria', 'Fernando II Emperador'] },
    { a: 'Felipe II', b: 'Ana de Austria', children: ['Felipe III'] },                                  // 叔侄（腓力二世娶外甥女）
    { a: 'Fernando II Emperador', b: 'Ana de Baviera II', children: ['Fernando III Emperador'] },
    { a: 'Felipe III', b: 'Margarita de Austria', children: ['Felipe IV', 'María Ana de España'] },     // 表亲
    { a: 'Fernando III Emperador', b: 'María Ana de España', children: ['Mariana de Austria'] },        // 表亲
    { a: 'Felipe IV', b: 'Mariana de Austria', children: ['Carlos II de España', 'Margarita Teresa'] }, // 叔侄
  ],
};
