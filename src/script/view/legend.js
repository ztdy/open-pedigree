import Helpers from 'pedigree/model/helpers';
import I18n from 'pedigree/i18n';

/**
 * Base class for various "legend" widgets
 *
 * @class Legend
 * @constructor
 */

var Legend = Class.create( {

  initialize: function(title) {
    this._affectedNodes  = {};     // for each object: the list of affected person nodes

    this._objectColors = {};       // for each object: the corresponding object color

    var legendContainer = $('legend-container');
    if (legendContainer == undefined) {
      var legendContainer = new Element('div', {'class': 'legend-container', 'id': 'legend-container'});
      editor.getWorkspace().getWorkArea().insert(legendContainer);
    }

    this._legendBox = new Element('div', {'class' : 'legend-box', id: 'legend-box'});
    this._legendBox.hide();
    legendContainer.insert(this._legendBox);

    var legendTitle= new Element('h2', {'class' : 'legend-title'}).update(title);
    this._legendBox.insert(legendTitle);

    this._list = new Element('ul', {'class' : 'disorder-list'});
    this._legendBox.insert(this._list);

    Element.observe(this._legendBox, 'mouseover', function() {
      $$('.menu-box').invoke('setOpacity', .1);
    });
    Element.observe(this._legendBox, 'mouseout', function() {
      $$('.menu-box').invoke('setOpacity', 1);
    });
  },

  /**
     * Returns the prefix to be used on elements related to the object
     * (of type tracked by this legend) with the given id.
     *
     * @method _getPrefix
     * @param {String|Number} id ID of the object
     * @return {String} some identifier which should be a valid HTML id value (e.g. no spaces)
     */
  _getPrefix: function(id) {
    // To be overwritten in derived classes
    throw 'prefix not defined';
  },

  /**
     * Returns the legend row for the given object, or null if it has none.
     *
     * The id is derived from a disorder/phenotype NAME, so it can contain characters that are
     * syntax in a CSS selector. Callers used to build one by concatenation
     * ('li#' + prefix + '-' + id + ' .disorder-cases'), which breaks on the first comma: a comma
     * is the selector-LIST separator, so "Cancer, breast" silently became two selectors that
     * match nothing. Looking the id up literally has no such failure mode.
     *
     * @method _getListElementForObject
     * @param {String|Number} id ID of the object
     * @return {Element|null}
     * @private
     */
  _getListElementForObject: function(id) {
    return $(this._getPrefix() + '-' + id) || null;
  },

  /**
     * Retrieve the color associated with the given object
     *
     * @method getObjectColor
     * @param {String|Number} id ID of the object
     * @return {String} CSS color value for the object, displayed on affected nodes in the pedigree and in the legend
     */
  getObjectColor: function(id) {
    if (!this._objectColors.hasOwnProperty(id)) {
      return '#ff0000';
    }
    return this._objectColors[id];
  },

  /**
     * Sets a custom color for the given object, updates the legend swatch and repaints
     * every affected pedigree node so the new color shows immediately. Used by the
     * click-to-recolor picker and when restoring saved colors on load.
     *
     * @method setObjectColor
     * @param {String|Number} id ID of the object
     * @param {String} color CSS hex color (e.g. "#4575B4")
     */
  setObjectColor: function(id, color) {
    if (!color) {
      return;
    }
    this._objectColors[id] = color;
    var listElement = this._getListElementForObjectWithID(id);
    if (listElement) {
      var bubble = listElement.down('.disorder-color');
      if (bubble) {
        bubble.style.backgroundColor = color;
      }
    }
    // Let dependent UI (e.g. the node-menu disorder color bubble) pick up the change. The
    // event is legend-specific ('disorder:color' / 'gene:color' / 'phenotype:color') so a
    // gene/phenotype recolor can't wrongly update a disorder chip with a colliding id.
    document.fire(this._getPrefix() + ':color', {'id' : id, color: color});
    // Repaint affected nodes. Disorder colors are drawn on the node shapes (updateDisorderShapes);
    // a gene color now tints the gene TEXT label under the symbol (updateGeneLabel), so a gene
    // recolor — including the color restore on load — must refresh that label too, or it keeps the
    // color it happened to be created with.
    var isGeneLegend = this._getPrefix() === 'gene';
    if (this._affectedNodes.hasOwnProperty(id)) {
      this._affectedNodes[id].forEach(function(nodeID) {
        var node = editor.getNode(nodeID);
        var graphics = node && node.getGraphics && node.getGraphics();
        if (!graphics) {
          return;
        }
        if (graphics.updateDisorderShapes) {
          graphics.updateDisorderShapes();
        }
        if (isGeneLegend && graphics.updateGeneLabel) {
          graphics.updateGeneLabel();
        }
      });
    }
  },

  /**
     * Returns a shallow copy of all custom object colors, for persistence.
     * @method getAllColors
     * @return {Object} map of objectID -> css color
     */
  getAllColors: function() {
    var copy = {};
    for (var id in this._objectColors) {
      if (this._objectColors.hasOwnProperty(id)) {
        copy[id] = this._objectColors[id];
      }
    }
    return copy;
  },

  /**
     * Restores previously-saved colors. Only affects objects present in the map.
     * @method setColors
     * @param {Object} colorMap map of objectID -> css color
     */
  setColors: function(colorMap) {
    if (!colorMap) {
      return;
    }
    for (var id in colorMap) {
      if (colorMap.hasOwnProperty(id)) {
        this.setObjectColor(id, colorMap[id]);
      }
    }
  },

  /**
     * Opens the native color picker for the given object. Uses a single reusable, offscreen
     * <input type=color> per legend (created lazily) so cancelled dialogs don't leak DOM
     * nodes or Prototype event-cache entries. A committed choice recolors and fires a dirty
     * signal so save-tracking (desktop close prompt / web autosave) records the change.
     *
     * @method _openColorPicker
     * @param {String|Number} id ID of the object to recolor
     */
  _openColorPicker: function(id) {
    var me = this;
    if (!this._colorInput) {
      var input = new Element('input', {type: 'color', 'class': 'legend-color-input'});
      input.setStyle({position: 'fixed', left: '-9999px', top: '0'});
      $(document.body).insert(input);
      Element.observe(input, 'change', function() {
        if (me._colorInputTargetId == null) {
          return;
        }
        me.setObjectColor(me._colorInputTargetId, input.value);
        document.fire('pedigree:legend:color-changed',
          {legend: me._getPrefix(), id: me._colorInputTargetId, color: input.value});
      });
      this._colorInput = input;
    }
    this._colorInputTargetId = id;
    this._colorInput.value = this.getObjectColor(id);
    this._colorInput.click();
  },

  /**
     * Returns True if there are nodes reported to have the object with the given id
     *
     * @method _hasAffectedNodes
     * @param {String|Number} id ID of the object
     * @private
     */
  _hasAffectedNodes: function(id) {
    return Object.prototype.hasOwnProperty.call(this._affectedNodes, id);
  },

  /**
     * Remap the node IDs this legend tracks after the view renumbers nodes (deleting a node compacts
     * higher IDs via view.changeNodeIds). Without this, _affectedNodes would keep STALE node IDs — a
     * renumbered carrier would drop out of its case count, and a recolor would dereference a vanished
     * ID. Applies to every legend type (disorder / gene / HPO).
     *
     * @param {Object} changedIdsSet map of oldNodeID -> newNodeID
     */
  replaceNodeIds: function(changedIdsSet) {
    for (var id in this._affectedNodes) {
      if (Object.prototype.hasOwnProperty.call(this._affectedNodes, id)) {
        this._affectedNodes[id] = this._affectedNodes[id].map(function(nodeID) {
          return Object.prototype.hasOwnProperty.call(changedIdsSet, nodeID) ? changedIdsSet[nodeID] : nodeID;
        });
      }
    }
  },

  /**
     * Registers an occurrence of an object type being tracked by this legend.
     *
     * @method addCase
     * @param {String|Number} id ID of the object
     * @param {String} Name The description of the object to be displayed
     * @param {Number} nodeID ID of the Person who has this object associated with it
     */
  addCase: function(id, name, nodeID) {
    if(Object.keys(this._affectedNodes).length == 0) {
      this._legendBox.show();
    }
    if(!this._hasAffectedNodes(id)) {
      this._affectedNodes[id] = [nodeID];
      var listElement = this._generateElement(id, name);
      this._list.insert(listElement);
    } else {
      this._affectedNodes[id].push(nodeID);
    }
    this._updateCaseNumbersForObject(id);
  },

  /**
     * Removes an occurrence of an object, if there are any. Removes the object
     * from the 'Legend' box if this object is not registered in any individual any more.
     *
     * @param {String|Number} id ID of the object
     * @param {Number} nodeID ID of the Person who has/is affected by this object
     */
  removeCase: function(id, nodeID) {
    if (this._hasAffectedNodes(id)) {
      this._affectedNodes[id] = this._affectedNodes[id].without(nodeID);
      if(this._affectedNodes[id].length == 0) {
        delete this._affectedNodes[id];
        delete this._objectColors[id];
        var htmlElement = this._getListElementForObjectWithID(id);
        htmlElement.remove();
        if(Object.keys(this._affectedNodes).length == 0) {
          this._legendBox.hide();
        }
      } else {
        this._updateCaseNumbersForObject(id);
      }
    }
  },

  _getListElementForObjectWithID: function(id) {
    return $(this._getPrefix() + '-' + id);
  },

  /**
     * Updates the displayed number of nodes assocated with/affected by the object
     *
     * @method _updateCaseNumbersForObject
     * @param {String|Number} id ID of the object
     * @private
     */
  _updateCaseNumbersForObject : function(id) {
    var listElement = this._getListElementForObject(id);
    var label = listElement && listElement.down('.disorder-cases');
    if (label) {
      var cases = this._affectedNodes.hasOwnProperty(id) ? this._affectedNodes[id].length : 0;
      label.update(cases + '&nbsp;' + (cases === 1 ? I18n.t('case') : I18n.t('cases')));
    }
  },

  /**
     * Generate the element that will display information about the given object in the legend
     *
     * @method _generateElement
     * @param {String|Number} id ID of the object
     * @param {String} name The human-readable object name or description
     * @return {HTMLLIElement} List element to be insert in the legend
     */
  _generateElement: function(id, name) {
    var color = this.getObjectColor(id);
    // Escape: disorder/gene/HPO names can be free text or come from imported files, and
    // .update() is an innerHTML sink. Rendering them raw is a stored-XSS vector.
    var item = new Element('li', {'class' : 'disorder', 'id' : this._getPrefix() + '-' + id}).update(new Element('span', {'class' : 'disorder-name'}).update((name + '').escapeHTML()));
    var bubble = new Element('span', {'class' : 'disorder-color'});
    bubble.style.backgroundColor = color;
    bubble.style.cursor = 'pointer';
    bubble.title = I18n.t('Click to change color');
    var me = this;
    // Click the swatch to recolor this disorder/gene/phenotype via a native color picker.
    Element.observe(bubble, 'click', function(event) {
      event.stop();
      me._openColorPicker(id);
    });
    item.insert({'top' : bubble});
    var countLabel = new Element('span', {'class' : 'disorder-cases'});
    var countLabelContainer = new Element('span', {'class' : 'disorder-cases-container'}).insert('(').insert(countLabel).insert(')');
    item.insert(' ').insert(countLabelContainer);
    var me = this;
    Element.observe(item, 'mouseover', function() {
      //item.setStyle({'text-decoration':'underline', 'cursor' : 'default'});
      item.down('.disorder-name').setStyle({'background': color, 'cursor' : 'default'});
      me._affectedNodes[id] && me._affectedNodes[id].forEach(function(nodeID) {
        var node = editor.getNode(nodeID);
        node && node.getGraphics().highlight();
      });
    });
    Element.observe(item, 'mouseout', function() {
      //item.setStyle({'text-decoration':'none'});
      item.down('.disorder-name').setStyle({'background':'', 'cursor' : 'default'});
      me._affectedNodes[id] && me._affectedNodes[id].forEach(function(nodeID) {
        var node = editor.getNode(nodeID);
        node && node.getGraphics().unHighlight();
      });
    });
    return item;
  }
});

export default Legend;
