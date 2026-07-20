'use strict';

// Advisory pedigree consistency checks.
//
// DESIGN CONTRACT (do not weaken):
//  1. ADVISORY ONLY. This never blocks an edit, never refuses to load/save, never
//     mutates the graph. It returns a list of findings the UI MAY surface (opt-in).
//     A pedigree in progress is usually incomplete; validation must not nag.
//  2. SOUND ONLY — zero false positives. A finding is emitted ONLY for a state that has
//     NO valid interpretation. Anything that could be legitimate is NOT a finding.
//     Missing data (no dates, unknown sex, …) is never a finding — the check is skipped.
//
// Input: a normalized array of plain persons (decoupled from the live model so this is
// pure and unit-testable). Each: {
//   id, sex:'M'|'F'|'U',             // gender identity (NOT used for the twin-sex check)
//   asab:'AMAB'|'AFAB'|'UAAB'|'',    // assigned sex at birth — the biological axis for twins
//   birthYear:Number|null, deathYear:Number|null,
//   lifeStatus:String,               // 'alive'|'deceased'|'stillborn'|'miscarriage'|'aborted'|'ectopic'|'unborn'|...
//   adopted:Boolean,
//   monozygotic:Boolean, twinGroup:(id|null),   // twinGroup is SIBSHIP-LOCAL (see the twin check)
//   parents:[id,…],                  // biological parents in this pedigree
//   childrenCount:Number
// }
//
// KNOWN LIMITATION (dates): birth/death years are compared as exact. Pedigrees built in the
// app use exact picker dates, so the date checks are sound there. GEDCOM import strips
// BEF/AFT/ABT/EST modifiers (import.js) and keeps only the bare year, losing the range — so on
// such imprecise imports these two date checks could rarely misfire. They stay because they are
// sound for normal (app-authored) use; revisit if the date model ever retains precision.
// Output: [ { code, severity:'warning', ids:[…], message } ]  (empty === consistent)
//
// CHECKS INTENTIONALLY EXCLUDED because they would false-positive on legitimate pedigrees
// (documented so nobody "helpfully" adds them):
//   - affected child of two unaffected parents  -> valid: autosomal-recessive carriers, or de novo.
//   - carrier / presymptomatic combinations      -> all clinically valid.
//   - consanguinity                              -> a FEATURE (auto-drawn), never an error.
//   - large parent/child age gaps, old parents   -> biologically valid.
//   - gender identity vs parental role           -> NSGC 2022 separates gender from sex; ART/donor
//                                                    make a female-presenting father etc. legitimate.
//   - "deceased individual has children"         -> valid: children born before death.
//   - Mendelian genotype transmission            -> needs complete allele data we rarely have;
//                                                    deferred rather than risk unsound warnings.
//
// DEPENDENCY ASSUMPTION: `parents` is taken to mean the two BIOLOGICAL parents. The model
// currently has no separate notion of a social/step/non-biological partner (only whole-child
// `adopted`), so this holds today. If a future edit path introduces social/step parents, the
// parent-younger-than-child check must be revisited (a young step-parent would be legitimate).

var LOSS_STATUSES = { stillborn: 1, miscarriage: 1, aborted: 1, ectopic: 1 };

function isNum(x) { return typeof x === 'number' && isFinite(x); }

// 1) A death cannot precede a birth (both years known).
function checkDeathBeforeBirth(persons, out) {
  for (var i = 0; i < persons.length; i++) {
    var p = persons[i];
    if (isNum(p.birthYear) && isNum(p.deathYear) && p.deathYear < p.birthYear) {
      out.push({ code: 'death-before-birth', severity: 'warning', ids: [p.id],
        message: 'Death year (' + p.deathYear + ') is before birth year (' + p.birthYear + ').' });
    }
  }
}

// 2) A biological parent must be born before their child (both years known). Adopted
//    children are skipped — an adoptive parent's age is unconstrained here.
function checkParentBornAfterChild(persons, out) {
  var byId = Object.create(null); // null-proto: ids like "__proto__" from imports can't poison it
  for (var i = 0; i < persons.length; i++) { byId[persons[i].id] = persons[i]; }
  for (var j = 0; j < persons.length; j++) {
    var child = persons[j];
    if (child.adopted || !isNum(child.birthYear) || !child.parents) { continue; }
    for (var k = 0; k < child.parents.length; k++) {
      var par = byId[child.parents[k]];
      if (par && isNum(par.birthYear) && par.birthYear > child.birthYear) {
        out.push({ code: 'parent-younger-than-child', severity: 'warning', ids: [par.id, child.id],
          message: 'A parent (born ' + par.birthYear + ') is younger than their child (born ' + child.birthYear + ').' });
      }
    }
  }
}

// 3) A pregnancy that did not result in a live birth (stillbirth/miscarriage/aborted/
//    ectopic) cannot itself be a parent.
function checkLossHasChildren(persons, out) {
  for (var i = 0; i < persons.length; i++) {
    var p = persons[i];
    if (LOSS_STATUSES[p.lifeStatus] && p.childrenCount > 0) {
      out.push({ code: 'pregnancy-loss-has-children', severity: 'warning', ids: [p.id],
        message: 'A non-live-birth pregnancy is recorded as a parent, which is not biologically possible.' });
    }
  }
}

// 4) Monozygotic twins are genetically identical and therefore the same sex. If a twin
//    group contains an explicit monozygotic mark but mixes M and F, that is a data error.
function checkMonozygoticMixedSex(persons, out) {
  var groups = Object.create(null); // sibship-scoped key -> { mono, asab:{}, ids:[] }; null-proto
  for (var i = 0; i < persons.length; i++) {
    var p = persons[i];
    if (p.twinGroup === null || p.twinGroup === undefined) { continue; }
    // twinGroup ids are SIBSHIP-LOCAL small integers (0,1,2… per set of parents), NOT globally
    // unique — two unrelated twin pairs both get 0. Scope the group by the shared parents so
    // unrelated sibships never merge (co-twins share both the same parents and the same
    // twinGroup number). Without this, a legitimate dizygotic boy/girl pair would false-positive
    // whenever another branch happened to reuse the same local twinGroup number.
    var parentKey = (p.parents && p.parents.length) ? p.parents.map(String).sort().join(',') : '';
    var key = parentKey + '#' + p.twinGroup;
    var g = groups[key] || (groups[key] = { mono: false, asab: Object.create(null), ids: [] });
    if (p.monozygotic) { g.mono = true; }
    // Compare ASSIGNED SEX AT BIRTH (the biological invariant identical twins share), NOT gender
    // identity: MZ co-twins can legitimately have DIFFERENT gender identities (one is transgender),
    // so a gender mismatch is not an error. Only a definite AMAB vs AFAB conflict is impossible.
    // ASAB is often unset — then this check simply stays silent (sound).
    if (p.asab === 'AMAB' || p.asab === 'AFAB') { g.asab[p.asab] = 1; }
    g.ids.push(p.id);
  }
  for (var gkey in groups) {
    var grp = groups[gkey];
    if (grp.mono && grp.asab.AMAB && grp.asab.AFAB) {
      out.push({ code: 'monozygotic-mixed-sex', severity: 'warning', ids: grp.ids.slice(),
        message: 'Monozygotic (identical) twins are recorded with different sex assigned at birth.' });
    }
  }
}

// Run every check. Order is stable; caller decides how to present.
export function validatePedigree(persons) {
  var out = [];
  if (!persons || !persons.length) { return out; }
  checkDeathBeforeBirth(persons, out);
  checkParentBornAfterChild(persons, out);
  checkLossHasChildren(persons, out);
  checkMonozygoticMixedSex(persons, out);
  return out;
}

export default { validatePedigree: validatePedigree };
