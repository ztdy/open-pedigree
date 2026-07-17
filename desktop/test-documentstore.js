'use strict';

// Pure-Node unit test for DocumentStore — no Electron required (archetype-A regression).
// Run: node desktop/test-documentstore.js   (exit 0 = pass)

const os = require('os');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { DocumentStore } = require('./documentStore');

let passed = 0;
function ok(name) { console.log('PASS  ' + name); passed++; }

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opedigree-test-'));
  const store = new DocumentStore(dir);

  // create
  const a = await store.create({ title: 'Family A' });
  assert(a.documentId && a.isEmpty === true, 'create returns empty doc meta');
  assert(/^[0-9a-fA-F-]{36}$/.test(a.documentId), 'id is uuid');
  ok('create() makes an empty envelope');

  // save round-trip (graph is a JSON string, as the renderer sends it)
  const graphStr = JSON.stringify({ GG: [{ id: 0, name: 'proband' }], ranks: [1], order: [[0]], positions: [5] });
  const savedMeta = await store.save({ documentId: a.documentId, title: 'Family A', graph: graphStr, svg: '<svg/>' });
  assert(savedMeta.isEmpty === false, 'saved doc not empty');
  const readBack = await store.read(a.documentId);
  assert.deepStrictEqual(JSON.parse(readBack.graph), JSON.parse(graphStr), 'graph round-trips losslessly');
  ok('save() then read() round-trips the graph');

  // atomic write leaves a .bak of the previous version on second save
  await store.save({ documentId: a.documentId, title: 'Family A', graph: JSON.stringify({ GG: [], ranks: [], order: [], positions: [] }) });
  assert(fs.existsSync(path.join(dir, a.documentId + '.opedigree.bak')), '.bak exists after overwrite');
  ok('second save() keeps a .bak backup');

  // svg sidecar written
  assert(fs.existsSync(path.join(dir, a.documentId + '.svg')), 'svg sidecar written');
  ok('save() writes svg sidecar');

  // invalid input rejected (unsafe id / non-string graph)
  await assert.rejects(() => store.save({ documentId: 'not-a-uuid', graph: '{}' }), 'rejects bad id');
  await assert.rejects(() => store.save({ documentId: a.documentId, graph: { not: 'a string' } }), 'rejects non-string graph');
  await assert.rejects(() => store.save({ documentId: a.documentId, graph: '{bad json' }), 'rejects invalid JSON');
  ok('save() rejects unsafe id / non-string / invalid-JSON graph');

  // list, rename, copy
  const b = await store.create({ title: 'Family B' });
  let listed = await store.list();
  assert(listed.length === 2, 'list shows both docs');
  await store.rename(a.documentId, 'Renamed A');
  const renamed = await store.read(a.documentId);
  assert(renamed.title === 'Renamed A', 'rename persisted');
  const copy = await store.copy(a.documentId);
  assert(copy.documentId !== a.documentId && /copy/.test(copy.title), 'copy has new id + (copy) title');
  ok('list() / rename() / copy() work');

  // concurrent saves are serialised and do not corrupt the file
  await Promise.all([
    store.save({ documentId: b.documentId, graph: JSON.stringify({ GG: [{ id: 1 }], ranks: [], order: [], positions: [] }) }),
    store.save({ documentId: b.documentId, graph: JSON.stringify({ GG: [{ id: 2 }], ranks: [], order: [], positions: [] }) }),
    store.save({ documentId: b.documentId, graph: JSON.stringify({ GG: [{ id: 3 }], ranks: [], order: [], positions: [] }) })
  ]);
  const bFinal = await store.read(b.documentId);
  JSON.parse(bFinal.graph); // must be valid JSON, not a torn write
  ok('concurrent save()s stay serialised and uncorrupted');

  // trash removes from the library
  await store.trash(copy.documentId);
  listed = await store.list();
  assert(!listed.find((d) => d.documentId === copy.documentId), 'trashed doc gone from list');
  ok('trash() removes from library');

  // corrupt file is surfaced, not crashed on
  fs.writeFileSync(path.join(dir, '11111111-1111-4111-8111-111111111111.opedigree'), '{ not valid');
  listed = await store.list();
  assert(listed.find((d) => d.corrupt === true), 'corrupt file flagged in list');
  ok('list() surfaces corrupt files instead of throwing');

  // --- fixes from Codex M1 review ---

  // strict UUID: all-dashes / wrong shape rejected
  await assert.rejects(() => store.read('------------------------------------'), 'all-dashes id rejected');
  await assert.rejects(() => store.read('zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz'), 'non-hex id rejected');
  ok('strict UUID validation rejects malformed ids');

  // legacy pre-envelope raw graph is read as a wrapped document, not treated as empty
  const legacyId = '22222222-2222-4222-8222-222222222222';
  fs.writeFileSync(path.join(dir, legacyId + '.opedigree'),
    JSON.stringify({ GG: [{ id: 0 }], ranks: [1], order: [[0]], positions: [0] }));
  const legacy = await store.read(legacyId);
  assert(legacy.graph && JSON.parse(legacy.graph).GG.length === 1, 'legacy raw graph read as graph');
  assert(legacy.fileFormatVersion === 0, 'legacy flagged as version 0');
  ok('read() handles legacy raw graph (no fileFormatVersion)');

  // future version rejected rather than misread
  const futureId = '33333333-3333-4333-8333-333333333333';
  fs.writeFileSync(path.join(dir, futureId + '.opedigree'),
    JSON.stringify({ fileFormatVersion: 999, documentId: futureId, graph: { GG: [] } }));
  await assert.rejects(() => store.read(futureId), /newer version/, 'future version rejected');
  ok('read() rejects a newer fileFormatVersion');

  // an existing-but-unparseable file is quarantined, not silently clobbered, on save
  const clobberId = '44444444-4444-4444-8444-444444444444';
  const clobberFile = path.join(dir, clobberId + '.opedigree');
  fs.writeFileSync(clobberFile, '{ half-written garbage');
  await store.save({ documentId: clobberId, graph: JSON.stringify({ GG: [{ id: 9 }], ranks: [], order: [], positions: [] }) });
  const quarantined = fs.readdirSync(dir).some((n) => n.startsWith(clobberId + '.opedigree.corrupt.'));
  assert(quarantined, 'unparseable original preserved as .corrupt');
  assert(JSON.parse(fs.readFileSync(clobberFile, 'utf8')).graph.GG.length === 1, 'new content saved');
  ok('save() quarantines an unreadable original instead of clobbering it');

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n==== DocumentStore: ${passed} checks passed ====`);
}

main().catch((e) => { console.error('FAIL', e); process.exit(1); });
