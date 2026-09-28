/* POST /api/submit — private submission intake.

   Order of checks (cheapest first; nothing reads the body until the
   request passes the gates that need no body):
     405 not POST
     403 foreign Origin
     415 not application/json
     413 declared or measured body over 64 KB
     429 more than 5 posts from one IP in a minute (when storage exists)
     400 invalid JSON, unknown key, bad field, unknown week
     409 week not open (window from data/packs), or handle already entered
     503 no storage, or a storage error. Never a fake success.
   On success: 200 with the receipt code (display only), the secret token
   (shown once; only its hash is stored) and provisional scores.

   Scores come from the week's pack manifest (data/packs/, via
   lib/packs.js): its pars, blends and star rule. Each record carries the
   manifest's id, version and hash, so a score can be traced to the exact
   numbers it was computed with.

   Keys, all expiring 90 days after the week closes:
     mom:handle:<pack>:<handle>  claim, one entry per handle per week
                                 (60 s while "pending", until the write lands)
     mom:sub:<code>              the redacted record
     mom:board:<pack>            sorted set of codes by provisional total
     mom:tok:<sha256(token)>     token hash -> code, for /api/receipt
   The record's status starts as "received". Nothing moves it to
   "under_review" or "verified" yet: grading isn't built. */

"use strict";

var lib = require("./_lib");
var packs = require("../lib/packs");
var token = require("../lib/token");
var validate = require("../lib/validate").validateSubmission;
var redact = require("../lib/redact").redactSubmission;
var provisionalSubmissionScore = require("../lib/score").provisionalSubmissionScore;

var RATE_TOKENS = 5;
var RATE_WINDOW = "60 s";
var CLAIM_TTL_S = 60;

async function bestEffort(fn) {
  try { await fn(); } catch (e) { /* storage already failing; nothing more to do */ }
}

module.exports = async function handler(req, res) {
  if (!lib.methodOnly(res, req, ["POST"])) return;

  var gate = lib.preflight(req);
  if (gate) return lib.json(res, gate.status, { error: gate.error });

  var limited = await lib.rateLimit(req, "submit", RATE_TOKENS, RATE_WINDOW);
  if (!limited.ok) {
    return lib.json(res, 429, {
      error: "too many requests",
      message: "Too many submissions from your network in the last minute. Wait a minute and try again. Nothing was filed."
    }, { "Retry-After": String(limited.retryAfter) });
  }

  var read = await lib.readJson(req);
  if (read.status !== 200) return lib.json(res, read.status, { error: read.error });

  var v = validate(read.value);
  if (!v.ok) {
    return lib.json(res, 400, { error: "invalid submission", errors: v.errors });
  }
  var sub = v.value;

  var pack = packs.byWeek(sub.week);
  var state = packs.state(pack, lib.now());
  if (state !== "open") {
    return lib.json(res, 409, {
      error: state === "before" ? "week not open yet" : "week closed",
      message: state === "before"
        ? "Week " + pack.week + " opens " + pack.opens_label + ". Nothing was filed."
        : "Week " + pack.week + " closed " + pack.closes_label + ". Nothing was filed.",
      opens: pack.opens,
      closes: pack.closes
    });
  }

  var store = lib.getStore();
  if (!store) return lib.json(res, 503, { error: "storage unavailable" });

  // Provisional scoring on the SELF-ATTESTED inputs, with this week's
  // manifest. Never claims verification.
  var scores = provisionalSubmissionScore(sub.levels, pack);
  var packStamp = { id: pack.id, version: pack.version, hash: packs.hash(pack) };
  // Redact the known text fields before anything is stored.
  var redacted = redact(sub);

  var exat = packs.expiresAt(pack);
  var handleKey = lib.KEYS.handle(pack.id, sub.handle_key);
  var boardKey = lib.KEYS.board(pack.id);

  try {
    // A short TTL on the claim: if this function dies before the final
    // write, the handle frees itself in a minute instead of 90 days.
    var claimed = await store.set(handleKey, "pending", { nx: true, ex: CLAIM_TTL_S });
    if (claimed === null) {
      return lib.json(res, 409, {
        error: "handle already entered",
        message: "The handle \"" + sub.handle + "\" already has an entry for Week " + pack.week +
          ". One entry per handle per week. To replace it, delete it on your receipt page with its " +
          "secret token, then file again. Nothing was filed."
      });
    }
  } catch (e) {
    return lib.json(res, 503, { error: "storage unavailable" });
  }

  var secret = token.newToken();
  var tokenHash = token.hashToken(secret);
  var code = null;
  try {
    for (var attempt = 0; attempt < 3 && !code; attempt++) {
      var candidate = token.newReceiptCode(pack.week);
      var record = {
        schema: 4,
        receipt: candidate,
        pack: pack.id,
        pack_version: packStamp.version,
        pack_hash: packStamp.hash,
        season: pack.season,
        week: pack.week,
        status: "received",
        handle: sub.handle,
        agent: sub.agent,
        levels: redacted.data.levels,
        scores: scores.levels,
        total: scores.total,
        stars: scores.stars,
        provisional: true,
        consent: { terms: true, publish: sub.consent.publish },
        redactions: redacted.redactions,
        token_hash: tokenHash,
        created_at: new Date(lib.now()).toISOString()
      };
      // Private: never published, never returned by any endpoint.
      if (sub.contact) record.contact = sub.contact;
      var ok = await store.set(lib.KEYS.sub(candidate), record, { nx: true, exat: exat });
      if (ok !== null) code = candidate;
    }
    if (!code) throw new Error("receipt code collision");
    await store.zadd(boardKey, { score: scores.total, member: code });
    await store.expireat(boardKey, exat);
    await store.set(lib.KEYS.token(tokenHash), code, { exat: exat });
    await store.set(handleKey, code, { exat: exat });
  } catch (e) {
    // Undo what landed so the handle can try again once storage is back.
    await bestEffort(function () { return store.del(handleKey); });
    if (code) {
      await bestEffort(function () { return store.del(lib.KEYS.sub(code), lib.KEYS.token(tokenHash)); });
      await bestEffort(function () { return store.zrem(boardKey, code); });
    }
    return lib.json(res, 503, { error: "storage unavailable" });
  }

  lib.json(res, 200, {
    receipt: code,
    token: secret,
    token_note: "Your secret token is shown once. Save it. Only a hash of it is stored, so it can't be recovered.",
    week: pack.week,
    pack: packStamp,
    status: "received",
    scores: scores.levels,
    total: scores.total,
    stars: scores.stars,
    max_total: scores.max_total,
    max_stars: scores.max_stars,
    provisional: true,
    redactions: redacted.redactions,
    expires: new Date(exat * 1000).toISOString(),
    note: "Scores are provisional: every input is self-reported and nothing is verified yet. " +
      "Server grading is not built yet."
  });
};
