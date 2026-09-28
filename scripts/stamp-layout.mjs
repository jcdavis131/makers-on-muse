/* Stamp the shared nav and footer into every page.

   The pages stay plain HTML that works without JavaScript and from any
   static server. The nav and the footer are written once, in
   partials/nav.html and partials/footer.html, and copied into each page
   between marker comments:

     <!-- layout:nav -->
     ...partials/nav.html, with this page's own link marked...
     <!-- /layout:nav -->

   The copy marks the page's own link (its clean path, e.g. /pack for
   pack.html) with aria-current="page" (in the nav and the footer) and its nav group with the class is-current, so
   the current page shows without JavaScript.

     node scripts/stamp-layout.mjs           check only; exit 1 on any drift
     node scripts/stamp-layout.mjs --write   rewrite the pages (npm run build:layout)

   It also writes sitemap.xml from the page list: every root page that
   isn't noindex, at its clean address.

   Edit a partial, run npm run build:layout, and commit the partial and
   the pages together. scripts/test-layout.mjs runs the check in npm test.
   partials/ is repo-only (.vercelignore); the site serves the pages. */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const NAMES = ["nav", "footer"];
export const ORIGIN = "https://makersonmuse.com";

const read = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");

/* Every page at the repo root. */
export function pages() {
  return readdirSync(ROOT).filter((f) => f.endsWith(".html")).sort();
}

export function partial(name) {
  if (!NAMES.includes(name)) throw new Error("unknown partial: " + name);
  return read("partials/" + name + ".html").replace(/\n+$/, "");
}

/* The address a page is served at: clean URLs (vercel.json cleanUrls),
   so pack.html is /pack and index.html is /. Links use these paths. */
export function pathFor(page) {
  return page === "index.html" ? "/" : "/" + page.replace(/\.html$/, "");
}

/* render(name, page) -> the partial as it appears in that page. */
export function render(name, page, source) {
  let html = source === undefined ? partial(name) : source;
  const path = pathFor(page);
  const link = '<a href="' + path + '">';
  if (name === "nav") {
    // A group holds a label, a button and a list: no nested div.
    html = html.replace(/<div class="nav-group">([\s\S]*?)<\/div>/g, (all, inner) =>
      inner.includes(link) ? all.replace('<div class="nav-group">', '<div class="nav-group is-current">') : all);
  }
  return html.split(link).join('<a href="' + path + '" aria-current="page">');
}

/* A page that asks not to be indexed (404.html, receipt.html) stays out
   of the sitemap. */
export function noindex(html) {
  return /<meta name="robots" content="[^"]*\bnoindex\b/.test(html);
}

/* sitemap.xml: every indexable page at its canonical address, home first.
   No <lastmod>: the repo has no honest per-page date to put there. */
export function sitemap() {
  const urls = pages().filter((p) => !noindex(read(p))).map((p) => ORIGIN + pathFor(p))
    .sort((a, b) => (a === ORIGIN + "/" ? -1 : b === ORIGIN + "/" ? 1 : a < b ? -1 : 1));
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => "  <url><loc>" + u + "</loc></url>\n").join("") +
    "</urlset>\n";
}

const BLOCK =/<!-- layout:(nav|footer) -->\n([\s\S]*?)\n<!-- \/layout:\1 -->/g;

/* stampPage(html, page) -> { html, count: {nav, footer}, drift: [name] } */
export function stampPage(html, page, sources = {}) {
  const count = { nav: 0, footer: 0 };
  const drift = [];
  const out = html.replace(BLOCK, (all, name, inner) => {
    count[name]++;
    const want = render(name, page, sources[name]);
    if (inner !== want) drift.push(name);
    return "<!-- layout:" + name + " -->\n" + want + "\n<!-- /layout:" + name + " -->";
  });
  return { html: out, count, drift };
}

function main() {
  const write = process.argv.includes("--write");
  let problems = 0;
  for (const page of pages()) {
    const file = join(ROOT, page);
    const html = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    const res = stampPage(html, page);
    for (const name of NAMES) {
      if (res.count[name] !== 1) {
        problems++;
        console.error(page + ": needs exactly one <!-- layout:" + name + " --> block, found " + res.count[name]);
      }
    }
    for (const name of res.drift) console.log(page + ": " + name + " differs from partials/" + name + ".html");
    if (write && res.drift.length) writeFileSync(file, res.html, "utf8");
    else if (res.drift.length) problems++;
  }
  const map = sitemap();
  let onDisk = null;
  try { onDisk = read("sitemap.xml"); } catch { /* not written yet */ }
  if (onDisk !== map) {
    console.log("sitemap.xml differs from the page list");
    if (write) writeFileSync(join(ROOT, "sitemap.xml"), map, "utf8");
    else problems++;
  }
  if (problems) {
    console.error("\nPages disagree with partials/, or sitemap.xml is stale. Run: npm run build:layout");
    process.exit(1);
  }
  console.log(write ? "Pages stamped from partials/" : "Every page matches partials/");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
