'use strict';

// DocumentStore — the single owner of the on-disk pedigree library (main process).
// One `.opedigree` JSON file per pedigree in a managed directory, plus an optional
// `.svg` preview sidecar. Writes are atomic (temp -> fsync -> rename) with a `.bak`
// of the previous version, and are serialised per documentId to avoid races from
// autosave + explicit save landing at once.

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const i18n = require('./i18n');
const t = (k) => i18n.t(k);

const FILE_FORMAT_VERSION = 1;
const EXT = '.opedigree';

// Strict RFC-4122 UUID (v1-5). Rejects all-dashes and other 36-char junk.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidId(id) {
  return typeof id === 'string' && UUID_RE.test(id);
}

// A JSON object that looks like a legacy raw graph (pre-envelope: {GG,ranks,order,positions}).
function isLegacyRawGraph(obj) {
  return obj && typeof obj === 'object' && obj.fileFormatVersion === undefined
    && Object.prototype.hasOwnProperty.call(obj, 'GG');
}

// A project name is a trimmed, length-capped string; anything falsy becomes '' (ungrouped).
function normalizeProject(p) {
  if (p == null) return '';
  return String(p).trim().slice(0, 120);
}

class DocumentStore {
  constructor(libraryDir) {
    this.dir = libraryDir;
    this.trashDir = path.join(libraryDir, '.trash');
    this._locks = new Map(); // documentId -> Promise chain (per-id write serialisation)
    fs.mkdirSync(this.dir, { recursive: true });
    fs.mkdirSync(this.trashDir, { recursive: true });
  }

  _file(id) { return path.join(this.dir, id + EXT); }
  _bak(id) { return path.join(this.dir, id + EXT + '.bak'); }
  _tmp(id) { return path.join(this.dir, id + EXT + '.' + process.pid + '.tmp'); }
  _svg(id) { return path.join(this.dir, id + '.svg'); }

  // Run `fn` exclusively for a given documentId — serialises concurrent writers.
  _withLock(id, fn) {
    const prev = this._locks.get(id) || Promise.resolve();
    const next = prev.then(fn, fn); // run regardless of prior outcome
    // Keep the chain but swallow errors so one failure doesn't poison the lock.
    const guard = next.catch(() => {});
    this._locks.set(id, guard);
    // Drop the map entry once this is the tail of the chain (avoid unbounded growth).
    guard.then(() => { if (this._locks.get(id) === guard) this._locks.delete(id); });
    return next;
  }

  async _atomicWrite(filePath, data) {
    // Unique temp name (pid + counter) so concurrent/parallel writers never collide.
    const tmp = filePath + '.' + process.pid + '.' + (DocumentStore._tmpSeq++) + '.tmp';
    const fh = await fsp.open(tmp, 'w');
    try {
      await fh.writeFile(data, 'utf8');
      await fh.sync();
    } finally {
      await fh.close();
    }
    await fsp.rename(tmp, filePath);
    // Best-effort: persist the directory entry so the rename survives power loss.
    try {
      const dh = await fsp.open(path.dirname(filePath), 'r');
      try { await dh.sync(); } finally { await dh.close(); }
    } catch (e) { /* not supported on all platforms/filesystems */ }
  }

  async create({ title, project } = {}) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const envelope = {
      fileFormatVersion: FILE_FORMAT_VERSION,
      documentId: id,
      title: (title && String(title).trim()) || t('Untitled pedigree'),
      project: normalizeProject(project),
      createdAt: now,
      updatedAt: now,
      graph: null
    };
    await this._withLock(id, () => this._atomicWrite(this._file(id), JSON.stringify(envelope, null, 2)));
    return this._meta(envelope);
  }

  // Persist a pedigree. `graph` is the raw JSON string from editor.getGraph().toJSON().
  async save({ documentId, title, graph, svg, project, description, localizedTitle, localizedProject, localizedDescription, isExample }) {
    if (!isValidId(documentId)) throw new Error('save: invalid documentId');
    if (typeof graph !== 'string') throw new Error('save: graph must be a JSON string');
    let parsedGraph;
    try {
      parsedGraph = JSON.parse(graph);
    } catch (e) {
      throw new Error('save: graph is not valid JSON');
    }
    return this._withLock(documentId, async () => {
      const file = this._file(documentId);

      // Read the current file's raw bytes. Distinguish "doesn't exist" (fine, new doc)
      // from "exists but unreadable/unparseable" (do NOT silently clobber — quarantine it).
      let rawCurrent = null;
      let base = null;
      try {
        rawCurrent = await fsp.readFile(file, 'utf8');
      } catch (e) {
        if (e.code !== 'ENOENT') throw e; // permission/IO error — refuse rather than overwrite
      }
      if (rawCurrent != null) {
        try {
          base = JSON.parse(rawCurrent);
        } catch (e) {
          // Existing file is corrupt: preserve it as a recovery copy before we overwrite.
          const quarantine = file + '.corrupt.' + Date.now();
          try { await fsp.rename(file, quarantine); } catch (e2) { /* best effort */ }
          rawCurrent = null;
        }
      }

      const now = new Date().toISOString();
      const envelope = {
        fileFormatVersion: FILE_FORMAT_VERSION,
        documentId,
        title: (title != null ? String(title) : (base && base.title)) || t('Untitled pedigree'),
        // Preserve the existing project unless the caller explicitly passed one.
        project: project !== undefined ? normalizeProject(project) : normalizeProject(base && base.project),
        createdAt: (base && base.createdAt) || now,
        updatedAt: now
      };
      // Carry forward the example metadata (bilingual display names + source/description) unless
      // the caller explicitly overrides it, so editing and saving an example never strips it.
      const keepDesc = description !== undefined ? description : (base && base.description);
      if (keepDesc != null) { envelope.description = keepDesc; }
      const keepLT = localizedTitle !== undefined ? localizedTitle : (base && base.localizedTitle);
      if (keepLT) { envelope.localizedTitle = keepLT; }
      const keepLP = localizedProject !== undefined ? localizedProject : (base && base.localizedProject);
      if (keepLP) { envelope.localizedProject = keepLP; }
      const keepLD = localizedDescription !== undefined ? localizedDescription : (base && base.localizedDescription);
      if (keepLD) { envelope.localizedDescription = keepLD; }
      const keepEx = isExample !== undefined ? isExample : (base && base.isExample);
      if (keepEx) { envelope.isExample = true; }
      envelope.graph = parsedGraph;

      // Atomically write the new version, then atomically refresh the .bak from the
      // previous good bytes (both temp -> fsync -> rename, so neither can be torn).
      await this._atomicWrite(file, JSON.stringify(envelope, null, 2));
      if (rawCurrent != null) {
        try { await this._atomicWrite(this._bak(documentId), rawCurrent); } catch (e) { /* best effort */ }
      }
      if (typeof svg === 'string' && svg.length) {
        try { await this._atomicWrite(this._svg(documentId), svg); } catch (e) { /* preview is non-critical */ }
      }
      return this._meta(envelope);
    });
  }

  async read(documentId) {
    if (!isValidId(documentId)) throw new Error('read: invalid documentId');
    const raw = await fsp.readFile(this._file(documentId), 'utf8');
    const env = JSON.parse(raw);

    // Legacy pre-envelope raw graph ({GG,ranks,order,positions}) — wrap it in-memory.
    if (isLegacyRawGraph(env)) {
      return {
        documentId,
        title: t('Imported pedigree'),
        fileFormatVersion: 0,
        createdAt: null,
        updatedAt: null,
        graph: JSON.stringify(env)
      };
    }

    // Reject envelopes written by a newer app than this build understands.
    if (typeof env.fileFormatVersion === 'number' && env.fileFormatVersion > FILE_FORMAT_VERSION) {
      throw new Error('read: document was created by a newer version of the app '
        + '(fileFormatVersion ' + env.fileFormatVersion + ' > ' + FILE_FORMAT_VERSION + ')');
    }

    return {
      documentId: env.documentId || documentId,
      title: env.title,
      project: normalizeProject(env.project),
      description: env.description != null ? env.description : undefined,
      localizedTitle: env.localizedTitle || undefined,
      localizedProject: env.localizedProject || undefined,
      localizedDescription: env.localizedDescription || undefined,
      isExample: env.isExample ? true : undefined,
      fileFormatVersion: env.fileFormatVersion,
      createdAt: env.createdAt,
      updatedAt: env.updatedAt,
      graph: env.graph == null ? null : JSON.stringify(env.graph)
    };
  }

  // Move a document into a project (empty string = ungrouped). Cheap metadata-only write.
  async setProject(documentId, project) {
    if (!isValidId(documentId)) throw new Error('setProject: invalid documentId');
    return this._withLock(documentId, async () => {
      const file = this._file(documentId);
      const env = JSON.parse(await fsp.readFile(file, 'utf8'));
      env.project = normalizeProject(project);
      env.updatedAt = new Date().toISOString();
      await this._atomicWrite(file, JSON.stringify(env, null, 2));
      return this._meta(env);
    });
  }

  async list() {
    let names;
    try {
      names = await fsp.readdir(this.dir);
    } catch (e) { return []; }
    const out = [];
    for (const name of names) {
      if (!name.endsWith(EXT)) continue;
      const file = path.join(this.dir, name);
      const idFromName = name.slice(0, -EXT.length);
      try {
        const env = JSON.parse(await fsp.readFile(file, 'utf8'));
        // The FILENAME uuid is authoritative — every read/rename/copy/trash targets the file
        // named by this id. If the envelope carries a different documentId (e.g. a file was
        // copied outside the app), flag it corrupt rather than let a card act on another file
        // (Codex #5).
        if (env.documentId && env.documentId !== idFromName) {
          out.push({ documentId: idFromName, title: env.title || idFromName, corrupt: true, reason: 'id-mismatch', updatedAt: env.updatedAt || null });
          continue;
        }
        env.documentId = idFromName;
        out.push(this._meta(env));
      } catch (e) {
        // Corrupt file — surface it rather than hide it.
        out.push({ documentId: name.slice(0, -EXT.length), title: name, corrupt: true, updatedAt: null });
      }
    }
    out.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    return out;
  }

  async rename(documentId, title) {
    if (!isValidId(documentId)) throw new Error('rename: invalid documentId');
    return this._withLock(documentId, async () => {
      const file = this._file(documentId);
      const env = JSON.parse(await fsp.readFile(file, 'utf8'));
      env.title = String(title || '').trim() || env.title;
      env.updatedAt = new Date().toISOString();
      await this._atomicWrite(file, JSON.stringify(env, null, 2));
      return this._meta(env);
    });
  }

  async copy(documentId) {
    if (!isValidId(documentId)) throw new Error('copy: invalid documentId');
    const env = JSON.parse(await fsp.readFile(this._file(documentId), 'utf8'));
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const clone = { ...env, documentId: id, title: env.title + t(' (copy)'), createdAt: now, updatedAt: now };
    await this._withLock(id, () => this._atomicWrite(this._file(id), JSON.stringify(clone, null, 2)));
    return this._meta(clone);
  }

  async trash(documentId) {
    if (!isValidId(documentId)) throw new Error('trash: invalid documentId');
    return this._withLock(documentId, async () => {
      const file = this._file(documentId);
      const dest = path.join(this.trashDir, documentId + EXT + '.' + Date.now());
      await fsp.rename(file, dest);
      for (const p of [this._bak(documentId), this._svg(documentId)]) {
        try { await fsp.unlink(p); } catch (e) { /* ignore */ }
      }
      return { documentId, trashed: true };
    });
  }

  _meta(env) {
    return {
      documentId: env.documentId,
      title: env.title,
      project: normalizeProject(env.project),
      createdAt: env.createdAt,
      updatedAt: env.updatedAt,
      isEmpty: env.graph == null,
      clinical: this._clinicalSummary(env.graph),
      // Optional metadata carried by the bundled examples: a human-readable description (source /
      // teaching note, shown on the library card) and bilingual display names picked by UI locale.
      description: env.description != null ? env.description : undefined,
      localizedTitle: env.localizedTitle || undefined,
      localizedProject: env.localizedProject || undefined,
      localizedDescription: env.localizedDescription || undefined,
      isExample: env.isExample ? true : undefined
    };
  }

  // Pull a compact clinical summary out of a stored graph so the library can show
  // genes / phenotypes at a glance without opening each pedigree. Returns null for
  // empty/unreadable graphs. Defensive: clinical fields may be strings or {id,label} objects.
  _clinicalSummary(graph) {
    if (!graph || !Array.isArray(graph.GG)) return null;
    const labelOf = (item) => {
      if (item == null) return null;
      if (typeof item === 'string' || typeof item === 'number') return String(item).trim() || null;
      return String(item.id || item.gene || item.symbol || item.value || item.label || item.name || '').trim() || null;
    };
    const genes = new Set(), hpo = new Set(), disorders = new Set();
    let people = 0;
    for (const node of graph.GG) {
      if (!node || node.rel || node.chhub || node.virt) continue; // person nodes only
      const p = node.prop || {};
      people++;
      const collect = (arr, set) => { if (Array.isArray(arr)) { for (const it of arr) { const l = labelOf(it); if (l) set.add(l); } } };
      collect(p.candidateGenes, genes);
      collect(p.hpoTerms, hpo);
      collect(p.disorders, disorders);
    }
    if (!genes.size && !hpo.size && !disorders.size) {
      return people ? { people } : null;
    }
    return {
      people,
      genes: Array.from(genes).slice(0, 8),
      geneCount: genes.size,
      hpo: Array.from(hpo).slice(0, 6),
      hpoCount: hpo.size,
      disorderCount: disorders.size
    };
  }
}

DocumentStore._tmpSeq = 0;

module.exports = { DocumentStore, FILE_FORMAT_VERSION };
