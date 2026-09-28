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
    const out = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations
      .map((v) => ({ id: v.id, n: v.nodes.length, nodes: v.nodes.slice(0, 4).map((n) => n.target.join(" ") + " :: " + (n.any[0] ? n.any[0].message : "").slice(0, 160)) })));
    t(name + ": axe color-contrast 0", !out.some((v) => v.id === "color-contrast"), out.filter((v) => v.id === "color-contrast"));
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
