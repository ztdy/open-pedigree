'use strict';

// Mitochondrial disease — MELAS spectrum, m.3243A>G in MT-TL1 (mtDNA tRNA-Leu(UUR)),
// heteroplasmic and MATERNALLY inherited. REPRESENTATIVE pedigree grounded in the individual-level
// data of Pallotti F et al., "A wide range of 3243A>G/tRNALeu(UUR) (MELAS) mutation loads may
// segregate in offspring through the female germline bottleneck," PLoS One 2014;9(5):e96663
// (PMID 24805791). One representative affected male with unaffected children is added to make the
// complementary rule explicit (the real lineages in the paper had no affected father with offspring).
//
// Teaching points (the maternal-inheritance signature): an affected/carrier MOTHER can transmit to
// all of her children (II-3, II-5 -> affected/carrier offspring), while an affected FATHER (II-1)
// transmits to NONE of his children (they are all unaffected) — because mtDNA passes only through
// the egg. Variable heteroplasmy gives a range of severity; a high-load conceptus is lost as a
// miscarriage.

var M = 'MELAS', G = 'MT-TL1';

module.exports = {
  id: 'f3299ffd-4e68-44f9-88cf-550e60fef124',
  title: '线粒体病·母系遗传 (MELAS) · Mitochondrial (maternal) inheritance',
  project: '示例家系 · Example pedigrees',
  size: 'medium',
  inheritance: 'Mitochondrial (maternal)',
  condition: M,
  gene: G,
  citation: 'Pallotti F et al. PLoS One 2014;9(5):e96663 (PMID 24805791).',
  provenance: '按 Pallotti F et al. PLoS One 2014;9:e96663 正文个体数据重建;另加一代表性患病父亲支以显示母系互补规则。Reconstructed from Pallotti 2014 text + one representative affected-father branch.',
  description: '线粒体(母系)遗传范例：MELAS，m.3243A>G。患病/携带母亲可将突变传给全部子女(II-3、II-5→患病/携带后代)，而患病父亲(II-1)不传给任何子女(全部未患病)——因mtDNA仅经卵子传递。异质性造成严重度不一；高负荷胚胎以流产丢失。先证者 III-3。',
  descriptionEn: 'An example of mitochondrial (maternal) inheritance: MELAS, m.3243A>G. An affected/carrier mother can transmit to all her children (II-3, II-5 -> affected/carrier offspring), whereas an affected father (II-1) transmits to none — because mtDNA passes only through the egg. Heteroplasmy causes variable severity; high-load embryos are lost as miscarriages. Proband III-3.',
  proband: 'III-3',

  people: {
    'I-1': { sex: 'M', note: 'Married in — cannot transmit mtDNA.' },
    'I-2': { sex: 'F', carrier: true, gene: G, note: 'Maternal-line founder carrier; low-level heteroplasmy (asymptomatic).' },

    'II-1': { sex: 'M', affected: M, gene: G, note: 'Affected SON. His children are all UNAFFECTED — an affected father does not transmit mtDNA.' },
    'II-2': { sex: 'F', note: 'Married in.' },
    'II-3': { sex: 'F', affected: M, gene: G, note: 'Affected DAUGHTER — transmits to her children.' },
    'II-4': { sex: 'M', note: 'Married in.' },
    'II-5': { sex: 'F', carrier: true, gene: G, note: 'Carrier daughter (migraine only); transmits to her children.' },
    'II-6': { sex: 'M', note: 'Married in.' },
    'II-7': { sex: 'M', note: 'Non-carrier son (0% mutant load).' },
    'II-m1': { sex: 'U', lifeStatus: 'miscarriage', note: 'Miscarriage — attributed to a very high mutant load.' },

    'III-1': { sex: 'M', note: 'Unaffected — affected father cannot transmit mtDNA.' },
    'III-2': { sex: 'F', note: 'Unaffected — affected father cannot transmit mtDNA.' },
    'III-3': { sex: 'M', affected: M, gene: G, note: 'PROBAND. Classic MELAS (stroke-like episodes, lactic acidosis); high muscle heteroplasmy.' },
    'III-4': { sex: 'F', carrier: true, gene: G, note: 'Carrier — intermediate heteroplasmy.' },
    'III-5': { sex: 'M', note: 'Unaffected (low/undetectable load).' },
    'III-6': { sex: 'F', affected: M, gene: G, note: 'Affected via her carrier mother.' },
    'III-7': { sex: 'M', note: 'Unaffected (low/undetectable load).' },
  },

  unions: [
    { a: 'I-1', b: 'I-2', children: ['II-1', 'II-3', 'II-5', 'II-7', 'II-m1'] },
    { a: 'II-1', b: 'II-2', children: ['III-1', 'III-2'] },
    { a: 'II-4', b: 'II-3', children: ['III-3', 'III-4', 'III-5'] },
    { a: 'II-6', b: 'II-5', children: ['III-6', 'III-7'] },
  ],
};
