import { escapeIDChar, decodeTermID } from 'pedigree/model/helpers';
/*
 * HPOTerm is a class for storing phenotype information and loading it from the
 * the HPO database. These phenotypes can be attributed to an individual in the Pedigree.
 *
 * @param hpoID the id number for the HPO term, taken from the HPO database
 * @param name a string representing the name of the term e.g. "Abnormality of the eye"
 */

var HPOTerm = Class.create( {

  initialize: function(hpoID, name, callWhenReady) {
    // user-defined terms
    if (name == null && !HPOTerm.isValidID(HPOTerm.desanitizeID(hpoID))) {
      name = HPOTerm.desanitizeID(hpoID);
    }

    this._hpoID  = HPOTerm.sanitizeID(hpoID);
    this._name   = name ? name : 'loading...';

    if (!name && callWhenReady) {
      this.load(callWhenReady);
    }
  },

  /*
     * Returns the hpoID of the phenotype
     */
  getID: function() {
    return this._hpoID;
  },

  /*
     * Returns the name of the term
     */
  getName: function() {
    return this._name;
  },

  load: function(callWhenReady) {
    var queryURL;
    // Desktop build: rehydrate the term name from the bundled offline HPO dataset over
    // opdata:// (a saved pedigree reopened offline otherwise shows "loading..."). The
    // opdata handler resolves an exact HP:nnnnnnn id and returns the same {rows:[{name}]}.
    if (typeof window !== 'undefined' && window.openPedigreeDesktop && window.openPedigreeDesktop.isDesktop) {
      queryURL = 'opdata://hpo/?q=' + encodeURIComponent(HPOTerm.desanitizeID(this._hpoID));
    } else {
      var baseServiceURL = HPOTerm.getServiceURL();
      queryURL = baseServiceURL + '&q=id%3A' + HPOTerm.desanitizeID(this._hpoID).replace(':','%5C%3A');
    }
    //console.log("QueryURL: " + queryURL);
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
      console.log('LOADED HPO TERM: id = ' + HPOTerm.desanitizeID(this._hpoID) + ', name = ' + parsed.rows[0].name);
      this._name = parsed.rows[0].name;
    } catch (err) {
      console.log('[LOAD HPO TERM] Error: ' +  err);
    }
  }
});

/*
 * IDs are used as part of HTML IDs in the Legend box, which breaks when IDs contain some non-alphanumeric symbols.
 * For that purpose these symbols in IDs are converted in memory (but not in the stored pedigree) to some underscores.
 *
 * See Disorder.sanitizeID for why out-of-charset characters are escaped rather than collapsed
 * to '__' — a free-text phenotype is stored by its id alone, so the mapping has to be reversible
 * and injective. 'HP:nnnnnnn' ids keep their legacy '_C_' mapping and are unaffected.
 */
HPOTerm.sanitizeID = function(id) {
  // '(' keeps its legacy '_L_' (and ')' its '_J_') so ids already saved by older versions are
  // unchanged. '[' and ']' used to share those same two escapes, which made the mapping
  // non-injective — 'x (y)' and 'x [y]' were one id — and turned every bracket into a
  // parenthesis on the way back. They take an ordinary _uXXXX_ escape instead.
  var temp = id.replace(/\(/g, '_L_');
  temp = temp.replace(/\)/g, '_J_');
  temp = temp.replace(/[:]/g, '_C_');
  return temp.replace(/[^a-zA-Z0-9,;_\-*]/g, escapeIDChar);
};

/*
 * One left-to-right pass — see decodeTermID in helpers.js. The phenotype side has the same fault
 * as the disorder side plus ':': 'EMG: axonal abnormality' (HP:0003482, a real term) encodes ': '
 * as '_C_' + '__', and the old cascade replaced '__' first and ate the '_C_'s delimiter, so it
 * came back as 'EMG_C _axonal abnormality'.
 */
var HPO_ESCAPES = {'_C_': ':', '_L_': '(', '_J_': ')'};

HPOTerm.desanitizeID = function(id) {
  return decodeTermID(id, HPO_ESCAPES);
};

HPOTerm.isValidID = function(id) {
  var pattern = /^HP\:(\d)+$/i;
  return pattern.test(id);
};

HPOTerm.getServiceURL = function() {
  return new XWiki.Document('SolrService', 'PhenoTips').getURL('get') + '?';
};

export default HPOTerm;
