import PDFDocument from 'vendor/pdfkit/pdfkit.standalone';
import SVGtoPDF from 'vendor/pdfkit/svg-to-pdfkit';
import blobStream from 'vendor/pdfkit/blob-stream';
import GA4GHFHIRConverter from 'pedigree/GA4GHFHIRConverter';

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

    var status = -9; //missing
    if (pedigree.GG.properties[i].hasOwnProperty('carrierStatus')) {
      if (pedigree.GG.properties[i]['carrierStatus'] == 'affected' ||
               pedigree.GG.properties[i]['carrierStatus'] == 'carrier'  ||
               pedigree.GG.properties[i]['carrierStatus'] == 'presymptomatic') {
        status = 2;
      } else {
        status = 1;
      }
    }
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



PedigreeExport.exportAsPDF = async function(pedigree, privacySetting = 'all', pageSize = 'A4', layout = 'landscape', legendPos = 'TopRight'){
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
    for (let li of c.getElementsByTagName('li')){
      let colourArray = li.getElementsByClassName('disorder-color');
      if (colourArray){
        colour = colourArray[0].style.backgroundColor;
        if (colour.startsWith('#')){
          // already hex
        } else if (colour.startsWith('rgb(')){
          // rgb
          let colourSplit = rgbRegex.exec(colour);
          if (colourSplit != null){
            colour = '#' + parseInt(colourSplit[1]).toString(16) + parseInt(colourSplit[2]).toString(16) + parseInt(colourSplit[3]).toString(16);
          }
        }
      }
      let nameArray = li.getElementsByClassName('disorder-name');
      if (nameArray){
        name = nameArray[0].textContent;
      }
      let casesArray = li.getElementsByClassName('disorder-cases');
      if (casesArray){
        cases = casesArray[0].textContent;
      }

      legendSection.items.push({colour: colour, name: name, cases: cases});
      itemCount++;
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
    //   // new FileSaver(blob, 'open-pedigree.pdf');
    //   navigator.msSaveOrOpenBlob(blob, 'open-pedigree.pdf');
    saveAs(blob, 'open-pedigree.pdf');
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


  for (let cat of legend){
    doc.save();
    doc.fontSize(14);
    doc.text(cat.heading, xOffset, yOffset, {lineBreak: false});
    yOffset += headingLineHeight;
    for (let item of cat.items){
      doc.save();
      doc.rect(xOffset, yOffset + (itemLineHeight - swatchSize) / 2, swatchSize, swatchSize).fill(item.colour, 1);
      doc.restore();
      doc.fontSize(10);
      doc.text(item.name + ' (' + item.cases + ')', xOffset + textIndent, yOffset + (itemLineHeight - 10) / 2, {lineBreak: false});
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
