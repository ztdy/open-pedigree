'use strict';

// Cystic fibrosis — autosomal recessive, CFTR (e.g. p.Phe508del homozygous in the affected).
// A clinically faithful REPRESENTATIVE carrier-couple family (CF is the textbook AR example in
// people of European ancestry; carrier frequency ~1/25). Grounded in standard CF genetics
// (Cystic Fibrosis Foundation / CFTR2). Non-consanguineous: two unrelated carrier lineages meet.
//
// Teaching points: two phenotypically NORMAL carrier parents; ~1/4 of their children affected;
// carrier and non-carrier children distinguished only by testing; horizontal (sibship) clustering
// with no affected individuals elsewhere — the hallmark of autosomal recessive inheritance.

var CF = 'Cystic fibrosis', G = 'CFTR';

module.exports = {
  id: '64e0eb53-74a4-4674-a904-f4e6885b940b',
  title: '囊性纤维化 · Cystic fibrosis (autosomal recessive)',
  project: '示例家系 · Example pedigrees',
  size: 'medium',
  inheritance: 'Autosomal recessive',
  condition: CF,
  gene: G,
  citation: 'Standard CF genetics (Cystic Fibrosis Foundation; CFTR2 database).',
  provenance: '代表性携带者家系,依据标准CF遗传学(Cystic Fibrosis Foundation / CFTR2)。REPRESENTATIVE carrier-couple family.',
  description: '常染色体隐性经典范例：两位表型正常的携带者父母，约1/4子女患病；携带者与非携带者仅靠检测区分；同胞组内水平聚集、家系其他部位无患者。先证者 III-1。',
  descriptionEn: 'A classic autosomal recessive example: two phenotypically normal carrier parents, about 1/4 of children affected; carriers and non-carriers are distinguished only by testing; horizontal clustering within one sibship with no affected individuals elsewhere in the family. Proband III-1.',
  proband: 'III-1',

  people: {
    'I-1': { sex: 'M', carrier: true, gene: G, note: 'Obligate carrier (paternal grandfather).' },
    'I-2': { sex: 'F', note: 'Non-carrier (paternal grandmother).' },
    'I-3': { sex: 'M', note: 'Non-carrier (maternal grandfather).' },
    'I-4': { sex: 'F', carrier: true, gene: G, note: 'Obligate carrier (maternal grandmother).' },

    'II-1': { sex: 'M', carrier: true, gene: G, note: 'Carrier father — phenotypically normal.' },
    'II-2': { sex: 'F', carrier: true, gene: G, note: 'Carrier mother — phenotypically normal (unrelated to the father).' },
    'II-3': { sex: 'F', note: 'Unaffected sib of the father.' },
    'II-4': { sex: 'M', note: 'Unaffected sib of the mother.' },

    'III-1': { sex: 'M', affected: CF, gene: G, note: 'PROBAND. Cystic fibrosis; homozygous CFTR pathogenic variant.' },
    'III-2': { sex: 'F', carrier: true, gene: G, note: 'Carrier by testing — unaffected.' },
    'III-3': { sex: 'M', note: 'Non-carrier by testing.' },
    'III-4': { sex: 'F', affected: CF, gene: G, note: 'Affected sib — cystic fibrosis.' },
  },

  unions: [
    { a: 'I-1', b: 'I-2', children: ['II-1', 'II-3'] },
    { a: 'I-3', b: 'I-4', children: ['II-2', 'II-4'] },
    { a: 'II-1', b: 'II-2', children: ['III-1', 'III-2', 'III-3', 'III-4'] },
  ],
};
