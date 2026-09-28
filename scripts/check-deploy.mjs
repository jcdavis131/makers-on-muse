/* Post-deploy check. GETs a deployed site and fails unless it is up and
   configured the way vercel.json says, and unless /api/health reports
   storage "reachable". GET only: it never writes anything.

     node scripts/check-deploy.mjs [base] [--no-hosts] [--allow-missing-storage]
                                                            (npm run check:deploy)

   base defaults to https://makersonmuse.com. --no-hosts skips the
   www and vercel.app redirect checks (use it for a preview URL).

   Until Upstash is connected this fails on purpose, on the storage line:
   /api/health says "missing" and every submission gets a 503. The other
   lines still show whether the rest of the deploy is right.
   --allow-missing-storage turns storage "missing" (not configured) into
   a note, so the rest of the deploy can gate on its own. "unreachable"
   (configured, but down) still fails. The post-deploy workflow
   (.github/workflows/post-deploy.yml) passes it until the repo variable
   MOM_STORAGE_CONNECTED is "true".

   Required: storage reachable; the home page, a clean URL and its .html
   308; the branded 404; the security headers on the home page;
   robots.txt, sitemap.xml, the favicon and the share image; a versioned
   stylesheet with its one-year cache; repo-only files not served; www
   and makers-on-muse.vercel.app 308 to the apex with the path.
   Reported as notes, never failures (so none can hide the storage line):
   whether the health check is cached at the edge, the security headers
   on the 404, and whether the host redirects keep the query string.
   Exit 0 only when every required check passes. */
import { pathToFileURL } from "node:url";
import { checkHealth } from "./check-health.mjs";

export const APEX = "https://makersonmuse.com";
export const HOSTS = [
  { name: "www.makersonmuse.com", url: "https://www.makersonmuse.com" },
  { name: "makers-on-muse.vercel.app", url: "https://makers-on-muse.vercel.app" }
];

/* checkDeploy(base, { hosts, timeoutMs }) -> { ok, results: [{ name, ok, detail, required }] }
   hosts: [{ name, url, headers }] to check for a 308 to the apex; [] skips. */
export async function checkDeploy(base, { hosts = HOSTS, timeoutMs = 10000, allowMissingStorage = false } = {}) {
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
  add("/api/health: storage reachable", h.ok, h.detail, !(allowMissingStorage && h.storage === "missing"));
  // Edge caching. Vercel's CDN keeps s-maxage to itself and sends the
  // browser its own Cache-Control, so on Vercel the sign is x-vercel-cache
  // HIT or STALE on a repeat request; elsewhere, s-maxage in the header.
  // A note, not a failure: it must never hide the storage line.
  await get("/api/health");
  const hr = await get("/api/health");
  const edge = (hr.headers.get("x-vercel-cache") || "").toUpperCase();
  add("/api/health: cached at the edge", /^(HIT|STALE)$/.test(edge) || /s-maxage=\d+/.test(hr.headers.get("cache-control") || ""),
    "x-vercel-cache: " + (edge || "(none)") + ", cache-control: " + (hr.headers.get("cache-control") || got(hr)), false);

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

  // Security headers: required on a page, a note on the 404 (the local
  // emulator assumes Vercel adds them to its 404.html fallback too).
  for (const [label, r, required] of [["/", home, true], ["the 404", nope, false]]) {
    const csp = r.headers.get("content-security-policy") || "";
    add(label + ": CSP allows scripts from this site only", /(^|;)\s*script-src 'self'\s*(;|$)/.test(csp), csp || got(r), required);
    add(label + ": CSP forbids framing", /frame-ancestors 'none'/.test(csp) && r.headers.get("x-frame-options") === "DENY",
      "x-frame-options: " + r.headers.get("x-frame-options"), required);
    add(label + ": nosniff, referrer and permissions policies",
      r.headers.get("x-content-type-options") === "nosniff" &&
      r.headers.get("referrer-policy") === "strict-origin-when-cross-origin" &&
      /camera=\(\)/.test(r.headers.get("permissions-policy") || ""),
      [r.headers.get("x-content-type-options"), r.headers.get("referrer-policy"), r.headers.get("permissions-policy")].join(" | "), required);
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
  // Vercel's clean-URL rule answers any .html address with a 308 to the
  // address without it, whether or not the file is deployed, so follow
  // same-site redirects (up to 3) and require a 404 at the end.
  const origin = new URL(base).origin;
  for (const path of ["/scripts/check-deploy.mjs", "/README.md", "/partials/nav.html", "/docs/watch-protocol.md"]) {
    let r = await get(path);
    const hops = [];
    while ([301, 302, 307, 308].includes(r.status) && hops.length < 3) {
      let next;
      try { next = new URL(r.headers.get("location") || "", origin + path); } catch { break; }
      if (next.origin !== origin) break;
      hops.push(r.status + " " + next.pathname);
      r = await get(next.pathname + next.search);
    }
    add(path + " is not served", r.status === 404, hops.concat([got(r)]).join(" -> "));
  }
  // The Watch archive is data the page needs.
  const runs = await get("/data/runs/index.json");
  add("/data/runs/index.json is served (Watch's archive)", runs.status === 200 && /"runs"/.test(runs.text), got(runs));

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
  const { ok, results } = await checkDeploy(base, {
    hosts: args.includes("--no-hosts") ? [] : HOSTS,
    allowMissingStorage: args.includes("--allow-missing-storage")
  });
  for (const r of results) console.log((r.ok ? "OK   " : r.required ? "FAIL " : "NOTE ") + r.name + (r.ok ? "" : ": " + r.detail));
  console.log(ok ? "\nDeploy check passed: " + base : "\nDeploy check FAILED: " + base);
  process.exit(ok ? 0 : 1);
}
