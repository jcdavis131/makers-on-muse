/* POST /api/run-event — append one beat to a live run's event log.
   Body: { run_id, secret, event, week?, week_title? }. No other keys.
   The secret is compared with process.env.RUN_SECRET; wrong or missing
   -> 403. Event types and fields follow docs/watch-protocol.md; unknown
   fields -> 400. Text fields go through the same redaction as
   submissions. The log keeps the last 500 events.
   Every run key expires 30 days after the run's last event:
     mom:run:<id>:events, mom:run:<id>:seq, mom:run:<id>:meta,
     mom:runs:current. */

"use strict";

var lib = require("./_lib");
var redactPII = require("../lib/redact").redactPII;

var VALID_TYPES = ["run", "level", "thought", "tool", "result", "answer", "score", "note"];
var TOP_KEYS = ["run_id", "secret", "event", "week", "week_title"];
var EVENT_KEYS = ["type", "phase", "level", "n", "title", "text", "name", "detail", "summary",
  "total", "tokens_est", "seconds", "parts", "agent"];
var PART_KEYS = ["correctness", "tokens", "time", "procedure"];
var TEXT_MAX = { title: 200, text: 4000, name: 80, detail: 2000, summary: 2000, agent: 40 };
var NUM_KEYS = ["level", "n", "total", "tokens_est", "seconds"];
var MAX_EVENTS = 500;

function unknown(obj, allowed) {
  return Object.keys(obj).filter(function (k) { return allowed.indexOf(k) === -1; });
}

function validEvent(ev) {
  if (ev === null || typeof ev !== "object" || Array.isArray(ev)) return "event must be an object";
  var extra = unknown(ev, EVENT_KEYS);
  if (extra.length) return "event: unknown field " + JSON.stringify(extra[0].slice(0, 40));
  if (VALID_TYPES.indexOf(ev.type) === -1) {
    return "event.type must be one of: " + VALID_TYPES.join(", ");
  }
  if ((ev.type === "run" || ev.type === "level") && ev.phase !== undefined &&
      ev.phase !== "start" && ev.phase !== "end") {
    return "event.phase must be start or end";
  }
  var textKeys = Object.keys(TEXT_MAX);
  for (var i = 0; i < textKeys.length; i++) {
    var k = textKeys[i];
    if (ev[k] === undefined) continue;
    if (typeof ev[k] !== "string") return "event." + k + " must be a string";
    if (ev[k].length > TEXT_MAX[k]) return "event." + k + " too long";
  }
  for (var j = 0; j < NUM_KEYS.length; j++) {
    var nk = NUM_KEYS[j];
    if (ev[nk] !== undefined && (typeof ev[nk] !== "number" || !isFinite(ev[nk]))) {
      return "event." + nk + " must be a number";
    }
  }
  if (ev.parts !== undefined) {
    if (ev.parts === null || typeof ev.parts !== "object" || Array.isArray(ev.parts)) return "event.parts must be an object";
    if (unknown(ev.parts, PART_KEYS).length) return "event.parts: unknown field";
    for (var p = 0; p < PART_KEYS.length; p++) {
      var v = ev.parts[PART_KEYS[p]];
      if (v !== undefined && (typeof v !== "number" || !(v >= 0 && v <= 1))) return "event.parts values must be 0..1";
    }
  }
  return null;
}

module.exports = async function handler(req, res) {
  if (!lib.methodOnly(res, req, ["POST"])) return;

  var gate = lib.preflight(req);
  if (gate) return lib.json(res, gate.status, { error: gate.error });

  var read = await lib.readJson(req);
  if (read.status !== 200) return lib.json(res, read.status, { error: read.error });
  var body = read.value;
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return lib.json(res, 400, { error: "body must be a JSON object" });
  }

  if (!lib.secretsEqual(body.secret, process.env.RUN_SECRET)) {
    return lib.json(res, 403, { error: "forbidden" });
  }

  var extra = unknown(body, TOP_KEYS);
  if (extra.length) return lib.json(res, 400, { error: "unknown field " + JSON.stringify(extra[0].slice(0, 40)) });

  var runId = String(body.run_id || "");
  if (!runId || runId.length > 80 || !/^[A-Za-z0-9._-]+$/.test(runId)) {
    return lib.json(res, 400, { error: "run_id: required, 1..80 chars, alphanumerics/._-" });
  }
  if (body.week !== undefined && (typeof body.week !== "number" || !isFinite(body.week))) {
    return lib.json(res, 400, { error: "week must be a number" });
  }
  if (body.week_title !== undefined && (typeof body.week_title !== "string" || body.week_title.length > 200)) {
    return lib.json(res, 400, { error: "week_title must be a string of 200 chars or fewer" });
  }

  var err = validEvent(body.event);
  if (err) return lib.json(res, 400, { error: err });

  var store = lib.getStore();
  if (!store) return lib.json(res, 503, { error: "storage unavailable" });

  var evKey = lib.KEYS.runEvents(runId);
  var seqKey = lib.KEYS.runSeq(runId);
  var metaKey = lib.KEYS.runMeta(runId);
  var ttl = lib.RUN_TTL_S;
  var ev = body.event;
  var seq;

  try {
    var stored = { seq: 0, t: new Date(lib.now()).toISOString() };
    EVENT_KEYS.forEach(function (k) {
      if (k === "agent" || ev[k] === undefined) return;
      stored[k] = TEXT_MAX[k] ? redactPII(ev[k]) : ev[k];
    });

    // Atomic monotonic seq, independent of the 500-event trim window.
    seq = await store.incr(seqKey);
    await store.expire(seqKey, ttl);
    stored.seq = seq;
    await store.rpush(evKey, stored);
    await store.ltrim(evKey, -MAX_EVENTS, -1);
    await store.expire(evKey, ttl);

    var meta = (await store.get(metaKey)) || { run_id: runId };
    if (ev.type === "run" && ev.phase === "start") {
      meta.status = "live";
      meta.agent = ev.agent ? redactPII(ev.agent) : meta.agent;
      if (body.week !== undefined) meta.week = body.week;
      if (body.week_title !== undefined) meta.week_title = redactPII(body.week_title);
      meta.started_at = new Date(lib.now()).toISOString();
      await store.set(lib.KEYS.runsCurrent, runId, { ex: ttl });
    } else if (ev.type === "run" && ev.phase === "end") {
      meta.status = "done";
    }
    meta.run_id = runId;
    await store.set(metaKey, meta, { ex: ttl });
  } catch (e) {
    return lib.json(res, 503, { error: "storage unavailable" });
  }

  lib.json(res, 200, { seq: seq });
};
