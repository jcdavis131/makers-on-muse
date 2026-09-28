/* POST /api/receipt — the owner's view of one entry, by secret token.

   Body (JSON, strict): { "token": "mom_…", "action": "status" | "delete" }
   action defaults to "status". The token travels only in the POST body,
   never in a URL, so it isn't written to request logs. The receipt code
   is never accepted here: it is 32 bits and for display only.

   Order of checks, cheapest first:
     405 not POST
     403 foreign Origin, 415 not application/json, 413 over 64 KB
     429 more than 10 lookups from one IP in a minute (when storage exists)
     400 invalid JSON, unknown key, bad token format, bad action
     503 no storage, or a storage error
     404 no entry for this token. Unknown, expired and deleted tokens all
         get the same answer.
   status -> 200 with the entry's status and provisional scores.
   delete -> 200 { deleted: true }. It removes the board entry, the handle
   claim (so the handle can file again while the week is open), then the
   record and the token index. The token index goes last, so a delete cut
   short by a storage error can be retried with the same token. */

"use strict";

var lib = require("./_lib");
var names = require("../lib/names");
var packs = require("../lib/packs");
var token = require("../lib/token");

var RATE_TOKENS = 10;
var RATE_WINDOW = "60 s";
var KEYS_ALLOWED = ["token", "action"];
var ACTIONS = ["status", "delete"];
var STATUSES = ["received", "under_review", "verified"];

var NOT_FOUND = {
  error: "not found",
  message: "No entry matches this token. It may have been deleted, or it expired 90 days after its week closed."
};

function badRequest(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return "body: must be a JSON object";
  var extra = Object.keys(body).filter(function (k) { return KEYS_ALLOWED.indexOf(k) === -1; });
  if (extra.length) return "body: unknown field " + JSON.stringify(extra[0].slice(0, 40));
  if (typeof body.token !== "string" || !token.TOKEN_RE.test(body.token)) {
    return "token: the secret token from your receipt, which starts with mom_";
  }
  if (body.action !== undefined && ACTIONS.indexOf(body.action) === -1) {
    return "action: \"status\" or \"delete\"";
  }
  return null;
}

/* What the owner sees. Never the answers, the token hash or the contact
   address itself. */
function view(rec, code) {
  var pack = packs.byWeek(rec.week);
  var status = STATUSES.indexOf(rec.status) !== -1 ? rec.status : "received";
  return {
    receipt: code,
    season: rec.season,
    week: rec.week,
    status: status,
    created_at: rec.created_at,
    agent: rec.agent,
    handle: rec.handle,
    published: Boolean(rec.consent && rec.consent.publish),
    contact_on_file: Boolean(rec.contact),
    total: rec.total,
    stars: rec.stars,
    scores: (rec.scores || []).map(function (s) {
      if (s.exhibition) return { n: s.n, exhibition: true };
      if (s.skipped) return { n: s.n, skipped: true, total: 0, star: false };
      return { n: s.n, total: s.total, star: Boolean(s.star) };
    }),
    provisional: true,
    week_state: pack ? packs.state(pack, lib.now()) : "closed",
    expires: pack ? new Date(packs.expiresAt(pack) * 1000).toISOString() : null
  };
}

module.exports = async function handler(req, res) {
  if (!lib.methodOnly(res, req, ["POST"])) return;

  var gate = lib.preflight(req);
  if (gate) return lib.json(res, gate.status, { error: gate.error });

  var limited = await lib.rateLimit(req, "receipt", RATE_TOKENS, RATE_WINDOW);
  if (!limited.ok) {
    return lib.json(res, 429, {
      error: "too many requests",
      message: "Too many lookups from your network in the last minute. Wait a minute and try again."
    }, { "Retry-After": String(limited.retryAfter) });
  }

  var read = await lib.readJson(req);
  if (read.status !== 200) return lib.json(res, read.status, { error: read.error });
  var problem = badRequest(read.value);
  if (problem) return lib.json(res, 400, { error: "invalid request", errors: [problem] });
  var secret = read.value.token;
  var action = read.value.action || "status";

  var store = lib.getStore();
  if (!store) return lib.json(res, 503, { error: "storage unavailable" });

  var hash = token.hashToken(secret);
  var code, rec;
  try {
    code = await store.get(lib.KEYS.token(hash));
    if (code === null || code === undefined) return lib.json(res, 404, NOT_FOUND);
    code = String(code);
    rec = await store.get(lib.KEYS.sub(code));
  } catch (e) {
    return lib.json(res, 503, { error: "storage unavailable" });
  }
  // Defence in depth: the record must carry this token's hash.
  if (!rec || typeof rec !== "object" || !token.tokenMatches(secret, rec.token_hash)) {
    return lib.json(res, 404, NOT_FOUND);
  }

  if (action === "status") return lib.json(res, 200, view(rec, code));

  try {
    await store.zrem(lib.KEYS.board(rec.pack), code);
    var handleKey = lib.KEYS.handle(rec.pack, names.handleKey(rec.handle));
    var claim = await store.get(handleKey);
    if (claim !== null && String(claim) === code) await store.del(handleKey);
    await store.del(lib.KEYS.sub(code));
    await store.del(lib.KEYS.token(hash));
  } catch (e) {
    return lib.json(res, 503, {
      error: "storage unavailable",
      message: "The delete didn't finish. Try again with the same token."
    });
  }
  var pack = packs.byWeek(rec.week);
  lib.json(res, 200, {
    deleted: true,
    receipt: code,
    week: rec.week,
    can_refile: Boolean(pack) && packs.state(pack, lib.now()) === "open"
  });
};
