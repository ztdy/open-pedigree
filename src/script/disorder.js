import { isInt, escapeIDChar, decodeTermID } from 'pedigree/model/helpers';
import I18n from 'pedigree/i18n';
/*
 * Disorder is a class for storing genetic disorder info and loading it from the
 * the OMIM database. These disorders can be attributed to an individual in the Pedigree.
 *
 * An id is one of three things:
 *   - a MIM number (integer)   — OMIM, resolved over the network; not available on the desktop
 *                                build, where OMIM is not bundled (copyright)
 *   - 'ORPHA:nnn'              — Orphanet, resolved from the dataset bundled with the desktop
 *   - anything else            — free text typed by the user; the id encodes the name itself
 *
 * @param disorderID the id number for the disorder, taken from the OMIM database
 * @param name a string representing the name of the disorder e.g. "Down Syndrome"
 */

var Disorder = Class.create( {

  initialize: function(disorderID, name, callWhenReady) {
    this._disorderID = Disorder.sanitizeID(disorderID);

    // A user-defined (free-text) disorder is stored by its id alone, so its name *is* the
    // decoded id. A coded term must be resolved instead — 'ORPHA:558' is an identifier, not
    // something to show in the legend.
    if (name == null && !Disorder.isCodedID(this._disorderID)) {
      name = Disorder.desanitizeID(this._disorderID);
    }

    this._name = name ? name : 'loading...';

    if (!name && callWhenReady) {
      this.load(callWhenReady);
    }
  },

  /*
     * Returns the disorderID of the disorder
     */
  getDisorderID: function() {
    return this._disorderID;
  },

  /*
     * Returns the name of the disorder
     */
  getName: function() {
    return this._name;
  },

  load: function(callWhenReady) {
    var queryURL;
    var isDesktop = (typeof window !== 'undefined' && window.openPedigreeDesktop && window.openPedigreeDesktop.isDesktop);
    if (isDesktop) {
      var id = Disorder.desanitizeID(String(this._disorderID));
      // Desktop build: rehydrate the name from the bundled Orphanet dataset over opdata://,
      // so a saved pedigree reopened offline shows the disorder name and not its id.
      if (Disorder.ORPHA_ID.test(id)) {
        queryURL = 'opdata://disorders/?lang=' + I18n.getLocale() + '&q=' + encodeURIComponent(id);
      } else {
        // A MIM number has no offline source (OMIM is not bundled — licensing). Don't fire a
        // doomed XHR (the legacy loader surfaces failures as blocking alerts offline); show
        // the id rather than a stuck "loading...".
        if (this._name === 'loading...') {
          this._name = id;
        }
        if (typeof callWhenReady === 'function') {
          callWhenReady();
        }
        return;
      }
    } else {
      queryURL = Disorder.getOMIMServiceURL() + '&q=id:' + this._disorderID;
    }
    //console.log("queryURL: " + queryURL);
    new Ajax.Request(queryURL, {
      method: 'GET',
      onSuccess: this.onDataReady.bind(this),
      //onComplete: complete.bind(this)
      onComplete: callWhenReady ? callWhenReady : {}
    });
  },

  onDataReady : function(response) {
    try {
      var parsed = JSON.parse(response.responseText);
      //console.log(JSON.stringify(parsed));
      console.log('LOADED DISORDER: disorder id = ' + this._disorderID + ', name = ' + parsed.rows[0].name);
      this._name = parsed.rows[0].name;
    } catch (err) {
      console.log('[LOAD DISORDER] Error: ' +  err);
    }
  }
});

/*
 * IDs are used as part of HTML IDs in the Legend box, which breaks when IDs contain some non-alphanumeric symbols.
 * For that purpose these symbols in IDs are converted in memory (but not in the stored pedigree) to some underscores.
 *
 * The encoding must be *reversible*: a free-text term is stored by its sanitized id alone, so
 * desanitizeID is the only way its name comes back (on reload, on export, and in the legend).
 * Collapsing every out-of-charset character to '__' was not reversible and, worse, not injective:
 * any two same-length CJK names produced the identical id, silently merging two different
 * disorders into one legend entry. Out-of-charset characters are escaped as _uXXXX_ instead,
 * which stays inside the HTML-id-safe charset.
 *
 * ' ' keeps its legacy '__' mapping, and ids saved by older versions consist only of in-charset
 * characters, so they pass through both functions exactly as they did before.
 *
 * KNOWN LIMIT, deliberate: neither property holds for a name that itself contains something
 * shaped like an escape the encoder could really have EMITTED — 'a__b' decodes to 'a b',
 * 'Cancer_L_x' to 'Cancer(x', 'X_u9057_Y' to 'X遗Y'. '_' is inside the charset, so it survives
 * unescaped and the escape namespace is not protected.
 *
 * The qualifier is load-bearing and is not decoration: 'X_u0041_Y' is NOT in this class, because
 * 'A' is inside the charset and is therefore never escaped, so no name could have encoded to
 * that. It used to decode to 'XAY' anyway, and no longer does — see decodeTermID in helpers.js.
 * Only an escape of an out-of-charset character is genuinely ambiguous with the text that spells
 * it out.
 *
 * Two attempts at closing it have been rejected on evidence, so before trying a third:
 *
 *   - Escaping every '_' moves the id of every name that contains one. 'BRCA1_variant' would stop
 *     mapping to the id 'BRCA1_variant' that saved pedigrees already hold, so reopening one would
 *     mint a second id for a disorder already in the file and list it twice in the legend.
 *
 *   - Escaping only the AMBIGUOUS '_' (one followed by '_', 'L_', 'J_', 'C_' or 'uXXXX_') and
 *     decoding in a single left-to-right pass looks like it dodges that — 'BRCA1_variant' is
 *     untouched — but it breaks idempotence, which this function does not get to give up:
 *     initialize() sanitizes an id that has usually been sanitized already. The name '(' encodes
 *     to '_L_'; sanitizing THAT again sees an ambiguous '_' and gives '_u005F_L_', which decodes
 *     to the literal '_L_' and not to '('.
 *
 *     (That objection is against changing sanitizeID, and it stands. The single-pass DECODE was
 *     adopted on its own — see decodeTermID in helpers.js — and sanitizeID is untouched, so
 *     idempotence is unaffected.)
 *
 * So sanitizeID stays as it is, and the residual ambiguity is a known limit rather than an
 * oversight — pinned in test/unit/term-ids.test.js. Note the trigger is NOT only exotic text:
 * 'a__b' and 'a b' collide, and a double underscore is typable. It has simply never been
 * reported, and every fix aimed at the ENCODER so far trades it for a fault that reaches every
 * saved file instead of a rare name.
 *
 * DO NOT confuse this limit with the faults that were fixed in the DECODER (decodeTermID in
 * helpers.js). This one is about a name that CONTAINS an emittable escape, which is rare. Those
 * were about a name whose ENCODING puts two escapes back to back — ') ' -> '_J_' + '__', and
 * 'a_[' -> '_' + '_u005B_' — which is ordinary nomenclature: 'Cancer (familial) type 2',
 * 'BRCA1_遗传性', and 183 real HPO and 30 real Orphanet names. Mistaking the second class for the
 * first is what made two rounds of "fixes" here refuse real diagnoses; the model to hold is "the
 * escaping creates the ambiguity", not "the name looks weird".
 */
Disorder.ORPHA_ID = /^ORPHA:\d+$/i;

/*
 * True when the id denotes a term in a coded vocabulary (an OMIM MIM number or an Orphanet
 * CURIE) rather than free text. Such an id carries no name of its own and has to be resolved.
 */
Disorder.isCodedID = function(disorderID) {
  return isInt(disorderID) || Disorder.ORPHA_ID.test(Disorder.desanitizeID(String(disorderID)));
};

Disorder.sanitizeID = function(disorderID) {
  if (isInt(disorderID)) {
    return disorderID;
  }
  // '(' keeps its legacy '_L_' (and ')' its '_J_') so ids already saved by older versions are
  // unchanged. '[' and ']' used to share those same two escapes, which made the mapping
  // non-injective — 'Cancer (familial)' and 'Cancer [familial]' were one id, and so one legend
  // row — and turned every bracket into a parenthesis on the way back. They take an ordinary
  // _uXXXX_ escape instead.
  var temp = disorderID.replace(/\(/g, '_L_');
  temp = temp.replace(/\)/g, '_J_');
  return temp.replace(/[^a-zA-Z0-9,;_\-*]/g, escapeIDChar);
};

/*
 * Decodes in ONE left-to-right pass — see decodeTermID in helpers.js for why a sequence of
 * global replaces cannot do this, and for the rule that resolves the overlap at both ends.
 *
 * sanitizeID is deliberately untouched: every id already stored stays byte-identical, so no
 * legend colour key is orphaned and nothing needs migrating.
 *
 * Where this decode differs from the old cascade on a REAL name, the old cascade was wrong — 183
 * HPO names and 30 Orphanet ones it mangled at a ') ' / ': ' seam, now correct. It also differs
 * on some pathological free-text ids that are genuinely ambiguous (two names, one id): there the
 * old cascade was not "wrong", it just picked the other preimage. Those shapes occur in zero
 * real ontology names — see the non-injective limit in decodeTermID and its test. So: no real
 * name regresses, and 213 real names are fixed.
 */
var DISORDER_ESCAPES = {'_L_': '(', '_J_': ')'};

Disorder.desanitizeID = function(disorderID) {
  return decodeTermID(disorderID, DISORDER_ESCAPES);
};

Disorder.getOMIMServiceURL = function() {
  return new XWiki.Document('OmimService', 'PhenoTips').getURL('get', 'outputSyntax=plain');
};

export default Disorder;
