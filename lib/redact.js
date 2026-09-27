/* Makers on Muse — PII / secret redaction. Pure functions, zero deps.
   Conservative by design: we would rather over-redact a submission than
   leak one email address onto a public leaderboard. */

"use strict";

var PATTERNS = [
  // Emails
  { re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, label: "[email redacted]" },
  // Bearer tokens: "Bearer abc123..."
  { re: /\b[Bb]earer\s+[A-Za-z0-9\-._~+/=]{10,}\b/g, label: "Bearer [token redacted]" },
  // Known secret prefixes: sk-, ghp_, gho_, ghu_, xoxb-/xoxp-/..., AKIA...
  {
    re: /\b(sk-[A-Za-z0-9_-]{8,}|gh[opusa]_[A-Za-z0-9]{8,}|github_pat_[A-Za-z0-9_]{8,}|xox[baprs]-[A-Za-z0-9-]{8,}|AKIA[0-9A-Z]{16})\b/g,
    label: "[token redacted]"
  },
  // Long hex runs (32+) and long base64-ish runs (40+) — API keys, session tokens
  { re: /\b[0-9a-fA-F]{32,}\b/g, label: "[token redacted]" },
  { re: /\b[A-Za-z0-9+/]{40,}={0,2}\b/g, label: "[token redacted]" },
  // US-style phone numbers (conservative: needs 10 digits with separators or parens)
  {
    re: /\b(?:\+?1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    label: "[phone redacted]"
  },
  // Street addresses (conservative: house number + capitalized words + street suffix)
  {
    re: /\b\d{1,5}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Ln|Lane|Dr|Drive|Ct|Court|Pl|Place|Way|Ter|Terrace)\b\.?/g,
    label: "[address redacted]"
  }
];

/* redactPII(text) -> string. Non-strings pass through untouched. */
function redactPII(text) {
  if (typeof text !== "string") return text;
  var out = text;
  for (var i = 0; i < PATTERNS.length; i++) {
    var p = PATTERNS[i];
    p.re.lastIndex = 0;
    out = out.replace(p.re, p.label);
  }
  return out;
}

/* redactSubmission(obj) -> { data, redactions }.
   Deep-walks plain objects/arrays, redacting every string. Never mutates input. */
function redactSubmission(obj) {
  var count = { n: 0 };

  function walk(v) {
    if (typeof v === "string") {
      var r = redactPII(v);
      if (r !== v) count.n++;
      return r;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v !== null && typeof v === "object") {
      var o = {};
      Object.keys(v).forEach(function (k) { o[k] = walk(v[k]); });
      return o;
    }
    return v;
  }

  return { data: walk(obj), redactions: count.n };
}

module.exports = { redactPII: redactPII, redactSubmission: redactSubmission };
