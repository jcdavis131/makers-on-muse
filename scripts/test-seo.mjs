/* Sharing and discovery tags. Run: node scripts/test-seo.mjs (or npm test).
   1. partials/head.html is stamped into every page (scripts/stamp-layout.mjs)
      with the page's own canonical address, title and description.
   2. Indexable pages: canonical, Open Graph and Twitter tags, all with
      absolute https://makersonmuse.com URLs. Noindex pages (404, receipt):
      icons only, no canonical, nothing to unfurl.
   3. Titles and descriptions: present, unique, a sensible length.
   4. The committed images are what the tags say: og.png is a 1200x630
      PNG, icon-32.png is 32x32, apple-touch-icon.png is 180x180, and
      favicon.ico holds 16 and 32 px PNGs.
   5. The share image template is evergreen: no dates, weeks or pack text.
   Exits non-zero on any failure. */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT, ORIGIN, pages, pathFor, noindex, partial, render, INDEX_ONLY } from "./stamp-layout.mjs";

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) pass++;
  else { fail++; console.error("FAIL:", name, extra === undefined ? "" : JSON.stringify(extra).slice(0, 400)); }
}
const eq = (name, a, b) => t(name + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")", JSON.stringify(a) === JSON.stringify(b));
const read = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const bin = (p) => readFileSync(join(ROOT, p));

const meta = (html, attr, key) => {
  const m = new RegExp('<meta ' + attr + '="' + key.replace(/[.:]/g, "\\$&") + '" content="([^"]*)">').exec(html);
  return m ? m[1] : null;
};
const head = (html) => html.slice(0, html.indexOf("</head>"));

/* ---------- 1-2. the stamped head ---------- */
const OG_IMAGE = ORIGIN + "/assets/img/og.png";
{
  const src = partial("head");
  t("head partial: marks where indexable-only tags start", src.split("\n").includes(INDEX_ONLY));
  t("head partial: placeholders only below the mark", !src.split(INDEX_ONLY)[0].includes("{{"));
  t("head partial: no page-specific text", !/Week \d|2026/.test(src));

  const titles = new Map(), descs = new Map();
  for (const p of pages()) {
    const html = read(p);
    const h = head(html);
    const title = (/<title>([^<]+)<\/title>/.exec(h) || [])[1];
    const desc = meta(h, "name", "description");
    t(p + ": has a title and a description", Boolean(title && desc));
    t(p + ": title ends with the site name", /— Makers on Muse$|^Makers on Muse — /.test(title || ""), title);
    t(p + ": description is 50-200 characters", desc && desc.length >= 50 && desc.length <= 200, desc && desc.length);
    titles.set(title, (titles.get(title) || []).concat(p));
    descs.set(desc, (descs.get(desc) || []).concat(p));

    t(p + ": the head block matches the partial", h.includes("<!-- layout:head -->\n" + render("head", p, undefined, html) + "\n<!-- /layout:head -->"));
    t(p + ": theme colour and icons", h.includes('<meta name="theme-color" content="#F9F6F0">') &&
      h.includes('<link rel="icon" href="/favicon.ico" sizes="32x32">') &&
      h.includes('<link rel="icon" href="/assets/img/icon.svg" type="image/svg+xml">') &&
      h.includes('<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">'));
    t(p + ": one icon set, no stray icon links", (h.match(/rel="(?:icon|apple-touch-icon)"/g) || []).length === 3);

    const url = ORIGIN + pathFor(p);
    const canon = (/<link rel="canonical" href="([^"]+)">/.exec(h) || [])[1];
    if (noindex(html)) {
      t(p + ": noindex page has no canonical", canon === undefined);
      t(p + ": noindex page has no share tags", !/property="og:|name="twitter:/.test(h));
      continue;
    }
    eq(p + ": canonical is its clean address", canon, url);
    t(p + ": one canonical", (h.match(/rel="canonical"/g) || []).length === 1);
    eq(p + ": og:url", meta(h, "property", "og:url"), url);
    eq(p + ": og:title is the title", meta(h, "property", "og:title"), title.replace(/"/g, "&quot;"));
    eq(p + ": og:description is the description", meta(h, "property", "og:description"), desc);
    eq(p + ": og:type, og:site_name", [meta(h, "property", "og:type"), meta(h, "property", "og:site_name")], ["website", "Makers on Muse"]);
    eq(p + ": og:image and its size", [meta(h, "property", "og:image"), meta(h, "property", "og:image:width"), meta(h, "property", "og:image:height")], [OG_IMAGE, "1200", "630"]);
    t(p + ": og:image:alt", (meta(h, "property", "og:image:alt") || "").length > 20);
    eq(p + ": twitter card", [meta(h, "name", "twitter:card"), meta(h, "name", "twitter:title"), meta(h, "name", "twitter:description"), meta(h, "name", "twitter:image")],
      ["summary_large_image", title.replace(/"/g, "&quot;"), desc, OG_IMAGE]);
    for (const m of h.matchAll(/(?:content|href)="(https?:\/\/[^"]+)"/g)) {
      t(p + ": absolute URLs are on the apex over https: " + m[1], m[1].startsWith(ORIGIN + "/"));
    }
  }
  for (const [title, ps] of titles) t("title is unique: " + title, ps.length === 1, ps);
  for (const [desc, ps] of descs) t("description is unique: " + (desc || "").slice(0, 40), ps.length === 1, ps);
  t("receipt and 404 are the noindex pages", ["404.html", "receipt.html"].every((p) => noindex(read(p))) &&
    pages().filter((p) => noindex(read(p))).length === 2);

  // A page without a description can't be stamped.
  let threw = false;
  try { render("head", "x.html", undefined, "<title>X — Makers on Muse</title>"); } catch { threw = true; }
  t("the stamp refuses a page with no description", threw);
  const quoted = render("head", "x.html", undefined, '<title>A "quoted" title — Makers on Muse</title><meta name="description" content="d">');
  t("a quote in a title can't end the attribute", quoted.includes('content="A &quot;quoted&quot; title — Makers on Muse"'));
}

/* ---------- 4. the images ---------- */
/* PNG: 8-byte signature, then IHDR with width and height as u32 BE. */
function pngSize(buf) {
  const sig = buf.subarray(0, 8).toString("hex");
  if (sig !== "89504e470d0a1a0a" || buf.subarray(12, 16).toString("latin1") !== "IHDR") return null;
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}
{
  for (const [file, size] of [["assets/img/og.png", [1200, 630]], ["assets/img/icon-32.png", [32, 32]], ["assets/img/apple-touch-icon.png", [180, 180]]]) {
    t(file + " exists", existsSync(join(ROOT, file)));
    if (existsSync(join(ROOT, file))) eq(file + " is a PNG of the right size", pngSize(bin(file)), size);
  }
  const og = existsSync(join(ROOT, "assets/img/og.png")) ? bin("assets/img/og.png") : Buffer.alloc(0);
  t("og.png is under 300 KB (Slack and X limits are far above this)", og.length > 0 && og.length < 300 * 1024, og.length);

  t("favicon.ico exists at the root", existsSync(join(ROOT, "favicon.ico")));
  if (existsSync(join(ROOT, "favicon.ico"))) {
    const ico = bin("favicon.ico");
    eq("favicon.ico header: an icon with two images", [ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)], [0, 1, 2]);
    const entries = [0, 1].map((i) => {
      const e = 6 + 16 * i;
      const len = ico.readUInt32LE(e + 8), off = ico.readUInt32LE(e + 12);
      return { w: ico.readUInt8(e), h: ico.readUInt8(e + 1), png: pngSize(ico.subarray(off, off + len)), end: off + len };
    });
    eq("favicon.ico holds 16 and 32 px PNGs", entries.map((x) => [x.w, x.h, x.png]), [[16, 16, [16, 16]], [32, 32, [32, 32]]]);
    eq("favicon.ico has nothing after the last image", entries[1].end, ico.length);
  }
  const svg = read("assets/img/icon.svg");
  t("icon.svg is square", /viewBox="0 0 32 32"/.test(svg));
}

/* ---------- 5. the share image template ---------- */
{
  const tpl = read("scripts/og/og.html");
  t("og template: no dates, weeks or pack text", !/\b(19|20)\d\d\b|Week|Season|Level|L[1-5]\b|Mon |Oct /.test(tpl.replace(/<!--[\s\S]*?-->/g, "")));
  t("og template: the site's own claim", tpl.includes("Test your Muse. Share what works."));
  t("og template: 1200x630", /width:1200px;height:630px/.test(tpl));
  t("og template: loads nothing from other sites", !/(src|href)="(https?:)?\/\//.test(tpl));
  t("render script writes all four images", ["og.png", "icon-32.png", "apple-touch-icon.png", "favicon.ico"].every((f) => read("scripts/render-images.mjs").includes(f)));
  t("render script needs no dependency of the site", !/"puppeteer/.test(read("package.json")));
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
