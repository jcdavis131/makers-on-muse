/* Makers on Muse — submission validation. Pure, zero deps.

   Strict: every object has a key allowlist, and any other key is an
   error. On success it returns `value`, a clean copy that holds only the
   known fields, with names normalized. The API builds its record from
   `value` and never from the raw body. */

"use strict";

var names = require("./names");
var packs = require("./packs");

var TOP_KEYS = ["week", "handle", "agent", "levels", "consent"];
var LEVEL_KEYS = ["n", "answer", "tokens_est", "seconds", "procedure", "evidence", "correct", "procedure_score"];
var CONSENT_KEYS = ["redaction", "publish"];

var ANSWER_MAX = 4000;
var PROCEDURE_MAX = 2000;
var EVIDENCE_MAX = 500;
var EVIDENCE_COUNT = 5;
var LEVELS_MAX = 5;
var TOKENS_MAX = 10000000;
var SECONDS_MAX = 7 * 24 * 60 * 60;
var URL_RE = /^https?:\/\/[^\s/$.?#][^\s]*$/i;

function isInt(n) { return typeof n === "number" && isFinite(n) && Math.floor(n) === n; }
function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }

/* Report unknown keys, at most 5, with names cut to 40 characters. */
function unknownKeys(obj, allowed, where, errors) {
  var extra = Object.keys(obj).filter(function (k) { return allowed.indexOf(k) === -1; });
  extra.slice(0, 5).forEach(function (k) {
    errors.push(where + ": unknown field " + JSON.stringify(k.slice(0, 40)));
  });
  if (extra.length > 5) errors.push(where + ": " + (extra.length - 5) + " more unknown fields");
  return extra.length;
}

function checkRange(v, min, max, where, label, errors) {
  if (typeof v !== "number" || !isFinite(v) || v < min || v > max) {
    errors.push(where + ": required, " + label);
    return false;
  }
  return true;
}

function checkLevel(lv, idx, errors) {
  var where = "levels[" + idx + "]";
  if (!isObj(lv)) {
    errors.push(where + ": must be an object");
    return null;
  }
  if (unknownKeys(lv, LEVEL_KEYS, where, errors)) return null;
  if (!isInt(lv.n) || lv.n < 1 || lv.n > 5) {
    errors.push(where + ".n: must be an integer 1..5");
    return null;
  }
  var ok = true;
  if (typeof lv.answer !== "string" || !lv.answer.trim()) {
    errors.push(where + ".answer: required, non-empty string"); ok = false;
  } else if (lv.answer.length > ANSWER_MAX) {
    errors.push(where + ".answer: max " + ANSWER_MAX + " chars"); ok = false;
  }
  ok = checkRange(lv.tokens_est, 1, TOKENS_MAX, where + ".tokens_est", "a number from 1 to " + TOKENS_MAX, errors) && ok;
  ok = checkRange(lv.seconds, 1, SECONDS_MAX, where + ".seconds", "a number from 1 to " + SECONDS_MAX, errors) && ok;
  if (typeof lv.procedure !== "string" || !lv.procedure.trim()) {
    errors.push(where + ".procedure: required — describe the steps your agent took"); ok = false;
  } else if (lv.procedure.length > PROCEDURE_MAX) {
    errors.push(where + ".procedure: max " + PROCEDURE_MAX + " chars"); ok = false;
  }
  if (lv.evidence !== undefined) {
    if (!Array.isArray(lv.evidence) || lv.evidence.length > EVIDENCE_COUNT) {
      errors.push(where + ".evidence: an array of up to " + EVIDENCE_COUNT + " URLs"); ok = false;
    } else {
      lv.evidence.forEach(function (u, i) {
        if (typeof u !== "string" || u.length > EVIDENCE_MAX || !URL_RE.test(u)) {
          errors.push(where + ".evidence[" + i + "]: must be an http(s) URL of " + EVIDENCE_MAX + " chars or fewer");
          ok = false;
        }
      });
    }
  }
  // Optional self-attested scoring inputs (provisional only — see lib/score.js)
  if (lv.correct !== undefined && lv.correct !== 0 && lv.correct !== 1) {
    errors.push(where + ".correct: must be 0 or 1 (self-attested)"); ok = false;
  }
  if (lv.procedure_score !== undefined &&
      (typeof lv.procedure_score !== "number" || !(lv.procedure_score >= 0 && lv.procedure_score <= 1))) {
    errors.push(where + ".procedure_score: must be a number 0..1 (self-assessed)"); ok = false;
  }
  if (!ok) return null;
  var out = {
    n: lv.n,
    answer: lv.answer,
    tokens_est: lv.tokens_est,
    seconds: lv.seconds,
    procedure: lv.procedure
  };
  if (lv.evidence !== undefined) out.evidence = lv.evidence.slice();
  if (lv.correct !== undefined) out.correct = lv.correct;
  if (lv.procedure_score !== undefined) out.procedure_score = lv.procedure_score;
  return out;
}

/* validateSubmission(body) -> { ok, errors[], value } */
function validateSubmission(body) {
  var errors = [];
  if (!isObj(body)) {
    return { ok: false, errors: ["body: must be a JSON object"], value: null };
  }
  unknownKeys(body, TOP_KEYS, "body", errors);

  if (!isInt(body.week) || body.week < 1) {
    errors.push("week: required, integer >= 1");
  } else if (!packs.byWeek(body.week)) {
    errors.push("week: no pack for week " + body.week + " (known: " + packs.weeks().join(", ") + ")");
  }

  var handle = names.checkHandle(body.handle);
  if (!handle.ok) errors.push(handle.error);
  var agent = names.checkAgent(body.agent);
  if (!agent.ok) errors.push(agent.error);

  var levels = [];
  if (!Array.isArray(body.levels) || !body.levels.length) {
    errors.push("levels: required, non-empty array");
  } else if (body.levels.length > LEVELS_MAX) {
    errors.push("levels: at most " + LEVELS_MAX);
  } else {
    var seen = {};
    body.levels.forEach(function (lv, i) {
      var clean = checkLevel(lv, i, errors);
      if (lv && isInt(lv.n)) {
        if (seen[lv.n]) errors.push("levels: duplicate level n=" + lv.n);
        seen[lv.n] = true;
      }
      if (clean) levels.push(clean);
    });
    [1, 2, 3, 4].forEach(function (n) {
      if (!seen[n]) errors.push("levels: level " + n + " is required");
    });
  }

  var c = body.consent;
  if (!isObj(c)) {
    errors.push("consent: required object");
  } else {
    unknownKeys(c, CONSENT_KEYS, "consent", errors);
    if (c.redaction !== true) {
      errors.push("consent.redaction: must be true — submissions are redacted before storage");
    }
    if (typeof c.publish !== "boolean") {
      errors.push("consent.publish: must be true or false (show my agent name on the leaderboard)");
    }
  }

  if (errors.length) return { ok: false, errors: errors, value: null };
  levels.sort(function (a, b) { return a.n - b.n; });
  return {
    ok: true,
    errors: [],
    value: {
      week: body.week,
      handle: handle.value,
      handle_key: handle.key,
      agent: agent.value,
      levels: levels,
      consent: { redaction: true, publish: c.publish }
    }
  };
}

module.exports = {
  TOP_KEYS: TOP_KEYS,
  LEVEL_KEYS: LEVEL_KEYS,
  validateSubmission: validateSubmission
};
