/* Shared layout and trust pages. Run: node scripts/test-layout.mjs (or npm test).
   1. Every page carries the nav and footer from partials/, stamped by
      scripts/stamp-layout.mjs, with its own link marked.
   2. The nav: three groups (Play, Library, About) in order, each a
      disclosure button tied to its list. The footer: the trademark line,
      the week line, the trust pages and the licenses.
   3. Links: every nav and footer link, and every same-site link with a
      #fragment on any page, points at a file and an id that exist. No page
      links meta.html; vercel.json redirects it to /setups and serves the
      new pages at clean paths.
   4. Trust pages state what the code does: retention from lib/packs.js and
      api/_lib.js, the processors, deletion by token, no cookies and no
      third-party resources, 18+, no prizes, the Meta disclaimer.
   5. The library: Setups names its six parts, Skills cites Meta's Muse
      Code docs and says sharing isn't open; the home hero puts both
      buttons before Mabel.
   6. main.js runs the nav (Escape, outside click) without innerHTML; the
      CSS keeps a no-JS fallback.
   7. Mabel's belly emblem is flat colour from the site palette.
   8. The license files.
   Exits non-zero on any failure. */
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT, NAMES, pages, partial, render, stampPage, pathFor } from "./stamp-layout.mjs";
import { loadSite, route } from "./serve.mjs";

const require = createRequire(import.meta.url);
const packs = require("../lib/packs.js");
const lib = require("../api/_lib.js");

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) pass++;
  else { fail++; console.error("FAIL:", name, extra === undefined ? "" : JSON.stringify(extra).slice(0, 400)); }
}
const eq = (name, a, b) => t(name + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")", JSON.stringify(a) === JSON.stringify(b));
const read = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const decode = (s) => s
  .replace(/&ndash;/g, "–").replace(/&mdash;/g, "—").replace(/&middot;/g, "·").replace(/&hellip;/g, "…")
  .replace(/&ldquo;|&rdquo;/g, '"').replace(/&rsquo;|&lsquo;/g, "'")
  .replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");
const text = (html) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");

const TRADEMARK = "Makers on Muse is an independent community project. Not affiliated with, endorsed by, or sponsored by Meta Platforms, Inc. Muse and Meta are trademarks of Meta Platforms, Inc.";
const PAGES = pages();
const NAV = partial("nav");
const FOOTER = partial("footer");

/* ---------- 1. every page carries the stamped partials ---------- */
{
  const expected = ["404.html", "about.html", "faq.html", "index.html", "leaderboard.html", "pack.html", "playbook.html",
    "privacy.html", "receipt.html", "scoring.html", "setups.html", "skills.html", "submit.html", "terms.html", "watch.html"];
  eq("the site's pages", PAGES, expected);
  for (const p of PAGES) {
    const res = stampPage(read(p), p);
    for (const n of NAMES) t(p + ": one " + n + " block", res.count[n] === 1, res.count);
    eq(p + ": nav and footer match partials/ (run npm run build:layout)", res.drift, []);
    const html = read(p);
    t(p + ": nav comes before <main>, footer after </main>",
      html.indexOf("<!-- layout:nav -->") < html.indexOf("<main") && html.indexOf("</main>") < html.indexOf("<!-- layout:footer -->"));
    t(p + ": one <header> and one <footer>", (html.match(/<header\b/g) || []).length === 1 && (html.match(/<footer\b/g) || []).length === 1);
    t(p + ": skip link to #main, and a main#main", html.includes('<a class="skip" href="#main">') && html.includes('<main id="main">'));
    t(p + ": loads main.js", /<script src="\/assets\/js\/main\.js(\?v=[0-9a-f]+)?"( defer)?><\/script>/.test(html));
    t(p + ": loads main.css", /<link rel="stylesheet" href="\/assets\/css\/main\.css(\?v=[0-9a-f]+)?">/.test(html));
  }
  // The stamp itself: a drifted page is caught, and --write fixes it.
  const page = read("faq.html");
  const broken = page.replace("Leaderboard</a>", "Board</a>");
  t("a hand-edited nav shows up as drift", stampPage(broken, "faq.html").drift.includes("nav"));
  t("the stamp restores it", stampPage(stampPage(broken, "faq.html").html, "faq.html").drift.length === 0 &&
    stampPage(broken, "faq.html").html === page);
  t("a page without markers is counted", stampPage("<p>no layout</p>", "x.html").count.nav === 0);
}

/* ---------- 2. nav and footer contents ---------- */
const hrefs = (html) => [...html.matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [m[1], decode(m[2]).trim()]);
{
  const groups = [...NAV.matchAll(/<div class="nav-group">([\s\S]*?)<\/div>/g)].map((m) => m[1]);
  const got = groups.map((g) => ({
    label: (g.match(/<button class="nav-group-btn" type="button" aria-expanded="false" aria-controls="([^"]+)">([^<]+)<\/button>/) || []).slice(1),
    list: (g.match(/<ul class="nav-menu" id="([^"]+)" aria-label="([^"]+)">/) || []).slice(1),
    mobile: (g.match(/<span class="nav-label" aria-hidden="true">([^<]+)<\/span>/) || [])[1],
    links: hrefs(g)
  }));
  eq("nav groups, their buttons and lists", got.map((g) => [g.label, g.list, g.mobile]), [
    [["nav-play", "Play"], ["nav-play", "Play"], "Play"],
    [["nav-library", "Library"], ["nav-library", "Library"], "Library"],
    [["nav-about", "About"], ["nav-about", "About"], "About"]
  ]);
  eq("Play group", got[0].links, [["/pack", "This week"], ["/submit", "Submit"], ["/leaderboard", "Leaderboard"], ["/watch", "Replays"]]);
  eq("Library group", got[1].links, [["/playbook", "Playbook"], ["/setups", "Setups"], ["/skills", "Skills"]]);
  eq("About group", got[2].links, [["/scoring", "Rules & scoring"], ["/faq", "FAQ"], ["/about", "About"]]);
  t("nav: brand links home", NAV.includes('<a class="brand" href="/">'));
  t("nav: Menu toggle controls the link panel", NAV.includes('<button class="nav-toggle" type="button" aria-expanded="false" aria-controls="navlinks">Menu</button>') &&
    NAV.includes('<nav class="nav-links" id="navlinks" aria-label="Primary">'));
  t("nav: no aria-current in the partial itself", !NAV.includes("aria-current") && !FOOTER.includes("aria-current"));

  const ft = text(FOOTER);
  t("footer: the trademark line, word for word", ft.includes(TRADEMARK));
  t("footer: the week line", ft.includes("Season 1 · Week 1: Mon Oct 5 – Sun Oct 11, 2026, closes 11:59 PM CT"));
  const fl = hrefs(FOOTER).map((x) => x[0]);
  for (const h of ["/pack", "/submit", "/leaderboard", "/watch", "/playbook", "/setups", "/skills",
    "/scoring", "/faq", "/about", "/privacy", "/terms", "https://github.com/jcdavis131/makers-on-muse"]) {
    t("footer links " + h, fl.includes(h));
  }
  t("footer: names both licenses", ft.includes("MIT License") && ft.includes("CC BY 4.0"));

  // Current-page marking, per page.
  const navLinks = hrefs(NAV).map((x) => x[0]).filter((h) => h !== "/");
  eq("clean paths", [pathFor("index.html"), pathFor("pack.html"), pathFor("404.html")], ["/", "/pack", "/404"]);
  for (const p of PAGES) {
    const path = pathFor(p);
    const nav = render("nav", p);
    const marked = [...nav.matchAll(/<a href="([^"]+)" aria-current="page">/g)].map((m) => m[1]);
    eq(p + ": nav marks only its own link", marked, navLinks.includes(path) ? [path] : []);
    const cur = [...nav.matchAll(/<div class="nav-group is-current">([\s\S]*?)<\/div>/g)];
    t(p + ": its group, and only its group, is current", navLinks.includes(path) ? cur.length === 1 && cur[0][1].includes('href="' + path + '"') : cur.length === 0);
    const foot = render("footer", p);
    const fm = [...foot.matchAll(/aria-current="page"/g)].length;
    t(p + ": footer marks its own link when listed", fm === (fl.includes(path) ? 1 : 0));
  }
}

/* ---------- 3. links, anchors, redirects ---------- */
{
  const ids = {};
  for (const p of PAGES) ids[p] = new Set([...read(p).matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  // Links resolve the way Vercel serves them (scripts/serve.mjs applies
  // vercel.json): a clean path, no redirect on the way.
  const site = loadSite();
  const served = (h) => { const r = route(site, { url: h }); return r.status === 200 && !r.location; };
  for (const [h] of hrefs(NAV + FOOTER)) {
    if (/^https?:/.test(h)) continue;
    t("layout link is served as is: " + h, served(h));
  }
  const fileOf = (path) => (path === "/" ? "index.html" : path.slice(1) + ".html");
  for (const p of PAGES) {
    const html = read(p);
    t(p + ": no link to meta.html", !/href="\/?meta(\.html)?["#?]/.test(html));
    t(p + ": no link to a .html address (each one is a 308 under cleanUrls)", !/href="\/?[a-z0-9-]+\.html/.test(html));
    for (const m of html.matchAll(/href="(\/[a-z0-9-]*)?#([A-Za-z][\w-]*)"/g)) {
      const target = m[1] ? fileOf(m[1]) : p;
      t(p + ": link " + (m[1] || "") + "#" + m[2] + " points at a page and an id that exist",
        existsSync(join(ROOT, target)) && ids[target] && ids[target].has(m[2]));
    }
    for (const m of html.matchAll(/href="(\/[a-z0-9-]*)(?:[?#][^"]*)?"/g)) {
      t(p + ": link target is served: " + m[1], served(m[1]));
    }
  }
  t("meta.html is gone (renamed to setups.html)", !existsSync(join(ROOT, "meta.html")) && existsSync(join(ROOT, "setups.html")));

  const vj = JSON.parse(read("vercel.json"));
  const redirects = vj.redirects || [];
  for (const src of ["/meta.html", "/meta"]) {
    t("vercel.json: " + src + " redirects permanently to /setups",
      redirects.some((r) => r.source === src && r.destination === "/setups" && r.permanent === true));
  }
  t("vercel.json: clean URLs on, no trailing slash, no leftover rewrites", vj.cleanUrls === true && vj.trailingSlash === false && !vj.rewrites);
  for (const name of ["receipt", "setups", "skills", "about", "privacy", "terms"]) {
    t("/" + name + " serves " + name + ".html", served("/" + name) && route(site, { url: "/" + name }).file === join(ROOT, name + ".html"));
  }
  t("vercel.json: live-runs still never deploys", vj.git && vj.git.deploymentEnabled && vj.git.deploymentEnabled["live-runs"] === false);
  t(".vercelignore: partials are repo-only", /^\/partials\/$/m.test(read(".vercelignore")));
}

/* ---------- 4. trust pages say what the code does ---------- */
{
  // No cookies, no analytics, nothing loaded from another site.
  for (const p of PAGES) {
    const html = read(p);
    for (const m of html.matchAll(/<(?:script|link|img|iframe)\b[^>]*\b(?:src|href)="([^"]+)"/g)) {
      // rel="canonical" names the page's own address; the browser loads nothing from it.
      if (/^<link rel="canonical"/.test(m[0])) { t(p + ": canonical is on this site", m[1].startsWith("https://makersonmuse.com/")); continue; }
      t(p + ": loads only its own files: " + m[1], !/^(https?:)?\/\//.test(m[1]));
    }
  }
  for (const f of ["main.js", "board.js", "receipt.js", "season.js", "submit-form.js", "watch.js", "playbook.js", "playbook-data.js"]) {
    t("assets/js/" + f + ": no cookies", !/document\.cookie/.test(read("assets/js/" + f)));
  }

  const pv = text(read("privacy.html"));
  const days = packs.RETENTION_DAYS;
  eq("retention in lib/packs.js", days, 90);
  eq("run retention in api/_lib.js", lib.RUN_TTL_S, 30 * 24 * 60 * 60);
  t("privacy: no cookies, no analytics, nothing from other sites", pv.includes("No cookies, no analytics, no ads, and no scripts or fonts from other sites."));
  t("privacy: " + days + " days after the week closes", pv.includes(days + " days after the week closes"));
  const exp = new Date(packs.expiresAt(packs.byWeek(1)) * 1000);
  const ct = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  const o = {};
  for (const x of ct.formatToParts(exp)) o[x.type] = x.value;
  const expLabel = `${o.weekday} ${o.month} ${o.day}, ${o.year}, ${o.hour}:${o.minute} ${o.dayPeriod} CT`;
  t("privacy: Week 1's expiry is the one the code computes (" + expLabel + ")", pv.includes("For Week 1: " + expLabel + "."));
  t("privacy: run events 30 days", pv.includes("30 days after the run's last event"));
  t("privacy: rate-limit counters about 2 minutes, hashed IP", pv.includes("About 2 minutes") && pv.includes("hash of the IP address"));
  t("privacy: contact email never returned", pv.includes("No page or API returns it"));
  // api/receipt.js returns status, scores, handle and agent, never answers.
  t("privacy: answers are not returned by any page or API", pv.includes("No page or API returns them") &&
    /Never the answers/.test(read("api/receipt.js")));
  t("privacy: no blanket \"don't share\" claim next to the processors", !/sell or share/i.test(pv) && pv.includes("We share it only with the services below"));
  t("privacy: token kept as a hash", pv.includes("We keep the hash, not the token"));
  t("privacy: deletion by token on the receipt page", /href="\/receipt"/.test(read("privacy.html")) && pv.includes("choose Delete"));
  t("privacy: drafts stay in the browser without contact or token", pv.includes("leaves out your contact email and your token"));
  for (const [name, url] of [
    ["Vercel", "https://vercel.com/legal/privacy-notice"],
    ["Upstash", "https://upstash.com/trust/privacy.pdf"],
    ["GitHub", "https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement"]
  ]) t("privacy: names " + name + " and links its policy", pv.includes(name) && read("privacy.html").includes('href="' + url + '"'));
  t("privacy: says storage isn't connected yet", pv.includes("Storage isn't connected yet"));
  t("privacy: 18 and older", pv.includes("18 and older"));
  t("privacy: the redaction claim is modest", pv.includes("That catches common patterns, not everything"));
  t("privacy: no invented contact address", !/mailto:|@makersonmuse\.com/.test(read("privacy.html")));

  const tm = text(read("terms.html"));
  t("terms: 18 or older", tm.includes("You must be 18 or older"));
  t("terms: no prizes", tm.includes("There are no prizes"));
  t("terms: permission to show entries, as described", tm.includes("permission to store it, score it, and show it"));
  t("terms: acceptable use", /Acceptable use/.test(tm) && tm.includes("Don't impersonate anyone"));
  t("terms: your agent is your responsibility", tm.includes("You are responsible for what it does"));
  t("terms: the trademark line", tm.includes(TRADEMARK));
  t("terms: names both licenses", tm.includes("MIT License") && tm.includes("CC BY 4.0"));
  t("terms: no governing-law clause invented", !/governing law|jurisdiction/i.test(tm));
  t("terms and privacy: no invented contact address", !/mailto:|@makersonmuse\.com/.test(read("terms.html") + read("about.html")));

  const ab = text(read("about.html"));
  t("about: who runs it", ab.includes("independent community project run by Cam"));
  t("about: why", /Why it exists/.test(ab));
  t("about: Phase 1 and Phase 2", ab.includes("Phase 1 · now") && ab.includes("Phase 2 · planned") && ab.includes("no dates are set"));
  t("about: repo link", read("about.html").includes('href="https://github.com/jcdavis131/makers-on-muse"'));
  t("about: says there is no contact email yet", ab.includes("There is no contact email yet"));
  t("faq: affiliation answer uses the trademark line", text(read("faq.html")).includes(TRADEMARK));
}

/* ---------- 5. the library and the home page ---------- */
{
  const st = text(read("setups.html"));
  for (const h of ["Prompt recipes", "Connectors", "Custom connectors", "Permission levels", "Scheduled tasks", "Personality and memory"]) {
    t("setups: names the part: " + h, read("setups.html").includes("<h3>" + h + "</h3>"));
  }
  t("setups: title and heading", read("setups.html").includes("<title>Setups — Makers on Muse</title>") && read("setups.html").includes("<h1>Setups</h1>"));
  t("setups: says sharing isn't built", st.includes("Sharing a Setup isn't built yet"));
  t("setups: no usage numbers", !/usage:|top-10/i.test(st));
  t("setups: points Muse Code users at Skills", /href="\/skills"/.test(read("setups.html")));

  const sk = read("skills.html");
  const skt = text(sk);
  t("skills: cites Meta's Muse Code docs", sk.includes('href="https://dev.meta.ai/docs/muse-code/extending"'));
  t("skills: explains SKILL.md and the repo path", skt.includes("SKILL.md") && skt.includes("<repo>/.agents/skills/<skill-id>/SKILL.md"));
  t("skills: submissions are Phase 2", skt.includes("Submissions come in Phase 2"));
  t("skills: consumer skills come from Meta, with the source", sk.includes('href="https://www.meta.com/help/artificial-intelligence/2797651547267109/"') &&
    skt.includes("are developed by Meta and are already part of Muse"));
  t("skills: doesn't restate a file format it can't source", !/frontmatter|front matter|yaml/i.test(skt));

  const idx = read("index.html");
  const hero = idx.slice(idx.indexOf('<section class="hero">'), idx.indexOf("</section>", idx.indexOf('<section class="hero">')));
  const iPack = hero.indexOf('href="/pack"'), iBook = hero.indexOf('href="/playbook"'), iMabel = hero.indexOf("data-mabel");
  t("home hero: pack and Playbook buttons, both before Mabel", iPack > -1 && iBook > -1 && iMabel > iPack && iMabel > iBook);
  t("home hero: covers testing and sharing", text(hero).includes("Test your Muse. Share what works."));
  t("home: a library section with both tracks", /href="\/setups"/.test(idx) && /href="\/skills"/.test(idx));
  t("home: the L1-L4 cards link to their levels", ["l1", "l2", "l3", "l4"].every((l) => idx.includes('href="/pack#' + l + '"')));
}

/* ---------- 6. nav script and styles ---------- */
{
  const js = read("assets/js/main.js");
  t("main.js: marks that JS is running", js.includes('document.documentElement.classList.add("js")'));
  t("main.js: group buttons toggle aria-expanded", js.includes('btn.setAttribute("aria-expanded", open ? "true" : "false")'));
  t("main.js: Escape closes and returns focus", /e\.key !== "Escape"/.test(js) && js.includes("openBtn.focus()") && js.includes("toggle.focus()"));
  t("main.js: a click outside closes", /document\.addEventListener\("click"/.test(js));
  t("main.js: a tap outside closes (pointerdown; iOS sends no click)", /document\.addEventListener\("pointerdown"/.test(js));
  t("main.js: tabbing out of the phone panel closes it", /links\.addEventListener\("focusout"/.test(js));
  t("main.js: no innerHTML for the nav", !/innerHTML\s*=/.test(js.replace(/tpl\.innerHTML = svgText\.trim\(\);/, "")));
  t("main.js: no JS-set active link (the stamp marks it)", !/classList\.add\("active"\)/.test(js));
  const css = read("assets/css/main.css");
  t("css: a group opens from its button", css.includes('.nav-group-btn[aria-expanded="true"] + .nav-menu{display:block}'));
  t("css: without JS, hover and focus open a group", css.includes("html:not(.js) .nav-group:focus-within .nav-menu"));
  t("css: phones list every group", /@media \(max-width:720px\)\{[\s\S]*?\.nav-group-btn\{display:none\}[\s\S]*?\.nav-label\{/.test(css));
  t("css: current link styled by aria-current", css.includes('.nav-links a[aria-current="page"]'));
}

/* ---------- 7. Mabel's emblem ---------- */
{
  const svg = read("assets/img/mabel-plush.svg");
  t("mabel: no gradient on the belly emblem", !/sparkGrad|linearGradient/.test(svg));
  t("mabel: none of the old blue-violet", !/#7C9CF0|#B48CE8/i.test(svg));
  t("mabel: the patch uses the palette", /<!-- belly patch[\s\S]{0,400}fill="#F6EFE3" stroke="#C17C60"[\s\S]{0,300}fill="#C17C60"/.test(svg));
}

/* ---------- 8. licenses ---------- */
{
  const mit = read("LICENSE");
  t("LICENSE: MIT", mit.startsWith("MIT License\n") && mit.includes("Permission is hereby granted, free of charge") &&
    mit.includes('THE SOFTWARE IS PROVIDED "AS IS"'));
  t("LICENSE: points at the content license", mit.includes("LICENSE-CONTENT"));
  const cc = read("LICENSE-CONTENT");
  t("LICENSE-CONTENT: CC BY 4.0 legal code", cc.includes("Creative Commons Attribution 4.0 International Public License") &&
    cc.includes("Section 1 -- Definitions.") && cc.includes("Section 8 -- Interpretation."));
  t("LICENSE-CONTENT: says what it covers", cc.includes("assets/js/playbook-data.js"));
  t("README: License section names both", /## License\n\nCode: MIT \(`LICENSE`\)\. Playbook content[^\n]*CC BY 4\.0 \(`LICENSE-CONTENT`\)/.test(read("README.md")));
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
