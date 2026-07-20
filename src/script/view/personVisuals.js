import Raphael from 'pedigree/raphael';
import { Timer } from 'pedigree/model/helpers';
import AbstractPersonVisuals from 'pedigree/view/abstractPersonVisuals';
import { ChildlessBehaviorVisuals} from 'pedigree/view/abstractNodeVisuals';
import PersonHoverbox from 'pedigree/view/personHoverbox';
import ReadOnlyHoverbox from 'pedigree/view/readonlyHoverbox';
import PedigreeEditorParameters from 'pedigree/pedigreeEditorParameters';
import { getElementHalfHeight, sector, drawSectorHatch, darkenColor } from 'pedigree/view/graphicHelpers';
import getAge from 'pedigree/view/ageCalc';
import I18n from 'pedigree/i18n';

/**
 * Class for organizing graphics for Person nodes.
 *
 * @class PersonVisuals
 * @extends AbstractPersonVisuals
 * @constructor
 * @param {Person} node The node for which the graphics are handled
 * @param {Number} x The x coordinate on the canvas
 * @param {Number} y The y coordinate on the canvas
 */

var PersonVisuals = Class.create(AbstractPersonVisuals, {

  initialize: function($super, node, x, y) {
    //var timer = new Timer();
    //console.log("person visuals");
    $super(node, x, y);
    this._nameLabel = null;
    this._stillBirthLabel = null;
    this._ageLabel = null;
    this._externalIDLabel = null;
    this._geneLabel = null;
    this._genotypeLabel = null;
    this._sexLabel = null;
    this._artRoleLabel = null;
    this._commentsLabel = null;
    this._childlessStatusLabel = null;
    this._disorderShapes = null;
    this._deadShape = null;
    this._unbornShape = null;
    this._childlessShape = null;
    this._isSelected = false;
    this._carrierGraphic = null;
    this._evalLabel = null;
    //console.log("person visuals end");
    //timer.printSinceLast("Person visuals time");
  },

  generateHoverbox: function(x, y) {
    if (editor.isReadOnlyMode()) {
      return new ReadOnlyHoverbox(this.getNode(), x, y, this.getGenderGraphics());
    } else {
      return new PersonHoverbox(this.getNode(), x, y, this.getGenderGraphics());
    }
  },

  /**
     * Draws the icon for this Person depending on the gender, life status and whether this Person is the proband.
     * Updates the disorder shapes.
     *
     * @method setGenderGraphics
     */
  setGenderGraphics: function($super) {
    //console.log("set gender graphics");
    if(this.getNode().getLifeStatus() == 'aborted' || this.getNode().getLifeStatus() == 'miscarriage' || this.getNode().getLifeStatus() == 'ectopic') {
      this._genderGraphics && this._genderGraphics.remove();

      var radius = PedigreeEditorParameters.attributes.radius;
      if (this.getNode().isPersonGroup()) {
        radius *= PedigreeEditorParameters.attributes.groupNodesScale;
      }
      this._shapeRadius = radius;

      var side = radius * Math.sqrt(3.5),
        height = side/Math.sqrt(2),
        x = this.getX() - height,
        y = this.getY();
      var shape = editor.getPaper().path(['M',x, y, 'l', height, -height, 'l', height, height,'z']);
      shape.attr(PedigreeEditorParameters.attributes.nodeShape);
      this._genderShape = shape;
      shape = editor.getPaper().set(shape.glow({width: 5, fill: true, opacity: 0.1}).transform(['t',3,3,'...']), shape);

      if(this.getNode().isProband()) {
        shape.transform(['...s', 1.07]);
        shape.attr('stroke-width', 5);
      }

      if(this.getNode().getGender() == 'U') {
        this._genderGraphics = shape;
      } else {
        x = this.getX();
        y = this.getY() + radius/1.4;
        var text = (this.getNode().getGender() == 'M') ? I18n.t('Male') : I18n.t('Female');
        var genderLabel = editor.getPaper().text(x, y, text).attr(PedigreeEditorParameters.attributes.label);
        this._genderGraphics = editor.getPaper().set(shape, genderLabel);
      }
    } else {
      $super();
    }

    if(this.getNode().isProband()) {
      this._genderGraphics.push(this.generateProbandArrow());
      this.getGenderShape().transform(['...s', 1.08]);
      this.getGenderShape().attr('stroke-width', 5.5);
    } else if (this.getNode().isConsultand && this.getNode().isConsultand()) {
      // Someone who is BOTH is drawn as the proband (branch above): NSGC defines no combined
      // symbol, and "arrow + P" is the more specific of the two statements. The heavier outline
      // stays proband-only for the same reason — it is emphasis for the index case.
      this._genderGraphics.push(this.generateConsultandArrow());
    }
    if(!editor.isUnsupportedBrowser() && this.getHoverBox()) {
      this._genderGraphics.flatten().insertBefore(this.getFrontElements().flatten());
    }
    this.updateDisorderShapes();
    this.updateCarrierGraphic();
    this.updateEvaluationLabel();
    // Regenerating the gender shape drops/covers the life-status graphics that layer on top of
    // it (the "P" pregnancy marker, the death slash, the SB/ECT label, the ART "D"/"G" letter).
    // Re-draw them so e.g. changing the gender of an unborn individual no longer wipes its "P".
    // Passing the current
    // status as the "old" status guarantees oldShapeType == newShapeType, so this never
    // recurses back into setGenderGraphics. Guarded on the hoverbox because during initial
    // construction it does not exist yet (drawLabels dereferences it) — the life-status shapes
    // are drawn by setLifeStatus once the node is fully built.
    if (this.getHoverBox() && !this._refreshingLifeStatus) {
      this.updateLifeStatusShapes(this.getNode().getLifeStatus());
      this.updateArtRoleLabel();
    }
  },

  /**
     * Draws the arrow shared by the proband and consultand markers, and returns it along with
     * the origin it was placed at, so a caller can position the "P" relative to it.
     *
     * @method _generateMarkerArrow
     * @return {Object} {icon: Raphael.el, x: Number, y: Number}
     * @private
     */
  _generateMarkerArrow: function() {
    var icon = editor.getPaper().path(editor.getView().__probandArrowPath).attr({fill: '#595959', stroke: 'none', opacity: 1});
    var x = this.getX()-this._shapeRadius-26;
    var y = this.getY()+this._shapeRadius-12;
    if (this.getNode().getGender() == 'F') {
      x += 5;
      y -= 5;
    }
    icon.transform(['t' , x, y]);
    return { icon: icon, x: x, y: y };
  },

  /**
     * Draws the proband marker: the arrow, plus the "P" that identifies it AS the proband.
     *
     * The "P" is not decoration. NSGC (Bennett et al. 2022 Figure 2, unchanged by the 2025
     * correction, and the 2008 guidelines before it) gives the arrow two meanings, told apart
     * only by the letter:
     *   arrow + "P"  = proband   — the affected family member who brought the family to attention
     *   arrow alone  = consultand — the individual seeking counseling
     * Drawing the arrow bare therefore says "consultand", which is not what this flag means.
     *
     * Returns a set so the caller can push both parts into the gender graphics at once — the
     * marker is regenerated with the symbol, so the two must live and die together.
     *
     * @method generateProbandArrow
     * @return {Raphael.st}
     */
  generateProbandArrow: function() {
    var arrow = this._generateMarkerArrow();
    // At the arrow's tail, outside the symbol: the arrow runs from its lower-left origin up
    // towards the symbol's corner, so this is the one spot that stays clear of both the symbol
    // and of the labels stacked underneath it.
    var label = editor.getPaper().text(arrow.x - 9, arrow.y + 33, 'P')
      .attr(PedigreeEditorParameters.attributes.probandLabel);
    return editor.getPaper().set(arrow.icon, label);
  },

  /**
     * Draws the consultand marker: the same arrow, WITHOUT the "P" — that absence is what
     * makes it say "consultand" rather than "proband" (see generateProbandArrow).
     *
     * @method generateConsultandArrow
     * @return {Raphael.el}
     */
  generateConsultandArrow: function() {
    return this._generateMarkerArrow().icon;
  },

  /**
     * Returns all graphical elements that are behind the gender graphics
     *
     * @method getBackElements
     * @return {Raphael.st}
     */
  getBackElements: function() {
    return this.getHoverBox().getBackElements().concat(editor.getPaper().set(this.getChildlessStatusLabel(), this.getChildlessShape()));
  },

  /**
     * Returns all graphical elements that should receive mouse focus/clicks
     *
     * @method getFrontElements
     * @return {Raphael.st}
     */
  getFrontElements: function() {
    return this.getHoverBox().getFrontElements();
  },

  /**
     * Tags a text label with what KIND of information it carries, so the SVG/PDF export can
     * redact by meaning rather than by appearance.
     *
     * The export used to select text to remove by FONT SIZE, which was wrong in both
     * directions: the external ID label is 18px so an MRN survived every privacy level, while
     * 20px is the shared `label` size so the SB/ECT annotation, AMAB/AFAB and the gender label
     * were stripped along with the name. Size is a styling decision; it must not decide what
     * counts as identifying information.
     *
     * @method _tagLabel
     * @param {Raphael.el} label
     * @param {String} className one of the PII_* classes read by PedigreeExport
     * @private
     */
  _tagLabel: function(label, className) {
    if (label && label.node) {
      label.node.setAttribute('class', className);
    }
    return label;
  },

  /**
     * Updates the external ID label for this Person
     *
     * @method updateExternalIDLabel
     */
  updateExternalIDLabel: function() {
    this._externalIDLabel && this._externalIDLabel.remove();

    if (this.getNode().getExternalID()) {
      var text = '[' + this.getNode().getExternalID() + ']';
      this._externalIDLabel = this._tagLabel(editor.getPaper().text(this.getX(), this.getY() + PedigreeEditorParameters.attributes.radius, text).attr(PedigreeEditorParameters.attributes.externalIDLabels), 'pii-external-id');
    } else {
      this._externalIDLabel = null;
    }
    this.drawLabels();
  },

  /**
     * Updates the candidate-gene text label shown below the symbol. Candidate genes used to tint the
     * symbol (a fill sector); per NSGC 2022/2025 the fill means phenotype, so the gene is shown as
     * text instead. The text is tinted with the gene's legend colour when there is a single gene, so
     * the "Candidate Genes" legend still reads as a colour key; multiple genes fall back to the
     * default label colour.
     *
     * @method updateGeneLabel
     */
  updateGeneLabel: function() {
    this._geneLabel && this._geneLabel.remove();
    var genes = this.getNode().getGenes();
    if (genes && genes.length) {
      var label = editor.getPaper().text(this.getX(), this.getY() + PedigreeEditorParameters.attributes.radius, genes.join(', '))
        .attr(PedigreeEditorParameters.attributes.geneLabels);
      if (genes.length == 1) {
        var color = editor.getGeneLegend().getObjectColor(genes[0]);
        if (color) { label.attr('fill', color); }
      }
      this._geneLabel = this._tagLabel(label, 'gene-label');
    } else {
      this._geneLabel = null;
    }
    this.drawLabels();
  },

  /**
     * Returns the Person's candidate-gene label.
     * @method getGeneLabel
     * @return {Raphael.el}
     */
  getGeneLabel: function() {
    return this._geneLabel;
  },

  /**
     * Updates the free-text genotype / variant annotation shown below the symbol (e.g.
     * "BRCA1 c.68_69del (+)"). This is the NSGC 2022/2025-recommended place for a specific
     * evaluation/variant result: text below the symbol, no "E" prefix (the E notation was retired).
     *
     * @method updateGenotypeLabel
     */
  updateGenotypeLabel: function() {
    this._genotypeLabel && this._genotypeLabel.remove();
    var genotype = this.getNode().getGenotype && this.getNode().getGenotype();
    if (genotype) {
      this._genotypeLabel = this._tagLabel(editor.getPaper().text(this.getX(), this.getY() + PedigreeEditorParameters.attributes.radius, genotype).attr(PedigreeEditorParameters.attributes.geneLabels), 'genotype');
    } else {
      this._genotypeLabel = null;
    }
    this.drawLabels();
  },

  /**
     * Returns the Person's genotype / variant label.
     * @method getGenotypeLabel
     * @return {Raphael.el}
     */
  getGenotypeLabel: function() {
    return this._genotypeLabel;
  },

  /**
     * Updates the sex-assigned-at-birth annotation (AMAB/AFAB/UAAB) shown below the symbol,
     * per the NSGC 2022 nomenclature update. The abbreviation itself is standard and shown
     * as-is (not localized). Absent when not recorded.
     *
     * @method updateSexLabel
     */
  updateSexLabel: function() {
    this._sexLabel && this._sexLabel.remove();

    var code = this.getNode().getAssignedSexAtBirth && this.getNode().getAssignedSexAtBirth();
    if (code) {
      this._sexLabel = editor.getPaper().text(this.getX(), this.getY() + PedigreeEditorParameters.attributes.radius, code).attr(PedigreeEditorParameters.attributes.label);
    } else {
      this._sexLabel = null;
    }
    this.drawLabels();
  },

  /**
     * Returns this Person's sex-assigned-at-birth annotation label.
     *
     * @method getSexLabel
     */
  getSexLabel: function() {
    return this._sexLabel;
  },

  /**
     * Updates the assisted-reproduction letter ("D" donor / "G" gestational carrier) drawn
     * INSIDE the symbol, per NSGC 2022 Figure 5 as corrected in 2025 (doi:10.1002/jgc4.2020).
     * The letters are standard nomenclature and are not localized.
     *
     * Unlike the sex-assigned-at-birth annotation this sits at the centre of the symbol, which
     * is the same slot the "P" pregnancy marker uses — they cannot collide, because a pregnancy
     * is never itself a donor or a carrier (the menu field is inactive for a fetus).
     *
     * @method updateArtRoleLabel
     */
  updateArtRoleLabel: function() {
    this._artRoleLabel && this._artRoleLabel.remove();

    var role = this.getNode().getArtRole && this.getNode().getArtRole();
    if (role) {
      this._artRoleLabel = editor.getPaper().text(this.getX(), this.getY(), role)
        .attr(PedigreeEditorParameters.attributes.artRoleShape);
      // The hoverbox does not exist yet while the node is still being constructed; the label is
      // re-drawn from setGenderGraphics once it does, so skipping the re-stacking here is safe.
      if (!editor.isUnsupportedBrowser() && this.getHoverBox()) {
        this._artRoleLabel.insertBefore(this.getHoverBox().getFrontElements());
      }
    } else {
      this._artRoleLabel = null;
    }
  },

  /**
     * Returns this Person's assisted-reproduction letter.
     *
     * @method getArtRoleLabel
     */
  getArtRoleLabel: function() {
    return this._artRoleLabel;
  },

  /**
     * Returns the Person's external ID label
     *
     * @method getExternalIDLabel
     * @return {Raphael.el}
     */
  getExternalIDLabel: function() {
    return this._externalIDLabel;
  },

  /**
     * Updates the name label for this Person
     *
     * @method updateNameLabel
     */
  updateNameLabel: function() {
    this._nameLabel && this._nameLabel.remove();
    // Order given/family name for the current locale (zh: family+given, no space).
    var text = I18n.formatName(this.getNode().getFirstName(), this.getNode().getLastName());

    this._nameLabel && this._nameLabel.remove();
    if(text.strip() != '') {
      this._nameLabel = this._tagLabel(editor.getPaper().text(this.getX(), this.getY() + PedigreeEditorParameters.attributes.radius, text).attr(PedigreeEditorParameters.attributes.nameLabels), 'pii-name');
    } else {
      this._nameLabel = null;
    }
    this.drawLabels();
  },

  /**
     * Returns the Person's name label
     *
     * @method getNameLabel
     * @return {Raphael.el}
     */
  getNameLabel: function() {
    return this._nameLabel;
  },

  /**
     * Returns colored blocks representing disorders
     *
     * @method getDisorderShapes
     * @return {Raphael.st} Set of disorder shapes
     */
  getDisorderShapes: function() {
    return this._disorderShapes;
  },

  /**
     * Displays the disorders currently registered for this node.
     *
     * @method updateDisorderShapes
     */
  updateDisorderShapes: function() {
    this._disorderShapes && this._disorderShapes.remove();
    this._removeDisorderClips();
    // F1c: one entry per disorder, carrying the legend colour AND the per-condition status.
    // 'affected' -> flat solid fill; 'carrier' -> solid fill + overlaid diagonal HATCH LINES of a
    // dark shade of the same colour (NSGC 2022 §4.5: the retired centre dot is replaced by a
    // per-subsection fill pattern, defined in the legend).
    var fills = this.getNode().getDisorders().map(function(d) {
      return {
        color: editor.getDisorderLegend().getObjectColor(d.uuid),
        status: d.status,
        pattern: editor.getDisorderLegend().getObjectPattern(d.uuid)   // per-disease fill pattern
      };
    });
    if (fills.length == 0) {
      return;
    }

    // NSGC pedigrees use flat solid fills, not gradients. The old dark->base linear
    // gradient washed the colour out and made adjacent condition colours hard to tell
    // apart (0.2 fill rework). Fill each sector with its flat legend colour.
    var disorderShapes = editor.getPaper().set();
    var clipIds = [];
    // NSGC 2022 §4.5 (fill-pattern scheme), so it reads even in BLACK & WHITE:
    //   every disease carries its own fill PATTERN (stripe angle) — so two DIFFERENT diseases are
    //   distinguishable by pattern regardless of state (fixes "two affected diseases look identical
    //   in B&W"). AFFECTED vs CARRIER of the SAME disease is told apart by the sector BACKGROUND:
    //     AFFECTED = the disease COLOUR behind the pattern (a shaded, filled subsection);
    //     CARRIER  = NO background fill (white) behind the same pattern.
    // Pattern is real clipped geometry (dark shade of the disease colour) so it survives SVG/PDF
    // export and shows on the white carrier fill and the coloured affected fill alike.
    var hatchSector = function(sectorEl, f) {
      var h = drawSectorHatch(editor.getPaper(), sectorEl, f.color, f.pattern, 'carrier');
      if (h) {
        for (var li = 0; li < h.lines.length; li++) {
          disorderShapes.push(h.lines[li]);
        }
        clipIds.push(h.clipId);
      }
    };
    var delta, color;
    var colors = fills;   // keep the loop bounds/reads below unchanged (length + per-index)

    if (this.getNode().getLifeStatus() == 'aborted' || this.getNode().getLifeStatus() == 'miscarriage' || this.getNode().getLifeStatus() == 'ectopic') {
      var radius = PedigreeEditorParameters.attributes.radius;
      if (this.getNode().isPersonGroup()) {
        radius *= PedigreeEditorParameters.attributes.groupNodesScale;
      }

      var side = radius * Math.sqrt(3.5),
        height = side/Math.sqrt(2),
        x1 = this.getX() - height,
        y1 = this.getY();
      delta = (height * 2)/(colors.length);

      for(var k = 0; k < colors.length; k++) {
        var corner = [];
        var x2 = x1 + delta;
        var y2 = this.getY() - (height - Math.abs(x2 - this.getX()));
        if (x1 < this.getX() && x2 >= this.getX()) {
          corner = ['L', this.getX(), this.getY()-height];
        }
        var slice = editor.getPaper().path(['M', x1, y1, corner,'L', x2, y2, 'L',this.getX(), this.getY(),'z']);
        // carrier subsection = NO colour behind the pattern (white); affected = a DEEPER shade of the
        // disease colour (the palette is pale, so a pale fill read too close to the white carrier).
        slice.attr({fill: (colors[k].status === 'carrier') ? '#ffffff' : darkenColor(colors[k].color, 0.7), 'stroke-width':.5, stroke: 'none' });
        disorderShapes.push(slice);
        hatchSector(slice, colors[k]);
        x1 = x2;
        y1 = y2;
      }
      if(this.getNode().isProband()) {
        disorderShapes.transform(['...s', 1.04, 1.04, this.getX(), this.getY()-this._shapeRadius]);
      }
    } else {
      var disorderAngle = (360/colors.length).round();
      delta = (360/(colors.length))/2;
      if (colors.length == 1 && this.getNode().getGender() == 'U') {
        delta -= 45;
      } // since this will be rotated by shape transform later

      var radius = (this._shapeRadius-0.6);    // -0.6 to avoid disorder fills to overlap with shape borders (due to aliasing/Raphael pixel layout)
      if (this.getNode().getGender() == 'U') {
        radius *= 1.155;
      }                     // TODO: magic number hack: due to a Raphael transform bug (?) just using correct this._shapeRadius does not work

      var sectorEls = [];
      for(var i = 0; i < colors.length; i++) {
        color = colors[i].color;
        // carrier subsection = NO colour behind the pattern (white); affected = a DEEPER shade of the
        // disease colour (the palette is pale, so a pale fill read too close to the white carrier).
        var bg = (colors[i].status === 'carrier') ? '#ffffff' : darkenColor(color, 0.7);
        var sec = sector(editor.getPaper(), this.getX(), this.getY(), radius,
          this.getNode().getGender(), i * disorderAngle, (i+1) * disorderAngle, bg);
        // Sector border between adjacent slices — applied HERE (per sector), not to the whole set,
        // so it can't overwrite the hatch line strokes added below.
        sec.attr(colors.length < 2 ? {stroke: 'none'} : {stroke: '#595959', 'stroke-width': .03});
        sectorEls.push(sec);
        disorderShapes.push(sec);
      }
      for(var j = 0; j < sectorEls.length; j++) {
        hatchSector(sectorEls[j], colors[j]);
      }
      if(this.getNode().isProband()) {
        disorderShapes.transform(['...s', 1.04, 1.04, this.getX(), this.getY()]);
      }
    }
    this._disorderShapes = disorderShapes;
    this._disorderClipIds = clipIds;
    this._disorderShapes.flatten().insertAfter(this.getGenderGraphics().flatten());
  },

  // Remove the per-carrier-sector clipPath <clipPath> elements this node added to <defs> on the
  // previous draw (the hatch lines themselves are Raphael elements removed with _disorderShapes).
  _removeDisorderClips: function() {
    if (!this._disorderClipIds || !this._disorderClipIds.length) {
      return;
    }
    var svg = editor.getPaper() && editor.getPaper().canvas;
    for (var i = 0; i < this._disorderClipIds.length; i++) {
      var el = svg && svg.querySelector && svg.querySelector('#' + this._disorderClipIds[i]);
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }
    this._disorderClipIds = null;
  },

  /**
     * Draws a line across the Person to display that he is dead (or aborted).
     *
     * @method drawDeadShape
     */
  drawDeadShape: function() {
    var strokeWidth = editor.getWorkspace().getSizeNormalizedToDefaultZoom(2.5);
    var x, y;
    // Both loss statuses drawn as a triangle need the slash scaled to the triangle; the branch
    // below sizes it for a square/circle.
    var status = this.getNode().getLifeStatus();
    if(status == 'aborted' || status == 'ectopic') {
      var side   = PedigreeEditorParameters.attributes.radius * Math.sqrt(3.5);
      var height = side/Math.sqrt(2);
      if (this.getNode().isPersonGroup()) {
        height *= PedigreeEditorParameters.attributes.groupNodesScale;
      }

      var x = this.getX() - height/1.5;
      if (this.getNode().isPersonGroup()) {
        x -= PedigreeEditorParameters.attributes.radius/4;
      }

      var y = this.getY() + height/3;
      this._deadShape = editor.getPaper().path(['M', x, y, 'l', height + height/3, -(height+ height/3), 'z']);
      this._deadShape.attr('stroke-width', strokeWidth);
    } else {
      x = this.getX();
      y = this.getY();
      var coeff = 10.0/8.0 * (this.getNode().isPersonGroup() ? PedigreeEditorParameters.attributes.groupNodesScale : 1.0);
      var x1 = x - coeff * PedigreeEditorParameters.attributes.radius,
        y1 = y + coeff * PedigreeEditorParameters.attributes.radius,
        x2 = x + coeff * PedigreeEditorParameters.attributes.radius,
        y2 = y - coeff * PedigreeEditorParameters.attributes.radius;
      this._deadShape = editor.getPaper().path(['M', x1,y1,'L',x2, y2]).attr('stroke-width', strokeWidth);
    }
    if(!editor.isUnsupportedBrowser()) {
      this._deadShape.toFront();
      this._deadShape.node.setAttribute('class', 'no-mouse-interaction');
    }
  },

  /**
     * Returns the line drawn across a dead Person's icon
     *
     * @method getDeadShape
     * @return {Raphael.st}
     */
  getDeadShape: function() {
    return this._deadShape;
  },

  /**
     * Returns this Person's age label
     *
     * @method getAgeLabel
     * @return {Raphael.el}
     */
  getAgeLabel: function() {
    return this._ageLabel;
  },

  /**
     * Updates the age label for this Person
     *
     * @method updateAgeLabel
     */
  updateAgeLabel: function() {
    var text,
      person = this.getNode();
    if (person.isFetus()) {
      var date = person.getGestationAge();
      text = (date) ? date + ' weeks' : null;
    } else if(person.getLifeStatus() == 'alive') {
      if (person.getBirthDate()) {
        var age = getAge(person.getBirthDate(), null);
        if (age.indexOf('day') != -1) {
          text = age;                                                                // 5 days
        } else if (age.indexOf(' y') == -1) {
          text = 'b. ' + person.getBirthDate().getFullYear() + ' (' + age + ')';     // b. 2014 (3 wk)
        } else {
          text = 'b. ' + person.getBirthDate().getFullYear();                        // b. 1972
        }
      }
    } else {
      if(person.getDeathDate() && person.getBirthDate()) {
        var age = getAge(person.getBirthDate(), person.getDeathDate());
        if (age.indexOf('day') != -1 || age.indexOf('wk') != -1 || age.indexOf('mo') != -1) {
          text = 'd. ' + person.getDeathDate().getFullYear() + ' (' + age + ')';
        } else {
          text = person.getBirthDate().getFullYear() + ' – ' + person.getDeathDate().getFullYear();
        }
      } else if (person.getDeathDate()) {
        text = 'd. ' + person.getDeathDate().getFullYear();
      } else if(person.getBirthDate()) {
        text = person.getBirthDate().getFullYear() + ' – ?';
      }
    }
    this.getAgeLabel() && this.getAgeLabel().remove();
    this._ageLabel = text ? this._tagLabel(editor.getPaper().text(this.getX(), this.getY(), text).attr(PedigreeEditorParameters.attributes.label), 'pii-age') : null;
    this.drawLabels();
  },

  /**
     * Returns the shape marking a Person's 'unborn' life-status
     *
     * @method getUnbornShape
     * @return {Raphael.el}
     */
  getUnbornShape: function() {
    return this._unbornShape;
  },

  /**
     * Draws a "P" on top of the node to display this Person's 'unborn' life-status
     *
     * @method drawUnbornShape
     */
  drawUnbornShape: function() {
    this._unbornShape && this._unbornShape.remove();
    if(this.getNode().getLifeStatus() == 'unborn') {
      this._unbornShape = editor.getPaper().text(this.getX(), this.getY(), 'P').attr(PedigreeEditorParameters.attributes.unbornShape);
      if(!editor.isUnsupportedBrowser()) {
        this._unbornShape.insertBefore(this.getHoverBox().getFrontElements());
      }
    } else {
      this._unbornShape = null;
    }
  },

  /**
     * Draws the evaluation status symbol for this Person
     *
     * @method updateEvaluationLabel
     */
  updateEvaluationLabel: function() {
    this._evalLabel && this._evalLabel.remove();
    if (this.getNode().getEvaluated()) {
      if (this.getNode().getLifeStatus() == 'aborted' || this.getNode().getLifeStatus() == 'miscarriage' || this.getNode().getLifeStatus() == 'ectopic') {
        var x = this.getX() + this._shapeRadius * 1.6;
        var y = this.getY() + this._shapeRadius * 0.6;
      } else {
        var mult = 1.1;
        if (this.getNode().getGender() == 'U') {
          mult = 1.3;
        } else if (this.getNode().getGender() == 'M') {
          mult = 1.4;
        }
        if (this.getNode().isProband) {
          mult *= 1.1;
        }
        var x = this.getX() + this._shapeRadius*mult - 5;
        var y = this.getY() + this._shapeRadius*mult;
      }
      this._evalLabel = editor.getPaper().text(x, y, '*').attr(PedigreeEditorParameters.attributes.evaluationShape).toBack();
    } else {
      this._evalLabel = null;
    }
  },

  /**
     * Returns this Person's evaluation label
     *
     * @method getEvaluationGraphics
     * @return {Raphael.el}
     */
  getEvaluationGraphics: function() {
    return this._evalLabel;
  },

  /**
     * Draws various distorder carrier graphics such as a dot (for carriers) or
     * a vertical line (for pre-symptomatic)
     *
     * @method updateCarrierGraphic
     */
  updateCarrierGraphic: function() {
    this._carrierGraphic && this._carrierGraphic.remove();

    // F1b: the only symbol-level carrier graphic left is the pre-symptomatic vertical line. The old
    // "carrier" centre dot is gone — carrier is a per-disorder state (drawn as a hatched sector,
    // F1c), not a whole-symbol mark. Driven by the boolean flag now, not the carrierStatus enum.
    if (!this.getNode().getPresymptomatic()) {
      this._carrierGraphic = null;
      return;
    }
    if (this.getNode().getLifeStatus() == 'aborted' || this.getNode().getLifeStatus() == 'miscarriage' || this.getNode().getLifeStatus() == 'ectopic') {
      this._carrierGraphic = null;
      return;
    }

    editor.getPaper().setStart();
    var startX = (this.getX()-PedigreeEditorParameters.attributes.presymptomaticShapeWidth/2);
    var startY = this.getY()-this._radius;
    editor.getPaper().rect(startX, startY, PedigreeEditorParameters.attributes.presymptomaticShapeWidth, this._radius*2).attr(PedigreeEditorParameters.attributes.presymptomaticShape);
    if (this.getNode().getGender() == 'U') {
      editor.getPaper().path('M '+startX + ' ' + startY +
                                       'L ' + (this.getX()) + ' ' + (this.getY()-this._radius*1.1) +
                                       'L ' + (startX + PedigreeEditorParameters.attributes.presymptomaticShapeWidth) + ' ' + (startY) + 'Z').attr(PedigreeEditorParameters.attributes.presymptomaticShape);
      var endY = this.getY()+this._radius;
      editor.getPaper().path('M '+startX + ' ' + endY +
                                       'L ' + (this.getX()) + ' ' + (this.getY()+this._radius*1.1) +
                                       'L ' + (startX + PedigreeEditorParameters.attributes.presymptomaticShapeWidth) + ' ' + endY + 'Z').attr(PedigreeEditorParameters.attributes.presymptomaticShape);
    }
    this._carrierGraphic = editor.getPaper().setFinish();

    if (editor.isReadOnlyMode()) {
      this._carrierGraphic.toFront();
    } else {
      this._carrierGraphic.insertBefore(this.getHoverBox().getFrontElements());
    }
  },

  /**
     * Returns this Person's disorder carrier graphics
     *
     * @method getCarrierGraphics
     * @return {Raphael.el}
     */
  getCarrierGraphics: function() {
    return this._carrierGraphic;
  },

  /**
     * Returns this Person's stillbirth label
     *
     * @method getSBLabel
     * @return {Raphael.el}
     */
  getSBLabel: function() {
    return this._stillBirthLabel;
  },

  /**
     * Updates the stillbirth label for this Person
     *
     * @method updateSBLabel
     */
  updateSBLabel: function() {
    this.getSBLabel() && this.getSBLabel().remove();
    // Same in-symbol label slot serves stillbirth ("SB") and ectopic pregnancy ("ECT").
    // The "ECT" abbreviation is the standard nomenclature and is not localized.
    var status = this.getNode().getLifeStatus();
    var text = (status == 'stillborn') ? I18n.t('SB') : (status == 'ectopic' ? 'ECT' : null);
    if (text) {
      this._stillBirthLabel = editor.getPaper().text(this.getX(), this.getY(), text).attr(PedigreeEditorParameters.attributes.label);
    } else {
      this._stillBirthLabel = null;
    }
    this.drawLabels();
  },

  /**
     * Returns this Person's comments label
     *
     * @method getCommentsLabel
     * @return {Raphael.el}
     */
  getCommentsLabel: function() {
    return this._commentsLabel;
  },

  /**
     * Updates the stillbirth label for this Person
     *
     * @method updateCommentsLabel
     */
  updateCommentsLabel: function() {
    this.getCommentsLabel() && this.getCommentsLabel().remove();
    if (this.getNode().getComments() != '') {
      var text = this.getNode().getComments(); //.replace(/\n/g, '<br />');
      this._commentsLabel = this._tagLabel(editor.getPaper().text(this.getX(), this.getY(), text).attr(PedigreeEditorParameters.attributes.commentLabel), 'pii-comment');
      this._commentsLabel.alignTop = true;
    } else {
      this._commentsLabel = null;
    }
    this.drawLabels();
  },

  /**
     * Displays the correct graphics to represent the current life status for this Person.
     *
     * @method updateLifeStatusShapes
     */
  updateLifeStatusShapes: function(oldStatus) {
    var status = this.getNode().getLifeStatus();

    // Clear the references as well as the drawings. Each branch below only re-draws the shapes
    // its own status needs, so a status that needs fewer of them (e.g. "alive") would otherwise
    // leave the accessors pointing at elements that are no longer on the canvas — and getShapes()
    // collects whatever they return into a live set.
    this.getDeadShape()   && this.getDeadShape().remove();
    this.getUnbornShape() && this.getUnbornShape().remove();
    this.getSBLabel()     && this.getSBLabel().remove();
    this._deadShape = null;
    this._unbornShape = null;
    this._stillBirthLabel = null;

    // save some redraws if possible
    var oldShapeType = (oldStatus == 'aborted' || oldStatus == 'miscarriage' || oldStatus == 'ectopic');
    var newShapeType = (status    == 'aborted' || status    == 'miscarriage' || status    == 'ectopic');
    if (oldShapeType != newShapeType) {
      // setGenderGraphics re-draws the life-status shapes on its own tail; suppress that here so
      // the shapes drawn just below aren't drawn a second time (the first copy would be orphaned
      // — e.g. drawDeadShape overwrites _deadShape without removing the earlier slash, leaving a
      // stray slash that survives a later revert to "alive").
      this._refreshingLifeStatus = true;
      try {
        this.setGenderGraphics();
      } finally {
        this._refreshingLifeStatus = false;
      }
    }

    if(status == 'deceased' || status == 'aborted') {  // but not "miscarriage"
      this.drawDeadShape();
    } else if (status == 'stillborn') {
      this.drawDeadShape();
      this.updateSBLabel();
    } else if (status == 'ectopic') {
      // Ectopic pregnancy: a triangle with a slash through it and an "ECT" label.
      //
      // The slash looks like it contradicts Bennett et al. 2022 Figure 4, which draws ECT without
      // one — but that omission was accidental and is retracted by the 2025 correction
      // (doi:10.1002/jgc4.2020): "the symbol for ectopic pregnancy was inconsistent with the 2008
      // guidelines; the forward slash was accidentally omitted." The corrected Figure 4 has it.
      this.drawDeadShape();
      this.updateSBLabel();
    } else if (status == 'unborn') {
      this.drawUnbornShape();
    }
    this.updateAgeLabel();
  },

  /**
     * Marks this node as hovered, and moves the labels out of the way
     *
     * @method setSelected
     */
  setSelected: function($super, isSelected) {
    $super(isSelected);
    if(isSelected) {
      this.shiftLabels();
    } else {
      this.unshiftLabels();
    }
  },

  /**
     * Moves the labels down to make space for the hoverbox
     *
     * @method shiftLabels
     */
  shiftLabels: function() {
    var shift  = this._labelSelectionOffset();
    var labels = this.getLabels();
    for(var i = 0; i<labels.length; i++) {
      labels[i].stop().animate({'y': labels[i].oy + shift}, 200,'>');
    }
  },

  /**
     * Animates the labels of this node to their original position under the node
     *
     * @method unshiftLabels
     */
  unshiftLabels: function() {
    var labels = this.getLabels();
    var firstLable = this._childlessStatusLabel ? 1 : 0;
    for(var i = 0; i<labels.length; i++) {
      labels[i].stop().animate({'y': labels[i].oy}, 200,'>');
    }
  },

  /**
     * Returns set of labels for this Person
     *
     * @method getLabels
     * @return {Raphael.st}
     */
  getLabels: function() {
    var labels = editor.getPaper().set();
    this.getSBLabel() && labels.push(this.getSBLabel());
    this.getNameLabel() && labels.push(this.getNameLabel());
    this.getAgeLabel() && labels.push(this.getAgeLabel());
    this.getSexLabel() && labels.push(this.getSexLabel());
    this.getExternalIDLabel() && labels.push(this.getExternalIDLabel());
    this.getGeneLabel() && labels.push(this.getGeneLabel());
    this.getGenotypeLabel() && labels.push(this.getGenotypeLabel());
    this.getCommentsLabel() && labels.push(this.getCommentsLabel());
    // NOTE: the assisted-reproduction "D"/"G" letter is deliberately NOT in this set. These labels
    // get re-stacked vertically below the symbol by drawLabels(); the ART letter belongs INSIDE the
    // symbol (drawn at the node centre), so it is carried by getAllGraphics() instead — alongside
    // the carrier dot and the evaluation "*", which are positioned the same way. (Putting it here
    // made a redraw/pan move the letter down into the label stack.)
    return labels;
  },

  /**
     * Displays all the appropriate labels for this Person in the correct layering order
     *
     * @method drawLabels
     */
  drawLabels: function() {
    // While a position-change animation is in flight the whole graphic set (labels included) is
    // being moved by an animated transform; repositioning labels now — which clears that transform
    // and re-anchors them — collides with the queued animation and lands them a move-delta off.
    // Defer: the animation's completion callback re-runs drawLabels once the move has settled.
    if (this._callback) {
      return;
    }
    var labels = this.getLabels();
    var selectionOffset = this._labelSelectionOffset();
    var childlessOffset = this.getChildlessStatusLabel() ? PedigreeEditorParameters.attributes.label['font-size'] : 0;
    childlessOffset += ((this.getNode().getChildlessStatus() !== null) ? (PedigreeEditorParameters.attributes.infertileMarkerHeight + 2) : 0);

    var lowerBound = PedigreeEditorParameters.attributes.radius * (this.getNode().isPersonGroup() ? PedigreeEditorParameters.attributes.groupNodesScale : 1.0);

    var startY = this.getY() + lowerBound * 1.8 + selectionOffset + childlessOffset;
    for (var i = 0; i < labels.length; i++) {
      // Position each label from scratch against the node's CURRENT centre. A node move (setPos)
      // translates its whole graphic set — labels included — via a relative transform; if that
      // transform is left on the label, this y assignment stacks on top of it (and getBBox() below
      // reads the transformed box, so the offset cascades to every later label). Clearing the
      // transform and re-anchoring x makes drawLabels the single source of truth for label position,
      // so labels always follow the node instead of drifting after a relayout.
      labels[i].transform('');
      labels[i].attr('x', this.getX());
      var offset = (labels[i].alignTop) ? (getElementHalfHeight(labels[i]) - 7) : 0;
      labels[i].attr('y', startY + offset);
      labels[i].oy = (labels[i].attr('y') - selectionOffset);
      startY = labels[i].getBBox().y2 + 11;
    }
    if(!editor.isUnsupportedBrowser()) {
      labels.flatten().insertBefore(this.getHoverBox().getFrontElements().flatten());
    }
  },

  _labelSelectionOffset: function() {
    var selectionOffset = this.isSelected() ? PedigreeEditorParameters.attributes.radius/1.4 : 0;

    if (this.isSelected() && this.getNode().isPersonGroup()) {
      selectionOffset += PedigreeEditorParameters.attributes.radius * (1-PedigreeEditorParameters.attributes.groupNodesScale) + 5;
    }

    if (this.getChildlessStatusLabel()) {
      selectionOffset = selectionOffset/2;
    }
    return selectionOffset;
  },

  /**
     * Returns set with the gender icon, disorder shapes and life status shapes.
     *
     * @method getShapes
     * @return {Raphael.st}
     */
  getShapes: function($super) {
    var lifeStatusShapes = editor.getPaper().set();
    this.getUnbornShape() && lifeStatusShapes.push(this.getUnbornShape());
    this.getChildlessShape() && lifeStatusShapes.push(this.getChildlessShape());
    this.getChildlessStatusLabel() && lifeStatusShapes.push(this.getChildlessStatusLabel());
    this.getDeadShape() && lifeStatusShapes.push(this.getDeadShape());
    return $super().concat(editor.getPaper().set(this.getDisorderShapes(), lifeStatusShapes));
  },

  /**
     * Returns all the graphics and labels associated with this Person.
     *
     * @method getAllGraphics
     * @return {Raphael.st}
     */
  getAllGraphics: function($super) {
    //console.log("Node " + this.getNode().getID() + " getAllGraphics");
    return $super().push(this.getHoverBox().getBackElements(), this.getLabels(), this.getCarrierGraphics(), this.getEvaluationGraphics(), this.getArtRoleLabel(), this.getHoverBox().getFrontElements());
  },

  /**
     * Changes the position of the node to (x,y)
     *
     * @method setPos
     * @param [$super]
     * @param {Number} x the x coordinate on the canvas
     * @param {Number} y the y coordinate on the canvas
     * @param {Boolean} animate set to true if you want to animate the transition
     * @param {Function} callback a function that will be called at the end of the animation
     */
  setPos: function($super, x, y, animate, callback) {
    var funct = callback;
    if(animate) {
      var me = this;
      this.getHoverBox().disable();
      funct = function () {
        me.getHoverBox().enable();
        callback && callback();
      };
    }
    $super(x, y, animate, funct);
  }
});

//ATTACHES CHILDLESS BEHAVIOR METHODS
PersonVisuals.addMethods(ChildlessBehaviorVisuals);

export default PersonVisuals;
