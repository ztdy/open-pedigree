'use strict';

// A large consanguineous kindred segregating autosomal recessive primary microcephaly (MCPH),
// gene WDR62 (MCPH2, 19q13.12). REPRESENTATIVE structure modeled faithfully on real consanguineous
// Pakistani MCPH families: Kousar R et al., "Mutations in WDR62 gene in Pakistani families with
// autosomal recessive primary microcephaly," BMC Neurol 2011;11:119 (PMID 21961505); and Hussain MS
// et al., "CDK6 ... mutated in a large Pakistani family with primary microcephaly," Hum Mol Genet
// 2013;22(25):5199 (PMID 23918663) — an 8-generation consanguineous kindred with 10 affected.
//
// Teaching points: autosomal RECESSIVE inheritance — affected only where two carrier lineages meet;
// three first-cousin marriages (drawn automatically as consanguinity DOUBLE lines) concentrate a
// single founder allele so affected homozygotes appear only in the cousin-marriage sibships;
// horizontal (sibship) clustering rather than vertical transmission; parents of affected children
// are obligate heterozygous carriers.

var MC = 'Microcephaly', G = 'WDR62';

module.exports = {
  id: '2196fc20-24e0-405d-8ad6-ac6b2ab46f16',
  title: '近亲婚配·常染色体隐性小头畸形 · Consanguineous autosomal recessive microcephaly',
  project: '示例家系 · Example pedigrees',
  size: 'large',
  inheritance: 'Autosomal recessive (consanguineous)',
  condition: MC,
  gene: G,
  citation: 'Kousar R et al. BMC Neurol 2011;11:119 (PMID 21961505); Hussain MS et al. Hum Mol Genet 2013;22:5199 (PMID 23918663).',
  provenance: '代表性家系,仿真实巴基斯坦近亲MCPH家系 Kousar R et al. BMC Neurol 2011;11:119 与 Hussain MS et al. HMG 2013;22:5199(图为位图无法逐格转录)。REPRESENTATIVE consanguineous kindred.',
  description: '大型近亲婚配家系，常染色体隐性原发性小头畸形(WDR62)。三对表亲联姻(自动绘成双线consanguinity环)使单一奠基者等位基因富集，患病纯合子仅出现在表亲婚配的同胞组内；水平(同胞)聚集而非纵向传递；患儿父母均为专性杂合携带者。先证者 IV-1。',
  descriptionEn: 'A large consanguineous family with autosomal recessive primary microcephaly (WDR62). Three cousin marriages (auto-drawn as double consanguinity lines) concentrate a single founder allele, so affected homozygotes appear only within the sibships of cousin unions; horizontal (sibling) clustering rather than vertical transmission; both parents of an affected child are obligate heterozygous carriers. Proband IV-1.',
  proband: 'IV-1',

  people: {
    // Gen I — founder carrier couple (the whole disease allele traces to them)
    'I-1': { sex: 'M', carrier: true, note: 'Founder — obligate heterozygous carrier.' },
    'I-2': { sex: 'F', carrier: true, note: 'Founder — obligate heterozygous carrier.' },

    // Gen II — four sib carriers of the founders + married-in (non-carrier) spouses
    'II-1': { sex: 'M', note: 'Married in (non-carrier).' },
    'II-2': { sex: 'F', carrier: true, note: 'Daughter of founders — obligate carrier.' },
    'II-3': { sex: 'M', note: 'Married in (non-carrier).' },
    'II-4': { sex: 'F', carrier: true, note: 'Daughter of founders — obligate carrier.' },
    'II-5': { sex: 'M', note: 'Married in (non-carrier).' },
    'II-6': { sex: 'F', carrier: true, note: 'Daughter of founders — obligate carrier.' },
    'II-7': { sex: 'M', note: 'Married in (non-carrier).' },
    'II-8': { sex: 'F', carrier: true, note: 'Daughter of founders — obligate carrier.' },

    // Gen III — the reproducing first cousins (obligate carriers) + unaffected sibs
    'III-1':  { sex: 'F', note: 'Unaffected.' },
    'III-2':  { sex: 'M', carrier: true, note: 'Obligate carrier; marries his first cousin III-4.' },
    'III-3':  { sex: 'F', note: 'Unaffected.' },
    'III-4':  { sex: 'F', carrier: true, note: 'Obligate carrier; first cousin of III-2 (their mothers II-2 and II-4 are sisters).' },
    'III-5':  { sex: 'M', note: 'Unaffected.' },
    'III-6':  { sex: 'M', carrier: true, note: 'Obligate carrier; marries his first cousin III-8.' },
    'III-7':  { sex: 'F', note: 'Unaffected.' },
    'III-8':  { sex: 'F', carrier: true, note: 'Obligate carrier; first cousin of III-6.' },
    'III-9':  { sex: 'F', carrier: true, note: 'Obligate carrier; marries her first cousin III-11.' },
    'III-10': { sex: 'M', note: 'Unaffected.' },
    'III-11': { sex: 'M', carrier: true, note: 'Obligate carrier; first cousin of III-9.' },
    'III-12': { sex: 'F', note: 'Unaffected.' },

    // Gen IV — affected homozygotes appear only in the cousin-marriage sibships
    'IV-1':  { sex: 'M', affected: MC, gene: G, note: 'PROBAND. Microcephaly (OFC −6 SD), intellectual disability; homozygous WDR62.' },
    'IV-2':  { sex: 'F', affected: MC, gene: G, note: 'Microcephaly, intellectual disability.' },
    'IV-3':  { sex: 'M', note: 'Unaffected sib.' },
    'IV-4':  { sex: 'U', affected: MC, gene: G, lifeStatus: 'stillborn', note: 'Severely affected; stillborn.' },
    'IV-5':  { sex: 'F', affected: MC, gene: G, note: 'Microcephaly, intellectual disability.' },
    'IV-6':  { sex: 'M', note: 'Unaffected sib.' },
    'IV-7':  { sex: 'M', affected: MC, gene: G, deceased: true, note: 'Microcephaly with seizures; died in childhood.' },
    'IV-8':  { sex: 'F', affected: MC, gene: G, note: 'Microcephaly, intellectual disability.' },
    'IV-9':  { sex: 'F', note: 'Unaffected sib.' },
    'IV-10': { sex: 'M', note: 'Unaffected sib.' },
  },

  unions: [
    { a: 'I-1', b: 'I-2', children: ['II-2', 'II-4', 'II-6', 'II-8'] },
    { a: 'II-1', b: 'II-2', children: ['III-1', 'III-2', 'III-3'] },
    { a: 'II-3', b: 'II-4', children: ['III-4', 'III-5', 'III-6'] },
    { a: 'II-5', b: 'II-6', children: ['III-7', 'III-8', 'III-9'] },
    { a: 'II-7', b: 'II-8', children: ['III-10', 'III-11', 'III-12'] },
    { a: 'III-2', b: 'III-4', children: ['IV-1', 'IV-2', 'IV-3', 'IV-4'] },  // first cousins
    { a: 'III-6', b: 'III-8', children: ['IV-5', 'IV-6', 'IV-7'] },          // first cousins
    { a: 'III-11', b: 'III-9', children: ['IV-8', 'IV-9', 'IV-10'] },        // first cousins
  ],
};
