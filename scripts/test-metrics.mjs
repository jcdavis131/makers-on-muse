/* Metrics test: the popularity pipeline end to end against the in-memory
   Redis emulator (scripts/redis-emu.mjs).
   Covers: /api/metric validates type, id shape, workflow ids (from the
   real playbook-data.js) and setup tags; counts increments; /api/popular
   ranks workflows by usefulness (copies x3 + opens) and setups by taps;
   both endpoints 503 honestly when storage is missing; the metric
   endpoint rate-limits at 60 pings a minute.
   Run: node scripts/test-metrics.mjs */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createEmulator, serveUpstash } from "./redis-emu.mjs";
import { counter, mockReq, call, JSON_HEADERS } from "./harness.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

for (const k of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN", "VERCEL_ENV"]) {
  delete process.env[k];
}

const { t, done } = counter();
let ipSeq = 0;
const freshIp = () => "192.0.2." + (++ipSeq);
const post = (h, body, ip) => call(h, mockReq("POST", { body, headers: { ...JSON_HEADERS, "x-real-ip": ip || freshIp() } }));
const get = (h) => call(h, mockReq("GET", {}));

(async function () {
  const lib = require("../api/_lib.js");
  const metric = require("../api/metric.js");
  const popular = require("../api/popular.js");
  let r;

  /* --- no storage: honest 503 --- */
  r = await post(metric, { type: "copy", id: "fare-matrix-europe" });
  t("metric: 503 without storage", r.status === 503 && r.body.error === "storage unavailable", r);
  r = await get(popular);
  t("popular: 503 without storage", r.status === 503, r);

  /* --- validation happens before storage is touched --- */
  r = await post(metric, { type: "bogus", id: "fare-matrix-europe" });
  t("metric: 400 on bad type", r.status === 400, r.body);
  r = await post(metric, { type: "copy", id: "not-a-workflow" });
  t("metric: 400 on unknown workflow id", r.status === 400, r.body);
  r = await post(metric, { type: "setup", id: "telepathy" });
  t("metric: 400 on unknown setup tag", r.status === 400, r.body);
  r = await post(metric, { type: "copy", id: "../../etc/passwd" });
  t("metric: 400 on malformed id", r.status === 400, r.body);
  r = await post(metric, "not json");
  t("metric: 400 on non-object body", r.status === 400, r.body);

  /* --- with storage: counting --- */
  const emu = createEmulator();
  const srv = await serveUpstash(emu);
  process.env.UPSTASH_REDIS_REST_URL = srv.url;
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  lib.resetStore();

  r = await post(metric, { type: "copy", id: "fare-matrix-europe" });
  t("metric: 200 on a good copy ping", r.status === 200 && r.body.ok === true, r);
  r = await post(metric, { type: "copy", id: "fare-matrix-europe" });
  r = await post(metric, { type: "open", id: "fare-matrix-europe" });
  r = await post(metric, { type: "copy", id: "delay-compensation-claim" });
  r = await post(metric, { type: "open", id: "delay-compensation-claim" });
  r = await post(metric, { type: "open", id: "delay-compensation-claim" });
  r = await post(metric, { type: "open", id: "delay-compensation-claim" });
  r = await post(metric, { type: "open", id: "delay-compensation-claim" });
  r = await post(metric, { type: "setup", id: "gmail" });
  r = await post(metric, { type: "setup", id: "gmail" });
  r = await post(metric, { type: "setup", id: "browser" });
  t("metric: 200 on a good setup ping", r.status === 200, r);

  /* --- popular: usefulness ranking --- */
  r = await get(popular);
  t("popular: 200 with storage", r.status === 200 && r.body.ok === true, r.status);
  const wf = r.body.workflows;
  // fare-matrix-europe: 2 copies + 1 open = 7; delay-compensation-claim: 1 copy + 4 opens = 7.
  // Tie broken by id, so delay-compensation-claim comes first.
  t("popular: ranks by copies*3 + opens", wf.length === 2 &&
    wf[0].id === "delay-compensation-claim" && wf[0].score === 7 &&
    wf[1].id === "fare-matrix-europe" && wf[1].score === 7, wf);
  t("popular: exposes copies and opens", wf[0].copies === 1 && wf[0].opens === 4, wf[0]);
  const st = r.body.setups;
  t("popular: ranks setups by taps", st.length === 2 &&
    st[0].tag === "gmail" && st[0].clicks === 2 &&
    st[1].tag === "browser" && st[1].clicks === 1, st);
  t("popular: carries a generated timestamp", typeof r.body.generated === "string", r.body.generated);

  /* --- rate limit: 61 pings in a minute from one IP --- */
  const ip = freshIp();
  let limited = 0;
  for (let i = 0; i < 61; i++) {
    r = await post(metric, { type: "open", id: "fare-matrix-europe" }, ip);
    if (r.status === 429) limited++;
  }
  t("metric: 429 on the 61st ping in a minute", limited === 1, limited);

  /* --- a bad query string is refused before storage --- */
  r = await call(popular, mockReq("GET", { query: { x: "1" } }));
  t("popular: 400 on unexpected query param", r.status === 400, r.body);

  /* --- the privacy page discloses the aggregate counting --- */
  const privacy = readFileSync(join(ROOT, "privacy.html"), "utf8");
  t("privacy: discloses aggregate popularity counts",
    /Popularity counts are aggregate only/.test(privacy) && /no cookies/.test(privacy), privacy.slice(0, 80));

  srv.close();
  done();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
