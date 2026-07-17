'use strict';

// Down syndrome (trisomy 21) — a small SPORADIC/chromosomal example. Most cases are de novo
// nondisjunction and recurrence risk is low; risk rises with maternal age. Grounded in standard
// cytogenetics (free trisomy 21). Shows a chromosomal disorder plus a pregnancy loss.
//
// Teaching / test points: a sporadic affected individual (no vertical transmission); advanced
// maternal age as a risk factor (recorded as a comment); a miscarriage drawn as a small loss
// triangle. Contrast with the Mendelian families: here there is a single affected child and no
// pattern of inheritance.

var DS = 'Down syndrome';

module.exports = {
  id: '8467a519-1978-4e2d-863c-4a40e3ea2550',
  title: '唐氏综合征(21三体) · Down syndrome (trisomy 21, sporadic)',
  project: '示例家系 · Example pedigrees',
  size: 'small',
  inheritance: 'Chromosomal (sporadic, trisomy 21)',
  condition: DS,
  gene: '',
  citation: 'Standard cytogenetics (free trisomy 21).',
  provenance: '代表性散发病例,依据标准细胞遗传学(游离21三体,多为新发不分离)。REPRESENTATIVE sporadic case.',
  description: '小型散发/染色体病范例：多为新发不分离、再发风险低、随母亲年龄升高。展示染色体病与一次自然流产。无纵向遗传模式，仅一名患儿。先证者为唐氏患儿。',
  descriptionEn: 'A small sporadic/chromosomal example: usually de novo nondisjunction, low recurrence risk that rises with maternal age. Shows a chromosomal disorder plus one spontaneous miscarriage. No vertical inheritance pattern, a single affected child. The proband is the child with Down syndrome.',
  proband: 'Child2',

  people: {
    'GF': { sex: 'M', note: 'Maternal grandfather.' },
    'GM': { sex: 'F', note: 'Maternal grandmother.' },

    'Mother': { sex: 'F', note: 'Mother — advanced maternal age (39 at this pregnancy), a risk factor for trisomy 21.' },
    'Aunt':   { sex: 'F', note: 'Unaffected sib of the mother.' },
    'Father': { sex: 'M', note: 'Father.' },

    'Child1': { sex: 'M', note: 'Unaffected older sib.' },
    'Child2': { sex: 'M', affected: DS, note: 'PROBAND. Down syndrome (free trisomy 21) — a de novo event; parents karyotypically normal.' },
    'Loss':   { sex: 'U', lifeStatus: 'miscarriage', note: 'First-trimester miscarriage.' },
  },

  unions: [
    { a: 'GF', b: 'GM', children: ['Mother', 'Aunt'] },
    { a: 'Father', b: 'Mother', children: ['Child1', 'Child2', 'Loss'] },
  ],
};
