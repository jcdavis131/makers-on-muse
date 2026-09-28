/* Version the stylesheets and scripts the pages load, so browsers can
   cache them for a year.

   vercel.json serves /assets/css/* and /assets/js/* with
   "Cache-Control: public, max-age=31536000, immutable". That is only
   safe if a changed file gets a new URL. So every page refers to them
   as /assets/css/main.css?v=<hash>, where <hash> is the first 10 hex
   digits of the file's SHA-256 (line endings normalized to LF, so
   Windows and Linux checkouts agree). Pages themselves are not cached
   (Vercel's default for HTML is max-age=0, must-revalidate), so a new
   deploy's pages point at the new files at once.

     node scripts/stamp-assets.mjs           check only; exit 1 on any stale or missing version
     node scripts/stamp-assets.mjs --write   rewrite the pages (npm run build:assets)

   Edit a CSS or JS file, run npm run build (or build:assets), and commit
   the pages with it. scripts/test-site.mjs runs the check in npm test.
   Scripts must not load other stylesheets or scripts by URL: those
   requests would carry no version. Images and data are not versioned;
   they get a short cache instead. */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");

/* A reference to a versioned asset in a page: src or href, root-absolute. */
export const REF = /\b(src|href)="\/(assets\/(?:css|js)\/[^"?#]+)(?:\?v=([^"]*))?"/g;

export function version(rel) {
  return createHash("sha256").update(read(rel), "utf8").digest("hex").slice(0, 10);
}

export function pages() {
  return readdirSync(ROOT).filter((f) => f.endsWith(".html")).sort();
}

/* stampAssets(html) -> { html, refs: [{ file, had, want }], missing: [file] } */
export function stampAssets(html, versionOf = version) {
  const refs = [];
  const missing = [];
  const out = html.replace(REF, (all, attr, file, had) => {
    if (!existsSync(join(ROOT, file))) { missing.push(file); return all; }
    const want = versionOf(file);
    refs.push({ file, had: had === undefined ? null : had, want });
    return attr + '="/' + file + "?v=" + want + '"';
  });
  return { html: out, refs, missing };
}

function main() {
  const write = process.argv.includes("--write");
  let problems = 0;
  for (const page of pages()) {
    const html = read(page);
    const res = stampAssets(html);
    for (const f of res.missing) { problems++; console.error(page + ": refers to a missing file /" + f); }
    const stale = res.refs.filter((r) => r.had !== r.want);
    for (const r of stale) console.log(page + ": /" + r.file + (r.had ? " has ?v=" + r.had : " has no version") + ", want ?v=" + r.want);
    if (stale.length) {
      if (write) writeFileSync(join(ROOT, page), res.html, "utf8");
      else problems++;
    }
  }
  if (problems) {
    console.error("\nAsset versions are stale. Run: npm run build:assets");
    process.exit(1);
  }
  console.log(write ? "Asset versions stamped" : "Every asset reference carries its current version");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
