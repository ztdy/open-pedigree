'use strict';

// Generates the bundled example pedigrees as ready-to-open library documents.
//
// For each family spec in ./families/*.js it:
//   1. compiles the declarative spec into the internal node-list,
//   2. imports it through the REAL app (headless, via the e2e harness) so the positioning
//      engine lays it out exactly as the editor would,
//   3. serializes with editor.getGraph().toJSON() and captures an SVG preview,
//   4. verifies the person / affected / carrier / proband counts against the spec,
//   5. writes desktop/examples/seeds/<uuid>.opedigree (+ .svg) and a manifest.
//
// Run: NODE_OPTIONS=--openssl-legacy-provider node desktop/examples/generate.js
// (requires a current dist/ build — rebuild first if src/ changed).

const fs = require('fs');
const path = require('path');
const { boot } = require('../../test/e2e/lib/harness');
const { compile, stats } = require('./lib/compile');

const FAMILIES_DIR = path.join(__dirname, 'families');
const SEEDS_DIR = path.join(__dirname, 'seeds');
const FILE_FORMAT_VERSION = 1;

// Fixed base instant so seeds are deterministic (no Date.now()). Later index => earlier time,
// so the numbered families sort 01..N top-to-bottom in the library (sorted by updatedAt desc).
const BASE = Date.parse('2026-01-01T12:00:00.000Z');

function loadFamilies() {
  return fs.readdirSync(FAMILIES_DIR)
    .filter(f => f.endsWith('.js'))
    .sort()
    .map(f => ({ file: f, spec: require(path.join(FAMILIES_DIR, f)) }));
}

async function main() {
  const families = loadFamilies();
  if (!fs.existsSync(SEEDS_DIR)) fs.mkdirSync(SEEDS_DIR, { recursive: true });

  const manifest = [];
  let failures = 0;

  {
    for (let i = 0; i < families.length; i++) {
      const { file, spec } = families[i];
      const gg = compile(spec);
      const expected = stats(spec);

      // A fresh app instance per family. Importing replaces the graph model, but some canvas
      // decorations (e.g. an ART "D" label) can linger between families on a shared page and leak
      // into the next family's exported SVG preview — a clean boot each time avoids that entirely.
      const h = await boot();
      let res;
      try {
      res = await h.run((arg) => {
        window.editor.getSaveLoadEngine().createGraphFromImportData(arg.gg, 'phenotips', {}, true, true);
        const g = window.editor.getGraph();
        const persons = window.PT.persons();
        let affected = 0, carriers = 0;
        persons.forEach((p) => {
          if (window.PT.disorders(p).length) affected++;
          const cs = g.getProperties(p).carrierStatus;
          if (cs === 'carrier' || cs === 'presymptomatic') carriers++;
        });
        return {
          personCount: persons.length,
          proband: g.getProbandId(),
          probandName: window.PT.firstName(g.getProbandId()),
          affected, carriers,
          json: window.PT.toJSON(),
          svg: window.PT.exportSVG(),
        };
      }, { gg: JSON.stringify(gg) });
      } finally {
        if (h.pageErrors && h.pageErrors.length) { console.error('PAGE ERRORS:', h.pageErrors.join(' | ')); failures++; }
        await h.close();
      }

      const problems = [];
      if (res.personCount !== expected.people) problems.push(`persons ${res.personCount}!=${expected.people}`);
      if (res.affected !== expected.affected) problems.push(`affected ${res.affected}!=${expected.affected}`);
      if (res.carriers !== expected.carriers) problems.push(`carriers ${res.carriers}!=${expected.carriers}`);
      if (spec.proband && res.probandName !== spec.proband) problems.push(`proband "${res.probandName}"!="${spec.proband}"`);

      const ok = problems.length === 0;
      if (!ok) failures++;

      const ts = new Date(BASE - i * 60000).toISOString();
      // Split the "中文 · English" title/project into a {zh,en} pair the UI picks by locale; keep
      // the joined string as a fallback for any reader that doesn't understand localizedTitle.
      const splitBi = function (s) {
        const p = String(s || '').split(' · ');
        return p.length >= 2 ? { zh: p[0].trim(), en: p.slice(1).join(' · ').trim() } : null;
      };
      const lt = splitBi(spec.title);
      const lp = splitBi(spec.project);
      // Source/provenance moves OFF the canvas (it used to be a proband comment that covered the
      // drawing) and INTO the document description shown on the library card. The description is
      // localized ({zh,en}) so the card text follows the UI language like the title/project; the
      // same source line is appended to both languages (it already carries 来源/Source labels).
      const src = spec.citation || spec.provenance;
      const srcLine = src ? ('来源/Source: ' + src + (spec.id ? ' [ex:' + spec.id.slice(0, 8) + ']' : '')) : '';
      const composeDesc = function (body) {
        const parts = [];
        if (body) { parts.push(String(body)); }
        if (srcLine) { parts.push(srcLine); }
        return parts.join('\n');
      };
      const descZh = composeDesc(spec.description);
      const descEn = composeDesc(spec.descriptionEn || spec.description);
      const envelope = {
        fileFormatVersion: FILE_FORMAT_VERSION,
        documentId: spec.id,
        title: spec.title,
        project: spec.project || '',
        // Marks a bundled example so the library can group these apart (pinned below the user's own
        // projects) and so seed-refresh / display logic can recognise them.
        isExample: true,
        createdAt: ts,
        updatedAt: ts,
      };
      if (lt) { envelope.localizedTitle = lt; }
      if (lp) { envelope.localizedProject = lp; }
      if (descZh) { envelope.description = descZh; }
      if (descZh || descEn) { envelope.localizedDescription = { zh: descZh, en: descEn }; }
      envelope.graph = JSON.parse(res.json);
      fs.writeFileSync(path.join(SEEDS_DIR, spec.id + '.opedigree'), JSON.stringify(envelope, null, 2));
      if (typeof res.svg === 'string' && res.svg.indexOf('<svg') !== -1) {
        fs.writeFileSync(path.join(SEEDS_DIR, spec.id + '.svg'), res.svg);
      }

      manifest.push({
        id: spec.id, file: spec.id + '.opedigree', title: spec.title, project: spec.project || '',
        size: spec.size || '', inheritance: spec.inheritance || '', condition: spec.condition || '',
        gene: spec.gene || '', citation: spec.citation || '', provenance: spec.provenance || '',
        persons: res.personCount,
      });

      console.log(`${ok ? 'OK  ' : 'FAIL'} ${file.padEnd(34)} n=${res.personCount} aff=${res.affected} carr=${res.carriers} proband=${res.probandName}` + (ok ? '' : '  << ' + problems.join('; ')));
    }
  }

  fs.writeFileSync(path.join(SEEDS_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\n${manifest.length} seeds written to ${SEEDS_DIR}; ${failures} problem(s).`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
