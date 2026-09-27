/* GET /api/health -> { ok, kv: "reachable"|"missing", time } */

"use strict";

var lib = require("./_lib");

module.exports = async function handler(req, res) {
  if (!lib.methodOnly(res, req, ["GET"])) return;
  var reachable = await lib.kvPing();
  lib.json(res, 200, {
    ok: true,
    kv: reachable ? "reachable" : "missing",
    time: new Date().toISOString()
  });
};
