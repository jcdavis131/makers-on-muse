/* Skills library test: the generated public library is complete and clean.
   Covers: every top-level skill dir with a SKILL.md has a skills/<id>.html
   page (custom overrides bundled on duplicate ids); no PII patterns survive
   in the generated pages outside the site's own footer source link; the
   index links every skill; every skill page carries a title and description.
   Run: node scripts/test-skills-library.mjs */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const HOME = process.env.HOME || "/home/hatch";

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) pass++;
  else { fail++; console.error("FAIL:", name, extra === undefined ? "" : String(extra).slice(0, 120)); }
}

/* the skill ids: top-level dirs with SKILL.md on the author's machine, custom
   wins ties. In CI there are no source skill dirs, so fall back to the
   generated skills/ pages and verify the library is self-consistent
   (a page per skill, titles, descriptions, PII-clean, fully indexed). */
const ids = new Map();
for (const [base, custom] of [["/opt/hatch/skills", false], [join(HOME, "workspace/skills"), true]]) {
  if (!existsSync(base)) continue;
  for (const d of readdirSync(base, { withFileTypes: true })) {
    if (!d.isDirectory() || d.name.startsWith(".") || d.name.startsWith("_")) continue;
    if (!existsSync(join(base, d.name, "SKILL.md"))) continue;
    if (ids.has(d.name) && !custom) continue;
    ids.set(d.name, custom);
  }
}
if (ids.size === 0) {
  const genDir = join(ROOT, "skills");
  if (existsSync(genDir)) {
    for (const f of readdirSync(genDir)) {
      if (f.endsWith(".html")) ids.set(f.slice(0, -".html".length), true);
    }
  }
}
t("skills in library (>100 expected)", ids.size > 100, ids.size);

const index = read("skills.html");
let pages = 0;
for (const id of ids.keys()) {
  const p = "skills/" + id + ".html";
  if (!existsSync(join(ROOT, p))) { t("page exists: " + p, false); continue; }
  pages++;
  const html = read(p);
  t(id + ": has a title", /<title>[^<]+<\/title>/.test(html));
  t(id + ": has a meta description", /<meta name="description" content="[^"]+">/.test(html));
  t(id + ": links back to the library", html.includes('href="/skills"'));
  /* PII: the only jcdavis131 allowed is the site's own footer source link */
  const stripped = html.replace(/<a href="https:\/\/github\.com\/jcdavis131\/makers-on-muse">Source on GitHub<\/a>/g, "");
  t(id + ": no PII patterns",
    !/John Cameron Davis|Cameron|JC Davis|jcdavis131|Alienware|jcd-pc|Pixel 9|100\.\d{1,3}\.\d{1,3}\.\d{1,3}|\/home\/hatch/.test(stripped),
    (stripped.match(/John Cameron Davis|Cameron|JC Davis|jcdavis131|Alienware|jcd-pc|Pixel 9/) || [])[0]);
  t(id + ": links every skill from the index", index.includes('href="/skills/' + id + '"'));
}
t("a page per skill", pages === ids.size, pages + " vs " + ids.size);

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
