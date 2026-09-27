/* GET /api/run-state?run_id= — one-shot snapshot for initial page loads.
   run_id=latest resolves the current live run. Unknown run -> 404.
   KV missing -> honest 503. */

"use strict";

var lib = require("./_lib");

async function resolveId(runId) {
  if (runId === "latest") {
    var cur = await lib.kv.get("runs:current");
    return cur || null;
  }
  return runId;
}

module.exports = async function handler(req, res) {
  if (!lib.methodOnly(res, req, ["GET"])) return;

  var runId = String((req.query && req.query.run_id) || "");
  if (!runId) return lib.json(res, 400, { error: "query param run_id is required" });

  try {
    var id = await resolveId(runId);
    if (!id) return lib.json(res, 404, { error: "no live run right now" });
    var meta = await lib.kv.get("run:" + id + ":meta");
    if (!meta) return lib.json(res, 404, { error: "unknown run" });
    var events = await lib.kv.lrange("run:" + id + ":events", 0, -1);
    lib.json(res, 200, { meta: meta, events: events || [] });
  } catch (e) {
    lib.json(res, 503, { error: "storage unavailable" });
  }
};
