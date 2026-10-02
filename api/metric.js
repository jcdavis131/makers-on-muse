/* POST /api/metric — count one aggregate popularity event.
   Body: { type, id }. type is one of:
     copy  — a recipe step's Copy button was pressed (the usefulness signal)
     open  — a workflow's permalink (?w=<id>) was opened
     setup — a setup tag chip was tapped
   id is a workflow id (copy/open) or a setup tag (setup).
   Counts only: no cookies, no user ids, no IPs stored. The client IP is
   used only for rate limiting and never written to storage.
   400 on a bad body, 429 over the rate limit, 503 when storage is missing. */

"use strict";

var fs = require("fs");
var path = require("path");
var lib = require("./_lib");

var TYPES = ["copy", "open", "setup"];
var ID_RE = /^[a-z0-9-]{1,64}$/;

/* The setup tags the Playbook legend explains. Kept in sync with
   playbook.html; unknown tags are refused rather than counted. */
var SETUP_TAGS = ["browser", "photo-upload", "gmail", "google-calendar",
  "spotify", "finances", "podcast", "phone"];

var workflowIds = null;
function knownWorkflowIds() {
  if (workflowIds) return workflowIds;
  workflowIds = {};
  try {
    var src = fs.readFileSync(path.join(__dirname, "..", "assets", "js", "playbook-data.js"), "utf8");
    var re = /"id": "([a-z0-9-]+)"/g, m;
    while ((m = re.exec(src))) workflowIds[m[1]] = true;
  } catch (e) { workflowIds = {}; }
  return workflowIds;
}

function key(type, id) { return "mom:metric:" + type + ":" + id; }

async function handler(req, res) {
  if (!lib.methodOnly(res, req, ["POST"])) return;
  var store = lib.getStore();
  var read = await lib.readJson(req);
  if (read.status !== 200) {
    lib.json(res, read.status, { error: read.error });
    return;
  }
  var body = read.value;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    lib.json(res, 400, { error: "body must be a JSON object" });
    return;
  }
  var type = body.type, id = body.id;
  if (TYPES.indexOf(type) === -1) {
    lib.json(res, 400, { error: "type must be one of: " + TYPES.join(", ") });
    return;
  }
  if (typeof id !== "string" || !ID_RE.test(id)) {
    lib.json(res, 400, { error: "id must match " + ID_RE });
    return;
  }
  if (type === "setup") {
    if (SETUP_TAGS.indexOf(id) === -1) {
      lib.json(res, 400, { error: "unknown setup tag" });
      return;
    }
  } else if (!knownWorkflowIds()[id]) {
    lib.json(res, 400, { error: "unknown workflow id" });
    return;
  }
  if (!store) {
    lib.json(res, 503, { error: "storage unavailable" });
    return;
  }
  if (await lib.limitOr429(req, res, "metric", 60, "1m",
      "Popularity pings are capped at 60 per minute per visitor.")) return;
  try {
    await store.incr(key(type, id));
  } catch (e) {
    lib.json(res, 503, { error: "storage unavailable" });
    return;
  }
  lib.json(res, 200, { ok: true });
}

module.exports = handler;
