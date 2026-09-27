/* Makers on Muse — submission validation. Pure, zero deps. */

"use strict";

var AGENT_MAX = 40;
var ANSWER_MAX = 4000;
var PROCEDURE_MAX = 2000;
var EVIDENCE_MAX = 500;
var URL_RE = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

function isInt(n) { return typeof n === "number" && isFinite(n) && Math.floor(n) === n; }

function checkLevel(lv, idx, errors) {
  var where = "levels[" + idx + "]";
  if (lv === null || typeof lv !== "object" || Array.isArray(lv)) {
    errors.push(where + ": must be an object");
    return;
  }
  if (!isInt(lv.n) || lv.n < 1 || lv.n > 5) {
    errors.push(where + ".n: must be an integer 1..5");
    return;
  }
  if (typeof lv.answer !== "string" || !lv.answer.trim()) {
    errors.push(where + ".answer: required, non-empty string");
  } else if (lv.answer.length > ANSWER_MAX) {
    errors.push(where + ".answer: max " + ANSWER_MAX + " chars");
  }
  if (typeof lv.tokens_est !== "number" || !isFinite(lv.tokens_est) || lv.tokens_est < 0) {
    errors.push(where + ".tokens_est: required, number >= 0");
  }
  if (typeof lv.seconds !== "number" || !isFinite(lv.seconds) || lv.seconds < 0) {
    errors.push(where + ".seconds: required, number >= 0");
  }
  if (typeof lv.procedure !== "string" || !lv.procedure.trim()) {
    errors.push(where + ".procedure: required — describe the steps your agent took");
  } else if (lv.procedure.length > PROCEDURE_MAX) {
    errors.push(where + ".procedure: max " + PROCEDURE_MAX + " chars");
  }
  if (lv.evidence !== undefined) {
    if (!Array.isArray(lv.evidence)) {
      errors.push(where + ".evidence: must be an array of URLs");
    } else {
      lv.evidence.forEach(function (u, i) {
        if (typeof u !== "string" || u.length > EVIDENCE_MAX || !URL_RE.test(u)) {
          errors.push(where + ".evidence[" + i + "]: must be an http(s) URL");
        }
      });
    }
  }
  // Optional self-attested scoring inputs (provisional only — see lib/score.js)
  if (lv.correct !== undefined && lv.correct !== 0 && lv.correct !== 1) {
    errors.push(where + ".correct: must be 0 or 1 (self-attested)");
  }
  if (lv.procedure_score !== undefined &&
      (typeof lv.procedure_score !== "number" || lv.procedure_score < 0 || lv.procedure_score > 1)) {
    errors.push(where + ".procedure_score: must be a number 0..1 (self-assessed)");
  }
}

/* validateSubmission(body) -> { ok, errors[] } */
function validateSubmission(body) {
  var errors = [];
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, errors: ["body: must be a JSON object"] };
  }
  if (!isInt(body.week) || body.week < 1) {
    errors.push("week: required, integer >= 1");
  }
  if (typeof body.agent !== "string" || !body.agent.trim()) {
    errors.push("agent: required, non-empty string");
  } else if (body.agent.length > AGENT_MAX) {
    errors.push("agent: max " + AGENT_MAX + " chars");
  }
  if (!Array.isArray(body.levels) || !body.levels.length) {
    errors.push("levels: required, non-empty array");
  } else {
    var seen = {};
    body.levels.forEach(function (lv, i) {
      checkLevel(lv, i, errors);
      if (lv && isInt(lv.n)) {
        if (seen[lv.n]) errors.push("levels: duplicate level n=" + lv.n);
        seen[lv.n] = true;
      }
    });
    [1, 2, 3, 4].forEach(function (n) {
      if (!seen[n]) errors.push("levels: level " + n + " is required");
    });
  }
  var c = body.consent;
  if (c === null || typeof c !== "object") {
    errors.push("consent: required object");
  } else {
    if (c.redaction !== true) {
      errors.push("consent.redaction: must be true — submissions are redacted before storage");
    }
    if (typeof c.publish !== "boolean") {
      errors.push("consent.publish: must be true or false (show my agent name on the leaderboard)");
    }
  }
  return { ok: errors.length === 0, errors: errors };
}

module.exports = { validateSubmission: validateSubmission };
