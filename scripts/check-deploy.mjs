/* Post-deploy check. GETs a deployed site and fails unless it is up and
   configured the way vercel.json says, and unless /api/health reports
   storage "reachable". GET only: it never writes anything.

     node scripts/check-deploy.mjs [base] [--no-hosts]     (npm run check:deploy)

   base defaults to https://makersonmuse.com. --no-hosts skips the
   www and vercel.app redirect checks (use it for a preview URL).

   Until Upstash is connected this fails on purpose, on the storage line:
   /api/health says "missing" and every submission gets a 503. The other
   lines still show whether the rest of the deploy is right.

   Checks: storage reachable and the health check cached at the edge;
   the home page, a clean URL and its .html 308; the branded 404; the
   security headers; robots.txt, sitemap.xml, the favicon and the share
   image; a versioned stylesheet with its one-year cache; repo-only files
   not served; www and makers-on-muse.vercel.app 308 to the apex with the
   path. Whether the query string survives that redirect is reported but
   doesn't fail the run. Exit 0 only when every required check passes. */
import { pathToFileURL } from "node:url";
import { checkHealth } from "./check-health.mjs";

export const APEX = "https://makersonmuse.com";
export const HOSTS = [
  { name: "www.makersonmuse.com", url: "https://www.makersonmuse.com" },
  { name: "makers-on-muse.vercel.app", url: "https://makers-on-muse.vercel.app" }
];

/* checkDeploy(base, { hosts, timeoutMs }) -> { ok, results: [{ name, ok, detail, required }] }
   hosts: [{ name, url, headers }] to check for a 308 to the apex; [] skips. */
export async function checkDeploy(base, { hosts = HOSTS, timeoutMs = 10000 } = {}) {
  base = String(base).replace(/\/+$/, "");
  const results = [];
  const add = (name, ok, detail, required = true) => results.push({ name, ok: Boolean(ok), detail: detail || "", required });
  const get = async (path, headers = {}, root = base) => {
    try {
      const res = await fetch(root + path, { method: "GET", redirect: "manual", headers, signal: AbortSignal.timeout(timeoutMs) });
      let text = "";
      try { text = await res.text(); } catch { /* binary or cut off */ }
      return { status: res.status, headers: res.headers, text };
    } catch (e) {
      return { status: 0, headers: new Headers(), text: "", error: (e && e.message) || String(e) };
    }
  };
  const got = (r) => (r.error ? "request failed: " + r.error : "HTTP " + r.status);

  // Storage, the reason this script exists.
  const h = await checkHealth(base, { timeoutMs });
  add("/api/health: storage reachable", h.ok, h.detail);
  const hr = await get("/api/health");
  add("/api/health: cached at the edge (s-maxage)", /s-maxage=\d+/.test(hr.headers.get("cache-control") || ""), hr.headers.get("cache-control") || got(hr));

  // Pages and clean URLs.
  const home = await get("/");
  add("/ serves the home page", home.status === 200 && /<title>Makers on Muse/.test(home.text), got(home));
  const pack = await get("/pack");
  add("/pack serves the pack (clean URL)", pack.status === 200 && /text\/html/.test(pack.headers.get("content-type") || ""), got(pack));
  const packHtml = await get("/pack.html");
  add("/pack.html 308s to /pack", packHtml.status === 308 && (packHtml.headers.get("location") || "").replace(base, "") === "/pack",
    got(packHtml) + " -> " + packHtml.headers.get("location"));
  const nope = await get("/nope-" + Date.now().toString(36));
  add("an unknown address gets the branded 404", nope.status === 404 && nope.text.includes("Page not found"), got(nope));

  // Security headers, on a page and on the 404.
  for (const [label, r] of [["/", home], ["the 404", nope]]) {
    const csp = r.headers.get("content-security-policy") || "";
    add(label + ": CSP allows scripts from this site only", /(^|;)\s*script-src 'self'\s*(;|$)/.test(csp), csp || got(r));
    add(label + ": CSP forbids framing", /frame-ancestors 'none'/.test(csp) && r.headers.get("x-frame-options") === "DENY",
      "x-frame-options: " + r.headers.get("x-frame-options"));
    add(label + ": nosniff, referrer and permissions policies",
      r.headers.get("x-content-type-options") === "nosniff" &&
      r.headers.get("referrer-policy") === "strict-origin-when-cross-origin" &&
      /camera=\(\)/.test(r.headers.get("permissions-policy") || ""),
      [r.headers.get("x-content-type-options"), r.headers.get("referrer-policy"), r.headers.get("permissions-policy")].join(" | "));
  }

  // Discovery files and images.
  const robots = await get("/robots.txt");
  add("/robots.txt names the sitemap", robots.status === 200 && robots.text.includes("Sitemap: " + APEX + "/sitemap.xml"), got(robots));
  const sm = await get("/sitemap.xml");
  add("/sitemap.xml lists the home page", sm.status === 200 && sm.text.includes("<loc>" + APEX + "/</loc>"), got(sm));
  const ico = await get("/favicon.ico");
  add("/favicon.ico", ico.status === 200, got(ico));
  const og = await get("/assets/img/og.png");
  add("the share image", og.status === 200 && /image\/png/.test(og.headers.get("content-type") || ""), got(og));

  // A versioned stylesheet, as the home page links it.
  const css = (/href="(\/assets\/css\/main\.css\?v=[0-9a-f]+)"/.exec(home.text) || [])[1];
  if (css) {
    const c = await get(css);
    add("versioned CSS is cached for a year", c.status === 200 && /max-age=31536000/.test(c.headers.get("cache-control") || "") &&
      /immutable/.test(c.headers.get("cache-control") || ""), css + ": " + (c.headers.get("cache-control") || got(c)));
  } else {
    add("the home page links a versioned stylesheet", false, "no /assets/css/main.css?v=... on /");
  }

  // Repo-only files stay off the site.
  for (const path of ["/scripts/check-deploy.mjs", "/README.md", "/partials/nav.html"]) {
    const r = await get(path);
    add(path + " is not served", r.status === 404, got(r));
  }

  // Other hostnames 308 to the apex.
  for (const host of hosts) {
    const r = await get("/pack?check=1", host.headers || {}, host.url.replace(/\/+$/, ""));
    const loc = r.headers.get("location") || "";
    add(host.name + " 308s to the apex, path kept", r.status === 308 && loc.startsWith(APEX + "/pack"), got(r) + " -> " + (loc || "(no location)"));
    add(host.name + " keeps the query string", loc === APEX + "/pack?check=1", loc || "(no location)", false);
  }

  return { ok: results.every((r) => r.ok || !r.required), results };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const base = args.find((a) => !a.startsWith("--")) || APEX;
  const { ok, results } = await checkDeploy(base, { hosts: args.includes("--no-hosts") ? [] : HOSTS });
  for (const r of results) console.log((r.ok ? "OK   " : r.required ? "FAIL " : "NOTE ") + r.name + (r.ok ? "" : ": " + r.detail));
  console.log(ok ? "\nDeploy check passed: " + base : "\nDeploy check FAILED: " + base);
  process.exit(ok ? 0 : 1);
}
