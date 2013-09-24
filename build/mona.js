(function(e){if("function"==typeof bootstrap)bootstrap("mona",e);else if("object"==typeof exports)module.exports=e();else if("function"==typeof define&&define.amd)define(e);else if("undefined"!=typeof ses){if(!ses.ok())return;ses.makeMona=e}else"undefined"!=typeof window?window.mona=e():global.mona=e()})(function(){var define,ses,bootstrap,module,exports;
return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

/**
 * Parser execution api
 * @namespace api
 */

/**
 * Executes a parser and returns the result.
 *
 * @param {Function} parser - The parser to execute.
 * @param {String} string - String to parse.
 * @param {Object} [opts] - Options object.
 * @param {Boolean} [opts.throwOnError=true] - If truthy, throws a ParseError if
 *                                             the parser fails.
 * @param {String} [opts.fileName] - filename to use for error messages.
 * @returns {value|api.ParseError}
 * @memberof api
 */
function parse(parser, string, opts) {
  opts = opts || {
    throwOnError: true
  };
  var parseState = parser(
    new ParserState(undefined, string, opts.userState,
                    new SourcePosition(opts.fileName), false));
  if (parseState.error && opts.throwOnError) {
    throw parseState.error;
  } else if (parseState.error && !opts.throwOnError) {
    return parseState.error;
  } else {
    return parseState.value;
  }
}

/**
 * Represents a source location.
 * @typedef {Object} SourcePosition
 * @property {String} name - Optional sourcefile name.
 * @property {integer} line - Line number, starting from 1.
 * @property {integer} column - Column number in the line, starting from 1.
 * @memberof api
 */
function SourcePosition(name, line, column) {
  this.name = name;
  this.line = line || 1;
  this.column = column || 1;
}

/**
 * Information about a parsing failure.
 * @typedef {Object} ParseError
 * @property {api.SourcePosition} position - Source position for the error.
 * @property {Array} messages - Array containing relevant error messages.
 * @property {String} type - The type of parsing error.
 * @memberof api
 */
function ParseError(pos, messages, type) {
  if (Error.captureStackTrace) {
    // For pretty-printing errors on node.
    Error.captureStackTrace(this, this);
  }
  this.position = pos;
  this.messages = messages;
  this.type = type;
  this.message = ("(line "+ this.position.line +
                  ", column "+this.position.column+") "+
                  this.messages.join("\n "));
}
ParseError.prototype = new Error();
ParseError.prototype.constructor = ParseError;
ParseError.prototype.name = "ParseError";


/**
 * Core parsers
 *
 * @namespace core
 */

/**
 * A function accepting parserState as input that transforms it and returns a
 * new parserState.
 * @callback {Function} Parser
 * @param {ParserState} state - Current parser state.
 * @returns {ParserState} state' - Transformed parser state.
 * @memberof core
 */

/**
 * Returns a parser that always succeeds without consuming input.
 *
 * @param [val=undefined] - value to use as this parser's value.
 * @returns {core.Parser}
 * @memberof core
 */
function value(val) {
  return function(parserState) {
    return attr(parserState, "value", val);
  };
}

/**
 * Returns a parser that calls `fun` on the value resulting from running
 * `parser` on the current parsing state. Fails without executing `fun` if
 * `parser` fails.
 *
 * @param {core.Parser} parser - The parser to execute.
 * @param {Function} fun - Function called with the resulting value of
 *                         `parser`. Must return a parser.
 * @returns {core.Parser}
 * @memberof core
 */
function bind(parser, fun) {
  return function(parserState) {
    var newParserState = parser(parserState);
    if (newParserState.error) {
      return newParserState;
    } else {
      return fun(newParserState.value)(newParserState);
    }
  };
}

/**
 * Returns a parser that always fails without consuming input. Automatically
 * includes the line and column positions in the final ParseError.
 *
 * @param {String} msg - Message to report with the failure.
 * @param {String} type - A type to apply to the ParseError.
 * @returns {core.Parser}
 * @memberof core
 */
function fail(msg, type) {
  msg = msg || "parser error";
  type = type || "failure";
  return function(parserState) {
    return attr(parserState, "error", function(oldErr) {
      return mergeErrors(
        oldErr, new ParseError(parserState.position, [msg], type));
    });
  };
}

/**
 * Returns a parser that will fail and report that `descriptor` was expected.
 *
 * @param {String} descriptor - A string describing what was expected.
 * @returns {core.Parser}
 * @memberof core
 */
function expected(descriptor) {
  return fail("expected "+descriptor, "expectation");
}

/**
 * Returns a parser that consumes a single item from the input, or fails with an
 * unexpected eof error if there is no input left.
 *
 * @param {integer} [count=1] - number of tokens to consume. Must be > 0.
 * @returns {core.Parser}
 * @memberof core
 */
function token(count) {
  count = count || 1; // force 0 to 1, as well.
  return function(parserState) {
    var input = parserState.restOfInput;
    if (input.length >= count) {
      var newParserState = copy(parserState),
          newPosition = copy(parserState.position);
      for (var i = 0; i < count; i++) {
        if (input.charAt(i) === "\n") {
          newPosition.column = 1;
          newPosition.line += 1;
        } else {
          newPosition.column += 1;
        }
      }
      newParserState.value = input.slice(0, count);
      newParserState.restOfInput = input.slice(count);
      newParserState.position = newPosition;
      return newParserState;
    } else {
      return fail("unexpected eof", "eof")(parserState);
    }
  };
}

/**
 * Returns a parser that succeeds with a value of `true` if there is no more
 * input to consume.
 *
 * @returns {core.Parser}
 * @memberof core
 */
function eof() {
  return function(parserState) {
    if (!parserState.restOfInput) {
      return attr(parserState, "value", true);
    } else {
      return expected("end of input")(parserState);
    }
  };
}

/**
 * Delays calling of a parser constructor function until parse-time. Useful for
 * recursive parsers that would otherwise blow the stack at construction time.
 *
 * @param {Function} constructor - A function that returns a core.Parser.
 * @param {...Any} args - Arguments to apply to the constructor.
 * @returns {core.Parser}
 * @memberof core
 */
function delay(constructor) {
  var args = [].slice.call(arguments, 1);
  return function(parserState) {
    return constructor.apply(null, args)(parserState);
  };
}

/**
 * Debugger parser that logs the ParserState with a tag.
 *
 * @param {core.Parser} parser - Parser to wrap.
 * @param {String} tag - Tag to use when logging messages.
 * @param {String} [level="log"] - 'log', 'info', 'debug', 'warn', 'error'.
 * @returns {core.Parser}
 * @memberof core
 */
function log(parser, tag, level) {
  level = level || "log";
  return function(parserState) {
    var newParserState = parser(parserState);
    console[level](tag+" :: ", parserState, " => ", newParserState);
    return newParserState;
  };
}

/**
 * Parser combinators for higher-order interaction between parsers.
 *
 * @namespace combinators
 */

/**
 * Returns a parser that succeeds if all the parsers given to it succeed. The
 * returned parser uses the value of the last successful parser.
 *
 * @param {...core.Parser} parsers - One or more parsers to execute.
 * @returns {core.Parser}
 * @memberof combinators
 */
function and(firstParser) {
  var moreParsers = [].slice.call(arguments, 1);
  return bind(firstParser, function(result) {
    return moreParsers.length ?
      and.apply(null, moreParsers) :
      value(result);
  });
}

/**
 * Returns a parser that succeeds if one of the parsers given to it
 * suceeds. Uses the value of the first successful parser.
 *
 * @param {...core.Parser} parsers - One or more parsers to execute.
 * @returns {core.Parser}
 * @memberof combinators
 */
function or() {
  function orHelper() {
    var parsers = [].slice.call(arguments);
    return function(parserState) {
      var res = parsers[0](parserState);
      if (res.error && parsers[1]) {
        return orHelper.apply(null, parsers.slice(1))(parserState);
      } else {
        return res;
      }
    };
  }
  return orHelper.apply(null, arguments);
}

/**
 * Returns a parser that returns the result of `parser` if it succeeds,
 * otherwise succeeds with a value of `undefined` without consuming input.
 *
 * @param {core.Parser} parser - Parser to try.
 * @returns {core.Parser}
 * @memberof combinators
 */
function maybe(parser) {
  return or(parser, value());
}

/**
 * Returns a parser that succeeds if `parser` fails. Does not consume.
 *
 * @param {core.Parser} parser - parser to test.
 * @returns {core.Parser}
 * @memberof combinators
 */
function not(parser) {
  return function(parserState) {
    return parser(parserState).error ?
      value(true)(parserState) :
      fail("expected parser to fail")(parserState);
  };
}

/**
 * Returns a parser that works like `and`, but fails if the first parser given
 * to it succeeds. Like `and`, it returns the value of the last successful
 * parser.
 *
 * @param {core.Parser} notParser - If this parser succeeds, `unless` will fail.
 * @param {...core.Parser} moreParsers - Rest of the parses to test.
 * @returns {core.Parser}
 * @memberof combinators
 */
function unless(parser) {
  var moreParsers = [].slice.call(arguments, 1);
  return and.apply(null, [not(parser)].concat(moreParsers));
}

/**
 * Returns a parser that will execute `fun` while handling the parserState
 * internally, allowing the body of `fun` to be written sequentially. The
 * purpose of this parser is to simulate `do` notation and prevent the need for
 * heavily-nested `bind` calls.
 *
 * The `fun` callback will receive a function `s` which should be called with
 * each parser that will be executed, which will update the internal
 * parseState. The return value of the callback must be a parser.
 *
 * If any of the parsers fail, sequence will exit immediately, and the entire
 * sequence will fail with that parser's reason.
 *
 * @param {SequenceFn} fun - A sequence callback function to execute.
 * @returns {core.Parser}
 * @memberof combinators
 *
 * @example
 * mona.sequence(function(s) {
 *  var x = s(mona.token());
 *  var y = s(mona.character('b'));
 *  return mona.value(x+y);
 * });
 */
function sequence(fun) {
  return function(parserState) {
    var state = parserState, failwhale = {};
    function s(parser) {
      state = parser(state);
      if (state.error) {
        throw failwhale;
      } else {
        return state.value;
      }
    }
    try {
      return fun(s)(state);
    } catch(x) {
      if (x === failwhale) {
        return state;
      } else {
        throw x;
      }
    }
  };
}

/**
 * Called by `sequence` to handle sequential syntax for parsing. Called with an
 * `s()` function that must be called each time a parser should be applied. The
 * `s()` function will return the unwrapped value returned by the parser. If any
 * of the `s()` calls fail, this callback will exit with an appropriate failure
 * message, and none of the subsequent code will execute.
 *
 * Note that this callback may be called multiple times during parsing, and many
 * of those calls might partially fail, so side-effects should be done with
 * care.
 *
 * A `sequence` callback *must* return a `core.Parser`.
 *
 * @callback {Function} SequenceFn
 * @param {Function} s - Sequencing function. Must be wrapped around a parser.
 * @returns {core.Parser} parser - The final parser to apply before resolving
 *                                 `sequence`.
 * @memberof combinators
 */


/**
 * Returns a parser that returns the result of its first parser if it succeeds,
 * but fails if any of the following parsers fail.
 *
 * @param {core.Parser} parser - The value of this parser is returned if it
 *                               succeeds.
 * @param {...core.Parser} moreParsers - These parsers must succeed in order for
 *                                       `followedBy` to succeed.
 * @returns {core.Parser}
 * @memberof combinators
 */
function followedBy(parser) {
  var parsers = [].slice.call(arguments, 1);
  return bind(parser, function(result) {
    return bind(and.apply(null, parsers), function() {
      return value(result);
    });
  });
}

/**
 * Returns a parser that returns an array of results that have been successfully
 * parsed by `parser`, which were separated by `separator`.
 *
 * @param {core.Parser} parser - Parser for matching and collecting results.
 * @param {core.Parser} separator - Parser for the separator
 * @param {integer} [minimum=0] - Minimum length of the resulting array.
 * @returns {core.Parser}
 * @memberof combinators
 */
function separatedBy(parser, separator, minimum) {
  minimum = typeof minimum === "undefined" ? 0 : minimum;
  if (minimum === 0) {
    return or(separatedBy(parser, separator, 1),
              value([]));
  } else {
    return sequence(function(s) {
      var x = s(parser);
      var xs = s(zeroOrMore(and(separator, parser)));
      var result = [x].concat(xs);
      if (result.length >= minimum) {
        return value(result);
      } else {
        return fail("expected at least "+minimum+
                    "values from separatedBy");
      }
    });
  }
}

/**
 * Returns a parser that results in an array of zero or more successful parse
 * results for `parser`.
 *
 * @param {core.Parser} parser - The parser to try to apply.
 * @returns {core.Parser}
 * @memberof combinators
 */
function zeroOrMore(parser) {
  return function(parserState) {
    var prev = parserState, s = parserState, res =[];
    while (s = parser(s), !s.error) {
      res.push(s.value);
      prev = s;
    }
    return value(res)(prev);
  };
}

/**
 * Returns a parser that results in an array of zero or more successful parse
 * results for `parser`. The parser must succeed at least once.
 *
 * @param {core.Parser} parser - The parser to collect results for.
 * @returns {core.Parser}
 * @memberof combinators
 */
function oneOrMore(parser) {
  return sequence(function(s) {
    var x = s(parser),
        y = s(zeroOrMore(parser));
    return value([x].concat(y));
  });
}

/**
 * Returns a parser that results in a value between an opening and closing
 * parser.
 *
 * @param {core.Parser} open - Opening parser.
 * @param {core.Parser} close - Closing parser.
 * @returns {core.Parser}
 * @memberof combinators
 */
function between(open, close, parser) {
  return and(open, followedBy(parser, close));
}

/**
 * Returns a parser that skips input until `parser` stops matching.
 *
 * @param {core.Parser} parser - Determines whether to continue skipping.
 * @returns {core.Parser}
 * @memberof combinators
 */
function skip(parser) {
  return and(zeroOrMore(parser), value());
}

/**
 * String-related parsers and combinators.
 *
 * @namespace strings
 */

/**
 * Returns a parser that succeeds if the next token satisfies `predicate`,
 * returning the accepted character as its value. Fails if `predicate` does not
 * match.
 *
 * @param {Function} predicate - Called with a single token. Should return a
 *                               truthy value if the token should be accepted.
 * @returns {core.Parser}
 * @memberof strings
 */
function satisfies(predicate) {
  return bind(token(), function(c) {
    if (predicate(c)) {
      return value(c);
    } else {
      return fail("token does not match '"+
                  (predicate.name || "predicate")+
                  "'");
    }
  });
}

/**
 * Returns a string containing the concatenated results returned by applying
 * `parser`. `parser` must be a combinator that returns an array of string parse
 * results.
 *
 * @param {core.Parser} parser - Parser that results in an array of strings.
 * @returns {core.Parser}
 * @memberof strings
 */
function stringOf(parser) {
  return bind(parser, function(xs) {
    if (xs.hasOwnProperty("length") &&
        xs.join) {
      return value(xs.join(""));
    } else {
      return expected("an array-like from parser");
    }
  });
}

/**
 * Returns a parser that tries to consume and return a single character matching
 * `x`.
 *
 * @param {String} x - single-character string to match against the next token.
 * @param {Boolean} [caseSensitive=true] - Whether to match char case exactly.
 * @returns {core.Parser}
 * @memberof strings
 */
function character(x, caseSensitive) {
  caseSensitive = typeof caseSensitive === "undefined" ? true : caseSensitive;
  x = caseSensitive ? x : x.toLowerCase();
  return or(satisfies(function(y) {
    y = caseSensitive ? y : y.toLowerCase();
    return x === y;
  }), expected("character {"+x+"}"));
}

/**
 * Returns a parser that succeeds if the next token is one of the provided
 * `chars`.
 *
 * @param {String|Array} chars - Character bag to match the next
 *                                          token against.
 * @param {Boolean} [caseSensitive=true] - Whether to match char case exactly.
 * @returns {core.Parser}
 * @memberof strings
 */
function oneOf(chars, caseSensitive) {
  caseSensitive = typeof caseSensitive === "undefined" ? true : caseSensitive;
  chars = caseSensitive ? chars : chars.toLowerCase();
  return or(satisfies(function(x) {
    x = caseSensitive ? x : x.toLowerCase();
    return ~chars.indexOf(x);
  }), expected("one of {"+chars+"}"));
}

/**
 * Returns a parser that fails if the next token matches any of the provided
 * `chars`.
 *
 * @param {String|Array} chars - Character bag to match against.
 * @param {Boolean} [caseSensitive=true] - Whether to match char case exactly.
 * @returns {core.Parser}
 * @memberof strings
 */
function noneOf(chars, caseSensitive) {
  caseSensitive = typeof caseSensitive === "undefined" ? true : caseSensitive;
  chars = caseSensitive ? chars : chars.toLowerCase();
  return or(satisfies(function(x) {
    x = caseSensitive ? x : x.toLowerCase();
    return !~chars.indexOf(x);
  }), expected("none of {"+chars+"}"));
}

/**
 * Returns a parser that succeeds if `str` matches the next `str.length` inputs,
 * consuming the string and returning it as a value.
 *
 * @param {String} str - String to match against.
 * @param {Boolean} [caseSensitive=true] - Whether to match char case exactly.
 * @returns {core.Parser}
 * @memberof strings
 */
function string(str, caseSensitive) {
  // TODO - use "".indexOf(str) to make this more efficient. Once we switch to
  //        indexes instead of substrings, the second argument can be used to
  //        work with the offset.
  caseSensitive = typeof caseSensitive === "undefined" ? true : caseSensitive;
  str = caseSensitive ? str : str.toLowerCase();
  return sequence(function(s) {
    var tokens = s(token(str.length)),
        matchTokens = caseSensitive ? tokens : tokens.toLowerCase();
    if (str === matchTokens) {
      return value(tokens);
    } else {
      return expected("string matching {"+str+"}");
    }
  });
}

/**
 * Returns a parser that parses a single digit character token from the input.
 *
 * @param {integer} [base=10] - Optional base for the digit.
 * @returns {core.Parser}
 * @memberof strings
 */
function digitCharacter(base) {
  base = base || 10;
  return or(satisfies(function(x) { return !isNaN(parseInt(x, base)); }),
            expected("digitCharacter"));
}

/**
 * Returns a parser that matches one whitespace character.
 *
 * @returns {core.Parser}
 * @memberof strings
 */
function space() {
  return or(oneOf(" \t\n\r"), expected("space"));
}

/**
 * Returns a parser that matches one or more whitespace characters. Returns a
 * single space character as its result, regardless of which whitespace
 * characters were matched.
 *
 * @returns {core.Parser}
 * @memberof strings
 */
function spaces() {
  return or(and(space(), skip(space()), value(" ")), expected("spaces"));
}

/**
 * Returns a parser that collects zero or more tokens matching `parser`. The
 * result is returned as a single string.
 *
 * @param {core.Parser} [parser=token()] - Parser to use to collect the results.
 * @param {String} [parserName] - name for `parser`. Used for error reporting.
 * @memberof strings
 */
function text(parser, parserName) {
  if (!parser) {
    parserName = "token";
    parser = token();
  }
  return or(stringOf(oneOrMore(parser)),
            expected("text"+ (typeof parserName !== "undefined" ?
                              " of {"+parserName+"}" :
                              "")));
}

/**
 * Number-related parsers and combinators
 *
 * @namespace numbers
 */

/**
 * Returns a parser that matches a single digit from the input, returning the
 * number represented by that digit as its value.
 *
 * @param {integer} [base=10] - Base to use when parsing the digit.
 * @returns {core.Parser}
 * @memberof numbers
 */
function digit(base) {
  base = base || 10;
  return sequence(function(s) {
    var c = s(token()),
        digit = s(value(parseInt(c, base)));
    return isNaN(digit) ? fail("invalid digit") : value(digit);
  });
}

/**
 * Returns a parser that matches a natural number. That is, a number without a
 * positive/negative sign or decimal places, and returns a positive integer.
 *
 * @param {integer} [base=10] - Base to use when parsing the number.
 * @returns {core.Parser}
 * @memberof numbers
 */
function naturalNumber(base) {
  base = base || 10;
  return sequence(function(s) {
    var xs = s(oneOrMore(digitCharacter(base)));
    return value(parseInt(xs.join(""), base));
  });
}

/**
 * Returns a parser that matches an integer, with an optional + or - sign.
 *
 * @param {integer} [base=10] - Base to use when parsing the integer.
 * @returns {core.Parser}
 * @memberof numbers
 */
function integer(base) {
  base = base || 10;
  return sequence(function(s) {
    var sign = s(maybe(or(character("+"),
                          character("-")))),
        num = s(naturalNumber(base));
    return value(num * (sign === "-" ? -1 : 1));
  });
}

module.exports = {
  // API
  parse: parse,
  // Base parsers
  value: value,
  bind: bind,
  fail: fail,
  expected: expected,
  token: token,
  eof: eof,
  log: log,
  delay: delay,
  // Combinators
  and: and,
  or: or,
  maybe: maybe,
  not: not,
  unless: unless,
  sequence: sequence,
  followedBy: followedBy,
  separatedBy: separatedBy,
  zeroOrMore: zeroOrMore,
  oneOrMore: oneOrMore,
  between: between,
  skip: skip,
  // String-related parsers
  satisfies: satisfies,
  stringOf: stringOf,
  character: character,
  oneOf: oneOf,
  noneOf: noneOf,
  string: string,
  digitCharacter: digitCharacter,
  space: space,
  spaces: spaces,
  text: text,
  // Numbers
  digit: digit,
  naturalNumber: naturalNumber,
  integer: integer
};

/*
 * Internals
 */
function copy(obj) {
  var newObj = Object.create(Object.getPrototypeOf(obj));
  for (var key in obj) {
    if (obj.hasOwnProperty(key)) {
      newObj[key] = obj[key];
    }
  }
  return newObj;
}

function attr(obj, name, arg) {
  if (arguments.length < 2) {
    return copy(obj);
  } else if (arguments.length < 3) {
    return obj[name];
  } else {
    var newObj = copy(obj);
    newObj[name] = (typeof arg === "function") ?
      arg(obj[name]) :
      arg;
    return newObj;
  }
}

function mergeErrors(err1, err2) {
  if (!err1 || (!err1.messages.length && err2.messages.length)) {
    return err2;
  } else if (!err2 || (!err2.messages.length && err1.messages.length)) {
    return err1;
  } else {
    return new ParseError(err1.position,
                          err1.messages.concat(err2.messages),
                          err1.type || err2.type);
  }
}

function ParserState(value, restOfInput, userState,
                     position, hasConsumed, error) {
  this.value = value;
  this.restOfInput = restOfInput;
  this.position = position;
  this.userState = userState;
  this.error = error;
}

},{}]},{},[1])(1)
});
;