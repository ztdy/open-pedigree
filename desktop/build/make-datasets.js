'use strict';
// Build the offline autocomplete datasets bundled with the desktop app:
//   data/genes.json  — HGNC gene symbols  [[symbol, name], ...]
//   data/hpo.json    — HPO terms          [[id, name, [synonyms...]], ...]
// Sources (download first):
//   HGNC  https://storage.googleapis.com/public-download-files/hgnc/tsv/tsv/hgnc_complete_set.txt
//   HPO   https://purl.obolibrary.org/obo/hp.json
// Usage: node build/make-datasets.js <hgnc.txt> <hp.json>
//
// data/disorders.json (Orphanet) is built separately by build/make-disorders.py — its source
// is a SQLite database rather than a downloaded file. See data/NOTICE for the licensing of
// every bundled dataset, and read it before adding another one.

const fs = require('fs');
const path = require('path');

const hgncPath = process.argv[2];
const hpoPath = process.argv[3];
const outDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(outDir, { recursive: true });

// ---- Genes (HGNC) ----
const hgnc = fs.readFileSync(hgncPath, 'utf8').split('\n');
const header = hgnc[0].split('\t');
const iSymbol = header.indexOf('symbol');
const iName = header.indexOf('name');
const iStatus = header.indexOf('status');
const genes = [];
for (let i = 1; i < hgnc.length; i++) {
  const cols = hgnc[i].split('\t');
  const symbol = (cols[iSymbol] || '').trim();
  if (!symbol) continue;
  const status = (cols[iStatus] || '').trim();
  if (status && /withdrawn/i.test(status)) continue;
  genes.push([symbol, (cols[iName] || '').trim()]);
}
genes.sort((a, b) => a[0].localeCompare(b[0]));
fs.writeFileSync(path.join(outDir, 'genes.json'), JSON.stringify(genes));
console.log('genes:', genes.length);

// ---- HPO terms ----
const hp = JSON.parse(fs.readFileSync(hpoPath, 'utf8'));
const nodes = hp.graphs[0].nodes;
const hpo = [];
for (const n of nodes) {
  if (!n.id || n.id.indexOf('HP_') === -1) continue;
  if (n.meta && n.meta.deprecated) continue;
  if (!n.lbl) continue;
  const id = 'HP:' + n.id.split('HP_')[1];
  const syns = [];
  if (n.meta && Array.isArray(n.meta.synonyms)) {
    for (const s of n.meta.synonyms) { if (s && s.val) syns.push(s.val); }
  }
  hpo.push([id, n.lbl, syns]);
}
hpo.sort((a, b) => a[1].localeCompare(b[1]));
fs.writeFileSync(path.join(outDir, 'hpo.json'), JSON.stringify(hpo));
console.log('hpo:', hpo.length);

const gz = (p) => (fs.statSync(p).size / 1024 / 1024).toFixed(1) + ' MB';
console.log('sizes:', 'genes.json', gz(path.join(outDir, 'genes.json')), '| hpo.json', gz(path.join(outDir, 'hpo.json')));
