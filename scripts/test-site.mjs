/* How the site is served. Run: node scripts/test-site.mjs (or npm test).
   Starts scripts/serve.mjs (vercel.json applied) on a free local port and
   GETs from it. Nothing leaves this machine.
   1. The router emulation itself: path patterns, host conditions,
      .vercelignore rules, and a refusal to emulate what it can't.
   2. Clean URLs: /pack serves pack.html, pack.html and /pack/ 308 to
      /pack, the old /meta addresses 308 to /setups, query strings kept.
   3. Hosts: www.makersonmuse.com and makers-on-muse.vercel.app 308 to the
      apex with path and query; preview hosts are served as they are.
   4. The branded 404 at any depth, with root-absolute links and assets
      so it works at /a/b/c; repo-only files are 404, not served.
   5. robots.txt and sitemap.xml.
   6. The link check passes and catches what it should.
   7. Security headers on pages, the 404, assets and the API: a CSP that
      allows this site only (no inline script), nosniff, a referrer
      policy, a permissions policy, no framing. Statically: no inline
      script, event handler, javascript: URL or eval anywhere.
   8. Caching: versioned CSS and JS for a year, images for a day, pages
      and data revalidated; every page's asset versions are current.
   Exits non-zero on any failure. */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT, start, loadSite, route, compileSource, matchSource, ignoreMatcher } from "./serve.mjs";
import { stampAssets, version } from "./stamp-assets.mjs";
import { pages, pathFor, noindex, sitemap, ORIGIN } from "./stamp-layout.mjs";
import { checkSite, checkRef, refs } from "./check-links.mjs";

for (const k of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN"]) delete process.env[k];

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) pass++;
  else { fail++; console.error("FAIL:", name, extra === undefined ? "" : JSON.stringify(extra).slice(0, 400)); }
}
const eq = (name, a, b) => t(name + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")", JSON.stringify(a) === JSON.stringify(b));
const read = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

/* ---------- 1. the emulation ---------- */
{
  eq("/:path* matches the root", matchSource("/:path*", "/"), { path: "" });
  eq("/:path* matches a deep path", matchSource("/:path*", "/a/b.html"), { path: "a/b.html" });
  eq("a group is a regex", matchSource("/assets/(css|js)/(.*)", "/assets/js/main.js"), { 0: "js", 1: "main.js" });
  t("a group doesn't match outside itself", !matchSource("/assets/(css|js)/(.*)", "/assets/img/x.svg"));
  t("dots are literal", !matchSource("/favicon.ico", "/faviconxico"));
  t("an unknown modifier throws", throws(() => compileSource("/blog/:slug?")) && throws(() => compileSource("/a+")));
  const ig = ignoreMatcher("/scripts/\nREADME.md\nlib/**/*.test.js\nnode_modules/\n# comment\n");
  eq(".vercelignore rules", ["scripts/x.mjs", "scripts", "docs/README.md", "README.md", "lib/a/b.test.js", "lib/score.js", "x/node_modules/y", "myscripts/a"].map(ig),
    [true, false, true, true, true, false, true, false]);
  t("negation isn't emulated", throws(() => ignoreMatcher("!keep.md")));
  const site = loadSite();
  t("the real vercel.json and .vercelignore load", Boolean(site.config));
}

const srv = await start({ api: true });
const get = (path, headers = {}) => fetch(srv.url + path, { redirect: "manual", headers });
const body = async (res) => { try { return await res.text(); } catch { return ""; } };

try {
  /* ---------- 2. clean URLs ---------- */
  for (const p of pages()) {
    if (p === "404.html") continue;
    const res = await get(pathFor(p));
    const html = await body(res);
    t(pathFor(p) + " serves " + p, res.status === 200 && /text\/html/.test(res.headers.get("content-type")) && html === read(p), res.status);
  }
  for (const [from, to] of [["/pack.html", "/pack"], ["/index.html", "/"], ["/pack/", "/pack"], ["/pack.html?w=1#x", "/pack?w=1"],
    ["/meta", "/setups"], ["/meta.html", "/setups"], ["/receipt.html", "/receipt"]]) {
    const res = await get(from);
    eq(from + " -> 308 " + to, [res.status, res.headers.get("location")], [308, to]);
  }
  const vj = JSON.parse(read("vercel.json"));
  t("vercel.json: cleanUrls, no trailing slash", vj.cleanUrls === true && vj.trailingSlash === false);
  t("vercel.json: live-runs never deploys", vj.git && vj.git.deploymentEnabled && vj.git.deploymentEnabled["live-runs"] === false);

  /* ---------- 3. hosts ---------- */
  for (const host of ["www.makersonmuse.com", "makers-on-muse.vercel.app", "WWW.MakersOnMuse.com"]) {
    let res = await get("/", { "x-forwarded-host": host });
    eq(host + " / -> apex", [res.status, res.headers.get("location")], [308, "https://makersonmuse.com/"]);
    res = await get("/pack?w=grading-sprint", { "x-forwarded-host": host });
    eq(host + " keeps path and query", [res.status, res.headers.get("location")], [308, "https://makersonmuse.com/pack?w=grading-sprint"]);
    res = await get("/api/health", { "x-forwarded-host": host });
    eq(host + " redirects the API too", [res.status, res.headers.get("location")], [308, "https://makersonmuse.com/api/health"]);
  }
  for (const host of ["makersonmuse.com", "makers-on-muse-git-phase1-hardening-cam.vercel.app", "makers-on-muse-abc123.vercel.app"]) {
    const res = await get("/pack", { "x-forwarded-host": host });
    eq(host + " is served, not redirected", res.status, 200);
  }
  const hostRules = (vj.redirects || []).filter((r) => r.has);
  eq("host redirects come first, and are permanent", vj.redirects.slice(0, hostRules.length).map((r) => [r.source, r.has[0].value, r.destination, r.permanent]), [
    ["/:path*", "www.makersonmuse.com", "https://makersonmuse.com/:path*", true],
    ["/:path*", "makers-on-muse.vercel.app", "https://makersonmuse.com/:path*", true]
  ]);

  /* ---------- 4. 404 ---------- */
  const nf = read("404.html");
  for (const path of ["/nope", "/a/b/c", "/pack.htm", "/assets/img/mabel-typing.webp"]) {
    const res = await get(path);
    const html = await body(res);
    t(path + " -> branded 404", res.status === 404 && html === nf, res.status);
  }
  t("404: says what happened, plainly", nf.includes("<h1>Page not found</h1>") && nf.includes("There is no page at this address."));
  t("404: noindex", noindex(nf));
  t("404: links the pack, the Playbook and home", nf.includes('href="/pack"') && nf.includes('href="/playbook"') && nf.includes('href="/"'));
  const rel = [...nf.matchAll(/\b(?:href|src)="([^"#]+)"/g)].map((m) => m[1]).filter((u) => !/^(\/|https:\/\/|mailto:)/.test(u));
  eq("404: every link and asset is root-absolute (it is served at any depth)", rel, []);
  t("main.js fetches Mabel by a root path", read("assets/js/main.js").includes('fetch("/assets/img/mabel-plush.svg"'));
  for (const path of ["/scripts/smoke.mjs", "/docs/watch-protocol.md", "/partials/nav.html", "/README.md", "/.github/ISSUE_TEMPLATE/config.yml",
    "/vercel.json", "/api/_lib.js", "/api/health.js", "/node_modules/@upstash/redis/package.json", "/.git/HEAD"]) {
    const res = await get(path);
    eq(path + " is not served", res.status, 404);
  }

  /* ---------- 5. robots and sitemap ---------- */
  {
    const res = await get("/robots.txt");
    const txt = await body(res);
    t("robots.txt served as text", res.status === 200 && /text\/plain/.test(res.headers.get("content-type")));
    eq("robots.txt", txt, "User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: https://makersonmuse.com/sitemap.xml\n");
    const sm = await get("/sitemap.xml");
    const xml = await body(sm);
    t("sitemap.xml served as XML", sm.status === 200 && /xml/.test(sm.headers.get("content-type")));
    eq("sitemap.xml is current (npm run build:layout)", xml, sitemap());
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const want = pages().filter((p) => !noindex(read(p))).map((p) => ORIGIN + pathFor(p));
    eq("sitemap: every indexable page, and only those", [...locs].sort(), [...want].sort());
    t("sitemap: home first", locs[0] === ORIGIN + "/");
    t("sitemap: leaves out 404 and receipt", !locs.some((u) => /\/(404|receipt)$/.test(u)));
    t("sitemap: no invented dates", !/lastmod/.test(xml));
    for (const u of locs) {
      const res = await get(u.slice(ORIGIN.length));
      t("sitemap URL is served as is: " + u, res.status === 200);
    }
    t("receipt stays noindex", noindex(read("receipt.html")));
    for (const [path, type] of [["/favicon.ico", "image/x-icon"], ["/assets/img/og.png", "image/png"], ["/assets/img/icon-32.png", "image/png"],
      ["/assets/img/apple-touch-icon.png", "image/png"], ["/assets/img/icon.svg", "image/svg+xml"]]) {
      const res = await get(path);
      t(path + " is served as " + type, res.status === 200 && res.headers.get("content-type") === type, [res.status, res.headers.get("content-type")]);
    }
    t("the share image template is repo-only", (await get("/scripts/og/og.html")).status === 404);
  }

  /* ---------- 6. the link check ---------- */
  {
    const res = checkSite();
    eq("link check: no broken site links", res.problems.map((p) => p.file + ":" + p.line + " " + p.url + " " + p.reason), []);
    t("link check: covers pages and scripts", res.checked > 300);
    const site = loadSite();
    t("catches a missing file", /not found/.test(checkRef(site, "/assets/img/mabel-typing.webp")));
    t("catches a .html link (a 308)", /redirects \(308\) to \/pack/.test(checkRef(site, "pack.html")));
    t("catches a missing id", /no id="nope"/.test(checkRef(site, "/pack#nope")));
    t("catches a repo-only file", /not found/.test(checkRef(site, "/scripts/smoke.mjs")));
    t("accepts a good id", checkRef(site, "/pack#l1") === null && checkRef(site, "#main", "/pack") === null);
    t("treats the apex as the site", /not found/.test(checkRef(site, "https://makersonmuse.com/nope")) && checkRef(site, "https://makersonmuse.com/pack") === null);
    t("outside links are set aside", checkRef(site, "https://www.meta.com/").external === "https://www.meta.com/");
    eq("reads literal links out of scripts", refs("js", `x = '<img src="/a.svg">' + '<a href="' + esc(u) + '">' ; fetch("/api/health", {}); new EventSource("/api/run-stream?x=" + id);`).map((r) => r.url), ["/a.svg", "/api/health"]);
    eq("skips inline script bodies and comments in pages", refs("html", '<!-- <a href="/x"> --><script>var a = \'<a href="/y">\';</script><a href="/z">').map((r) => r.url), ["/z"]);
  }

  /* ---------- 7. security headers ---------- */
  {
    const CSP_WANT = ["default-src 'self'", "script-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'",
      "frame-ancestors 'none'", "connect-src 'self'", "img-src 'self'"];
    for (const path of ["/", "/pack", "/submit", "/watch", "/receipt", "/nope", "/api/health", "/assets/js/main.js"]) {
      const res = await get(path);
      const csp = res.headers.get("content-security-policy") || "";
      const dirs = csp.split(";").map((d) => d.trim());
      for (const d of CSP_WANT) t(path + ": CSP has " + d, dirs.includes(d), csp);
      const script = dirs.find((d) => d.startsWith("script-src ")) || "";
      t(path + ": no inline or eval'd script allowed", !/unsafe-inline|unsafe-eval|data:|\*/.test(script));
      t(path + ": CSP names no other origin", !/https?:|\*/.test(csp), csp);
      eq(path + ": nosniff", res.headers.get("x-content-type-options"), "nosniff");
      eq(path + ": referrer policy", res.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
      eq(path + ": no framing (old browsers)", res.headers.get("x-frame-options"), "DENY");
      const pp = res.headers.get("permissions-policy") || "";
      t(path + ": permissions policy turns off camera, microphone, location", ["camera=()", "microphone=()", "geolocation=()"].every((x) => pp.includes(x)), pp);
      t(path + ": no feature Chrome rejects (interest-cohort)", !/interest-cohort/.test(pp));
    }
    const vj2 = JSON.parse(read("vercel.json"));
    const all = vj2.headers.find((h) => h.source === "/(.*)");
    t("the /(.*) rule sets no Cache-Control (functions set their own)", all && !all.headers.some((h) => /cache-control/i.test(h.key)));

    // CSP compatibility, statically: nothing inline that script-src 'self' blocks.
    const jsFiles = readdirSync(join(ROOT, "assets", "js")).filter((f) => f.endsWith(".js")).map((f) => "assets/js/" + f);
    for (const p of pages()) {
      const html = read(p);
      t(p + ": no inline <script>", !/<script(?![^>]*\bsrc=)[^>]*>/.test(html));
      t(p + ": no inline event handlers", !/<[a-z][^>]*\son[a-z]+=/i.test(html));
      t(p + ": no javascript: URLs", !/javascript:/i.test(html));
    }
    for (const f of jsFiles) {
      const js = read(f);
      t(f + ": builds no inline event handlers", !/\son[a-z]+=["']/i.test(js));
      t(f + ": no eval or new Function", !/\beval\(|new Function\(/.test(js));
    }
  }

  /* ---------- 8. caching and asset versions ---------- */
  {
    const cc = async (path) => (await get(path)).headers.get("cache-control") || "";
    const v = version("assets/css/main.css");
    eq("versioned CSS is cached for a year", await cc("/assets/css/main.css?v=" + v), "public, max-age=31536000, immutable");
    eq("versioned JS is cached for a year", await cc("/assets/js/main.js?v=" + version("assets/js/main.js")), "public, max-age=31536000, immutable");
    eq("images get a day", await cc("/assets/img/og.png"), "public, max-age=86400, stale-while-revalidate=604800");
    eq("favicon, robots and sitemap get a day", [await cc("/favicon.ico"), await cc("/robots.txt"), await cc("/sitemap.xml")],
      ["public, max-age=86400", "public, max-age=86400", "public, max-age=86400"]);
    for (const path of ["/", "/pack", "/nope", "/data/packs/s1w1.json", "/data/runs/index.json"]) {
      eq(path + " is revalidated every time (Vercel's default)", await cc(path), "public, max-age=0, must-revalidate");
    }
    for (const p of pages()) {
      const res = stampAssets(read(p));
      eq(p + ": every stylesheet and script is versioned and current (npm run build:assets)",
        res.refs.filter((r) => r.had !== r.want).map((r) => r.file), []);
      eq(p + ": no reference to a missing asset", res.missing, []);
      t(p + ": nothing loads css or js without the root path", !/(?:src|href)="(?!\/|https?:)[^"]*assets\/(?:css|js)\//.test(read(p)));
    }
    t("versions change with the content", stampAssets('<link href="/assets/css/main.css">', () => "abc").html === '<link href="/assets/css/main.css?v=abc">' &&
      stampAssets('<script src="/assets/js/main.js?v=old"></script>', () => "new").refs[0].had === "old");
    t("a version is 10 hex digits of the LF-normalized SHA-256", /^[0-9a-f]{10}$/.test(v));
    for (const f of readdirSync(join(ROOT, "assets", "js")).filter((x) => x.endsWith(".js"))) {
      t("assets/js/" + f + ": loads no stylesheet or script by URL (it would carry no version)", !/["']\/?assets\/(?:css|js)\//.test(read("assets/js/" + f)));
    }
  }

  /* ---------- the API runs behind the router ---------- */
  {
    const res = await get("/api/health");
    const j = JSON.parse(await body(res));
    eq("/api/health without storage", [res.status, j.ok, j.storage], [200, true, "missing"]);
    t("/api/health keeps its own edge cache header", /s-maxage=30/.test(res.headers.get("cache-control") || ""), res.headers.get("cache-control"));
    eq("/api/nope is a 404", (await get("/api/nope")).status, 404);
  }
} finally {
  await srv.close();
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
