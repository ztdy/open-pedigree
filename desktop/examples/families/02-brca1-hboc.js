'use strict';

// Hereditary breast & ovarian cancer (HBOC) segregating a BRCA1 pathogenic variant —
// autosomal dominant with reduced penetrance. A clinically faithful REPRESENTATIVE family
// (not one published figure), grounded in: Lynch HT et al., "Hereditary breast-ovarian cancer
// at the bedside," J Clin Oncol 2003;21(4):740-53 (PMID 12586815); and Mahdavi M et al.,
// "Hereditary breast cancer; genetic penetrance and current status with BRCA," J Cell Physiol
// 2019;234(5):5741-50 (PMID 30552672).
//
// Teaching points: vertical dominant transmission in every generation; male-to-male transmission
// (II-3 -> III-8, both carriers) proving the locus is autosomal not X-linked; cancer passing
// THROUGH unaffected/obligate-carrier males; reduced penetrance (unaffected carriers); HBOC
// hallmarks — young/bilateral breast cancer, ovarian cancer, BRCA1-associated prostate cancer,
// and risk-reducing (prophylactic) surgery in unaffected carriers.

var BC = 'Breast cancer', OC = 'Ovarian cancer', PC = 'Prostate cancer', G = 'BRCA1';

module.exports = {
  id: '102e6a62-f467-4fdf-a26d-1c9af8d639fb',
  title: '遗传性乳腺卵巢癌 · BRCA1 hereditary breast & ovarian cancer',
  project: '示例家系 · Example pedigrees',
  size: 'large',
  inheritance: 'Autosomal dominant (reduced penetrance)',
  condition: BC + ' / ' + OC,
  gene: G,
  citation: 'Lynch HT et al. J Clin Oncol 2003;21:740 (PMID 12586815); Mahdavi M et al. J Cell Physiol 2019;234:5741.',
  provenance: '代表性家系(非单一图谱转录),HBOC传递模式依据 Lynch HT et al. JCO 2003;21:740 与 Mahdavi M et al. JCP 2019;234:5741。REPRESENTATIVE, grounded in cited BRCA1 literature.',
  description: '常染色体显性、外显不全的癌症易感家系：乳腺癌(部分年轻/双侧)、卵巢癌纵向传递；男-男传递(II-3→III-8)证明为常染色体而非X连锁；癌可经未患病男性携带者传递；未患病携带者行预防性手术。先证者 III-1，34岁乳腺癌。',
  descriptionEn: 'An autosomal dominant, reduced-penetrance cancer-predisposition family: breast cancer (some young/bilateral) and ovarian cancer transmitted vertically; male-to-male transmission (II-3 -> III-8) proves the locus is autosomal, not X-linked; cancer can pass through unaffected male carriers; unaffected carriers undergo risk-reducing surgery. Proband III-1, breast cancer at 34.',
  proband: 'III-1',

  people: {
    'I-1':  { sex: 'M', note: 'Founder spouse — non-carrier; died of MI age 70.' },
    'I-2':  { sex: 'F', affected: [BC, OC], gene: G, note: 'Pedigree founder carrier. Breast cancer dx 42, ovarian cancer dx 55; died of ovarian cancer age 58.' },

    'II-1': { sex: 'F', affected: [BC], gene: G, note: 'Bilateral breast cancer dx 38 (R) and 45 (L); died age 52.' },
    'II-2': { sex: 'M', note: 'Married in.' },
    'II-3': { sex: 'M', affected: [PC], gene: G, note: 'Obligate carrier who transmits through an apparently unaffected male line; prostate cancer dx 68; died age 74.' },
    'II-4': { sex: 'F', note: 'Married in.' },
    'II-5': { sex: 'F', affected: [OC], gene: G, note: 'Ovarian cancer dx 49; risk-reducing mastectomy afterwards.' },
    'II-6': { sex: 'M', note: 'Married in.' },
    'II-7': { sex: 'M', genotype: 'BRCA1: negative', note: 'Tested non-carrier — did not inherit the variant.' },
    'II-9': { sex: 'F', carrier: true, gene: G, note: 'Unaffected carrier; prophylactic bilateral mastectomy + BSO at 40; no cancer.' },
    'II-10': { sex: 'M', note: 'Married in.' },

    'III-1':  { sex: 'F', affected: [BC], gene: G, genotype: 'BRCA1 c.68_69del (+)', consultand: true, note: 'PROBAND. Premenopausal breast cancer dx 34; prophylactic BSO at 40. Prompted family testing.' },
    'III-2':  { sex: 'M', note: 'Married in.' },
    'III-3':  { sex: 'M', note: 'Tested non-carrier.' },
    'III-5':  { sex: 'F', affected: [BC, OC], gene: G, note: 'Breast cancer dx 40, ovarian cancer dx 51 — cancer transmitted through her unaffected-appearing father II-3.' },
    'III-6':  { sex: 'M', note: 'Married in.' },
    'III-7':  { sex: 'F', note: 'Tested non-carrier.' },
    'III-8':  { sex: 'M', carrier: true, gene: G, note: 'Unaffected male carrier — proves autosomal transmission (II-3 → III-8, father to son). PSA surveillance.' },
    'III-9':  { sex: 'F', note: 'Married in.' },
    'III-10': { sex: 'F', carrier: true, gene: G, note: 'Unaffected carrier; prophylactic bilateral mastectomy at 36.' },
    'III-11': { sex: 'M', note: 'Married in.' },
    'III-12': { sex: 'M', carrier: true, gene: G, note: 'Unaffected male carrier; active surveillance.' },
    'III-13': { sex: 'F', note: 'Married in.' },
    'III-14': { sex: 'F', affected: [BC], gene: G, note: 'Breast cancer dx 44; born before her mother II-9\'s prophylactic surgery.' },
    'III-15': { sex: 'M', note: 'Married in.' },

    'IV-1':  { sex: 'F', affected: [BC], gene: G, note: 'Very young onset — breast cancer dx 31.' },
    'IV-2':  { sex: 'M', carrier: true, gene: G, note: 'Unaffected male carrier; screening and counseling.' },
    'IV-3':  { sex: 'F', note: 'Tested non-carrier.' },
    'IV-4':  { sex: 'F', carrier: true, gene: G, note: 'Unaffected carrier; enhanced MRI surveillance.' },
    'IV-5':  { sex: 'M', note: 'Tested non-carrier.' },
    'IV-6':  { sex: 'F', affected: [BC], gene: G, note: 'Breast cancer dx 36 — the allele reached her via the male-to-male chain II-3 → III-8 → IV-6.' },
    'IV-7':  { sex: 'M', carrier: true, gene: G, note: 'Unaffected male carrier.' },
    'IV-8':  { sex: 'F', note: 'At-risk minor, untested.' },
    'IV-9':  { sex: 'M', note: 'At-risk minor, untested.' },
    'IV-10': { sex: 'F', carrier: true, gene: G, note: 'Unaffected carrier; surveillance.' },
    'IV-11': { sex: 'M', note: 'Tested non-carrier.' },
    'IV-12': { sex: 'F', note: 'At-risk minor, untested.' },
    'IV-13': { sex: 'M', note: 'At-risk minor, untested.' },
  },

  unions: [
    { a: 'I-1', b: 'I-2', children: ['II-1', 'II-3', 'II-5', 'II-7', 'II-9'] },
    { a: 'II-2', b: 'II-1', children: ['III-1', 'III-3'] },
    { a: 'II-3', b: 'II-4', children: ['III-5', 'III-7', 'III-8'] },
    { a: 'II-6', b: 'II-5', children: ['III-10', 'III-12'] },
    { a: 'II-10', b: 'II-9', children: ['III-14'] },
    { a: 'III-2', b: 'III-1', children: ['IV-1', 'IV-2', 'IV-3'] },
    { a: 'III-6', b: 'III-5', children: ['IV-4', 'IV-5'] },
    { a: 'III-8', b: 'III-9', children: ['IV-6', 'IV-7'] },
    { a: 'III-11', b: 'III-10', children: ['IV-8', 'IV-9'] },
    { a: 'III-12', b: 'III-13', children: ['IV-10', 'IV-11'] },
    { a: 'III-15', b: 'III-14', children: ['IV-12', 'IV-13'] },
  ],
};
