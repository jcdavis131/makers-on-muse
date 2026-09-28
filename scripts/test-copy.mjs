/* Copy and pre-launch checks. Run: node scripts/test-copy.mjs (or npm test).
   1. assets/js/season.js: Week 1 dates, labels, status and submit gate.
   2. Pages: the static date copy matches season.js, the submit form ships
      closed, and every page carries the footer date line and the
      independent-project and trademark line.
   3. Honest copy: phrases that promise things the site doesn't do yet
      must not come back.
   4. Canonical scoring line: 4 scored levels, 400 points, 0-4 stars, L5
      an unscored exhibition.
   5. Muse facts cite a source, and only sources the review checked.
   Exits non-zero on any failure. */
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const season = require("../assets/js/season.js");
const { provisionalSubmissionScore } = require("../lib/score.js");
const PACK = require("../lib/packs.js").byWeek(1);

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) pass++;
  else { fail++; console.error("FAIL:", name); }
}
function eq(name, a, b) {
  t(name + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")", a === b);
}

const read = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const decode = (s) => s
  .replace(/&ndash;/g, "–").replace(/&mdash;/g, "—")
  .replace(/&middot;/g, "·").replace(/&hellip;/g, "…")
  .replace(/&ldquo;|&rdquo;/g, '"').replace(/&rsquo;|&lsquo;/g, "'")
  .replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");

/* ---------- 1. season.js ---------- */
const wk = season.WEEKS[0];
eq("week 1 opens (UTC)", wk.opens, "2026-10-05T11:00:00Z");
eq("week 1 closed-from (UTC)", wk.closes, "2026-10-12T05:00:00Z");
eq("week 1 is season 1 week 1", wk.season + "/" + wk.week, "1/1");

const ct = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric",
  year: "numeric", hour: "numeric", minute: "2-digit", hour12: true
});
function ctParts(ms) {
  const o = {};
  for (const p of ct.formatToParts(new Date(ms))) o[p.type] = p.value;
  return o;
}
function ctLabel(ms) {
  const p = ctParts(ms);
  return `${p.weekday} ${p.month} ${p.day}, ${p.year}, ${p.hour}:${p.minute} ${p.dayPeriod} CT`;
}
const OPEN = Date.parse(wk.opens), CLOSE = Date.parse(wk.closes);
eq("opens is Mon Oct 5 2026 6:00 AM in Chicago", ctLabel(OPEN), "Mon Oct 5, 2026, 6:00 AM CT");
eq("last open minute is Sun Oct 11 2026 11:59 PM in Chicago", ctLabel(CLOSE - 60000), "Sun Oct 11, 2026, 11:59 PM CT");
eq("closed-from is midnight CT", ctLabel(CLOSE), "Mon Oct 12, 2026, 12:00 AM CT");
eq("opensLabel matches the instant", wk.opensLabel, ctLabel(OPEN));
eq("closesLabel matches the instant", wk.closesLabel, ctLabel(CLOSE - 60000));
{
  const o = ctParts(OPEN), c = ctParts(CLOSE - 60000);
  eq("range label matches the instants", wk.range,
    `${o.weekday} ${o.month} ${o.day} – ${c.weekday} ${c.month} ${c.day}, ${c.year}`);
}

const TODAY = Date.parse("2026-09-27T23:00:00Z");
eq("status today", season.status(TODAY), "before");
eq("status 1 ms before open", season.status(OPEN - 1), "before");
eq("status at open", season.status(OPEN), "open");
eq("status mid-week", season.status(Date.parse("2026-10-08T17:00:00Z")), "open");
eq("status 1 ms before close", season.status(CLOSE - 1), "open");
eq("status at close", season.status(CLOSE), "closed");
eq("status well after", season.status(Date.parse("2026-12-01T00:00:00Z")), "closed");
eq("status accepts Date", season.status(new Date(OPEN)), "open");
eq("statusText before", season.statusText(TODAY), "Week 1 opens Mon Oct 5, 2026, 6:00 AM CT.");
eq("statusText open", season.statusText(OPEN), "Week 1 is open until Sun Oct 11, 2026, 11:59 PM CT.");
eq("statusText closed", season.statusText(CLOSE), "Week 1 closed Sun Oct 11, 2026, 11:59 PM CT.");

const gBefore = season.submitGate(TODAY);
t("gate closed before open", gBefore.open === false);
eq("gate title before open", gBefore.title, "Submissions open Mon Oct 5, 2026, 6:00 AM CT.");
t("gate body names the close", gBefore.body.includes("Sun Oct 11, 2026, 11:59 PM CT"));
t("gate open during the week", season.submitGate(OPEN).open === true && season.submitGate(CLOSE - 1).open === true);
eq("gate week", season.submitGate(OPEN).week, 1);
const gAfter = season.submitGate(CLOSE);
t("gate closed after close", gAfter.open === false && /closed/i.test(gAfter.title));

/* ---------- 2. pages ---------- */
const pages = readdirSync(ROOT).filter((f) => f.endsWith(".html")).sort();
t("found the 9 pages", pages.length >= 9);

// The shared footer (partials/footer.html) carries it; scripts/test-layout.mjs
// checks every page has that footer.
const TRADEMARK = "Makers on Muse is an independent community project. Not affiliated with, endorsed by, or sponsored by Meta Platforms, Inc. Muse and Meta are trademarks of Meta Platforms, Inc.";
const footerLine = `Season ${wk.season} · Week ${wk.week}: ${wk.range}, closes ${wk.closesLabel.split(", ").pop()}`;
for (const p of pages) {
  const html = read(p);
  const text = decode(html);
  t(p + ": footer date line", text.includes(footerLine));
  t(p + ": trademark line", text.includes(TRADEMARK));

  // Every [data-season-status] element: static text is the "before" line,
  // and the page loads season.js to update it.
  const re = /<(\w+)[^>]*\bdata-season-status\b[^>]*>([^<]*)</g;
  let m, n = 0;
  while ((m = re.exec(html))) {
    n++;
    eq(p + ": static season status is the pre-open line", decode(m[2]), season.statusText(OPEN - 1));
  }
  if (n) t(p + ": loads season.js", /<script src="\/assets\/js\/season\.js(\\?v=[0-9a-f]+)?"><\/script>/.test(html));
}

for (const p of ["index.html", "pack.html", "faq.html", "leaderboard.html", "submit.html"]) {
  t(p + ": states the open time", decode(read(p)).includes(wk.opensLabel));
}
for (const p of ["pack.html", "faq.html", "leaderboard.html", "submit.html"]) {
  t(p + ": states the close time", decode(read(p)).includes(wk.closesLabel));
}

{
  const html = read("submit.html");
  t("submit: form ships disabled", /<fieldset id="sub-fields" disabled>/.test(html));
  t("submit: fieldset wraps the submit button",
    html.indexOf('<fieldset id="sub-fields"') < html.indexOf('id="sub-btn"') &&
    html.indexOf('id="sub-btn"') < html.indexOf("</fieldset>"));
  const title = html.match(/<strong id="sub-gate-title">([^<]*)<\/strong>/);
  const body = html.match(/<p id="sub-gate-body">([^<]*)<\/p>/);
  eq("submit: static gate title", title && decode(title[1]), gBefore.title);
  eq("submit: static gate body", body && decode(body[1]), gBefore.body);
  const seasonTag = html.search(/<script src="\/assets\/js\/season\.js(\\?v=[0-9a-f]+)?"><\/script>/);
  t("submit: season.js loads (not deferred) before the inline script",
    seasonTag > -1 && seasonTag < html.indexOf("/* Submit flow"));
  t("submit: inline script uses the season gate", html.includes("S.submitGate(Date.now())"));
  t("submit: week field is read-only", /id="f-week"[^>]*readonly/.test(html));
  t("submit: no hard-coded start date", !/Date\.parse\("2026-/.test(html));
}

/* ---------- 3. honest copy ---------- */
const scanFiles = [
  ...pages,
  ...readdirSync(join(ROOT, "assets/js")).filter((f) => f.endsWith(".js")).map((f) => "assets/js/" + f),
  "api/submit.js",
  "lib/score.js"
];
const BANNED = [
  [/live now/i, "Live now (Week 1 isn't open)"],
  [/never self-reported/i, "claims scores aren't self-reported"],
  [/no transcript, no score/i, "transcript rule (no transcript intake exists)"],
  [/token-counting method/i, "published token method (none exists)"],
  [/reviews every transcript/i, "Mabel reviewing transcripts"],
  [/verified scoring/i, "verified scoring (not built)"],
  [/final standings/i, "final standings on a schedule (not built)"],
  [/field-tested/i, "field-tested workflows"],
  [/community vot/i, "community voting (not built)"],
  [/registered agent name/i, "registered names (no registration)"],
  [/appealable/i, "appeals (not built)"],
  [/mabel can tell/i, "transcript detection"],
  [/mabel (showcases|picks)/i, "L5 showcase picks (not built)"],
  [/install skills?/i, "install skills (not a consumer Muse step)"],
  [/teach it the skill/i, "teach it the skill"],
  [/skills and connectors/i, "entries listing skills and connectors (not collected)"],
  [/updated weekly from real results/i, "setup data (none collected)"],
  [/top-10 usage/i, "usage stats (none collected)"],
  [/oauth takes an afternoon/i, "Gmail is a Settings > Connectors flow"],
  [/nothing identifiable is kept/i, "redaction overclaim"],
  [/answers is pointless/i, "instances aren't built"],
  [/\byou get one of \d+/i, "instances aren't built"],
  [/fully automatic/i, "automatic grading (not built)"],
  [/human-reviewed/i, "human review (not built)"],
  [/unlimited retries/i, "retry policy isn't set"],
  [/old packs stay playable/i, "pack archive (not built)"],
  [/streak alive|extends your streak|reset streaks|unlocks: streaks/i, "streaks (not built)"],
  [/works offline/i, "Muse needs a connection"],
  [/wake-up alarm/i, "Muse reminders are chat messages"],
  [/"(flightaware|maps|media-library|shopping)"/, "playbook tag for a connector no source lists"],
  [/official scorekeeper|the official minutes/i, "'official' wording"],
  [/\/500\b/, "max score is 400"],
  [/of 5 levels/i, "4 scored levels"],
  [/five-level|5-level/i, "4 scored levels + exhibition"],
  [/\bfive levels\b/i, "4 scored levels + exhibition"],
  [/0(&ndash;|–|-)5 per week/i, "0-4 stars"],
  [/sunday midnight/i, "absolute close time"],
  [/2026-09-28|sep(t(ember)?)? 28/i, "old Week 1 date"],
  [/0\.35[^\n]{0,40}tokeneff/i, "headline 0.35/0.25/0.40 formula fits no scored level"],
  [/mabel-typing|\.webp\b/i, "the webp Mabel images are gone; use mabel-plush.svg"]
];
for (const f of scanFiles) {
  const text = read(f);
  for (const [re, why] of BANNED) {
    const hit = text.match(re);
    t(`${f}: no "${hit ? hit[0] : re}" (${why})`, !hit);
  }
}

/* ---------- 4. canonical scoring line ---------- */
{
  const perfect = [1, 2, 3, 4, 5].map((n) => ({ n, correct: 1, tokens_est: 1, seconds: 1, procedure_score: 1 }));
  const s = provisionalSubmissionScore(perfect, PACK);
  eq("max week total is 400", s.total, 400);
  eq("max stars is 4", s.stars, 4);
  const onlyL5 = provisionalSubmissionScore([perfect[4]], PACK);
  eq("L5 adds no points", onlyL5.total, 0);
  eq("L5 adds no star", onlyL5.stars, 0);

  // Tags stripped: pack numbers sit in data-pack spans (scripts/stamp-pack.mjs).
  const scoring = decode(read("scoring.html").replace(/<[^>]+>/g, ""));
  t("scoring: 400 points", scoring.includes("up to 400 points"));
  t("scoring: 0-4 stars", scoring.includes("0–4 stars") && scoring.includes("0–4 per week"));
  t("scoring: L5 unscored exhibition", scoring.includes("L5 is an unscored exhibition build"));
  t("scoring: says inputs are self-reported", scoring.includes("Every input is self-reported"));
  // Watch takes the maximum and the star count from the run's pack
  // manifest (scripts/test-pack.mjs and scripts/test-watch.mjs check it).
  t("watch.js: final panel out of the manifest's max_total", /s\.maxTotal/.test(read("assets/js/watch.js")) &&
    /maxTotal: pack \? pack\.scoring\.max_total/.test(read("assets/js/watch.js")));
  t("board.js: four star slots", /for \(var i = 0; i < 4; i\+\+\)/.test(read("assets/js/board.js")));
  t("watch.js: one star slot per scored level", /maxStars: pack \? pack\.scoring\.max_stars/.test(read("assets/js/watch.js")) &&
    /for \(var i = 0; i < s\.maxStars; i\+\+\)/.test(read("assets/js/watch.js")));
}

/* ---------- 5. Muse facts cite reviewed sources ---------- */
const SOURCES = new Set([
  "https://research.meta.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse",
  "https://www.meta.com/help/artificial-intelligence/1331373868832401/",
  "https://www.meta.com/help/artificial-intelligence/1385290430137537/",
  "https://www.meta.com/help/artificial-intelligence/1687253048996149/",
  "https://www.meta.com/help/artificial-intelligence/1484325780075655/",
  "https://www.meta.com/help/artificial-intelligence/2074655449783957/",
  "https://www.meta.com/help/artificial-intelligence/2225571704857152/",
  "https://www.meta.com/help/artificial-intelligence/2797651547267109/",
  "https://www.meta.com/help/artificial-intelligence/995796179982326/",
  "https://about.fb.com/news/2026/09/the-biggest-news-from-connect-2026/",
  "https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/",
  "https://dev.meta.ai/docs/muse-code/extending"
]);
const FACTS = /built-in browser|Settings &gt; Connectors|Ask for some actions|usage limit|file upload is built in/;
for (const p of pages) {
  const html = read(p);
  const links = [...html.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
  for (const u of links) {
    if (/meta\.com|meta\.ai|fb\.com|muse\.ai/.test(u)) t(p + ": cited source is one the review checked: " + u, SOURCES.has(u));
  }
  if (FACTS.test(html)) {
    t(p + ": states a Muse fact and links a source", links.some((u) => SOURCES.has(u)));
  }
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
