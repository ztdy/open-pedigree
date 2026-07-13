'use strict';

const path = require('path');

// Guess the pedigree import format from the filename, falling back to a content sniff.
// Returns one of the importSelector values: 'ped' | 'gedcom' | 'BOADICEA' | 'GA4GH'.
function detectImportType(filename, content) {
  const ext = path.extname(filename || '').toLowerCase();
  if (ext === '.ged' || ext === '.gedcom') return 'gedcom';
  if (ext === '.json' || ext === '.fhir') return 'GA4GH';
  if (ext === '.boadicea' || ext === '.bd') return 'BOADICEA';
  const head = (content || '').slice(0, 200);
  if (/^\s*BOADICEA import pedigree file format/i.test(head)) return 'BOADICEA';
  if (/^\s*0\s+HEAD/m.test(head) || /\b0 @[^@]+@ INDI\b/.test(content || '')) return 'gedcom';
  if (/^\s*[{[]/.test(head) && /"resourceType"|"FamilyHistory"|"Composition"/.test(content || '')) return 'GA4GH';
  return 'ped'; // PED/LINKAGE is the permissive default
}

module.exports = { detectImportType };
