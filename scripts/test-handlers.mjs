/* Handler tests with NO KV provisioned: every endpoint must fail honest
   (400/403/404/503 JSON) — never fake success, never throw uncaught.
   Run: node scripts/test-handlers.mjs */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const health = require("../api/health.js");
const submit = require("../api/submit.js");
const leaderboard = require("../api/leaderboard.js");
const runEvent = require("../api/run-event.js");
const runState = require("../api/run-state.js");
const runStream = require("../api/run-stream.js");

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) pass++;
  else { fail++; console.error("FAIL:", name); }
}

function mockReq(method, query, body) {
  return { method: method, query: query || {}, body: body, on: function () {} };
}
function call(handler, req) {
  return new Promise(function (resolve) {
    const res = {
      statusCode: 200, headers: {}, chunks: [],
      setHeader(k, v) { this.headers[k] = v; },
      writeHead(c, h) { this.statusCode = c; Object.assign(this.headers, h || {}); },
      write(c) { this.chunks.push(String(c)); },
      end(c) {
        if (c !== undefined) this.chunks.push(String(c));
        let body = null;
        try { body = JSON.parse(this.chunks.join("")); } catch (e) {}
        resolve({ status: this.statusCode, headers: this.headers, body: body, raw: this.chunks.join("") });
      },
      on() {}
    };
    Promise.resolve(handler(req, res)).catch(function (e) {
      resolve({ status: 500, threw: String(e && e.message || e) });
    });
  });
}

const good = {
  week: 1, agent: "Scout",
  levels: [1, 2, 3, 4].map(function (n) {
    return { n: n, answer: "a", tokens_est: 100, seconds: 10, procedure: "p", correct: 1, procedure_score: 0.5 };
  }),
  consent: { redaction: true, publish: false }
};

(async function () {
  let r;

  r = await call(health, mockReq("GET"));
  t("health 200 + kv missing", r.status === 200 && r.body && r.body.ok === true && r.body.kv === "missing");

  r = await call(health, mockReq("POST"));
  t("health rejects POST", r.status === 405);

  r = await call(submit, mockReq("POST", {}, { week: 0 }));
  t("submit invalid -> 400 + errors", r.status === 400 && r.body && Array.isArray(r.body.errors) && r.body.errors.length > 0);

  r = await call(submit, mockReq("POST", {}, good));
  t("submit valid but no KV -> honest 503", r.status === 503 && r.body && r.body.error === "storage unavailable");

  r = await call(leaderboard, mockReq("GET", {}));
  t("leaderboard missing week -> 400", r.status === 400);

  r = await call(leaderboard, mockReq("GET", { week: "1" }));
  t("leaderboard no KV -> honest 503", r.status === 503 && r.body && r.body.error === "storage unavailable");

  r = await call(runEvent, mockReq("POST", {}, { run_id: "x", event: { type: "note", text: "hi" }, secret: "wrong" }));
  t("run-event wrong secret -> 403", r.status === 403);

  r = await call(runEvent, mockReq("POST", {}, { run_id: "x", event: { type: "bogus" }, secret: process.env.RUN_SECRET || "test-secret" }));
  // RUN_SECRET unset here -> secretsEqual fails -> 403 regardless of event validity
  t("run-event unset RUN_SECRET -> 403", r.status === 403);

  process.env.RUN_SECRET = "s3cret";
  r = await call(runEvent, mockReq("POST", {}, { run_id: "x", event: { type: "bogus" }, secret: "s3cret" }));
  t("run-event bad type -> 400", r.status === 400 && /event.type/.test(r.body.error));

  r = await call(runEvent, mockReq("POST", {}, { run_id: "x", event: { type: "note", text: "hi" }, secret: "s3cret" }));
  t("run-event valid but no KV -> honest 503", r.status === 503);

  r = await call(runState, mockReq("GET", { run_id: "x" }));
  t("run-state no KV -> honest 503", r.status === 503);

  r = await call(runState, mockReq("GET", {}));
  t("run-state missing run_id -> 400", r.status === 400);

  r = await call(runStream, mockReq("GET", { run_id: "x" }));
  t("run-stream no KV -> honest 503 JSON", r.status === 503 && r.body && r.body.error === "storage unavailable");

  r = await call(runStream, mockReq("GET", {}));
  t("run-stream missing run_id -> 400", r.status === 400);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
