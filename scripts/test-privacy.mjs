/* Privacy checks. Run: node scripts/test-privacy.mjs (or npm test).
   1. No public submission channel: the issue template is gone and blank
      issues are off, with links back to the site.
   2. Deploy config: Vercel doesn't build live-runs, and .vercelignore keeps
      repo-only files off the site without dropping anything the site needs.
   3. Watch reads the archive, never a git branch.
   4. Archived runs match the index and the protocol, demo runs carry their
      label, and archive text has no instance-shaped details.
   5. Worked values in tests and docs are fictional.
   6. Optional: with MOM_RETIRED_FILE set to the private retired-values
      list (kept outside this repo), no tracked file contains any of them.
   Exits non-zero on any failure. */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) pass++;
  else { fail++; console.error("FAIL:", name); }
}

/* ---------- 1. issue templates ---------- */
{
  const dir = ".github/ISSUE_TEMPLATE";
  t("submission issue template is deleted", !existsSync(join(ROOT, dir, "submission.md")));
  const templates = existsSync(join(ROOT, dir))
    ? readdirSync(join(ROOT, dir)).filter((f) => /\.(md|ya?ml)$/.test(f) && f !== "config.yml")
    : [];
  t("no issue templates ask for runs or transcripts (found: " + templates.join(", ") + ")", templates.length === 0);
  const cfg = existsSync(join(ROOT, dir, "config.yml")) ? read(dir + "/config.yml") : "";
  t("config.yml exists", cfg.length > 0);
  t("config.yml turns blank issues off", /^blank_issues_enabled:\s*false\s*$/m.test(cfg));
  t("config.yml links the submit page", /url:\s*https:\/\/makersonmuse\.com\/submit\.html\s*$/m.test(cfg));
  t("config.yml warns against pasting transcripts", /transcript/i.test(cfg));
}

/* ---------- 2. deploy config ---------- */
{
  const vj = JSON.parse(read("vercel.json"));
  t("vercel.json: live-runs deployments off",
    vj.git && vj.git.deploymentEnabled && vj.git.deploymentEnabled["live-runs"] === false);
  t("vercel.json: functions block kept", vj.functions && vj.functions["api/**/*.js"]);

  t(".vercelignore exists", existsSync(join(ROOT, ".vercelignore")));
  // Real gitignore semantics via git; -v names the file each match came from.
  const ignoreFile = resolve(ROOT, ".vercelignore");
  function ignored(paths) {
    let out = "";
    try {
      out = execFileSync("git", ["-c", "core.excludesFile=" + ignoreFile, "check-ignore", "--no-index", "-v", ...paths],
        { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch (e) {
      out = e.stdout || ""; // exit 1 = none matched
    }
    const hit = new Set();
    for (const line of out.split("\n")) {
      const tab = line.lastIndexOf("\t");
      if (tab < 0) continue;
      const src = line.slice(0, tab);
      const pattern = src.split(":").slice(-1)[0];
      if (src.includes(".vercelignore") && !pattern.startsWith("!")) hit.add(line.slice(tab + 1).replace(/\\/g, "/"));
    }
    return hit;
  }
  const mustHide = [
    "scripts/smoke.mjs", "scripts/test-privacy.mjs", "docs/watch-protocol.md",
    ".github/ISSUE_TEMPLATE/config.yml", "README.md", "data/runs/README.md", "data/packs/README.md",
    "scripts/redis-emu.mjs", "scripts/check-health.mjs",
    "lib/score.test.js", "lib/sub/redact.spec.js"
  ];
  const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
  const mustServe = [
    ...tracked.filter((f) => /^(api|lib|assets|data)\//.test(f) || /^[^/]+\.html$/.test(f))
      .filter((f) => !/README\.md$/.test(f) && !/\.(test|spec)\.js$/.test(f)),
    "package.json", "package-lock.json", "vercel.json", "data/runs/index.json", "data/runs/demo-2026-09-27-scout.json",
    "data/packs/s1w1.json", "lib/packs.js", "lib/names.js", "lib/token.js"
  ];
  const hidden = ignored(mustHide);
  for (const p of mustHide) t(".vercelignore hides " + p, hidden.has(p));
  const wrongly = ignored(mustServe);
  for (const p of mustServe) t(".vercelignore keeps " + p, !wrongly.has(p));
  t("mustServe covers api/ and lib/", mustServe.some((f) => f.startsWith("api/")) && mustServe.some((f) => f.startsWith("lib/")));
}

/* ---------- 3. Watch reads the archive ---------- */
{
  const js = read("assets/js/watch.js");
  const html = read("watch.html");
  for (const [f, s] of [["watch.js", js], ["watch.html", html]]) {
    t(f + ": no raw.githubusercontent.com", !/raw\.githubusercontent/i.test(s));
    t(f + ": no live-runs branch", !/live-runs/i.test(s));
  }
  t("watch.js: reads data/runs/index.json", js.includes('"data/runs/index.json"'));
  t("watch.js: shows a run's label", /run\.label/.test(js) && /data\.label/.test(js));
  t("watch.html: has the replay-about slot", /id="replay-about"/.test(html));
}

/* ---------- 4. archive ---------- */
const TYPES = ["run", "level", "thought", "tool", "result", "answer", "score", "note"];
const TEXT_KEYS = ["title", "name", "detail", "text", "summary", "note"];
const LEAKS = [
  [/\$\s?\d/, "a price"],
  [/\b\d{1,2}:\d{2}\b/, "a clock time"],
  [/\b\d{1,2}\s?(am|pm)\b/i, "a clock time"],
  [/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/i, "a month-day date"],
  [/\b\d{4}-\d{2}-\d{2}\b/, "an ISO date"],
  [/\b(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(day|sday|nesday|rsday|urday)?\b/i, "a weekday"],
  [/\b(tomorrow|tonight|yesterday)\b/i, "a relative day"],
  [/\b[A-Z]{3}\b/, "an airport-code-shaped token"],
  [/\b\d{1,3},\d{3}\b/, "a thousands figure"],
  [/\b[\w.+-]+@[\w-]+\.[\w.]+\b/, "an email address"]
];
{
  const index = JSON.parse(read("data/runs/index.json"));
  t("index.json has a runs array", Array.isArray(index.runs));
  const ids = new Set();
  for (const entry of index.runs || []) {
    const tag = "run " + entry.id;
    t(tag + ": id shape", /^[A-Za-z0-9._-]{1,80}$/.test(entry.id || ""));
    t(tag + ": id unique", !ids.has(entry.id));
    ids.add(entry.id);
    t(tag + ": file is data/runs/<id>.json", entry.file === "data/runs/" + entry.id + ".json");
    if (!existsSync(join(ROOT, entry.file || "-"))) { t(tag + ": file exists", false); continue; }
    const run = JSON.parse(read(entry.file));
    t(tag + ": run_id matches", run.run_id === entry.id);
    t(tag + ": status done", run.status === "done");
    t(tag + ": week matches", run.week === entry.week && Number.isInteger(run.week) && run.week >= 1);
    t(tag + ": started_at parses", !isNaN(Date.parse(run.started_at)) || typeof run.started_at === "number");
    const ev = run.events || [];
    t(tag + ": has events", ev.length > 0);
    t(tag + ": seq runs 1..N", ev.every((e, i) => e.seq === i + 1));
    t(tag + ": t is seconds, non-decreasing", ev.every((e, i) =>
      typeof e.t === "number" && e.t >= 0 && (i === 0 || e.t >= ev[i - 1].t)));
    t(tag + ": known event types", ev.every((e) => TYPES.includes(e.type)));
    const scores = ev.filter((e) => e.type === "score");
    t(tag + ": score totals are 0-100", scores.every((e) => Number.isInteger(e.total) && e.total >= 0 && e.total <= 100));
    const sum = scores.filter((e) => e.level >= 1 && e.level <= 4).reduce((a, e) => a + e.total, 0);
    t(tag + ": index score is the L1-L4 sum (" + sum + ")", entry.score === sum && sum <= 400);
    t(tag + ": agent matches", run.agent === entry.agent);

    if (entry.demo || run.demo) {
      t(tag + ": demo flag in both index and file", entry.demo === true && run.demo === true);
      t(tag + ": labelled Demo run, unofficial", run.label === "Demo run, unofficial" && entry.label === run.label);
      t(tag + ": explains itself", typeof run.about === "string" && run.about.length > 40);
    }
    // Answers never survive archiving: each is a bracketed note.
    for (const e of ev.filter((x) => x.type === "answer")) {
      t(tag + " seq " + e.seq + ": answer is a bracketed removal note", /^\[[^\]]+\]$/.test(e.text || ""));
    }
    for (const e of ev) {
      for (const k of TEXT_KEYS) {
        if (typeof e[k] !== "string") continue;
        for (const [re, what] of LEAKS) {
          const m = e[k].match(re);
          t(`${tag} seq ${e.seq} ${k}: no ${what}${m ? ' ("' + m[0] + '")' : ""}`, !m);
        }
      }
    }
    for (const k of ["about", "label"]) {
      if (typeof run[k] !== "string") continue;
      for (const [re, what] of LEAKS.filter((l) => !/date|weekday/.test(l[1]))) {
        const m = run[k].match(re);
        t(`${tag} ${k}: no ${what}${m ? ' ("' + m[0] + '")' : ""}`, !m);
      }
    }
  }
  const files = readdirSync(join(ROOT, "data/runs")).filter((f) => f.endsWith(".json") && f !== "index.json");
  for (const f of files) t("data/runs/" + f + " is listed in index.json", ids.has(f.replace(/\.json$/, "")));
}

/* ---------- 5. fictional worked values ---------- */
{
  const smoke = read("scripts/smoke.mjs");
  const proto = read("docs/watch-protocol.md");
  t("smoke.mjs worked values are marked fictional", /Exampleton/.test(smoke) && /fictional/i.test(smoke));
  t("watch-protocol.md worked values are marked fictional", /Exampleton/.test(proto) && /fictional/i.test(proto));
  const scoresInDoc = [...proto.matchAll(/"score":\s*(\d+)/g)].map((m) => Number(m[1]));
  t("watch-protocol.md example scores are at most 400", scoresInDoc.length > 0 && scoresInDoc.every((n) => n <= 400));
  const readme = read("README.md");
  t("README doesn't send players to GitHub issues", !/submit via github issues|ISSUE_TEMPLATE\/submission/i.test(readme));
  t("README states the answer-key policy", /answer keys?/i.test(readme) && /never/i.test(readme));
}

/* ---------- 6. retired values (private list, optional) ---------- */
{
  const file = process.env.MOM_RETIRED_FILE;
  if (!file) {
    console.log("SKIP retired-values scan: set MOM_RETIRED_FILE to the private list to run it.");
  } else if (resolve(file).toLowerCase().startsWith(resolve(ROOT).toLowerCase())) {
    t("MOM_RETIRED_FILE must live outside the repo", false);
  } else {
    const values = readFileSync(file, "utf8").split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith("#"));
    t("retired list is not empty", values.length > 0);
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const res = values.map((v) => new RegExp("(?<![A-Za-z0-9])" + esc(v) + "(?![A-Za-z0-9])", "i"));
    const list = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" })
      .split("\n").filter(Boolean).filter((f) => existsSync(join(ROOT, f)));
    let hits = 0;
    for (const f of list) {
      if (/\.(png|jpe?g|webp|gif|ico|woff2?)$/i.test(f)) continue;
      const text = readFileSync(join(ROOT, f), "utf8");
      res.forEach((re, i) => {
        if (re.test(text)) { hits++; t(f + ": contains retired value #" + (i + 1), false); }
      });
    }
    console.log("retired-values scan: " + values.length + " values x " + list.length + " files, " + hits + " hits");
  }
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
