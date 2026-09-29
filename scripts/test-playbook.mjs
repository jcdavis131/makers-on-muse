/* Playbook checks. Run: node scripts/test-playbook.mjs (or npm test).
   1. assets/js/playbook-data.js: 42 workflows, unique URL-safe ids, well
      formed, and every setup tag explained in playbook.html's tag legend.
      No tag names a connector that no source lists (flight tracking, maps,
      photo library, shopping).
   2. playbook.html: "community workflows", the stats match the data, the
      scripts load in order, no inline script, the legend cites sources.
   3. The home page's Playbook strip names real workflows by their ids.
   4. assets/js/playbook.js: the query string round-trips, ignores
      anything it doesn't know, and a permalink shows one workflow.
   5. Cards: every value escaped, Copy sits above each prompt, a Copy link
      button, links to Setups (not the old Meta page).
   6. Every innerHTML assignment in playbook.js is on a reviewed list.
   Exits non-zero on any failure. */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const DATA = require("../assets/js/playbook-data.js");
const P = require("../assets/js/playbook.js");

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) pass++;
  else { fail++; console.error("FAIL:", name, extra === undefined ? "" : JSON.stringify(extra).slice(0, 400)); }
}
const eq = (name, a, b) => t(name + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")", JSON.stringify(a) === JSON.stringify(b));
const XSS = '<img src=x onerror="alert(1)">';
const clean = (html) => !html.includes("<img") && !html.includes("<script") && !html.includes('onerror="');
const decode = (s) => s.replace(/&middot;/g, "·").replace(/&amp;/g, "&").replace(/&rsquo;/g, "'");

const PAGE = read("playbook.html");

/* ---------- 1. data ---------- */
const legend = new Map([...PAGE.matchAll(/<dt>([^<]+)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g)].map((m) => [m[1], m[2]]));
{
  eq("42 workflows", DATA.length, 42);
  const ids = DATA.map((w) => w.id);
  eq("ids are unique", new Set(ids).size, ids.length);
  t("ids are URL-safe slugs", ids.every((id) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)), ids.filter((id) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)));
  for (const w of DATA) {
    const ok = typeof w.title === "string" && w.title &&
      (w.track === "persona" || w.track === "moment") && w[w.track] === w.group &&
      Number.isInteger(w.difficulty) && w.difficulty >= 1 && w.difficulty <= 5 &&
      typeof w.time === "string" && Array.isArray(w.setup) &&
      Array.isArray(w.recipe) && w.recipe.length > 0 && w.recipe.every((s) => typeof s === "string" && s.length > 0) &&
      typeof w.test === "string" && typeof w.proves === "string" &&
      (w.note === undefined || (typeof w.note === "string" && w.note.length > 0));
    t(w.id + ": well formed", ok, w);
    for (const tag of w.setup) t(w.id + ": tag \"" + tag + "\" is in the legend", legend.has(tag));
    const all = [w.title, w.test, w.proves, w.note || "", ...w.recipe].join(" ");
    t(w.id + ": names no maps, flight-tracking or photo-library connector",
      !/\bmaps?\b|flightaware|photo library|media library/i.test(all), all.match(/\bmaps?\b|flightaware|photo library|media library/i));
    // A test that needs a live lookup (live data, official rules, real
    // places or flights, what is open now) needs the browser tag.
    const LIVE = /\b(live|official|real (places|flight)|actually open|real estimate)\b/i;
    if (LIVE.test(w.test)) t(w.id + ": its test needs a live lookup, so it carries the browser tag", w.setup.includes("browser"), w.setup);
  }
  {
    const pod = DATA.find((w) => w.id === "rolling-podcast-producer");
    t("rolling-podcast-producer: the recipe gives Muse the route its test checks", /\[START\] to \[END\]/.test(pod.recipe[0]), pod.recipe[0]);
    const trip = DATA.find((w) => w.id === "international-trip-handled");
    t("international-trip-handled: the player's own dates and city are placeholders",
      /\[OUT DATE\]/.test(trip.recipe[0]) && /\[HOME CITY\]/.test(trip.recipe[0]) && !/\bOct(ober)? \d/.test(trip.recipe.join(" ")), trip.recipe[0]);
  }
  const used = new Set(DATA.flatMap((w) => w.setup));
  eq("every legend entry is a tag in use", [...legend.keys()].sort(), [...used].sort());
  for (const bad of ["flightaware", "maps", "media-library", "shopping", "plaid", "custom"]) {
    t("no \"" + bad + "\" tag", !used.has(bad));
  }
  // Flights, purchases, health and money carry a short note.
  for (const id of ["international-trip-handled", "gate-change-guardian", "birthday-party-in-a-box", "protein-grocery-run",
    "pillbox-sunday", "appointment-prep-script", "line-time-life-admin"]) {
    const w = DATA.find((x) => x.id === id);
    t(id + ": carries a note", w && typeof w.note === "string" && w.note.length > 0);
  }
  t("data file names its content license", /CC BY 4\.0/.test(read("assets/js/playbook-data.js")));
  {
    const claimed = DATA.filter((w) => w.claimed_by);
    eq("14 community-claimed workflows", claimed.length, 14);
    t("every claimed workflow names its source and a trust level",
      claimed.every((w) => typeof w.claimed_by === "string" && w.claimed_by.length > 0 &&
        ["high", "medium-high", "medium", "medium-low"].includes(w.trust)));
    t("review-gated workflows carry their note",
      claimed.filter((w) => w.review_gate).every((w) => typeof w.note === "string" && w.note.length > 0));
    const S2 = (o) => Object.assign(P.emptyState(), o);
    eq("community filter finds the 14", P.filter(DATA, S2({ comm: 1 })).length, 14);
    t("community card carries attribution", P.cardHtml(claimed[0]).includes("Claimed by"));
  }
}

/* ---------- 2. the page ---------- */
{
  t("page: labelled community workflows", PAGE.includes("community workflows"));
  t("page: no field-tested claim", !/field-tested/i.test(PAGE));
  const g = P.groups(DATA);
  const stat = (label) => (PAGE.match(new RegExp("<strong>(\\d+)</strong> " + label)) || [])[1];
  eq("stats: workflows", Number(stat("workflows")), DATA.length);
  eq("stats: personas", Number(stat("personas")), g.persona.length);
  eq("stats: moments", Number(stat("moments")), g.moment.length);
  const iD = PAGE.search(/<script src="\/assets\/js\/playbook-data\.js(\?v=[0-9a-f]+)?"><\/script>/);
  const iP = PAGE.search(/<script src="\/assets\/js\/playbook\.js(\?v=[0-9a-f]+)?"><\/script>/);
  const iM = PAGE.search(/<script src="\/assets\/js\/main\.js(\?v=[0-9a-f]+)?"><\/script>/);
  t("page: loads data, then logic, then main.js", iD > -1 && iP > iD && iM > iP);
  t("page: no inline script (the data moved out)", !/<script>(?!\s*<\/script>)/.test(PAGE) && !/var PLAYBOOKS/.test(PAGE));
  t("page: uses the shared stylesheet", /<link rel="stylesheet" href="\/assets\/css\/main\.css(\?v=[0-9a-f]+)?">/.test(PAGE));
  t("page: no copy of the design tokens", !/:root\s*\{/.test(PAGE));
  t("page: a legend at #tags", /<section[^>]*id="tags"/.test(PAGE));
  for (const [tag, dd] of legend) {
    t("legend: " + tag + " cites a source or says none was found",
      /<a href="https:\/\//.test(dd) || /third-party list|No Meta page we checked/.test(dd));
  }
  t("page: a single-workflow notice, hidden by default", /<div class="pb-single" id="pb-single" hidden>/.test(PAGE) && PAGE.includes('id="pb-show-all"'));
  t("page: search capped at 100 characters", /id="pb-q"[^>]*maxlength="100"/.test(PAGE));
}

/* ---------- 3. home page strip ---------- */
{
  const idx = read("index.html");
  const strip = [...idx.matchAll(/<a class="card card-link" href="([^"]+)" data-workflow="([^"]+)"><span class="step">([^<]+)<\/span><h3>([^<]+)<\/h3>/g)];
  eq("home: three workflows in the strip", strip.length, 3);
  for (const m of strip) {
    const [, href, id, step, title] = m;
    const w = DATA.find((x) => x.id === id);
    t("home strip: " + id + " exists", Boolean(w));
    if (!w) continue;
    eq("home strip: " + id + " links its permalink", href, "/playbook?w=" + id);
    eq("home strip: " + id + " title", decode(title), w.title);
    eq("home strip: " + id + " group and time", decode(step), P.human(w.group) + " · " + w.time);
  }
  t("home: links the whole Playbook", idx.includes('<a class="btn btn-ghost" href="/playbook">Browse all ' + DATA.length + " workflows</a>"));
}

/* ---------- 4. query string ---------- */
{
  const S = (o) => Object.assign(P.emptyState(), o);
  eq("empty query", P.parseQuery("", DATA), P.emptyState());
  eq("default state writes nothing", P.toQuery(P.emptyState()), "");
  const cases = [
    S({ track: "persona" }),
    S({ track: "moment", group: "dmv" }),
    S({ track: "persona", group: "teacher", diff: 2 }),
    S({ diff: 5 }),
    S({ q: "calendar & email / 50%" }),
    S({ track: "persona", group: "nurse", diff: 3, q: "shift swap" }),
    S({ w: "grading-sprint" })
  ];
  for (const s of cases) {
    const qs = P.toQuery(s);
    eq("round trip " + qs, P.parseQuery(qs, DATA), s);
  }
  eq("a permalink carries only its id", P.toQuery(S({ w: "dmv-document-check", track: "moment", q: "x" })), "?w=dmv-document-check");
  eq("group implies its track", P.parseQuery("?group=parent", DATA), S({ track: "persona", group: "parent" }));
  eq("group wins over a contradicting track", P.parseQuery("?track=moment&group=parent", DATA).track, "persona");
  eq("unknown values are ignored",
    P.parseQuery("?track=evil&group=nope&diff=9&w=" + encodeURIComponent(XSS) + "&x=1", DATA), P.emptyState());
  eq("diff must be one digit 1-5", [P.parseQuery("?diff=2.5", DATA).diff, P.parseQuery("?diff=0", DATA).diff, P.parseQuery("?diff=02", DATA).diff], [0, 0, 0]);
  eq("q is trimmed and capped at 100", P.parseQuery("?q=" + encodeURIComponent("  " + "a".repeat(150) + " "), DATA).q.length, 100);
  eq("a leading ? is optional", P.parseQuery("track=moment", DATA).track, "moment");
  t("junk never throws", P.parseQuery(null, DATA).track === "all" && P.parseQuery("?%E0%A4%A", DATA).track === "all");
  eq("permalink from a page URL", P.permalink("https://makersonmuse.com/playbook?track=persona#tags", "fridge-dinner-rescue"),
    "https://makersonmuse.com/playbook?w=fridge-dinner-rescue");
  eq("permalink default is the clean path", P.permalink("", "grading-sprint"), "/playbook?w=grading-sprint");

  eq("filter: a permalink shows one workflow", P.filter(DATA, S({ w: "grading-sprint", track: "moment" })).map((w) => w.id), ["grading-sprint"]);
  eq("filter: all", P.filter(DATA, P.emptyState()).length, DATA.length);
  t("filter: a group", P.filter(DATA, S({ track: "persona", group: "teacher" })).every((w) => w.group === "teacher"));
  t("filter: a difficulty", P.filter(DATA, S({ diff: 1 })).every((w) => w.difficulty === 1) && P.filter(DATA, S({ diff: 1 })).length > 0);
  t("filter: search is case-blind", P.filter(DATA, S({ q: "SYLLABUS" })).some((w) => w.id === "syllabus-to-calendar"));
  t("filter: search finds tags", P.filter(DATA, S({ q: "photo-upload" })).length === DATA.filter((w) => w.setup.includes("photo-upload")).length);
  eq("count text", [P.countText(3, 42, P.emptyState()), P.countText(1, 42, S({ w: "x" }))], ["3 of 42 workflows", "Showing 1 workflow of 42."]);
}

/* ---------- 5. cards ---------- */
{
  const evil = {
    id: XSS, title: XSS, track: "persona", persona: XSS, group: XSS, difficulty: XSS, time: XSS,
    setup: [XSS], recipe: [XSS, XSS], test: XSS, proves: XSS, note: XSS
  };
  const html = P.cardHtml(evil, { open: true });
  t("card: every value escaped", clean(html) && (html.match(/&lt;img/g) || []).length >= 8, html);
  t("card: no unescaped quote from data can end an attribute", !/="[^"]*<img/.test(html));
  t("card: chips escaped", clean(P.chipsHtml(XSS, [XSS])));
  t("cards: the list helper escapes too", clean(P.cardsHtml([evil, evil], false)) && P.cardsHtml([], true) === "");

  const w = DATA.find((x) => x.id === "pre-dawn-briefing");
  const card = P.cardHtml(w);
  t("card: id attribute for the permalink", card.includes('id="w-pre-dawn-briefing"'));
  t("card: title links the permalink", card.includes('<a href="/playbook?w=pre-dawn-briefing">The Pre-Dawn Briefing</a></h3>'));
  t("card: Copy sits in a header row above each prompt",
    (card.match(/<div class="pb-step-head"><span>Step \d<\/span><button type="button" class="pb-copy" aria-label="Copy step \d of [^"]+">Copy<\/button><\/div><pre>/g) || []).length === w.recipe.length);
  t("card: a Copy link button", card.includes('<button type="button" class="pb-link" data-id="pre-dawn-briefing">Copy link</button>'));
  t("card: links Setups, not the old Meta page", card.includes('href="/setups"') && !card.includes("meta.html") && !card.includes('href="/meta"'));
  t("card: recipe closed by default, open for a permalink", !/<details class="pb-recipe" open>/.test(card) &&
    /<details class="pb-recipe" open>/.test(P.cardHtml(w, { open: true })));
  t("card: tags link the legend", card.includes('<a class="pb-tagchip" href="#tags">gmail</a>'));
  const noted = P.cardHtml(DATA.find((x) => x.id === "line-time-life-admin"));
  t("card: shows its note", noted.includes('<p class="pb-note-card">'));
  t("card: difficulty dots are labelled", card.includes('aria-label="Difficulty 2 of 5"'));
  t("card: the setup tags are a named group (aria-label needs a role)", card.includes('<div class="pb-setup" role="group" aria-label="Setup">'));
  // A permalink opens with its card in view and focus on its link (the
  // browser check, scripts/check-a11y.mjs, measures it).
  const src = read("assets/js/playbook.js");
  t("page: a permalink scrolls the notice and card into view and focuses the card's link",
    /if \(state\.w\) \{[\s\S]*?scrollIntoView\(\{ block: "start" \}\)[\s\S]*?linkedA\.focus\(\{ preventScroll: true \}\)/.test(src));
}

/* ---------- 6. innerHTML ratchet ---------- */
{
  const ALLOWED = [
    'chipsHtml("Personas", g.persona)',
    'chipsHtml("Moments", g.moment)',
    "cardsHtml(list, Boolean(state.w))"
  ];
  const src = read("assets/js/playbook.js");
  const found = [...src.matchAll(/\.innerHTML\s*=\s*([^;]+);/g)].map((m) => m[1].replace(/\s+/g, " ").trim());
  eq("playbook.js innerHTML assignments", found.length, ALLOWED.length);
  for (const rhs of found) t("playbook.js: innerHTML = " + rhs.slice(0, 80) + " is reviewed", ALLOWED.includes(rhs));
  t("playbook.js: URL writes use replaceState inside try", /try \{\s*window\.history\.replaceState/.test(src));
  t("playbook.js: no localStorage", !/localStorage/.test(src));
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
