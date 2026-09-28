/* Stamp pack-manifest numbers into the static pages.

   The pages stay plain HTML that reads right without JavaScript. Every
   number that comes from a pack manifest sits in an element marked
   data-pack="<path>", with plain text inside:

     <li>Par tokens <strong data-pack="levels.1.par.tokens">800</strong></li>

   This script rewrites that text from data/packs/s1w1.json.

     node scripts/stamp-pack.mjs           check only; exit 1 on any drift
     node scripts/stamp-pack.mjs --write   rewrite the pages (npm run build:pack)

   scripts/test-pack.mjs runs the check in npm test, and also fails if a
   page loses a marker it must carry (REQUIRED below).

   Paths (a trailing # gives the bare number, for arithmetic):
     version                        1
     scoring.max_total              400     (also level_max, star_at, max_stars)
     levels.N.tag, levels.N.title   Scout, What's the number?
     levels.N.par.tokens            4,000   (# -> 4000)
     levels.N.par.seconds           60 s, 4 min   (# -> 240)
     levels.N.blend                 50 / 30 / 20
     levels.N.blend.token           50%     (# -> 0.50; also time, procedure)
     levels.N.correctness           0 or 1
     levels.N.safety_cap.cap        30%
     blend_range.token              20–50%  (lowest to highest over scored levels) */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const packs = require("../lib/packs.js");

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const PACK = packs.byWeek(1);

const DIMS = ["token", "time", "procedure"];

/* Markers each page must carry. A page that loses one fails the test,
   so deleting a marker can't make the check pass. */
export function required(pack) {
  const scored = packs.scoredLevels(pack);
  const exhibits = pack.levels.filter((l) => l.exhibition).map((l) => l.n);
  const capped = pack.levels.filter((l) => l.safety_cap).map((l) => l.n);
  return {
    "pack.html": [
      "version",
      ...scored.flatMap((n) => [
        `levels.${n}.tag`, `levels.${n}.title`, `levels.${n}.par.tokens`,
        `levels.${n}.par.seconds`, `levels.${n}.blend`, `levels.${n}.correctness`
      ]),
      ...exhibits.flatMap((n) => [`levels.${n}.tag`, `levels.${n}.title`]),
      ...capped.map((n) => `levels.${n}.safety_cap.cap`)
    ],
    "scoring.html": [
      "scoring.level_max", "scoring.max_total", "scoring.max_stars", "scoring.star_at",
      ...DIMS.map((d) => `blend_range.${d}`),
      ...scored.flatMap((n) => [`levels.${n}.tag`, ...DIMS.map((d) => `levels.${n}.blend.${d}`)]),
      "levels.1.par.tokens", "levels.1.par.seconds", "levels.1.par.tokens#", "levels.1.par.seconds#",
      "levels.1.blend", ...DIMS.map((d) => `levels.1.blend.${d}#`)
    ],
    "faq.html": ["scoring.max_total", "scoring.max_stars", ...capped.map((n) => `levels.${n}.safety_cap.cap`)],
    "submit.html": ["scoring.max_total"]
  };
}
export const PAGES = Object.keys(required(PACK));

const fmtInt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const pct = (x) => Math.round(x * 100) + "%";
function fmtSeconds(s) {
  return s >= 120 && s % 60 === 0 ? s / 60 + " min" : s + " s";
}

/* value(pack, path) -> the text the page shows for a path. Throws on an
   unknown path. */
export function value(pack, path) {
  const bare = path.endsWith("#");
  const parts = (bare ? path.slice(0, -1) : path).split(".");
  const fail = () => { throw new Error("unknown data-pack path: " + path); };

  if (parts[0] === "version" && parts.length === 1) return String(pack.version);
  if (parts[0] === "scoring" && parts.length === 2) {
    const v = pack.scoring[parts[1]];
    if (typeof v !== "number") fail();
    return bare ? String(v) : fmtInt(v);
  }
  if (parts[0] === "blend_range" && parts.length === 2 && DIMS.includes(parts[1])) {
    const ws = packs.scoredLevels(pack).map((n) => packs.level(pack, n).blend[parts[1]]);
    const lo = pct(Math.min(...ws)), hi = pct(Math.max(...ws));
    return lo === hi ? lo : lo.slice(0, -1) + "–" + hi;
  }
  if (parts[0] === "levels" && parts.length >= 3) {
    const lv = packs.level(pack, Number(parts[1]));
    if (!lv) fail();
    const rest = parts.slice(2).join(".");
    if (rest === "tag" || rest === "title") return lv[rest];
    if (rest === "correctness") {
      if (lv.correctness === "binary") return "0 or 1";
      fail();
    }
    if (rest === "par.tokens" && lv.par) return bare ? String(lv.par.tokens) : fmtInt(lv.par.tokens);
    if (rest === "par.seconds" && lv.par) return bare ? String(lv.par.seconds) : fmtSeconds(lv.par.seconds);
    if (rest === "blend" && lv.blend) return DIMS.map((d) => Math.round(lv.blend[d] * 100)).join(" / ");
    if (parts[2] === "blend" && parts.length === 4 && DIMS.includes(parts[3]) && lv.blend) {
      return bare ? lv.blend[parts[3]].toFixed(2) : pct(lv.blend[parts[3]]);
    }
    if (rest === "safety_cap.cap" && lv.safety_cap) return pct(lv.safety_cap.cap);
  }
  return fail();
}

const escText = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* An element with a data-pack attribute and plain text inside. */
const MARK = /(<([a-z][a-z0-9]*)\b[^>]*?\sdata-pack="([^"]+)"[^>]*>)([^<]*)(<\/\2>)/gi;

/* stamp(html, pack) -> { html, paths, drift: [{ path, from, to }] } */
export function stamp(html, pack) {
  const paths = [];
  const drift = [];
  const out = html.replace(MARK, (all, open, tag, path, text, close) => {
    const want = escText(value(pack, path));
    paths.push(path);
    if (text !== want) drift.push({ path, from: text, to: want });
    return open + want + close;
  });
  return { html: out, paths, drift };
}

/* Every data-pack attribute in a page, including ones on elements the
   stamp can't rewrite (nested markup inside). */
export function allMarkers(html) {
  return [...html.matchAll(/\sdata-pack="([^"]+)"/g)].map((m) => m[1]);
}

function main() {
  const write = process.argv.includes("--write");
  let problems = 0;
  for (const page of PAGES) {
    const file = join(ROOT, page);
    const html = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    const res = stamp(html, PACK);
    if (res.paths.length !== allMarkers(html).length) {
      problems++;
      console.error(page + ": a data-pack element holds markup; it must hold plain text only");
    }
    for (const d of res.drift) {
      console.log(page + ": " + d.path + ": " + JSON.stringify(d.from) + " -> " + JSON.stringify(d.to));
    }
    if (write && res.drift.length) writeFileSync(file, res.html, "utf8");
    else if (res.drift.length) problems++;
  }
  if (problems) {
    console.error("\nPages disagree with the pack manifest. Run: npm run build:pack");
    process.exit(1);
  }
  console.log(write ? "Pages stamped from data/packs/" + PACK.id + ".json" : "Pages match data/packs/" + PACK.id + ".json");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
