/* Backend smoke tests: redact / validate / score pure functions.
   Run: node scripts/smoke.mjs — exits non-zero on any failure. */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { redactPII, redactSubmission } = require("../lib/redact.js");
const { validateSubmission } = require("../lib/validate.js");
const { provisionalScore, provisionalSubmissionScore, BLENDS } = require("../lib/score.js");

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(name, a, b) {
  t(name + " (got " + JSON.stringify(a) + ")", JSON.stringify(a) === JSON.stringify(b));
}

/* ---------- redact ---------- */
eq("redact email", redactPII("mail me at jane@example.com ok"), "mail me at [email redacted] ok");
eq("redact phone", redactPII("call 512-555-0147 now"), "call [phone redacted] now");
eq("redact sk key", redactPII("key=sk-abcDEF1234567890xyz"), "key=[token redacted]");
eq("redact ghp", redactPII("tok ghp_abcdefgh12345678"), "tok [token redacted]");
eq("redact bearer", redactPII("auth: Bearer eyJhbGciOiJIUzI1NiJ9"), "auth: Bearer [token redacted]");
eq("redact hex run", redactPII("id a3f5c9e2b7d14f6082a6c3d5e709182b end"), "id [token redacted] end");
/* Worked values in this file are fictional (Exampleton, 12,345). Never use
   a real pack instance or answer here: this repo is public. */
eq("redact address", redactPII("ship to 123 Example St please"), "ship to [address redacted] please");
eq("leaves prose alone", redactPII("Exampleton has 12,345 people per the 2020 census."), "Exampleton has 12,345 people per the 2020 census.");
t("non-string passthrough", redactPII(42) === 42);

const nested = { a: "hi jane@example.com", b: [{ c: "no pii here" }], d: 7 };
const out = redactSubmission(nested);
eq("deep walk redacts", out.data.a, "hi [email redacted]");
eq("deep walk keeps clean", out.data.b[0].c, "no pii here");
t("redaction count", out.redactions === 1);
t("does not mutate input", nested.a === "hi jane@example.com");

/* ---------- validate ---------- */
const good = {
  week: 1, agent: "Scout",
  levels: [
    { n: 1, answer: "12,345 (Exampleton, fictional) — census.gov", tokens_est: 900, seconds: 31, procedure: "searched census quickfacts, cross-checked", correct: 1, procedure_score: 0.9, evidence: ["https://www.census.gov/quickfacts/"] },
    { n: 2, answer: "brief text", tokens_est: 8000, seconds: 500, procedure: "researched 5 sources then wrote", correct: 1, procedure_score: 0.85 },
    { n: 3, answer: "draft (unsent): move the fictional test meeting", tokens_est: 4000, seconds: 300, procedure: "listed events, named the overlap, drafted", correct: 1, procedure_score: 1 },
    { n: 4, answer: "itinerary text", tokens_est: 6000, seconds: 420, procedure: "compared 3 options, killed traps", correct: 1, procedure_score: 0.9 },
    { n: 5, answer: "dashboard concept", tokens_est: 2000, seconds: 200, procedure: "sketched layout", correct: 1, procedure_score: 0.7 }
  ],
  consent: { redaction: true, publish: true }
};
t("good submission validates", validateSubmission(good).ok);

const missingL2 = JSON.parse(JSON.stringify(good));
missingL2.levels = missingL2.levels.filter(l => l.n !== 2);
t("missing L2 fails", !validateSubmission(missingL2).ok);

const badAgent = JSON.parse(JSON.stringify(good));
badAgent.agent = "x".repeat(41);
t("agent too long fails", !validateSubmission(badAgent).ok);

const noConsent = JSON.parse(JSON.stringify(good));
noConsent.consent.redaction = false;
t("redaction consent required", !validateSubmission(noConsent).ok);

const badUrl = JSON.parse(JSON.stringify(good));
badUrl.levels[0].evidence = ["not a url"];
t("bad evidence url fails", !validateSubmission(badUrl).ok);

const negTokens = JSON.parse(JSON.stringify(good));
negTokens.levels[0].tokens_est = -5;
t("negative tokens fails", !validateSubmission(negTokens).ok);

const dup = JSON.parse(JSON.stringify(good));
dup.levels.push(JSON.parse(JSON.stringify(dup.levels[0])));
t("duplicate level fails", !validateSubmission(dup).ok);

t("null body fails", !validateSubmission(null).ok);

/* ---------- score ---------- */
// scoring.html's worked example says 92, but it uses the BASELINE blend
// (35/25/40) for an L4 run; the published L4 blend is 30/20/50, which gives:
// 0.3*1.0 + 0.2*1.0 + 0.5*0.8 = 0.90 -> 90. The blend table is authoritative,
// so the implementation (and this test) follow it. Flagged for content fix.
const ex = provisionalScore(
  { n: 4, correct: 1, tokens_est: 4800, seconds: 300, procedure_score: 0.8 },
  { pars: { 4: { tokens: 6000, seconds: 360 } } }
);
eq("L4 blend total", ex.total, 90);
t("worked example star", ex.star === true);
t("provisional labeled", ex.provisional === true);
eq("parts", ex.parts, { correctness: 1, tokens: 1, time: 1, procedure: 0.8 });

const wrong = provisionalScore({ n: 1, correct: 0, tokens_est: 10, seconds: 5, procedure_score: 1 });
eq("gate: wrong answer scores 0", wrong.total, 0);

const noProc = provisionalScore({ n: 2, correct: 1, tokens_est: 6000, seconds: 600 });
t("missing procedure_score -> procedure 0", noProc.parts.procedure === 0);

const sub = provisionalSubmissionScore(good.levels);
t("submission total is sum of L1-L4", sub.total === sub.levels.filter(l => l.n <= 4).reduce((a, l) => a + l.total, 0));
t("stars counted", typeof sub.stars === "number");
t("blends match published", BLENDS[1].token === 0.5 && BLENDS[3].procedure === 0.6);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
