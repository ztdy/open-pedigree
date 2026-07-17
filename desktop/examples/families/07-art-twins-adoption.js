'use strict';

// A structural showcase (and feature test case): assisted reproduction, twinning and adoption in
// one family. No disease — it exists to exercise the symbols a clinician needs for modern family
// structures. Conventions follow NSGC (Bennett et al. 2022): monozygotic twins joined by a
// horizontal line; dizygotic twins share an apex; unknown zygosity marked "?"; a gamete donor
// annotated "D"; an adopted-in individual bracketed.
//
// Teaching / test points: monozygotic vs dizygotic vs unknown-zygosity twin sets; a gamete (egg)
// donor drawn as the genetic parent marked "D"; an adopted-in child; and an infertile individual.

module.exports = {
  id: '40ea5735-a43c-4a4a-84ed-3b7c31e3d3d0',
  title: '辅助生殖·双胎·收养 · Assisted reproduction, twins & adoption',
  project: '示例家系 · Example pedigrees',
  size: 'medium',
  inheritance: 'n/a (structural showcase)',
  condition: '',
  gene: '',
  citation: 'NSGC pedigree nomenclature (Bennett RL et al., J Genet Couns 2022;31:1238).',
  provenance: '结构演示(非真实疾病家系),符号依据 NSGC Bennett RL et al. JGC 2022;31:1238。Structural showcase, symbols per NSGC 2022.',
  description: '结构演示与测试用例(非疾病家系)：单卵双胎(横线相连)、双卵双胎(共顶点)、合子性未知(标?)、配子(供卵)供者(标D)、收养(方括号)、不育个体。用于检验现代家庭结构的各类符号。先证者 T1。',
  descriptionEn: 'A structural showcase and test case (not a disease family): monozygotic twins (joined by a horizontal line), dizygotic twins (shared apex), unknown zygosity (marked ?), a gamete (ovum) donor (marked D), adoption (square brackets) and an infertile individual. Used to exercise the symbols for modern family structures. Proband T1.',
  proband: 'T1',

  people: {
    'GF': { sex: 'M', note: 'Grandfather.' },
    'GM': { sex: 'F', note: 'Grandmother.' },

    'MotherA':     { sex: 'F', note: 'Mother of the twin sets.' },
    'FatherA':     { sex: 'M', note: 'Father (married in).' },
    'MotherB':     { sex: 'F', note: 'Mother in the adoption branch.' },
    'FatherB':     { sex: 'M', note: 'Father (married in).' },
    'RecipientDad':{ sex: 'M', note: 'Used a donor egg with his partner; the child\'s genetic mother is the egg donor.' },
    'EggDonor':    { sex: 'F', artRole: 'D', note: 'Egg (gamete) donor — the genetic mother, marked "D".' },
    'UncleInf':    { sex: 'M', childless: 'infertile', note: 'Infertile — no children.' },

    'T1': { sex: 'F', note: 'PROBAND. Monozygotic twin.' },
    'T2': { sex: 'F', note: 'Monozygotic twin of T1 (identical).' },
    'T3': { sex: 'M', note: 'Dizygotic twin.' },
    'T4': { sex: 'F', note: 'Dizygotic twin of T3 (fraternal).' },

    'BioKid':     { sex: 'M', note: 'Biological child.' },
    'AdoptedKid': { sex: 'F', adopted: true, note: 'Adopted into the family (brackets).' },

    'Tz1': { sex: 'M', note: 'Twin conceived with a donor egg; zygosity not established.' },
    'Tz2': { sex: 'M', note: 'Twin conceived with a donor egg; zygosity not established.' },
  },

  unions: [
    { a: 'GF', b: 'GM', children: ['MotherA', 'MotherB', 'RecipientDad', 'UncleInf'] },
    { a: 'FatherA', b: 'MotherA', children: ['T1', 'T2', 'T3', 'T4'],
      twins: [{ members: ['T1', 'T2'], mono: true }, { members: ['T3', 'T4'] }] },
    { a: 'FatherB', b: 'MotherB', children: ['BioKid', 'AdoptedKid'] },
    { a: 'RecipientDad', b: 'EggDonor', children: ['Tz1', 'Tz2'],
      twins: [{ members: ['Tz1', 'Tz2'], unknown: true }] },
  ],
};
