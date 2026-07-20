/**
 * Returns a raphael element representing a Pi-Chart-like slice of the icon representing the given gender
 *
 * @param canvas Raphael paper object
 * @param {Number} xPosition
 * @param {Number} yPosition
 * @param {Number} radius Radius of the associated shape
 * @param {String} gender Can be "M", "F" or "U"
 * @param {Number} startAngle Has to be equal or greater than 0
 * @param {Number} endAngle
 * @param {String} color CSS color
 * @return {Raphael.el}
 */
function sector(canvas, xPosition, yPosition, radius, gender, startAngle, endAngle, color) {
  var sectorPath,
    gen = gender,
    cx = xPosition,
    cy = yPosition,
    r = radius,
    paper = canvas,
    rad = Math.PI / 180,
    shapeAttributes = {fill: color, 'stroke-width':.0 };

  //returns coordinates of the point on the circle (with radius = _radius) at angle alpha
  var circleCoordinate = function(alpha) {
    var x = cx + r * Math.cos(-alpha * rad),
      y = cy + r * Math.sin(-alpha * rad);
    return [x,y];
  };

  if (gen === 'F') {
    if(endAngle-startAngle == 360) {
      return paper.circle(cx, cy, r).attr(shapeAttributes);
    }
    var x1 = circleCoordinate(startAngle)[0],
      x2 = circleCoordinate(endAngle)[0],
      y1 = circleCoordinate(startAngle)[1],
      y2 = circleCoordinate(endAngle)[1];

    return paper.path(['M', cx, cy, 'L', x1, y1, 'A', r, r, 0, +(endAngle - startAngle > 180), 0, x2, y2, 'z']).attr(shapeAttributes);
  } else if(gen === 'M') {
    //returns the side of the square on which the coordinate exists. Sides are numbered 0-3 counter-clockwise,
    //starting with the right side
    function sideAtAngle(angle) {
      return (((angle + 45)/90).floor()) % 4;
    }

    //returns the tangent value of the parameter degrees
    function tanOfDegrees(degrees) {
      var radians = degrees * Math.PI/180;
      return Math.tan(radians);
    }

    //returns the coordinate of point at angle alpha on the square
    function getCoord(alpha) {
      var side = sideAtAngle(alpha);
      var result = {};
      var xFactor = (side % 2);
      var yFactor = (1 - side % 2);
      var sideFactor = side % 3 ? -1 : 1;

      result.angle = (alpha - side * 90 - ((side == 0 && alpha > 45) ? 360 : 0)) * (side < 2 ? -1 : 1);
      // Find the distance from the middle of the line
      var d = r * tanOfDegrees(result.angle);
      // Compute the coordinates
      result.x = cx + xFactor * d + yFactor * sideFactor * r;
      result.y = cy + yFactor * d + xFactor * sideFactor * r;
      return result;
    }

    //returns the coordinate of the next corner (going counter-clockwise, and starting with side given in the
    //parameter
    function getNextCorner(side) {
      var factorA = (side % 3) ? -1: 1,
        factorB = (side < 2) ? -1: 1,
        result = {};
      result.x = cx + factorA * r;
      result.y = cy + factorB * r;
      return result;
    }

    var startSide = sideAtAngle(startAngle),
      endSide = sideAtAngle(endAngle);
    if(endSide == 0 && endAngle > startAngle) {
      endSide = (startAngle >= 315) ? 0 : 4;
    }
    var numSides = endSide - startSide;

    var startCoord = getCoord(startAngle),
      endCoord = getCoord(endAngle),
      sectorPathData = ['M', endCoord.x, endCoord.y, 'L', cx, cy, 'L', startCoord.x, startCoord.y],
      currentSide = startSide;

    while(numSides > 0) {
      sectorPathData.push('L', getNextCorner(currentSide).x + ' ' + getNextCorner(currentSide).y);
      currentSide = (++currentSide) % 4;
      numSides--;
    }
    sectorPathData.push('L',endCoord.x, endCoord.y, 'z');
    return paper.path(sectorPathData).attr(shapeAttributes);
  } else {
    var shape = sector(paper, cx, cy, r* (Math.sqrt(3)/2), 'M', startAngle, endAngle, color);
    shape.transform(['...r-45,', cx , cy]).attr(shapeAttributes);
    return shape;
  }
}

/**
 * Creates a 3D looking orb
 *
 * @method generateOrb
 * @param canvas Raphael paper
 * @param {Number} x X coordinate for the orb
 * @param {Number} y Y coordinate for the orb
 * @param {Number} r Radius of the orb
 * @return {Raphael.st}
 */
function generateOrb (canvas, x, y, r) {
  return canvas.set(
    canvas.ellipse(x, y, r, r),
    canvas.ellipse(x, y, r - r / 5, r - r / 20).attr({stroke: 'none', fill: 'r(.5,.1)#ccc-#ccc', opacity: 0})
  );
}

/**
 * Draws a quarter-circle-like curve connecting xFrom,Yfrom and xTo,yTo
 * with the given attributes and bend (upwars or downwards)
 *
 * Iff "doubleCurve" is true, cones the curve and shifts one curve by (shiftx1, shifty1) and the other by (shiftx2, shifty2)
 */
function drawCornerCurve (xFrom, yFrom, xTo, yTo, bendDown, attr, doubleCurve, shiftx1, shifty1, shiftx2, shifty2 ) {
  var xDistance = xTo - xFrom;
  var yDistance = yFrom - yTo;

  var dist1x = xDistance/2;
  var dist2x = xDistance/10;
  var dist1y = yDistance/2;
  var dist2y = yDistance/10;

  var curve;

  if (bendDown) {
    var raphaelPath =  'M ' + (xFrom)          + ' ' + (yFrom) +
                          ' C ' + (xFrom + dist1x) + ' ' + (yFrom + dist2y) +
                            ' ' + (xTo   + dist2x) + ' ' + (yTo   + dist1y) +
                            ' ' + (xTo)            + ' ' + (yTo);
    curve = editor.getPaper().path(raphaelPath).attr(attr).toBack();
  } else {
    var raphaelPath =   'M ' + (xFrom)          + ' ' + (yFrom) +
                           ' C ' + (xFrom - dist2x) + ' ' + (yFrom - dist1y) +
                             ' ' + (xTo   - dist1x) + ' ' + (yTo   - dist2y) +
                             ' ' + (xTo)            + ' ' + (yTo);
    curve = editor.getPaper().path(raphaelPath).attr(attr).toBack();
  }

  if (doubleCurve) {
    var curve2 = curve.clone().toBack();
    curve .transform('t ' + shiftx1  + ',' + shifty1 + '...');
    curve2.transform('t ' + shiftx2 + ',' + shifty2 + '...');
  }
}

function drawLevelChangeCurve (xFrom, yFrom, xTo, yTo, attr, doubleCurve, shiftx1, shifty1, shiftx2, shifty2 ) {
  var xDistance = xTo - xFrom;
  var dist1x    = xDistance/2;

  var raphaelPath = ' M ' + (xFrom)           + ' ' + yFrom;
  raphaelPath    += ' C ' + (xFrom + dist1x)  + ' ' + (yFrom) +
                        ' ' + (xTo   - dist1x)  + ' ' + (yTo) +
                        ' ' + (xTo)             + ' ' + (yTo);

  var curve = editor.getPaper().path(raphaelPath).attr(attr).toBack();
  if (doubleCurve) {
    var curve2 = curve.clone().toBack();
    curve .transform('t ' + shiftx1  + ',' + shifty1 + '...');
    curve2.transform('t ' + shiftx2 + ',' + shifty2 + '...');
  }
}

/**
 * Computes the intersection point between a horizontal line @ y == crossY and a line from x1,y1 to x2,y2
 */
function findXInterceptGivenLineAndY(crossY, x1, y1, x2, y2) {
  // y = ax + b
  if (x1 == x2) {
    return x1;
  }
  var a = (y1 - y2)/(x1 - x2);
  var b = y1 - a*x1;
  var interceptX = (crossY - b)/a;
  return interceptX;
}

function getElementHalfHeight(t) {
  return Math.floor(t.getBBox().height/2);
}

//Animation helpers
window.requestAnimFrame = (function(){
  return  window.requestAnimationFrame   ||
        window.webkitRequestAnimationFrame ||
        window.mozRequestAnimationFrame    ||
        window.oRequestAnimationFrame      ||
        window.msRequestAnimationFrame     ||
        function( callback ){
          window.setTimeout(callback, 1000 / 60);
        };
})();


// A dark shade of a disorder colour, so hatch lines read on top of the (often pale) solid fill.
function darkenColor(color, factor) {
  var r, g, b;
  var s = String(color).trim();
  var m6 = /^#([0-9a-f]{6})$/i.exec(s);
  var m3 = /^#([0-9a-f]{3})$/i.exec(s);
  var mr = /^rgba?\(\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)/i.exec(s);
  if (m6) { r = parseInt(m6[1].substr(0, 2), 16); g = parseInt(m6[1].substr(2, 2), 16); b = parseInt(m6[1].substr(4, 2), 16); }
  else if (m3) { r = parseInt(m3[1][0] + m3[1][0], 16); g = parseInt(m3[1][1] + m3[1][1], 16); b = parseInt(m3[1][2] + m3[1][2], 16); }
  else if (mr) { r = +mr[1]; g = +mr[2]; b = +mr[3]; }
  else { return '#333333'; }
  var f = (factor == null) ? 0.42 : factor;
  return 'rgb(' + Math.round(r * f) + ',' + Math.round(g * f) + ',' + Math.round(b * f) + ')';
}

// Ordered palette of per-disease fill patterns (NSGC 2022 §4.5: divide the symbol and give each
// disease a distinct fill pattern, defined in the legend, so it reads even in black-and-white where
// colour is lost). Line styles first — NSGC's own worked example uses line fills (horizontal for one
// disease, vertical for another) — then the cross-hatches and a dot stipple. A disease is assigned a
// style by registration order, CYCLING through this list: distinct for up to HATCH_STYLES.length
// simultaneous diseases; beyond that the pattern repeats but the (distinct) colour still tells them
// apart on screen. Seven clearly-different B&W patterns covers realistic pedigrees.
var HATCH_STYLES = ['diag-fwd', 'vert', 'diag-back', 'horiz', 'cross', 'xcross', 'dots'];

// Geometry-ONLY description of a pattern filling the box [x,y,w,h] at the given style + spacing.
// Returns primitives ['line', x1,y1,x2,y2] or ['dot', cx,cy,r]. Shared by the on-canvas sector
// hatch AND the legend swatch, so the two can NEVER disagree on direction — the original bug was a
// CSS-gradient legend that pointed the opposite way from the SVG canvas hatch.
function hatchSpecs(x, y, w, h, style, step) {
  var out = [];
  var x2 = x + w, y2 = y + h, o, px, py;
  var vert = function () { for (px = x + step / 2; px < x2; px += step) { out.push(['line', px, y, px, y2]); } };
  var horiz = function () { for (py = y + step / 2; py < y2; py += step) { out.push(['line', x, py, x2, py]); } };
  var fwd = function () { for (o = -h; o < w; o += step) { out.push(['line', x + o, y2, x + o + h, y]); } };  // "/" slope -1
  var back = function () { for (o = -h; o < w; o += step) { out.push(['line', x + o, y, x + o + h, y2]); } };  // "\\" slope +1
  switch (style) {
  case 'vert': vert(); break;
  case 'horiz': horiz(); break;
  case 'diag-back': back(); break;
  case 'cross': vert(); horiz(); break;         // "+"
  case 'xcross': fwd(); back(); break;          // "×"
  case 'dots': {
    // Dots are a 2-D grid, so reusing the line spacing would create O((w/step)^2) elements — a
    // full symbol at line density made ~500 circles. Space dots ~2.4x wider than lines to keep the
    // count comparable to a line pattern (and still clearly a stipple).
    var dstep = step * 2.4;
    for (py = y + dstep / 2; py < y2; py += dstep) {
      for (px = x + dstep / 2; px < x2; px += dstep) { out.push(['dot', px, py, dstep * 0.22]); }
    }
    break;
  }
  case 'diag-fwd':
  default: fwd(); break;
  }
  return out;
}

// Carrier stripes: well-SPACED clean lines that read as distinct stripes, not a dense texture that
// looks like a background (the earlier step 3.4 was too tight). 'affected' is kept only for the
// legend/PDF fill-key rendering and stays lighter; on the canvas, affected is drawn solid (no lines).
function hatchDensity(kind) {
  return kind === 'affected'
    ? { step: 7.0, width: 0.9 }
    : { step: 8.0, width: 1.6 };   // both states — sparse, well-separated stripes (not a dense texture)
}

/**
 * Draws a disorder subsection's fill pattern as REAL geometry — dark lines/dots (a dark shade of the
 * disorder colour) clipped to the sector — rather than an SVG `<pattern>` fill.
 *
 * Why not a pattern fill: `<pattern>` fills do NOT survive the SVG/PDF export path (svg-to-pdfkit
 * does not render pattern paints, and the serialized SVG dropped the defs), so an exported sector
 * lost its fill entirely. Real geometry serializes and converts to PDF like any other stroke. Lines
 * are drawn dark-on-colour and thick enough to read on the palest palette colours (e.g. #E0F8F8),
 * clipped to the sector so multiple disorders stay crisp.
 *
 * The caller fills the sector SOLID with the disorder colour first, then overlays this pattern — so
 * if the clip/lines are ever lost the sector still shows the correct disease colour (degrades to
 * "looks affected", never to blank/black).
 *
 * @param {String} style one of HATCH_STYLES (the disease's assigned pattern)
 * @param {String} kind  'carrier' (dense) or 'affected' (sparse texture)
 * @return {{lines: Array, clipId: String}|null} Raphael elements + the clipPath id (add the elements
 *   to the same set as the sector so a redraw removes them; remove the clipPath by id), or null on a
 *   non-SVG canvas (caller then leaves the sector solid).
 */
function drawSectorHatch(paper, sectorEl, color, style, kind) {
  var svg = paper && paper.canvas;
  if (!svg || String(svg.tagName).toLowerCase() !== 'svg' || typeof document === 'undefined') {
    return null;
  }
  var NS = 'http://www.w3.org/2000/svg';
  var defs = svg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS(NS, 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }
  paper._opHatchSeq = (paper._opHatchSeq || 0) + 1;
  var clipId = 'op-hatchclip-' + paper._opHatchSeq;
  var clip = document.createElementNS(NS, 'clipPath');
  clip.setAttribute('id', clipId);
  clip.setAttribute('clipPathUnits', 'userSpaceOnUse');
  // Clone the ACTUAL sector geometry into the clip. sector() returns a <path> for a pie slice or
  // the U-diamond, but a <circle> (full-circle F) or <rect> (full-square M) for a single-disorder
  // symbol — a <path>-with-d clip would then get d="null" and throw. cloneNode copies whatever
  // element type it is; only geometry matters inside a clipPath (fill/stroke are ignored).
  if (!sectorEl.node) { return null; }
  var cp = sectorEl.node.cloneNode(true);
  cp.removeAttribute('clip-path');   // don't inherit any hatch clip if the node was reused
  clip.appendChild(cp);
  defs.appendChild(clip);

  var bb = sectorEl.getBBox();
  var stroke = darkenColor(color, 0.42);
  var d = hatchDensity(kind);
  var specs = hatchSpecs(bb.x, bb.y, bb.width, bb.height, style || 'diag-fwd', d.step);
  var lines = [];
  for (var i = 0; i < specs.length; i++) {
    var s = specs[i], el;
    if (s[0] === 'dot') {
      el = paper.circle(s[1], s[2], Math.max(0.6, s[3]));
      el.attr({ fill: stroke, stroke: 'none' });
    } else {
      el = paper.path(['M', s[1], s[2], 'L', s[3], s[4]]);
      el.attr({ stroke: stroke, 'stroke-width': d.width, 'stroke-linecap': 'butt' });
    }
    if (el.node) { el.node.setAttribute('clip-path', 'url(#' + clipId + ')'); }
    lines.push(el);
  }
  return { lines: lines, clipId: clipId };
}

// Inline-SVG markup for a legend swatch: a rounded square in the disorder colour overlaid with the
// disorder's dark fill pattern — the SAME hatchSpecs geometry as the canvas, so the legend key
// faithfully defines what is drawn (NSGC general instruction #3). Returned as a string to drop into
// the legend bubble's innerHTML. `kind` picks carrier (dense) vs affected (sparse) density.
// Only allow a plain #hex or rgb()/rgba() colour into the swatch markup — the colour originates from
// the legend and can come from an IMPORTED file, and it is interpolated into an SVG attribute via
// innerHTML; an unsanitised value could close the attribute and inject markup. darkenColor already
// hardens the stroke (it parses to rgb() or falls back to #333333); this guards the raw fill.
function safeColor(color) {
  var s = String(color == null ? '' : color).trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(s) || /^rgba?\([\d.,\s%]+\)$/.test(s) ? s : '#dddddd';
}
var _swatchSeq = 0;
function patternSwatchSVG(color, style, size, kind) {
  size = size || 16;
  color = safeColor(color);
  var stroke = darkenColor(color, 0.42);
  var dd = hatchDensity(kind || 'carrier');
  var specs = hatchSpecs(0, 0, size, size, style || 'diag-fwd', dd.step);
  var f = function (n) { return Math.round(n * 100) / 100; };
  var clipId = 'op-sw-' + (_swatchSeq++);
  var body = '';
  for (var i = 0; i < specs.length; i++) {
    var s = specs[i];
    if (s[0] === 'dot') {
      body += '<circle cx="' + f(s[1]) + '" cy="' + f(s[2]) + '" r="' + f(Math.max(0.6, s[3])) + '" fill="' + stroke + '"/>';
    } else {
      body += '<line x1="' + f(s[1]) + '" y1="' + f(s[2]) + '" x2="' + f(s[3]) + '" y2="' + f(s[4]) +
        '" stroke="' + stroke + '" stroke-width="' + dd.width + '"/>';
    }
  }
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" xmlns="http://www.w3.org/2000/svg">' +
    '<defs><clipPath id="' + clipId + '"><rect x="0" y="0" width="' + size + '" height="' + size + '" rx="3"/></clipPath></defs>' +
    '<rect x="0" y="0" width="' + size + '" height="' + size + '" rx="3" fill="' + color + '"/>' +
    '<g clip-path="url(#' + clipId + ')">' + body + '</g>' +
    '<rect x="0.5" y="0.5" width="' + (size - 1) + '" height="' + (size - 1) + '" rx="3" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1"/>' +
    '</svg>';
}

export { sector, generateOrb, drawCornerCurve, drawLevelChangeCurve, findXInterceptGivenLineAndY, getElementHalfHeight, drawSectorHatch, darkenColor, HATCH_STYLES, hatchSpecs, patternSwatchSVG };
