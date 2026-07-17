'use strict';

// Huntington disease (HTT CAG expansion) — autosomal dominant, adult onset, full penetrance at
// CAG >= 40. Clinically faithful REPRESENTATIVE family grounded in Ranen NG et al., "Anticipation
// and instability of IT-15 (CAG)n repeats in parent-offspring pairs with Huntington disease,"
// Am J Hum Genet 1995;57(3):593-602 (PMID 7668287) — paternal transmission drives CAG expansion
// and earlier onset (anticipation), with juvenile cases from paternal transmission.
//
// Teaching points: vertical dominant transmission every generation; male-to-male chain
// I-1 -> II-3 -> III-4 -> IV-1 (all affected) proving the locus is autosomal; adult onset;
// paternal anticipation (onset 50 -> 45 -> 38 -> 25 as CAG rises 40 -> 43 -> 46 -> 55) while the
// maternal line stays near-stable; presymptomatic carriers found by predictive testing.

var HD = 'Huntington disease', G = 'HTT';

module.exports = {
  id: 'd7e34a27-90e4-44a3-acdb-509a7944b64c',
  title: '亨廷顿病 · Huntington disease',
  project: '示例家系 · Example pedigrees',
  size: 'medium',
  inheritance: 'Autosomal dominant',
  condition: HD,
  gene: G,
  citation: 'Ranen NG et al. Am J Hum Genet 1995;57:593 (PMID 7668287).',
  provenance: '代表性家系,父系遗传早现(CAG扩增↔提前发病)依据 Ranen NG et al. AJHG 1995;57:593。REPRESENTATIVE, anticipation per Ranen 1995.',
  description: '常染色体显性、成年发病的神经退行性病：每代均有患者；男-男传递链 I-1→II-3→III-4→IV-1 证明为常染色体；父系传递中 CAG 逐代扩增、发病提前(遗传早现)，母系近乎稳定；预测性检测发现症状前携带者。先证者 III-4，38岁发病。',
  descriptionEn: 'An autosomal dominant, adult-onset neurodegenerative disease: affected individuals in every generation; the male-to-male chain I-1 -> II-3 -> III-4 -> IV-1 proves autosomal inheritance; paternal transmission shows CAG expansion with earlier onset each generation (anticipation) while maternal transmission is near-stable; predictive testing identifies presymptomatic carriers. Proband III-4, onset at 38.',
  proband: 'III-4',

  people: {
    'I-1':  { sex: 'M', affected: HD, gene: G, deceased: true, note: 'Onset 50, CAG 40; died of HD age 63 (carrier root).' },
    'I-2':  { sex: 'F', deceased: true, note: 'Non-carrier; died age 80.' },

    'II-1': { sex: 'F', affected: HD, gene: G, deceased: true, note: 'Maternal line; onset 48, CAG 41; died of HD age 60.' },
    'II-2': { sex: 'M', note: 'Married in.' },
    'II-3': { sex: 'M', affected: HD, gene: G, deceased: true, note: 'Paternal transmitter (male-to-male from I-1); onset 45, CAG 43; died of HD age 58.' },
    'II-4': { sex: 'F', note: 'Married in.' },
    'II-5': { sex: 'F', note: 'Escaped the expansion — non-carrier, CAG 18.' },
    'II-7': { sex: 'M', affected: HD, gene: G, note: 'Onset 46, CAG 42.' },
    'II-8': { sex: 'F', note: 'Married in.' },

    'III-1':  { sex: 'F', affected: HD, gene: G, note: 'Maternal transmission — onset 45, CAG 42 (minimal change vs mother\'s 41).' },
    'III-3':  { sex: 'M', note: 'Tested normal — non-carrier.' },
    'III-4':  { sex: 'M', affected: HD, gene: G, note: 'PROBAND. Onset 38, CAG 46 — paternal expansion 43→46, earlier onset than his father (anticipation).' },
    'III-5':  { sex: 'F', note: 'Married in.' },
    'III-6':  { sex: 'F', affected: HD, gene: G, note: 'Onset 40, CAG 45.' },
    'III-7':  { sex: 'M', note: 'Married in.' },
    'III-8':  { sex: 'M', presymptomatic: true, gene: G, note: 'Predictive test positive, CAG 44, unaffected (presymptomatic).' },
    'III-9':  { sex: 'F', affected: HD, gene: G, note: 'Onset 42, CAG 44.' },
    'III-10': { sex: 'M', note: 'Married in.' },
    'III-11': { sex: 'M', note: 'Tested normal — non-carrier.' },

    'IV-1': { sex: 'M', affected: HD, gene: G, note: 'Juvenile/early onset 25, CAG 55 — dramatic paternal expansion 46→55; male-to-male III-4 → IV-1.' },
    'IV-2': { sex: 'F', presymptomatic: true, gene: G, note: 'Predictive test positive, CAG 47.' },
    'IV-3': { sex: 'F', note: 'Non-carrier.' },
    'IV-4': { sex: 'F', presymptomatic: true, gene: G, note: 'Predictive test positive, CAG 45.' },
    'IV-5': { sex: 'M', note: 'Non-carrier.' },
    'IV-6': { sex: 'M', note: 'At-risk (50% prior), declined testing.' },
    'IV-7': { sex: 'F', note: 'Non-carrier.' },
  },

  unions: [
    { a: 'I-1', b: 'I-2', children: ['II-1', 'II-3', 'II-5', 'II-7'] },
    { a: 'II-2', b: 'II-1', children: ['III-1', 'III-3'] },
    { a: 'II-3', b: 'II-4', children: ['III-4', 'III-6', 'III-8'] },
    { a: 'II-7', b: 'II-8', children: ['III-9', 'III-11'] },
    { a: 'III-4', b: 'III-5', children: ['IV-1', 'IV-2', 'IV-3'] },
    { a: 'III-7', b: 'III-6', children: ['IV-4', 'IV-5'] },
    { a: 'III-10', b: 'III-9', children: ['IV-6', 'IV-7'] },
  ],
};
