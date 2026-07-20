import PedigreeExport from 'pedigree/model/export';
import I18n from 'pedigree/i18n';

/**
 * The UI Element for exporting pedigrees
 *
 * @class ExportSelector
 */

var ExportSelector = Class.create( {

  initialize: function() {
    var _this = this;

    var mainDiv = new Element('div', {'class': 'import-selector'});

    var _addTypeOption = function (checked, labelText, value) {
      var optionWrapper = new Element('tr');
      var input = new Element('input', {'type' : 'radio', 'value': value, 'name': 'export-type'});
      input.observe('click', _this.disableEnableOptions );
      if (checked) {
        input.checked = true;
      }
      var label = new Element('label', {'class': 'import-type-label'}).insert(input).insert(labelText);
      optionWrapper.insert(label.wrap('td'));
      return optionWrapper;
    };
    var typeListElement = new Element('table');
    typeListElement.insert(_addTypeOption(true,  'PED', 'ped'));
    typeListElement.insert(_addTypeOption(false,  'GA4GH FHIR', 'GA4GH'));
    typeListElement.insert(_addTypeOption(false,  'SVG', 'svg'));
    typeListElement.insert(_addTypeOption(false,  'PDF', 'pdf'));

    var fileDownload = new Element('a', {'id': 'downloadLink', 'style': 'display:none'});
    mainDiv.insert(fileDownload);

    var promptType = new Element('div', {'class': 'import-section'}).update(I18n.t('Data format:'));
    var dataSection2 = new Element('div', {'class': 'import-block'});
    dataSection2.insert(promptType).insert(typeListElement);
    mainDiv.insert(dataSection2);

    var _addConfigOption = function (checked, name, cssClass, labelText, value) {
      var optionWrapper = new Element('tr');
      var input = new Element('input', {'type' : 'radio', 'value': value, 'name': name });
      if (checked) {
        input.checked = true;
      }
      var label = new Element('label', {'class': cssClass}).insert(input).insert(labelText);
      optionWrapper.insert(label.wrap('td'));
      return optionWrapper;
    };
    var configListElementPED = new Element('table', {'id': 'pedOptions'});
    var label = new Element('label', {'class': 'export-config-header'}).insert(I18n.t('Which of the following fields should be used to generate person IDs?'));
    configListElementPED.insert(label.wrap('td').wrap('tr'));
    configListElementPED.insert(_addConfigOption(true,  'ped-options', 'export-subconfig-label', I18n.t('External ID'), 'external'));
    configListElementPED.insert(_addConfigOption(false, 'ped-options', 'export-subconfig-label', I18n.t('Name'), 'name'));
    configListElementPED.insert(_addConfigOption(false, 'ped-options', 'export-subconfig-label', I18n.t('None, generate new numeric ID for everyone'), 'newid'));

    var configListElementPrivacy = new Element('table', {'id': 'privacyOptions', 'style': 'display:none'});
    var privLabel = new Element('label', {'class': 'export-config-header'}).insert(I18n.t('Privacy export options:'));
    configListElementPrivacy.insert(privLabel.wrap('td').wrap('tr'));
    configListElementPrivacy.insert(_addConfigOption(true,  'privacy-options', 'export-subconfig-label', I18n.t('All data'), 'all'));
    configListElementPrivacy.insert(_addConfigOption(false, 'privacy-options', 'export-subconfig-label', I18n.t('Remove personal information (name and age)'), 'nopersonal'));
    configListElementPrivacy.insert(_addConfigOption(false, 'privacy-options', 'export-subconfig-label', I18n.t('Remove personal information and free-form comments'), 'minimal'));

    var _addSelectOption = function (name, cssClass, labelText, options) {
      var optionWrapper = new Element('tr');
      var input = new Element('select', {'name': name });
      for (let op of options){
        input.insert(new Element('option', op.options).insert(op.label));
      }
      var label = new Element('label', {'class': cssClass}).insert(labelText).insert(input);
      optionWrapper.insert(label.wrap('td'));
      return optionWrapper;
    };

    var configListElementPDF = new Element('table', {'id': 'pdfOptions', 'style': 'display:none'});
    var pdfLabel = new Element('label', {'class': 'export-config-header'}).insert(I18n.t('PDF export options:'));
    configListElementPDF.insert(pdfLabel.wrap('td').wrap('tr'));
    configListElementPDF.insert(_addSelectOption('pdf-page-size', 'export-subconfig-label', I18n.t('Page Size '),
      [
        {label: 'A3', options: {value: 'A3'}},
        {label: 'A4', options: {value: 'A4', selected: true}},
        {label: 'A5', options: {value: 'A5'}},
        {label: 'Executive', options: {value: 'EXECUTIVE'}},
        {label: 'Legal', options: {value: 'LEGAL'}},
        {label: 'Letter', options: {value: 'LETTER'}},
        {label: 'Tabloid', options: {value: 'TABLOID'}}
      ]));
    configListElementPDF.insert(_addSelectOption('pdf-page-orientation', 'export-subconfig-label', I18n.t('Page Orientation '),
      [
        {label: I18n.t('Landscape'), options: {value: 'landscape', selected: true}},
        {label: I18n.t('Portrait'), options: {value: 'portrait'}}
      ]));
    configListElementPDF.insert(_addSelectOption('pdf-legend-pos', 'export-subconfig-label', I18n.t('Legend Position '),
      [
        {label: I18n.t('Top Left'), options: {value: 'TopLeft'}},
        {label: I18n.t('Top Right'), options: {value: 'TopRight', selected: true}},
        {label: I18n.t('Bottom Left'), options: {value: 'BottomLeft'}},
        {label: I18n.t('Bottom Right'), options: {value: 'BottomRight'}}
      ]));

    var promptConfig = new Element('div', {'class': 'import-section'}).update(I18n.t('Options:'));
    var dataSection3 = new Element('div', {'class': 'import-block'});
    dataSection3.insert(promptConfig).insert(configListElementPED).insert(configListElementPrivacy).insert(configListElementPDF);
    mainDiv.insert(dataSection3);

    var buttons = new Element('div', {'class' : 'buttons import-block-bottom'});
    buttons.insert(new Element('input', {type: 'button', name : 'export', 'value': I18n.t('Export'), 'class' : 'button', 'id': 'export_button'}).wrap('span', {'class' : 'buttonwrapper'}));
    buttons.insert(new Element('input', {type: 'button', name : 'cancel', 'value': I18n.t('Cancel'), 'class' : 'button secondary'}).wrap('span', {'class' : 'buttonwrapper'}));
    mainDiv.insert(buttons);

    var cancelButton = buttons.down('input[name="cancel"]');
    cancelButton.observe('click', function(event) {
      _this.hide();
    });
    var exportButton = buttons.down('input[name="export"]');
    exportButton.observe('click', function(event) {
      _this._onExportStarted();
    });

    var closeShortcut = ['Esc'];
    this.dialog = new PhenoTips.widgets.ModalPopup(mainDiv, {close: {method : this.hide.bind(this), keys : closeShortcut}}, {extraClassName: 'pedigree-import-chooser', title: I18n.t('Pedigree export'), displayCloseButton: true});
  },

  /*
     * Disables unapplicable options on input type selection
     */
  disableEnableOptions: function() {
    var exportType = $$('input:checked[type=radio][name="export-type"]')[0].value;

    var pedOptionsTable = $('pedOptions');
    var privacyOptionsTable = $('privacyOptions');
    var pdfOptionsTable = $('pdfOptions');

    if (exportType == 'ped') {
      pedOptionsTable.show();
      privacyOptionsTable.hide();
    } else {
      pedOptionsTable.hide();
      privacyOptionsTable.show();
    }
    if (exportType == 'pdf') {
      pdfOptionsTable.show();
    } else {
      pdfOptionsTable.hide();
    }
  },

  /**
     * Loads the template once it has been selected
     *
     * @param event
     * @param pictureBox
     * @private
     */
  /**
   * A filename stem unique to THIS pedigree, so exporting a second family does not silently
   * overwrite the first (both used to default to "open-pedigree.*"). Derived from the desktop
   * document title, else the proband's name, else the generic fallback. Sanitised for all OSes.
   * @private
   */
  _exportFileBase: function() {
    var base = '';
    try {
      var s = window.__ped_desktop && window.__ped_desktop.session;
      if (s && s.activeTitle) { base = String(s.activeTitle); }
    } catch (e) { /* web build: no desktop session */ }
    if (!base) {
      try {
        var pid = editor.getGraph().getProbandId();
        var node = pid != null ? editor.getView().getNode(pid) : null;
        if (node) {
          var fn = node.getFirstName ? (node.getFirstName() || '') : '';
          var ln = node.getLastName ? (node.getLastName() || '') : '';
          base = (fn + ' ' + ln).trim();
        }
      } catch (e) { /* no usable proband */ }
    }
    // Drop control characters (0x00–0x1F) without a control-char regex (eslint no-control-regex).
    base = base.split('').filter(function(ch) { return ch.charCodeAt(0) >= 32; }).join('');
    // strip path separators / reserved chars, collapse whitespace, trim underscores + trailing dots
    base = base.replace(/[\\/:*?\"<>|]+/g, '_')
      .replace(/\s+/g, '_').replace(/_+/g, '_')
      .replace(/^[_.]+|[_.]+$/g, '');   // Windows also rejects trailing dots
    // Windows reserves device names (CON, PRN, AUX, NUL, COM1–9, LPT1–9, incl. the ¹²³ superscript
    // variants) even WITH an extension, and treats the segment before the FIRST dot as the name — so
    // "CON.report" -> "CON.report.pdf" is still reserved. Test that stem and prefix "_" if it matches.
    var stem = base.split('.')[0];
    if (/^(con|prn|aux|nul|conin\$|conout\$|com[0-9¹²³]|lpt[0-9¹²³])$/i.test(stem)) { base = '_' + base; }
    if (!base) { base = 'open-pedigree'; }
    return base.slice(0, 80);
  },

  _onExportStarted: function() {
    this.hide();

    var exportType = $$('input:checked[type=radio][name="export-type"]')[0].value;
    var fileBase = this._exportFileBase();

    if (exportType == 'ped') {
      var idGenerationSetting = $$('input:checked[type=radio][name="ped-options"]')[0].value;
      var exportString = PedigreeExport.exportAsPED(editor.getGraph().DG, idGenerationSetting);
      var fileName = fileBase + '.ped';
      var mimeType = 'text/plain';
      // Uses FileSaver global
      /* eslint-disable no-undef */
      saveTextAs(exportString, fileName);
    } else {
      var privacySetting = $$('input:checked[type=radio][name="privacy-options"]')[0].value;
      if (exportType == 'GA4GH') {
        var exportString = PedigreeExport.exportAsGA4GH(editor.getGraph().DG, privacySetting);
        var fileName = fileBase + '-GA4GH-fhir.json';
        var mimeType = 'application/fhir+json';
        // Uses FileSaver global
        /* eslint-disable no-undef */
        saveTextAs(exportString, fileName);
      } else if (exportType == 'svg') {
        var exportString = PedigreeExport.exportAsSVG(editor.getGraph().DG, privacySetting);
        var fileName = fileBase + '.svg';
        var mimeType = 'image/svg+xml';
        saveTextAs(exportString, fileName);
      } else if (exportType == 'pdf') {
        var pageSize = $$('select[name="pdf-page-size"]')[0].value;
        var layout = $$('select[name="pdf-page-orientation"]')[0].value;
        var legendPos = $$('select[name="pdf-legend-pos"]')[0].value;
        // exportAsPDF is async (it lazily fetches the embedded CJK font before building).
        PedigreeExport.exportAsPDF(editor.getGraph().DG, privacySetting, pageSize, layout, legendPos, fileBase + '.pdf')
          .catch(function(e) {
            console.error('PDF export failed', e);
            alert(I18n.t('PDF export failed: ') + (e && e.message || e));
          });
      }
    }
  },

  /**
     * Displays the template selector
     *
     * @method show
     */
  show: function() {
    this.dialog.show();
  },

  /**
     * Removes the the template selector
     *
     * @method hide
     */
  hide: function() {
    this.dialog.closeDialog();
  }
});

export default ExportSelector;
