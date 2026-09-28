/* GET /api/health -> { ok, storage: "reachable"|"unreachable"|"missing", time }
   "missing": no storage env vars. "unreachable": configured, PING failed.
   Cached at the edge for 30 s so page checks don't each cost a PING.
   scripts/check-health.mjs fails a deploy check unless storage is
   "reachable". */

"use strict";

var lib = require("./_lib");

module.exports = async function handler(req, res) {
  if (!lib.methodOnly(res, req, ["GET"])) return;
  var storage = await lib.storeStatus();
  lib.json(res, 200, {
    ok: true,
    storage: storage,
    time: new Date().toISOString()
  }, { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" });
};
