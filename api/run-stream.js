/* GET /api/run-stream?run_id= — Server-Sent Events for live runs.
   Replays stored events first (as `beat`), then polls KV every 2s for new
   ones. `meta` events carry the run envelope (status included). Keepalive
   comments every 15s. When the run is done and drained, the stream ends.
   run_id=latest resolves the current live run.
   KV missing -> honest 503 JSON (no fake stream). Unknown run -> 404 JSON. */

"use strict";

var lib = require("./_lib");

var POLL_MS = 2000;
var KEEPALIVE_MS = 15000;

function sse(res, type, obj) {
  res.write("event: " + type + "\n");
  res.write("data: " + JSON.stringify(obj) + "\n\n");
}

module.exports = async function handler(req, res) {
  if (!lib.methodOnly(res, req, ["GET"])) return;

  var runId = String((req.query && req.query.run_id) || "");
  if (!runId) return lib.json(res, 400, { error: "query param run_id is required" });

  // Honest gate: no KV, no stream.
  if (!(await lib.kvPing())) {
    return lib.json(res, 503, { error: "storage unavailable" });
  }

  var id = runId;
  try {
    if (runId === "latest") {
      id = await lib.kv.get("runs:current");
      if (!id) return lib.json(res, 404, { error: "no live run right now" });
    }
    var meta = await lib.kv.get("run:" + id + ":meta");
    if (!meta) return lib.json(res, 404, { error: "unknown run" });
  } catch (e) {
    return lib.json(res, 503, { error: "storage unavailable" });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.write(": connected\n\n");

  var evKey = "run:" + id + ":events";
  var metaKey = "run:" + id + ":meta";
  var sent = 0;
  var closed = false;
  var idleTicks = 0;

  function close() {
    if (closed) return;
    closed = true;
    clearInterval(pollTimer);
    clearInterval(keepTimer);
    try { res.end(); } catch (e) {}
  }
  req.on("close", close);

  async function pushNew() {
    if (closed) return;
    try {
      var events = await lib.kv.lrange(evKey, sent, -1);
      var metaNow = await lib.kv.get(metaKey);
      if (metaNow) {
        sse(res, "meta", metaNow);
        meta = metaNow;
      }
      (events || []).forEach(function (ev) { sse(res, "beat", ev); });
      if (events && events.length) { sent += events.length; idleTicks = 0; }
      else { idleTicks++; }
      // Run finished and fully drained -> end the stream cleanly.
      if (meta && meta.status === "done" && idleTicks >= 3) {
        sse(res, "end", { run_id: id });
        close();
      }
    } catch (e) {
      sse(res, "error", { error: "storage unavailable" });
      close();
    }
  }

  var pollTimer = setInterval(pushNew, POLL_MS);
  var keepTimer = setInterval(function () {
    if (!closed) res.write(": ping\n\n");
  }, KEEPALIVE_MS);

  pushNew();
};
