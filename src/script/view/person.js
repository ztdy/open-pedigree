import { Timer } from 'pedigree/model/helpers';
import { ChildlessBehavior } from 'pedigree/view/abstractNode';
import AbstractPerson from 'pedigree/view/abstractPerson';
import PersonVisuals from 'pedigree/view/personVisuals';
import HPOTerm from 'pedigree/hpoTerm';
import Disorder from 'pedigree/disorder';
import I18n from 'pedigree/i18n';

/**
 * Person is a class representing any AbstractPerson that has sufficient information to be
 * displayed on the final pedigree graph (printed or exported). Person objects
 * contain information about disorders, age and other relevant properties, as well
 * as graphical data to visualize this information.
 *
 * @class Person
 * @constructor
 * @extends AbstractPerson
 * @param {Number} x X coordinate on the Raphael canvas at which the node drawing will be centered
 * @param {Number} y Y coordinate on the Raphael canvas at which the node drawing will be centered
 * @param {String} gender 'M', 'F' or 'U' depending on the gender
 * @param {Number} id Unique ID number
 * @param {Boolean} isProband True if this person is the proband
 */

var Person = Class.create(AbstractPerson, {

  initialize: function($super, x, y, id, properties) {
    //var timer = new Timer();
    this._isProband = (id == 0);
    // Whether this individual is a consultand: someone seeking genetic counseling. Independent
    // of the proband flag — the two are routinely different people, and there is no "exactly
    // one" rule here (a couple attending together are both consultands).
    this._isConsultand = false;
    !this._type && (this._type = 'Person');
    this._setDefault();
    var gender = properties.hasOwnProperty('gender') ? properties['gender'] : 'U';
    $super(x, y, gender, id);

    // need to assign after super() and explicitly pass gender to super()
    // because changing properties requires a redraw, which relies on gender
    // shapes being there already
    this.assignProperties(properties);
    //timer.printSinceLast("=== new person runtime: ");
  },

  _setDefault: function() {
    this._firstName = '';
    this._lastName = '';
    this._lastNameAtBirth = '';
    this._birthDate = '';
    this._deathDate = '';
    this._conceptionDate = '';
    this._gestationAge = '';
    this._isAdopted = false;
    this._externalID = '';
    this._lifeStatus = 'alive';
    this._childlessStatus = null;
    // F1b (0.2): per-condition status model. Each disorder is a plain object
    //   { uuid, name, status:'affected'|'carrier' [, needsRepair] }
    // (was: a flat array of sanitized-id strings, all implicitly "affected"). The uuid is the
    // legend/colour key and is stable per disease name across the whole pedigree. See
    // docs/DESIGN-F1a-data-model.md and model/disorderStatusMigration.js.
    this._disorders = [];
    // Symbol-level "pre-symptomatic" flag (dominant, gene-positive, not yet affected — drawn as a
    // vertical line). Replaces the old carrierStatus enum value 'presymptomatic'. affected/carrier
    // are per-disorder now (disorder.status), so they are NOT stored here.
    this._presymptomatic = false;
    this._hpo = [];
    this._candidateGenes = [];
    // Free-text genotype / variant result (e.g. "BRCA1 c.68_69del (+)", "CFTR: negative"). Per
    // NSGC 2022/2025 the specific variant belongs in a text annotation below the symbol, NOT in a
    // fill colour — genotype and phenotype are separate visual channels. See getGenotype.
    this._genotype = '';
    this._twinGroup = null;
    this._monozygotic = false;
    // Twin zygosity explicitly recorded as unknown (NSGC group E: draws a "?" at the twin
    // junction). A group property: mutually exclusive with monozygotic in the UI.
    this._twinZygosityUnknown = false;
    this._evaluated = false;
    this._lostContact = false;
    // Sex assigned at birth, recorded separately from the symbol/gender (NSGC 2022 update):
    // '' (not recorded), 'AMAB', 'AFAB', or 'UAAB'. Shown as an annotation below the symbol.
    this._assignedSexAtBirth = '';
    // Role in assisted reproduction (NSGC 2022 Figure 5, as corrected in 2025): '' (none),
    // 'D' (egg or sperm donor), or 'G' (gestational carrier — carried the pregnancy but did
    // not contribute the ovum). Drawn as a letter inside the symbol.
    this._artRole = '';
  },

  /**
     * Initializes the object responsible for creating graphics for this Person
     *
     * @method _generateGraphics
     * @param {Number} x X coordinate on the Raphael canvas at which the node drawing will be centered
     * @param {Number} y Y coordinate on the Raphael canvas at which the node drawing will be centered
     * @return {PersonVisuals}
     * @private
     */
  _generateGraphics: function(x, y) {
    return new PersonVisuals(this, x, y);
  },

  /**
     * Returns True if this node is the proband (i.e. the main patient)
     *
     * @method isProband
     * @return {Boolean}
     */
  isProband: function() {
    return this._isProband;
  },

  /**
     * Alias of isProband, used by the generic property/undo machinery which
     * derives a getter name from the setter (setProband -> getProband).
     *
     * @method getProband
     * @return {Boolean}
     */
  getProband: function() {
    return this._isProband;
  },

  /**
     * Marks/unmarks this person as the proband (the individual carrying the proband
     * arrow). Exclusivity across nodes is enforced by the controller/view; this only
     * flips the flag and redraws so the arrow appears/disappears. Node 0 remains the
     * internal layout anchor regardless of who carries the proband marker.
     *
     * @method setProband
     * @param {Boolean} isProband
     */
  setProband: function(isProband) {
    this._isProband = !!isProband;
    // Redraw the gender graphics so the proband arrow is added/removed. Guarded because
    // this can run from assignProperties before graphics exist (initial construction).
    var g = this.getGraphics && this.getGraphics();
    if (g && typeof g.setGenderGraphics === 'function') {
      g.setGenderGraphics();
    }
  },

  /**
     * Returns True if this individual is a consultand (someone seeking genetic counseling).
     *
     * @method isConsultand
     * @return {Boolean}
     */
  isConsultand: function() {
    return this._isConsultand;
  },

  /**
     * Alias of isConsultand, for the generic property/undo machinery which derives a getter
     * name from the setter (setConsultand -> getConsultand).
     *
     * @method getConsultand
     * @return {Boolean}
     */
  getConsultand: function() {
    return this._isConsultand;
  },

  /**
     * Marks/unmarks this individual as a consultand. NSGC draws them with a bare arrow — the
     * same arrow the proband carries, minus the "P".
     *
     * Deliberately NOT mutually exclusive with the proband flag, and deliberately not limited
     * to one per pedigree: the consultand is whoever is seeking counseling, which may be
     * several people, and may or may not be the proband. Where an individual is both, the
     * proband marker wins (the "P" is drawn), because NSGC defines no combined symbol and
     * "P + arrow" is the more specific statement.
     *
     * @method setConsultand
     * @param {Boolean} isConsultand
     */
  setConsultand: function(isConsultand) {
    this._isConsultand = !!isConsultand;
    // Redraw so the arrow appears/disappears. Guarded: assignProperties can run before the
    // graphics exist during construction (mirrors setProband).
    var g = this.getGraphics && this.getGraphics();
    if (g && typeof g.setGenderGraphics === 'function') {
      g.setGenderGraphics();
    }
  },

  /**
     * Returns the first name of this Person
     *
     * @method getFirstName
     * @return {String}
     */
  getFirstName: function() {
    return this._firstName;
  },

  /**
     * Replaces the first name of this Person with firstName, and displays the label
     *
     * @method setFirstName
     * @param firstName
     */
  setFirstName: function(firstName) {
    firstName && (firstName = firstName.charAt(0).toUpperCase() + firstName.slice(1));
    this._firstName = firstName;
    this.getGraphics().updateNameLabel();
  },

  /**
     * Returns the last name of this Person
     *
     * @method getLastName
     * @return {String}
     */
  getLastName: function() {
    return this._lastName;
  },

  /**
     * Replaces the last name of this Person with lastName, and displays the label
     *
     * @method setLastName
     * @param lastName
     */
  setLastName: function(lastName) {
    lastName && (lastName = lastName.charAt(0).toUpperCase() + lastName.slice(1));
    this._lastName = lastName;
    this.getGraphics().updateNameLabel();
    return lastName;
  },

  /**
     * Returns the externalID of this Person
     *
     * @method getExternalID
     * @return {String}
     */
  getExternalID: function() {
    return this._externalID;
  },

  /**
     * Replaces the external ID of this Person with the given ID, and displays the label
     *
     * @method setExternalID
     * @param externalID
     */
  setExternalID: function(externalID) {
    this._externalID = externalID;
    this.getGraphics().updateExternalIDLabel();
  },

  /**
     * Replaces free-form comments associated with the node and redraws the label
     *
     * @method setComments
     * @param comment
     */
  setComments: function($super, comment) {
    if (comment != this.getComments()) {
      $super(comment);
      this.getGraphics().updateCommentsLabel();
    }
  },

  /**
     * Sets the type of twin
     *
     * @method setMonozygotic
     */
  setMonozygotic: function(monozygotic) {
    if (monozygotic == this._monozygotic) {
      return;
    }
    this._monozygotic = monozygotic;
  },

  /**
     * Returns the documented evaluation status
     *
     * @method getEvaluated
     * @return {Boolean}
     */
  getEvaluated: function() {
    return this._evaluated;
  },

  /**
     * Sets the documented evaluation status
     *
     * @method setEvaluated
     */
  setEvaluated: function(evaluationStatus) {
    if (evaluationStatus == this._evaluated) {
      return;
    }
    this._evaluated = evaluationStatus;
    this.getGraphics().updateEvaluationLabel();
  },

  /**
     * Returns the sex assigned at birth ('' | 'AMAB' | 'AFAB' | 'UAAB').
     *
     * @method getAssignedSexAtBirth
     * @return {String}
     */
  getAssignedSexAtBirth: function() {
    return this._assignedSexAtBirth;
  },

  /**
     * Sets the sex assigned at birth, recorded separately from the symbol/gender per the
     * NSGC 2022 nomenclature update (conflating the two causes clinical harm). Valid values
     * are '', 'AMAB', 'AFAB', 'UAAB'; anything else is ignored. Redraws the annotation.
     *
     * @method setAssignedSexAtBirth
     */
  setAssignedSexAtBirth: function(value) {
    value = value || '';
    if (['', 'AMAB', 'AFAB', 'UAAB'].indexOf(value) === -1 || value == this._assignedSexAtBirth) {
      return;
    }
    this._assignedSexAtBirth = value;
    // Guarded: assignProperties can run before graphics exist during construction.
    var g = this.getGraphics && this.getGraphics();
    if (g && typeof g.updateSexLabel === 'function') {
      g.updateSexLabel();
    }
  },

  /**
     * Returns this person's assisted-reproduction role ('' | 'D' | 'G').
     *
     * @method getArtRole
     * @return {String}
     */
  getArtRole: function() {
    return this._artRole;
  },

  /**
     * Sets the assisted-reproduction role. Valid values are '' (none), 'D' (egg or sperm donor)
     * and 'G' (gestational carrier); anything else is ignored. Redraws the in-symbol letter.
     *
     * There is deliberately no separate value for "surrogate": a surrogate donates the egg AND
     * carries the pregnancy, and NSGC (2022 Figure 5, kept by the 2025 correction) says such a
     * person "should only be referred to as a donor" — so they are a 'D' whose pregnancy hangs
     * below them. The distinction is made by where the pregnancy is drawn, not by the letter.
     *
     * @method setArtRole
     */
  setArtRole: function(value) {
    value = value || '';
    if (['', 'D', 'G'].indexOf(value) === -1 || value == this._artRole) {
      return;
    }
    this._artRole = value;
    // Guarded: assignProperties can run before graphics exist during construction.
    var g = this.getGraphics && this.getGraphics();
    if (g && typeof g.updateArtRoleLabel === 'function') {
      g.updateArtRoleLabel();
    }
  },

  /**
     * Returns the "in contact" status of this node.
     * "False" means proband has lost contaxt with this individual
     *
     * @method getLostContact
     * @return {Boolean}
     */
  getLostContact: function() {
    return this._lostContact;
  },

  /**
     * Sets the "in contact" status of this node
     *
     * @method setLostContact
     */
  setLostContact: function(lostContact) {
    if (lostContact == this._lostContact) {
      return;
    }
    this._lostContact = lostContact;
  },

  /**
     * Returns the type of twin: monozygotic or not
     * (always false for non-twins)
     *
     * @method getMonozygotic
     * @return {Boolean}
     */
  getMonozygotic: function() {
    return this._monozygotic;
  },

  /**
     * Returns whether this twin's zygosity is explicitly recorded as unknown.
     *
     * @method getTwinZygosityUnknown
     * @return {Boolean}
     */
  getTwinZygosityUnknown: function() {
    return this._twinZygosityUnknown;
  },

  /**
     * Records the twin's zygosity as unknown (draws a "?" at the twin junction). The childhub
     * redraw + propagation to the whole twin group are driven by the controller (mirrors the
     * monozygotic handling), so this only flips the flag.
     *
     * @method setTwinZygosityUnknown
     */
  setTwinZygosityUnknown: function(unknown) {
    if (unknown == this._twinZygosityUnknown) {
      return;
    }
    this._twinZygosityUnknown = unknown;
  },

  /**
     * Assigns this node to the given twin group
     * (a twin group is all the twins from a given pregnancy)
     *
     * @method setTwinGroup
     */
  setTwinGroup: function(groupId) {
    this._twinGroup = groupId;
  },

  /**
     * Returns the status of this Person
     *
     * @method getLifeStatus
     * @return {String} "alive", "deceased", "stillborn", "unborn", "aborted" or "miscarriage"
     */
  getLifeStatus: function() {
    return this._lifeStatus;
  },

  /**
     * Returns True if this node's status is not 'alive' or 'deceased'.
     *
     * @method isFetus
     * @return {Boolean}
     */
  isFetus: function() {
    return (this.getLifeStatus() != 'alive' && this.getLifeStatus() != 'deceased');
  },

  /**
     * Returns True is status is 'unborn', 'stillborn', 'aborted', 'miscarriage', 'alive' or 'deceased'
     *
     * @method _isValidLifeStatus
     * @param {String} status
     * @returns {boolean}
     * @private
     */
  _isValidLifeStatus: function(status) {
    return (status == 'unborn' || status == 'stillborn'
            || status == 'aborted' || status == 'miscarriage'
            || status == 'ectopic'
            || status == 'alive' || status == 'deceased');
  },

  /**
     * Changes the life status of this Person to newStatus
     *
     * @method setLifeStatus
     * @param {String} newStatus "alive", "deceased", "stillborn", "unborn", "aborted" or "miscarriage"
     */
  setLifeStatus: function(newStatus) {
    if(this._isValidLifeStatus(newStatus)) {
      var oldStatus = this._lifeStatus;

      this._lifeStatus = newStatus;

      (newStatus != 'deceased') && this.setDeathDate('');
      (newStatus == 'alive') && this.setGestationAge();
      this.getGraphics().updateSBLabel();

      if(this.isFetus()) {
        this.setBirthDate('');
        this.setAdopted(false);
        this.setChildlessStatus(null);
      }
      this.getGraphics().updateLifeStatusShapes(oldStatus);
      this.getGraphics().getHoverBox().regenerateHandles();
      this.getGraphics().getHoverBox().regenerateButtons();
    }
  },

  /**
     * Returns the date of the conception date of this Person
     *
     * @method getConceptionDate
     * @return {Date}
     */
  getConceptionDate: function() {
    return this._conceptionDate;
  },

  /**
     * Replaces the conception date with newDate
     *
     * @method setConceptionDate
     * @param {Date} newDate Date of conception
     */
  setConceptionDate: function(newDate) {
    this._conceptionDate = newDate ? (new Date(newDate)) : '';
    this.getGraphics().updateAgeLabel();
  },

  /**
     * Returns the number of weeks since conception
     *
     * @method getGestationAge
     * @return {Number}
     */
  getGestationAge: function() {
    if(this.getLifeStatus() == 'unborn' && this.getConceptionDate()) {
      var oneWeek = 1000 * 60 * 60 * 24 * 7,
        lastDay = new Date();
      return Math.round((lastDay.getTime() - this.getConceptionDate().getTime()) / oneWeek);
    } else if(this.isFetus()){
      return this._gestationAge;
    } else {
      return null;
    }
  },

  /**
     * Updates the conception age of the Person given the number of weeks passed since conception
     *
     * @method setGestationAge
     * @param {Number} numWeeks Greater than or equal to 0
     */
  setGestationAge: function(numWeeks) {
    try {
      numWeeks = parseInt(numWeeks);
    } catch (err) {
      numWeeks = '';
    }
    if(numWeeks){
      this._gestationAge = numWeeks;
      var daysAgo = numWeeks * 7,
        d = new Date();
      d.setDate(d.getDate() - daysAgo);
      this.setConceptionDate(d);
    } else {
      this._gestationAge = '';
      this.setConceptionDate(null);
    }
    this.getGraphics().updateAgeLabel();
  },

  /**
     * Returns the the birth date of this Person
     *
     * @method getBirthDate
     * @return {Date}
     */
  getBirthDate: function() {
    return this._birthDate;
  },

  /**
     * Replaces the birth date with newDate
     *
     * @method setBirthDate
     * @param {Date} newDate Must be earlier date than deathDate and a later than conception date
     */
  setBirthDate: function(newDate) {
    newDate = newDate ? (new Date(newDate)) : '';
    if (!newDate || !this.getDeathDate() || newDate.getTime() < this.getDeathDate().getTime()) {
      this._birthDate = newDate;
      this.getGraphics().updateAgeLabel();
    }
  },

  /**
     * Returns the death date of this Person
     *
     * @method getDeathDate
     * @return {Date}
     */
  getDeathDate: function() {
    return this._deathDate;
  },

  /**
     * Replaces the death date with deathDate
     *
     *
     * @method setDeathDate
     * @param {Date} deathDate Must be a later date than birthDate
     */
  setDeathDate: function(deathDate) {
    deathDate = deathDate ? (new Date(deathDate)) : '';
    // only set death date if it happens ot be after the birth date, or there is no birth or death date
    if(!deathDate || !this.getBirthDate() || deathDate.getTime() > this.getBirthDate().getTime()) {
      this._deathDate =  deathDate;
      this._deathDate && (this.getLifeStatus() == 'alive') && this.setLifeStatus('deceased');
    }
    this.getGraphics().updateAgeLabel();
    return this.getDeathDate();
  },

  _isValidCarrierStatus: function(status) {
    return (status == '' || status == 'carrier'
            || status == 'affected' || status == 'presymptomatic');
  },

  /**
     * Returns whether this person is flagged pre-symptomatic (symbol-level vertical line).
     *
     * @method getPresymptomatic
     * @return {Boolean}
     */
  getPresymptomatic: function() {
    return this._presymptomatic;
  },

  /**
     * Sets the pre-symptomatic flag and repaints the symbol-level carrier graphic.
     *
     * @method setPresymptomatic
     * @param {Boolean} value
     */
  setPresymptomatic: function(value) {
    value = !!value;
    if (value != this._presymptomatic) {
      this._presymptomatic = value;
      this.getGraphics() && this.getGraphics().updateCarrierGraphic();
    }
  },

  /**
     * COMPATIBILITY SHIM (F1b interim; the per-disorder status editor is F1c).
     *
     * affected/carrier are per-disorder now and pre-symptomatic is its own boolean, but the node
     * menu still exposes a single symbol-level "Carrier status" radio, and the undo stack replays
     * whatever getCarrierStatus() returned. This maps that one symbol-level value onto the
     * per-condition model — the same rules the on-load migration uses (disorderStatusMigration.js).
     *
     * @method setCarrierStatus
     * @param status One of {'', 'carrier', 'affected', 'presymptomatic'}
     */
  setCarrierStatus: function(status) {
    if (status === undefined || status === null) {
      // Legacy no-arg "reconcile after setDisorders" call — the per-disorder model is already
      // authoritative, so there is nothing to reconcile. Kept as a no-op for old call sites.
      return;
    }
    if (!this._isValidCarrierStatus(status)) {
      return;
    }

    this.setPresymptomatic(status == 'presymptomatic');
    if (status == 'presymptomatic') {
      return;   // pre-symptomatic leaves the disorder list untouched
    }

    var disorders = this.getDisorders();
    if (status == 'affected' || status == 'carrier') {
      if (disorders.length == 0) {
        // No named disease: synthesise a placeholder so the state is representable and round-trips.
        // 'affected' -> a generic named "Affected" condition (NSGC Fig 2); 'carrier' -> a
        // repair-flagged placeholder (D5), mirroring the migration for an orphan carrier.
        if (status == 'affected') {
          this.addDisorder({ name: Person.GENERIC_AFFECTED_NAME, status: 'affected', synthetic: true });
        } else {
          this.addDisorder({ name: Person.CARRIER_PLACEHOLDER_NAME, status: 'carrier', needsRepair: true, synthetic: true });
        }
      } else {
        for (var i = 0; i < disorders.length; i++) {
          disorders[i].status = status;
        }
      }
      this.getGraphics() && this.getGraphics().updateDisorderShapes();
    } else {   // status == ''  (not affected)
      // Drop a lone synthetic placeholder so "not affected" truly clears it; real diagnoses can't
      // be silently removed here, so leave them (a listed disorder means affected/carrier).
      if (disorders.length == 1 && this._isSyntheticDisorder(disorders[0])) {
        this.removeDisorder(disorders[0].uuid);
        this.getGraphics() && this.getGraphics().updateDisorderShapes();
      }
    }
    editor.getDisorderLegend().refresh();   // per-status counts / swatches / fill key
  },

  /**
     * Derives a single symbol-level carrier status from the per-condition model, for the node-menu
     * radio, the undo snapshot, and legacy exporters. Pre-symptomatic wins; otherwise a person with
     * disorders reads as 'carrier' iff every disorder is a carrier, else 'affected'.
     *
     * @method getCarrierStatus
     * @return {String} one of {'', 'carrier', 'affected', 'presymptomatic'}
     */
  getCarrierStatus: function() {
    if (this._presymptomatic) {
      return 'presymptomatic';
    }
    var disorders = this.getDisorders();
    if (disorders.length == 0) {
      return '';
    }
    for (var i = 0; i < disorders.length; i++) {
      if (disorders[i].status != 'carrier') {
        return 'affected';
      }
    }
    return 'carrier';
  },

  // A synthetic disorder is one the app invented to represent a symbol-level state that carries no
  // real disease name (the generic "Affected" / the orphan-carrier placeholder). Detected by an
  // explicit flag, NOT by name — otherwise a clinician who literally types "Affected" (or "疾病A")
  // as a diagnosis would have it silently auto-removed.
  _isSyntheticDisorder: function(d) {
    return !!(d && d.synthetic);
  },

  /**
     * Returns the list of all colors associated with the node
     * (e.g. all colors of all disorders and all colors of all the genes)
     * @method getAllNodeColors
     * @return {Array of Strings}
     */
  getAllNodeColors: function() {
    var result = [];
    for (var i = 0; i < this.getDisorders().length; i++) {
      result.push(editor.getDisorderLegend().getObjectColor(this.getDisorders()[i].uuid));
    }
    // Candidate genes deliberately do NOT contribute a fill colour any more. A gene sector on top
    // of a disorder sector made an affected individual read as having "two diseases" (NSGC: the
    // fill means PHENOTYPE). The gene identity is now shown as a text label under the symbol
    // (updateGeneLabel) and remains listed in the Candidate Genes legend/key.
    return result;
  },

  /**
     * Returns this person's disorders as an array of plain objects { uuid, name, status
     * [, needsRepair] }. This is the live internal array (undo replays it verbatim — see the
     * note on addDisorder), so callers must not mutate the entries in place.
     *
     * @method getDisorders
     * @return {Array} List of disorder objects.
     */
  getDisorders: function() {
    return this._disorders;
  },

  /**
     * Returns a serialisation-ready deep copy of this person's disorders. Names are already stored
     * clean (no id encoding), so — unlike the old flat-id model — nothing has to be desanitized.
     *
     * @method getDisordersForExport
     * @return {Array} List of { uuid, name, status [, needsRepair] } objects.
     */
  getDisordersForExport: function() {
    return this._disorders.map(function(d) {
      var copy = { uuid: d.uuid, name: d.name, status: d.status };
      if (d.needsRepair) {
        copy.needsRepair = true;
      }
      if (d.synthetic) {
        copy.synthetic = true;
      }
      return copy;
    });
  },

  /**
     * Normalises whatever addDisorder / setDisorders is handed into { uuid, name, status
     * [, needsRepair] }. Accepts, in order:
     *   - a plain new-model object { uuid?, name, status?, needsRepair? } — from load / migration /
     *     undo replay (getDisorders returns these; see the R1 note on addDisorder);
     *   - a Disorder object (the disease picker builds one) — name from getName();
     *   - a bare string — a legacy sanitized id or free-text name (old undo stacks, old files that
     *     dodged the migration); desanitized to a name.
     * The uuid is resolved by NAME through the document-level legend registry, so the same disease
     * anywhere in the pedigree shares one uuid (hence one legend row and colour). An explicit uuid
     * on a plain object is honoured (and registered) so migrated ids stay stable.
     *
     * @return {Object|null} normalised disorder, or null if no usable name could be derived.
     */
  _normalizeDisorder: function(disorder) {
    var name = null;
    var status = null;
    var explicitUuid = null;
    var needsRepair = false;
    var synthetic = false;

    if (disorder && typeof disorder == 'object' && typeof disorder.getDisorderID == 'function') {
      // a Disorder instance (picker)
      name = disorder.getName();
      // A CODED disorder (OMIM MIM number / Orphanet CURIE) keeps its CODE as its identity/uuid, so
      // the standardised identifier survives the round-trip and the legend can re-resolve the name
      // from the bundled dataset (following the UI language). Free-text disorders key by name.
      if (Disorder.isCodedID(disorder.getDisorderID())) {
        explicitUuid = disorder.getDisorderID();
      }
    } else if (disorder && typeof disorder == 'object') {
      // a plain new-model entry (load / migration / undo)
      name = disorder.name;
      status = disorder.status || null;
      explicitUuid = disorder.uuid || null;
      needsRepair = !!disorder.needsRepair;
      synthetic = !!disorder.synthetic;
      // Defensive back-compat: a plain object with no name but a legacy id-like field.
      if (name == null && disorder.id != null) {
        name = Disorder.desanitizeID(String(disorder.id));
      }
    } else if (disorder != null) {
      // a bare string: legacy id or free text
      var sid = Disorder.sanitizeID(String(disorder));
      name = Disorder.desanitizeID(String(disorder));
      if (Disorder.isCodedID(sid)) {
        explicitUuid = sid;   // coded id: keep the code as the identity (see above)
      }
    }

    if (name == null || name === '') {
      return null;
    }
    // The legacy hack sentinel 'affected' (lowercase) is the app-generated generic condition — map
    // it to the canonical name AND flag it synthetic (so it stays auto-removable), collapsing onto
    // the migration's 'Affected'. A clinician-typed "Affected" (via a Disorder/plain object) is NOT
    // the sentinel and is never flagged here.
    if (name === 'affected') {
      name = Person.GENERIC_AFFECTED_NAME;
      synthetic = true;
    }
    if (status != 'carrier' && status != 'affected') {
      status = 'affected';   // default: a listed disorder is a phenotype unless flagged a carrier
    }

    var legend = editor.getDisorderLegend();
    var uuid;
    if (explicitUuid != null && explicitUuid !== '') {
      // Always a STRING: a coded id / loaded file can carry a NUMBER (e.g. OMIM 154700), but
      // _affectedNodes keys, DOM values and strict `d.uuid === uuid` checks are all strings — a
      // number would silently fail to match and lose case counts / the status toggle / the pattern.
      uuid = String(explicitUuid);
      legend.registerDisorderUuid(uuid, name);
    } else {
      uuid = legend.getUuidForName(name);
    }
    var out = { uuid: uuid, name: name, status: status };
    if (needsRepair) {
      out.needsRepair = true;
    }
    if (synthetic) {
      out.synthetic = true;
    }
    return out;
  },

  /**
     * Adds disorder to the list of this node's disorders and updates the Legend.
     *
     * @method addDisorder
     * @param {Disorder} disorder Disorder object or a free-text name string
     *
     * DO NOT validate the string here. The free-text encoding is not injective ('a__b' and 'a b'
     * share one id — see the note in disorder.js), and rejecting the ambiguous names at this
     * point looks like the obvious fix. It is not, and it was tried and reverted:
     *
     *   - a string arriving here is NOT reliably a name. Undo replays getDisorders(), which
     *     returns the ENCODED ids, so undo hands this 'Marfan__syndrome' and 'HP_C_0001250'.
     *     A name-shaped check refuses both, and the disorder is gone for good — verified, not
     *     theorised: the disorder list came back empty after a plain undo.
     *   - it would not catch the case it was written for anyway. The disease/HPO pickers build
     *     a Disorder/HPOTerm object (nodeMenu.js, 'disease-picker'), so clinician-typed free
     *     text arrives as an OBJECT and never reaches the string branch at all.
     *
     * A guard has to sit where the name exists as a name at all — at the picker, which displays
     * one alongside the id (nodeMenu.js) — not here, where a bare string is a name or an id with
     * nothing to tell them apart. Note the picker does NOT know the text was freshly typed
     * either: it shows resolved ontology names for terms loaded from the patient, and the guard
     * there judges those too, so a false refusal deletes a recorded diagnosis. See the note on
     * termNameIsStorable before touching either.
     */
  addDisorder: function(disorder) {
    var entry = this._normalizeDisorder(disorder);
    if (!entry) {
      return;
    }
    if (this.hasDisorder(entry.uuid)) {
      // Same disease (same uuid) already present. Do not alert on undo/load replays; only a live,
      // interactive duplicate deserves the warning — but there is no reliable signal here for that,
      // and the old alert fired on the picker path only. Keep it quiet to avoid undo-time popups.
      return;
    }
    editor.getDisorderLegend().addCase(entry.uuid, entry.name, this.getID());
    this.getDisorders().push(entry);

    // Adding a real disease supersedes a lone synthetic placeholder (generic "Affected" / orphan
    // carrier), the same way the old code auto-dropped the virtual 'affected' disorder.
    if (this.getDisorders().length > 1) {
      for (var i = this.getDisorders().length - 2; i >= 0; i--) {
        if (this._isSyntheticDisorder(this.getDisorders()[i])) {
          this.removeDisorder(this.getDisorders()[i].uuid);
        }
      }
    }
  },

  /**
     * Removes the disorder with the given uuid from this node and updates the Legend.
     *
     * @method removeDisorder
     * @param {String} disorderUuid uuid of the disorder to remove (a disorder object is also
     *        accepted, for convenience)
     */
  removeDisorder: function(disorderUuid) {
    if (disorderUuid && typeof disorderUuid == 'object') {
      disorderUuid = disorderUuid.uuid;
    }
    if (this.hasDisorder(disorderUuid)) {
      editor.getDisorderLegend().removeCase(disorderUuid, this.getID());
      this._disorders = this.getDisorders().filter(function(d) {
        return d.uuid !== disorderUuid;
      });
    }
  },

  /**
     * Sets the list of disorders of this person to the given list. Tolerates both the new-model
     * objects and any legacy shape addDisorder accepts (double-read), so an old undo stack or an
     * un-migrated file replayed through here does not throw or drop diagnoses.
     *
     * @method setDisorders
     * @param {Array} disorders List of disorder objects / Disorder instances / id strings
     */
  setDisorders: function(disorders) {
    // The disease picker only round-trips { uuid, name } — it has no per-disorder status control
    // (that is F1c). Snapshot the current statuses so a picker-driven rebuild does not silently
    // downgrade a carrier to affected. An explicit status on an incoming object (load / undo /
    // migration) still wins over the snapshot.
    var prior = {};
    this.getDisorders().forEach(function(d) {
      prior[d.uuid] = d;
    });
    for(var i = this.getDisorders().length-1; i >= 0; i--) {
      this.removeDisorder( this.getDisorders()[i].uuid );
    }
    if (disorders) {
      for(var j = 0; j < disorders.length; j++) {
        var incoming = disorders[j];
        var explicitStatus = (incoming && typeof incoming == 'object'
                              && (incoming.status === 'carrier' || incoming.status === 'affected'));
        this.addDisorder( incoming );
        if (!explicitStatus) {
          var last = this.getDisorders()[this.getDisorders().length - 1];
          if (last && prior.hasOwnProperty(last.uuid)) {
            last.status = prior[last.uuid].status;
            if (prior[last.uuid].needsRepair) {
              last.needsRepair = true;
            }
          }
        }
      }
    }
    this.getGraphics().updateDisorderShapes();
    editor.getDisorderLegend().refresh();   // per-status counts / swatches / fill key
  },

  /**
     * Returns a list of all HPO terms associated with the patient
     *
     * @method getHPO
     * @return {Array} List of HPO IDs.
     */
  getHPO: function() {
    return this._hpo;
  },

  /**
     * Returns a list of phenotypes of this person, with non-scrambled IDs
     *
     * @method getHPOForExport
     * @return {Array} List of human-readable versions of HPO IDs
     */
  getHPOForExport: function() {
    var exportHPOs = this._hpo.slice(0);
    for (var i = 0; i < exportHPOs.length; i++) {
      exportHPOs[i] = HPOTerm.desanitizeID(exportHPOs[i]);
    }
    return exportHPOs;
  },

  /**
     * Adds HPO term to the list of this node's phenotypes and updates the Legend.
     *
     * @method addHPO
     * @param {HPOTerm} hpo HPOTerm object or a free-text name string
     */
  addHPO: function(hpo) {
    if (typeof hpo != 'object') {
      hpo = editor.getHPOLegend().getTerm(hpo);
    }
    if(!this.hasHPO(hpo.getID())) {
      editor.getHPOLegend().addCase(hpo.getID(), hpo.getName(), this.getID());
      this.getHPO().push(hpo.getID());
    } else {
      alert(I18n.t('This person already has the specified phenotype'));
    }
  },

  /**
     * Removes HPO term from the list of this node's terms and updates the Legend.
     *
     * @method removeHPO
     * @param {Number} hpoID id of the term to be removed
     */
  removeHPO: function(hpoID) {
    if(this.hasHPO(hpoID)) {
      editor.getHPOLegend().removeCase(hpoID, this.getID());
      this._hpo = this.getHPO().without(hpoID);
    } else {
      alert(I18n.t('This person doesn\'t have the specified HPO term'));
    }
  },

  /**
     * Sets the list of HPO temrs of this person to the given list
     *
     * @method setHPO
     * @param {Array} hpos List of HPOTerm objects
     */
  setHPO: function(hpos) {
    for(var i = this.getHPO().length-1; i >= 0; i--) {
      this.removeHPO( this.getHPO()[i] );
    }
    for(var i = 0; i < hpos.length; i++) {
      this.addHPO( hpos[i] );
    }
  },

  /**
     * @method hasHPO
     * @param {Number} id Term ID, taken from the HPO database
     */
  hasHPO: function(id) {
    return (this.getHPO().indexOf(id) != -1);
  },

  /**
     * Adds gene to the list of this node's candidate genes
     *
     * @method addGenes
     */
  addGene: function(gene) {
    if (this.getGenes().indexOf(gene) == -1) {
      editor.getGeneLegend().addCase(gene, gene, this.getID());
      this.getGenes().push(gene);
    }
  },

  /**
     * Removes gene from the list of this node's candidate genes
     *
     * @method removeGene
     */
  removeGene: function(gene) {
    if (this.getGenes().indexOf(gene) !== -1) {
      editor.getGeneLegend().removeCase(gene, this.getID());
      this._candidateGenes = this.getGenes().without(gene);
    }
  },

  /**
     * Sets the list of candidate genes of this person to the given list
     *
     * @method setGenes
     * @param {Array} genes List of gene names (as strings)
     */
  setGenes: function(genes) {
    for(var i = this.getGenes().length-1; i >= 0; i--) {
      this.removeGene(this.getGenes()[i]);
    }
    for(var i = 0; i < genes.length; i++) {
      this.addGene( genes[i] );
    }
    // Genes render as a text label under the symbol now (not a fill sector), so refresh that label
    // rather than the disorder fills.
    this.getGraphics().updateGeneLabel();
  },

  /**
     * Returns a list of candidate genes for this person.
     *
     * @method getGenes
     * @return {Array} List of gene names.
     */
  getGenes: function() {
    return this._candidateGenes;
  },

  /**
     * Returns this person's free-text genotype / variant annotation.
     *
     * @method getGenotype
     * @return {String}
     */
  getGenotype: function() {
    return this._genotype;
  },

  /**
     * Sets the free-text genotype / variant annotation (e.g. "BRCA1 c.68_69del (+)"). Rendered as a
     * text label below the symbol per NSGC 2022/2025 (variant identity is text, not a fill colour).
     *
     * @method setGenotype
     * @param {String} value
     */
  setGenotype: function(value) {
    value = (value == null) ? '' : String(value);
    if (value == this._genotype) {
      return;
    }
    this._genotype = value;
    this.getGraphics().updateGenotypeLabel();
  },

  /**
     * Removes the node and its visuals.
     *
     * @method remove
     * @param [skipConfirmation=false] {Boolean} if true, no confirmation box will pop up
     */
  remove: function($super) {
    this.setDisorders([]);  // remove disorders form the legend
    this.setHPO([]);
    this.setGenes([]);
    $super();
  },

  /**
     * Returns true if this person has a disorder with the given uuid.
     *
     * @method hasDisorder
     * @param {String} uuid disorder uuid (the legend/colour key)
     * @return {Boolean}
     */
  hasDisorder: function(uuid) {
    return this.getDisorders().some(function(d) {
      return d.uuid === uuid;
    });
  },

  /**
     * Changes the childless status of this Person. Nullifies the status if the given status is not
     * "childless" or "infertile". Modifies the status of the partnerships as well.
     *
     * @method setChildlessStatus
     * @param {String} status Can be "childless", "infertile" or null
     * @param {Boolean} ignoreOthers If True, changing the status will not modify partnerships's statuses or
     * detach any children
     */
  setChildlessStatus: function(status) {
    if(!this.isValidChildlessStatus(status)) {
      status = null;
    }
    if(status != this.getChildlessStatus()) {
      this._childlessStatus = status;
      this.getGraphics().updateChildlessShapes();
      // drawLabels() adds a childless/infertile offset to the label stack, so re-run it: without
      // this the name (and every label below it) stays ~6px too high until the next redraw.
      this.getGraphics().drawLabels();
      this.getGraphics().getHoverBox().regenerateHandles();
      // The mark also hides the child handle on every partnership this person is part of, so
      // those partnership hoverboxes must be regenerated too — otherwise their handle set stays
      // cached across hovers (hover-out only hides, it doesn't remove) and a stale child handle
      // would still add a child, contradicting the "no children"/"infertile" mark. Regenerating
      // also restores the handle when the mark is cleared.
      var rels = editor.getGraph().DG.GG.getAllRelationships(this.getID());
      for (var r = 0; r < rels.length; r++) {
        var relNode = editor.getView().getNode(rels[r]);
        if (relNode && relNode.getGraphics && relNode.getGraphics().getHoverBox()) {
          relNode.getGraphics().getHoverBox().regenerateHandles();
        }
      }
    }
    return this.getChildlessStatus();
  },

  /**
     * Returns an object (to be accepted by the menu) with information about this Person
     *
     * @method getSummary
     * @return {Object} Summary object for the menu
     */
  getSummary: function() {
    var onceAlive = editor.getGraph().hasRelationships(this.getID());
    var inactiveStates = onceAlive ? ['unborn','aborted','miscarriage','stillborn','ectopic'] : false;

    var inactiveGenders = false;
    var genderSet = editor.getGraph().getPossibleGenders(this.getID());
    for (var gender in genderSet) {
      if (genderSet.hasOwnProperty(gender)) {
        if (!genderSet[gender]) {
          inactiveGenders = [ gender ];
        }
      }
    }

    var childlessInactive = this.isFetus();  // TODO: can a person which already has children become childless?
    // maybe: use editor.getGraph().hasNonPlaceholderNonAdoptedChildren() ?
    var disorders = [];
    this.getDisorders().forEach(function(disorder) {
      // Name lives on the entry now; the menu keys picker rows by uuid.
      disorders.push({id: disorder.uuid, value: disorder.name});
    });
    var hpoTerms = [];
    this.getHPO().forEach(function(hpo) {
      var termName = editor.getHPOLegend().getTerm(hpo).getName();
      hpoTerms.push({id: hpo, value: termName});
    });

    var cantChangeAdopted = this.isFetus() || editor.getGraph().hasToBeAdopted(this.getID());

    var inactiveMonozygothic = true;
    var disableMonozygothic  = true;
    var twins = editor.getGraph().getAllTwinsSortedByOrder(this.getID());
    if (twins.length > 1) {
      // check that there are twins and that all twins
      // have the same gender, otherwise can't be monozygothic
      inactiveMonozygothic = false;
      disableMonozygothic  = false;
      for (var i = 0; i < twins.length; i++) {
        if (editor.getGraph().getGender(twins[i]) != this.getGender()) {
          disableMonozygothic = true;
          break;
        }
      }
    }

    // Affected / carrier is set PER DISORDER (the disease-picker toggle) now — the old symbol-level
    // "Carrier status" radio is gone (it flattened a mixed affected/carrier patient). The only
    // remaining symbol-level state is pre-symptomatic (the vertical line), a checkbox; it does not
    // apply to a pregnancy loss (no line is drawn there).
    var presymInactive = (this.getLifeStatus() == 'aborted' || this.getLifeStatus() == 'miscarriage' || this.getLifeStatus() == 'ectopic');

    var inactiveLostContact = this.isProband() || !editor.getGraph().isRelatedToProband(this.getID());

    return {
      identifier:    {value : this.getID()},
      // The proband checkbox is disabled while THIS node is the proband, so it can only be
      // moved (checked on another individual), never cleared to leave zero probands.
      proband:       {value : this.isProband(), disabled: this.isProband()},
      // Not disabled when this individual is also the proband: the two roles are independent,
      // and the drawing simply prefers the proband marker while both are set.
      consultand:    {value : this.isConsultand()},
      first_name:    {value : this.getFirstName()},
      last_name:     {value : this.getLastName()},
      external_id:   {value : this.getExternalID()},
      gender:        {value : this.getGender(), inactive: inactiveGenders},
      assigned_sex:  {value : this.getAssignedSexAtBirth()},
      // A pregnancy/loss is the product of assisted reproduction, never a donor or carrier itself.
      art_role:      {value : this.getArtRole(), inactive: this.isFetus()},
      date_of_birth: {value : this.getBirthDate(), inactive: this.isFetus()},
      presymptomatic: {value : this.getPresymptomatic(), inactive: presymInactive},
      disorders:     {value : disorders},
      candidate_genes: {value : this.getGenes()},
      genotype:      {value : this.getGenotype()},
      adopted:       {value : this.isAdopted(), inactive: cantChangeAdopted},
      state:         {value : this.getLifeStatus(), inactive: inactiveStates},
      date_of_death: {value : this.getDeathDate(), inactive: this.isFetus()},
      comments:      {value : this.getComments(), inactive: false},
      gestation_age: {value : this.getGestationAge(), inactive : !this.isFetus()},
      childlessSelect: {value : this.getChildlessStatus() ? this.getChildlessStatus() : 'none', inactive : childlessInactive},
      placeholder:   {value : false, inactive: true },
      monozygotic:   {value : this.getMonozygotic(), inactive: inactiveMonozygothic, disabled: disableMonozygothic },
      // Zygosity-unknown is available for any twin (no same-gender requirement), but mutually
      // exclusive with monozygotic in the UI, so disable it while monozygotic is checked.
      zygosityUnknown: {value : this.getTwinZygosityUnknown(), inactive: inactiveMonozygothic, disabled: this.getMonozygotic() },
      evaluated:     {value : this.getEvaluated() },
      hpo_positive:  {value : hpoTerms},
      nocontact:     {value : this.getLostContact(), inactive: inactiveLostContact}
    };
  },

  /**
     * Returns an object containing all the properties of this node
     * except id, x, y & type
     *
     * @method getProperties
     * @return {Object} in the form
     *
     {
       property: value
     }
     */
  getProperties: function($super) {
    // note: properties equivalent to default are not set
    var info = $super();
    // Persist the proband marker only when set. On load, a single explicit `proband:true`
    // wins; if none is present the view falls back to node 0 (see View.ensureSingleProband).
    if (this.isProband()) {
      info['proband'] = true;
    }
    if (this.isConsultand()) {
      info['consultand'] = true;
    }
    if (this.getFirstName() != '') {
      info['fName'] = this.getFirstName();
    }
    if (this.getLastName() != '') {
      info['lName'] = this.getLastName();
    }
    if (this.getExternalID() != '') {
      info['externalID'] = this.getExternalID();
    }
    if (this.getBirthDate() != '') {
      info['dob'] = this.getBirthDate().toDateString();
    }
    if (this.isAdopted()) {
      info['isAdopted'] = this.isAdopted();
    }
    if (this.getLifeStatus() != 'alive') {
      info['lifeStatus'] = this.getLifeStatus();
    }
    if (this.getDeathDate() != '') {
      info['dod'] = this.getDeathDate().toDateString();
    }
    if (this.getGestationAge() != null) {
      info['gestationAge'] = this.getGestationAge();
    }
    if (this.getChildlessStatus() != null) {
      info['childlessStatus'] = this.getChildlessStatus();
    }
    if (this.getDisorders().length > 0) {
      info['disorders'] = this.getDisordersForExport();
    }
    if (this.getHPO().length > 0) {
      info['hpoTerms'] = this.getHPOForExport();
    }
    if (this.getGenes().length > 0) {
      info['candidateGenes'] = this.getGenes();
    }
    if (this.getGenotype() != '') {
      info['genotype'] = this.getGenotype();
    }
    if (this._twinGroup !== null) {
      info['twinGroup'] = this._twinGroup;
    }
    if (this._monozygotic) {
      info['monozygotic'] = this._monozygotic;
    }
    if (this._twinZygosityUnknown) {
      info['twinZygosityUnknown'] = this._twinZygosityUnknown;
    }
    if (this._evaluated) {
      info['evaluated'] = this._evaluated;
    }
    // F1b: carrierStatus is gone. affected/carrier live on each disorder (info['disorders'] above);
    // pre-symptomatic is its own symbol-level boolean.
    if (this._presymptomatic) {
      info['presymptomatic'] = true;
    }
    if (this.getLostContact()) {
      info['lostContact'] = this.getLostContact();
    }
    if (this._assignedSexAtBirth) {
      info['assignedSexAtBirth'] = this._assignedSexAtBirth;
    }
    if (this._artRole) {
      info['artRole'] = this._artRole;
    }
    return info;
  },

  /**
      * Applies the properties found in info to this node.
      *
      * @method assignProperties
      * @param properties Object
      * @return {Boolean} True if info was successfully assigned
      */
  assignProperties: function($super, info) {
    this._setDefault();

    if($super(info)) {
      if(info.fName && this.getFirstName() != info.fName) {
        this.setFirstName(info.fName);
      }
      if(info.lName && this.getLastName() != info.lName) {
        this.setLastName(info.lName);
      }
      if (info.externalID && this.getExternalID() != info.externalID) {
        this.setExternalID(info.externalID);
      }
      if(info.dob && this.getBirthDate() != info.dob) {
        this.setBirthDate(info.dob);
      }
      if(info.disorders) {
        this.setDisorders(info.disorders);
      }
      if(info.hpoTerms) {
        this.setHPO(info.hpoTerms);
      }
      if (info.hasOwnProperty('genotype') && this._genotype != info.genotype) {
        this.setGenotype(info.genotype);
      }
      if(info.candidateGenes) {
        this.setGenes(info.candidateGenes);
      }
      if(info.hasOwnProperty('isAdopted') && this.isAdopted() != info.isAdopted) {
        this.setAdopted(info.isAdopted);
      }
      if(info.hasOwnProperty('lifeStatus') && this.getLifeStatus() != info.lifeStatus) {
        this.setLifeStatus(info.lifeStatus);
      }
      if(info.dod && this.getDeathDate() != info.dod) {
        this.setDeathDate(info.dod);
      }
      if(info.gestationAge && this.getGestationAge() != info.gestationAge) {
        this.setGestationAge(info.gestationAge);
      }
      if(info.childlessStatus && this.getChildlessStatus() != info.childlessStatus) {
        this.setChildlessStatus(info.childlessStatus);
      }
      if(info.hasOwnProperty('twinGroup') && this._twinGroup != info.twinGroup) {
        this.setTwinGroup(info.twinGroup);
      }
      if(info.hasOwnProperty('monozygotic') && this._monozygotic != info.monozygotic) {
        this.setMonozygotic(info.monozygotic);
      }
      if(info.hasOwnProperty('twinZygosityUnknown') && this._twinZygosityUnknown != info.twinZygosityUnknown) {
        this.setTwinZygosityUnknown(info.twinZygosityUnknown);
      }
      if(info.hasOwnProperty('evaluated') && this._evaluated != info.evaluated) {
        this.setEvaluated(info.evaluated);
      }
      if (info.hasOwnProperty('presymptomatic')) {
        this.setPresymptomatic(info.presymptomatic);
      }
      // Defensive legacy path: a carrierStatus that reached here un-migrated (an old undo frame, or
      // a file that bypassed the VersionUpdater). The migration normally strips it. setCarrierStatus
      // maps it onto the per-condition model. Guard against re-processing after disorders were set.
      if (info.hasOwnProperty('carrierStatus')) {
        this.setCarrierStatus(info.carrierStatus);
      }
      if (info.hasOwnProperty('lostContact') && this.getLostContact() != info.lostContact) {
        this.setLostContact(info.lostContact);
      }
      if (info.hasOwnProperty('proband') && this.isProband() != info.proband) {
        this.setProband(info.proband);
      }
      if (info.hasOwnProperty('consultand') && this.isConsultand() != info.consultand) {
        this.setConsultand(info.consultand);
      }
      if (info.hasOwnProperty('assignedSexAtBirth') && this._assignedSexAtBirth != info.assignedSexAtBirth) {
        this.setAssignedSexAtBirth(info.assignedSexAtBirth);
      }
      if (info.hasOwnProperty('artRole') && this._artRole != info.artRole) {
        this.setArtRole(info.artRole);
      }
      return true;
    }
    return false;
  }
});

//ATTACHES CHILDLESS BEHAVIOR METHODS TO THIS CLASS
Person.addMethods(ChildlessBehavior);

// Synthetic disorder names used to represent symbol-level states that carry no real disease name.
// These MUST match the strings the migration writes (model/disorderStatusMigration.js) so a
// migrated placeholder and a freshly-synthesised one collapse to the same legend row/uuid.
Person.GENERIC_AFFECTED_NAME = 'Affected';       // generic "affected, unspecified" (NSGC Fig 2)
Person.CARRIER_PLACEHOLDER_NAME = '疾病A';         // orphan-carrier placeholder (needsRepair, D5)

export default Person;
