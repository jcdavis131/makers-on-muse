/* GET /api/run-state?run_id= — one-shot snapshot for initial page loads.
   run_id=latest resolves the current live run. Unknown run -> 404.
   Storage missing -> honest 503. */

"use strict";

var lib = require("./_lib");

async function resolveId(store, runId) {
  if (runId === "latest") {
    var cur = await store.get(lib.KEYS.runsCurrent);
    return cur === null || cur === undefined ? null : String(cur);
  }
  return runId;
}

module.exports = async function handler(req, res) {
  if (!lib.methodOnly(res, req, ["GET"])) return;

  var runId = String((req.query && req.query.run_id) || "");
  if (!runId) return lib.json(res, 400, { error: "query param run_id is required" });

  var store = lib.getStore();
  if (!store) return lib.json(res, 503, { error: "storage unavailable" });

  try {
    var id = await resolveId(store, runId);
    if (!id) return lib.json(res, 404, { error: "no live run right now" });
    var meta = await store.get(lib.KEYS.runMeta(id));
    if (!meta) return lib.json(res, 404, { error: "unknown run" });
    var events = await store.lrange(lib.KEYS.runEvents(id), 0, -1);
    lib.json(res, 200, { meta: meta, events: events || [] });
  } catch (e) {
    lib.json(res, 503, { error: "storage unavailable" });
  }
};
