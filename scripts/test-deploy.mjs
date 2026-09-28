/* The post-deploy check, run against local servers. Run:
   node scripts/test-deploy.mjs (or npm test). Nothing leaves this machine.
   1. The repo served by scripts/serve.mjs with no storage: every check
      passes except storage, so the run fails, as a real deploy does
      until Upstash is connected.
   2. The same, with storage (scripts/redis-emu.mjs): the run passes.
   3. A server that gets everything wrong: the run fails on each part.
   Exits non-zero on any failure. */
import http from "node:http";
import { createRequire } from "node:module";
import { start } from "./serve.mjs";
import { checkDeploy } from "./check-deploy.mjs";
import { createEmulator, serveUpstash } from "./redis-emu.mjs";

const require = createRequire(import.meta.url);
for (const k of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN"]) delete process.env[k];

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) pass++;
  else { fail++; console.error("FAIL:", name, extra === undefined ? "" : JSON.stringify(extra).slice(0, 600)); }
}
const failed = (res) => res.results.filter((r) => !r.ok).map((r) => r.name);

const srv = await start({ api: true });
const localHosts = [
  { name: "www.makersonmuse.com", url: srv.url, headers: { "x-forwarded-host": "www.makersonmuse.com" } },
  { name: "makers-on-muse.vercel.app", url: srv.url, headers: { "x-forwarded-host": "makers-on-muse.vercel.app" } }
];
let upstash = null;
try {
  /* 1. no storage */
  let res = await checkDeploy(srv.url, { hosts: localHosts });
  t("without storage the check fails", res.ok === false);
  t("and storage is the only failure", JSON.stringify(failed(res)) === JSON.stringify(["/api/health: storage reachable"]), failed(res));
  t("it says storage is missing", /missing/.test(res.results[0].detail), res.results[0]);
  t("it checks enough to matter", res.results.length >= 20, res.results.length);
  t("the host redirect keeps the query here", res.results.filter((r) => /keeps the query string/.test(r.name)).every((r) => r.ok));

  /* 2. storage connected */
  const emu = createEmulator();
  upstash = await serveUpstash(emu);
  process.env.KV_REST_API_URL = upstash.url;
  process.env.KV_REST_API_TOKEN = upstash.token;
  require("../api/_lib.js").resetStore();
  res = await checkDeploy(srv.url, { hosts: localHosts });
  t("with storage reachable the check passes", res.ok === true, failed(res));
  t("and storage is the first line", res.results[0].name === "/api/health: storage reachable" && res.results[0].ok);
  const cmds = [...new Set(emu.log.map((c) => String(c).toUpperCase()))];
  t("it only pinged storage, nothing written (" + cmds.join(",") + ")", cmds.length > 0 && cmds.every((c) => c === "PING"), cmds);
} finally {
  await srv.close();
  if (upstash) await upstash.close();
}

/* 3. a server that gets everything wrong */
{
  const bad = http.createServer((req, res) => {
    if (req.url.startsWith("/api/health")) { res.writeHead(200, { "content-type": "application/json" }); res.end('{"ok":true,"storage":"reachable"}'); return; }
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<title>Something else</title>");
  });
  await new Promise((r) => bad.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + bad.address().port;
  const res = await checkDeploy(base, { hosts: [{ name: "www", url: base, headers: {} }] });
  const f = failed(res);
  t("a wrong deploy fails", res.ok === false);
  for (const want of ["/api/health: cached at the edge (s-maxage)", "/ serves the home page", "/pack.html 308s to /pack",
    "an unknown address gets the branded 404", "/: CSP allows scripts from this site only", "/: CSP forbids framing",
    "/robots.txt names the sitemap", "/scripts/check-deploy.mjs is not served", "www 308s to the apex, path kept"]) {
    t("it catches: " + want, f.includes(want), f);
  }
  t("storage alone doesn't make it pass", res.results[0].ok === true && res.ok === false);
  await new Promise((r) => bad.close(r));
}

/* 4. an unreachable site */
{
  const res = await checkDeploy("http://127.0.0.1:9", { hosts: [], timeoutMs: 2000 });
  t("an unreachable site fails, it doesn't throw", res.ok === false && /request failed/.test(res.results[0].detail), res.results[0]);
}

/* 5. CI runs the tests and the link check; npm scripts exist */
{
  const { readFileSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
  const ci = readFileSync(join(ROOT, ".github", "workflows", "ci.yml"), "utf8");
  t("CI: on push and pull request", /^on:\n  push:/m.test(ci) && /^  pull_request:/m.test(ci));
  t("CI: read-only token, no secrets", /^permissions:\n  contents: read/m.test(ci) && !/secrets\./.test(ci));
  t("CI: installs from the lockfile, runs npm test, then the link check",
    ci.indexOf("run: npm ci") > -1 && ci.indexOf("run: npm ci") < ci.indexOf("run: npm test") && ci.indexOf("run: npm test") < ci.indexOf("run: npm run check:links"));
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  for (const s of ["test", "check:links", "check:deploy", "check:health", "serve", "build"]) t("npm script: " + s, typeof pkg.scripts[s] === "string");
  const every = readFileSync(join(ROOT, "scripts", "check-deploy.mjs"), "utf8");
  t("check-deploy only GETs", !/method:\s*"(POST|PUT|PATCH|DELETE)"/.test(every) && /method: "GET"/.test(every));
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
