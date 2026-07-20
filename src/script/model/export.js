import PDFDocument from 'vendor/pdfkit/pdfkit.standalone';
import SVGtoPDF from 'vendor/pdfkit/svg-to-pdfkit';
import blobStream from 'vendor/pdfkit/blob-stream';
import GA4GHFHIRConverter from 'pedigree/GA4GHFHIRConverter';
import { darkenColor, hatchSpecs } from 'pedigree/view/graphicHelpers';

var PedigreeExport = function () {
};

PedigreeExport.prototype = {
};

// The 14 standard PDF fonts (Helvetica etc.) have no CJK glyphs, so Chinese names/terms
// come out blank in exported PDFs. We lazily fetch a bundled Noto Sans SC font and embed it
// (PDFKit subsets it, so the output stays small). The desktop shell serves it over the
// privileged opdata:// scheme; on the web it's a best-effort relative fetch that degrades to
// no-CJK if the font isn't present.
var PDF_CJK_FONT = 'NotoSansSC';
var _cjkFontPromise = null;
function loadCJKFont() {
  if (_cjkFontPromise) { return _cjkFontPromise; }
  var isDesktop = typeof window !== 'undefined' && window.openPedigreeDesktop && window.openPedigreeDesktop.isDesktop;
  var url = isDesktop ? 'opdata://fonts/sc' : 'vendor/fonts/NotoSansSC-Regular.ttf';
  _cjkFontPromise = fetch(url).then(function (r) {
    if (!r.ok) { throw new Error('font HTTP ' + r.status); }
    return r.arrayBuffer();
  }).catch(function (e) {
    console.warn('CJK font unavailable; PDF export will lack Chinese glyphs:', e && e.message || e);
    return null;
  });
  return _cjkFontPromise;
}

//===============================================================================================

/*
 *  PED format:
 *  (from http://pngu.mgh.harvard.edu/~purcell/plink/data.shtml#ped)
 *   Family ID
 *   Individual ID
 *   Paternal ID
 *   Maternal ID
 *   Sex (1=male; 2=female; other=unknown)
 *   Phenotype
 *
 *   Phenotype, by default, should be coded as:
 *      -9 missing
 *       0 missing
 *       1 unaffected
 *       2 affected
 */
/*
 * PED affection column (-9 missing, 1 unaffected, 2 affected) from a person's stored properties.
 * Tolerates the F1b per-condition model and the legacy carrierStatus model — see exportAsPED.
 */
PedigreeExport._pedAffection = function(props) {
  var disorders = Array.isArray(props.disorders) ? props.disorders : [];
  var objDisorders = disorders.filter(function(d) { return d && typeof d === 'object'; });
  var cs = props.carrierStatus;

  var affected, knownStatus;
  if (objDisorders.length > 0) {
    // new model: status lives on each disorder
    affected = objDisorders.some(function(d) { return d.status === 'affected'; });
    knownStatus = true;
  } else if (disorders.length > 0) {
    // legacy: a listed (string-id) disorder means affected, unless flagged a plain carrier/presym
    affected = (cs !== 'carrier' && cs !== 'presymptomatic');
    knownStatus = true;
  } else {
    // no disorders: affected only if the legacy enum said so; carrier/presym are a known status
    affected = (cs === 'affected');
    knownStatus = props.presymptomatic || cs === 'carrier' || cs === 'presymptomatic' || cs === 'affected';
  }

  if (affected) {
    return 2;
  }
  return knownStatus ? 1 : -9;
};

PedigreeExport.exportAsPED = function(pedigree, idGenerationPreference) {
  var output = '';

  var familyID = 'OPENPED';

  var idToPedId = PedigreeExport.createNewIDs(pedigree, idGenerationPreference);

  for (var i = 0; i <= pedigree.GG.getMaxRealVertexId(); i++) {
    if (!pedigree.GG.isPerson(i)) {
      continue;
    }

    output += familyID + ' ' + idToPedId[i] + ' ';

    // mother & father
    var parents = pedigree.GG.getParents(i);
    if (parents.length > 0) {
      var father = parents[0];
      var mother = parents[1];

      // The father/mother columns and the sex column have to agree — whoever is named as the
      // father must be male in their own row, or the file contradicts itself and plink rejects
      // it. So both are decided by the same rule, not by `gender` here and by sex-at-birth
      // below (which, for a trans parent, disagree).
      if ( PedigreeExport.pedSex(pedigree.GG.properties[parents[0]]) == 2 ||
                PedigreeExport.pedSex(pedigree.GG.properties[parents[1]]) == 1 ) {
        father = parents[1];
        mother = parents[0];
      }
      output += idToPedId[father] + ' ' + idToPedId[mother] + ' ';
    } else {
      output += '0 0 ';
    }

    output += (PedigreeExport.pedSex(pedigree.GG.properties[i]) + ' ');

    // F1b: affection comes from the per-condition model. Any disorder with status 'affected' makes
    // the individual affected (2). A pure carrier or a pre-symptomatic individual counts as
    // unaffected (1) — PED has no carrier slot (design §6/§8). No disorder and not pre-symptomatic
    // leaves the status unknown/missing (-9).
    //
    // Tolerates BOTH property shapes: the migrated new model ({uuid,name,status} disorders +
    // presymptomatic bool) and the legacy one (string-id disorders + a carrierStatus enum), because
    // these stored properties are not guaranteed to have been through the VersionUpdater on every
    // path (e.g. a graph loaded straight via fromJSON).
    var props = pedigree.GG.properties[i];
    var status = PedigreeExport._pedAffection(props);
    output += status + '\n';
  }

  return output;
};

/* ===============================================================================================
 *
 * Creates and returns a JSON in the "GA4GH FHIR JSON" format
 *
 * ===============================================================================================
 */

PedigreeExport.exportAsGA4GH = function(pedigree, privacySetting = "all", fhirPatientReference = null,
  pedigreeImage = null){
  return GA4GHFHIRConverter.exportAsFHIR(pedigree, privacySetting, fhirPatientReference, pedigreeImage);
};

// ===============================================================================================

PedigreeExport.exportAsSVG = function(pedigree, privacySetting = 'all') {
  var image = $('canvas');
  var background = image.getElementsByClassName('panning-background')[0];
  var backgroundPosition = background.nextSibling;
  var backgroundParent = background.parentNode;
  backgroundParent.removeChild(background);
  var bbox = image.down().getBBox();
  var pedigreeImage = image.innerHTML
    .replace(/xmlns:xlink=".*?"/, '')
    .replace(/width=".*?"/, '')
    .replace(/height=".*?"/, '')
    .replace(/viewBox=".*?"/, 'viewBox="' + bbox.x + ' ' + bbox.y + ' ' + bbox.width + ' ' + bbox.height + '" width="' + bbox.width + '" height="' + bbox.height + '" xmlns:xlink="http://www.w3.org/1999/xlink"');
  var context = window.location.href.replace(/&/g, '&amp;');
  pedigreeImage = pedigreeImage.split(context).join('');

  backgroundParent.insertBefore(background, backgroundPosition);

  const parser = new DOMParser();
  const dom = parser.parseFromString(pedigreeImage, 'application/xml');

  function removeHiddenNodes(domNode) {
    let toRemove = [];
    for (let childNode of domNode.childNodes) {
      if (childNode.style && 'none' === childNode.style.display){
        toRemove.push(childNode);
      }
      else if (childNode.style && '0' == childNode.style.opacity && '0' == childNode.style.fillOpacity){
        toRemove.push(childNode);
      }
      else {
        removeHiddenNodes(childNode);
      }
    }
    for (let childNode of toRemove){
      domNode.removeChild(childNode);
    }
  }
  // Redact by what a label MEANS, not by how big it is. personVisuals tags each label with a
  // pii-* class; anything untagged is clinical content and always survives.
  //
  // This used to select by font size — remove '20px' for names, '19px' for comments — which
  // leaked and over-removed at the same time: the external ID label is 18px, so an MRN (more
  // identifying than a name) survived every level including "minimal", while 20px is the
  // shared `label` size, so the SB/ECT annotation, AMAB/AFAB and the gender label were
  // stripped along with the name.
  function redact(dom, classNames) {
    let toRemove = [];
    for (let textNode of dom.getElementsByTagName('text')){
      const classes = (textNode.getAttribute('class') || '').split(/\s+/);
      if (classNames.some((c) => classes.indexOf(c) !== -1)){
        toRemove.push(textNode);
      }
    }
    for (let childNode of toRemove){
      childNode.parentNode.removeChild(childNode);
    }
  }

  removeHiddenNodes(dom.getRootNode());
  // 'nopersonal' — "Remove personal information (name and age)". The external ID goes too: it
  // is an identifier (typically an MRN), which is the most identifying field on the symbol.
  if (privacySetting !== 'all' ){
    redact(dom, ['pii-name', 'pii-age', 'pii-external-id']);
  }
  // 'minimal' — "...and free-form comments".
  if (privacySetting === 'minimal'){
    redact(dom, ['pii-comment']);
  }

  const serializer = new XMLSerializer();
  return serializer.serializeToString(dom);
}



PedigreeExport.exportAsPDF = async function(pedigree, privacySetting = 'all', pageSize = 'A4', layout = 'landscape', legendPos = 'TopRight', fileName = 'open-pedigree.pdf'){
  var pedigreeImage = PedigreeExport.exportAsSVG(pedigree, privacySetting);
  var cjkFont = await loadCJKFont();

  let legend = [];
  let itemCount = 0;
  let container = document.getElementById('legend-container');
  let rgbRegex =/^rgb\(([0-9]+), ?([0-9]+), ?([0-9]+)\)$/;
  for (let c of container.childNodes){
    if (c.tagName !== 'DIV'){
      continue;
    }
    if (c.style && c.style.display === 'none'){
      continue;
    }

    let h2Array = c.getElementsByTagName('H2');
    let legendSection = {
      heading: '',
      items: []
    };
    legend.push(legendSection);
    let colour = null;
    let name = null;
    let cases = null;

    if (h2Array){
      legendSection.heading = h2Array[0].textContent;
    }
    // Only real legend rows (li.disorder). The fill-key rows (li under .fill-key) are handled
    // once, below, as an explicit "solid = affected / hatched = carrier" key.
    for (let li of c.querySelectorAll('li.disorder')){
      let fill = 'solid';
      let pattern = null;
      let colourArray = li.getElementsByClassName('disorder-color');
      if (colourArray && colourArray.length){
        let swatch = colourArray[0];
        // Prefer the robust data-* hints set by the legend; fall back to the computed style.
        fill = swatch.getAttribute('data-fill') || 'solid';
        pattern = swatch.getAttribute('data-pattern');   // the disease's fill-pattern style, if any
        colour = swatch.getAttribute('data-color') || swatch.style.backgroundColor;
        if (colour && colour.startsWith('rgb(')){
          let colourSplit = rgbRegex.exec(colour);
          if (colourSplit != null){
            colour = '#' + parseInt(colourSplit[1]).toString(16) + parseInt(colourSplit[2]).toString(16) + parseInt(colourSplit[3]).toString(16);
          }
        }
      }
      let nameArray = li.getElementsByClassName('disorder-name');
      if (nameArray && nameArray.length){
        name = nameArray[0].textContent;
      }
      let casesArray = li.getElementsByClassName('disorder-cases');
      if (casesArray && casesArray.length){
        cases = casesArray[0].textContent;
      }

      legendSection.items.push({colour: colour, name: name, cases: cases, fill: fill, pattern: pattern});
      itemCount++;
    }
    // A "fill key" for the disorder legend so the print defines the fill convention (NSGC). Only
    // the disorder legend has a .fill-key block, which distinguishes it from gene/HPO legends.
    let fkLis = c.querySelectorAll('.fill-key li');
    if (fkLis && fkLis.length >= 2 && legendSection.items.length){
      legendSection.fillKey = {
        affected: fkLis[0].textContent.trim(),
        carrier: fkLis[1].textContent.trim()
      };
      itemCount += 2;
    }
  }


  let compress = false;
  let doc = new PDFDocument({compress: compress, size: pageSize, layout: layout});

  // Embed the CJK font and make it the default so legend text (doc.text) renders Chinese.
  // Noto Sans SC also covers Latin, so Latin names still look right. If the font failed to
  // load we leave the standard font and fall back to the previous (no-CJK) behaviour.
  if (cjkFont) {
    try {
      doc.registerFont(PDF_CJK_FONT, cjkFont);
      doc.font(PDF_CJK_FONT);
    } catch (e) {
      console.warn('Could not embed CJK font in PDF:', e && e.message || e);
      cjkFont = null;
    }
  }

  let stream = doc.pipe(blobStream());
  stream.on('finish', function () {
    let blob = stream.toBlob('application/pdf');
    saveAs(blob, fileName);
    //   // if (navigator.msSaveOrOpenBlob) {
    //   //   navigator.msSaveOrOpenBlob(blob, 'open-pedigree.pdf');
    //   // } else {
    //   //   alert("Don't know how to save to pdf in ie9")
    //   //   console.log("Don't know how to save in ie9");
    //   // }
  });
  let headingCount = legend.length;

  // work out max width for text
  let maxWidth = 0;
  doc.save();
  for (let cat of legend){
    doc.fontSize(14);
    const hw = doc.widthOfString(cat.heading);
    if (hw > maxWidth){
      maxWidth = hw;
    }
    for (let item of cat.items) {
      doc.fontSize(10);
      const w = doc.widthOfString(item.name + ' (' + item.cases + ')');
      if (w > maxWidth) {
        maxWidth = w;
      }
    }
  }
  doc.restore();

  // Legend layout metrics. Headings are 14pt, items 10pt. The heading needs more vertical
  // advance than an item line (headingLineHeight > itemLineHeight); when they were equal the
  // first item's colour swatch was drawn on top of the heading's descenders. The swatch is
  // vertically centred within its item line, and item text is indented past the swatch.
  let swatchSize = 8;
  let textIndent = swatchSize + 4;   // swatch width + gap before the name
  let rightMargin = 10;              // keep the widest line off the page edge
  let itemLineHeight = 14;
  let headingLineHeight = 18;
  let catGap = 6;                    // extra breathing room between categories
  let legendHeight = (headingCount * headingLineHeight) + (itemCount * itemLineHeight) + (headingCount * catGap) + 10;
  let rightXOffset = doc.page.width - (textIndent + rightMargin + maxWidth);
  let xOffset = 5;
  let yOffset = doc.page.height - legendHeight;
  let pedigreeXOffset = 5;
  let pedigreeYOffset = legendHeight;
  let pedigreeWidth = doc.page.width - 10;
  let pedigreeHeight = Math.max(doc.page.height - legendHeight, doc.page.height * 0.6);

  if (legendPos === 'TopLeft') {
    // easy one.
    xOffset = 5;
    yOffset = 5;
    pedigreeYOffset = legendHeight;
  } else if (legendPos === 'BottomLeft') {
    xOffset = 5;
    yOffset = doc.page.height - legendHeight;
    pedigreeYOffset = 5;
  } else if (legendPos === 'BottomRight') {
    xOffset = rightXOffset;
    yOffset = doc.page.height - legendHeight;
    pedigreeYOffset = 5;
  } else {
    // 'TopRight' default
    xOffset = rightXOffset;
    yOffset = 5;
    pedigreeYOffset = legendHeight;
  }


  // Draw a legend swatch: a SOLID colour square overlaid with the disease's fill PATTERN, using the
  // SAME hatchSpecs geometry as the canvas + on-screen legend swatch (so all three agree). `style` =
  // the disease pattern (null -> plain solid); `kind` = 'carrier' (dense) or 'affected' (sparse).
  // The solid base means the colour still reads if the pattern is ever faint.
  let drawSwatch = function(x, y, colour, style, kind){
    doc.save();
    doc.rect(x, y, swatchSize, swatchSize).fill(colour, 1);
    doc.restore();
    if (style){
      doc.save();
      doc.rect(x, y, swatchSize, swatchSize).clip();
      let dark = darkenColor(colour, 0.42);
      let step = (kind === 'affected') ? swatchSize * 0.5 : swatchSize * 0.28;
      // 'dots' spacing is multiplied ~2.4x inside hatchSpecs; at this tiny swatch (8pt) that would
      // leave both densities with a single dot. Use a finer base step for dots so carrier stays
      // visibly denser than affected here too.
      if (style === 'dots') { step = (kind === 'affected') ? swatchSize * 0.20 : swatchSize * 0.12; }
      let specs = hatchSpecs(x, y, swatchSize, swatchSize, style, step);
      if (style === 'dots'){
        doc.fillColor(dark);
        for (let s of specs){ if (s[0] === 'dot'){ doc.circle(s[1], s[2], Math.max(0.4, s[3])).fill(); } }
      } else {
        doc.lineWidth((kind === 'affected') ? 0.5 : 0.9).strokeColor(dark);
        for (let s of specs){ if (s[0] === 'line'){ doc.moveTo(s[1], s[2]).lineTo(s[3], s[4]); } }
        doc.stroke();
      }
      doc.restore();                                   // drop the clip
    }
    doc.save();
    doc.lineWidth(0.4).strokeColor('#555555').rect(x, y, swatchSize, swatchSize).stroke();
    doc.restore();
  };

  for (let cat of legend){
    doc.save();
    doc.fontSize(14);
    doc.text(cat.heading, xOffset, yOffset, {lineBreak: false});
    yOffset += headingLineHeight;
    if (cat.fillKey){
      // Same pattern for both; affected = a DEEP colour behind it, carrier = white behind it.
      doc.fontSize(9);
      drawSwatch(xOffset, yOffset + (itemLineHeight - swatchSize) / 2, darkenColor('#9aa0a6', 0.7), 'diag-fwd', 'carrier');   // deep colour + pattern
      doc.fillColor('#000000').text(cat.fillKey.affected, xOffset + textIndent, yOffset + (itemLineHeight - 9) / 2, {lineBreak: false});
      yOffset += itemLineHeight;
      drawSwatch(xOffset, yOffset + (itemLineHeight - swatchSize) / 2, '#ffffff', 'diag-fwd', 'carrier');   // white + pattern
      doc.fillColor('#000000').text(cat.fillKey.carrier, xOffset + textIndent, yOffset + (itemLineHeight - 9) / 2, {lineBreak: false});
      yOffset += itemLineHeight;
    }
    for (let item of cat.items){
      // Every disease has a pattern now; the disease-row swatch shows its colour + pattern.
      drawSwatch(xOffset, yOffset + (itemLineHeight - swatchSize) / 2, item.colour, item.pattern, 'carrier');
      doc.fontSize(10);
      doc.fillColor('#000000').text(item.name + ' (' + item.cases + ')', xOffset + textIndent, yOffset + (itemLineHeight - 10) / 2, {lineBreak: false});
      yOffset += itemLineHeight;
    }
    yOffset += catGap;
    doc.restore();
  }

  let options = {
    warningCallback: (str)=>console.error(str),
    useCSS: false,
    assumePt: false,
    preserveAspectRatio: 'xMidYMid meet',
    // use at least 60% of height for image, this may overwrite the legend.
    height: pedigreeHeight,
    width: pedigreeWidth
  };
  // Render the pedigree SVG's text (names, comments, labels) with the embedded CJK font too.
  if (cjkFont) {
    options.fontCallback = function() { return PDF_CJK_FONT; };
  }

  SVGtoPDF(doc, pedigreeImage, pedigreeXOffset, pedigreeYOffset, options);
  doc.end();
  // doc.write('open-pedigree.pdf');
  return doc;
};


// ===============================================================================================

// TODO: convert internal properties to match public names and rename this to "supportedProperties"
PedigreeExport.internalToJSONPropertyMapping = {
  'proband':       'proband',
  'fName':         'firstName',
  'lName':         'lastName',
  'comments':      'comments',
  'twinGroup':     'twinGroup',
  'monozygotic':   'monozygotic',
  'isAdopted':     'adoptedIn',
  'evaluated':     'evaluated',
  'dob':           'birthDate',
  'dod':           'deathDate',
  'gestationAge':  'gestationAge',
  'lifeStatus':    'lifeStatus',
  'disorders':     'disorders',
  'ethnicities':   'ethnicities',
  'carrierStatus': 'carrierStatus',
  'externalID':    'externalId',
  'gender':        'sex',
  'numPersons':    'numPersons',
  'hpoTerms':      'hpoTerms',
  'candidateGenes':'candidateGenes',
  'genotype':      'genotype',
  'lostContact':   'lostContact'
};

/*
 * Converts property name from external JSON format to internal - also helps to
 * support aliases for some terms and weed out unsupported terms.
 */
PedigreeExport.convertProperty = function(internalPropertyName, value) {

  if (!PedigreeExport.internalToJSONPropertyMapping.hasOwnProperty(internalPropertyName)) {
    return null;
  }

  var externalPropertyName = PedigreeExport.internalToJSONPropertyMapping[internalPropertyName];

  if (externalPropertyName == 'sex') {
    if (value == 'M') {
      value = 'male';
    } else if (value == 'F') {
      value = 'female';
    } else {
      value = 'unknown';
    }
  }

  return {'propertyName': externalPropertyName, 'value': value };
};

/**
 * The PED sex column: 1 = male, 2 = female, 3 = unknown.
 *
 * PED wants biological sex for genetic analysis, but per the NSGC 2022 update the symbol on the
 * chart is gender identity, so prefer the recorded sex assigned at birth when there is one and
 * only fall back to the symbol when there is not. Callers must use this for the father/mother
 * columns as well — the two have to agree.
 */
PedigreeExport.pedSex = function(properties) {
  var assignedSex = properties['assignedSexAtBirth'];
  if (assignedSex == 'AMAB') {
    return 1;
  }
  if (assignedSex == 'AFAB') {
    return 2;
  }
  if (assignedSex == 'UAAB') {
    return 3;   // recorded as unknown at birth: fall back to the symbol and we would invent one
  }
  if (properties['gender'] == 'M') {
    return 1;
  }
  if (properties['gender'] == 'F') {
    return 2;
  }
  return 3;
};

PedigreeExport.createNewIDs = function(pedigree, idGenerationPreference, maxLength) {
  var idToNewId = {};
  // Prototype-free: an id of "__proto__" (from a person named that) is not an ordinary key on a
  // plain object — `usedIDs['__proto__'] = true` is silently dropped and hasOwnProperty then
  // reports it as free forever, so two people exported with the same id and the resulting PED
  // declared a child to be its own father.
  var usedIDs   = Object.create(null);

  var nextUnusedID = 1;

  for (var i = 0; i <= pedigree.GG.getMaxRealVertexId(); i++) {
    if (!pedigree.GG.isPerson(i)) {
      continue;
    }

    var id = nextUnusedID++;
    if (idGenerationPreference == 'external' && pedigree.GG.properties[i].hasOwnProperty('externalID')) {
      nextUnusedID--;
      id = pedigree.GG.properties[i]['externalID'].replace(/\s/g, '_');
    } else if (idGenerationPreference == 'name' && pedigree.GG.properties[i].hasOwnProperty('fName')) {
      nextUnusedID--;
      id = pedigree.GG.properties[i]['fName'].replace(/\s/g, '_');
    }
    if (maxLength && id.length > maxLength) {
      id = id.substring(0, maxLength);
    }
    while ( id in usedIDs ) {
      if (!maxLength || id.length < maxLength) {
        id = '_' + id;
      } else {
        id = nextUnusedID++;
      }
    }

    idToNewId[i] = id;
    usedIDs[id]  = true;
  }

  return idToNewId;
};

export default PedigreeExport;
