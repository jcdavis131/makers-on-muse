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
  t("and storage is the first line", res.results[0].name === "/api/health: storage reachable" && res.results[0].ok && res.results[0].required);
  const notes = res.results.filter((r) => !r.required).map((r) => r.name);
  t("only platform-dependent lines are notes, so none can fail the run", JSON.stringify(notes) === JSON.stringify([
    "/api/health: cached at the edge", "the 404: CSP allows scripts from this site only", "the 404: CSP forbids framing",
    "the 404: nosniff, referrer and permissions policies", "www.makersonmuse.com keeps the query string", "makers-on-muse.vercel.app keeps the query string"]), notes);
  const cmds = [...new Set(emu.log.map((c) => String(c).toUpperCase()))];
  // /api/health runs the per-IP rate limiter (its Lua script, EVALSHA or
  // EVAL, which keeps a counter that expires in about 2 minutes) and one PING.
  t("it only pinged storage, nothing written but the rate limiter's counter (" + cmds.join(",") + ")",
    cmds.includes("PING") && cmds.every((c) => c === "PING" || c === "EVAL" || c === "EVALSHA"), cmds);
  const stored = emu.keys().map((k) => k.key);
  t("the only keys left are rate-limit counters, each with a TTL", stored.every((k) => k.startsWith("mom:rl:health:")) &&
    emu.keys().every((k) => k.exp !== null), emu.keys());
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
  for (const want of ["/api/health: cached at the edge", "/ serves the home page", "/pack.html 308s to /pack",
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
  const ci = readFileSync(join(ROOT, ".github", "workflows", "ci.yml"), "utf8").replace(/\r\n/g, "\n");
  t("CI: on push and pull request", /^on:\n  push:/m.test(ci) && /^  pull_request:/m.test(ci));
  t("CI: read-only token, no secrets", /^permissions:\n  contents: read/m.test(ci) && !/secrets\./.test(ci));
  t("CI: installs from the lockfile, runs npm test, then the link check",
    ci.indexOf("run: npm ci") > -1 && ci.indexOf("run: npm ci") < ci.indexOf("run: npm test") && ci.indexOf("run: npm test") < ci.indexOf("run: npm run check:links"));
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  for (const s of ["test", "check:links", "check:deploy", "check:health", "serve", "stamp"]) t("npm script: " + s, typeof pkg.scripts[s] === "string");
  const every = readFileSync(join(ROOT, "scripts", "check-deploy.mjs"), "utf8");
  t("check-deploy only GETs", !/method:\s*"(POST|PUT|PATCH|DELETE)"/.test(every) && /method: "GET"/.test(every));

  // Vercel runs no build. With the "Other" preset and no build command,
  // Vercel runs package.json's "vercel-build" or "build" script if there
  // is one, then wants an output directory named public. The stamps need
  // scripts/ and partials/, which .vercelignore keeps off the deploy, and
  // their output is committed. So none of those scripts may exist.
  const { existsSync } = await import("node:fs");
  for (const s of ["build", "vercel-build", "now-build"]) {
    t("no npm \"" + s + "\" script (Vercel would run it on deploy)", !(s in pkg.scripts), pkg.scripts[s]);
  }
  t("no public/ directory (Vercel would serve it instead of the root)", !existsSync(join(ROOT, "public")));
  const vj = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
  for (const k of ["buildCommand", "outputDirectory", "framework", "installCommand"]) {
    t("vercel.json doesn't set " + k, !(k in vj));
  }

  // The post-deploy workflow: production deploys only, GET only, no secrets.
  const pd = readFileSync(join(ROOT, ".github", "workflows", "post-deploy.yml"), "utf8").replace(/\r\n/g, "\n");
  t("post-deploy: runs on deployment_status", /^on:\n  deployment_status:/m.test(pd));
  t("post-deploy: only successful production deploys",
    pd.includes("github.event.deployment_status.state == 'success'") && pd.includes("startsWith(github.event.deployment.environment, 'Production')"));
  t("post-deploy: read-only token, no secrets", /^permissions:\n  contents: read/m.test(pd) && !/secrets\./.test(pd));
  t("post-deploy: runs check-deploy against the apex",
    /run: node scripts\/check-deploy\.mjs https:\/\/makersonmuse\.com \$STORAGE_FLAG/.test(pd));
  t("post-deploy: storage \"missing\" is a note only until MOM_STORAGE_CONNECTED is true",
    pd.includes("vars.MOM_STORAGE_CONNECTED != 'true' && '--allow-missing-storage'"));
}

/* 5b. Repo-only .html files behind Vercel's clean-URL 308 (seen on a real
   preview: /partials/nav.html -> 308 /partials/nav -> 404) count as not
   served; a 308 that lands on a 200, or on another site, does not. */
{
  const mk = (target) => http.createServer((req, res) => {
    const u = req.url;
    if (u === "/partials/nav.html") { res.writeHead(308, { location: target }); return res.end(); }
    if (u === "/partials/nav") { res.writeHead(404); return res.end("not found"); }
    if (u === "/partials/leak") { res.writeHead(200, { "content-type": "text/html" }); return res.end("<nav></nav>"); }
    res.writeHead(404); res.end();
  });
  for (const [target, want, label] of [["/partials/nav", true, "a 308 to an address that 404s"],
    ["/partials/leak", false, "a 308 to an address that serves the file"],
    ["https://elsewhere.example/partials/nav", false, "a 308 to another site"]]) {
    const s = mk(target);
    await new Promise((r) => s.listen(0, "127.0.0.1", r));
    const res = await checkDeploy("http://127.0.0.1:" + s.address().port, { hosts: [], allowMissingStorage: true });
    const line = res.results.find((r) => r.name === "/partials/nav.html is not served");
    t("repo-only check, " + label + ": " + (want ? "passes" : "fails"), line && line.ok === want, line);
    await new Promise((r) => s.close(r));
  }
}

/* 6. --allow-missing-storage: "missing" becomes a note; "unreachable" still fails */
{
  const mk = (storage) => http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, storage }));
  });
  for (const [storage, wantRequired] of [["missing", false], ["unreachable", true]]) {
    const s = mk(storage);
    await new Promise((r) => s.listen(0, "127.0.0.1", r));
    const base = "http://127.0.0.1:" + s.address().port;
    const res = await checkDeploy(base, { hosts: [], allowMissingStorage: true });
    const line = res.results[0];
    t("allowMissingStorage: storage " + storage + (wantRequired ? " still fails" : " is a note"),
      line.name === "/api/health: storage reachable" && line.ok === false && line.required === wantRequired, line);
    const strict = await checkDeploy(base, { hosts: [] });
    t("without the flag, storage " + storage + " fails", strict.results[0].required === true && strict.results[0].ok === false);
    await new Promise((r) => s.close(r));
  }
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
