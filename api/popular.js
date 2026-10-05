/* GET /api/popular — the aggregate popularity ranking.
   Returns the workflows ranked by usefulness (copies weigh 3x, opens 1x)
   and the setup tags ranked by taps. Counts only; no personal data.
   Workflow ids come from the shipped playbook-data.js, setup tags from
   the same allowlist the metric endpoint validates against — no index
   keys needed. 503 when storage is missing: the page then falls back to
   its curated featured list. */

"use strict";

var fs = require("fs");
var path = require("path");
var lib = require("./_lib");

var TOP_N = 20;

/* The setup tags the Playbook legend explains. Kept in sync with
   playbook.html and api/metric.js. */
var SETUP_TAGS = ["browser", "photo-upload", "gmail", "google-calendar",
  "spotify", "finances", "podcast", "phone"];

var workflowIds = null;
function knownWorkflowIds() {
  if (workflowIds) return workflowIds;
  workflowIds = [];
  try {
    var src = fs.readFileSync(path.join(__dirname, "..", "assets", "js", "playbook-data.js"), "utf8");
    var re = /"id": "([a-z0-9-]+)"/g, m, seen = {};
    while ((m = re.exec(src))) {
      if (!seen[m[1]]) { seen[m[1]] = true; workflowIds.push(m[1]); }
    }
  } catch (e) { workflowIds = []; }
  return workflowIds;
}

function key(type, id) { return "mom:metric:" + type + ":" + id; }

/* mget wrapper: the client returns an array aligned with the keys. */
async function mgetNums(store, keys) {
  if (!keys.length) return [];
  var vals = await store.mget(keys);
  return vals.map(function (v) {
    var n = parseInt(v, 10);
    return isNaN(n) ? 0 : n;
  });
}

async function handler(req, res) {
  if (!lib.methodOnly(res, req, ["GET"])) return;
  var qp = lib.queryProblem(req, []);
  if (qp) { lib.json(res, qp.status, { error: qp.error }); return; }
  var store = lib.getStore();
  if (!store) {
    lib.json(res, 503, { error: "storage unavailable" });
    return;
  }
  var ids = knownWorkflowIds();
  var workflows, setups;
  try {
    var copies = await mgetNums(store, ids.map(function (id) { return key("copy", id); }));
    var opens = await mgetNums(store, ids.map(function (id) { return key("open", id); }));
    var taps = await mgetNums(store, SETUP_TAGS.map(function (t) { return key("setup", t); }));
    workflows = ids.map(function (id, i) {
      return { id: id, copies: copies[i], opens: opens[i], score: copies[i] * 3 + opens[i] };
    }).filter(function (w) { return w.score > 0; })
      .sort(function (a, b) { return b.score - a.score || (a.id < b.id ? -1 : 1); })
      .slice(0, TOP_N);
    setups = SETUP_TAGS.map(function (tag, i) {
      return { tag: tag, clicks: taps[i] };
    }).filter(function (s) { return s.clicks > 0; })
      .sort(function (a, b) { return b.clicks - a.clicks || (a.tag < b.tag ? -1 : 1); });
  } catch (e) {
    lib.json(res, 503, { error: "storage unavailable" });
    return;
  }
  lib.json(res, 200, { ok: true, workflows: workflows, setups: setups,
    generated: new Date(lib.now()).toISOString() },
    { "Cache-Control": "public, max-age=60" });
}

module.exports = handler;
