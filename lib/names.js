/* Makers on Muse — rules for player handles and agent names. Pure, zero deps.

   Handle: the player's private name for this week. 3-24 characters,
   letters, digits, "-" and "_", starting with a letter or digit. One
   entry per handle per week. Compared case-insensitively.

   Agent name: shown on the leaderboard when the player opts in. 2-40
   characters: letters (including accented Latin letters), digits,
   spaces and . ' - _, starting with a letter or digit.

   Both are refused when they look like an email address, a web address
   or a phone number, or when they use a reserved name: the site, its
   mascot and agents, Meta's product names, or staff-sounding words.
   Camel case counts as a word break, so "MetaMuse" is refused like
   "Meta Muse".
   Every check works on at most 40 characters, so none of them can be
   slow. */

"use strict";

var HANDLE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{2,23}$/;
var AGENT_MIN = 2;
var AGENT_MAX = 40;
var AGENT_CHARS = /^[A-Za-z0-9À-ÖØ-öø-ÿ][A-Za-z0-9À-ÖØ-öø-ÿ .'_-]*$/;
var MAX_DIGITS = 6;

/* Whole words, compared after folding case, accents and look-alike digits. */
var RESERVED_WORDS = [
  "mabel", "scout", "meta", "muse", "makersonmuse",
  "admin", "administrator", "moderator", "mod", "mods",
  "official", "support", "system", "root",
  "anonymous", "null", "undefined"
];
/* Anywhere in the name once spaces and punctuation are removed. */
var RESERVED_PARTS = ["makersonmuse", "mabel", "scout", "metaai", "museai"];
["meta", "muse"].forEach(function (brand) {
  ["official", "admin", "support", "staff", "team", "bot"].forEach(function (role) {
    RESERVED_PARTS.push(brand + role, role + brand);
  });
});

var LEET_I = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b" };
var LEET_L = { "0": "o", "1": "l", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b" };

function fold(s, leet) {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[0134578]/g, function (c) { return leet[c]; });
}

/* Word breaks inside camel case: "MetaMuse" -> "Meta Muse",
   "MUSEBot" -> "MUSE Bot", "Team4Muse" -> "Team4 Muse". */
function splitCamel(s) {
  return s.replace(/([\p{Ll}0-9])(?=\p{Lu})/gu, "$1 ").replace(/(\p{Lu})(?=\p{Lu}\p{Ll})/gu, "$1 ");
}

function isReserved(name) {
  var split = splitCamel(String(name));
  var folds = [fold(split, LEET_I), fold(split, LEET_L)];
  for (var f = 0; f < folds.length; f++) {
    var words = folds[f].split(/[^a-z]+/).filter(Boolean);
    var joined = words.join("");
    for (var i = 0; i < words.length; i++) {
      if (RESERVED_WORDS.indexOf(words[i]) !== -1) return true;
    }
    if (RESERVED_WORDS.indexOf(joined) !== -1) return true;
    for (var j = 0; j < RESERVED_PARTS.length; j++) {
      if (joined.indexOf(RESERVED_PARTS[j]) !== -1) return true;
    }
  }
  return false;
}

/* The shape problem with a name, or null. */
function shapeProblem(name) {
  if (name.indexOf("@") !== -1) return "can't look like an email address";
  if (/:\/\/|(^|[^A-Za-z])www\./i.test(name) ||
      /[A-Za-z0-9-]\.[A-Za-z]{2,}(?![A-Za-z])/.test(name)) {
    return "can't look like a web address";
  }
  var digits = name.replace(/[^0-9]/g, "").length;
  if (digits > MAX_DIGITS) return "can't look like a phone number (use " + MAX_DIGITS + " digits or fewer)";
  return null;
}

/* The storage key for a handle: handles compare case-insensitively. */
function handleKey(handle) {
  return String(handle).toLowerCase();
}

/* checkHandle(raw) -> { ok, value, key, error } */
function checkHandle(raw) {
  if (typeof raw !== "string") return { ok: false, error: "handle: required, a string" };
  var s = raw.trim();
  if (s.length > 64) return { ok: false, error: "handle: 3 to 24 characters" };
  var shape = shapeProblem(s);
  if (shape) return { ok: false, error: "handle: " + shape };
  if (!HANDLE_RE.test(s)) {
    return { ok: false, error: "handle: 3 to 24 characters: letters, digits, - and _, starting with a letter or digit" };
  }
  if (isReserved(s)) return { ok: false, error: "handle: that name is reserved" };
  return { ok: true, value: s, key: handleKey(s) };
}

/* checkAgent(raw) -> { ok, value, error }. Runs of spaces become one. */
function checkAgent(raw) {
  if (typeof raw !== "string") return { ok: false, error: "agent: required, a string" };
  var s = raw.trim();
  if (s.length > 200) return { ok: false, error: "agent: " + AGENT_MIN + " to " + AGENT_MAX + " characters" };
  s = s.replace(/\s+/g, " ");
  if (s.length < AGENT_MIN || s.length > AGENT_MAX) {
    return { ok: false, error: "agent: " + AGENT_MIN + " to " + AGENT_MAX + " characters" };
  }
  var shape = shapeProblem(s);
  if (shape) return { ok: false, error: "agent: " + shape };
  if (!AGENT_CHARS.test(s)) {
    return { ok: false, error: "agent: letters, digits, spaces and . ' - _ only, starting with a letter or digit" };
  }
  if (isReserved(s)) return { ok: false, error: "agent: that name is reserved" };
  return { ok: true, value: s };
}

module.exports = {
  AGENT_MAX: AGENT_MAX,
  RESERVED_WORDS: RESERVED_WORDS,
  handleKey: handleKey,
  checkHandle: checkHandle,
  checkAgent: checkAgent,
  isReserved: isReserved
};
