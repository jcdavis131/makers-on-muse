/* Makers on Muse — pattern redaction. Pure functions, zero deps.

   What it strips: email addresses, US and international phone numbers,
   US Social Security numbers, card numbers (Luhn-checked), street
   addresses, and API keys and tokens (known prefixes such as sk-, ghp_,
   Stripe and Google keys, Bearer tokens, JWTs, long hex and long
   base64-like strings). It can't catch everything, and it doesn't know
   names, so players are told to leave personal details out.

   Web addresses are kept, because graders need the sources. Only the
   query string and fragment are checked: values under keys like token,
   key, email or password are removed, and other values go through the
   same patterns.

   Every pattern runs in linear time. Each quantifier is bounded, or the
   pattern can only start at the first character of a run (a lookbehind
   guard), so no match attempt rescans the rest of the text. A 64 KB
   adversarial string redacts in a few milliseconds (scripts/smoke.mjs). */

"use strict";

var URL_SPAN = /\bhttps?:\/\/[^\s<>"'`]{1,2048}/gi;

var SENSITIVE_PARAM = /^(?:token|access_token|refresh_token|id_token|auth|authorization|api[_-]?key|apikey|key|secret|client_secret|password|passwd|pass|pwd|sig|signature|code|session|session_id|sessionid|sid|email|e-mail|mail|phone|tel|ssn)$/i;

function luhnOk(digits) {
  var sum = 0, dbl = false;
  for (var i = digits.length - 1; i >= 0; i--) {
    var d = digits.charCodeAt(i) - 48;
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

/* Each entry: re (global), label, and an optional keep(match) that says
   "not really a hit, leave it". Order matters: longer, more specific
   patterns first. */
var PATTERNS = [
  { // Bearer tokens
    re: /\b[Bb]earer[ \t]{1,4}[A-Za-z0-9\-._~+/]{10,4096}=*/g,
    label: "Bearer [token redacted]"
  },
  { // JWTs
    re: /\beyJ[A-Za-z0-9_-]{5,4096}\.[A-Za-z0-9_-]{5,4096}(?:\.[A-Za-z0-9_-]{0,4096})?/g,
    label: "[token redacted]"
  },
  { // Known key and token prefixes
    re: /(?<![A-Za-z0-9_-])(?:sk-(?:ant-|proj-)?[A-Za-z0-9_-]{8,512}|(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{8,512}|whsec_[A-Za-z0-9]{8,512}|gh[opusr]_[A-Za-z0-9]{8,512}|github_pat_[A-Za-z0-9_]{8,512}|glpat-[A-Za-z0-9_-]{8,512}|xox[abprs]-[A-Za-z0-9-]{8,512}|A[KS]IA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|ya29\.[0-9A-Za-z_-]{20,2048}|hf_[A-Za-z0-9]{20,512})/g,
    label: "[token redacted]"
  },
  { // Long hex runs (32+): API keys, session ids
    re: /(?<![0-9A-Fa-f])[0-9A-Fa-f]{32,}(?![0-9A-Fa-f])/g,
    label: "[token redacted]"
  },
  { // Long base64-like runs (40+) with both letters and digits
    re: /(?<![A-Za-z0-9+_=-])[A-Za-z0-9+_-]{40,}={0,2}(?![A-Za-z0-9+_=-])/g,
    label: "[token redacted]",
    keep: function (m) { return !(/[0-9]/.test(m) && /[A-Za-z]/.test(m)); }
  },
  { // Card numbers: 13-19 digits, optional single spaces or dashes, Luhn-valid
    re: /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g,
    label: "[card redacted]",
    keep: function (m) { return !luhnOk(m.replace(/[ -]/g, "")); }
  },
  { // US Social Security numbers
    re: /(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)/g,
    label: "[ssn redacted]"
  },
  { // International numbers: + then 8-15 digits with separators
    re: /(?<![\w+])\+\d[\d ().-]{6,18}\d(?!\d)/g,
    label: "[phone redacted]",
    keep: function (m) { var n = m.replace(/\D/g, "").length; return n < 8 || n > 15; }
  },
  { // US numbers: (512) 555-1234, 512-555-1234, 512.555.1234, 1-512-555-1234
    re: /(?<![\w+])(?:1[ .-]?)?(?:\(\d{3}\)[ .-]?|\d{3}[ .-]?)\d{3}[ .-]?\d{4}(?!\d)/g,
    label: "[phone redacted]"
  },
  { // Email addresses (local part starts at a run start, max 64)
    re: /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){1,8}/g,
    label: "[email redacted]"
  },
  { // Street addresses: number, 1-4 capitalized words, a street suffix
    re: /(?<!\d)\d{1,5}[ \t]{1,3}[A-Z][a-z]{1,20}(?:[ \t]{1,3}[A-Z][a-z]{1,20}){0,3}[ \t]{1,3}(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Ln|Lane|Dr|Drive|Ct|Court|Pl|Place|Way|Ter|Terrace|Pkwy|Parkway|Hwy|Highway|Cir|Circle)\b\.?/g,
    label: "[address redacted]"
  }
];

function applyPatterns(text, count) {
  var out = text;
  for (var i = 0; i < PATTERNS.length; i++) {
    var p = PATTERNS[i];
    p.re.lastIndex = 0;
    out = out.replace(p.re, function (m) {
      if (p.keep && p.keep(m)) return m;
      count.n++;
      return p.label;
    });
  }
  return out;
}

/* Keep scheme, host and path. Check each query and fragment value. */
function redactUrl(url, count) {
  var cut = url.search(/[?#]/);
  if (cut === -1) return url;
  var head = url.slice(0, cut);
  var tail = url.slice(cut);
  return head + tail.replace(/([?#&;])([^=&#;?]{0,256})=([^&#;]*)/g, function (all, sep, key, val) {
    if (!val) return all;
    var decoded = val;
    try { decoded = decodeURIComponent(val.replace(/\+/g, " ")); } catch (e) { /* keep raw */ }
    if (SENSITIVE_PARAM.test(key)) { count.n++; return sep + key + "=[redacted]"; }
    var before = count.n;
    applyPatterns(decoded, count);
    if (count.n !== before) return sep + key + "=[redacted]";
    return all;
  });
}

function redactWithCount(text, count) {
  if (typeof text !== "string" || !text) return text;
  var out = "";
  var last = 0;
  URL_SPAN.lastIndex = 0;
  var m;
  while ((m = URL_SPAN.exec(text)) !== null) {
    out += applyPatterns(text.slice(last, m.index), count) + redactUrl(m[0], count);
    last = m.index + m[0].length;
  }
  return out + applyPatterns(text.slice(last), count);
}

/* redactPII(text) -> string. Non-strings pass through untouched. */
function redactPII(text) {
  return redactWithCount(text, { n: 0 });
}

/* redactEvidenceUrl(url) -> string. For validated evidence URLs: only
   the query and fragment are checked. */
function redactEvidenceUrl(url) {
  return redactUrl(url, { n: 0 });
}

/* redactSubmission(sub) -> { data: { levels }, redactions }.
   Known fields only: each level's answer and procedure are redacted,
   evidence URLs keep everything but matching query values, and numbers
   pass through. The input is a validated submission (lib/validate.js),
   so nothing else can be in it. Never mutates the input. */
function redactSubmission(sub) {
  var count = { n: 0 };
  var levels = (sub && Array.isArray(sub.levels) ? sub.levels : []).map(function (lv) {
    var out = {
      n: lv.n,
      answer: redactWithCount(lv.answer, count),
      procedure: redactWithCount(lv.procedure, count),
      tokens_est: lv.tokens_est,
      seconds: lv.seconds
    };
    if (lv.evidence) out.evidence = lv.evidence.map(function (u) { return redactUrl(u, count); });
    if (lv.correct !== undefined) out.correct = lv.correct;
    if (lv.procedure_score !== undefined) out.procedure_score = lv.procedure_score;
    return out;
  });
  return { data: { levels: levels }, redactions: count.n };
}

module.exports = {
  redactPII: redactPII,
  redactEvidenceUrl: redactEvidenceUrl,
  redactSubmission: redactSubmission
};
