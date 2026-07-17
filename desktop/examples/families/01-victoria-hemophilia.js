'use strict';

// Queen Victoria's haemophilia B pedigree — the textbook X-linked recessive family.
// Structure and carrier/affected assignments transcribed from the historical record and
// corroborated against the genetics source: Rogaev EI et al., "Genotype Analysis Identifies
// the Cause of the 'Royal Disease'," Science 2009;326(5954):817 (F9 IVS3-3A>G, identified from
// the Romanov remains — Alexei affected, Alexandra a carrier). Obligate-carrier status is by
// transmission logic (each has an affected son, or is a daughter of the affected Leopold).
// Distant unaffected branches are pruned as carrying no haemophilia information.
//
// Proband: Alexei (the DNA-confirmed affected case through whom the family is best known).
// Cousin marriage Irene x Henry of Prussia is a first-cousin union — the app draws the
// consanguinity double line automatically from the shared Victoria/Albert ancestry.

var H = 'Hemophilia B';

module.exports = {
  id: '513f1faf-c008-4f20-9509-fe0d76a6ed9e',
  title: '维多利亚女王血友病家系 · Queen Victoria — Hemophilia B',
  project: '示例家系 · Example pedigrees',
  size: 'large',
  inheritance: 'X-linked recessive',
  condition: H,
  gene: 'F9',
  citation: "Rogaev EI et al. Science 2009;326:817 (doi:10.1126/science.1180660).",
  provenance: '真实历史家系;致病基因(F9血友病B)由 Rogaev EI et al. Science 2009;326:817 从Romanov遗骸证实,结构对照史料。REAL family, mutation confirmed by Rogaev 2009.',
  description: 'X连锁隐性遗传的经典范例：血友病B(凝血因子IX缺陷)在欧洲王室中的传递。女性携带者(中心圆点)、患病男性(填充)，女传子/隔代显现。先证者为末代皇储阿列克谢。',
  descriptionEn: 'A classic example of X-linked recessive inheritance: hemophilia B (factor IX deficiency) transmitted through the royal houses of Europe. Female carriers (central dot) and affected males (filled), with mother-to-son transmission and skipped generations. The proband is Tsarevich Alexei.',
  proband: 'Alexei',

  people: {
    // ---- Generation I ----
    Victoria:      { sex: 'F', carrier: true, note: 'Queen Victoria (1819–1901). Founding obligate carrier; the F9 mutation is presumed de novo (no prior family history).' },
    Albert:        { sex: 'M', note: 'Prince Albert, the Prince Consort (1819–1861).' },

    // ---- Generation II: children of Victoria & Albert (+ married-in spouses) ----
    Vicky:         { sex: 'F', note: 'Victoria, Princess Royal → German Empress. Non-carrier line except via son Henry of Prussia.' },
    EdwardVII:     { sex: 'M', note: 'King Edward VII — unaffected; the British throne line runs clear of haemophilia.' },
    Alice:         { sex: 'F', carrier: true, note: 'Grand Duchess of Hesse. Obligate carrier — son Friedrich affected; daughters Irene and Alix carriers.' },
    Alfred:        { sex: 'M', note: 'Duke of Edinburgh / Saxe-Coburg.' },
    Helena:        { sex: 'F', note: 'Princess Helena — not a carrier.' },
    Louise:        { sex: 'F', note: 'Duchess of Argyll — no children.' },
    Arthur:        { sex: 'M', note: 'Duke of Connaught.' },
    Leopold:       { sex: 'M', affected: H, gene: 'F9', note: 'Duke of Albany (1853–1884). Haemophiliac; died age 30 of a brain haemorrhage after a fall.' },
    Beatrice:      { sex: 'F', carrier: true, note: 'Princess Beatrice. Obligate carrier — sons Leopold and Maurice affected; daughter Ena a carrier.' },
    FrederickIII:  { sex: 'M', note: 'German Emperor Frederick III (married in).' },
    LouisIV_Hesse: { sex: 'M', note: 'Grand Duke Ludwig IV of Hesse (married in).' },
    HelenaWaldeck: { sex: 'F', note: 'Helena of Waldeck-Pyrmont (married in).' },
    HenryBattenberg: { sex: 'M', note: 'Prince Henry of Battenberg (married in).' },

    // ---- Generation III: grandchildren (+ married-in spouses) ----
    HenryPrussia:  { sex: 'M', note: 'Prince Henry of Prussia. Married his first cousin Irene.' },
    VictoriaHesse: { sex: 'F', note: 'Princess Victoria of Hesse — non-carrier; ancestress of the Mountbattens (own line pruned).' },
    Ella:          { sex: 'F', note: 'Grand Duchess Elisabeth — non-carrier; no children.' },
    Irene:         { sex: 'F', carrier: true, note: 'Princess Irene. Obligate carrier — sons Waldemar and Heinrich affected.' },
    Ernie:         { sex: 'M', note: 'Ernest Louis, Grand Duke of Hesse.' },
    Frittie:       { sex: 'M', affected: H, gene: 'F9', note: 'Friedrich of Hesse (1870–1873). Died age 2 of haemorrhage after a fall; haemophilia diagnosed months earlier.' },
    Alix:          { sex: 'F', carrier: true, note: 'Empress Alexandra Feodorovna. Carrier confirmed by Rogaev 2009 (Romanov DNA).' },
    MarieHesse:    { sex: 'F', note: 'Princess Marie of Hesse — died age 4 of diphtheria.' },
    Drino:         { sex: 'M', note: 'Alexander Mountbatten, Marquess of Carisbrooke.' },
    Ena:           { sex: 'F', carrier: true, note: 'Victoria Eugenie, Queen of Spain. Obligate carrier — sons Alfonso and Gonzalo affected.' },
    LeopoldBattenberg: { sex: 'M', affected: H, gene: 'F9', note: 'Lord Leopold Mountbatten (1889–1922). Died during a hip operation.' },
    MauriceBattenberg: { sex: 'M', affected: H, gene: 'F9', note: 'Prince Maurice of Battenberg (1891–1914). Killed in action, WWI.' },
    AliceAlbany:   { sex: 'F', carrier: true, note: 'Alice, Countess of Athlone. Obligate carrier — daughter of the affected Leopold, and son Rupert affected.' },
    CharlesEdward: { sex: 'M', note: 'Duke of Saxe-Coburg-Gotha. Son of an affected father → unaffected (fathers pass X only to daughters).' },
    NicholasII:    { sex: 'M', note: 'Tsar Nicholas II (married in).' },
    AlfonsoXIII:   { sex: 'M', note: 'King Alfonso XIII of Spain (married in).' },
    AlexanderTeck: { sex: 'M', note: 'Alexander, Earl of Athlone (married in).' },

    // ---- Generation IV: great-grandchildren (generation of Alexei) ----
    Waldemar:      { sex: 'M', affected: H, gene: 'F9', note: 'Prince Waldemar of Prussia (1889–1945). Son of the first-cousin union.' },
    Sigismund:     { sex: 'M', note: 'Prince Sigismund of Prussia — unaffected.' },
    HeinrichPrussia: { sex: 'M', affected: H, gene: 'F9', note: 'Prince Heinrich of Prussia (1900–1904). Died age 4 of a brain haemorrhage after a fall.' },
    Olga:          { sex: 'F', note: 'Grand Duchess Olga — 50% prior carrier risk; no offspring; executed 1918.' },
    Tatiana:       { sex: 'F', note: 'Grand Duchess Tatiana — 50% prior carrier risk; executed 1918.' },
    MariaRomanov:  { sex: 'F', note: 'Grand Duchess Maria — carrier status unresolved (US researchers identify her as the DNA-confirmed carrier daughter).' },
    Anastasia:     { sex: 'F', carrier: true, note: 'Grand Duchess Anastasia — the second-grave female was a DNA-confirmed F9 carrier (Rogaev 2009); Russian researchers identify her as Anastasia.' },
    Alexei:        { sex: 'M', affected: H, gene: 'F9', note: 'Tsarevich Alexei (1904–1918). Heir to the Russian throne; haemophilia DNA-confirmed (Rogaev 2009). The proband.' },
    AlfonsoAsturias: { sex: 'M', affected: H, gene: 'F9', note: 'Alfonso, Prince of Asturias (1907–1938). Bled to death after a car accident.' },
    Jaime:         { sex: 'M', note: 'Infante Jaime, Duke of Segovia — deaf from childhood surgery, NOT haemophilia.' },
    Beatriz:       { sex: 'F', note: 'Infanta Beatriz — presumed non-carrier (no affected descendants).' },
    MariaCristina: { sex: 'F', note: 'Infanta Maria Cristina — presumed non-carrier.' },
    Juan:          { sex: 'M', note: 'Infante Juan, Count of Barcelona — unaffected; father of King Juan Carlos I.' },
    Gonzalo:       { sex: 'M', affected: H, gene: 'F9', note: 'Infante Gonzalo (1914–1934). Bled to death after a car accident, age 19.' },
    MayTeck:       { sex: 'F', note: 'Lady May Cambridge — presumed non-carrier.' },
    Rupert:        { sex: 'M', affected: H, gene: 'F9', note: 'Rupert Cambridge, Viscount Trematon (1907–1928). Died of haemorrhage after a car accident.' },
    MauriceTeck:   { sex: 'M', note: 'Prince Maurice of Teck — died in infancy; possibly affected (unresolved).' },
  },

  unions: [
    { a: 'Victoria', b: 'Albert', children: ['Vicky', 'EdwardVII', 'Alice', 'Alfred', 'Helena', 'Louise', 'Arthur', 'Leopold', 'Beatrice'] },

    { a: 'Vicky', b: 'FrederickIII', children: ['HenryPrussia'] },
    { a: 'Alice', b: 'LouisIV_Hesse', children: ['VictoriaHesse', 'Ella', 'Irene', 'Ernie', 'Frittie', 'Alix', 'MarieHesse'] },
    { a: 'Leopold', b: 'HelenaWaldeck', children: ['AliceAlbany', 'CharlesEdward'] },
    { a: 'Beatrice', b: 'HenryBattenberg', children: ['Drino', 'Ena', 'LeopoldBattenberg', 'MauriceBattenberg'] },

    { a: 'HenryPrussia', b: 'Irene', children: ['Waldemar', 'Sigismund', 'HeinrichPrussia'] },  // first cousins
    { a: 'NicholasII', b: 'Alix', children: ['Olga', 'Tatiana', 'MariaRomanov', 'Anastasia', 'Alexei'] },
    { a: 'AlfonsoXIII', b: 'Ena', children: ['AlfonsoAsturias', 'Jaime', 'Beatriz', 'MariaCristina', 'Juan', 'Gonzalo'] },
    { a: 'AlexanderTeck', b: 'AliceAlbany', children: ['MayTeck', 'Rupert', 'MauriceTeck'] },
  ],
};
