/* Page logic checks for the submit form, the receipt page and the
   leaderboard. Run: node scripts/test-pages.mjs (or npm test).
   1. assets/js/submit-form.js: what the form sends is exactly what
      /api/submit accepts (checked against lib/validate.js), inline error
      messages, "Didn't attempt", L5, contact, terms, server errors mapped
      back to fields, escaped receipt rows, and drafts that never throw.
   2. assets/js/receipt.js: token from the link fragment, escaped views.
   3. assets/js/board.js: "opens after close" until the week closes, then
      escaped rows.
   4. Static pages: receipt.html privacy headers, the /receipt rewrite,
      the submit form's consent boxes, script order.
   5. Every innerHTML assignment in these scripts is on a reviewed list,
      so a new one fails here until someone checks that it escapes.
   Exits non-zero on any failure. */
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");

const F = require("../assets/js/submit-form.js");
const R = require("../assets/js/receipt.js");
const B = require("../assets/js/board.js");
const season = require("../assets/js/season.js");
const { validateSubmission } = require("../lib/validate.js");

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) pass++;
  else { fail++; console.error("FAIL:", name, extra === undefined ? "" : JSON.stringify(extra).slice(0, 400)); }
}
const eq = (name, a, b) => t(name + " (got " + JSON.stringify(a) + ")", JSON.stringify(a) === JSON.stringify(b));

const XSS = '<img src=x onerror="alert(1)">';
/* Markup from data must never survive: no raw tag from the payload, no
   unescaped quote that could close an attribute. */
const clean = (html) => !html.includes("<img") && !html.includes("<script") && !html.includes('onerror="');

/* ---------- 1. submit form ---------- */
function values(over = {}) {
  const lv = {};
  for (const n of [1, 2, 3, 4]) {
    lv[n] = { k: false, a: "A fictional answer " + n, t: "900", s: "75", p: "Searched, checked, wrote it up.", r: "70", c: "1", e: "" };
  }
  lv[5] = { a: "", l: "" };
  return { week: 1, handle: "juniper-7", agent: "Juniper", contact: "", terms: true, publish: false, levels: lv, ...over };
}
const fieldsOf = (out) => out.errors.map((e) => e.field);
const msgOf = (out, f) => (out.errors.find((e) => e.field === f) || {}).msg;

{
  const out = F.collect(values());
  eq("good form: no errors", out.errors, []);
  const v = validateSubmission(out.body);
  t("contract: the form's body passes the server validator", v.ok, v.errors);
  eq("body has only server keys", Object.keys(out.body).sort(), ["agent", "consent", "handle", "levels", "week"]);
  eq("consent is terms + publish", out.body.consent, { terms: true, publish: false });
  eq("procedure self-assessment becomes 0..1", out.body.levels[0].procedure_score, 0.7);
}
{
  const vv = values({ contact: "  quill@example.org " });
  vv.levels[3] = { k: true, a: "left over text", t: "", s: "", p: "", r: "", c: "", e: "" };
  vv.levels[5] = { a: "A one-page dashboard", l: "https://example.org/build.html" };
  vv.levels[2].e = "https://a.example/x, https://b.example/y";
  const out = F.collect(vv);
  eq("skip + L5 + contact: no errors", out.errors, []);
  eq("a skipped level sends only n and skipped", out.body.levels[2], { n: 3, skipped: true });
  eq("L5 sends description and link", out.body.levels[4], { n: 5, answer: "A one-page dashboard", link: "https://example.org/build.html" });
  eq("evidence links split on commas and spaces", out.body.levels[1].evidence, ["https://a.example/x", "https://b.example/y"]);
  eq("contact trimmed", out.body.contact, "quill@example.org");
  const v = validateSubmission(out.body);
  t("contract: skip + L5 + contact passes the server validator", v.ok, v.errors);
}
{
  const vv = values();
  vv.levels[1].t = "-5";
  vv.levels[2].t = "";
  vv.levels[3].s = "0";
  vv.levels[4].r = "140";
  const out = F.collect(vv);
  eq("-5 tokens is a number problem, not 'required'", msgOf(out, "t1"), "A whole number, 1 or more.");
  eq("empty tokens is required", msgOf(out, "t2"), "Required.");
  eq("0 seconds is refused", msgOf(out, "s3"), "A whole number, 1 or more.");
  eq("procedure over 100 is refused", msgOf(out, "r4"), "A number from 0 to 100.");
}
{
  const vv = values();
  vv.levels[1] = { k: false, a: "", t: "", s: "", p: "", r: "", c: "", e: "" };
  const out = F.collect(vv);
  eq("an empty attempted level marks every required field", fieldsOf(out), ["a1", "t1", "s1", "p1", "r1", "c1"]);
  t("the answer error says how to skip", /Didn’t attempt/.test(msgOf(out, "a1")));
}
{
  const vv = values();
  for (const n of [1, 2, 3, 4]) vv.levels[n].k = true;
  const out = F.collect(vv);
  eq("all four skipped -> one error on the first skip box", fieldsOf(out), ["k1"]);
  const vt = values({ terms: false, handle: "ab", agent: "J", contact: "not an email" });
  vt.levels[5] = { a: "", l: "javascript:alert(1)" };
  vt.levels[1].e = "https://1.example https://2.example https://3.example https://4.example https://5.example https://6.example";
  vt.levels[2].e = "ftp://x.example";
  const o2 = F.collect(vt);
  eq("top fields, L5 and evidence errors", fieldsOf(o2).sort(), ["a5", "c-terms", "e1", "e2", "f-agent", "f-contact", "f-handle", "l5"].sort());
  eq("terms error", msgOf(o2, "c-terms"), "Tick this box to file your run.");
  eq("more than 5 links", msgOf(o2, "e1"), "Up to 5 links.");
}
{
  const vv = values();
  vv.levels[3] = { k: true };
  vv.levels[5] = { a: "x", l: "" };
  const body = F.collect(vv).body;
  const mapped = F.serverErrors([
    "handle: that name is reserved",
    "agent: can't look like a web address",
    "contact: an email address like name@example.com, or leave it blank",
    "consent.terms: required — agree to the Terms and the Privacy Policy",
    "levels[1].tokens_est: required, a number from 1 to 10000000",
    "levels[3].evidence[0]: must be an http(s) URL of 500 chars or fewer",
    "levels[2] (didn't attempt): unknown field \"answer\"",
    "levels[4].link: must be an http(s) URL of 500 chars or fewer",
    "levels: level 2 is required",
    XSS
  ], body);
  eq("server errors map to fields by posted index", mapped.map((m) => m.field),
    ["f-handle", "f-agent", "f-contact", "c-terms", "t2", "e4", "k3", "l5", null, null]);
  eq("server message text is kept", mapped[4].msg, "required, a number from 1 to 10000000");
  eq("labels read like the form", [F.label("t2"), F.label("f-contact"), F.label("l5"), F.label("k3")],
    ["L2 tokens", "Contact email", "L5 link", "L3 didn't attempt"]);
}
{
  const html = F.receiptRows([
    { n: XSS, total: XSS, star: true },
    { n: 2, skipped: true, total: 0 },
    { n: 5, exhibition: true },
    null
  ]);
  t("receipt rows escape the level number and total", clean(html) && html.includes("&lt;img"), html);
  t("receipt rows name skipped and exhibition levels", html.includes("Didn’t attempt") && html.includes("Exhibition, unscored"));
  t("receipt rows tolerate junk", typeof F.receiptRows("nope") === "string" && F.receiptRows(null) === "");
}
{
  for (const L of F.LEVELS) {
    const html = F.cardHtml(L);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    const need = L.exhibition ? ["card5", "a5", "a5-err", "l5", "l5-err"] :
      ["card" + L.n, "k" + L.n, "k" + L.n + "-err", "b" + L.n].concat(
        ["a", "t", "s", "p", "r", "c", "e"].flatMap((k) => [k + L.n, k + L.n + "-err"]));
    t("card " + L.n + " has every field and error slot", need.every((id) => ids.includes(id)), need.filter((id) => !ids.includes(id)));
    t("card " + L.n + " ids are unique", new Set(ids).size === ids.length);
    for (const m of html.matchAll(/aria-describedby="([^"]+)"/g)) {
      t("card " + L.n + " describedby points at a real hint: " + m[1], m[1].split(" ").every((id) => ids.includes(id)));
    }
    t("card " + L.n + " has no range slider default", !/type="range"|value="70"/.test(html));
  }
  t("L1-L4 carry a Didn't attempt box, L5 doesn't", F.cardHtml(F.LEVELS[0]).includes("Didn’t attempt") &&
    !F.cardHtml(F.LEVELS[4]).includes('id="k5"'));
  t("L5 has a link field", /<input type="url" id="l5"/.test(F.cardHtml(F.LEVELS[4])));
}
{
  // Drafts: in-memory storage round trip, never the contact or terms.
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const key = F.draftKey(1);
  eq("draft key per week", key, "mom:draft:s1w1");
  const vv = values({ contact: "quill@example.org", token: "mom_secretsecretsecret12" });
  vv.levels[3].k = true;
  t("save draft", F.saveDraft(storage, key, vv) === true);
  const raw = mem.get(key);
  t("draft holds no contact, terms or token", !raw.includes("quill@example.org") && !raw.includes("terms") && !raw.includes("mom_"), raw);
  const d = F.loadDraft(storage, key);
  t("load draft", d && d.values.handle === "juniper-7" && d.values.levels[1].a === "A fictional answer 1" && d.values.levels[3].k === true, d);
  t("clear draft", F.clearDraft(storage, key) === true && F.loadDraft(storage, key) === null);
  mem.set(key, "{not json");
  t("a corrupt draft loads as none", F.loadDraft(storage, key) === null);
  mem.set(key, JSON.stringify({ v: 99, values: {} }));
  t("an unknown draft version loads as none", F.loadDraft(storage, key) === null);

  // Every access can throw (private mode, blocked site data): never rethrow.
  const boom = () => { throw new Error("SecurityError"); };
  const hostile = { getItem: boom, setItem: boom, removeItem: boom };
  let threw = false;
  try {
    t("save with throwing storage returns false", F.saveDraft(hostile, key, values()) === false);
    t("load with throwing storage returns null", F.loadDraft(hostile, key) === null);
    t("clear with throwing storage returns false", F.clearDraft(hostile, key) === false);
    t("no storage at all is fine", F.saveDraft(null, key, values()) === false && F.loadDraft(null, key) === null);
    t("browserStorage() outside a browser is null", F.browserStorage() === null);
  } catch (e) { threw = true; }
  t("draft helpers never throw", !threw);
}

/* ---------- 2. receipt page ---------- */
{
  const tok = "mom_" + "Ab3-_".repeat(4) + "Zz";
  eq("token from #token=", R.tokenFromHash("#token=" + tok), tok);
  eq("token from a bare fragment", R.tokenFromHash("#" + tok), tok);
  eq("token from an encoded fragment", R.tokenFromHash("#token=" + encodeURIComponent(tok)), tok);
  eq("token among other params", R.tokenFromHash("#x=1&token=" + tok), tok);
  eq("junk fragment -> none", R.tokenFromHash("#token=" + XSS), "");
  eq("receipt code is not a token", R.tokenFromHash("#1-a3f5c9e2"), "");
  eq("empty -> none", R.tokenFromHash(""), "");
  t("bad percent-encoding doesn't throw", R.tokenFromHash("#token=%E0%A4%A") === "");

  const d = {
    receipt: XSS, season: XSS, week: XSS, status: "received", created_at: "2026-10-06T12:00:00.000Z",
    handle: XSS, agent: XSS, published: true, contact_on_file: true, total: XSS, stars: XSS,
    scores: [{ n: XSS, total: XSS, star: true }, { n: 2, skipped: true }, { n: 5, exhibition: true }],
    week_state: "open", expires: "2027-01-10T05:00:00.000Z"
  };
  const html = R.statusView(d);
  t("status view escapes every field", clean(html) && (html.match(/&lt;img/g) || []).length >= 8, html);
  t("status view: received is the current step", /<li class="now" aria-current="step"><strong>Received<\/strong>/.test(html));
  t("status view says nothing is reviewed yet", html.includes("Nobody reviews entries yet"));
  t("status view dates in CT", R.statusView({ ...d, receipt: "1-a" }).includes("Tue, Oct 6, 2026, 7:00 AM CT"),
    R.statusView({ ...d }).match(/Filed<\/dt><dd>([^<]*)/));
  t("status view never shows a contact address", !html.includes("@"));
  t("under review and verified render as steps", /aria-current="step"><strong>Verified/.test(R.statusView({ ...d, status: "verified" })) &&
    /aria-current="step"><strong>Under review/.test(R.statusView({ ...d, status: "under_review" })));
  t("an unknown status falls back to received", /aria-current="step"><strong>Received/.test(R.statusView({ ...d, status: XSS })));
  t("status view tolerates an empty body", typeof R.statusView(null) === "string");

  const del = R.deletedView({ receipt: XSS, week: XSS, can_refile: true });
  t("deleted view escapes", clean(del) && del.includes("file again"), del);
  t("deleted view after close", R.deletedView({ receipt: "1-a", can_refile: false }).includes("can’t be filed again"));

  for (const s of [0, 400, 404, 429, 503, 500]) {
    const v = R.errorView(s, { message: XSS });
    t("error view " + s + " has a title and text", v.title && v.text);
  }
  t("503 says it's on our side", /on our side/.test(R.errorView(503, null).text));
  t("404 is generic", R.errorView(404, { message: "leak" }).text.indexOf("leak") === -1);
}

/* ---------- 3. leaderboard ---------- */
{
  const wk = season.WEEKS[0];
  const BEFORE = Date.parse("2026-09-27T23:00:00Z");
  const MID = Date.parse("2026-10-08T17:00:00Z");
  const AFTER = Date.parse(wk.closes) + 1000;
  const opens = "The board opens after Week 1 closes: Sun Oct 11, 2026, 11:59 PM CT.";

  eq("before open, API down: opens-after-close", B.view({ status: 503, body: { error: "storage unavailable" } }, wk, BEFORE),
    { title: "Board opens after Week 1 closes", text: opens, html: "" });
  eq("mid-week, network error: opens-after-close", B.view({ status: 0, body: null }, wk, MID).text, opens);
  eq("mid-week with a count", B.view({ status: 200, body: { state: "open", count: 12, entries: [] } }, wk, MID).text,
    opens + " 12 entries filed so far.");
  eq("mid-week with one entry", B.view({ status: 200, body: { state: "open", count: 1 } }, wk, MID).text, opens + " 1 entry filed so far.");
  t("mid-week never renders rows, even if some arrive", B.view({ status: 200, body: { state: "open", count: 1, entries: [{ agent: "x" }] } }, wk, MID).html === "");
  t("a junk count is ignored", B.view({ status: 200, body: { state: "open", count: XSS } }, wk, MID).text === opens);

  const closed = B.view({ status: 200, body: { state: "closed", count: 2, entries: [
    { agent: XSS, total: XSS, stars: XSS, levels: [{ n: 1, total: XSS }, { n: 2, skipped: true }] },
    { agent: "Bramble", total: 150, stars: 9, levels: [{ n: 1, total: 60 }, { n: 2, total: 50 }, { n: 3, total: 40 }, { n: 4, skipped: true }] }
  ] } }, wk, AFTER);
  t("after close: a table", closed.html.includes("<table") && closed.title === "Week 1 results", closed);
  t("after close: every value escaped", clean(closed.html) && (closed.html.match(/&lt;img/g) || []).length === 3, closed.html);
  t("stars clamp to 0-4 and carry a label", closed.html.includes('aria-label="4 of 4 stars"') && closed.html.includes('aria-label="0 of 4 stars"'));
  t("skipped levels show a labelled dash", (closed.html.match(/aria-label="Didn’t attempt"/g) || []).length === 2);
  t("no streak, crown or setup columns", !/Streak|Crown|Setup/.test(closed.html));
  t("the table says the numbers are self-reported", closed.html.includes("self-reported"));
  eq("after close, no entries", B.view({ status: 200, body: { state: "closed", count: 0, entries: [] } }, wk, AFTER).text,
    "No entries were filed for Week 1.");
  t("after close, API down: says so, not 'opens after close'",
    /didn’t load/.test(B.view({ status: 503, body: null }, wk, AFTER).text));

  const html = read("leaderboard.html");
  const text = (id) => (html.match(new RegExp('id="' + id + '"[^>]*>([^<]*)<')) || [])[1];
  const pre = B.view({ status: 0, body: null }, wk, BEFORE);
  eq("static board title matches the pre-open view", text("board-title"), pre.title);
  eq("static board status matches the pre-open view", text("board-status"), pre.text);
  t("board status is a polite status line", /id="board-status"[^>]*role="status"/.test(html));
  t("results container is not a live region", !/id="board-results"[^>]*aria-live/.test(html) && !/id="leaderboard"/.test(html));
  const iS = html.indexOf('src="/assets/js/season.js'), iB = html.indexOf('src="/assets/js/board.js');
  t("leaderboard loads season.js, then board.js", iS > -1 && iB > iS);
  t("main.js no longer reads a static leaderboard file", !/leaderboard\.json/.test(read("assets/js/main.js")));
  t("the static leaderboard file is gone", !existsSync(join(ROOT, "data/leaderboard.json")));
}

/* ---------- 4. static pages ---------- */
{
  const html = read("receipt.html");
  t("receipt: noindex", /<meta name="robots" content="noindex">/.test(html));
  t("receipt: no referrer", /<meta name="referrer" content="no-referrer">/.test(html));
  t("receipt: no third-party scripts or styles",
    [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)].every((m) => !/^(https?:)?\/\//.test(m[1])));
  t("receipt: loads season.js and receipt.js", /<script src="\/assets\/js\/season\.js(\?v=[0-9a-f]+)?"><\/script>/.test(html) &&
    /<script src="\/assets\/js\/receipt\.js(\?v=[0-9a-f]+)?"><\/script>/.test(html));
  t("receipt: a token field and a confirm step for delete",
    /id="tok"/.test(html) && /id="rc-delete-yes"/.test(html) && /id="rc-confirm"[^>]*hidden/.test(html));
  t("receipt: the error box is an alert", /id="rc-msg"[^>]*role="alert"/.test(html));
  const js = read("assets/js/receipt.js");
  t("receipt.js strips the fragment with replaceState", /history\.replaceState\(null, "", window\.location\.pathname \+ window\.location\.search\)/.test(js));
  t("receipt.js posts the token in the body", /fetch\("\/api\/receipt", \{\s*method: "POST"/.test(js));

  const vj = JSON.parse(read("vercel.json"));
  t("vercel.json serves /receipt from receipt.html (cleanUrls)", vj.cleanUrls === true && existsSync(join(ROOT, "receipt.html")));

  // The token never travels in a query string anywhere.
  for (const f of ["submit.html", "receipt.html", "leaderboard.html", "assets/js/receipt.js", "assets/js/submit-form.js", "assets/js/board.js"]) {
    t(f + ": no token in a query string", !/[?&]token=/.test(read(f)));
  }

  const sub = read("submit.html");
  const subJs = read("assets/js/submit.js");
  const iForm = sub.search(/<script src="\/assets\/js\/submit-form\.js(\?v=[0-9a-f]+)?"><\/script>/);
  const iFlow = sub.search(/<script src="\/assets\/js\/submit\.js(\?v=[0-9a-f]+)?"><\/script>/);
  t("submit: loads submit-form.js, then submit.js, neither deferred", iForm > -1 && iFlow > iForm);
  t("submit: no inline script (the CSP allows scripts from this site only)", !/<script>/.test(sub) && !/<script(?![^>]*\bsrc=)[^>]*>/.test(sub));
  t("submit: contact field is an optional email", /<input type="email" id="f-contact"(?![^>]*required)[^>]*>/.test(sub));
  t("submit: terms box links Terms and Privacy", /<input type="checkbox" id="c-terms" required>/.test(sub) &&
    /href="\/terms"/.test(sub) && /href="\/privacy"/.test(sub));
  t("submit: the old redaction box is gone", !/id="c-redact"/.test(sub));
  t("submit: publish is opt-in (unchecked)", /<input type="checkbox" id="c-publish">/.test(sub));
  t("submit: every inline error slot starts hidden", [...sub.matchAll(/<p class="ferr" id="[^"]+"( hidden)?>/g)].every((m) => m[1]));
  t("submit: localStorage only through the guarded helpers", !/localStorage/.test(sub + subJs));
  t("submit: the receipt link uses the fragment", subJs.includes('"/receipt#token="'));
  t("submit: the shareable receipt text has no token", /var txt = "Makers on Muse, Week " \+ week \+ ": receipt " \+ code/.test(subJs) &&
    !/txt[^\n]*token/.test(subJs));
  t("submit: the Mabel image is the plush SVG", /<img src="\/assets\/img\/mabel-plush\.svg"/.test(sub));
  t("submit: icons come from the shared head, none from the old webp", sub.includes('<link rel="icon" href="/favicon.ico" sizes="32x32">') &&
    sub.includes('<link rel="icon" href="/assets/img/icon.svg" type="image/svg+xml">') && !/\.webp/.test(sub));
}

/* ---------- 5. innerHTML ratchet ---------- */
{
  // Each entry: file -> the exact right-hand sides allowed (whitespace
  // collapsed). Every one is either a function that escapes (checked
  // above) or a concatenation whose data parts go through esc().
  const ALLOWED = {
    "assets/js/submit.js": [
      "F.cardHtml(L)",
      '""',
      '"<h2>" + esc(heading || HEADINGS[400]) + "</h2><ul><li>" + items.join("</li><li>") + "</li></ul>"',
      "F.receiptRows(d.scores)",
      '"<strong>Provisional scores</strong>. Every input is self-reported, and nothing is verified yet. " + "<strong>" + esc(d.redactions) + "</strong> value(s) matching common personal patterns were removed before filing. " + "Your receipt code <strong>" + esc(d.receipt) + "</strong> is for display. It proves nothing on its own. The secret token below does."'
    ],
    "assets/js/board.js": ["v.html"],
    "assets/js/receipt.js": [
      '""',
      '"<p><strong>" + esc(v.title) + "</strong></p><p>" + esc(v.text) + "</p>"',
      "statusView(res.body)",
      "deletedView(res.body)"
    ]
  };
  for (const [f, allowed] of Object.entries(ALLOWED)) {
    const src = read(f);
    const found = [...src.matchAll(/\.innerHTML\s*=\s*([^;]+);/g)].map((m) => m[1].replace(/\s+/g, " ").trim());
    t(f + ": has innerHTML assignments to check", found.length > 0);
    for (const rhs of found) t(f + ": innerHTML = " + rhs.slice(0, 80) + " is reviewed", allowed.includes(rhs));
  }
  t("submit.js: the showErrors list items are escaped",
    /return marked \? '<a href="#' \+ esc\(e\.field\) \+ '">' \+ esc\(text\) \+ "<\/a>" : esc\(text\);/.test(read("assets/js/submit.js")));
  t("main.js has no innerHTML left", !/innerHTML\s*=/.test(read("assets/js/main.js").replace(/tpl\.innerHTML = svgText\.trim\(\);/, "")));
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
