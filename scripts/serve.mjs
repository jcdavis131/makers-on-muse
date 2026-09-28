/* A local stand-in for Vercel's router, so the site can be checked the
   way it is served: clean URLs, redirects (including the ones keyed on
   the Host header), the headers from vercel.json, .vercelignore'd paths
   answering 404, the branded 404.html, and the functions in api/.

     node scripts/serve.mjs [--port 8080] [--no-api]
     (npm run serve)

   It emulates only the parts of vercel.json this site uses, and it
   throws on anything else in there (another "has" type, path-to-regexp
   modifiers it doesn't know), so a config change can't pass here by
   accident. It is not Vercel. After a deploy, scripts/check-deploy.mjs
   checks the real thing.

   Order, as on Vercel: redirects, then trailing slash and clean-URL
   redirects, then functions, then files, then 404.html. Headers from
   vercel.json apply to every response whose path matches.

   The API runs the real handlers. With no storage env vars set,
   /api/health reports storage "missing" and writes answer 503, as on a
   deploy without Upstash. Tests point the env at scripts/redis-emu.mjs
   to get "reachable". */
import http from "node:http";
import { readFileSync, statSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

export const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".webmanifest": "application/manifest+json"
};

/* ---------- path patterns (the path-to-regexp subset vercel.json uses) ---------- */

/* compileSource("/assets/(css|js)/(.*)") -> { re, names }
   Supports literal text, ":name" (one segment), ":name*" (any rest,
   including nothing) and "( ... )" groups copied as regex. */
export function compileSource(source) {
  let re = "^";
  const names = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === "(") {
      let depth = 0, j = i;
      for (; j < source.length; j++) {
        if (source[j] === "\\") { j++; continue; }
        if (source[j] === "(") depth++;
        else if (source[j] === ")" && --depth === 0) break;
      }
      if (depth !== 0) throw new Error("unbalanced group in " + source);
      re += source.slice(i, j + 1);
      names.push(String(names.length));
      i = j + 1;
    } else if (c === ":") {
      const m = /^:([A-Za-z_]\w*)(\*)?/.exec(source.slice(i));
      if (!m) throw new Error("bad parameter in " + source);
      if (source[i + m[0].length] === "(") throw new Error("parameter patterns are not emulated: " + source);
      re += m[2] ? "(.*)" : "([^/]+)";
      names.push(m[1]);
      i += m[0].length;
    } else if (c === "?" || c === "+" || c === "*") {
      throw new Error("modifier " + c + " is not emulated: " + source);
    } else {
      re += c.replace(/[.\\^$|{}[\]]/g, "\\$&");
      i++;
    }
  }
  return { re: new RegExp(re + "$"), names };
}

export function matchSource(source, pathname) {
  const { re, names } = compileSource(source);
  const m = re.exec(pathname);
  if (!m) return null;
  const params = {};
  names.forEach((n, k) => { params[n] = m[k + 1] === undefined ? "" : m[k + 1]; });
  return params;
}

function hasMatches(has, host) {
  for (const h of has || []) {
    if (h.type !== "host" || typeof h.value !== "string") {
      throw new Error("only {type:'host', value:'<string>'} conditions are emulated, got " + JSON.stringify(h));
    }
    if (String(host).toLowerCase().split(":")[0] !== h.value.toLowerCase()) return false;
  }
  return true;
}

function fillDestination(dest, params) {
  return dest.replace(/:([A-Za-z_]\w*)\*?/g, (all, name) => (name in params ? params[name] : all));
}

/* ---------- .vercelignore ---------- */

/* ignoreMatcher(text) -> (relPath) => true when the path isn't deployed.
   gitignore-style: "/x" anchors at the root, "x/" means a directory,
   "*" and "**" globs; a pattern without a slash matches at any depth.
   Negation ("!") is not emulated and throws. */
export function ignoreMatcher(text) {
  const rules = [];
  for (let line of String(text).split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("!")) throw new Error(".vercelignore negation is not emulated: " + line);
    const anchored = line.startsWith("/");
    const dirOnly = line.endsWith("/");
    const body = line.replace(/^\//, "").replace(/\/$/, "");
    let glob = "";
    for (let i = 0; i < body.length; i++) {
      if (body.startsWith("**/", i)) { glob += "(?:.*/)?"; i += 2; }
      else if (body.startsWith("**", i)) { glob += ".*"; i += 1; }
      else if (body[i] === "*") glob += "[^/]*";
      else if (body[i] === "?") glob += "[^/]";
      else glob += body[i].replace(/[.\\^$|{}()[\]+]/g, "\\$&");
    }
    const prefix = anchored || body.includes("/") ? "^" : "^(?:.*/)?";
    rules.push(new RegExp(prefix + glob + (dirOnly ? "/.+$" : "(?:/.+)?$")));
  }
  return (rel) => rules.some((r) => r.test(rel));
}

/* Never deployed or never served as a file, whatever .vercelignore says. */
const ALWAYS_HIDDEN = [/^\.git(\/|$)/, /^\.vercel(\/|$)/, /^node_modules(\/|$)/, /(^|\/)\.env/, /^api\//, /^vercel\.json$/, /^\.vercelignore$/];

/* ---------- the site ---------- */

export function loadSite(root = ROOT) {
  const config = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
  let ignoreText = "";
  try { ignoreText = readFileSync(join(root, ".vercelignore"), "utf8"); } catch { /* none */ }
  const ignored = ignoreMatcher(ignoreText);
  // Compile every pattern now, so an unsupported one fails at load.
  for (const r of config.redirects || []) { compileSource(r.source); hasMatches(r.has, ""); }
  for (const h of config.headers || []) { compileSource(h.source); hasMatches(h.has, ""); }
  if (config.rewrites && config.rewrites.length) throw new Error("rewrites are not emulated; use cleanUrls");
  const isFile = (rel) => {
    if (!rel || rel.split("/").some((s) => s === ".." || s === "")) return false;
    if (ALWAYS_HIDDEN.some((r) => r.test(rel)) || ignored(rel)) return false;
    try { return statSync(join(root, rel)).isFile(); } catch { return false; }
  };
  return { root, config, ignored, isFile };
}

/* headersFor(site, pathname, host) -> { name: value } from vercel.json. */
export function headersFor(site, pathname, host) {
  const out = {};
  for (const rule of site.config.headers || []) {
    if (!matchSource(rule.source, pathname) || !hasMatches(rule.has, host)) continue;
    for (const { key, value } of rule.headers) out[key] = value;
  }
  return out;
}

/* route(site, { url, host }) -> one of
     { status: 301|302|307|308, location }
     { status: 200, file }         a static file (absolute path)
     { status: 200, api: name }    api/<name>.js
     { status: 404, file }         404.html (file null when missing) */
export function route(site, { url, host = "localhost" }) {
  const u = new URL(url, "http://local");
  let pathname;
  try { pathname = decodeURIComponent(u.pathname); } catch { pathname = u.pathname; }
  const cfg = site.config;
  const redirect = (status, location) => ({ status, location });

  for (const r of cfg.redirects || []) {
    const params = matchSource(r.source, pathname);
    if (!params || !hasMatches(r.has, host)) continue;
    let dest = fillDestination(r.destination, params);
    if (u.search && !dest.includes("?")) dest += u.search;
    const status = r.statusCode || (r.permanent === false ? 307 : 308);
    return redirect(status, dest);
  }
  if (cfg.trailingSlash === false && pathname.length > 1 && pathname.endsWith("/")) {
    return redirect(308, pathname.replace(/\/+$/, "") + u.search);
  }
  if (cfg.cleanUrls && pathname.endsWith(".html") && site.isFile(pathname.slice(1))) {
    const clean = pathname.slice(0, -5).replace(/\/index$/, "") || "/";
    return redirect(308, clean + u.search);
  }
  if (pathname.startsWith("/api/")) {
    const name = pathname.slice(5);
    if (/^[a-z0-9-]+$/.test(name)) {
      try {
        if (statSync(join(site.root, "api", name + ".js")).isFile()) return { status: 200, api: name };
      } catch { /* no such function */ }
    }
  } else {
    const rel = pathname === "/" ? "index.html" : pathname.slice(1);
    if (site.isFile(rel)) return { status: 200, file: join(site.root, rel) };
    if (cfg.cleanUrls && site.isFile(rel + ".html")) return { status: 200, file: join(site.root, rel + ".html") };
  }
  return { status: 404, file: site.isFile("404.html") ? join(site.root, "404.html") : null };
}

/* ---------- the server ---------- */

export function createServer({ root = ROOT, api = true } = {}) {
  const site = loadSite(root);
  return http.createServer(async (req, res) => {
    const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
    const u = new URL(req.url, "http://local");
    let pathname;
    try { pathname = decodeURIComponent(u.pathname); } catch { pathname = u.pathname; }
    const extra = headersFor(site, pathname, host);
    let r;
    try { r = route(site, { url: req.url, host }); } catch (e) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("serve.mjs: " + e.message);
      return;
    }
    for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);

    if (r.location) {
      res.writeHead(r.status, { Location: r.location, "Content-Type": "text/plain; charset=utf-8" });
      res.end("Redirecting to " + r.location);
      return;
    }
    if (r.api) {
      if (!api) {
        res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
        res.end('{"error":"api disabled (--no-api)"}');
        return;
      }
      req.query = Object.fromEntries(u.searchParams);
      try {
        const handler = require(join(root, "api", r.api + ".js"));
        await handler(req, res);
      } catch (e) {
        if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("function error: " + (e && e.message));
      }
      return;
    }
    if (!r.file) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("NOT_FOUND");
      return;
    }
    const body = readFileSync(r.file);
    if (!res.hasHeader("Cache-Control")) res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    res.writeHead(r.status, { "Content-Type": TYPES[extname(r.file)] || "application/octet-stream", "Content-Length": body.length });
    res.end(req.method === "HEAD" ? undefined : body);
  });
}

/* start({ port, api }) -> { url, server, close() }. Port 0 picks a free one. */
export async function start({ port = 0, api = true, root = ROOT, host = "127.0.0.1" } = {}) {
  const server = createServer({ root, api });
  await new Promise((resolve) => server.listen(port, host, resolve));
  const url = "http://" + host + ":" + server.address().port;
  return { url, server, close: () => new Promise((resolve) => server.close(resolve)) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const pi = args.indexOf("--port");
  const port = pi > -1 ? Number(args[pi + 1]) : 8080;
  const s = await start({ port, api: !args.includes("--no-api") });
  console.log("Serving " + ROOT + " at " + s.url + " (vercel.json emulated; Ctrl+C to stop)");
}
