/* Accessibility and page check in headless Chrome, with axe-core. Local
   only: it serves the repo with scripts/serve.mjs (vercel.json applied,
   so the CSP is live) and posts nothing anywhere.

     node scripts/check-a11y.mjs [--chrome <path>]

   Needs puppeteer-core and axe-core, which the site doesn't depend on.
   Install both in one folder (npm i puppeteer-core axe-core) and set
   A11Y_TOOLS_DIR to it. Chrome defaults to the usual Windows path;
   CHROME_PATH or --chrome overrides it.

   For every page, at 1280 and 390 px: the status, no horizontal scroll,
   Mabel mounted, no broken image, no script error, no CSP report, no
   failed request, and axe with 0 violations (entrance animations are
   finished first, so axe sees the settled page). Then the states a
   first load doesn't show: the submit form during an open week, its
   errors, a receipt error, the leaderboard after close, Watch with a
   replay running, a Playbook permalink, and the phone menu open. Last,
   the phone menu with real touch input: a tap opens it, Escape closes it
   and returns focus, a tap outside closes it, tabbing out closes it.
   Exit 1 on any failure. */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { start } from "./serve.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function tools() {
  const dir = process.env.A11Y_TOOLS_DIR;
  if (!dir) {
    console.error("Set A11Y_TOOLS_DIR to a folder with puppeteer-core and axe-core installed (npm i puppeteer-core axe-core).");
    process.exit(2);
  }
  const req = createRequire(join(dir, "package.json"));
  return { puppeteer: req("puppeteer-core"), axeSrc: readFileSync(req.resolve("axe-core/axe.min.js"), "utf8") };
}

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) pass++;
  else { fail++; console.error("FAIL:", name, extra === undefined ? "" : JSON.stringify(extra).slice(0, 700)); }
}

const PATHS = ["/", "/pack", "/submit", "/leaderboard", "/watch", "/playbook", "/setups", "/skills", "/scoring", "/faq", "/about",
  "/privacy", "/terms", "/receipt", "/nope/deeper/path"];
const IN_WEEK = Date.parse("2026-10-06T15:00:00Z");
const AFTER_CLOSE = Date.parse("2026-10-13T15:00:00Z");

async function main() {
  for (const k of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN"]) delete process.env[k];
  const { puppeteer, axeSrc } = tools();
  const ai = process.argv.indexOf("--chrome");
  const executablePath = ai > -1 ? process.argv[ai + 1] : (process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe");
  const srv = await start({ api: true });
  const BASE = srv.url;
  const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-first-run"] });

  async function open({ w = 1280, h = 900, now = null, touch = false } = {}) {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h, hasTouch: touch, isMobile: touch });
    if (now) {
      // Move the page's clock (it keeps running), to see the week open or closed.
      await page.evaluateOnNewDocument((fixed) => {
        const Real = Date; const offset = fixed - Real.now();
        window.Date = class extends Real {
          constructor(...a) { if (a.length) super(...a); else super(Real.now() + offset); }
          static now() { return Real.now() + offset; }
        };
      }, now);
    }
    page.problems = [];
    page.on("pageerror", (e) => page.problems.push("pageerror: " + e));
    page.on("console", (m) => {
      const txt = m.text();
      if (/Refused|Content Security Policy/.test(txt)) return page.problems.push("csp: " + txt);
      if (m.type() !== "error") return;
      if (/status of 503/.test(txt)) return; // the API without storage, as designed
      if (/status of 404/.test(txt) && page.url().includes("/nope/")) return; // the 404 page itself
      page.problems.push("console: " + txt);
    });
    page.on("response", (r) => {
      const u = r.url();
      if (u.startsWith(BASE) && r.status() >= 400 && !u.includes("/api/") && !u.includes("/nope/")) page.problems.push(r.status() + " " + u);
    });
    page.on("requestfailed", (r) => {
      const why = (r.failure() && r.failure().errorText) || "";
      if (r.url().includes("/api/") && /ERR_ABORTED/.test(why)) return; // a stream or check cut off by navigation
      page.problems.push("failed " + r.url() + " " + why);
    });
    return page;
  }
  async function axe(page, name) {
    await page.evaluate(() => document.getAnimations().forEach((a) => {
      try { if (a.effect && a.effect.getTiming().iterations !== Infinity) a.finish(); } catch (e) { /* ignore */ }
    }));
    await new Promise((r) => setTimeout(r, 100));
    await page.evaluate(axeSrc);
    // Violations, plus two kinds of "incomplete" that are real failures
    // here: contrast axe couldn't decide (it skipped the L5 badge as "too
    // short") and aria-label on an element whose role can't carry a name.
    const STRICT = ["color-contrast", "aria-prohibited-attr"];
    const out = await page.evaluate(async (strict) => {
      const r = await window.axe.run(document, { resultTypes: ["violations", "incomplete"] });
      const view = (v) => ({ id: v.id, n: v.nodes.length, nodes: v.nodes.slice(0, 4).map((n) => n.target.join(" ") + " :: " +
        ((n.any[0] || n.all[0] || n.none[0] || {}).message || "").slice(0, 160)) });
      // "Obscured" or "overlapped" means a sticky bar or an open menu sat
      // over the text when axe looked; that depends on the scroll, and the
      // same text is checked unobscured in another state. Any other
      // undecided result counts.
      // Short text (like the old L5 badge) counts when axe measured a
      // ratio; a ratio of 0 means it couldn't see the background either.
      const decidable = (n) => {
        const c = n.any[0] || n.all[0] || n.none[0] || {};
        const d = c.data || {};
        if (/obscured|overlapped/.test(c.message || "") || d.messageKey === "elmPartiallyObscured" || d.messageKey === "bgOverlap") return false;
        if (d.messageKey === "shortTextContent") return Number(d.contrastRatio) > 0;
        return true;
      };
      const undecided = r.incomplete.filter((v) => strict.includes(v.id))
        .map((v) => ({ ...v, nodes: v.nodes.filter(decidable) })).filter((v) => v.nodes.length);
      return r.violations.map(view).concat(undecided.map((v) => ({ ...view(v), incomplete: true })));
    }, STRICT);
    t(name + ": axe color-contrast 0 (violations and undecided)", !out.some((v) => v.id === "color-contrast"), out.filter((v) => v.id === "color-contrast"));
    t(name + ": axe, everything else 0", !out.some((v) => v.id !== "color-contrast"), out.filter((v) => v.id !== "color-contrast"));
    t(name + ": no script error, CSP report or failed request", page.problems.length === 0, page.problems);
  }
  const settle = (ms) => new Promise((r) => setTimeout(r, ms));

  try {
    /* Every page, desktop and phone. */
    for (const [w, h] of [[1280, 900], [390, 844]]) {
      for (const p of PATHS) {
        const page = await open({ w, h });
        const res = await page.goto(BASE + p, { waitUntil: "load" });
        await settle(p === "/watch" ? 1500 : 500);
        const want = p.startsWith("/nope") ? 404 : 200;
        t(p + " @" + w + ": status " + want, res.status() === want, res.status());
        const r = await page.evaluate(() => ({
          sw: document.documentElement.scrollWidth, iw: window.innerWidth,
          js: document.documentElement.classList.contains("js"),
          mabels: [...document.querySelectorAll("[data-mabel]")].map((s) => Boolean(s.querySelector("svg"))),
          broken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src),
          levelCards: document.querySelectorAll("#level-cards > *").length,
          pbCards: document.querySelectorAll(".pb-card").length,
          replays: document.querySelectorAll(".replay-item").length
        }));
        t(p + " @" + w + ": no horizontal scroll", r.sw <= r.iw, r);
        t(p + " @" + w + ": main.js ran", r.js);
        t(p + " @" + w + ": Mabel mounted", r.mabels.every(Boolean), r.mabels);
        t(p + " @" + w + ": no broken image", r.broken.length === 0, r.broken);
        if (p === "/submit") t("/submit @" + w + ": submit.js built the level cards", r.levelCards >= 4, r.levelCards);
        if (p === "/playbook") t("/playbook @" + w + ": cards", r.pbCards >= 20, r.pbCards);
        if (p === "/watch") t("/watch @" + w + ": the archive is listed", r.replays >= 1, r.replays);
        await axe(page, p + " @" + w);
        await page.close();
      }
    }

    /* States a first load doesn't show. */
    {
      const page = await open({ now: IN_WEEK });
      await page.goto(BASE + "/submit", { waitUntil: "load" });
      await settle(600);
      t("submit, open week: fields editable", await page.evaluate(() => !document.getElementById("sub-fields").disabled));
      await page.evaluate(() => { const d = document.querySelector("details.lvl5"); if (d) d.open = true; });
      await axe(page, "submit, open week");
      if (await page.evaluate(() => !document.getElementById("sub-btn").disabled)) {
        await page.click("#sub-btn");
        await settle(400);
        await axe(page, "submit, errors shown");
      }
      await page.close();
    }
    {
      const page = await open();
      await page.goto(BASE + "/receipt", { waitUntil: "load" });
      await settle(400);
      await page.type("#tok", "not-a-token");
      await page.click("#tok-check");
      await settle(500);
      await axe(page, "receipt, error shown");
      await page.close();
    }
    {
      const page = await open({ now: AFTER_CLOSE });
      await page.goto(BASE + "/leaderboard", { waitUntil: "load" });
      await settle(2000);
      await axe(page, "leaderboard, after close");
      await page.close();
    }
    for (const w of [1280, 390]) {
      const page = await open({ w, h: w === 390 ? 844 : 900 });
      await page.goto(BASE + "/watch", { waitUntil: "load" });
      await settle(1500);
      await page.evaluate(() => { const b = document.getElementById("rp-4x"); if (b && !b.closest("[hidden]")) b.click(); });
      await settle(20000);
      const kinds = await page.evaluate(() => [...new Set([...document.querySelectorAll("#feed .ev")].map((e) => e.className))]);
      t("watch @" + w + ": the replay drew several kinds of beat", kinds.length >= 5, kinds);
      await axe(page, "watch @" + w + ", replay running");
      await page.close();
    }
    {
      const page = await open();
      await page.goto(BASE + "/playbook?w=grading-sprint", { waitUntil: "load" });
      await settle(500);
      await axe(page, "playbook permalink, recipe open");
      await page.close();
    }

    /* What sticky bars cover: the nav, and Watch's run bar when it sticks. */
    const coverBottom = () => Math.max(0, ...[document.querySelector(".nav"), document.querySelector(".livebar")]
      .filter((b) => b && /sticky|fixed/.test(getComputedStyle(b).position)).map((b) => b.getBoundingClientRect().bottom));
    const instant = (page) => page.addStyleTag({ content: "html{scroll-behavior:auto !important}" });

    /* Keyboard focus never lands fully under a sticky bar, Tab or Shift+Tab. */
    for (const [p, w, h] of [["/playbook", 1440, 900], ["/setups", 1440, 900], ["/terms", 1440, 900], ["/leaderboard", 1440, 900],
      ["/watch", 1440, 900], ["/privacy", 390, 844], ["/faq", 390, 844], ["/", 390, 844]]) {
      const page = await open({ w, h });
      await page.goto(BASE + p, { waitUntil: "load" });
      await settle(p === "/watch" ? 1500 : 400);
      await instant(page);
      const n = await page.evaluate(() => document.querySelectorAll("a[href],button,input,select,textarea,summary,[tabindex='0']").length);
      const covered = [];
      for (const dir of ["fwd", "back"]) {
        if (dir === "fwd") await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
        else await page.evaluate(() => { const f = document.querySelector("footer a:last-of-type") || document.querySelector("footer a"); f.focus(); });
        for (let i = 0; i < Math.min(n + 5, 400); i++) {
          if (dir === "fwd") await page.keyboard.press("Tab");
          else { await page.keyboard.down("Shift"); await page.keyboard.press("Tab"); await page.keyboard.up("Shift"); }
          const r = await page.evaluate((cb) => {
            const cover = new Function("return (" + cb + ")()")();
            const el = document.activeElement;
            // The bars' own links (and the skip link) live in the bars.
            if (!el || el === document.body || el.closest(".nav, .livebar, .skip")) return null;
            const b = el.getBoundingClientRect();
            return { cover, bottom: b.bottom, what: (el.tagName + " " + (el.textContent || el.getAttribute("aria-label") || "").trim()).slice(0, 50) };
          }, coverBottom.toString());
          if (r && r.bottom > 0 && r.bottom <= r.cover) covered.push(dir + ": " + r.what + " (bottom " + Math.round(r.bottom) + " <= " + Math.round(r.cover) + ")");
        }
      }
      t(p + " @" + w + ": no focused element sits fully under a sticky bar (Tab and Shift+Tab)", covered.length === 0, covered.slice(0, 6));
      await page.close();
    }

    /* Anchor jumps land below the nav. */
    for (const [url, w, h] of [["/pack#preflight", 1440, 900], ["/pack#l3", 1440, 900], ["/faq#rules", 1440, 900], ["/faq#rules", 390, 844],
      ["/pack#preflight", 390, 844]]) {
      const page = await open({ w, h });
      await page.goto(BASE + url, { waitUntil: "load" });
      await settle(900);
      const r = await page.evaluate((cb, id) => {
        const cover = new Function("return (" + cb + ")()")();
        const el = document.getElementById(id);
        return { cover, top: el ? el.getBoundingClientRect().top : null };
      }, coverBottom.toString(), url.split("#")[1]);
      t(url + " @" + w + ": the target starts below the nav", r.top !== null && r.top >= r.cover - 1, r);
      await page.close();
    }

    /* A Playbook permalink opens with its card in view and focus on its link. */
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      const page = await open({ w, h });
      await page.goto(BASE + "/playbook?w=grading-sprint", { waitUntil: "load" });
      await settle(900);
      const r = await page.evaluate((cb) => {
        const cover = new Function("return (" + cb + ")()")();
        const card = document.getElementById("w-grading-sprint");
        const note = document.getElementById("pb-single");
        const a = card && card.querySelector("h3 a");
        return { cover, vh: window.innerHeight, cardTop: card && card.getBoundingClientRect().top,
          noteTop: note && note.getBoundingClientRect().top, focused: document.activeElement === a };
      }, coverBottom.toString());
      t("playbook permalink @" + w + ": the notice and the card are in view, below the nav",
        r.noteTop >= r.cover - 1 && r.cardTop > r.noteTop && r.cardTop < r.vh, r);
      t("playbook permalink @" + w + ": focus is on the card's link", r.focused, r);
      await page.close();
    }

    /* Watch: the replay controls start in the first screen on desktop, and
       "Back to live" stays hidden while there is no live run. */
    for (const [w, h] of [[1440, 900], [1280, 800], [390, 844]]) {
      const page = await open({ w, h });
      await page.goto(BASE + "/watch", { waitUntil: "load" });
      await settle(2500);
      const r = await page.evaluate(() => {
        const c = document.getElementById("replay-controls");
        const x = document.getElementById("rp-exit");
        return { vh: window.innerHeight, controlsTop: c.getBoundingClientRect().top, controlsBottom: c.getBoundingClientRect().bottom,
          controlsHidden: c.hidden, exitDisplay: getComputedStyle(x).display, exitHidden: x.hidden };
      });
      t("watch @" + w + ": \"Back to live\" is not shown while the demo replay plays", r.exitHidden && r.exitDisplay === "none", r);
      if (w >= 1280) t("watch @" + w + "x" + h + ": the replay controls are in the first screen", !r.controlsHidden && r.controlsBottom <= r.vh, r);
      else console.log("watch @" + w + "x" + h + ": replay controls start at " + Math.round(r.controlsTop) + "px (first screen " + r.vh + "px)");
      await page.close();
    }

    /* Submit, closed week: axe skips a disabled fieldset, so paint the
       closed state on an enabled copy and check its contrast. */
    for (const [w, h] of [[1280, 900], [390, 844]]) {
      const page = await open({ w, h });
      await page.goto(BASE + "/submit", { waitUntil: "load" });
      await settle(600);
      const dimmed = await page.evaluate(() => {
        const f = document.getElementById("sub-fields");
        document.querySelectorAll("#sub-fields details").forEach((d) => { d.open = true; });
        const all = [...f.querySelectorAll("*")];
        const ops = all.map((el) => getComputedStyle(el).opacity);
        const wasDisabled = f.disabled;
        f.disabled = false;
        // The controls stay disabled one by one (inactive controls are
        // exempt); what's checked is the text around them.
        f.querySelectorAll("input,textarea,select,button").forEach((c) => { c.disabled = true; });
        let n = 0;
        all.forEach((el, i) => { if (ops[i] !== "1") { el.style.opacity = ops[i]; n++; } });
        return { wasDisabled, n };
      });
      t("submit @" + w + ": the form ships disabled before the week opens", dimmed.wasDisabled, dimmed);
      await page.evaluate(axeSrc);
      const bad = await page.evaluate(async () => {
        const r = await window.axe.run("#sub-fields", { runOnly: ["color-contrast"], resultTypes: ["violations", "incomplete"] });
        return r.violations.concat(r.incomplete).flatMap((v) => v.nodes.map((n) => n.target.join(" ") + " :: " +
          ((n.any[0] || {}).message || "").slice(0, 120)));
      });
      t("submit @" + w + ": closed-week paint keeps hints, labels and links at 4.5:1 (" + dimmed.n + " dimmed elements)", bad.length === 0, bad.slice(0, 6));
      await page.close();
    }

    /* The phone menu, with touch input. */
    {
      const page = await open({ w: 390, h: 844, touch: true });
      await page.goto(BASE + "/faq", { waitUntil: "load" });
      await settle(400);
      const state = () => page.evaluate(() => ({
        open: document.getElementById("navlinks").classList.contains("open"),
        expanded: document.querySelector(".nav-toggle").getAttribute("aria-expanded"),
        focus: document.activeElement ? document.activeElement.className || document.activeElement.tagName : ""
      }));
      await page.tap(".nav-toggle");
      let s = await state();
      t("menu: a tap opens it", s.open && s.expanded === "true", s);
      await axe(page, "faq @390, menu open");
      await page.keyboard.press("Escape");
      s = await state();
      t("menu: Escape closes it and returns focus to Menu", !s.open && s.expanded === "false" && /nav-toggle/.test(s.focus), s);
      await page.tap(".nav-toggle");
      await page.touchscreen.tap(195, 700);
      await settle(150);
      s = await state();
      t("menu: a tap outside closes it", !s.open && s.expanded === "false", s);
      await page.tap(".nav-toggle");
      await page.tap(".nav-label");
      s = await state();
      t("menu: a tap inside the panel keeps it open", s.open, s);
      await page.evaluate(() => { const as = document.querySelectorAll("#navlinks a"); as[as.length - 1].focus(); });
      await page.keyboard.press("Tab");
      s = await state();
      t("menu: tabbing past the last link closes it", !s.open, s);
      await page.close();
    }
  } finally {
    await browser.close();
    await srv.close();
  }
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
