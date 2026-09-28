/* Integration test: the real handlers, the real @upstash/redis client and
   the real @upstash/ratelimit, against an in-memory Redis served over the
   Upstash REST protocol (scripts/redis-emu.mjs). The emulator honors
   TTLs and has a clock the test moves forward.
   Covers: run-event seq + meta lifecycle, submit -> leaderboard through
   the week's sorted set (count only until the week closes), one entry per
   handle per week, the secret token stored only as a hash, receipt status
   and delete by token, the contact address kept private, 429 on the
   sixth post in a minute, a TTL on every key, expiry after 30 and 90
   days, and cleanup after a failed write.
   Run: node scripts/test-integration.mjs */
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { createEmulator, serveUpstash } from "./redis-emu.mjs";
import { counter, mockReq, call, goodSubmission, IN_WEEK_1, JSON_HEADERS } from "./harness.mjs";

const require = createRequire(import.meta.url);

for (const k of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN", "VERCEL_ENV"]) {
  delete process.env[k];
}
const emu = createEmulator();
const srv = await serveUpstash(emu);
// The Vercel Marketplace sets the KV_* pair; test that one first.
process.env.KV_REST_API_URL = srv.url;
process.env.KV_REST_API_TOKEN = srv.token;
process.env.RUN_SECRET = "s3cret";

const lib = require("../api/_lib.js");
const health = require("../api/health.js");
const runEvent = require("../api/run-event.js");
const runState = require("../api/run-state.js");
const submit = require("../api/submit.js");
const leaderboard = require("../api/leaderboard.js");
const receiptApi = require("../api/receipt.js");
const packs = require("../lib/packs.js");
const { tokenMatches, hashToken, newToken } = require("../lib/token.js");

const { t, done } = counter();
const PACK = packs.byWeek(1);
const DAY = 86400 * 1000;
let ipSeq = 0;
const freshIp = () => "192.0.2." + (++ipSeq);
const post = (h, body, headers) => call(h, mockReq("POST", { body, headers: { ...JSON_HEADERS, "x-real-ip": freshIp(), ...(headers || {}) } }));
const get = (h, query) => call(h, mockReq("GET", { query: query || {} }));
const sub = (handle, agent, extra) => goodSubmission({ handle, agent, ...(extra || {}) });

(async function () {
  let r;
  lib.setClock(() => IN_WEEK_1);

  /* --- storage config: either env pair --- */
  r = await get(health);
  t("health: KV_REST_API_* pair -> reachable", r.status === 200 && r.body.storage === "reachable", r.body);
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  process.env.UPSTASH_REDIS_REST_URL = srv.url;
  process.env.UPSTASH_REDIS_REST_TOKEN = srv.token;
  lib.resetStore();
  r = await get(health);
  t("health: UPSTASH_REDIS_REST_* pair -> reachable", r.status === 200 && r.body.storage === "reachable", r.body);
  t("health cached 30 s at the edge", r.headers["cache-control"] === "public, s-maxage=30, stale-while-revalidate=60");

  /* --- run lifecycle --- */
  r = await post(runEvent, { run_id: "w1-test", secret: "s3cret", week: 1, week_title: "Example pack",
    event: { type: "run", phase: "start", agent: "Juniper" } });
  t("run/start -> seq 1", r.status === 200 && r.body.seq === 1, r);

  r = await post(runEvent, { run_id: "w1-test", secret: "s3cret",
    event: { type: "thought", level: 1, text: "One fact, one source. Ping jane@example.com." } });
  t("thought -> seq 2", r.status === 200 && r.body.seq === 2);

  r = await get(runState, { run_id: "w1-test" });
  t("run-state returns meta+events", r.status === 200 && r.body.meta.status === "live" &&
    r.body.meta.agent === "Juniper" && r.body.events.length === 2 &&
    r.body.events[0].seq === 1 && r.body.events[1].seq === 2, r.body);
  t("streamed text is redacted before storage", r.body.events[1].text === "One fact, one source. Ping [email redacted].", r.body.events[1]);

  r = await get(runState, { run_id: "latest" });
  t("run-state latest resolves", r.status === 200 && r.body.meta.run_id === "w1-test");

  r = await post(runEvent, { run_id: "w1-test", secret: "s3cret", event: { type: "run", phase: "end" } });
  t("run/end -> seq 3", r.status === 200 && r.body.seq === 3);
  r = await get(runState, { run_id: "w1-test" });
  t("meta flips to done", r.body.meta.status === "done");

  r = await post(runEvent, { run_id: "12345", secret: "s3cret", event: { type: "run", phase: "start", agent: "Juniper" } });
  r = await get(runState, { run_id: "latest" });
  t("a numeric run id survives Upstash JSON decoding", r.status === 200 && r.body.meta.run_id === "12345", r.body);

  /* --- submit -> receipt + token --- */
  const s1 = sub("juniper-player", "Juniper");
  s1.levels[0].answer = "answer with jane@example.com inside";
  s1.levels[0].evidence = ["https://www.census.gov/quickfacts/fact/table/exampletoncity/PST045224?key=abc123"];
  r = await post(submit, s1, { origin: "https://makersonmuse.com" });
  t("submit -> 200 + receipt", r.status === 200 && /^1-[0-9a-f]{8}$/.test(r.body.receipt), r);
  t("submit returns a 128-bit secret token", /^mom_[A-Za-z0-9_-]{22}$/.test(r.body.token || ""));
  t("receipt code and token are different strings", r.body.token && !r.body.token.includes(r.body.receipt.slice(2)));
  t("submit response is no-store", r.headers["cache-control"] === "no-store");
  t("submit redacted the email", r.body.redactions >= 1);
  t("submit provisional totals", typeof r.body.total === "number" && r.body.stars >= 0 && r.body.provisional === true);
  const receipt = r.body.receipt;
  const secret = r.body.token;

  const stored = JSON.parse(emu.raw("mom:sub:" + receipt));
  t("stored levels are redacted", stored.levels[0].answer === "answer with [email redacted] inside", stored.levels[0].answer);
  t("stored evidence URL keeps its path, drops the key",
    stored.levels[0].evidence[0] === "https://www.census.gov/quickfacts/fact/table/exampletoncity/PST045224?key=[redacted]",
    stored.levels[0].evidence);
  t("stored record holds the token hash", stored.token_hash === createHash("sha256").update(secret).digest("hex"));
  // The last of 22 base64url chars carries 2 bits, so it is A, Q, g or w.
  // Swap it for a different one; appending a fixed "A" matched 1 run in 4.
  const wrongLast = secret.slice(0, -1) + (secret.slice(-1) === "A" ? "Q" : "A");
  t("tokenMatches the stored hash", wrongLast !== secret && tokenMatches(secret, stored.token_hash) && !tokenMatches(wrongLast, stored.token_hash));
  const everything = emu.keys().map((k) => k.key + "=" + JSON.stringify(emu.raw(k.key) instanceof Map ? [...emu.raw(k.key)] : emu.raw(k.key))).join("\n");
  t("the plain token is stored nowhere", !everything.includes(secret));
  t("no raw email stored anywhere", !everything.includes("jane@example.com"));
  t("token index points at the receipt", emu.raw("mom:tok:" + stored.token_hash) === receipt);
  t("handle claim points at the receipt", emu.raw("mom:handle:s1w1:juniper-player") === receipt);
  t("record keeps only known fields", Object.keys(stored).sort().join() ===
    "agent,consent,created_at,handle,levels,pack,provisional,receipt,redactions,schema,scores,season,stars,status,token_hash,total,week");
  t("record starts as received, with terms agreed", stored.status === "received" && stored.consent.terms === true);

  /* --- one entry per handle per week --- */
  r = await post(submit, sub("JUNIPER-player", "Juniper Two"));
  t("same handle (any case) again -> 409", r.status === 409 && r.body.error === "handle already entered", r.body);
  const s2 = sub("second-player", "Bramble", { consent: { terms: true, publish: true } });
  s2.levels[3] = { n: 4, skipped: true };
  r = await post(submit, s2);
  t("another handle, L4 not attempted -> 200", r.status === 200, r.body);
  t("the skipped level scores 0 on the receipt", r.body.scores[3].skipped === true && r.body.scores[3].total === 0, r.body.scores);
  const s3 = sub("third-player", "Quill", { consent: { terms: true, publish: true }, contact: "quill@example.org" });
  s3.levels.forEach((l) => { l.procedure_score = 1; });
  s3.levels.push({ n: 5, answer: "a one-page dashboard", link: "https://example.org/build.html" });
  r = await post(submit, s3);
  t("third entry, with contact and L5 -> 200", r.status === 200, r.body);
  t("L5 is an unscored exhibition on the receipt", r.body.scores[4].exhibition === true && r.body.total <= 400, r.body.scores);
  const quillCode = r.body.receipt;
  const quillToken = r.body.token;
  const quill = JSON.parse(emu.raw("mom:sub:" + quillCode));
  t("the contact address is stored with the record", quill.contact === "quill@example.org");
  t("the L5 link is stored", quill.levels[4].link === "https://example.org/build.html", quill.levels[4]);

  /* --- leaderboard: count only until the week closes --- */
  emu.log.length = 0;
  r = await get(leaderboard, { week: "1" });
  t("mid-week: board holds entries back, count only",
    r.status === 200 && r.body.state === "open" && r.body.count === 3 && r.body.entries.length === 0, r.body);
  t("mid-week: one read (ZCARD)", emu.log.join() === "ZCARD", emu.log);
  t("board says when it opens", r.body.closes === PACK.closes && r.body.closes_label === PACK.closes_label, r.body);
  t("leaderboard cached 60 s", r.headers["cache-control"] === "public, s-maxage=60, stale-while-revalidate=120");

  lib.setClock(() => Date.parse(PACK.closes));
  emu.log.length = 0;
  r = await get(leaderboard, { week: "1" });
  t("after close: lists 3 entries", r.status === 200 && r.body.state === "closed" && r.body.entries.length === 3 && r.body.count === 3, r.body);
  t("leaderboard reads the sorted set, not one key per receipt", emu.log.join() === "ZCARD,ZRANGE,MGET", emu.log);
  t("leaderboard ranked by total", r.body.entries[0].total >= r.body.entries[1].total && r.body.entries[1].total >= r.body.entries[2].total);
  t("leaderboard top is Quill", r.body.entries[0].agent === "Quill", r.body.entries);
  t("unpublished name -> anonymous", r.body.entries.some((e) => e.agent === "anonymous"));
  t("board rows carry levels 1-4 only", r.body.entries.every((e) => e.levels.length === 4 && e.levels.every((l) => l.n >= 1 && l.n <= 4)), r.body.entries);
  const bramble = r.body.entries.find((e) => e.agent === "Bramble");
  t("a skipped level shows as skipped on the board", bramble && bramble.levels[3].skipped === true && !("total" in bramble.levels[3]), bramble);
  t("board entries hold only public fields", r.body.entries.every((e) => Object.keys(e).sort().join() === "agent,levels,provisional,stars,total"));
  const pub = JSON.stringify(r.body);
  t("leaderboard exposes no answers", !pub.includes("answer with") && !pub.includes("fictional answer") && !pub.includes("dashboard"));
  t("leaderboard exposes no handles, contacts or token hashes", !pub.includes("player") && !pub.includes("token") && !pub.includes("@"));
  lib.setClock(() => IN_WEEK_1);

  /* --- receipt: status by secret token --- */
  r = await post(receiptApi, { token: secret });
  t("receipt status -> 200", r.status === 200 && r.body.receipt === receipt, r.body);
  t("receipt status: received, provisional", r.body.status === "received" && r.body.provisional === true);
  t("receipt status: scores and total", r.body.total === stored.total && r.body.scores.length === 4 && r.body.stars === stored.stars, r.body);
  t("receipt status: the owner's names, publish choice, contact flag",
    r.body.handle === "juniper-player" && r.body.agent === "Juniper" && r.body.published === false && r.body.contact_on_file === false, r.body);
  t("receipt status: week open, expiry date", r.body.week_state === "open" &&
    r.body.expires === new Date(packs.expiresAt(PACK) * 1000).toISOString(), r.body);
  t("receipt status is no-store", r.headers["cache-control"] === "no-store");
  const own = JSON.stringify(r.body);
  t("receipt status holds no answers or token hash", !own.includes("answer with") && !own.includes(stored.token_hash) && !own.includes(secret));
  r = await post(receiptApi, { token: quillToken, action: "status" });
  t("receipt status: contact on file, but not echoed", r.status === 200 && r.body.contact_on_file === true &&
    !JSON.stringify(r.body).includes("quill@example.org"), r.body);
  t("receipt status: L5 shows as exhibition", r.body.scores.some((x) => x.n === 5 && x.exhibition === true), r.body.scores);
  r = await post(receiptApi, { token: newToken() });
  t("unknown token -> generic 404", r.status === 404 && r.body.error === "not found" && /deleted, or it expired/.test(r.body.message), r.body);
  {
    // An index entry that points at a record with another token's hash.
    const forged = newToken();
    emu.exec(["SET", "mom:tok:" + hashToken(forged), receipt]);
    r = await post(receiptApi, { token: forged });
    t("a token must match the record's own hash -> 404", r.status === 404, r.body);
    emu.exec(["DEL", "mom:tok:" + hashToken(forged)]);
  }
  {
    const ip = { "x-real-ip": "203.0.113.20" };
    const statuses = [];
    for (let i = 0; i < 11; i++) statuses.push((await post(receiptApi, { token: newToken() }, ip)).status);
    t("receipt: lookups 1-10 in a minute pass the limiter", statuses.slice(0, 10).every((x) => x === 404), statuses);
    t("receipt: the 11th lookup from one IP in a minute -> 429", statuses[10] === 429, statuses);
  }

  /* --- receipt: delete by secret token --- */
  {
    r = await post(submit, sub("delete-me", "Ephemeral", { consent: { terms: true, publish: true } }));
    t("an entry to delete -> 200", r.status === 200, r.body);
    const code = r.body.receipt, tok = r.body.token, h = hashToken(tok);
    t("board counts it", (await get(leaderboard, { week: "1" })).body.count === 4);
    r = await post(receiptApi, { token: tok, action: "delete" });
    t("delete -> 200", r.status === 200 && r.body.deleted === true && r.body.receipt === code && r.body.can_refile === true, r.body);
    t("delete removes the record, token index and handle claim",
      emu.raw("mom:sub:" + code) === null && emu.raw("mom:tok:" + h) === null && emu.raw("mom:handle:s1w1:delete-me") === null);
    t("delete removes the board entry", !emu.raw("mom:board:s1w1").has(code));
    t("board count drops", (await get(leaderboard, { week: "1" })).body.count === 3);
    r = await post(receiptApi, { token: tok });
    t("status after delete -> 404", r.status === 404, r.body);
    r = await post(receiptApi, { token: tok, action: "delete" });
    t("a second delete -> 404", r.status === 404, r.body);
    r = await post(submit, sub("delete-me", "Ephemeral Two"));
    t("the handle can file again while the week is open", r.status === 200, r.body);
    const again = r.body;

    // A delete cut short by a storage error can be retried with the token.
    emu.failNext("DEL");
    r = await post(receiptApi, { token: again.token, action: "delete" });
    t("delete interrupted -> 503 with a retry hint", r.status === 503 && /Try again/.test(r.body.message), r.body);
    t("interrupted delete keeps the token usable", emu.raw("mom:tok:" + hashToken(again.token)) === again.receipt);
    r = await post(receiptApi, { token: again.token, action: "delete" });
    t("the retry finishes the delete", r.status === 200 && r.body.deleted === true, r.body);
    t("nothing of it is left", !emu.keys().some((k) => k.key.includes(again.receipt) || k.key.endsWith(":delete-me")) &&
      !emu.raw("mom:board:s1w1").has(again.receipt));
  }

  /* --- 429 on the sixth post from one IP within a minute --- */
  {
    const ip = { "x-real-ip": "203.0.113.9" };
    const statuses = [];
    for (let i = 0; i < 6; i++) {
      const res = await post(submit, { week: 1, bad: true }, ip);
      statuses.push(res.status);
      r = res;
    }
    t("acceptance: posts 1-5 pass the limiter (then fail validation)", statuses.slice(0, 5).every((s) => s === 400), statuses);
    t("acceptance: the sixth post from one IP in a minute -> 429", statuses[5] === 429, statuses);
    t("429 carries Retry-After", /^\d+$/.test(String(r.headers["retry-after"])) && Number(r.headers["retry-after"]) <= 61, r.headers);
    const other = await post(submit, { week: 1, bad: true }, { "x-real-ip": "203.0.113.10" });
    t("another IP is not limited", other.status === 400, other.status);
    const rlKeys = emu.keys().filter((k) => k.key.startsWith("mom:rl:submit:"));
    t("rate-limit keys hold no raw IP", rlKeys.length > 0 && rlKeys.every((k) => !k.key.includes("203.0.113")), rlKeys);
  }

  /* --- week window from data/packs --- */
  lib.setClock(() => Date.parse(PACK.closes));
  r = await post(submit, sub("late-player", "Latecomer"));
  t("after close -> 409, nothing stored", r.status === 409 && !emu.raw("mom:handle:s1w1:late-player"), r.body);
  r = await post(receiptApi, { token: secret });
  t("after close: status still works and says closed", r.status === 200 && r.body.week_state === "closed", r.body);
  lib.setClock(() => Date.parse(PACK.opens) - 1000);
  r = await post(submit, sub("early-player", "Early Bird"));
  t("before open -> 409, nothing stored", r.status === 409 && !emu.raw("mom:handle:s1w1:early-player"), r.body);
  lib.setClock(() => IN_WEEK_1);

  /* --- a failed write releases the handle --- */
  emu.failNext("ZADD");
  r = await post(submit, sub("unlucky-player", "Unlucky"));
  t("storage error mid-write -> 503", r.status === 503 && r.body.error === "storage unavailable", r.body);
  t("the claim and partial record are removed", !emu.raw("mom:handle:s1w1:unlucky-player") &&
    !emu.keys().some((k) => k.key.startsWith("mom:sub:") && JSON.parse(emu.raw(k.key)).handle === "unlucky-player"));
  r = await post(submit, sub("unlucky-player", "Unlucky"));
  t("the same handle can retry after the failure", r.status === 200, r.body);
  const boardSize = (await get(leaderboard, { week: "1" })).body.count;
  t("the board counts only complete entries", boardSize === 4, boardSize);

  /* --- a claim stranded mid-write frees itself in a minute --- */
  emu.failNext("ZADD");
  emu.failNext("DEL"); // the cleanup of the claim fails too
  r = await post(submit, sub("stranded-player", "Stranded"));
  const claim = emu.keys().find((k) => k.key === "mom:handle:s1w1:stranded-player");
  t("stranded claim is 'pending' with a TTL of 60 s or less",
    r.status === 503 && claim && emu.raw(claim.key) === "pending" && claim.exp <= emu.now() + 60 * 1000, claim);
  r = await post(submit, sub("stranded-player", "Stranded"));
  t("while pending, the handle is taken", r.status === 409, r.body);
  emu.advance(61 * 1000);
  r = await post(submit, sub("stranded-player", "Stranded"));
  t("after a minute the handle can file", r.status === 200, r.body);

  /* --- a TTL on every key --- */
  const keys = emu.keys();
  const noTtl = keys.filter((k) => k.exp === null);
  t("acceptance: every key has a TTL (" + keys.length + " keys)", keys.length > 10 && noTtl.length === 0, noTtl.map((k) => k.key));
  const weekExp = packs.expiresAt(PACK) * 1000;
  const weekKeys = keys.filter((k) => /^mom:(sub|board|handle|tok):/.test(k.key));
  t("submission keys expire 90 days after the week closes", weekKeys.length >= 13 && weekKeys.every((k) => k.exp === weekExp),
    weekKeys.map((k) => [k.key, k.exp]));
  const runKeys = keys.filter((k) => /^mom:runs?:/.test(k.key));
  const nowMs = emu.now();
  t("run keys (events list, seq, meta, current) expire in 30 days",
    runKeys.length === 7 && runKeys.every((k) => k.exp > nowMs + 29 * DAY && k.exp <= nowMs + 30 * DAY + 1000),
    runKeys.map((k) => k.key));
  t("the run events list itself has a TTL", keys.some((k) => k.key === "mom:run:w1-test:events" && k.type === "list" && k.exp !== null));
  const rl = keys.filter((k) => k.key.startsWith("mom:rl:"));
  t("rate-limit keys expire within about 2 minutes", rl.length > 0 && rl.every((k) => k.exp <= nowMs + 121 * 1000));

  /* --- expiry --- */
  emu.advance(31 * DAY);
  t("after 31 days the run keys are gone", !emu.keys().some((k) => /^mom:runs?:/.test(k.key)));
  r = await get(runState, { run_id: "w1-test" });
  t("run-state: expired run -> 404", r.status === 404);
  t("after 31 days submissions remain", emu.raw("mom:sub:" + receipt) !== null);
  emu.advance(weekExp - emu.now() + 1000);
  t("90 days after the week closes every key is gone", emu.keys().length === 0, emu.keys().map((k) => k.key));
  r = await get(leaderboard, { week: "1" });
  t("leaderboard empty after expiry", r.status === 200 && r.body.entries.length === 0 && r.body.count === 0, r.body);

  /* --- storage down after config: honest 503s --- */
  await srv.close();
  lib.resetStore();
  lib.setClock(() => IN_WEEK_1);
  r = await get(health);
  t("health: store down -> unreachable", r.body.storage === "unreachable", r.body);
  r = await post(submit, sub("down-player", "Downtime"));
  t("submit: store down -> 503", r.status === 503 && r.body.error === "storage unavailable", r.body);
  r = await get(leaderboard, { week: "1" });
  t("leaderboard: store down -> 503", r.status === 503);

  done();
})();
