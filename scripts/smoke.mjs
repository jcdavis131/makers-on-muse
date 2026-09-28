/* Backend smoke tests: redact / validate / names / token / packs / score.
   Pure functions, no storage. Run: node scripts/smoke.mjs — exits
   non-zero on any failure. */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { redactPII, redactSubmission, redactEvidenceUrl } = require("../lib/redact.js");
const { validateSubmission } = require("../lib/validate.js");
const { checkHandle, checkAgent } = require("../lib/names.js");
const tok = require("../lib/token.js");
const packs = require("../lib/packs.js");
const { provisionalScore, provisionalSubmissionScore, levelSpec } = require("../lib/score.js");

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(name, a, b) {
  t(name + " (got " + JSON.stringify(a) + ")", JSON.stringify(a) === JSON.stringify(b));
}
const clone = (o) => JSON.parse(JSON.stringify(o));
const ms = (fn) => { const t0 = process.hrtime.bigint(); fn(); return Number(process.hrtime.bigint() - t0) / 1e6; };

/* ---------- redact: what it strips ---------- */
// Key-shaped test values are assembled at run time so no literal in this
// public repo looks like a real credential to a secret scanner.
const STRIPE = "sk_" + "live_" + "EXAMPLE0000000000000000";
const GOOGLE = "AI" + "za" + "EXAMPLE_EXAMPLE_EXAMPLE_EXAMPLE_000";
const GHP = "gh" + "p_" + "abcdefgh12345678";
eq("redact email", redactPII("mail me at jane@example.com ok"), "mail me at [email redacted] ok");
eq("redact phone dashes", redactPII("call 512-555-0147 now"), "call [phone redacted] now");
eq("redact phone parens", redactPII("call (512) 555-0147 now"), "call [phone redacted] now");
eq("redact phone dots", redactPII("call 512.555.0147 now"), "call [phone redacted] now");
eq("redact intl phone", redactPII("office +44 20 7946 0958 today"), "office [phone redacted] today");
eq("redact ssn", redactPII("ssn 123-45-6789 on file"), "ssn [ssn redacted] on file");
eq("redact card (Luhn)", redactPII("card 4111 1111 1111 1111 exp"), "card [card redacted] exp");
eq("keep non-Luhn digit run", redactPII("order 1234 5678 9012 3456 ok"), "order 1234 5678 9012 3456 ok");
eq("redact sk key", redactPII("key=sk-abcDEF1234567890xyz"), "key=[token redacted]");
eq("redact ghp", redactPII("tok " + GHP), "tok [token redacted]");
eq("redact stripe", redactPII("stripe " + STRIPE + " end"), "stripe [token redacted] end");
eq("redact google key", redactPII("g " + GOOGLE + " end"), "g [token redacted] end");
eq("redact bearer", redactPII("auth: Bearer eyJhbGciOiJIUzI1NiJ9"), "auth: Bearer [token redacted]");
eq("redact jwt", redactPII("jwt eyJhbGciOi.eyJzdWIiOiIx.c2lnbmF0dXJl end"), "jwt [token redacted] end");
eq("redact hex run", redactPII("id a3f5c9e2b7d14f6082a6c3d5e709182b end"), "id [token redacted] end");
eq("redact long base64", redactPII("s QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVoxMjM0NTY3ODkw x"), "s [token redacted] x");
/* Worked values in this file are fictional (Exampleton, 12,345). Never use
   a real pack instance or answer here: this repo is public. */
eq("redact address", redactPII("ship to 123 Example St please"), "ship to [address redacted] please");

/* ---------- redact: what it keeps ---------- */
eq("leaves prose alone", redactPII("Exampleton has 12,345 people per the 2020 census."), "Exampleton has 12,345 people per the 2020 census.");
eq("keeps dates and times", redactPII("from 2026-10-05 at 10:30, build 20261005, v1.2.3"), "from 2026-10-05 at 10:30, build 20261005, v1.2.3");
const SRC = "https://www.census.gov/quickfacts/fact/table/exampletoncityexample,US/PST045224";
eq("keeps a source URL whole", redactPII("source: " + SRC + " ok"), "source: " + SRC + " ok");
eq("URL: sensitive query values go", redactPII("https://x.example/a/b?token=abc123&q=hello#top"), "https://x.example/a/b?token=[redacted]&q=hello#top");
eq("URL: email in a query value goes", redactPII("https://x.example/?to=jane%40example.com&n=2"), "https://x.example/?to=[redacted]&n=2");
eq("evidence URL: path kept, key dropped", redactEvidenceUrl(SRC + "?api_key=xyz"), SRC + "?api_key=[redacted]");
eq("evidence URL: no query untouched", redactEvidenceUrl(SRC), SRC);
t("non-string passthrough", redactPII(42) === 42);

/* ---------- redact: known fields only ---------- */
const sub = {
  levels: [
    { n: 1, answer: "12,345 — jane@example.com", procedure: "called 512-555-0147", tokens_est: 5, seconds: 6,
      evidence: [SRC, "https://x.example/?key=abc"], correct: 1, procedure_score: 0.5 },
    { n: 2, answer: "no pii here", procedure: "p", tokens_est: 7, seconds: 8 }
  ]
};
const before = JSON.stringify(sub);
const out = redactSubmission(sub);
eq("answer redacted", out.data.levels[0].answer, "12,345 — [email redacted]");
eq("procedure redacted", out.data.levels[0].procedure, "called [phone redacted]");
eq("evidence kept, query key dropped", out.data.levels[0].evidence, [SRC, "https://x.example/?key=[redacted]"]);
eq("numbers pass through", [out.data.levels[0].tokens_est, out.data.levels[0].seconds, out.data.levels[0].correct], [5, 6, 1]);
eq("clean level untouched", out.data.levels[1].answer, "no pii here");
eq("redaction count", out.redactions, 3);
t("does not mutate input", JSON.stringify(sub) === before);
eq("only known level fields", Object.keys(redactSubmission({ levels: [{ n: 1, answer: "a", procedure: "p", tokens_est: 1, seconds: 1, extra: "x" }] }).data.levels[0]).sort(),
  ["answer", "n", "procedure", "seconds", "tokens_est"]);

/* ---------- redact: linear time ---------- */
// Acceptance: redacting a 64 KB adversarial body takes under 50 ms.
// Each shape targets one pattern's worst case (the old email regex took
// about 2 s on repeated "a.").
const SHAPES = ["a.", "a@", "a@a.", "1 ", "1-", "(555) ", "+1 ", "sk-", "Bearer ", "eyJ.", "a3f5",
  "A1b2+", "https://x.example/?a=", "1 Aaaa ", "-", "0", "jane@", ".a"];
const KB64 = 64 * 1024;
for (const s of SHAPES) {
  const text = s.repeat(Math.ceil(KB64 / s.length)).slice(0, KB64);
  redactPII(text.slice(0, 1000)); // warm the regexes
  const took = ms(() => redactPII(text));
  t(`redact 64 KB of ${JSON.stringify(s)} under 50 ms (took ${took.toFixed(1)} ms)`, took < 50);
}
{
  // The largest valid submission (5 answers x 4,000 + 5 procedures x 2,000),
  // every field adversarial.
  const levels = [1, 2, 3, 4, 5].map((n) => ({
    n, answer: "a.a@".repeat(1000), procedure: "1 (5".repeat(500), tokens_est: 1, seconds: 1,
    evidence: Array(5).fill("https://x.example/?" + "a=b&".repeat(120))
  }));
  const took = ms(() => redactSubmission({ levels }));
  t(`redact the largest valid submission under 50 ms (took ${took.toFixed(1)} ms)`, took < 50);
}

/* ---------- names ---------- */
for (const good of ["Juniper", "Zoë's Agent", "Agent-7", "Chief of Staff 2", "J.R. Helper"]) {
  t("agent ok: " + good, checkAgent(good).ok);
}
eq("agent spaces collapse", checkAgent("  Big   Helper ").value, "Big Helper");
for (const bad of ["Mabel", "mabel", "M4bel", "Scout", "Sc0ut", "Meta", "Muse", "Muse Official", "Makers on Muse",
  "MakersOnMuse", "admin", "Adm1n", "Meta AI", "Official Helper", "anonymous"]) {
  const r = checkAgent(bad);
  t("agent reserved: " + bad, !r.ok && /reserved/.test(r.error));
}
for (const [bad, why] of [["jane@example.com", /email/], ["www.example", /web address/], ["example.com", /web address/],
  ["http://x", /web address/], ["512-555-0147", /phone/], ["Call 5125550147", /phone/]]) {
  const r = checkAgent(bad);
  t("agent shape: " + bad, !r.ok && why.test(r.error));
}
t("agent too short", !checkAgent("J").ok);
t("agent too long", !checkAgent("x".repeat(41)).ok);
t("agent bad chars", !checkAgent("<b>hi</b>").ok && !checkAgent("tab\u0000x").ok);
t("agent must be a string", !checkAgent(5).ok);
eq("handle ok + key", [checkHandle("Cam_D-7").ok, checkHandle("Cam_D-7").key], [true, "cam_d-7"]);
for (const bad of ["ab", "x".repeat(25), "-lead", "has space", "a.b", "scout", "Mabel_fan", "meta", "admin",
  "5125550147", "jane@example.com"]) {
  t("handle rejected: " + bad, !checkHandle(bad).ok);
}

/* ---------- validate ---------- */
const good = {
  week: 1, handle: "juniper-player", agent: "Juniper",
  levels: [
    { n: 1, answer: "12,345 (Exampleton, fictional) — census.gov", tokens_est: 900, seconds: 31, procedure: "searched census quickfacts, cross-checked", correct: 1, procedure_score: 0.9, evidence: ["https://www.census.gov/quickfacts/"] },
    { n: 2, answer: "brief text", tokens_est: 8000, seconds: 500, procedure: "researched 5 sources then wrote", correct: 1, procedure_score: 0.85 },
    { n: 3, answer: "draft (unsent): move the fictional test meeting", tokens_est: 4000, seconds: 300, procedure: "listed events, named the overlap, drafted", correct: 1, procedure_score: 1 },
    { n: 4, answer: "itinerary text", tokens_est: 6000, seconds: 420, procedure: "compared 3 options, killed traps", correct: 1, procedure_score: 0.9 },
    { n: 5, answer: "dashboard concept", link: "https://example.com/my-build.html" }
  ],
  consent: { terms: true, publish: true }
};
const gv = validateSubmission(good);
t("good submission validates", gv.ok);
eq("value keeps only known top-level fields", Object.keys(gv.value).sort(), ["agent", "consent", "handle", "handle_key", "levels", "week"]);
eq("value handle key is lowercase", gv.value.handle_key, "juniper-player");

function bad(name, mutate, match) {
  const b = clone(good);
  mutate(b);
  const r = validateSubmission(b);
  t(name + (r.ok ? " (passed)" : ""), !r.ok && (!match || r.errors.some((e) => match.test(e))));
}
bad("missing L2 fails", (b) => { b.levels = b.levels.filter((l) => l.n !== 2); }, /level 2 is required/);
bad("agent too long fails", (b) => { b.agent = "x".repeat(41); }, /^agent:/);
bad("reserved agent fails", (b) => { b.agent = "Scout"; }, /reserved/);
bad("missing handle fails", (b) => { delete b.handle; }, /^handle:/);
bad("terms consent required", (b) => { b.consent.terms = false; }, /consent\.terms: required/);
bad("terms consent missing", (b) => { delete b.consent.terms; }, /consent\.terms: required/);
bad("the old redaction consent key is refused", (b) => { b.consent.redaction = true; }, /consent: unknown field "redaction"/);
bad("bad evidence url fails", (b) => { b.levels[0].evidence = ["not a url"]; }, /evidence\[0\]/);
bad("too many evidence urls fail", (b) => { b.levels[0].evidence = Array(6).fill("https://x.example/"); }, /up to 5/);
bad("negative tokens fails", (b) => { b.levels[0].tokens_est = -5; }, /tokens_est/);
bad("tokens_est 0 fails", (b) => { b.levels[0].tokens_est = 0; }, /tokens_est: required, a number from 1/);
bad("tokens_est 0.5 fails", (b) => { b.levels[1].tokens_est = 0.5; }, /tokens_est/);
bad("seconds 0 fails", (b) => { b.levels[2].seconds = 0; }, /seconds: required, a number from 1/);
bad("huge seconds fails", (b) => { b.levels[2].seconds = 1e12; }, /seconds/);
bad("week 999 fails", (b) => { b.week = 999; }, /no pack for week 999/);
bad("week 0 fails", (b) => { b.week = 0; }, /^week:/);
bad("unknown top-level key fails", (b) => { b.transcript = "x"; }, /unknown field "transcript"/);
bad("__proto__ key fails", (b) => { Object.defineProperty(b, "__proto__", { value: 1, enumerable: true }); }, /unknown field "__proto__"/);
bad("unknown level key fails", (b) => { b.levels[0].raw = "x"; }, /levels\[0\]: unknown field "raw"/);
bad("unknown consent key fails", (b) => { b.consent.email = "x"; }, /consent: unknown field "email"/);
bad("more than 5 levels fails", (b) => { b.levels.push(clone(b.levels[0])); }, /at most 5/);
bad("duplicate level fails", (b) => { b.levels[4] = clone(b.levels[0]); }, /duplicate/);
{
  const b = clone(good);
  for (let i = 0; i < 50; i++) b["k" + i] = i;
  const r = validateSubmission(b);
  t("unknown keys reported at most 5 times", !r.ok && r.errors.filter((e) => /unknown field "/.test(e)).length === 5 &&
    r.errors.some((e) => /45 more unknown fields/.test(e)));
}
t("null body fails", !validateSubmission(null).ok);

/* ---------- validate: didn't attempt, L5, contact ---------- */
{
  const b = clone(good);
  b.levels[2] = { n: 3, skipped: true };
  const r = validateSubmission(b);
  t("a skipped level validates", r.ok);
  eq("a skipped level keeps only n and skipped", r.ok && r.value.levels[2], { n: 3, skipped: true });
}
bad("a skipped level with other fields fails", (b) => { b.levels[2] = { n: 3, skipped: true, answer: "x" }; }, /didn't attempt\): unknown field "answer"/);
bad("skipped: false fails", (b) => { b.levels[2].skipped = false; }, /skipped: must be true/);
bad("skipping L5 fails (leave it out)", (b) => { b.levels[4] = { n: 5, skipped: true }; }, /level 5 is optional/);
bad("all four skipped fails", (b) => { b.levels = [1, 2, 3, 4].map((n) => ({ n, skipped: true })); }, /attempt at least one of levels 1-4/);
bad("a missing level says how to skip it", (b) => { b.levels = b.levels.filter((l) => l.n !== 4); }, /level 4 is required \(send it with skipped: true/);
{
  const b = clone(good);
  b.levels = b.levels.filter((l) => l.n !== 5);
  t("L5 is optional", validateSubmission(b).ok);
  b.levels[0] = { n: 1, skipped: true };
  b.levels[1] = { n: 2, skipped: true };
  b.levels[2] = { n: 3, skipped: true };
  t("three skipped and one attempted validates", validateSubmission(b).ok);
}
bad("L5 without a description fails", (b) => { b.levels[4].answer = " "; }, /levels\[4\]\.answer: required, describe what you built/);
bad("L5 with tokens fails (unscored)", (b) => { b.levels[4].tokens_est = 10; }, /levels\[4\]: unknown field "tokens_est"/);
bad("L5 bad link fails", (b) => { b.levels[4].link = "javascript:alert(1)"; }, /levels\[4\]\.link: must be an http\(s\) URL/);
bad("L5 overlong link fails", (b) => { b.levels[4].link = "https://x.example/" + "a".repeat(500); }, /levels\[4\]\.link/);
{
  const b = clone(good);
  b.levels[4].link = "";
  const r = validateSubmission(b);
  t("L5 blank link is dropped", r.ok && !("link" in r.value.levels[4]));
  eq("L5 link kept", validateSubmission(good).value.levels[4], { n: 5, answer: "dashboard concept", link: "https://example.com/my-build.html" });
}
{
  const b = clone(good);
  b.contact = "  jane@example.com ";
  const r = validateSubmission(b);
  t("contact validates", r.ok);
  eq("contact is trimmed and kept", r.ok && r.value.contact, "jane@example.com");
  eq("no contact, no field", "contact" in validateSubmission(good).value, false);
  b.contact = "";
  t("blank contact means none", validateSubmission(b).ok && !("contact" in validateSubmission(b).value));
  b.contact = null;
  t("null contact means none", validateSubmission(b).ok);
}
bad("contact must look like an email", (b) => { b.contact = "call me maybe"; }, /^contact: an email address/);
bad("contact without a dot in the domain fails", (b) => { b.contact = "jane@localhost"; }, /^contact:/);
bad("contact too long fails", (b) => { b.contact = "a".repeat(60) + "@" + "b".repeat(200) + ".com"; }, /^contact:/);
bad("contact must be a string", (b) => { b.contact = ["jane@example.com"]; }, /^contact:/);
{
  const slow = "a@" + "a.".repeat(126);
  const t0 = performance.now();
  for (let i = 0; i < 200; i++) validateSubmission({ ...clone(good), contact: slow });
  const took = (performance.now() - t0) / 200;
  t("adversarial contact checks fast (" + took.toFixed(2) + " ms)", took < 5);
}
eq("handleKey lowercases", checkHandle("Juniper-7").key, "juniper-7");
t("array body fails", !validateSubmission([]).ok);

/* ---------- token ---------- */
{
  const a = tok.newToken(), b = tok.newToken();
  t("token format mom_ + 22 base64url (128 bits)", tok.TOKEN_RE.test(a) && Buffer.from(a.slice(4), "base64url").length === 16);
  t("tokens differ", a !== b);
  const h = tok.hashToken(a);
  t("hash is sha256 hex", /^[0-9a-f]{64}$/.test(h) && h !== a);
  t("tokenMatches right token", tok.tokenMatches(a, h));
  t("tokenMatches wrong token", !tok.tokenMatches(b, h));
  t("tokenMatches junk", !tok.tokenMatches("mom_x", h) && !tok.tokenMatches(a, "nothex") && !tok.tokenMatches(null, h));
  t("receipt code is display-sized", /^1-[0-9a-f]{8}$/.test(tok.newReceiptCode(1)));
}

/* ---------- packs ---------- */
{
  const p = packs.byWeek(1);
  t("pack s1w1 exists", p && p.id === "s1w1");
  t("no pack for week 2 yet", packs.byWeek(2) === null);
  const open = Date.parse(p.opens), close = Date.parse(p.closes);
  eq("state before", packs.state(p, open - 1), "before");
  eq("state at open", packs.state(p, open), "open");
  eq("state at close - 1 ms", packs.state(p, close - 1), "open");
  eq("state at close", packs.state(p, close), "closed");
  t("openPack inside", packs.openPack(open + 1000) === p && packs.openPack(close) === null);
  eq("expiresAt is close + 90 days", packs.expiresAt(p), close / 1000 + 90 * 86400);
}

/* ---------- score ---------- */
// Pars, blends and the star rule come from the pack manifest.
// scripts/test-pack.mjs checks the pages against it; these check the math.
const P = packs.byWeek(1);
const ex = provisionalScore(
  { n: 4, correct: 1, tokens_est: 4800, seconds: 300, procedure_score: 0.8 }, P
);
// L4 par 6,000 tokens / 360 s, blend 30/20/50: 0.3*1 + 0.2*1 + 0.5*0.8 = 0.90
eq("L4 blend total", ex.total, 90);
t("90 earns the star", ex.star === true);
t("provisional labeled", ex.provisional === true);
eq("parts", ex.parts, { correctness: 1, tokens: 1, time: 1, procedure: 0.8 });
eq("scoring.html worked example (L1: 860 tokens, 70 s, procedure 1.0) scores 92",
  provisionalScore({ n: 1, correct: 1, tokens_est: 860, seconds: 70, procedure_score: 1 }, P).total, 92);
{
  // L2 at par (30 + 20) plus procedure p x 50: p 0.18 -> 59, p 0.2 -> 60.
  const l2 = (p) => provisionalScore({ n: 2, correct: 1, tokens_est: 4000, seconds: 240, procedure_score: p }, P);
  eq("star rule: 59 has no star, 60 has one", [l2(0.18).total, l2(0.18).star, l2(0.2).total, l2(0.2).star], [59, false, 60, true]);
}

const wrong = provisionalScore({ n: 1, correct: 0, tokens_est: 10, seconds: 5, procedure_score: 1 }, P);
eq("gate: wrong answer scores 0", wrong.total, 0);

const noProc = provisionalScore({ n: 2, correct: 1, tokens_est: 6000, seconds: 600 }, P);
t("missing procedure_score -> procedure 0", noProc.parts.procedure === 0);

const s = provisionalSubmissionScore(good.levels, P);
t("submission total is sum of L1-L4", s.total === s.levels.filter(l => l.n <= 4).reduce((a, l) => a + l.total, 0));
t("stars counted", typeof s.stars === "number");
eq("submission reports the manifest maximums", [s.max_total, s.max_stars], [400, 4]);
t("blends come from the manifest", levelSpec(P, 1).blend.token === 0.5 && levelSpec(P, 3).blend.procedure === 0.6);

/* The scorer refuses what it can't apply, instead of scoring it some other way. */
function throws(name, fn, match) {
  try { fn(); t(name + " (did not throw)", false); } catch (e) { t(name + " (" + e.message + ")", match.test(e.message)); }
}
throws("no pack: throws", () => provisionalScore({ n: 1, correct: 1, tokens_est: 1, seconds: 1 }), /needs a pack manifest/);
throws("no pack: submission throws", () => provisionalSubmissionScore(good.levels), /needs a pack manifest/);
throws("exhibition level is not scored", () => provisionalScore({ n: 5, correct: 1, tokens_est: 1, seconds: 1 }, P), /not a scored level/);
throws("unknown level is not scored", () => provisionalScore({ n: 9, correct: 1, tokens_est: 1, seconds: 1 }, P), /not a scored level/);
{
  const partial = clone(P);
  partial.levels[3].correctness = "partial";
  throws("a correctness type the scorer can't apply throws", () => provisionalSubmissionScore(good.levels, partial), /needs server grading/);
  const capped = clone(P);
  capped.levels[2].safety_cap.applied = true;
  throws("an applied safety cap throws", () => provisionalScore(good.levels[2], capped), /safety cap needs server grading/);
}
{
  const levels = clone(good.levels);
  levels[1] = { n: 2, skipped: true };
  const sk = provisionalSubmissionScore(levels, P);
  eq("a skipped level scores 0, no star", sk.levels[1], { n: 2, skipped: true, total: 0, star: false, provisional: true });
  eq("L5 is an exhibition with no points", sk.levels[4], { n: 5, exhibition: true, provisional: true });
  eq("total counts attempted L1-L4 only",
    sk.total, [0, 2, 3].reduce((a, i) => a + provisionalScore(levels[i], P).total, 0));
  t("stars count attempted levels only", sk.stars === [0, 2, 3].filter((i) => provisionalScore(levels[i], P).star).length);
}
{
  const r = redactSubmission({ levels: [
    { n: 1, skipped: true },
    { n: 5, answer: "built it; mail jane@example.com", link: "https://example.com/build.html?token=abc123&page=2" }
  ] });
  eq("redact: skipped level passes through", r.data.levels[0], { n: 1, skipped: true });
  eq("redact: L5 answer redacted, link keeps its path", r.data.levels[1],
    { n: 5, answer: "built it; mail [email redacted]", link: "https://example.com/build.html?token=[redacted]&page=2" });
  eq("redact: L5 counts", r.redactions, 2);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
