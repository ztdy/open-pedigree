# Bundled example pedigrees

A size-graded set of nine teaching pedigrees that ship with the desktop app and are seeded into a
fresh library on first run (grouped under the project **示例家系 · Example pedigrees**). They double
as end-to-end test fixtures: each is drawn through the real editor, so they exercise the symbols a
clinician uses — affected shading, carrier dots, consanguinity double-lines, twins, adoption,
assisted-reproduction labels, and pregnancy-loss symbols.

## The set

| # | File | Size | Inheritance | Condition (gene) | Source |
|---|------|------|-------------|------------------|--------|
| 1 | `01-victoria-hemophilia.js` | large (49) | X-linked recessive | Hemophilia B (F9) | Rogaev EI et al. *Science* 2009;326:817 |
| 2 | `02-brca1-hboc.js` | large (38) | Autosomal dominant, reduced penetrance | Breast/ovarian cancer (BRCA1) | Lynch HT et al. *JCO* 2003;21:740; Mahdavi M et al. *JCP* 2019;234:5741 |
| 3 | `03-huntington.js` | medium (26) | Autosomal dominant | Huntington disease (HTT) | Ranen NG et al. *AJHG* 1995;57:593 |
| 4 | `04-consanguineous-microcephaly.js` | large (32) | Autosomal recessive, consanguineous | Primary microcephaly (WDR62) | Kousar R et al. *BMC Neurol* 2011;11:119; Hussain MS et al. *HMG* 2013;22:5199 |
| 5 | `05-mitochondrial-melas.js` | medium (17) | Mitochondrial (maternal) | MELAS, m.3243A>G (MT-TL1) | Pallotti F et al. *PLoS One* 2014;9:e96663 |
| 6 | `06-cystic-fibrosis.js` | medium (12) | Autosomal recessive | Cystic fibrosis (CFTR) | CF Foundation / CFTR2 |
| 7 | `07-art-twins-adoption.js` | medium (17) | n/a (structural showcase) | — | NSGC nomenclature (Bennett RL et al. *JGC* 2022;31:1238) |
| 8 | `08-down-syndrome.js` | small (8) | Chromosomal (sporadic) | Down syndrome, trisomy 21 | Standard cytogenetics |
| 9 | `09-marfan-denovo.js` | small (7) | Autosomal dominant, de novo | Marfan syndrome (FBN1) | Ghent nosology |

**Provenance note.** Families 1 and 5 are transcribed from / reconstructed against real published
data (the royal haemophilia pedigree corroborated against Rogaev 2009; the MELAS individual-level
data from Pallotti 2014). Families 2, 3, 4, 6, 8, 9 are clinically faithful **representative**
pedigrees — real gene/condition, correct inheritance pattern, grounded in the cited literature, but
not a cell-for-cell transcription of one figure. Each family file's header comment states which it
is and cites its sources.

## How they are built

Each family is a declarative spec (`families/NN-name.js`) of `people` + `unions` — that spec *is*
the human-readable record. The build:

1. `lib/compile.js` compiles the spec into the internal node-list (the `GG` array).
2. `generate.js` boots the **real app** headless (the e2e harness), imports each node-list through
   `dynamicGraph.fromImport(..., 'phenotips')` so the positioning engine lays it out exactly as the
   editor would, serializes with `editor.getGraph().toJSON()`, captures an SVG preview, and
   **verifies** person / affected / carrier / proband counts against the spec.
3. It writes `seeds/<uuid>.opedigree` (a library document envelope), `seeds/<uuid>.svg` (preview),
   and `seeds/manifest.json`.

At runtime `desktop/seedExamples.js` copies the seeds into the library on first launch — once per
example (a deleted example never reappears; a newly-shipped example still seeds).

## Regenerating

```bash
# from the repo root — rebuild the bundle if src/ changed, then generate:
NODE_OPTIONS=--openssl-legacy-provider npm run build
NODE_OPTIONS=--openssl-legacy-provider node desktop/examples/generate.js
```

The UUIDs are fixed in each family file, so regenerating overwrites the same seed documents
(idempotent). To add a family, drop a new `families/NN-*.js` with a fresh UUID and rerun.

## Conventions used in the specs

- `affected: 'Name'` (or an array) — shades the symbol and adds the condition to the legend.
- `carrier: true` / `presymptomatic: true` — an unaffected carrier dot / a presymptomatic line.
- `gene` is attached only to **affected** individuals (a gene fill on a carrier would read as
  affected); the gene still appears in the library card's clinical summary.
- `deceased` / `lifeStatus` — life-status marks (deceased slash, stillbirth, miscarriage, …).
- `adopted`, `asab`, `childless`, `artRole: 'D'|'G'`, twin sets via `union.twins` — structural marks.
- Consanguinity is **not** flagged; drawing the cousins correctly makes the app detect the shared
  ancestry and draw the double line automatically.
- `note` is documentation only — it is intentionally NOT stamped on the canvas (it would clutter the
  drawing); the teaching narrative lives in each document's title/description.
