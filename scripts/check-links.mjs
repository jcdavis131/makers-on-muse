/* Link check. Every link and asset reference in the pages and in the
   scripts under assets/js must reach something the site serves, at its
   final address, and every #fragment must name an id on the target page.

     node scripts/check-links.mjs              site links only (CI runs this)
     node scripts/check-links.mjs --external   also GET every outside link

   Site links are resolved offline with the router in scripts/serve.mjs,
   which applies vercel.json (clean URLs, redirects, .vercelignore), so
   a link to pack.html (a 308 to /pack) or to a file that isn't deployed
   fails here. https://makersonmuse.com/... counts as a site link.

   Outside links are optional because sites like meta.com often refuse
   automated requests: only 404, 410 and DNS failures count as broken;
   401, 403, 429 and 5xx are listed as "not verified". Exit 1 on any
   broken link. */
import { readFileSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, loadSite, route } from "./serve.mjs";

export const ORIGIN = "https://makersonmuse.com";

const read = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const decodeAttr = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/* The page-level HTML without comments and inline script bodies. */
function stripHtml(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/g, "$1$2");
}

/* refs(kind, text) -> [{ url, line }] */
export function refs(kind, text) {
  const out = [];
  const lineOf = (i) => text.slice(0, i).split("\n").length;
  if (kind === "html") {
    const body = stripHtml(text);
    const lines = (i) => body.slice(0, i).split("\n").length;
    for (const m of body.matchAll(/<(?:a|link|script|img|source|iframe|area)\b[^>]*?\s(?:href|src)="([^"]*)"/g)) {
      out.push({ url: decodeAttr(m[1]), line: lines(m.index) });
    }
    for (const m of body.matchAll(/<meta\b[^>]*\bcontent="(https:\/\/makersonmuse\.com[^"]*)"/g)) {
      out.push({ url: decodeAttr(m[1]), line: lines(m.index) });
    }
    return out;
  }
  // Scripts: complete literal href/src attributes inside strings, and
  // fetch/EventSource calls with a literal site path.
  for (const m of text.matchAll(/\b(?:href|src)="([^"'+\s]*)"/g)) out.push({ url: m[1], line: lineOf(m.index) });
  for (const m of text.matchAll(/\b(?:fetch|EventSource)\(\s*"(\/[^"]*)"\s*[,)]/g)) out.push({ url: m[1], line: lineOf(m.index) });
  return out;
}

const idCache = new Map();
function idsOf(file) {
  if (!idCache.has(file)) {
    const html = readFileSync(file, "utf8");
    idCache.set(file, new Set([...html.matchAll(/\b(?:id|name)="([^"]+)"/g)].map((m) => m[1])));
  }
  return idCache.get(file);
}

/* checkRef(site, url, basePath) -> null when fine, else a reason.
   Outside links return { external: url }. */
export function checkRef(site, url, basePath = "/") {
  if (!url || /^(mailto:|tel:|javascript:|data:|blob:)/i.test(url)) return null;
  if (url.startsWith(ORIGIN + "/") || url === ORIGIN) url = url.slice(ORIGIN.length) || "/";
  if (/^(https?:)?\/\//i.test(url)) return { external: url };
  const u = new URL(url, "http://site" + basePath);
  if (url.startsWith("#") && u.hash.length <= 1) return null;
  const r = route(site, { url: u.pathname + u.search });
  if (r.location) return "redirects (" + r.status + ") to " + r.location + "; link the final address";
  if (r.status !== 200) return "not found (404)";
  if (u.hash.length > 1 && r.file && extname(r.file) === ".html") {
    const id = decodeURIComponent(u.hash.slice(1));
    if (!idsOf(r.file).has(id)) return "no id=\"" + id + "\" on " + u.pathname;
  }
  return null;
}

/* The files to check: the root pages and the site's own scripts. */
export function sources(site) {
  const pages = readdirSync(ROOT).filter((f) => f.endsWith(".html") && site.isFile(f)).sort();
  const scripts = readdirSync(join(ROOT, "assets", "js")).filter((f) => f.endsWith(".js")).sort().map((f) => "assets/js/" + f);
  return pages.map((f) => ({ file: f, kind: "html" })).concat(scripts.map((f) => ({ file: f, kind: "js" })));
}

export function pagePath(file) {
  return file === "index.html" ? "/" : "/" + file.replace(/\.html$/, "");
}

/* checkSite() -> { problems: [{file, line, url, reason}], external: Map(url -> [where]) , checked } */
export function checkSite(site = loadSite()) {
  const problems = [];
  const external = new Map();
  let checked = 0;
  const all = sources(site);
  // A script's links resolve against each page that loads it.
  const loaders = (js) => all.filter((s) => s.kind === "html" &&
    (read(s.file).includes('<script src="/' + js + '"') || read(s.file).includes('<script src="/' + js + "?")))
    .map((s) => pagePath(s.file));
  for (const { file, kind } of all) {
    const bases = kind === "html" ? [pagePath(file)] : (loaders(file).length ? loaders(file) : ["/"]);
    for (const { url, line } of refs(kind, read(file))) {
      checked++;
      let res = null;
      for (const base of bases) { res = checkRef(site, url, base); if (res) break; }
      if (!res) continue;
      if (res.external) {
        if (!external.has(res.external)) external.set(res.external, []);
        external.get(res.external).push(file + ":" + line);
      } else {
        problems.push({ file, line, url, reason: res });
      }
    }
  }
  return { problems, external, checked };
}

async function checkExternal(external) {
  const broken = [], unverified = [];
  const urls = [...external.keys()];
  let next = 0;
  async function worker() {
    while (next < urls.length) {
      const url = urls[next++];
      let status = 0, err = "";
      try {
        const res = await fetch(url, {
          method: "GET", redirect: "follow", signal: AbortSignal.timeout(15000),
          headers: { "user-agent": "makers-on-muse link check (+https://github.com/jcdavis131/makers-on-muse)" }
        });
        status = res.status;
        try { await res.body?.cancel(); } catch { /* ignore */ }
      } catch (e) { err = (e && (e.cause && e.cause.code)) || (e && e.name) || String(e); }
      if (status === 404 || status === 410 || err === "ENOTFOUND") broken.push({ url, why: status || err });
      else if (!status || status >= 400) unverified.push({ url, why: status || err });
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  return { broken, unverified };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { problems, external, checked } = checkSite();
  for (const p of problems) console.error("BROKEN " + p.file + ":" + p.line + "  " + p.url + "  " + p.reason);
  let failed = problems.length;
  console.log(checked + " references checked, " + problems.length + " broken site links, " + external.size + " outside links");
  if (process.argv.includes("--external")) {
    const { broken, unverified } = await checkExternal(external);
    for (const b of broken) console.error("BROKEN " + b.url + "  " + b.why + "  (" + external.get(b.url).join(", ") + ")");
    for (const u of unverified) console.log("not verified " + u.url + "  " + u.why);
    console.log(broken.length + " broken outside links, " + unverified.length + " not verified");
    failed += broken.length;
  }
  process.exit(failed ? 1 : 0);
}
