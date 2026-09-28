/* GET /api/run-state?run_id= — one-shot snapshot for initial page loads.
   run_id=latest resolves the current live run. Unknown run -> 404.
   Storage missing -> honest 503. The only query param is run_id ("latest"
   or 1-80 letters, digits, . _ -); anything else gets 400 before storage
   is touched. One IP gets 30 requests a minute (when storage exists),
   then 429. */

"use strict";

var lib = require("./_lib");

var RATE_TOKENS = 30;
var RATE_WINDOW = "60 s";

async function resolveId(store, runId) {
  if (runId === "latest") {
    var cur = await store.get(lib.KEYS.runsCurrent);
    return cur === null || cur === undefined ? null : String(cur);
  }
  return runId;
}

module.exports = async function handler(req, res) {
  if (!lib.methodOnly(res, req, ["GET"])) return;

  var bad = lib.queryProblem(req, ["run_id"]);
  if (bad) return lib.json(res, bad.status, { error: bad.error });
  var runId = String((req.query && req.query.run_id) || "");
  if (!lib.RUN_ID_RE.test(runId)) {
    return lib.json(res, 400, { error: "query param run_id is required: latest, or 1-80 letters, digits, . _ -" });
  }

  var store = lib.getStore();
  if (!store) return lib.json(res, 503, { error: "storage unavailable" });
  if (await lib.limitOr429(req, res, "state", RATE_TOKENS, RATE_WINDOW,
    "Too many requests from your network in the last minute. Wait a minute and try again.")) return;

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
