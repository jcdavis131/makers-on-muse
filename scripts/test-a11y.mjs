/* Accessibility checks that need no browser. Run: node scripts/test-a11y.mjs
   (or npm test). The full check is axe in headless Chrome (see README,
   "Accessibility"); this one keeps the basics from sliding back.
   1. Colour contrast (WCAG 2.1 AA) from the tokens in main.css: text
      tokens reach 4.5:1 on paper, card and stone-100; button text 4.5:1
      on its fill; form-field borders 3:1; the badge pairs 4.5:1.
   2. One set of tokens: no page redefines the palette in its own
      <style>, and nothing uses the old failing values.
   3. Heading order: in every page's static HTML, and in the headings
      the scripts build, no heading skips a level on the way down.
   4. Scroll boxes take keyboard focus; the phone menu closes on Escape,
      a tap outside and tabbing out (main.js).
   Exits non-zero on any failure. */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) pass++;
  else { fail++; console.error("FAIL:", name, extra === undefined ? "" : JSON.stringify(extra).slice(0, 400)); }
}

/* ---------- WCAG relative luminance and contrast ratio ---------- */
export function luminance(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const css = read("assets/css/main.css");
const rootBlock = (/:root\{([\s\S]*?)\n\}/.exec(css) || [])[1] || "";
const tokens = Object.fromEntries([...rootBlock.matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{3,6})\b/g)].map((m) => [m[1], m[2]]));
const tok = (name) => {
  if (!tokens[name]) throw new Error("no token --" + name + " in main.css");
  return tokens[name];
};

/* ---------- 1. contrast ---------- */
{
  t("the formula matches WCAG (black on white is 21:1)", Math.abs(ratio("#000000", "#FFFFFF") - 21) < 1e-9);
  t("and a known pair (#767676 on white is 4.54:1)", Math.abs(ratio("#767676", "#FFFFFF") - 4.54) < 0.01);

  const BACKGROUNDS = ["paper", "card", "stone-100"];
  for (const fg of ["ink", "ink-soft", "ink-faint", "clay", "terracotta-deep", "moss-deep"]) {
    for (const bg of BACKGROUNDS) {
      const r = ratio(tok(fg), tok(bg));
      t("--" + fg + " on --" + bg + " is at least 4.5:1 (" + r.toFixed(2) + ")", r >= 4.5);
    }
  }
  for (const fill of ["accent", "accent-deep"]) {
    const r = ratio("#FFFDF9", tok(fill));
    t("button text #FFFDF9 on --" + fill + " is at least 4.5:1 (" + r.toFixed(2) + ")", r >= 4.5);
  }
  for (const bg of BACKGROUNDS) {
    const r = ratio(tok("field-border"), tok(bg));
    t("--field-border on --" + bg + " is at least 3:1 (" + r.toFixed(2) + ")", r >= 3);
  }
  t("primary buttons use the accessible fill", /\.btn-primary\{background:var\(--accent\);color:#FFFDF9;border-color:var\(--accent-deep\)\}/.test(css) &&
    /\.btn-primary:hover\{background:var\(--accent-deep\)/.test(css));
  t("links use --terracotta-deep and darken on hover", /\ba\{color:var\(--terracotta-deep\)/.test(css) && /\ba:hover\{color:var\(--accent-deep\)\}/.test(css));
  t("form fields use --field-border", /\.field input\{[^}]*border:1px solid var\(--field-border\)/.test(css));

  // Badges: each rule's background and text colour.
  for (const kind of ["easy", "medium", "involved"]) {
    const m = new RegExp("\\.badge\\." + kind + "\\{background:(#[0-9A-Fa-f]{6});color:(var\\(--([\\w-]+)\\)|#[0-9A-Fa-f]{6})\\}").exec(css);
    t("badge." + kind + " rule found", Boolean(m));
    if (!m) continue;
    const fg = m[3] ? tok(m[3]) : m[2];
    const r = ratio(fg, m[1]);
    t("badge." + kind + " text is at least 4.5:1 (" + r.toFixed(2) + ")", r >= 4.5);
  }
}

/* ---------- 2. one set of tokens ---------- */
const pages = readdirSync(ROOT).filter((f) => f.endsWith(".html")).sort();
{
  const OLD = ["#A67B5B", "#8A8478", "#A5664F", "#6F7F70"]; // clay, ink-faint, link, moss-deep before the fix
  for (const p of pages) {
    const html = read(p);
    const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
    const roots = [...styles.matchAll(/:root\s*\{([^}]*)\}/g)].map((m) => m[1]);
    const redefined = roots.flatMap((r) => [...r.matchAll(/--([\w-]+)\s*:/g)].map((m) => m[1])).filter((n) => n in tokens);
    t(p + ": doesn't redefine the site's tokens", redefined.length === 0, redefined);
    const old = OLD.filter((c) => html.toUpperCase().includes(c));
    t(p + ": none of the old failing colours", old.length === 0, old);
    t(p + ": white text only on the accessible fills", !/background:var\(--terracotta\);color:#(?:fff|FFFDF9)\b/i.test(styles));
  }
  for (const f of ["assets/css/main.css", "assets/css/mabel.css"]) {
    const old = ["#A67B5B", "#8A8478", "#A5664F", "#6F7F70"].filter((c) => read(f).toUpperCase().includes(c));
    t(f + ": none of the old failing colours", old.length === 0, old);
  }
}

/* ---------- 3. heading order ---------- */
export function skips(levels) {
  const out = [];
  for (let i = 1; i < levels.length; i++) if (levels[i] > levels[i - 1] + 1) out.push(levels[i - 1] + "->" + levels[i]);
  return out;
}
{
  t("skips() finds a skipped level", skips([1, 3]).join() === "1->3" && skips([1, 2, 3, 2, 2, 3]).length === 0);
  const staticHtml = (html) => html.replace(/<script\b[\s\S]*?<\/script>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  for (const p of pages) {
    const levels = [...staticHtml(read(p)).matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
    t(p + ": starts with one h1", levels[0] === 1 && levels.filter((l) => l === 1).length === 1, levels);
    t(p + ": no heading skips a level", skips(levels).length === 0, skips(levels));
  }
  const footer = read("partials/footer.html");
  t("footer column titles are h2", !/<h[3-6]\b/.test(footer) && /<h2 class="foot-h">/.test(footer));
  // Headings the scripts build, and where they land.
  const form = read("assets/js/submit-form.js");
  t("submit level cards use h2, like the page's other cards", /<\/span><h2>" \+ esc\(L\.title\) \+ '<\/h2>/.test(form) && !/<h[3-6]>/.test(form));
  t("L5's summary holds only phrasing and heading content", /<summary class="sub-card"[^>]*>' \+\s*'<span class="step">/.test(form) && !/<summary><div/.test(form));
  t("submit errors box heading is h2", /box\.innerHTML = "<h2>"/.test(read("assets/js/submit.js")));
  const watch = read("watch.html");
  t("watch: the feed's level banners (h3) sit under an h2", /<h2 class="sr-only" id="feed-h">[^<]+<\/h2>[\s\S]*<div id="feed"/.test(watch) &&
    /<h3>/.test(read("assets/js/watch.js")));
  t("watch: the run status bar is a labelled region", /class="livebar" id="livebar" role="region" aria-label="Run status"/.test(watch));
  t("playbook: cards (h3) sit under an h2", /<h2 class="sr-only" id="pb-list-h">Workflows<\/h2>[\s\S]*id="pb-grid"/.test(read("playbook.html")));
  t("pack: level titles (h3) sit under an h2", /<h2 class="sr-only" id="levels-h">[^<]+<\/h2>[\s\S]*id="l1"/.test(read("pack.html")));
}

/* ---------- 4. keyboard ---------- */
{
  for (const p of pages) {
    const html = read(p);
    for (const m of html.matchAll(/<div class="board-scroll"[^>]*>/g)) {
      t(p + ": a scroll box takes focus and has a name: " + m[0], /tabindex="0"/.test(m[0]) && /role="region"/.test(m[0]) && /aria-label(ledby)?="/.test(m[0]));
    }
    for (const m of html.matchAll(/<pre\b[^>]*>/g)) t(p + ": a <pre> takes focus: " + m[0], /tabindex="0"/.test(m[0]));
  }
  t("scroll boxes show focus", /\.board-scroll:focus-visible/.test(css));
  const js = read("assets/js/main.js");
  t("menu: Escape closes and returns focus", /e\.key !== "Escape"/.test(js) && js.includes("toggle.focus()"));
  t("menu: a tap outside closes (pointerdown)", /document\.addEventListener\("pointerdown"/.test(js));
  t("menu: tabbing out closes", /links\.addEventListener\("focusout"/.test(js));
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
