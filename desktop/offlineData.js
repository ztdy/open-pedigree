'use strict';

// Offline autocomplete backend for gene symbols (HGNC), HPO phenotype terms and rare
// disorders (Orphanet -- see data/NOTICE for attribution).
// The bundled datasets live in ./data (built by build/make-datasets.js) and are read
// lazily on first query, then kept in memory. Served to the renderer over the custom
// opdata:// scheme so the legacy Suggest widget works with zero network access.
//
//   data/genes.json     : [[symbol, name], ...]              (~45k, sorted by symbol)
//   data/hpo.json       : [[id, name, [synonyms...]], ...]   (~20k, sorted by name)
//   data/disorders.json : [[orphaCode, name_en, name_zh], ...] (~9k, sorted by name_en)

const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const MAX_RESULTS = 15;

let genes = null;     // [[symbol, name], ...]
let hpo = null;       // [[id, name, [syn...]], ...]
let disorders = null; // [[orphaCode, name_en, name_zh], ...]

async function loadGenes() {
  if (!genes) genes = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'genes.json'), 'utf8'));
  return genes;
}
async function loadHpo() {
  if (!hpo) hpo = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'hpo.json'), 'utf8'));
  return hpo;
}
async function loadDisorders() {
  if (!disorders) disorders = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'disorders.json'), 'utf8'));
  return disorders;
}

// Rank so exact/prefix matches come before substring matches, cheap and predictable.
function rank(hayStart, hayIncludes) {
  if (hayStart) return 0;
  if (hayIncludes) return 1;
  return 2;
}

// Gene search → { docs: [{ symbol, name }] }, matching the Suggest gene config
// (resultsParameter 'docs', resultId/resultValue 'symbol').
async function searchGenes(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return { docs: [] };
  const rows = await loadGenes();
  const hits = [];
  for (let i = 0; i < rows.length; i++) {
    const symbol = rows[i][0], name = rows[i][1] || '';
    const sl = symbol.toLowerCase(), nl = name.toLowerCase();
    const symStart = sl.indexOf(q) === 0;
    const symIn = !symStart && sl.indexOf(q) !== -1;
    const nameIn = !symStart && !symIn && nl.indexOf(q) !== -1;
    if (symStart || symIn || nameIn) {
      hits.push({ r: rank(symStart, symIn || nameIn), symbol: symbol, name: name });
    }
  }
  hits.sort((a, b) => a.r - b.r || a.symbol.localeCompare(b.symbol));
  return { docs: hits.slice(0, MAX_RESULTS).map((h) => ({ symbol: h.symbol, name: h.name })) };
}

// HPO search → { rows: [{ id, name, synonym }] }, matching the desktop Suggest HPO config
// (queryProcessor bypassed; resultsParameter 'rows', resultId 'id', resultValue 'name',
// resultAltName 'synonym'). A HP:nnnnnnn query resolves by exact id.
async function searchHpo(query) {
  const raw = String(query || '').trim();
  const q = raw.toLowerCase();
  if (!q) return { rows: [] };
  const rows = await loadHpo();

  if (/^hp:?\d+$/i.test(raw)) {
    const want = ('HP:' + raw.replace(/^hp:?/i, '')).toUpperCase();
    const found = rows.find((r) => r[0].toUpperCase() === want);
    return { rows: found ? [{ id: found[0], name: found[1], synonym: (found[2] || [])[0] || '' }] : [] };
  }

  const hits = [];
  for (let i = 0; i < rows.length; i++) {
    const id = rows[i][0], name = rows[i][1] || '', syns = rows[i][2] || [];
    const nl = name.toLowerCase();
    const nameStart = nl.indexOf(q) === 0;
    const nameIn = !nameStart && nl.indexOf(q) !== -1;
    let synMatch = '';
    if (!nameStart && !nameIn) {
      for (let s = 0; s < syns.length; s++) {
        if (syns[s].toLowerCase().indexOf(q) !== -1) { synMatch = syns[s]; break; }
      }
    }
    if (nameStart || nameIn || synMatch) {
      hits.push({ r: rank(nameStart, nameIn || !!synMatch), id: id, name: name,
        synonym: synMatch || (syns[0] || '') });
    }
  }
  hits.sort((a, b) => a.r - b.r || a.name.localeCompare(b.name));
  return { rows: hits.slice(0, MAX_RESULTS).map((h) => ({ id: h.id, name: h.name, synonym: h.synonym })) };
}

// Disorder search → { rows: [{ id, name }] }, matching the desktop Suggest disease config
// (resultsParameter 'rows', resultId 'id', resultValue 'name'). Ids are ORPHA:nnn CURIEs, never
// bare numbers: a bare Orphanet code would be indistinguishable from an OMIM MIM number, and
// Disorder treats an integer id as a MIM.
//
// `lang` picks the displayed name. It is only a label — a pedigree stores the id alone, so the
// name is resolved again (in whatever locale is current) every time the file is reopened.
// An `ORPHA:nnn` query resolves by exact id; that is the path Disorder.load takes on reopen.
async function searchDisorders(query, lang) {
  const raw = String(query || '').trim();
  const q = raw.toLowerCase();
  if (!q) return { rows: [] };
  const rows = await loadDisorders();
  const label = (r) => ((lang === 'zh' && r[2]) ? r[2] : r[1]);

  if (/^orpha:?\d+$/i.test(raw)) {
    const want = raw.replace(/^orpha:?/i, '');
    const found = rows.find((r) => r[0] === want);
    return { rows: found ? [{ id: 'ORPHA:' + found[0], name: label(found) }] : [] };
  }

  const hits = [];
  for (let i = 0; i < rows.length; i++) {
    const en = rows[i][1] || '', zh = rows[i][2] || '';
    const el = en.toLowerCase();
    // Match both names regardless of locale: clinicians type either, and a Chinese UI is no
    // reason to hide a term whose English name is what the user knows.
    const start = el.indexOf(q) === 0 || (!!zh && zh.indexOf(raw) === 0);
    const inside = !start && (el.indexOf(q) !== -1 || (!!zh && zh.indexOf(raw) !== -1));
    if (start || inside) {
      hits.push({ r: rank(start, inside), id: 'ORPHA:' + rows[i][0], name: label(rows[i]) });
    }
  }
  hits.sort((a, b) => a.r - b.r || a.name.localeCompare(b.name));
  return { rows: hits.slice(0, MAX_RESULTS).map((h) => ({ id: h.id, name: h.name })) };
}

module.exports = { searchGenes, searchHpo, searchDisorders,
  _loadGenes: loadGenes, _loadHpo: loadHpo, _loadDisorders: loadDisorders };
