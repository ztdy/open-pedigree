'use strict';

// Compiles a readable family spec ({ people, unions, proband }) into the internal
// "phenotips" node-list (the GG array that dynamicGraph.fromImport(..., 'phenotips')
// accepts and the positioning engine lays out). Keeping the spec declarative means the
// family data files double as the human-readable, literature-sourced record.
//
// A person attribute set:
//   sex:            'M' | 'F' | 'U'                     (default 'U')
//   affected:       String (disorder name) | true       -> shaded; name goes in the legend
//   gene:           String | [String]                   -> candidate gene(s)
//   hpo:            [String]                             -> HPO term ids (e.g. 'HP:0001250')
//   carrier:        true                                 -> unaffected carrier dot
//   presymptomatic: true                                 -> presymptomatic vertical line
//   lifeStatus:     'deceased'|'stillborn'|'aborted'|'miscarriage'|'ectopic'|'unborn'
//   deceased:       true                                 -> shorthand for lifeStatus 'deceased'
//   adopted:        true
//   asab:           'AMAB' | 'AFAB' | 'UAAB'             (sex assigned at birth annotation)
//   childless:      'childless' | 'infertile'
//   consultand:     true
//   note:           String                              -> comments
//   numPersons:     Number                              -> group node (n individuals)
//
// A union: { a, b, children: [labels], twins?: [{ members:[labels], mono?:true, unknown?:true }] }
//   Consanguinity is NOT flagged here — the app detects shared-ancestor matings and draws the
//   double line automatically, so drawing the cousins correctly is all that is needed.

// Mirrors Disorder.sanitizeID (src/script/disorder.js) EXACTLY so the ids we bake into a seed
// are byte-identical to what the app produces when a user types the same name.
function sanitizeID(name) {
  var t = String(name).replace(/\(/g, '_L_').replace(/\)/g, '_J_');
  return t.replace(/[^a-zA-Z0-9,;_\-*]/g, function (c) {
    if (c === ' ') { return '__'; }
    var hex = c.charCodeAt(0).toString(16).toUpperCase();
    while (hex.length < 4) { hex = '0' + hex; }
    return '_u' + hex + '_';
  });
}

// HPO ids additionally escape ':' as '_C_' (HPOTerm.sanitizeID).
function sanitizeHPO(id) {
  return sanitizeID(String(id).replace(/:/g, '_C_'));
}

function personProp(label, a, probandLabel) {
  a = a || {};
  var prop = { gender: a.sex || 'U' };

  if (a.affected) {
    var names = (a.affected === true) ? ['affected'] : (Array.isArray(a.affected) ? a.affected : [a.affected]);
    prop.disorders = names.map(sanitizeID);
    prop.carrierStatus = 'affected';
  } else if (a.presymptomatic) {
    prop.carrierStatus = 'presymptomatic';
  } else if (a.carrier) {
    prop.carrierStatus = 'carrier';
  }

  // A candidate gene is shown as a TEXT label under the symbol (and listed in the Candidate Genes
  // legend) — it no longer tints the symbol, so an affected individual who also carries the gene is
  // a single disorder-filled symbol with the gene written beneath, not a two-colour pie. Per NSGC
  // 2022/2025 the fill means PHENOTYPE while the gene/variant identity is text. Safe to attach to
  // anyone; here we keep it on affected individuals (the family's causative gene).
  if (a.gene && a.affected) { prop.candidateGenes = Array.isArray(a.gene) ? a.gene.slice() : [a.gene]; }
  // Optional free-text genotype / variant result shown under the symbol (e.g. "BRCA1 c.68_69del (+)").
  if (a.genotype) { prop.genotype = String(a.genotype); }
  if (a.hpo) { prop.hpoTerms = a.hpo.map(sanitizeHPO); }

  var life = a.lifeStatus || (a.deceased ? 'deceased' : null);
  if (life) { prop.lifeStatus = life; }

  if (a.adopted) { prop.isAdopted = true; }
  if (a.asab) { prop.assignedSexAtBirth = a.asab; }
  if (a.artRole) { prop.artRole = a.artRole; }
  if (a.childless) { prop.childlessStatus = a.childless; }
  if (a.consultand) { prop.consultand = true; }
  if (a.numPersons) { prop.numPersons = a.numPersons; }
  // a.note is documentation only (kept in the family spec + SOURCES); it is deliberately NOT
  // pushed into prop.comments, which the editor stamps under every symbol and would clutter the
  // drawing. The teaching narrative lives in each document's title/description instead.
  if (label === probandLabel) { prop.proband = true; }

  return prop;
}

// Returns the GG node-list.
function compile(spec) {
  var people = spec.people || {};
  var unions = spec.unions || [];
  var probandLabel = spec.proband;

  if (probandLabel && !people[probandLabel]) {
    throw new Error('proband "' + probandLabel + '" is not a person in this family');
  }

  // A founder (never anyone's child) must be vertex 0. Two reasons: it is the undeletable
  // layout anchor, and initFromPhenotipsInternal has a 0-is-falsy bug (a child whose vertex id
  // is 0 fails its own edge-target lookup) — a founder is never an edge target, so it is safe.
  // The proband marker is carried by prop.proband and is independent of which node is vertex 0.
  var childLabels = {};
  unions.forEach(function (u) { (u.children || []).forEach(function (c) { childLabels[c] = true; }); });
  var founders = Object.keys(people).filter(function (l) { return !childLabels[l]; });
  var rest = Object.keys(people).filter(function (l) { return childLabels[l]; });
  if (!founders.length) { throw new Error('family has no founder (every person is a child) — cannot pick a layout anchor'); }
  var order = founders.concat(rest);

  var outByPerson = {};   // label -> [{to: relName}]
  var relNodes = [];
  var twinSeq = 0;

  unions.forEach(function (u, i) {
    if (!people[u.a] || !people[u.b]) {
      throw new Error('union #' + i + ' references unknown partner(s): ' + u.a + ' x ' + u.b);
    }
    var relName = '__rel_' + i + '_' + u.a + '_' + u.b;
    var kids = (u.children || []).slice();
    if (!kids.length) {
      throw new Error('union ' + u.a + ' x ' + u.b + ' has no children; the internal model requires '
        + '>=1 child per relationship. Drop the union, or add a child (e.g. a loss/pregnancy).');
    }
    kids.forEach(function (c) {
      if (!people[c]) { throw new Error('union ' + u.a + ' x ' + u.b + ' has unknown child: ' + c); }
    });

    relNodes.push({ name: relName, rel: true, outedges: kids.map(function (c) { return { to: c }; }) });

    (outByPerson[u.a] = outByPerson[u.a] || []).push({ to: relName });
    (outByPerson[u.b] = outByPerson[u.b] || []).push({ to: relName });

    // Twin sets: assign a shared twinGroup id (and monozygotic / unknown-zygosity flags).
    (u.twins || []).forEach(function (set) {
      var gid = twinSeq++;
      (set.members || []).forEach(function (m) {
        if (!people[m]) { throw new Error('twin set references unknown child: ' + m); }
        people[m].__twinGroup = gid;
        if (set.mono) { people[m].__mono = true; }
        if (set.unknown) { people[m].__twinUnknown = true; }
      });
    });
  });

  // Every person must be connected: a child of some union, or a partner in some union. A
  // married-in spouse with no children is a disconnected component the model rejects — catch it
  // here with a clear message instead of a cryptic assertion from the layout engine.
  var partnerLabels = {};
  unions.forEach(function (u) { partnerLabels[u.a] = true; partnerLabels[u.b] = true; });
  var orphans = Object.keys(people).filter(function (l) { return !childLabels[l] && !partnerLabels[l]; });
  if (orphans.length) {
    throw new Error('disconnected person(s) with no parents and no union: ' + orphans.join(', ')
      + ' (give them a union with a child, or remove them)');
  }

  var personNodes = order.map(function (label) {
    var a = people[label];
    var prop = personProp(label, a, probandLabel);
    if (a.__twinGroup !== undefined) { prop.twinGroup = a.__twinGroup; }
    if (a.__mono) { prop.monozygotic = true; }
    if (a.__twinUnknown) { prop.twinZygosityUnknown = true; }
    var node = { name: label, prop: prop };
    if (outByPerson[label]) { node.outedges = outByPerson[label]; }
    return node;
  });

  // NOTE: the family's provenance/source is NOT stamped onto the proband as a node comment — the
  // editor draws every comment under the symbol and it covered the drawing. The source now lives in
  // the document's `description` field (written by generate.js into the .opedigree envelope and
  // shown on the library card), which DocumentStore preserves across save/load.

  return personNodes.concat(relNodes);
}

// Small structural summary for logging / verification.
function stats(spec) {
  var people = spec.people || {};
  var labels = Object.keys(people);
  var affected = labels.filter(function (l) { return people[l].affected; }).length;
  var carriers = labels.filter(function (l) { return people[l].carrier || people[l].presymptomatic; }).length;
  return { people: labels.length, unions: (spec.unions || []).length, affected: affected, carriers: carriers };
}

module.exports = { compile, stats, sanitizeID, sanitizeHPO };
