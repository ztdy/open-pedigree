import Raphael from 'pedigree/raphael';
import { isInt } from 'pedigree/model/helpers';
import { darkenColor, HATCH_STYLES, patternSwatchSVG } from 'pedigree/view/graphicHelpers';
import Disorder from 'pedigree/disorder';
import Legend from 'pedigree/view/legend';
import I18n from 'pedigree/i18n';

/**
 * Class responsible for keeping track of disorders and their properties, and for
 * caching disorders data as loaded from the OMIM database.
 * This information is graphically displayed in a 'Legend' box.
 *
 * @class DisorderLegend
 * @constructor
 */
var DisorgerLegend = Class.create( Legend, {

  initialize: function($super) {
    $super(I18n.t('Disorders'));

    this._disorderCache = {};

    // F1b (0.2): the legend is keyed by a document-level uuid ('d1', 'd2', …), NOT by a
    // sanitized disease id. The uuid is stable per clean disease NAME across the whole pedigree,
    // so the same disease everywhere shares one legend row, one colour, and one persisted swatch
    // key. This legend owns the name<->uuid registry and the counter that mints new uuids.
    this._nameToUuid = {};   // clean disease name -> uuid
    this._uuidToName = {};   // uuid -> clean disease name
    this._uuidCounter = 0;

    // F1c (NSGC 2022 §4.5): each disease also gets a distinct fill PATTERN (not only a colour), so
    // the symbol reads in black-and-white. The style is a PURE function of the set of diseases
    // present (see getObjectPattern) — no stored per-disease state, so nothing to init/reset/persist.
    // _patternCache/_patternSig below are just a memo of the last computed assignment.

    this._specialDisordersRegexps = [new RegExp('^1BrCa', 'i'),
      new RegExp('^2BrCa', 'i'),
      new RegExp('^OvCa',  'i'),
      new RegExp('^ProCa', 'i'),
      new RegExp('^PanCa', 'i') ];

    // A load/import rebuilds the whole pedigree; reset the registry first so uuids from a previous
    // document cannot leak into the next one (the loaded data re-registers its own uuids). Fires at
    // the top of createGraphFromSerializedData / createGraphFromImportData, before any node exists.
    var me = this;
    document.observe('pedigree:load:start', function() {
      me._loading = true;   // suppress per-person repaint during a bulk load (load:finish does one pass)
      // Drop the pattern memo + last-rendered assignment so a NEW document recomputes from scratch (a
      // carried-over assignment from the previous document could otherwise suppress the first repaint).
      me._patternSig = null;
      me._lastAssign = null;
      me._resetUuidRegistry();
    });
    // After a load all view nodes exist. Rebuild the registry from whatever graph is now live, then
    // re-tally counts/swatches/fill key. Rebuilding (not just relying on the incremental
    // registrations) also RECOVERS from a FAILED load/import: load:start reset the registry, but a
    // fromJSON/fromImport that threw leaves the PREVIOUS graph in place — without this, its uuids
    // are unregistered and the counter would re-mint d1, merging two distinct diseases.
    document.observe('pedigree:load:finish', function() {
      me._loading = false;   // one repaint pass now that every node + disease exists
      me._rebuildUuidRegistry();
      me.refresh();
    });
    document.observe('pedigree:import:fail', function() {
      me._loading = false;   // load:start set this true; no load:finish fires on failure — clear it
      me._rebuildUuidRegistry();
      me.refresh();
    });
  },

  _getPrefix: function(id) {
    return 'disorder';
  },

  _resetUuidRegistry: function() {
    this._nameToUuid = {};
    this._uuidToName = {};
    this._uuidCounter = 0;
    this._disorderCache = {};
    // Patterns need no reset: they are recomputed from the live disease set on demand. The memo
    // (_patternCache/_patternSig) self-invalidates when the set changes.
  },

  // Rebuild the name↔uuid registry (and advance the counter past every 'dN') from the disorders
  // actually present on the live view nodes. Idempotent after a clean load; the recovery path after
  // a failed load/import (where the previous graph survived a registry reset).
  _rebuildUuidRegistry: function() {
    this._nameToUuid = {};
    this._uuidToName = {};
    this._uuidCounter = 0;
    var nodeMap = editor.getView && editor.getView() && editor.getView().getNodeMap();
    if (!nodeMap) {
      return;
    }
    for (var id in nodeMap) {
      if (!nodeMap.hasOwnProperty(id)) {
        continue;
      }
      var node = nodeMap[id];
      if (!node || typeof node.getDisorders !== 'function') {
        continue;
      }
      var ds = node.getDisorders();
      for (var i = 0; i < ds.length; i++) {
        if (ds[i] && ds[i].uuid != null) {
          this.registerDisorderUuid(ds[i].uuid, ds[i].name);
        }
      }
    }
  },

  /**
     * Returns the uuid for a clean disease name, minting a new document-level one if unseen. This
     * is how the same disease shares a uuid across people (hence one legend row / colour).
     *
     * @method getUuidForName
     * @param {String} name clean disease name
     * @return {String} uuid
     */
  getUuidForName: function(name) {
    if (!this._nameToUuid.hasOwnProperty(name)) {
      this._uuidCounter++;
      var uuid = 'd' + this._uuidCounter;
      this._nameToUuid[name] = uuid;
      this._uuidToName[uuid] = name;
    }
    return this._nameToUuid[name];
  },

  /**
     * Registers an explicit uuid<->name pair (from a loaded/migrated file or an undo replay),
     * keeping the mint counter ahead of any numeric 'dN' id so freshly-typed disorders never
     * collide with a loaded one.
     *
     * @method registerDisorderUuid
     * @param {String} uuid
     * @param {String} name clean disease name
     */
  registerDisorderUuid: function(uuid, name) {
    if (name != null) {
      this._nameToUuid[name] = uuid;
      this._uuidToName[uuid] = name;
    }
    var m = /^d(\d+)$/.exec(uuid);
    if (m) {
      var n = parseInt(m[1], 10);
      if (n > this._uuidCounter) {
        this._uuidCounter = n;
      }
    }
  },

  /**
     * The fill PATTERN assigned to a disease (NSGC 2022 §4.5). The style is this disease's POSITION
     * in the numeric-sorted list of diseases currently present — a PURE function of the live set:
     *   - order-independent: the order diseases were added never affects the result;
     *   - session-independent: the same pedigree always reopens to the same assignment (so patterns
     *     need no persistence — they are recomputed from the set);
     *   - DISTINCT for up to HATCH_STYLES.length co-present diseases (beyond that the position wraps
     *     and a style repeats, but the distinct colour still separates them).
     * Trade-off: because it is positional, DELETING a disease can shift the styles of later ones
     * (they move up a slot) — acceptable, and preferred over ever letting two co-present diseases
     * share a pattern. Adding a disease (which sorts last, as uuids are minted in order) does not
     * shift the others. Memoised per live-set so a full render is O(1) per sector after the first.
     *
     * @method getObjectPattern
     * @param {String} uuid disorder uuid
     * @return {String} one of HATCH_STYLES
     */
  getObjectPattern: function(uuid) {
    // A coded (OMIM) disorder can carry a NUMBER uuid (e.g. 154700) while _affectedNodes keys are
    // always strings; coerce so indexOf/cache-key comparisons don't treat 154700 and "154700" as two
    // different diseases (which aliased them to one style).
    uuid = String(uuid);
    var live = [];
    // safe hasOwnProperty: a disease uuid could (in a crafted file) be a prototype name like
    // "hasOwnProperty"/"toString", which would break _affectedNodes.hasOwnProperty(...) called directly.
    for (var id in this._affectedNodes) { if (Object.prototype.hasOwnProperty.call(this._affectedNodes, id)) { live.push(id); } }
    if (live.indexOf(uuid) === -1) { live.push(uuid); }   // disease mid-add, not yet registered
    // numeric-aware sort so 'd2' precedes 'd10'; a plain-string tiebreak makes it a TOTAL order
    // (numeric compare alone ties e.g. 'd1'/'d01', leaving the result array-order-dependent).
    // Fixed 'en' locale (not the host default) so the SAME file assigns the SAME patterns on every
    // machine; numeric-aware so 'd2' precedes 'd10'; plain-string tiebreak makes it a TOTAL order.
    live.sort(function(a, b) {
      var c = String(a).localeCompare(String(b), 'en', { numeric: true });
      return c !== 0 ? c : (a < b ? -1 : (a > b ? 1 : 0));
    });
    var sig = JSON.stringify(live);   // fully injective — no separator can be forged into a uuid
    if (this._patternSig !== sig) {
      this._patternCache = Object.create(null);   // null-proto: a "toString"/"hasOwnProperty" uuid is a plain key
      for (var i = 0; i < live.length; i++) { this._patternCache[live[i]] = HATCH_STYLES[i % HATCH_STYLES.length]; }
      this._patternSig = sig;
    }
    return this._patternCache[uuid] || HATCH_STYLES[0];
  },


  /**
     * Returns the disorder object for the given key. Fast path: a known uuid resolves to a Disorder
     * carrying its registered name. Fallback (a coded id / free-text passed by a legacy caller such
     * as the FHIR export): behaves as before — sanitize and resolve the name asynchronously.
     *
     * @method getDisorder
     * @return {Object}
     */
  getDisorder: function(disorderID) {
    // Defensive: a caller may hand a disorder object ({uuid,name,status}) instead of an id — use
    // its uuid rather than crashing later on a string operation applied to an object.
    if (disorderID && typeof disorderID === 'object') {
      disorderID = disorderID.uuid != null ? disorderID.uuid : disorderID.name;
    }
    if (this._disorderCache.hasOwnProperty(disorderID)) {
      return this._disorderCache[disorderID];
    }
    var sid = isInt(disorderID) ? disorderID : Disorder.sanitizeID(disorderID);
    // A CODED id (OMIM MIM / Orphanet CURIE) re-resolves its name from the bundled dataset — it
    // follows the UI language and comes back even when reopened with a cold cache — rather than
    // using a stored/registered name. Checked BEFORE the uuid registry so a coded uuid re-resolves.
    if (Disorder.isCodedID(sid)) {
      if (!this._disorderCache.hasOwnProperty(sid)) {
        var whenCodedLoaded = function() {
          this._updateDisorderName(sid);
        };
        this._disorderCache[sid] = new Disorder(sid, null, whenCodedLoaded.bind(this));
      }
      return this._disorderCache[sid];
    }
    if (this._uuidToName.hasOwnProperty(disorderID)) {
      this._disorderCache[disorderID] = new Disorder(disorderID, this._uuidToName[disorderID]);
      return this._disorderCache[disorderID];
    }
    if (!this._disorderCache.hasOwnProperty(sid)) {
      var whenNameIsLoaded = function() {
        this._updateDisorderName(sid);
      };
      this._disorderCache[sid] = new Disorder(sid, null, whenNameIsLoaded.bind(this));
    }
    return this._disorderCache[sid];
  },

  /**
     * Registers an occurrence of a disorder (keyed by uuid). If the disorder hasn't been documented
     * yet, designates a color for it.
     *
     * @method addCase
     * @param {String} uuid document-level uuid for this disorder
     * @param {String} disorderName The clean name of the disorder
     * @param {Number} nodeID ID of the Person who has this disorder
     */
  addCase: function($super, uuid, disorderName, nodeID) {
    this.registerDisorderUuid(uuid, disorderName);
    if (!this._disorderCache.hasOwnProperty(uuid)) {
      if (Disorder.isCodedID(uuid)) {
        // Coded (OMIM/Orphanet): resolve the name from the dataset (follows UI language / survives a
        // cold reopen) rather than freezing the name captured when it was added.
        var whenCodedLoaded = function() {
          this._updateDisorderName(uuid);
        };
        this._disorderCache[uuid] = new Disorder(uuid, null, whenCodedLoaded.bind(this));
      } else {
        this._disorderCache[uuid] = new Disorder(uuid, disorderName);
      }
    }

    $super(uuid, disorderName, nodeID);
  },

  /**
     * Updates the displayed disorder name for the given disorder
     *
     * @method _updateDisorderName
     * @param {Number} disorderID The identifier of the disorder to update
     * @private
     */
  _updateDisorderName: function(disorderID) {
    var listElement = this._getListElementForObject(disorderID);
    var name = listElement && listElement.down('.disorder-name');
    if (!name) {
      return;   // the disorder has no row in this legend (yet)
    }
    name.update((this.getDisorder(disorderID).getName() + '').escapeHTML());  // innerHTML sink: escape to avoid stored XSS
  },

  /**
     * Generate the element that will display information about the given disorder in the legend
     *
     * @method _generateElement
     * @param {Number} disorderID The id for the disorder, taken from the OMIM database
     * @param {String} name The human-readable disorder name
     * @return {HTMLLIElement} List element to be insert in the legend
     */
  _generateElement: function($super, disorderID, name) {
    if (!this._objectColors.hasOwnProperty(disorderID)) {
      var color = this._generateColor(disorderID, name);
      this._objectColors[disorderID] = color;
      document.fire('disorder:color', {'id' : disorderID, color: color});
    }

    var element = $super(disorderID, name);
    // D5: the disorder name is editable in place (double-click) so an auto-generated placeholder
    // ("疾病A", from an orphan-carrier migration) can be corrected to the real disease name.
    this._attachRenameHandler(element, disorderID);
    return element;
  },

  /**
     * Per-condition breakdown for a disorder uuid, read live from the affected nodes so it stays
     * correct through in-place status edits. total is authoritative (the registered case count);
     * the affected/carrier split (and needsRepair) come from whichever nodes are currently
     * resolvable — during a load some nodes are not registered yet, so refresh() re-runs on
     * 'pedigree:load:finish'.
     */
  _disorderInfo: function(uuid) {
    var nodeIDs = this._affectedNodes[uuid] || [];
    // Non-throwing node lookup: during a load addCase() runs (via assignProperties) BEFORE the view
    // node is registered in the node map, and editor.getNode() THROWS for an unregistered id. Skip
    // those here; the 'pedigree:load:finish' refresh re-tallies once every node exists.
    var nodeMap = editor.getView().getNodeMap();
    var affected = 0, carrier = 0, needsRepair = false;
    for (var i = 0; i < nodeIDs.length; i++) {
      if (!nodeMap.hasOwnProperty(nodeIDs[i])) {
        continue;
      }
      var node = nodeMap[nodeIDs[i]];
      if (!node || !node.getDisorders) {
        continue;
      }
      var ds = node.getDisorders();
      for (var j = 0; j < ds.length; j++) {
        if (ds[j].uuid === uuid) {
          if (ds[j].status === 'carrier') {
            carrier++;
          } else {
            affected++;
          }
          if (ds[j].needsRepair) {
            needsRepair = true;
          }
        }
      }
    }
    return { affected: affected, carrier: carrier, total: nodeIDs.length, needsRepair: needsRepair };
  },

  // Split case count ("2 affected · 1 carrier"), plus swatch style + repair flag for one disorder.
  // Fully replaces the base one-number version.
  _updateCaseNumbersForObject: function(uuid) {
    var listElement = this._getListElementForObject(uuid);
    if (!listElement) {
      return;
    }
    var info = this._disorderInfo(uuid);
    var label = listElement.down('.disorder-cases');
    if (label) {
      var parts = [];
      if (info.affected > 0) {
        parts.push(info.affected + '&nbsp;' + I18n.t('affected'));
      }
      if (info.carrier > 0) {
        parts.push(info.carrier + '&nbsp;' + (info.carrier === 1 ? I18n.t('carrier') : I18n.t('carriers')));
      }
      if (parts.length === 0) {
        var n = info.total;
        parts.push(n + '&nbsp;' + (n === 1 ? I18n.t('case') : I18n.t('cases')));
      }
      label.update(parts.join('&nbsp;·&nbsp;'));
    }
    this._styleSwatch(uuid, info);
    // D5: mark a placeholder row (needs a real name) and show a repair affordance.
    if (info.needsRepair) {
      listElement.addClassName('needs-repair');
      if (!listElement.down('.repair-flag')) {
        var me = this;
        var flag = new Element('span', {'class': 'repair-flag', title: I18n.t('Placeholder name — click to rename')}).update('⚠');
        Element.observe(flag, 'click', function(e) { e.stop(); me._promptRename(uuid); });
        var nameEl = listElement.down('.disorder-name');
        if (nameEl) {
          nameEl.insert({after: flag});
        }
      }
    } else {
      listElement.removeClassName('needs-repair');
      var existingFlag = listElement.down('.repair-flag');
      if (existingFlag) {
        existingFlag.remove();
      }
    }
  },

  // The legend swatch = this disease's colour + its assigned fill PATTERN, rendered as inline SVG
  // from the SAME geometry as the on-canvas fill (patternSwatchSVG -> hatchSpecs). Rendering both
  // from one generator is deliberate: the earlier CSS-gradient swatch could (and did) point the
  // opposite way from the SVG canvas hatch. The swatch uses the dense (carrier) density so the
  // pattern stays legible at swatch size; the affected/carrier distinction is stated by the fill
  // key. NSGC general instruction #3: the fill pattern MUST be defined in the legend.
  _styleSwatch: function(uuid, info) {
    var listElement = this._getListElementForObject(uuid);
    var bubble = listElement && listElement.down('.disorder-color');
    if (!bubble) {
      return;
    }
    var color = this.getObjectColor(uuid);
    var style = this.getObjectPattern(uuid);
    // Every disease has a fill PATTERN now (the B&W identity), so the swatch always shows its colour
    // + pattern. Affected vs carrier (colour behind the pattern vs none) is stated by the fill key.
    bubble.style.background = '';
    bubble.style.backgroundColor = '';
    bubble.innerHTML = patternSwatchSVG(color, style, 16, 'carrier');   // innerHTML sink: our own markup, no user text
    // Robust hints for the PDF exporter (it rebuilds the swatch from these, not from the SVG) + tests.
    bubble.setAttribute('data-color', color);
    bubble.setAttribute('data-pattern', style);
    bubble.setAttribute('data-fill', 'pattern');
  },

  // Re-tally every disorder row + (re)build the fill key. Cheap; call after any disorder/status
  // change (person.setDisorders / setCarrierStatus), a recolor, a rename, or a load.
  refresh: function() {
    for (var uuid in this._affectedNodes) {
      if (this._affectedNodes.hasOwnProperty(uuid)) {
        this._updateCaseNumbersForObject(uuid);
      }
    }
    this._syncFillKey();
    this._repaintChangedPatterns();
  },

  // Pattern styles are POSITIONAL over the whole set of diseases present, so adding/removing a disease
  // can shift OTHER diseases' styles — including diseases drawn on people who weren't the one just
  // edited. Redraw those people so no symbol is left with a stale pattern (canvas would otherwise
  // disagree with the legend / PDF).
  //
  // Done SYNCHRONOUSLY (not deferred): a same-tick autosave/export must serialize the up-to-date
  // canvas. To stay cheap it is DIFF-BASED — it recomputes the assignment and repaints only the
  // people carrying a disease whose style actually changed. The common edit (add a disease, which
  // sorts last, or remove the last one) changes nothing else, so it repaints nobody extra.
  _repaintChangedPatterns: function() {
    if (this._loading) { return; }
    // null-proto maps + safe hasOwnProperty so a prototype-named uuid ("toString") is a plain key,
    // not an inherited member that would fake a diff or break enumeration.
    var has = function(o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
    var newAssign = Object.create(null);
    for (var uuid in this._affectedNodes) {
      if (has(this._affectedNodes, uuid)) { newAssign[uuid] = this.getObjectPattern(uuid); }
    }
    var prev = this._lastAssign || Object.create(null);
    var changed = Object.create(null), any = false;
    for (var k in newAssign) { if (has(newAssign, k) && newAssign[k] !== prev[k]) { changed[k] = true; any = true; } }
    this._lastAssign = newAssign;
    if (!any) { return; }
    var nodeMap = editor.getView && editor.getView() && editor.getView().getNodeMap();
    if (!nodeMap) { return; }
    for (var id in nodeMap) {
      if (!nodeMap.hasOwnProperty(id)) { continue; }
      var node = nodeMap[id];
      if (!node || !node.getGraphics || !node.getDisorders) { continue; }
      var ds = node.getDisorders(), hit = false;
      for (var j = 0; j < ds.length; j++) { if (changed[String(ds[j].uuid)]) { hit = true; break; } }
      if (hit) { var g = node.getGraphics(); if (g && g.updateDisorderShapes) { g.updateDisorderShapes(); } }
    }
  },

  // The fill key: "solid = affected / hatched = carrier". Present whenever there is ≥1 disorder.
  _syncFillKey: function() {
    var hasDisorders = Object.keys(this._affectedNodes).length > 0;
    var existing = this._legendBox.down('.fill-key');
    if (!hasDisorders) {
      if (existing) {
        existing.remove();
      }
      return;
    }
    if (existing) {
      return;
    }
    // The key shows the convention exactly as drawn: SAME pattern for both states; AFFECTED has the
    // disease colour behind it, CARRIER has none (white). A neutral grey stands in for "any colour".
    var NEUTRAL = '#9aa0a6';
    var affSwatch = new Element('span', {'class': 'fill-key-swatch'});
    affSwatch.innerHTML = patternSwatchSVG(darkenColor(NEUTRAL, 0.7), 'diag-fwd', 16, 'carrier');   // deep colour fill + pattern
    var carSwatch = new Element('span', {'class': 'fill-key-swatch carrier'});
    carSwatch.innerHTML = patternSwatchSVG('#ffffff', 'diag-fwd', 16, 'carrier');  // white fill + pattern
    var ul = new Element('ul', {'class': 'fill-key'});
    ul.insert(new Element('li').insert(affSwatch).insert(I18n.t('colour + pattern = affected')));
    ul.insert(new Element('li').insert(carSwatch).insert(I18n.t('pattern only (no fill) = carrier')));
    var title = this._legendBox.down('.legend-title');
    if (title) {
      title.insert({after: ul});
    } else {
      this._legendBox.insert({top: ul});
    }
  },

  _attachRenameHandler: function(listElement, uuid) {
    var nameEl = listElement.down('.disorder-name');
    if (!nameEl) {
      return;
    }
    var me = this;
    nameEl.title = I18n.t('Double-click to rename');
    Element.observe(nameEl, 'dblclick', function(e) {
      e.stop();
      me._promptRename(uuid);
    });
  },

  _promptRename: function(uuid) {
    var current = this._uuidToName[uuid] || '';
    var next = window.prompt(I18n.t('Rename disorder'), current);
    if (next == null) {
      return;
    }
    next = next.trim();
    if (next === '' || next === current) {
      return;
    }
    this.renameDisorder(uuid, next);
  },

  /**
     * D5: rename a disorder everywhere. Updates the name↔uuid registry, the cached Disorder, every
     * person's entry for this uuid (clearing needsRepair), the serialized graph properties, and the
     * legend row. The uuid — the identity/colour key — is deliberately unchanged.
     */
  renameDisorder: function(uuid, newName) {
    // If the new name already belongs to ANOTHER disorder, renaming to it means "this is the same
    // disease" — merge, rather than minting a second legend row/colour/identity for one disease
    // (which would break the document-wide same-name→same-uuid invariant, esp. repairing a
    // placeholder to a family condition already present).
    if (this._nameToUuid.hasOwnProperty(newName) && this._nameToUuid[newName] !== uuid) {
      this._mergeDisorderInto(uuid, this._nameToUuid[newName]);
      return;
    }
    var oldName = this._uuidToName[uuid];
    if (oldName != null && this._nameToUuid[oldName] === uuid) {
      delete this._nameToUuid[oldName];
    }
    this._nameToUuid[newName] = uuid;
    this._uuidToName[uuid] = newName;
    if (this._disorderCache[uuid]) {
      this._disorderCache[uuid]._name = newName;
    }

    var nodeIDs = (this._affectedNodes[uuid] || []).slice();
    var nodeMap = editor.getView().getNodeMap();
    nodeIDs.forEach(function(nodeID) {
      var node = nodeMap.hasOwnProperty(nodeID) ? nodeMap[nodeID] : null;
      if (!node || !node.getDisorders) {
        return;
      }
      node.getDisorders().forEach(function(d) {
        if (d.uuid === uuid) {
          d.name = newName;
          delete d.needsRepair;
        }
      });
      editor.getGraph().setProperties(nodeID, node.getProperties());
    });

    var listElement = this._getListElementForObject(uuid);
    var nameEl = listElement && listElement.down('.disorder-name');
    if (nameEl) {
      nameEl.update((newName + '').escapeHTML());   // innerHTML sink: escape
    }
    this.refresh();
    // Mark the pedigree changed so save-tracking records it. A dedicated event (in the desktop
    // DIRTY_EVENTS list) — NOT pedigree:node:setproperty, which the controller also handles and
    // would try to apply as a node property change with an empty memo.
    document.fire('pedigree:disorder:renamed', {uuid: uuid, name: newName});
  },

  /**
     * Merge disorder `fromUuid` into the existing `toUuid` (same disease). Every person carrying
     * fromUuid is rebuilt with those entries rekeyed to toUuid+its name; a person that already has
     * toUuid is de-duplicated (affected wins over carrier). Rebuilding through setDisorders keeps
     * the legend rows/colours/case-maps consistent — fromUuid's row is dropped when its last case
     * goes. The registry entry for the merged-away uuid is then cleaned up.
     */
  _mergeDisorderInto: function(fromUuid, toUuid) {
    var toName = this._uuidToName[toUuid];
    var nodeMap = editor.getView().getNodeMap();
    var nodeIDs = (this._affectedNodes[fromUuid] || []).slice();
    nodeIDs.forEach(function(nodeID) {
      var node = nodeMap.hasOwnProperty(nodeID) ? nodeMap[nodeID] : null;
      if (!node || !node.getDisorders) {
        return;
      }
      var indexByUuid = {};
      var rebuilt = [];
      node.getDisorders().forEach(function(d) {
        var u = (d.uuid === fromUuid) ? toUuid : d.uuid;
        var nm = (d.uuid === fromUuid) ? toName : d.name;
        if (indexByUuid.hasOwnProperty(u)) {
          // reconcile a duplicate of the merged disease: affected is more severe than carrier
          if (d.status === 'affected') {
            rebuilt[indexByUuid[u]].status = 'affected';
          }
          return;
        }
        indexByUuid[u] = rebuilt.length;
        rebuilt.push({ uuid: u, name: nm, status: d.status });   // needsRepair cleared by the merge
      });
      node.setDisorders(rebuilt);
      editor.getGraph().setProperties(nodeID, node.getProperties());
    });
    // fromUuid now has no cases; drop its registry entries so it can't resurface.
    var fromName = this._uuidToName[fromUuid];
    if (fromName != null && this._nameToUuid[fromName] === fromUuid) {
      delete this._nameToUuid[fromName];
    }
    delete this._uuidToName[fromUuid];
    delete this._disorderCache[fromUuid];
    this.refresh();
    document.fire('pedigree:disorder:renamed', {uuid: toUuid, name: toName, mergedFrom: fromUuid});
  },

  // Recolor: keep the swatch/hatch styling coherent (a carrier-only swatch must re-hatch in the
  // new colour, not revert to a solid block).
  setObjectColor: function($super, id, color) {
    $super(id, color);
    if (this._affectedNodes.hasOwnProperty(id)) {
      this._styleSwatch(id, this._disorderInfo(id));
    }
  },

  /**
     * Generates a CSS color.
     * Has preference for some predefined colors that can be distinguished in gray-scale
     * and are distint from gene colors.
     *
     * @method generateColor
     * @return {String} CSS color
     */
  _generateColor: function(disorderID, name) {
    if(this._objectColors.hasOwnProperty(disorderID)) {
      return this._objectColors[disorderID];
    }

    // Special cancer-risk families (BOADICEA) used to be recognised by the disorder id prefix;
    // the id is an opaque uuid now, so match on the NAME and keep same-family cancers same-coloured.
    var matchKey = (name != null) ? name : disorderID;
    for (var i = 0; i < this._specialDisordersRegexps.length; i++) {
      if (matchKey.match(this._specialDisordersRegexps[i]) !== null) {
        for (var uuid in this._objectColors) {
          if (this._objectColors.hasOwnProperty(uuid)) {
            var otherName = this._uuidToName[uuid];
            if (otherName != null && otherName.match(this._specialDisordersRegexps[i]) !== null) {
              return this._objectColors[uuid];
            }
          }
        }
        break;
      }
    }

    var usedColors = Object.values(this._objectColors),
      // [red/yellow]           prefColors = ["#FEE090", '#f8ebb7', '#eac080', '#bf6632', '#9a4500', '#a47841', '#c95555', '#ae6c57'];
      // [original yellow/blue] prefColors = ["#FEE090", '#E0F8F8', '#8ebbd6', '#4575B4', '#fca860', '#9a4500', '#81a270'];
      // [green]                prefColors = ['#81a270', '#c4e8c4', '#56a270', '#b3b16f', '#4a775a', '#65caa3'];
      prefColors = ['#E0F8F8', '#92c0db', '#4575B4', '#949ab8', '#FEE090', '#bf6632', '#fca860', '#9a4500', '#d12943', '#00a2bf'];
    usedColors.each( function(color) {
      prefColors = prefColors.without(color);
    });
    // The generic "Affected" condition keeps its distinctive yellow (was keyed by the id 'affected';
    // it is a named disorder with a uuid now, so recognise it by name).
    if (name === 'Affected') {
      if (usedColors.indexOf('#FEE090') > -1 ) {
        return '#dbad71';
      } else {
        return '#FEE090';
      }
    }
    if(prefColors.length > 0) {
      return prefColors[0];
    } else {
      var randomColor = Raphael.getColor();
      while(randomColor == '#ffffff' || usedColors.indexOf(randomColor) != -1) {
        randomColor = '#'+((1<<24)*Math.random()|0).toString(16);
      }
      return randomColor;
    }
  }
});

export default DisorgerLegend;
