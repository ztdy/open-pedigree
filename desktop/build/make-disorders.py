#!/usr/bin/env python3
"""Build data/disorders.json — the offline disorder autocomplete dataset.

Source: Orphanet (orphadata.com), via the bioinfo-kb pipeline's bioinfo_zh.db.

    python3 build/make-disorders.py /mnt/d/YooYii/bioinfo/bioinfo_zh.db

Output: data/disorders.json — [[orpha_code, name_en, name_zh], ...] sorted by name_en.

LICENSING — read before changing the source of this dataset.

Orphanet nomenclature is published by orphadata.com under CC BY 4.0: redistributable
inside the app as long as it is attributed (see desktop/data/NOTICE). That is the whole
reason this dataset is Orphanet and not OMIM: OMIM is copyrighted by Johns Hopkins and
its terms do not permit bundling it into a distributed application, which is why
main.js served an empty disorder list before this existed.

bioinfo_zh.db carries OMIM tables too, and its orphanet_diseases.name_zh prefers the
OMIM cross-referenced Chinese name where one exists (build_bioinfo_zh.py step 9). Those
names are OMIM-derived and must NOT ship. This script re-derives them from the
translation cache, which is keyed by the *Orphanet* English name, so every Chinese name
written here descends only from Orphanet's own CC BY nomenclature.
"""

import json
import pathlib
import sqlite3
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'disorders.json'

# Orphanet classification headers ("Rare genetic disease"), not diagnoses. A pedigree
# records a diagnosis, so they would only dilute the suggestions.
EXCLUDED_TYPES = {'Category'}


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    db_path = pathlib.Path(sys.argv[1])
    cache_path = db_path.parent / 'bioinfo_zh_hpo_cache.json'

    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row

    # Chinese names the pipeline copied from OMIM: keyed by MIM, used to detect and drop them.
    omim_zh = dict(con.execute(
        'SELECT CAST(disease_mim AS TEXT), disease_name_zh FROM omim_diseases '
        'WHERE disease_name_zh IS NOT NULL'))
    # Translations of Orphanet's own English names.
    cache = json.loads(cache_path.read_text(encoding='utf-8')) if cache_path.exists() else {}

    rows = con.execute(
        'SELECT orpha_code, name_en, name_zh, disorder_type, omim_mim FROM orphanet_diseases'
    ).fetchall()
    con.close()

    out, dropped_omim, relabelled, no_zh = [], 0, 0, 0
    for r in rows:
        if r['disorder_type'] in EXCLUDED_TYPES:
            continue
        name_en = (r['name_en'] or '').strip()
        if not name_en:
            continue
        name_zh = (r['name_zh'] or '').strip()

        mims = json.loads(r['omim_mim']) if r['omim_mim'] else []
        borrowed = next((omim_zh[m] for m in mims if m in omim_zh), None)
        if name_zh and borrowed and name_zh == borrowed:
            # OMIM-derived: re-derive from the Orphanet English name or ship without a
            # Chinese name rather than redistribute it.
            dropped_omim += 1
            name_zh = (cache.get(name_en) or '').strip()
            if name_zh:
                relabelled += 1
        if not name_zh:
            no_zh += 1
        out.append([r['orpha_code'], name_en, name_zh])

    out.sort(key=lambda x: x[1].lower())
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

    print('disorders.json: %d entries (%.1f MB)' % (len(out), OUT.stat().st_size / 1e6))
    print('  OMIM-derived zh names dropped   : %d' % dropped_omim)
    print('  ...re-derived from Orphanet EN  : %d' % relabelled)
    print('  entries with no zh name         : %d' % no_zh)


if __name__ == '__main__':
    main()
