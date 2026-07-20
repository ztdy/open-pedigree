/*
 * F1b migration (0.2): old symbol-level carrier model -> per-condition status model.
 *
 * OLD (on disk):
 *   person.prop.disorders     = [ "Marfan__syndrome", ... ]   // sanitized names (space -> __)
 *   person.prop.carrierStatus = '' | 'carrier' | 'affected' | 'presymptomatic'
 * NEW:
 *   person.prop.disorders     = [ { uuid, name, status:'affected'|'carrier' }, ... ]  // name = clean
 *   person.prop.presymptomatic = true            // symbol-level boolean (was carrierStatus)
 *   (carrierStatus deleted)
 *   legendColors.disorder key: sanitized-id -> uuid
 *
 * Pure function. NOT yet wired into VersionUpdater — that (plus the runtime model change in
 * person.js / disorderLegend) is a later F1b increment. Design: docs/DESIGN-F1a-data-model.md.
 */
import Disorder from 'pedigree/disorder';

const PLACEHOLDER_NAME = '疾病A';   // orphan carrier (old 'carrier' with no disease) placeholder; needsRepair

// A disorder entry is already migrated iff it is an object with a uuid.
function isNewEntry(d) {
  return d && typeof d === 'object' && d.hasOwnProperty('uuid');
}

// True if any person still carries the old shape (string disorder or a carrierStatus key).
function isOldFormat(data) {
  if (!data || !Array.isArray(data.GG)) {
    return false;
  }
  for (let i = 0; i < data.GG.length; i++) {
    const p = data.GG[i] && data.GG[i].prop;
    if (!p) {
      continue;
    }
    if (p.hasOwnProperty('carrierStatus')) {
      return true;
    }
    if (Array.isArray(p.disorders) && p.disorders.some((d) => typeof d === 'string')) {
      return true;
    }
  }
  return false;
}

// Clean human name for a stored disorder value ('Marfan__syndrome' -> 'Marfan syndrome').
// The hack sentinel 'affected' becomes the generic named condition 'Affected'.
function cleanName(d) {
  let n = (typeof d === 'string') ? Disorder.desanitizeID(d) : (isNewEntry(d) ? d.name : null);
  if (n === 'affected') {
    n = 'Affected';
  }
  return n || null;
}

/**
 * Migrate a pedigree JSON string old -> new. Returns the migrated JSON string, or null if the
 * input was not in the old format (already migrated / nothing to do) — matches VersionUpdater's
 * "null means no change" contract, so it is safe to run unconditionally and idempotently.
 */
export function migrateDisordersToStatusModel(pedigreeJSON) {
  let data;
  try {
    data = JSON.parse(pedigreeJSON);
  } catch (e) {
    return null;
  }
  if (!isOldFormat(data)) {
    return null;
  }

  // Document-level name -> uuid registry. Deterministic counter (no Math.random/Date): a given
  // input always yields the same uuids. Same name anywhere in the pedigree shares one uuid.
  const nameToUuid = {};
  let counter = 0;
  const uuidFor = (name) => {
    if (!nameToUuid.hasOwnProperty(name)) {
      counter++;
      nameToUuid[name] = 'd' + counter;
    }
    return nameToUuid[name];
  };
  // A CODED disorder (OMIM MIM number / Orphanet CURIE) keeps its CODE as its uuid — the standard
  // identifier is preserved and the legend re-resolves the name from the bundled dataset. Only
  // free-text disorders consume the document-level d1,d2,… counter.
  const uuidForRaw = (rawValue, cleanNameVal) => {
    const sid = Disorder.sanitizeID(String(rawValue));
    if (Disorder.isCodedID(sid)) {
      return sid;
    }
    return uuidFor(cleanNameVal);
  };
  // Advance the counter past an already-assigned 'dN' uuid so freshly-minted ones never collide.
  const seedCounter = (uuid) => {
    const m = /^d(\d+)$/.exec(String(uuid));
    if (m) {
      const nnum = parseInt(m[1], 10);
      if (nnum > counter) {
        counter = nnum;
      }
    }
  };

  // Pass 0: a record can be partially migrated (version skew) — some persons already hold new-model
  // { uuid, name, status } objects while others are still legacy. Seed the registry/counter from
  // those existing uuids FIRST so their identity/colour is preserved verbatim and the free-text
  // counter continues after them, never overwriting them.
  for (let i = 0; i < data.GG.length; i++) {
    const p = data.GG[i] && data.GG[i].prop;
    if (!p || !Array.isArray(p.disorders)) {
      continue;
    }
    for (let j = 0; j < p.disorders.length; j++) {
      const d = p.disorders[j];
      if (isNewEntry(d)) {
        seedCounter(d.uuid);
        if (d.name != null && !nameToUuid.hasOwnProperty(d.name)) {
          nameToUuid[d.name] = d.uuid;
        }
      }
    }
  }

  // Pass 1: assign uuids to every NAMED legacy (string) disorder, in encounter order, so the
  // placeholder / 'Affected' get later ids and the numbering is stable. Coded disorders take their
  // code and do not perturb the counter; already-new entries were handled in pass 0.
  for (let i = 0; i < data.GG.length; i++) {
    const p = data.GG[i] && data.GG[i].prop;
    if (!p || !Array.isArray(p.disorders)) {
      continue;
    }
    for (let j = 0; j < p.disorders.length; j++) {
      if (isNewEntry(p.disorders[j])) {
        continue;
      }
      const n = cleanName(p.disorders[j]);
      if (n) {
        uuidForRaw(p.disorders[j], n);
      }
    }
  }

  // Pass 2: transform each person.
  for (let i = 0; i < data.GG.length; i++) {
    const p = data.GG[i] && data.GG[i].prop;
    if (!p) {
      continue;
    }
    const cs = p.carrierStatus;   // '' | 'carrier' | 'affected' | 'presymptomatic' | undefined
    const raw = Array.isArray(p.disorders) ? p.disorders : [];

    // Listed disorders are 'affected' unless the person was flagged a plain 'carrier' of them.
    const listStatus = (cs === 'carrier') ? 'carrier' : 'affected';
    const newList = raw.map((rawValue) => {
      // An already-migrated entry is preserved VERBATIM — its uuid, status and needsRepair are
      // authoritative and must not be rebuilt from the person's (absent) symbol-level carrierStatus.
      if (isNewEntry(rawValue)) {
        const kept = { uuid: rawValue.uuid, name: rawValue.name,
          status: (rawValue.status === 'carrier' || rawValue.status === 'affected') ? rawValue.status : 'affected' };
        if (rawValue.needsRepair) {
          kept.needsRepair = true;
        }
        if (rawValue.synthetic) {
          kept.synthetic = true;
        }
        return kept;
      }
      const n = cleanName(rawValue);
      if (!n) {
        return null;
      }
      const entry = { uuid: uuidForRaw(rawValue, n), name: n, status: listStatus };
      // the legacy hack sentinel 'affected' is the app-generated generic condition — keep it flagged
      // synthetic so it stays auto-removable (a clinician-typed "Affected" never hits this).
      if (typeof rawValue === 'string' && Disorder.desanitizeID(rawValue) === 'affected') {
        entry.synthetic = true;
      }
      return entry;
    }).filter(Boolean);

    if (cs === 'affected' && newList.length === 0) {
      // generic "affected, unspecified condition" (define shading in the legend, per NSGC Fig 2)
      newList.push({ uuid: uuidFor('Affected'), name: 'Affected', status: 'affected', synthetic: true });
    }
    if (cs === 'carrier' && newList.length === 0) {
      // orphan carrier: old model bound no disease -> placeholder, flagged for manual repair (D5)
      newList.push({ uuid: uuidFor(PLACEHOLDER_NAME), name: PLACEHOLDER_NAME, status: 'carrier', needsRepair: true, synthetic: true });
    }
    if (cs === 'presymptomatic') {
      p.presymptomatic = true;   // symbol-level vertical line; condition identified via gene text + legend
    }

    if (newList.length > 0) {
      p.disorders = newList;
    } else {
      delete p.disorders;
    }
    delete p.carrierStatus;
  }

  // legendColors.disorder rekey: old key = sanitized id, new key = uuid. Best-effort; only custom
  // colours are ever persisted here, so this is usually a no-op.
  if (data.legendColors && data.legendColors.disorder && typeof Disorder.sanitizeID === 'function') {
    const oldColors = data.legendColors.disorder;
    const newColors = {};
    // Coded disorders keep their sanitized-code key (it already IS the new uuid) — carry those over
    // as-is so a custom colour on an OMIM/Orphanet disorder survives.
    for (const key in oldColors) {
      if (oldColors.hasOwnProperty(key) && Disorder.isCodedID(key)) {
        newColors[key] = oldColors[key];
      }
    }
    for (const name in nameToUuid) {
      if (!nameToUuid.hasOwnProperty(name)) {
        continue;
      }
      const sid = Disorder.sanitizeID(name);
      if (oldColors.hasOwnProperty(sid)) {
        newColors[nameToUuid[name]] = oldColors[sid];
      } else if (oldColors.hasOwnProperty(name)) {
        newColors[nameToUuid[name]] = oldColors[name];
      }
    }
    data.legendColors.disorder = newColors;
  }

  return JSON.stringify(data);
}

export default { migrateDisordersToStatusModel };
