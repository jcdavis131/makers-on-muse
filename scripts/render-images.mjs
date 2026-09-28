/* Render the share image and the icons with headless Chrome. The output
   is committed; run this only when the design changes.

     node scripts/render-images.mjs [--chrome <path to chrome>]

   Writes:
     assets/img/og.png               1200x630 share image, from scripts/og/og.html
                                     with assets/img/mabel-plush.svg inlined
     assets/img/icon-32.png          32x32, from assets/img/icon.svg
     assets/img/apple-touch-icon.png 180x180, from assets/img/icon.svg
     favicon.ico                     16x16 and 32x32 PNGs in one ICO

   Needs puppeteer-core, which is not a dependency of the site. Install it
   anywhere (npm i puppeteer-core in a scratch folder) and point
   PUPPETEER_CORE_DIR at that folder, or install it here with --no-save.
   Chrome defaults to the usual Windows path; CHROME_PATH or --chrome
   overrides it. scripts/test-seo.mjs checks the committed files' sizes. */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

async function loadPuppeteer() {
  const dir = process.env.PUPPETEER_CORE_DIR;
  if (dir) return createRequire(join(dir, "package.json"))("puppeteer-core");
  try { return (await import("puppeteer-core")).default; } catch {
    console.error("puppeteer-core not found. Set PUPPETEER_CORE_DIR to a folder where it is installed.");
    process.exit(2);
  }
}

/* ico([{ size, png }]) -> Buffer. ICO entries may hold PNG data as is. */
export function ico(images) {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ size, png }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, e);
    head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt8(0, e + 2);
    head.writeUInt8(0, e + 3);
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(png.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...images.map((x) => x.png)]);
}

async function main() {
  const puppeteer = await loadPuppeteer();
  const ai = process.argv.indexOf("--chrome");
  const executablePath = ai > -1 ? process.argv[ai + 1] : (process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe");
  const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-first-run", "--font-render-hinting=none"] });
  try {
    const page = await browser.newPage();

    // Share image.
    await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(join(ROOT, "scripts", "og", "og.html")).href, { waitUntil: "load" });
    const svg = readFileSync(join(ROOT, "assets", "img", "mabel-plush.svg"), "utf8");
    await page.evaluate((text) => {
      const tpl = document.createElement("template");
      tpl.innerHTML = text.trim();
      document.getElementById("mabel").appendChild(tpl.content.firstChild);
    }, svg);
    await page.evaluate(() => document.fonts.ready);
    writeFileSync(join(ROOT, "assets", "img", "og.png"), await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1200, height: 630 } }));

    // Icons.
    const iconSvg = readFileSync(join(ROOT, "assets", "img", "icon.svg"));
    const src = "data:image/svg+xml;base64," + iconSvg.toString("base64");
    const render = async (size) => {
      await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
      await page.setContent('<html><body style="margin:0;background:transparent"><img src="' + src + '" width="' + size + '" height="' + size + '" style="display:block"></body></html>', { waitUntil: "load" });
      return Buffer.from(await page.screenshot({ type: "png", omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } }));
    };
    const p16 = await render(16), p32 = await render(32), p180 = await render(180);
    writeFileSync(join(ROOT, "assets", "img", "icon-32.png"), p32);
    writeFileSync(join(ROOT, "assets", "img", "apple-touch-icon.png"), p180);
    writeFileSync(join(ROOT, "favicon.ico"), ico([{ size: 16, png: p16 }, { size: 32, png: p32 }]));
    console.log("Wrote assets/img/og.png, assets/img/icon-32.png, assets/img/apple-touch-icon.png, favicon.ico");
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
