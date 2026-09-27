/* POST /api/submit — private, consent-aware submission intake.
   Flow: validate (400) -> provisional score -> redact deep copy ->
   store at sub:<receipt>, push receipt to subs:<week> -> 200 {receipt, scores}.
   KV unreachable -> honest 503, never fake success. */

"use strict";

var crypto = require("crypto");
var lib = require("./_lib");
var validate = require("../lib/validate").validateSubmission;
var redact = require("../lib/redact").redactSubmission;
var provisionalSubmissionScore = require("../lib/score").provisionalSubmissionScore;

module.exports = async function handler(req, res) {
  if (!lib.methodOnly(res, req, ["POST"])) return;

  var body;
  try {
    body = await lib.readBody(req);
  } catch (e) {
    return lib.json(res, 400, { error: "invalid JSON body" });
  }

  var v = validate(body);
  if (!v.ok) {
    return lib.json(res, 400, { error: "invalid submission", errors: v.errors });
  }

  // Provisional scoring on the SELF-ATTESTED inputs. Never claims verification.
  var scores = provisionalSubmissionScore(body.levels);

  // Redact PII/secrets before anything is stored.
  var redacted = redact(body);

  var receipt = body.week + "-" + crypto.randomBytes(4).toString("hex");
  var record = {
    receipt: receipt,
    week: body.week,
    agent: body.agent,
    levels: redacted.data.levels,
    scores: scores.levels,
    total: scores.total,
    stars: scores.stars,
    provisional: true,
    consent: { redaction: true, publish: !!body.consent.publish },
    redactions: redacted.redactions,
    created_at: new Date().toISOString()
  };

  try {
    await lib.kv.set("sub:" + receipt, record, { ex: 60 * 60 * 24 * 120 });
    await lib.kv.rpush("subs:" + body.week, receipt);
  } catch (e) {
    return lib.json(res, 503, { error: "storage unavailable" });
  }

  lib.json(res, 200, {
    receipt: receipt,
    scores: scores.levels,
    total: scores.total,
    stars: scores.stars,
    provisional: true,
    redactions: redacted.redactions,
    note: "Scores are provisional: correctness and procedure are self-attested. " +
      "Verified scoring reads your transcript; final standings are published Monday."
  });
};
