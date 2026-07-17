'use strict';

// Seeds the bundled example pedigrees into the library. Best-effort and idempotent:
//   - each example is offered exactly ONCE (the first launch that sees its id), so a user who
//     deletes an example never has it reappear;
//   - a NEW example shipped in a later version (an id not yet in the marker) is still seeded;
//   - when a shipped example's CONTENT changes (a fixed/updated .opedigree), the copy in the
//     library is refreshed IN PLACE — but only when the user has not edited it themselves. We know
//     that by remembering the hash of the bytes we last wrote; if the library file still matches,
//     the user hasn't touched it and it's safe to update. A legacy marker (no hashes yet) is
//     refreshed once and its hash recorded, so the next launch can tell edited from untouched.
// State is a small JSON marker in the library dir. The marker is not an `.opedigree` file, so it
// never shows up as a document. Never throws into the caller — seeding must not block startup.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SEEDS_DIR = path.join(__dirname, 'examples', 'seeds');
const MARKER = '.examples-seeded.json';

function fileHash(p) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
  catch (e) { return null; }
}

function readMarker(libraryDir) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(libraryDir, MARKER), 'utf8'));
    return {
      offered: Array.isArray(j.offered) ? j.offered : [],
      hashes: (j.hashes && typeof j.hashes === 'object') ? j.hashes : {}
    };
  } catch (e) { return { offered: [], hashes: {} }; }
}

function copySvg(entry, libraryDir) {
  const svgSrc = path.join(SEEDS_DIR, entry.id + '.svg');
  if (fs.existsSync(svgSrc)) {
    try { fs.copyFileSync(svgSrc, path.join(libraryDir, entry.id + '.svg')); } catch (e) { /* preview is non-critical */ }
  }
}

function seedExamples(libraryDir) {
  try {
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(path.join(SEEDS_DIR, 'manifest.json'), 'utf8'));
    } catch (e) { return { seeded: 0, updated: 0, skipped: 'no-manifest' }; }

    const marker = readMarker(libraryDir);
    const offeredSet = new Set(marker.offered);
    const hashes = marker.hashes;
    let seeded = 0;
    let updated = 0;

    for (const entry of manifest) {
      const src = path.join(SEEDS_DIR, entry.file);
      const dest = path.join(libraryDir, entry.file);
      const bundledHash = fileHash(src);
      const wasOffered = offeredSet.has(entry.id);

      try {
        if (!fs.existsSync(dest)) {
          // Not in the library. Seed it only if it was never offered — a missing-but-offered
          // example means the user deleted it, and we respect that.
          if (!wasOffered) {
            fs.copyFileSync(src, dest);
            copySvg(entry, libraryDir);
            hashes[entry.id] = bundledHash;
            seeded++;
          }
        } else {
          // Already in the library. Refresh it in place only when the user hasn't edited it: the
          // file still hashes to what we last wrote. A legacy entry (no recorded hash) is treated
          // as ours and refreshed once.
          const destHash = fileHash(dest);
          const recorded = hashes[entry.id];
          const userUnmodified = (recorded != null) ? (destHash === recorded) : true;
          if (userUnmodified && bundledHash && destHash !== bundledHash) {
            fs.copyFileSync(src, dest);
            copySvg(entry, libraryDir);
            hashes[entry.id] = bundledHash;
            updated++;
          } else if (recorded == null) {
            // User-modified legacy file we won't overwrite — record its current hash as the baseline
            // so we never touch it again.
            hashes[entry.id] = destHash;
          }
        }
      } catch (e) { /* skip this one, still mark it offered so we don't retry forever */ }

      offeredSet.add(entry.id);
    }

    try {
      fs.writeFileSync(path.join(libraryDir, MARKER),
        JSON.stringify({ offered: Array.from(offeredSet), hashes }, null, 2));
    } catch (e) { /* best effort */ }

    return { seeded, updated };
  } catch (e) {
    return { seeded: 0, updated: 0, error: String((e && e.message) || e) };
  }
}

module.exports = { seedExamples, SEEDS_DIR, MARKER };
