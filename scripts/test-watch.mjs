/* Watch page checks. Run: node scripts/test-watch.mjs (or npm test).
   1. assets/js/watch.js helpers: run time is the last event minus the
      start (seconds or ISO times), tokens are only what the agent
      reported (or "—"), beats are kept once by seq (a stream reconnect
      replays from the start), the result uses the pack manifest's
      maximum and star rule, and the page follows the feed only when the
      reader has scrolled to its end.
   2. What it draws: every value escaped, the final panel says /400,
      4 scored levels, the demo label, run time and self-reported tokens.
   3. watch.html: "Connecting…" first, never "No run scheduled"; the demo
      badge; honest stat labels; no live region on the feed; replay
      controls above the feed; long text wraps on phones.
   4. watch.js source: health check before the stream, run_id=latest,
      no invented token padding, the final panel once per run, scrolling
      only through the follow check or a click.
   5. Every innerHTML assignment in watch.js is on a reviewed list.
   The browser behaviour (scroll position over time, one final panel, the
   live stream with reconnects) is checked in headless Chrome outside the
   repo; see the commit message for what was run.
   Exits non-zero on any failure. */
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const W = require("../assets/js/watch.js");
const PACK = require("../lib/packs.js").byWeek(1);

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) pass++;
  else { fail++; console.error("FAIL:", name, extra === undefined ? "" : JSON.stringify(extra).slice(0, 400)); }
}
const eq = (name, a, b) => t(name + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")", JSON.stringify(a) === JSON.stringify(b));
const XSS = '<img src=x onerror="alert(1)">';
const clean = (html) => !html.includes("<img src=x") && !html.includes("<script") && !html.includes('onerror="');

const index = JSON.parse(read("data/runs/index.json"));
const demoEntry = index.runs[0];
const demo = JSON.parse(read(demoEntry.file));

/* ---------- 1. helpers ---------- */
{
  eq("clock: unknown", W.fmtClock(null), "--:--");
  eq("clock: zero", W.fmtClock(0), "0:00");
  eq("clock: minutes", W.fmtClock(223.3), "3:43");
  eq("clock: hours", W.fmtClock(3725), "1:02:05");

  eq("event time: archive seconds", W.eventSeconds({ t: 12.5 }, demo.started_at), 12.5);
  const start = "2026-10-05T16:00:00.000Z";
  eq("event time: live ISO stamp", W.eventSeconds({ t: "2026-10-05T16:00:42.000Z" }, start), 42);
  eq("event time: epoch-ms start", W.eventSeconds({ t: "2026-10-05T16:00:42.000Z" }, Date.parse(start)), 42);
  eq("event time: unknown", [W.eventSeconds({}, start), W.eventSeconds({ t: "nope" }, start), W.eventSeconds({ t: "2026-10-05T16:00:42Z" }, null)], [null, null, null]);

  const last = demo.events[demo.events.length - 1].t;
  eq("run time: the demo's last event minus its start", W.runSeconds(demo.events, demo.started_at), last);
  eq("run time: formatted", W.fmtClock(W.runSeconds(demo.events, demo.started_at)), "3:43");
  const live = [{ seq: 1, t: "2026-10-05T16:00:00.000Z" }, { seq: 2, t: "2026-10-05T16:03:05.000Z" }];
  eq("run time: live ISO events, not now minus the start", W.runSeconds(live, start), 185);
  eq("run time: no timed events", W.runSeconds([{ seq: 1 }], start), null);

  const reported = demo.events.filter((e) => e.type === "score").reduce((a, e) => a + e.tokens_est, 0);
  eq("tokens: the demo's reported estimates, summed", W.reportedTokens(demo.events), reported);
  eq("tokens: the demo total is 31,000", W.tokenText(W.reportedTokens(demo.events)), "31,000");
  eq("tokens: none reported shows a dash", W.tokenText(W.reportedTokens([{ seq: 1, type: "thought", text: "x" }])), "—");
  eq("tokens: only score events count", W.reportedTokens([{ type: "note", tokens_est: 500 }, { type: "score", tokens_est: 10 }]), 10);
  eq("tokens: nothing added per event", W.reportedTokens(demo.events.concat(demo.events.filter((e) => e.type !== "score"))), reported);

  const list = [], seen = {};
  demo.events.slice(0, 5).forEach((e) => W.addEvent(list, seen, e));
  const again = demo.events.slice(0, 8).map((e) => W.addEvent(list, seen, e));
  eq("reconnect replay: seen beats are dropped, new ones kept", again, [false, false, false, false, false, true, true, true]);
  eq("reconnect replay: each beat once", list.map((e) => e.seq), [1, 2, 3, 4, 5, 6, 7, 8]);
  t("a beat with no seq is refused", !W.addEvent(list, seen, { type: "note", text: "x" }));

  const s = W.summary(demo.events, PACK);
  eq("summary: 318 of 400, 3 of 4 stars", [s.total, s.maxTotal, s.stars, s.maxStars, s.scoredCount], [318, 400, 3, 4, 4]);
  eq("summary: L5 is the exhibition", s.exhibitions, [5]);
  eq("summary: the index agrees", demoEntry.score, s.total);
  const noPack = W.summary(demo.events, null);
  eq("summary without a manifest: no maximum, no stars", [noPack.total, noPack.maxTotal, noPack.stars, noPack.maxStars], [318, null, null, null]);
  const extra = demo.events.concat([{ seq: 99, type: "score", level: 5, total: 100 }]);
  eq("summary: an exhibition score adds nothing", W.summary(extra, PACK).total, 318);
  const redo = demo.events.concat([{ seq: 99, type: "score", level: 1, total: 60 }]);
  eq("summary: the last score for a level wins", [W.summary(redo, PACK).total, W.summary(redo, PACK).stars], [321, 4]);
  eq("star rule from the manifest", [W.earnsStar(PACK, 59), W.earnsStar(PACK, 60), W.earnsStar(null, 99)], [false, true, false]);

  const vh = 900;
  eq("follow: never before the reader scrolls", W.isFollowing({ top: -2000, bottom: 850 }, vh, 0), false);
  eq("follow: feed below the hero", W.isFollowing({ top: 700, bottom: 700 }, vh, 10), false);
  eq("follow: reader at the feed's end", W.isFollowing({ top: -2000, bottom: 850 }, vh, 3000), true);
  eq("follow: end just below the fold", W.isFollowing({ top: -2000, bottom: 960 }, vh, 3000), true);
  eq("follow: reader scrolled up into the feed", W.isFollowing({ top: -800, bottom: 2400 }, vh, 1500), false);
  eq("follow: reader scrolled past the feed", W.isFollowing({ top: -3000, bottom: -10 }, vh, 4000), false);

  eq("default replay: the first archived run", W.defaultRun(index), index.runs[0]);
  eq("default replay: none", W.defaultRun({ runs: [] }), null);
  eq("run id from the URL", [W.runIdFrom("?run=w1-live.2"), W.runIdFrom("?x=1&run=abc"), W.runIdFrom("?run=%3Cx%3E"), W.runIdFrom("")],
    ["w1-live.2", "abc", null, null]);
  eq("manifest URL", W.packUrl(1), "data/packs/s1w1.json");
  t("the manifest URL exists", existsSync(join(ROOT, W.packUrl(demo.week))));
}

/* ---------- 2. what it draws ---------- */
{
  const ctx = { agent: XSS, pack: PACK };
  const evs = [
    { type: "thought", level: 1, text: XSS },
    { type: "tool", level: 1, name: XSS, detail: XSS },
    { type: "result", level: 1, summary: XSS },
    { type: "answer", level: 1, text: XSS },
    { type: "score", level: XSS, total: XSS, tokens_est: 5, seconds: 9, parts: { correctness: XSS, tokens: 2, time: -1, procedure: 0.5 } },
    { type: "level", phase: "start", n: XSS, title: XSS },
    { type: "level", phase: "end", n: XSS },
    { type: "run", phase: "start" },
    { type: "note", text: XSS }
  ];
  for (const ev of evs) {
    const v = W.eventView(ev, ctx);
    t("draws " + ev.type + (ev.phase ? "/" + ev.phase : ""), v && typeof v.html === "string");
    t(ev.type + (ev.phase ? "/" + ev.phase : "") + ": escaped", v && clean(v.html), v && v.html);
  }
  t("run/end draws nothing (the final panel covers it)", W.eventView({ type: "run", phase: "end" }, ctx) === null);
  t("an unknown type draws nothing", W.eventView({ type: "html", text: XSS }, ctx) === null);
  const bars = W.eventView(evs[4], ctx).html;
  t("score bars clamp to 0-100", bars.includes('data-w="100"') && bars.includes('data-w="0"') && bars.includes('data-w="50"'));

  const star = (total, pack) => W.eventView({ type: "score", level: 2, total, parts: {} }, { pack }).html;
  t("score card: a star at the manifest threshold", star(60, PACK).includes("★") && !star(59, PACK).includes("★"));
  t("score card: out of the manifest's level maximum", star(60, PACK).includes("60/100"));
  t("score card without a manifest: no star, no maximum", !star(99, null).includes("★") && star(99, null).includes('<div class="score-total">99</div>'));
  t("score card: the agent's own numbers, labelled", W.eventView(demo.events.find((e) => e.type === "score"), { pack: PACK }).html
    .includes("Reported by the agent: 6,000 tokens (est.), 0:31"));

  const view = { agent: demo.agent, label: demo.label, demo: true, events: demo.events, startedAt: demo.started_at, pack: PACK };
  const fin = W.finalHtml(view);
  t("final: 318 of 400", fin.includes('<div class="big-score">318<span class="small muted">/400</span></div>'), fin);
  t("final: 3 of 4 stars", fin.includes("★★★☆") && fin.includes('aria-label="3 of 4 stars"'));
  t("final: 4 scored levels, L5 unscored", fin.includes("on 3 of 4 scored levels") && fin.includes("L5 is an unscored exhibition"));
  t("final: labelled demo and unofficial", fin.includes("Final minutes · Demo run, unofficial") && fin.includes("self-reported and unofficial"));
  t("final: run time is the last event minus the start", fin.includes("Run time 3:43"));
  t("final: tokens are the agent's estimate", fin.includes("31,000 tokens, est., self-reported"));
  t("final: points to the pack, not an empty board", fin.includes('href="/pack"') && !fin.includes("leaderboard"));
  const bare = W.finalHtml({ agent: "Juniper", events: [{ seq: 1, t: 0, type: "run", phase: "start" }], startedAt: 0, pack: null });
  t("final without a manifest: no maximum, no stars", bare.includes('<div class="big-score">0</div>') && !bare.includes("★") && !bare.includes("☆"), bare);
  t("final with no reported tokens says so", bare.includes("No tokens reported"));
  t("final: a real run says provisional", bare.includes("self-reported and provisional"));
  t("final: escaped", clean(W.finalHtml({ ...view, agent: XSS, label: XSS })));

  const item = W.runItemHtml(demoEntry, PACK);
  t("archive item: score out of the manifest maximum", item.includes('<span class="rscore">318/400</span>'), item);
  t("archive item: shows the demo label", item.includes('<span class="rlabel">Demo run, unofficial</span>'));
  t("archive item without a manifest: points only", W.runItemHtml(demoEntry, null).includes("318 points"));
  t("archive item: escaped", clean(W.runItemHtml({ id: XSS, title: XSS, label: XSS, agent: XSS, date: XSS, score: 1 }, PACK)));
}

/* ---------- 3. watch.html ---------- */
{
  const html = read("watch.html");
  const js = read("assets/js/watch.js");
  t("starts in 'Connecting…'", html.includes('<strong id="run-agent">Connecting…</strong>') &&
    html.includes('<span class="muted" id="run-title">Checking for a live run</span>'));
  t("never says 'No run scheduled'", !/no run scheduled/i.test(html) && !/no run scheduled/i.test(js));
  t("demo badge", /<span class="demo-badge" id="demo-badge" hidden>Demo run, unofficial<\/span>/.test(html));
  t("finished badge", /id="done-badge" hidden>FINISHED</.test(html));
  t("run time label", html.includes('<b id="clock">--:--</b><span id="clock-label">run time</span>'));
  t("tokens start as a dash, labelled self-reported estimates", html.includes('<b id="tokcount">—</b>est. tokens, self-reported'));
  t("the feed is not a live region", /<div id="feed" class="feed"><\/div>/.test(html) && !/id="feed"[^>]*aria-live/.test(html));
  t("a status line for screen readers", /<p id="watch-status" class="sr-only" role="status"><\/p>/.test(html));
  t("main.css has .sr-only", /\.sr-only\{/.test(read("assets/css/main.css")));
  t("level dots are an image with a label", /id="level-dots" role="img" aria-label="Level progress\."/.test(html));
  t("replay controls sit above the feed", html.indexOf('id="replay-controls"') > -1 && html.indexOf('id="replay-controls"') < html.indexOf('id="feed"'));
  t("'Back to live' starts hidden", /id="rp-exit" hidden>/.test(html));
  t("event cards wrap long text", /\.ev\{[^}]*overflow-wrap:anywhere/.test(html) && /\.feed\{min-width:0\}/.test(html));
  t("the about box, final panel, header and archive items wrap long text",
    /\.replay-about\{[^}]*overflow-wrap:anywhere/.test(html) && /\.run-end\{[^}]*overflow-wrap:anywhere/.test(html) &&
    /\.live-meta strong\{[^}]*overflow-wrap:anywhere/.test(html) && /\.replay-item \.rmain\{[^}]*overflow-wrap:anywhere/.test(html));
  t("a hidden feed is hidden (its display:flex would override the attribute)", /\.feed\[hidden\]\{display:none\}/.test(html));
  t("on a phone the run bar scrolls away instead of covering the feed", /@media \(max-width:720px\)\{[^}]*\.livebar\{position:static\}/.test(html));
  t("no one-line typing effect that cut long notes off", !/\.typing|shimmer/.test(html + js));
  t("loads main.js and watch.js", /<script src="\/assets\/js\/main\.js(\?v=[0-9a-f]+)?" defer><\/script>/.test(html) &&
    /<script src="\/assets\/js\/watch\.js(\?v=[0-9a-f]+)?" defer><\/script>/.test(html));
  t("links the manifest", html.includes('href="/data/packs/s1w1.json"'));
}

/* ---------- 4. watch.js source ---------- */
{
  const js = read("assets/js/watch.js");
  t("no invented token padding", !/TOKEN_PER_EVENT|eventsSeen/.test(js));
  t("no hard-coded run id", !/week1-live/.test(js) && /requestedRun \|\| "latest"/.test(js));
  t("checks /api/health before opening the stream", /h\.storage !== "reachable"/.test(js) && js.indexOf("HEALTH_URL, {") < js.indexOf("openStream(requestedRun"));
  t("a stream that fails closed gives up at once", /readyState !== 2/.test(js));
  t("the stream closes when the run ends", /addEventListener\("end"/.test(js) && /function finishLive\(\) \{\s*closeStream\(\);/.test(js));
  t("the final panel renders once per run", /if \(!view \|\| view\.finalShown === view\.key\) return;/.test(js));
  t("beats queued for another run are dropped when a run starts",
    /function enterLive\(meta\) \{\s*stopReplay\(\);\s*dropQueue\(\);/.test(js) && /closeStream\(\);\s*dropQueue\(\);\s*stopReplay\(\);/.test(js));
  t("no polling timers for runs", !/setInterval\((?!tick)/.test(js));
  const scrolls = [...js.matchAll(/scrollIntoView/g)].length;
  t("two scroll calls: the follow check and a click on a replay (" + scrolls + ")", scrolls === 2);
  t("the follow scroll is guarded", /if \(follow\) reveal\(/.test(js));
  t("the replay scroll is only for a click", /if \(opts\.user\) \{\s*controls\.scrollIntoView/.test(js));
}

/* ---------- 5. innerHTML ratchet ---------- */
{
  const ALLOWED = [
    "v.html",
    '""',
    "finalHtml(view)",
    "runItemHtml(run, runPacks[i])",
    "\"<p class='muted'>No archived runs yet.</p>\"",
    "\"<p class='muted'>Couldn't load the archive.</p>\""
  ];
  const js = read("assets/js/watch.js");
  const found = [...js.matchAll(/\.innerHTML\s*=\s*([^;]+);/g)].map((m) => m[1].replace(/\s+/g, " ").trim());
  t("watch.js: has innerHTML assignments to check", found.length > 0);
  for (const rhs of found) t("watch.js: innerHTML = " + rhs.slice(0, 80) + " is reviewed", ALLOWED.includes(rhs));
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
