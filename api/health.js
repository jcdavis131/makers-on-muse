/* GET /api/health -> { ok, storage: "reachable"|"unreachable"|"missing", time }
   "missing": no storage env vars. "unreachable": configured, PING failed.
   Cached at the edge for 30 s so page checks don't each cost a PING.
   It takes no query params: a request with any query string gets 400
   without a PING, so a cache-busting ?x=1 can't skip the edge cache and
   spend database commands. Past the cache, one IP gets 30 requests a
   minute (when storage exists), then 429.
   scripts/check-health.mjs fails a deploy check unless storage is
   "reachable". */

"use strict";

var lib = require("./_lib");

var RATE_TOKENS = 30;
var RATE_WINDOW = "60 s";

module.exports = async function handler(req, res) {
  if (!lib.methodOnly(res, req, ["GET"])) return;
  var bad = lib.queryProblem(req, []);
  if (bad) return lib.json(res, bad.status, { error: bad.error });
  if (await lib.limitOr429(req, res, "health", RATE_TOKENS, RATE_WINDOW,
    "Too many health checks from your network in the last minute. Wait a minute and try again.")) return;
  var storage = await lib.storeStatus();
  lib.json(res, 200, {
    ok: true,
    storage: storage,
    time: new Date().toISOString()
  }, { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" });
};
