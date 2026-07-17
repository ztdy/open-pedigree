'use strict';
// Library "management" coverage: projects (grouping / move / normalize) and the clinical
// summary the library cards show (candidate genes, HPO phenotypes, disorders, people
// counts). Drives the REAL DocumentStore against a throwaway dir with virtual pedigrees.
// Pure Node — no Electron/display needed.

const assert = require('assert');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { DocumentStore } = require('./documentStore');

let pass = 0, fail = 0;
const cases = [];
function check(name, fn) { cases.push({ name, fn }); }

function freshStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'op-mgmt-'));
  return new DocumentStore(dir);
}

// A virtual graph in the store's on-disk shape ({GG:[...nodes]}). Only the fields the
// clinical summary reads matter: node.rel/chhub/virt (skipped) and node.prop.{candidateGenes,
// hpoTerms,disorders}. Persons are plain {prop:{...}} nodes.
function person(prop) { return { prop: prop || {} }; }
function graphOf(nodes) { return JSON.stringify({ GG: nodes, ranks: [], order: [], positions: [] }); }

// ---------------- projects: grouping ----------------
check('docs carry their project through create + list (grouping data)', async () => {
  const s = freshStore();
  await s.create({ title: 'Nuclear family', project: 'Smith kindred' });
  await s.create({ title: 'Trio', project: 'Smith kindred' });
  await s.create({ title: 'Consang', project: 'Jones kindred' });
  await s.create({ title: 'Loner' }); // ungrouped
  const list = await s.list();
  assert.strictEqual(list.length, 4, 'all four listed');
  const byProject = {};
  list.forEach((d) => { const k = d.project || '(ungrouped)'; byProject[k] = (byProject[k] || 0) + 1; });
  assert.strictEqual(byProject['Smith kindred'], 2);
  assert.strictEqual(byProject['Jones kindred'], 1);
  assert.strictEqual(byProject['(ungrouped)'], 1);
});

// ---------------- projects: move + normalize ----------------
check('setProject moves a pedigree between projects and to ungrouped', async () => {
  const s = freshStore();
  const d = await s.create({ title: 'Movable' });
  assert.strictEqual(d.project, '', 'created ungrouped');
  let m = await s.setProject(d.documentId, 'Alpha');
  assert.strictEqual(m.project, 'Alpha', 'moved into Alpha');
  m = await s.setProject(d.documentId, 'Beta');
  assert.strictEqual(m.project, 'Beta', 'moved Alpha -> Beta');
  m = await s.setProject(d.documentId, '');
  assert.strictEqual(m.project, '', 'moved back to ungrouped');
});

check('project names are trimmed and length-capped (normalize)', async () => {
  const s = freshStore();
  const d = await s.create({ title: 'X' });
  const m = await s.setProject(d.documentId, '   Trimmed Kindred   ');
  assert.strictEqual(m.project, 'Trimmed Kindred', 'whitespace trimmed');
  const long = 'K'.repeat(200);
  const m2 = await s.setProject(d.documentId, long);
  assert.strictEqual(m2.project.length, 120, 'capped at 120 chars');
});

// ---------------- clinical summary: aggregation + dedup ----------------
check('clinical summary aggregates genes/HPO/disorders across people, deduped', async () => {
  const s = freshStore();
  const d = await s.create({ title: 'Affected family' });
  const g = graphOf([
    person({ candidateGenes: ['BRCA1', 'TP53'], hpoTerms: ['HP:0001250'], disorders: ['614080'] }),
    { rel: true },                                    // relationship node — must be skipped
    person({ candidateGenes: ['BRCA1'], hpoTerms: ['HP:0004322'] }), // BRCA1 duplicates
    person({})                                        // an unaffected person
  ]);
  const m = await s.save({ documentId: d.documentId, graph: g });
  const c = m.clinical;
  assert.ok(c, 'clinical summary present');
  assert.strictEqual(c.people, 3, 'three person nodes counted (rel node skipped)');
  assert.strictEqual(c.geneCount, 2, 'BRCA1 + TP53, BRCA1 deduped');
  assert.deepStrictEqual(c.genes.sort(), ['BRCA1', 'TP53']);
  assert.strictEqual(c.hpoCount, 2, 'two distinct HPO terms');
  assert.strictEqual(c.disorderCount, 1, 'one disorder');
});

check('clinical summary handles {id,label} object clinical entries', async () => {
  const s = freshStore();
  const d = await s.create({ title: 'Object-shaped' });
  const g = graphOf([
    person({ candidateGenes: [{ id: 'PTEN', label: 'PTEN' }], disorders: [{ id: '158350', label: 'Cowden' }] })
  ]);
  const m = await s.save({ documentId: d.documentId, graph: g });
  assert.deepStrictEqual(m.clinical.genes, ['PTEN'], 'gene label resolved from object');
  assert.strictEqual(m.clinical.disorderCount, 1);
});

check('clinical summary caps the gene preview at 8 while keeping the full count', async () => {
  const s = freshStore();
  const d = await s.create({ title: 'Many genes' });
  const genes = [];
  for (let i = 1; i <= 12; i++) { genes.push('GENE' + i); }
  const m = await s.save({ documentId: d.documentId, graph: graphOf([person({ candidateGenes: genes })]) });
  assert.strictEqual(m.clinical.geneCount, 12, 'full count retained');
  assert.strictEqual(m.clinical.genes.length, 8, 'preview capped at 8');
});

check('clinical summary is people-only when no clinical data, null when empty', async () => {
  const s = freshStore();
  const a = await s.create({ title: 'People no clinical' });
  const ma = await s.save({ documentId: a.documentId, graph: graphOf([person({}), person({})]) });
  assert.deepStrictEqual(ma.clinical, { people: 2 }, 'people-only summary');

  const b = await s.create({ title: 'Empty' }); // never saved a graph -> graph null
  const list = await s.list();
  const mb = list.find((d) => d.documentId === b.documentId);
  assert.strictEqual(mb.clinical, null, 'empty pedigree has null clinical');
  assert.strictEqual(mb.isEmpty, true, 'and is flagged empty');
});

// Run registered checks sequentially so per-check output is deterministic.
(async () => {
  for (const tc of cases) {
    try { await tc.fn(); console.log('PASS  ' + tc.name); pass++; }
    catch (e) { console.log('FAIL  ' + tc.name + '  — ' + (e && e.message || e)); fail++; }
  }
  console.log('==== library management: ' + pass + ' passed, ' + fail + ' failed ====');
  process.exit(fail ? 1 : 0);
})();
