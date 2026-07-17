// Functions in this file provide functionality which is not present in
// one of { InternetExplorer 8, Chrome v28, Firefox 3 } but may be present
// in later verisons of the browsers and/or libriries such as Ext/Prototype
// However the goal was to release a dependency-free package, thus some
// of the mehtods available in other libraries were re-implemented.
// None of the methods modify any of the built-in type prototypes.
// Loop types are picked based on http://jsperf.com/loops/128

// To allow debug code to run in IE7 && IE8
if (!window.console) {
  var console = {log: function() {}}; 
}

// For IE7 && IE8 again
if(typeof String.prototype.trim !== 'function') {
  String.prototype.trim = function() {
    return this.replace(/^\s+|\s+$/g, '');
  };
}

// And again (IE7 && IE8 fix)
if (!Array.prototype.forEach) {
  Array.prototype.forEach = function(fun) {
    var t = Object(this);
    var len = t.length >>> 0;
    if (typeof fun !== 'function') {
      throw new TypeError();
    }

    var thisArg = arguments.length >= 2 ? arguments[1] : void 0;
    for (var i = 0; i < len; i++) {
      if (i in t) {
        fun.call(thisArg, t[i], i, t);
      }
    }
  };
}

// Fix for Safari v4 && v5
if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.click && document.createEvent) {
  HTMLElement.prototype.click = function() {
    var eventObj = document.createEvent('MouseEvents');
    eventObj.initEvent('click',true,true);
    this.dispatchEvent(eventObj);
  };
}

// Used for: cloning a 2D array of integers (i.e. no deep copy of elements is necessary)
// Specific implementation is pciked based on http://jsperf.com/clone-2d-array/4
var clone2DArray = function(arr2D) {
  var new2D = [];
  for (var i = 0; i < arr2D.length; ++i) {
    new2D.push(arr2D[i].slice());
  }
  return new2D;
};

// Creates a shallow copy of the given object
// Specific implementation is picked based on http://jsperf.com/cloning-an-object/4
var cloneObject = function(obj) {
  var target = {};
  for (var i in obj) {
    if (obj.hasOwnProperty(i)) {
      target[i] = obj[i];
    }
  }
  return target;
};

// Equivalent to (Array.indexOf() != -1)
var arrayContains = function(array, item) {
  if (Array.prototype.indexOf) {
    return !(array.indexOf(item) < 0);
  } else {
    for (var i = 0, len = array.length; i < len; ++i) {
      if (array[i] === item) {
        return true;
      }
    }
    return false;
  }
};

// Equivalent to Array.indexOf
var arrayIndexOf = function(array, item) {
  if (Array.prototype.indexOf) {
    return (array.indexOf(item));
  } else {
    for (var i = 0, len = array.length; i < len; ++i) {
      if (array[i] === item) {
        return i;
      }
    }
    return -1;
  }
};

var indexOfLastMinElementInArray = function(array) {
  var min      = array[0];
  var minIndex = 0;

  for (var i = 1, len = array.length; i < len; ++i) {
    if(array[i] <= min) {
      minIndex = i;
      min      = array[i];
    }
  }
  return minIndex;
};

// Returns an array of unique values from the given array
// Specific implementation is picked based on http://jsperf.com/array-unique2/19
var filterUnique = function(array) {
  var hash   = {},
    result = [],
    i      = array.length;
  while (i--) {
    if (!hash[array[i]]) {
      hash[array[i]] = true;
      result.push(array[i]);
    }
  }
  return result;
};

// Replaces the first occurence of `value` in `array` by `newValue`. Does nothing if `value` is not in `array`
var replaceInArray = function(array, value, newValue) {
  for (var i = 0, len = array.length; i < len; ++i) {
    if (array[i] === value) {
      array[i] = newValue;
      break;
    }
  }
};

// Removes the first occurence of `value` in `array`. Does nothing if `value` is not in `array`
var removeFirstOccurrenceByValue = function(array, item) {
  for (var i = 0, len = array.length; i < len; ++i) {
    if (array[i] == item) {
      array.splice(i,1);
      break;
    }
  }
};

// Used for: user input validation
var isInt = function(n) {
  //return +n === n && !(n % 1);
  //return !(n % 1);
  return (!isNaN(n) && parseInt(n) == parseFloat(n));
};

// Used for: Disorder/HPOTerm id sanitization, which must keep ids inside the charset that is
// safe to embed in an HTML id while staying reversible — the id is the only stored form of a
// free-text term, so its name is recovered by decoding it back.
//
// Escapes one out-of-charset character as _uXXXX_ (UTF-16 code unit, so surrogate pairs survive
// as two escapes).
//
// ' ' keeps its legacy '__' mapping instead: it is the one character older versions round-tripped
// correctly, so every id they stored for an ASCII name stays byte-identical. Escaping it would
// mint a second id for a name already saved in an existing pedigree, and the legend would show
// the same disorder twice.
var ID_CHARSET = /[a-zA-Z0-9,;_\-*]/;

var escapeIDChar = function(c) {
  if (c === ' ') {
    return '__';
  }
  var hex = c.charCodeAt(0).toString(16).toUpperCase();
  while (hex.length < 4) {
    hex = '0' + hex;
  }
  return '_u' + hex + '_';
};

/*
 * The character of a _uXXXX_ escape at position i, or null if there is no escape there that
 * escapeIDChar could actually have EMITTED as a _uXXXX_.
 *
 * That qualification is the whole point, and it has two parts:
 *
 *   - '_u0041_' is not an escape: 'A' is inside the charset, so it is never escaped at all, and
 *     those characters only ever appear in an id as themselves.
 *   - '_u0020_', '_u0028_', '_u0029_', and (phenotype only) '_u003A_' are not escapes either:
 *     space, '(', ')' and ':' ARE out of charset, but they have DEDICATED escapes ('__', '_L_',
 *     '_J_', '_C_'), so escapeIDChar never spells them as _uXXXX_. `dedicated` carries those
 *     characters, which is why it is caller-supplied: ':' is dedicated for a phenotype ('_C_')
 *     but NOT for a disorder, whose sanitizeID really does emit '_u003A_' for a colon.
 *
 * '_u9057_' by contrast is a real escape: '遗' is out of charset AND has no dedicated form, so it
 * could only have got into an id by being escaped this way. The distinction is what lets
 * decodeTermID read a '_' that runs into an escape.
 */
var emittedEscapeAt = function(id, i, dedicated) {
  var match = /^_u([0-9A-Fa-f]{4})_/.exec(id.substring(i, i + 7));
  if (!match) {
    return null;
  }
  var character = String.fromCharCode(parseInt(match[1], 16));
  if (ID_CHARSET.test(character) || dedicated.indexOf(character) >= 0) {
    return null;
  }
  return character;
};

/*
 * Decodes a sanitized term id in ONE left-to-right pass. `extra` maps the fixed escapes the
 * caller uses beyond '__' — {'_L_': '(', '_J_': ')'} for a disorder, plus {'_C_': ':'} for a
 * phenotype.
 *
 * This CANNOT be a sequence of global replaces, which is what it used to be. Every escape both
 * opens and closes with '_', and '_' is also an ordinary character, so escapes collide at BOTH
 * ends and any fixed order of replaces destroys one end or the other:
 *
 *   closing:  ') ' encodes to '_J_' + '__'. Replacing '__' first eats the '_J_'s closing '_', so
 *             'Cancer (familial) type 2' came back as 'Cancer (familial_J _type 2'. Ordinary
 *             nomenclature — 183 real HPO names and 30 real Orphanet ones hit this.
 *   opening:  'a_[' encodes to 'a' + '_' + '_u005B_'. Taking '__' there eats the escape's
 *             OPENING '_' and gives 'a u005B_'. The old code got this right by running _uXXXX_
 *             first, globally — which is exactly why it got the closing case wrong.
 *
 * No ordering satisfies both, and neither does a plain lookahead: refusing '__' before any
 * '_uXXXX_' fixes 'a_[' but breaks ' u0041_', where 'A' is in-charset so nothing was ever
 * escaped there. The rule used here: a fixed escape matches only when its closing '_' does not
 * open an escape escapeIDChar could have EMITTED (see emittedEscapeAt).
 *
 * This is NOT a total inverse, and cannot be — sanitizeID is non-injective, so some ids have
 * more than one preimage and the decoder has to pick one. It resolves every ambiguity the same
 * way, FIXED-ESCAPE / EMITTABLE-ESCAPE FIRST, because that is the reading real ontology names
 * need: ') ' -> '_J_' + '__' must read back as ')'-then-space. The cost is that a handful of
 * pathological free-text shapes read differently from the name that was typed:
 *   - a literal '_' next to a fixed escape: 'a_L ' (id 'a_L__') decodes 'a(_', not 'a_L ';
 *   - literal hex synthesizing an escape across a boundary: ' u005B ' (id '__u005B__') decodes
 *     '_[_'. Note this one has NO literal underscore, so "no underscore => round-trips" is false.
 * What makes this acceptable, and checked in term-ids.test.js: NONE of these shapes occurs in
 * any of the 64,682 real ontology names — a fixed-escape char or space is never adjacent to a
 * literal '_', and 'uXXXX' hex text never follows a space/paren/colon. The old cascade differed
 * only in which pathological reading it picked; both are valid preimages of the same ambiguous
 * id. See the KNOWN LIMIT note in disorder.js.
 */
var decodeTermID = function(id, extra) {
  // The characters that have a dedicated escape and so are NEVER spelled as _uXXXX_: the space
  // ('__'), plus whatever fixed escapes this caller uses ('(' , ')' , and ':' for a phenotype).
  var dedicated = ' ';
  for (var key in extra) {
    if (extra.hasOwnProperty(key)) {
      dedicated += extra[key];
    }
  }
  var out = '';
  var i = 0;
  id = String(id);
  while (i < id.length) {
    var escaped = emittedEscapeAt(id, i, dedicated);
    if (escaped !== null) {
      out += escaped;
      i += 7;
      continue;
    }
    if (id.charAt(i) === '_') {
      var three = id.substring(i, i + 3);
      if (extra.hasOwnProperty(three) && emittedEscapeAt(id, i + 2, dedicated) === null) {
        out += extra[three];
        i += 3;
        continue;
      }
      if (id.substring(i, i + 2) === '__' && emittedEscapeAt(id, i + 1, dedicated) === null) {
        out += ' ';
        i += 2;
        continue;
      }
    }
    out += id.charAt(i);
    i += 1;
  }
  return out;
};

var toObjectWithTrue = function(array) {
  var obj = {};
  for (var i = 0; i < array.length; ++i) {
    if (array[i] !== undefined) {
      obj[array[i]] = true;
    }
  }
  return obj;
};

var romanize = function(num) {
  // Roman numerals have no zero, no sign and no fraction. `!+num` already rejected 0 and
  // anything non-numeric, but a negative or a fraction fell through and came back as a numeral
  // built from the digits with the sign or the '.' quietly dropped: -7 gave 'VII' and 1.5 gave
  // 'CV'. Returning false is what the rest of the contract already promises for a value it
  // cannot express.
  //
  // Nothing in src/ calls this — it is exported and currently unused (generation numbers are
  // rendered as plain integers). So this is a contract gap closed on a helper, not a bug fixed
  // on a live path; do not read the test for it as covering anything a user can reach.
  if (!+num || +num < 1 || +num % 1 !== 0) {
    return false;
  }
  var digits = String(+num).split(''),
    key = ['','C','CC','CCC','CD','D','DC','DCC','DCCC','CM',
      '','X','XX','XXX','XL','L','LX','LXX','LXXX','XC',
      '','I','II','III','IV','V','VI','VII','VIII','IX'],
    roman = '',
    i = 3;
  while (i--) {
    roman = (key[+digits.pop() + (i * 10)] || '') + roman;
  }
  return Array(+digits.join('') + 1).join('M') + roman;
};

/*function objectKeys(obj) {
    if (Object.keys)
        return Object.keyhs(obj);

    var keys = [];
    for (var i in obj) {
      if (obj.hasOwnProperty(i)) {
        keys.push(i);
      }
    }
    return keys;
}*/

//-------------------------------------------------------------
// Used during ordering for bucket order permutations
//-------------------------------------------------------------
var makeFlattened2DArrayCopy = function(array) {
  var flattenedcopy = [].concat.apply([], array);
  return flattenedcopy;
};

var _swap = function(array, i, j) {
  var b    = array[j];
  array[j] = array[i];
  array[i] = b;
};

var permute2DArrayInFirstDimension = function(permutations, array, from) {
  var len = array.length;

  if (from == len-1) {
    permutations.push(makeFlattened2DArrayCopy(array));
    return;
  }

  for (var j = from; j < len; j++) {
    _swap(array, from, j);
    permute2DArrayInFirstDimension(permutations, array, from+1);
    _swap(array, from, j);
  }
};
//-------------------------------------------------------------


//-------------------------------------------------------------
// Used for profiling code
var Timer = function() {
  this.startTime = undefined;
  this.lastCheck = undefined;
  this.start();
};

Timer.prototype = {

  start: function() {
    this.startTime = new Date().getTime();
    this.lastCheck = this.startTime;
  },

  restart: function() {
    this.start();
  },

  report: function() {
    var current = new Date().getTime();
    var elapsed = current - this.lastCheck;
    return elapsed;
  },

  printSinceLast: function( msg ) {
    var current = new Date().getTime();
    var elapsed = current - this.lastCheck;
    this.lastCheck = current;
    // console.log( msg + elapsed + "ms" );
  },
};

export { clone2DArray, cloneObject, arrayContains, arrayIndexOf, indexOfLastMinElementInArray, filterUnique, replaceInArray, removeFirstOccurrenceByValue, isInt, escapeIDChar, decodeTermID, toObjectWithTrue, romanize, makeFlattened2DArrayCopy, permute2DArrayInFirstDimension, Timer };
