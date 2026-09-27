/* Integration test with an in-memory KV stand-in: exercises the real
   handlers end-to-end (run-event seq + meta lifecycle, submit -> leaderboard).
   Run: node scripts/test-integration.mjs */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const lib = require("../api/_lib.js");
const runEvent = require("../api/run-event.js");
const runState = require("../api/run-state.js");
const submit = require("../api/submit.js");
const leaderboard = require("../api/leaderboard.js");

function memkv() {
  const lists = {}, strs = {};
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const sliceIdx = (l, a, b) => {
    const n = l.length;
    const s = a < 0 ? Math.max(0, n + a) : Math.min(a, n);
    const e = b < 0 ? n + b + 1 : Math.min(b + 1, n);
    return l.slice(s, Math.max(s, e));
  };
  return {
    ping: async () => "PONG",
    incr: async (k) => { strs[k] = (strs[k] || 0) + 1; return strs[k]; },
    rpush: async (k, v) => { (lists[k] = lists[k] || []).push(clone(v)); return lists[k].length; },
    ltrim: async (k, a, b) => { lists[k] = sliceIdx(lists[k] || [], a, b); },
    lrange: async (k, a, b) => sliceIdx(lists[k] || [], a, b).map(clone),
    get: async (k) => (k in strs ? clone(strs[k]) : null),
    set: async (k, v) => { strs[k] = clone(v); return "OK"; }
  };
}
lib.kv = memkv();
process.env.RUN_SECRET = "s3cret";

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
        resolve({ status: this.statusCode, body: body });
      },
      on() {}
    };
    Promise.resolve(handler(req, res)).catch(function (e) {
      resolve({ status: 500, threw: String(e && e.message || e) });
    });
  });
}
const post = (h, body, q) => call(h, mockReq("POST", q, body));
const get = (h, q) => call(h, mockReq("GET", q || {}));

(async function () {
  let r;

  /* --- run lifecycle --- */
  r = await post(runEvent, { run_id: "w1-scout", secret: "s3cret", week: 1, week_title: "First Day as Chief of Staff",
    event: { type: "run", phase: "start", agent: "Scout" } });
  t("run/start -> seq 1", r.status === 200 && r.body.seq === 1);

  r = await post(runEvent, { run_id: "w1-scout", secret: "s3cret",
    event: { type: "thought", level: 1, text: "One fact, one source." } });
  t("thought -> seq 2", r.status === 200 && r.body.seq === 2);

  r = await get(runState, { run_id: "w1-scout" });
  t("run-state returns meta+events", r.status === 200 && r.body.meta.status === "live" &&
    r.body.meta.agent === "Scout" && r.body.events.length === 2 &&
    r.body.events[0].seq === 1 && r.body.events[1].seq === 2);

  r = await get(runState, { run_id: "latest" });
  t("run-state latest resolves", r.status === 200 && r.body.meta.run_id === "w1-scout");

  r = await post(runEvent, { run_id: "w1-scout", secret: "s3cret",
    event: { type: "run", phase: "end" } });
  t("run/end -> seq 3", r.status === 200 && r.body.seq === 3);

  r = await get(runState, { run_id: "w1-scout" });
  t("meta flips to done", r.body.meta.status === "done");

  /* --- submit -> leaderboard --- */
  const sub = {
    week: 1, agent: "Scout",
    levels: [1, 2, 3, 4].map(function (n) {
      return { n: n, answer: "answer with jane@example.com inside", tokens_est: 100, seconds: 10,
               procedure: "did things", correct: 1, procedure_score: 0.5 };
    }),
    consent: { redaction: true, publish: false }
  };
  r = await post(submit, sub);
  t("submit -> 200 + receipt", r.status === 200 && /^1-[0-9a-f]{8}$/.test(r.body.receipt));
  t("submit redacted the email", r.body.redactions >= 1);
  t("submit provisional totals", typeof r.body.total === "number" && r.body.stars >= 0);

  const receipt = r.body.receipt;
  const stored = await lib.kv.get("sub:" + receipt);
  t("stored levels are redacted", stored.levels[0].answer.indexOf("jane@example.com") === -1 &&
    stored.levels[0].answer.indexOf("[email redacted]") !== -1);
  t("stored record has no raw transcript leak", JSON.stringify(stored).indexOf("jane@example.com") === -1);

  r = await get(leaderboard, { week: "1" });
  t("leaderboard lists the entry", r.status === 200 && r.body.entries.length === 1);
  t("unpublished name -> anonymous", r.body.entries[0].agent === "anonymous");
  t("leaderboard exposes no answers", JSON.stringify(r.body.entries).indexOf("answer with") === -1);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
