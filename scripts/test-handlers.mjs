/* Handler tests with NO storage configured, plus every intake gate that
   works without storage. Every endpoint must fail honestly (400, 403,
   404, 405, 409, 413, 415, 503 JSON), never fake success and never throw.
   Also: the pack manifest agrees with assets/js/season.js, dependencies
   are pinned with a lockfile, and scripts/check-health.mjs passes only
   on storage "reachable".
   Run: node scripts/test-handlers.mjs */
import { createRequire } from "node:module";
import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { counter, mockReq, streamReq, call, goodSubmission, IN_WEEK_1, JSON_HEADERS } from "./harness.mjs";
import { checkHealth } from "./check-health.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

for (const k of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN",
  "VERCEL_ENV", "RUN_SECRET"]) delete process.env[k];

const lib = require("../api/_lib.js");
const health = require("../api/health.js");
const submit = require("../api/submit.js");
const leaderboard = require("../api/leaderboard.js");
const runEvent = require("../api/run-event.js");
const runState = require("../api/run-state.js");
const runStream = require("../api/run-stream.js");
const season = require("../assets/js/season.js");
const packs = require("../lib/packs.js");

const { t, done } = counter();
const post = (h, body, headers) => call(h, mockReq("POST", { body, headers: headers || JSON_HEADERS }));
const withOrigin = (origin) => ({ ...JSON_HEADERS, origin });
const PACK = packs.byWeek(1);

const warnings = [];
const realWarn = console.warn;
console.warn = (...a) => { warnings.push(a.join(" ")); };

(async function () {
  let r;
  lib.setClock(() => IN_WEEK_1);

  /* ---------- health ---------- */
  r = await call(health, mockReq("GET"));
  t("health 200 + storage missing", r.status === 200 && r.body && r.body.ok === true && r.body.storage === "missing", r.body);
  t("health Cache-Control s-maxage=30, stale-while-revalidate=60",
    r.headers["cache-control"] === "public, s-maxage=30, stale-while-revalidate=60", r.headers);
  r = await call(health, mockReq("POST"));
  t("health rejects POST", r.status === 405);

  process.env.UPSTASH_REDIS_REST_URL = "http://127.0.0.1:9";
  process.env.UPSTASH_REDIS_REST_TOKEN = "nope";
  lib.resetStore();
  const t0 = Date.now();
  r = await call(health, mockReq("GET"));
  t("health: configured but down -> unreachable", r.status === 200 && r.body.storage === "unreachable", r.body);
  t("health: a dead store answers within 3 s", Date.now() - t0 < 3000, Date.now() - t0);
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  lib.resetStore();

  /* ---------- submit: method, Origin, Content-Type ---------- */
  r = await call(submit, mockReq("GET"));
  t("submit rejects GET", r.status === 405);

  r = await post(submit, goodSubmission(), withOrigin("https://evil.example"));
  t("acceptance: foreign Origin -> 403", r.status === 403 && r.body.error === "forbidden origin", r);
  r = await post(submit, goodSubmission(), withOrigin("null"));
  t("Origin null -> 403", r.status === 403);
  for (const o of ["https://makersonmuse.com", "https://www.makersonmuse.com", "https://makers-on-muse.vercel.app"]) {
    r = await post(submit, goodSubmission(), withOrigin(o));
    t("site origin passes the gate: " + o, r.status === 503, r.status);
  }
  for (const o of ["https://makersonmuse.com.evil.example", "http://makersonmuse.com", "https://makersonmuse.com:8443",
    "https://makers-on-muse-evil.vercel.app", "https://makers-on-muse-git-x-otherteam.vercel.app"]) {
    r = await post(submit, goodSubmission(), withOrigin(o));
    t("lookalike origin -> 403: " + o, r.status === 403, r.status);
  }
  const PREVIEW = "https://makers-on-muse-git-phase1-cams-projects-c5c4c5f6.vercel.app";
  r = await post(submit, goodSubmission(), withOrigin(PREVIEW));
  t("preview origin allowed outside production", r.status === 503, r.status);
  r = await post(submit, goodSubmission(), withOrigin("http://localhost:3000"));
  t("localhost allowed outside production", r.status === 503, r.status);
  process.env.VERCEL_ENV = "production";
  r = await post(submit, goodSubmission(), withOrigin(PREVIEW));
  t("preview origin refused in production", r.status === 403, r.status);
  r = await post(submit, goodSubmission(), withOrigin("http://localhost:3000"));
  t("localhost refused in production", r.status === 403, r.status);
  r = await post(submit, goodSubmission(), withOrigin("https://makersonmuse.com"));
  t("apex allowed in production", r.status === 503, r.status);
  delete process.env.VERCEL_ENV;

  r = await post(submit, JSON.stringify(goodSubmission()), { "content-type": "text/plain" });
  t("acceptance: text/plain -> 415 (unread)", r.status === 415, r);
  r = await post(submit, goodSubmission(), {});
  t("no Content-Type -> 415", r.status === 415);
  r = await post(submit, goodSubmission(), { "content-type": "application/x-www-form-urlencoded" });
  t("form encoding -> 415", r.status === 415);
  r = await post(submit, goodSubmission(), { "content-type": "Application/JSON; charset=utf-8" });
  t("application/json with charset passes", r.status === 503, r.status);

  /* ---------- submit: body size ---------- */
  const big = "x".repeat(100 * 1024);
  r = await post(submit, { note: big }, { ...JSON_HEADERS, "content-length": String(100 * 1024 + 12) });
  t("acceptance: 100 KB body (declared) -> 413", r.status === 413, r);
  r = await post(submit, goodSubmission({ agent: big }));
  t("100 KB pre-parsed body, no length header -> 413", r.status === 413, r.status);
  r = await post(submit, JSON.stringify({ note: big }));
  t("100 KB string body -> 413", r.status === 413, r.status);
  r = await call(submit, streamReq("POST", JSON.stringify({ note: big })));
  t("100 KB streamed body -> 413", r.status === 413, r.status);
  r = await call(submit, streamReq("POST", JSON.stringify(goodSubmission())));
  t("small streamed body is read (503, no storage)", r.status === 503, r.status);
  r = await call(submit, streamReq("POST", "{not json"));
  t("streamed bad JSON -> 400", r.status === 400 && r.body.error === "invalid JSON body");
  r = await post(submit, "{not json");
  t("string bad JSON -> 400", r.status === 400 && r.body.error === "invalid JSON body");
  r = await post(submit, "");
  t("empty body -> 400", r.status === 400);
  {
    const throwing = mockReq("POST");
    Object.defineProperty(throwing, "body", { get() { throw new Error("Invalid JSON"); } });
    r = await call(submit, throwing);
    t("Vercel body getter throws -> 400", r.status === 400 && r.body.error === "invalid JSON body", r);
  }

  /* ---------- submit: validation ---------- */
  function lv(mut) { const b = goodSubmission(); mut(b); return b; }
  r = await post(submit, lv((b) => { b.levels[0].tokens_est = 0; }));
  t("acceptance: tokens_est 0 -> 400", r.status === 400 && r.body.errors.some((e) => /tokens_est/.test(e)), r.body);
  r = await post(submit, lv((b) => { b.levels[1].seconds = 0; }));
  t("seconds 0 -> 400", r.status === 400 && r.body.errors.some((e) => /seconds/.test(e)), r.body);
  r = await post(submit, lv((b) => { b.week = 999; }));
  t("acceptance: week 999 -> 400", r.status === 400 && r.body.errors.some((e) => /week 999/.test(e)), r.body);
  r = await post(submit, lv((b) => { b.transcript = "pasted"; }));
  t("acceptance: unknown key -> 400", r.status === 400 && r.body.errors.some((e) => /unknown field "transcript"/.test(e)), r.body);
  r = await post(submit, lv((b) => { b.agent = "Mabel"; }));
  t("reserved agent name -> 400", r.status === 400 && r.body.errors.some((e) => /reserved/.test(e)), r.body);
  r = await post(submit, lv((b) => { b.handle = "jane@example.com"; }));
  t("email-shaped handle -> 400", r.status === 400 && r.body.errors.some((e) => /^handle: can't look like an email/.test(e)), r.body);
  r = await post(submit, lv((b) => { b.agent = "call 512-555-0147"; }));
  t("phone-shaped agent -> 400", r.status === 400 && r.body.errors.some((e) => /phone/.test(e)), r.body);
  r = await post(submit, lv((b) => { b.agent = "www.example.com"; }));
  t("URL-shaped agent -> 400", r.status === 400 && r.body.errors.some((e) => /web address/.test(e)), r.body);
  r = await post(submit, { week: 0 });
  t("submit invalid -> 400 + errors", r.status === 400 && Array.isArray(r.body.errors) && r.body.errors.length > 0);
  t("error responses are no-store", r.headers["cache-control"] === "no-store", r.headers);

  {
    // Just under the 64 KB cap, every string adversarial for the old
    // quadratic email regex. It must be refused fast.
    const body = lv((b) => { b.levels[0].answer = "a.".repeat(31 * 1024); });
    const t1 = process.hrtime.bigint();
    r = await post(submit, body);
    const took = Number(process.hrtime.bigint() - t1) / 1e6;
    t("64 KB adversarial body handled under 50 ms (took " + took.toFixed(1) + " ms)", took < 50 && r.status === 400, r.status);
  }

  /* ---------- submit: week window (server side, from data/packs) ---------- */
  lib.setClock(() => Date.parse(PACK.opens) - 1);
  r = await post(submit, goodSubmission());
  t("before the week opens -> 409", r.status === 409 && r.body.error === "week not open yet" &&
    r.body.message === "Week 1 opens Mon Oct 5, 2026, 6:00 AM CT. Nothing was filed.", r.body);
  lib.setClock(() => Date.parse(PACK.closes));
  r = await post(submit, goodSubmission());
  t("at close -> 409 closed", r.status === 409 && r.body.error === "week closed", r.body);
  lib.setClock(() => Date.parse(PACK.opens));
  r = await post(submit, goodSubmission());
  t("at open, no storage -> honest 503", r.status === 503 && r.body.error === "storage unavailable", r.body);
  lib.setClock(() => IN_WEEK_1);

  /* ---------- rate limiting without storage ---------- */
  warnings.length = 0;
  let any429 = false;
  for (let i = 0; i < 7; i++) {
    r = await post(submit, goodSubmission(), { ...JSON_HEADERS, "x-real-ip": "198.51.100.7" });
    if (r.status === 429) any429 = true;
  }
  t("no storage: rate limiting is a no-op", !any429);
  t("no storage: the no-op warns once, not per request",
    warnings.filter((w) => /rate limiting for submit is off/.test(w)).length <= 1);

  /* ---------- leaderboard ---------- */
  r = await call(leaderboard, mockReq("GET", {}));
  t("leaderboard missing week -> 400", r.status === 400);
  r = await call(leaderboard, mockReq("GET", { query: { week: "1; drop" } }));
  t("leaderboard junk week -> 400", r.status === 400);
  r = await call(leaderboard, mockReq("GET", { query: { week: "999" } }));
  t("leaderboard unknown week -> 404", r.status === 404);
  r = await call(leaderboard, mockReq("GET", { query: { week: "1" } }));
  t("leaderboard no storage -> honest 503", r.status === 503 && r.body.error === "storage unavailable");

  /* ---------- run-event ---------- */
  const ev = (extra) => ({ run_id: "x", event: { type: "note", text: "hi" }, secret: "s3cret", ...extra });
  r = await post(runEvent, ev({ secret: "wrong" }));
  t("run-event unset RUN_SECRET -> 403", r.status === 403);
  process.env.RUN_SECRET = "s3cret";
  r = await post(runEvent, ev({ secret: "wrong" }));
  t("run-event wrong secret -> 403", r.status === 403);
  r = await post(runEvent, ev({ event: { type: "bogus" } }));
  t("run-event bad type -> 400", r.status === 400 && /event.type/.test(r.body.error));
  r = await post(runEvent, ev({ extra: 1 }));
  t("run-event unknown top-level key -> 400", r.status === 400 && /unknown field "extra"/.test(r.body.error), r.body);
  r = await post(runEvent, ev({ event: { type: "note", text: "hi", html: "<b>" } }));
  t("run-event unknown event key -> 400", r.status === 400 && /unknown field "html"/.test(r.body.error), r.body);
  r = await post(runEvent, ev({ event: { type: "score", parts: { correctness: 2 } } }));
  t("run-event parts out of range -> 400", r.status === 400);
  r = await post(runEvent, ev({ event: { type: "note", title: "x".repeat(201) } }));
  t("run-event long title -> 400", r.status === 400);
  r = await post(runEvent, ev(), withOrigin("https://evil.example"));
  t("run-event foreign Origin -> 403", r.status === 403);
  r = await post(runEvent, JSON.stringify(ev()), { "content-type": "text/plain" });
  t("run-event text/plain -> 415", r.status === 415);
  r = await post(runEvent, ev({ event: { type: "note", text: "x".repeat(70 * 1024) } }));
  t("run-event oversized -> 413", r.status === 413);
  r = await post(runEvent, ev());
  t("run-event valid but no storage -> honest 503", r.status === 503);

  /* ---------- run-state / run-stream ---------- */
  r = await call(runState, mockReq("GET", { query: { run_id: "x" } }));
  t("run-state no storage -> honest 503", r.status === 503);
  r = await call(runState, mockReq("GET", {}));
  t("run-state missing run_id -> 400", r.status === 400);
  r = await call(runStream, mockReq("GET", { query: { run_id: "x" } }));
  t("run-stream no storage -> honest 503 JSON", r.status === 503 && r.body && r.body.error === "storage unavailable");
  r = await call(runStream, mockReq("GET", {}));
  t("run-stream missing run_id -> 400", r.status === 400);

  /* ---------- pack manifest = season.js ---------- */
  {
    const wk = season.WEEKS.find((w) => w.week === 1);
    t("season.js and data/packs/s1w1.json agree on dates and labels",
      wk.opens === PACK.opens && wk.closes === PACK.closes && wk.range === PACK.range &&
      wk.opensLabel === PACK.opens_label && wk.closesLabel === PACK.closes_label && wk.title === PACK.title,
      { wk, PACK });
    t("every season.js week has a manifest", season.WEEKS.every((w) => packs.byWeek(w.week)));
    const allowed = ["schema", "id", "season", "week", "title", "timezone", "opens", "closes", "range", "opens_label", "closes_label"];
    t("manifest holds only schedule fields (no answers)", Object.keys(PACK).every((k) => allowed.includes(k)), Object.keys(PACK));
    t("manifest opens 6:00 AM CT Mon Oct 5 2026", PACK.opens === "2026-10-05T11:00:00Z");
  }

  /* ---------- dependencies pinned ---------- */
  {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    const deps = pkg.dependencies || {};
    t("@vercel/kv removed", !deps["@vercel/kv"]);
    t("@upstash/redis and @upstash/ratelimit are dependencies", deps["@upstash/redis"] && deps["@upstash/ratelimit"], deps);
    t("dependency versions are exact", Object.values(deps).every((v) => /^\d+\.\d+\.\d+$/.test(v)), deps);
    t("npm test script exists", pkg.scripts && /node scripts\//.test(pkg.scripts.test));
    t("package-lock.json committed", existsSync(join(ROOT, "package-lock.json")));
    const lock = JSON.parse(readFileSync(join(ROOT, "package-lock.json"), "utf8"));
    t("lockfile v2+", lock.lockfileVersion >= 2);
    for (const [name, v] of Object.entries(deps)) {
      const entry = lock.packages && lock.packages["node_modules/" + name];
      t("lockfile pins " + name + "@" + v, entry && entry.version === v, entry && entry.version);
    }
    const all = Object.entries(lock.packages || {}).filter(([k]) => k);
    t("every locked package has an integrity hash", all.length > 0 && all.every(([, e]) => /^sha512-/.test(e.integrity || "")));
    t(".gitignore keeps node_modules out", /^node_modules\/?$/m.test(readFileSync(join(ROOT, ".gitignore"), "utf8")));
  }

  /* ---------- check-health.mjs ---------- */
  {
    const seen = [];
    const routes = {
      "/ok/api/health": [200, JSON.stringify({ ok: true, storage: "reachable" })],
      "/missing/api/health": [200, JSON.stringify({ ok: true, storage: "missing" })],
      "/down/api/health": [200, JSON.stringify({ ok: true, storage: "unreachable" })],
      "/err/api/health": [500, JSON.stringify({ error: "boom" })],
      "/html/api/health": [200, "<html>not json</html>"]
    };
    const server = http.createServer((req, res) => {
      seen.push(req.method);
      const [code, body] = routes[req.url] || [404, "{}"];
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(body);
    });
    await new Promise((res) => server.listen(0, "127.0.0.1", res));
    const base = "http://127.0.0.1:" + server.address().port;
    t("check-health: reachable passes", (await checkHealth(base + "/ok")).ok === true);
    t("check-health: missing fails", (await checkHealth(base + "/missing")).ok === false);
    t("check-health: unreachable fails", (await checkHealth(base + "/down")).ok === false);
    t("check-health: HTTP 500 fails", (await checkHealth(base + "/err")).ok === false);
    t("check-health: non-JSON fails", (await checkHealth(base + "/html")).ok === false);
    t("check-health: no server fails", (await checkHealth("http://127.0.0.1:9", { timeoutMs: 2000 })).ok === false);
    const cli = (b) => new Promise((resolve) => {
      const p = spawnSync(process.execPath, [join(ROOT, "scripts/check-health.mjs"), b], { encoding: "utf8", timeout: 15000 });
      resolve(p.status);
    });
    // spawnSync blocks this process, so the local server can't answer it.
    // Run the CLI against a child-process server instead.
    server.close();
    const child = await import("node:child_process");
    const srv = child.spawn(process.execPath, ["-e", `
      const http = require("http");
      const s = http.createServer((q, r) => {
        const ok = q.url.startsWith("/ok/");
        r.writeHead(200, {"Content-Type": "application/json"});
        r.end(JSON.stringify({ ok: true, storage: ok ? "reachable" : "missing" }));
      });
      s.listen(0, "127.0.0.1", () => console.log(s.address().port));
    `], { stdio: ["ignore", "pipe", "inherit"] });
    const port = await new Promise((res) => srv.stdout.once("data", (d) => res(String(d).trim())));
    const cb = "http://127.0.0.1:" + port;
    t("check-health CLI exits 0 on reachable", (await cli(cb + "/ok")) === 0);
    t("check-health CLI exits 1 on missing", (await cli(cb + "/missing")) === 1);
    srv.kill();
    t("check-health only sends GET", seen.length > 0 && seen.every((m) => m === "GET"), seen);
  }

  console.warn = realWarn;
  done();
})();
