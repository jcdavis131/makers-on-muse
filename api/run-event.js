/* POST /api/run-event — append one beat to a live run's event log.
   Body: { run_id, event, secret }. Secret is compared against
   process.env.RUN_SECRET; wrong/missing -> 403. Event types follow
   docs/watch-protocol.md. Events are capped at 500 (oldest trimmed). */

"use strict";

var lib = require("./_lib");

var VALID_TYPES = ["run", "level", "thought", "tool", "result", "answer", "score", "note"];
var MAX_EVENTS = 500;

function validEvent(ev) {
  if (ev === null || typeof ev !== "object" || Array.isArray(ev)) return "event must be an object";
  if (VALID_TYPES.indexOf(ev.type) === -1) {
    return "event.type must be one of: " + VALID_TYPES.join(", ");
  }
  if ((ev.type === "run" || ev.type === "level") && ev.phase !== undefined &&
      ev.phase !== "start" && ev.phase !== "end") {
    return "event.phase must be start or end";
  }
  if (typeof ev.text === "string" && ev.text.length > 4000) return "event.text too long";
  if (typeof ev.summary === "string" && ev.summary.length > 2000) return "event.summary too long";
  return null;
}

module.exports = async function handler(req, res) {
  if (!lib.methodOnly(res, req, ["POST"])) return;

  var body;
  try {
    body = await lib.readBody(req);
  } catch (e) {
    return lib.json(res, 400, { error: "invalid JSON body" });
  }

  if (!lib.secretsEqual(body.secret, process.env.RUN_SECRET)) {
    return lib.json(res, 403, { error: "forbidden" });
  }

  var runId = String(body.run_id || "");
  if (!runId || runId.length > 80 || !/^[A-Za-z0-9._-]+$/.test(runId)) {
    return lib.json(res, 400, { error: "run_id: required, 1..80 chars, alphanumerics/._-" });
  }

  var err = validEvent(body.event);
  if (err) return lib.json(res, 400, { error: err });

  var evKey = "run:" + runId + ":events";
  var metaKey = "run:" + runId + ":meta";
  var seq;

  try {
    var stored = {
      seq: 0, // filled below
      t: new Date().toISOString(),
      type: body.event.type,
      phase: body.event.phase,
      level: body.event.level,
      n: body.event.n,
      title: body.event.title,
      text: body.event.text,
      name: body.event.name,
      detail: body.event.detail,
      summary: body.event.summary,
      total: body.event.total,
      tokens_est: body.event.tokens_est,
      seconds: body.event.seconds,
      parts: body.event.parts
    };
    // Drop undefined keys to keep the log tight.
    Object.keys(stored).forEach(function (k) { if (stored[k] === undefined) delete stored[k]; });

    // Atomic monotonic seq, independent of the 500-event trim window.
    seq = await lib.kv.incr("run:" + runId + ":seq");
    stored.seq = seq;
    await lib.kv.rpush(evKey, stored);
    await lib.kv.ltrim(evKey, -MAX_EVENTS, -1);

    var meta = (await lib.kv.get(metaKey)) || { run_id: runId };
    if (body.event.type === "run" && body.event.phase === "start") {
      meta.status = "live";
      meta.agent = body.event.agent || meta.agent;
      if (body.week !== undefined) meta.week = body.week;
      if (body.week_title !== undefined) meta.week_title = body.week_title;
      meta.started_at = new Date().toISOString();
      await lib.kv.set("runs:current", runId);
    } else if (body.event.type === "run" && body.event.phase === "end") {
      meta.status = "done";
    }
    meta.run_id = runId;
    await lib.kv.set(metaKey, meta, { ex: 60 * 60 * 24 * 30 });
  } catch (e) {
    return lib.json(res, 503, { error: "storage unavailable" });
  }

  lib.json(res, 200, { seq: seq });
};
