/* Pack manifest contract. Run: node scripts/test-pack.mjs (or npm test).
   data/packs/s1w1.json is the one source for Week 1's levels, pars,
   blends, correctness type, maximum total and star rule. This fails if
   anything that uses those numbers disagrees with it:
   1. The manifest itself is well formed and holds nothing answer-shaped.
   2. pack.html, scoring.html, faq.html and submit.html: every marked number matches
      (scripts/stamp-pack.mjs), and no page has lost a marker it needs.
   3. scoring.html's worked example is what lib/score.js computes.
   4. lib/score.js scores with the manifest's pars, blends and star rule.
   5. api/submit.js scores with the week's manifest and stamps it on the
      record (scripts/test-integration.mjs runs it end to end).
   6. lib/validate.js asks for the manifest's scored levels.
   7. The archived runs' self-reported scores reproduce under the
      manifest pars. That is the check behind the par choice: see
      data/packs/README.md, "Pars".
   8. assets/js/watch.js reads the manifest instead of hard-coding it.
   Exits non-zero on any failure. */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, PACK, PAGES, required, stamp, allMarkers, value } from "./stamp-pack.mjs";

const require = createRequire(import.meta.url);
const packs = require("../lib/packs.js");
const { provisionalScore, provisionalSubmissionScore, levelSpec } = require("../lib/score.js");
const { validateSubmission } = require("../lib/validate.js");

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) pass++;
  else { fail++; console.error("FAIL:", name, extra === undefined ? "" : JSON.stringify(extra).slice(0, 400)); }
}
const eq = (name, a, b) => t(name + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")", JSON.stringify(a) === JSON.stringify(b));
const read = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const clone = (o) => JSON.parse(JSON.stringify(o));
const SCORED = packs.scoredLevels(PACK);

/* ---------- 1. the manifest ---------- */
{
  eq("manifest problems", packs.checkManifest(PACK), []);
  t("manifest has a version", Number.isInteger(PACK.version) && PACK.version >= 1);
  eq("scored levels", SCORED, [1, 2, 3, 4]);
  eq("L5 is the exhibition", PACK.levels.filter((l) => l.exhibition).map((l) => l.n), [5]);
  eq("canonical line: 400 points, 4 stars, star at 60",
    [PACK.scoring.max_total, PACK.scoring.max_stars, PACK.scoring.star_at, PACK.scoring.level_max], [400, 4, 60, 100]);
  eq("every scored level is binary correctness today", SCORED.map((n) => packs.level(PACK, n).correctness), ["binary", "binary", "binary", "binary"]);
  eq("pars (tokens / seconds), the pack-page set",
    SCORED.map((n) => [packs.level(PACK, n).par.tokens, packs.level(PACK, n).par.seconds]),
    [[800, 60], [4000, 240], [2500, 180], [6000, 360]]);
  t("pars are marked uncalibrated", PACK.scoring.pars_calibrated === false);
  t("the L3 safety cap is recorded but not applied", packs.level(PACK, 3).safety_cap.applied === false);
  t("hash is stable sha256 hex", /^[0-9a-f]{64}$/.test(packs.hash(PACK)) && packs.hash(PACK) === packs.hash(clone(PACK)));
  const reverseKeys = (v) => Array.isArray(v) ? v.map(reverseKeys)
    : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).reverse().map((k) => [k, reverseKeys(v[k])])) : v;
  const reordered = reverseKeys(PACK);
  t("hash ignores key order", packs.hash(reordered) === packs.hash(PACK));
  const bumped = clone(PACK); bumped.levels[0].par.seconds = 61;
  t("hash changes with any number", packs.hash(bumped) !== packs.hash(PACK));
  const onDisk = JSON.parse(read("data/packs/s1w1.json"));
  t("lib/packs.js serves the file on disk", packs.hash(onDisk) === packs.hash(PACK));

  // The checker catches what would make the scorer or the pages lie.
  const cases = [
    ["blend doesn't sum to 1", (p) => { p.levels[0].blend.token = 0.6; }, /blend/],
    ["max_total out of step", (p) => { p.scoring.max_total = 500; }, /max_total/],
    ["max_stars out of step", (p) => { p.scoring.max_stars = 5; }, /max_stars/],
    ["partial correctness", (p) => { p.levels[3].correctness = "partial"; }, /correctness/],
    ["cap switched on", (p) => { p.levels[2].safety_cap.applied = true; }, /safety_cap/],
    ["exhibition with a par", (p) => { p.levels[4].par = { tokens: 1, seconds: 1 }; }, /exhibition/],
    ["zero par", (p) => { p.levels[1].par.tokens = 0; }, /par/],
    ["levels out of order", (p) => { p.levels.reverse(); }, /numbered/],
    ["an answer key", (p) => { p.levels[0].answer_key = "x"; }, /answer-shaped/]
  ];
  for (const [name, mutate, re] of cases) {
    const p = clone(PACK);
    mutate(p);
    t("checkManifest catches: " + name, packs.checkManifest(p).some((e) => re.test(e)), packs.checkManifest(p));
  }
}

/* ---------- 2. pages ---------- */
{
  const req = required(PACK);
  for (const page of PAGES) {
    const html = read(page);
    const res = stamp(html, PACK);
    eq(page + ": marked numbers match the manifest (run npm run build:pack)", res.drift, []);
    t(page + ": every marker holds plain text", res.paths.length === allMarkers(html).length);
    for (const path of req[page]) t(page + ": carries " + path, res.paths.includes(path));
  }

  // The check really compares: change a par or a blend and the pages drift.
  const tampered = clone(PACK);
  tampered.levels[0].par.seconds = 120;
  tampered.levels[1].blend = { token: 0.35, time: 0.25, procedure: 0.4 };
  tampered.levels[2].blend = { token: 0.1, time: 0.2, procedure: 0.7 };
  const packDrift = stamp(read("pack.html"), tampered).drift.map((d) => d.path);
  t("a changed L1 par time shows as drift on pack.html", packDrift.includes("levels.1.par.seconds"), packDrift);
  t("a changed L2 blend shows as drift on pack.html", packDrift.includes("levels.2.blend"), packDrift);
  const scoringDrift = stamp(read("scoring.html"), tampered).drift.map((d) => d.path);
  t("a changed L2 blend shows as drift in the scoring table", ["levels.2.blend.token", "levels.2.blend.time", "levels.2.blend.procedure"].every((p) => scoringDrift.includes(p)), scoringDrift);
  t("a changed L1 par shows as drift in the worked example", scoringDrift.includes("levels.1.par.seconds#"), scoringDrift);
  t("a changed blend range shows as drift on the dimension cards", scoringDrift.includes("blend_range.token"), scoringDrift);
  const stripped = read("pack.html").replace(' data-pack="levels.3.par.tokens"', "");
  t("a removed marker is caught", !stamp(stripped, PACK).paths.includes("levels.3.par.tokens"));

  // Formatting
  eq("seconds under 2 min", value(PACK, "levels.1.par.seconds"), "60 s");
  eq("whole minutes", value(PACK, "levels.2.par.seconds"), "4 min");
  eq("thousands", value(PACK, "levels.2.par.tokens"), "4,000");
  eq("bare number", value(PACK, "levels.2.par.tokens#"), "4000");
  eq("blend", value(PACK, "levels.3.blend"), "20 / 20 / 60");
  eq("blend weight", [value(PACK, "levels.1.blend.token"), value(PACK, "levels.1.blend.token#")], ["50%", "0.50"]);
  eq("blend ranges", ["token", "time", "procedure"].map((d) => value(PACK, "blend_range." + d)), ["20–50%", "20–30%", "20–60%"]);
  let threw = false;
  try { value(PACK, "levels.1.answer"); } catch (e) { threw = /unknown data-pack path/.test(e.message); }
  t("an unknown path throws", threw);

  // The pages link the manifest, so a reader can check the numbers.
  for (const page of ["pack.html", "scoring.html"]) {
    t(page + ": links the manifest", read(page).includes('href="/data/packs/s1w1.json"'));
  }
}

/* ---------- 3. the worked example ---------- */
{
  const html = read("scoring.html");
  const ex = (key) => [...html.matchAll(new RegExp('data-example="' + key + '">([^<]*)<', "g"))].map((m) => m[1]);
  const L1 = packs.level(PACK, 1);
  const input = { n: 1, correct: 1, tokens_est: 860, seconds: 70, procedure_score: 1 };
  t("scoring.html: example inputs are 860 tokens and 70 s", html.includes("860 tokens against") && html.includes("70 s against"));
  const tokenEff = Math.min(1, L1.par.tokens / input.tokens_est).toFixed(2);
  const timeEff = Math.min(1, L1.par.seconds / input.seconds).toFixed(2);
  const blend = (L1.blend.token * Number(tokenEff) + L1.blend.time * Number(timeEff) + L1.blend.procedure * 1).toFixed(3);
  const s = provisionalScore(input, PACK);
  eq("example token efficiency", [...new Set(ex("token_eff"))], [tokenEff]);
  eq("example time efficiency", [...new Set(ex("time_eff"))], [timeEff]);
  eq("example blend", [...new Set(ex("blend"))], [blend]);
  eq("example total is what lib/score.js computes", ex("total"), [String(s.total)]);
  eq("the page's rounded arithmetic lands on the same total", Math.round(Number(blend) * PACK.scoring.level_max), s.total);
  eq("example star line", ex("star"), [s.star ? "star earned" : "no star"]);
}

/* ---------- 4. lib/score.js ---------- */
{
  for (const n of SCORED) {
    const L = packs.level(PACK, n);
    t("score.js L" + n + " spec is the manifest level", levelSpec(PACK, n) === L);
    const atPar = provisionalScore({ n, correct: 1, tokens_est: L.par.tokens, seconds: L.par.seconds, procedure_score: 1 }, PACK);
    eq("L" + n + " at par with full procedure scores the maximum", atPar.total, PACK.scoring.level_max);
    const doubled = provisionalScore({ n, correct: 1, tokens_est: 2 * L.par.tokens, seconds: 2 * L.par.seconds, procedure_score: 0 }, PACK);
    eq("L" + n + " at twice par, no procedure: half the token and time weights",
      doubled.total, Math.round(PACK.scoring.level_max * (L.blend.token + L.blend.time) / 2));
    eq("L" + n + " blend reported", doubled.blend, L.blend);
  }
  // Scores move with the manifest, not with numbers inside score.js.
  const moved = clone(PACK);
  moved.levels[0].par.seconds = 120;
  const slow = { n: 1, correct: 1, tokens_est: 800, seconds: 120, procedure_score: 1 };
  eq("L1 at 120 s under the manifest", provisionalScore(slow, PACK).total, 85);
  eq("L1 at 120 s under a 120 s par", provisionalScore(slow, moved).total, 100);
  const starMoved = clone(PACK);
  starMoved.scoring.star_at = 95;
  t("the star rule comes from the manifest", provisionalScore(slow, PACK).star === true && provisionalScore(slow, starMoved).star === false);
  const all = provisionalSubmissionScore(SCORED.map((n) => ({ n, correct: 1, tokens_est: 1, seconds: 1, procedure_score: 1 }))
    .concat([{ n: 5, answer: "x" }]), PACK);
  eq("perfect run: max_total and max_stars", [all.total, all.stars, all.max_total, all.max_stars],
    [PACK.scoring.max_total, PACK.scoring.max_stars, PACK.scoring.max_total, PACK.scoring.max_stars]);
  t("the exhibition scores nothing", all.levels.find((l) => l.n === 5).exhibition === true);
  const src = read("lib/score.js");
  t("score.js has no par or blend numbers of its own", !/\b(800|4000|2500|6000|120|240|360|480|600)\b/.test(src.replace(/\/\*[\s\S]*?\*\//g, "")));
}

/* ---------- 5. api/submit.js ---------- */
{
  const page = read("assets/js/submit.js");
  t("submit.js shows the API's max_total on the receipt", page.includes('if(typeof d.max_total === "number") $("receipt-max").textContent = String(d.max_total);'));
  t("submit.js's shareable receipt text uses it too", page.includes('"/" + $("receipt-max").textContent + ", self-reported'));
  const src = read("api/submit.js");
  t("submit scores with the week's manifest", /provisionalSubmissionScore\(sub\.levels, pack\)/.test(src));
  t("submit stamps the manifest hash and version", /packs\.hash\(pack\)/.test(src) && /pack_version:/.test(src) && /pack_hash:/.test(src));
}

/* ---------- 6. lib/validate.js ---------- */
{
  const base = {
    week: 1, handle: "juniper-7", agent: "Juniper", consent: { terms: true, publish: false },
    levels: SCORED.map((n) => ({ n, answer: "a fictional answer", tokens_est: 10, seconds: 10, procedure: "steps" }))
  };
  t("a submission with the manifest's scored levels validates", validateSubmission(base).ok, validateSubmission(base).errors);
  for (const n of SCORED) {
    const b = clone(base);
    b.levels = b.levels.filter((l) => l.n !== n);
    t("validate requires scored level " + n, validateSubmission(b).errors.some((e) => e.includes("level " + n + " is required")));
  }
  const withL5 = clone(base);
  withL5.levels.push({ n: 5, answer: "a one-page dashboard" });
  t("validate takes the exhibition as optional", validateSubmission(withL5).ok);
}

/* ---------- 7. archived runs reproduce under the manifest ---------- */
{
  const index = JSON.parse(read("data/runs/index.json"));
  let checked = 0;
  for (const entry of index.runs) {
    const run = JSON.parse(read(entry.file));
    const pack = packs.byWeek(run.week);
    t(entry.id + ": has a manifest for its week", Boolean(pack));
    if (!pack) continue;
    const scores = run.events.filter((e) => e.type === "score");
    for (const e of scores) {
      const again = provisionalScore({
        n: e.level, correct: e.parts.correctness, tokens_est: e.tokens_est, seconds: e.seconds, procedure_score: e.parts.procedure
      }, pack);
      eq(entry.id + " L" + e.level + ": the self-reported total reproduces under the manifest pars", again.total, e.total);
      checked++;
    }
    const sum = scores.filter((e) => packs.scoredLevels(pack).includes(e.level)).reduce((a, e) => a + e.total, 0);
    t(entry.id + ": total within the manifest maximum", sum === entry.score && sum <= pack.scoring.max_total);
  }
  t("at least one archived score was checked", checked > 0);
}

/* ---------- 8. watch.js reads the manifest ---------- */
{
  const js = read("assets/js/watch.js");
  t("watch.js loads data/packs/s1w<week>.json", js.includes('"data/packs/s1w"'));
  t("watch.js reads max_total and star_at from it", /scoring\.max_total/.test(js) && /scoring\.star_at/.test(js));
  t("watch.js hard-codes no maximum or star threshold", !/\/400|>= ?60\b|400\b/.test(js));
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
