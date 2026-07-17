'use strict';

// Marfan syndrome — autosomal dominant, FBN1. A small example centered on a DE NOVO mutation:
// about a quarter of Marfan cases arise from a new FBN1 variant with no affected parent, and the
// newly-affected individual then transmits it dominantly. Grounded in standard FBN1/Marfan genetics
// (Ghent nosology; ~25% de novo).
//
// Teaching / test points: a de novo dominant variant (unaffected parents -> first affected
// individual), then classic vertical autosomal dominant transmission to the next generation
// (affected parent -> ~50% affected child). Contrast with the recessive and X-linked families.

var MF = 'Marfan syndrome', G = 'FBN1';

module.exports = {
  id: '7a0c4cba-1c68-4cf1-aa0f-63897bb14829',
  title: '马凡综合征(新发显性) · Marfan syndrome (de novo dominant)',
  project: '示例家系 · Example pedigrees',
  size: 'small',
  inheritance: 'Autosomal dominant (de novo)',
  condition: MF,
  gene: G,
  citation: 'Standard FBN1 / Marfan genetics (Ghent nosology; ~25% de novo).',
  provenance: '代表性家系,依据 Ghent 诊断标准(约1/4马凡为新发FBN1变异)。REPRESENTATIVE, de novo per Ghent nosology.',
  description: '小型范例，聚焦新发(de novo)显性突变：约1/4马凡综合征为无患病父母的新发FBN1变异，此后按显性纵向传递。展示"未患病父母→首位患者(新发)→下一代约50%患病"。与隐性、X连锁家系形成对照。先证者 II-1。',
  descriptionEn: 'A small example focused on a de novo dominant mutation: about 1/4 of Marfan cases are de novo FBN1 variants with unaffected parents, transmitted dominantly thereafter. Shows "unaffected parents -> first affected individual (de novo) -> ~50% affected in the next generation". A counterpoint to the recessive and X-linked families. Proband II-1.',
  proband: 'II-1',

  people: {
    'I-1': { sex: 'M', note: 'Unaffected — clinically and molecularly normal.' },
    'I-2': { sex: 'F', note: 'Unaffected — clinically and molecularly normal.' },

    'II-1': { sex: 'F', affected: MF, gene: G, note: 'PROBAND. First affected individual — a DE NOVO FBN1 variant (~25% of Marfan is de novo).' },
    'II-2': { sex: 'M', note: 'Unaffected sib.' },
    'II-3': { sex: 'M', note: 'Married in — unaffected.' },

    'III-1': { sex: 'M', affected: MF, gene: G, note: 'Inherited the FBN1 variant from his affected mother (dominant transmission).' },
    'III-2': { sex: 'F', note: 'Did not inherit the variant — unaffected.' },
  },

  unions: [
    { a: 'I-1', b: 'I-2', children: ['II-1', 'II-2'] },
    { a: 'II-3', b: 'II-1', children: ['III-1', 'III-2'] },
  ],
};
