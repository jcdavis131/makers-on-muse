/* Build the public Agent Skills library.
   Scans /opt/hatch/skills and ~/workspace/skills, scrubs PII, and generates:
     skills/<id>.html  — one page per skill with the full scrubbed SKILL.md
     skills.html        — index: curated picks + full searchable library
   The generated pages are committed to the repo. Re-run after skill
   changes; the weekly curation cron does this and opens a PR.
   Run: node scripts/build-skills-library.mjs
   Exits non-zero if PII patterns survive scrubbing. */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { render, ORIGIN } from "./stamp-layout.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "skills");
const DIRS = [
  { base: "/opt/hatch/skills", source: "Bundled" },
  { base: join(process.env.HOME || "/home/hatch", "workspace/skills"), source: "Custom" },
];

/* ---------- PII scrubbing (longest patterns first) ---------- */
const SCRUBS = [
  [/John Cameron Davis/g, "the owner"],
  [/Cameron's/g, "the owner's"],
  [/Cameron/g, "the owner"],
  [/JC Davis/g, "the owner"],
  [/jcdavis131/g, "owner"],
  [/Alienware GPU node/g, "GPU node"],
  [/Alienware/g, "GPU node"],
  [/jcd-pc/g, "windows-pc"],
  [/Pixel 9/g, "Android phone"],
  [/100\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, "[tailnet-ip]"],
  [/\/home\/hatch/g, "~"],
];
const PII_CHECK = /John Cameron Davis|Cameron|JC Davis|jcdavis131|Alienware|jcd-pc|Pixel 9|100\.\d{1,3}\.\d{1,3}\.\d{1,3}|\/home\/hatch/;

function scrub(s) {
  let out = String(s);
  for (const [re, to] of SCRUBS) out = out.replace(re, to);
  return out;
}

/* ---------- frontmatter ---------- */
function parseSkill(text, id) {
  let name = id, description = "", body = text;
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (m) {
    body = m[2];
    const nm = /^name:\s*(.+)$/m.exec(m[1]);
    const dm = /^description:\s*(.+)$/m.exec(m[1]);
    if (nm) name = nm[1].trim().replace(/^["']|["']$/g, "");
    if (dm) description = dm[1].trim().replace(/^["']|["']$/g, "").replace(/\\"/g, '"');
  } else {
    const h1 = /^#\s+(.+)$/m.exec(text);
    if (h1) name = h1[1].trim();
  }
  if (!description) {
    const h1 = /^#\s+(.+)$/m.exec(body);
    if (h1) {
      const parts = h1[1].split(/—/);
      description = (parts.length > 1 ? parts.slice(1).join("—") : parts[0]).trim();
    }
  }
  if (!description) description = "Skill: " + id;
  return { name: scrub(name), description: scrub(description), body: scrub(body) };
}

/* ---------- categories ---------- */
const CATS = [
  [/gmail|calendar|messenger|instagram|threads|facebook|slack|triage|whatsapp/i, "Comms"],
  [/github|vercel|cursor|docker|packag|ship|deploy|cli$/i, "Dev"],
  [/tailscale|ssh|windows|superpowers/i, "Infra"],
  [/grep|search|zvec/i, "Search"],
  [/embedding|timesfm|vector|quant|polymarket|fantasy|forecast/i, "Data"],
  [/spotify|tts|podcast|image|media|modly|voice/i, "Media"],
  [/plaid|booking|shopping|flight|opentable|finance|duffel|asana/i, "Money"],
  [/paper|research|drawio|diagram|obsidian|pdf|notion|evernote/i, "Research"],
  [/browser|ego-lite|playwright|puppeteer/i, "Browser"],
  [/dottie|scout|dumbmodel|dev-/i, "Agent APIs"],
  [/mistake|tdd|spec|scaffold|skill-creator|precommit/i, "Process"],
  [/health|fitness|withings|granola|healthex/i, "Health"],
  [/canva|figma|lovable/i, "Design"],
  [/calendar|calendly|tasks|linear|ghl|klaviyo|ads/i, "Productivity"],
];
function categorize(id, name, description) {
  const hay = id + " " + name + " " + description;
  for (const [re, cat] of CATS) if (re.test(hay)) return cat;
  return "General";
}

/* ---------- minimal markdown -> HTML ---------- */
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function inline(s) {
  let out = esc(s);
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|\W)\*([^*\n]+)\*/g, "$1<em>$2</em>");
  return out;
}
function mdToHtml(md) {
  const lines = md.split("\n");
  let html = "", i = 0, inCode = false, codeLang = "", codeBuf = [];
  let listTag = null;
  const closeList = () => { if (listTag) { html += "</" + listTag + ">\n"; listTag = null; } };
  const flushPara = (buf) => {
    if (buf.length) html += "<p>" + inline(buf.join(" ")) + "</p>\n";
  };
  let para = [];
  while (i < lines.length) {
    const line = lines[i];
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      if (!inCode) { inCode = true; codeLang = fence[1]; codeBuf = []; flushPara(para); para = []; closeList(); }
      else { inCode = false; html += '<pre><code>' + esc(codeBuf.join("\n")) + "</code></pre>\n"; }
      i++; continue;
    }
    if (inCode) { codeBuf.push(line); i++; continue; }
    if (/^\s*$/.test(line)) { flushPara(para); para = []; closeList(); i++; continue; }
    const h = /^(#{1,6})\s+(.+)$/.exec(line);
    if (h) {
      flushPara(para); para = []; closeList();
      const lvl = Math.min(6, h[1].length + 1);
      html += "<h" + lvl + ">" + inline(h[2]) + "</h" + lvl + ">\n";
      i++; continue;
    }
    if (/^---+\s*$/.test(line)) { flushPara(para); para = []; closeList(); html += "<hr>\n"; i++; continue; }
    if (/^>\s?/.test(line)) {
      flushPara(para); para = []; closeList();
      const q = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, "")); i++; }
      html += "<blockquote><p>" + inline(q.join(" ")) + "</p></blockquote>\n";
      continue;
    }
    if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      flushPara(para); para = []; closeList();
      const cells = (l) => l.replace(/^\||\|$/g, "").split("|").map((c) => inline(c.trim()));
      html += "<div class=\"tbl\"><table><thead><tr>" + cells(line).map((c) => "<th>" + c + "</th>").join("") + "</tr></thead><tbody>\n";
      i += 2;
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) {
        html += "<tr>" + cells(lines[i]).map((c) => "<td>" + c + "</td>").join("") + "</tr>\n";
        i++;
      }
      html += "</tbody></table></div>\n";
      continue;
    }
    const ul = /^(\s*)[-*+]\s+(.+)$/.exec(line);
    const ol = /^(\s*)\d+[.)]\s+(.+)$/.exec(line);
    if (ul || ol) {
      flushPara(para); para = [];
      const tag = ul ? "ul" : "ol";
      if (listTag !== tag) { closeList(); html += "<" + tag + ">\n"; listTag = tag; }
      html += "<li>" + inline((ul || ol)[2]) + "</li>\n";
      i++; continue;
    }
    closeList();
    para.push(line.trim());
    i++;
  }
  flushPara(para); closeList();
  if (inCode) html += "<pre><code>" + esc(codeBuf.join("\n")) + "</code></pre>\n";
  return html;
}

/* ---------- page templates ---------- */
function read(p) { return readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n"); }

function mainJsVersion() {
  const m = /\/assets\/js\/main\.js\?v=([a-z0-9]+)/.exec(read("skills.html"));
  return m ? m[1] : "1";
}

function skillPage(skill, ver) {
  const url = ORIGIN + "/skills/" + skill.id;
  const title = skill.name + " — Agent Skills — Makers on Muse";
  const headSrc = read("partials/head.html").replace(/\n+$/, "");
  const lines = headSrc.split("\n");
  const cut = lines.indexOf("<!-- indexable pages only -->");
  const head = lines.slice(0, cut).concat(lines.slice(cut + 1)).join("\n")
    .split("{{url}}").join(url)
    .split("{{title}}").join(esc(skill.name).replace(/"/g, "&quot;"))
    .split("{{description}}").join(esc(skill.description).replace(/"/g, "&quot;"));
  const nav = render("nav", "skills.html");
  const footer = render("footer", "skills.html");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(skill.description).replace(/"/g, "&quot;")}">
<!-- layout:head -->
${head}
<!-- /layout:head -->
<style>
.skill-body{font-size:16px;line-height:1.7}
.skill-body h2{margin-top:36px}
.skill-body h3{margin-top:28px}
.skill-body pre{background:var(--void);color:#EDE8DE;border-radius:var(--radius-m);padding:16px 18px;overflow-x:auto;line-height:1.6}
.skill-body pre code{background:none;border:none;padding:0;color:inherit}
.skill-body code{font-family:var(--mono);font-size:14px;background:var(--stone-100);border:1px solid var(--stone-200);border-radius:6px;padding:1px 6px;overflow-wrap:anywhere}
.skill-body .tbl{overflow-x:auto;margin:16px 0}
.skill-body table{border-collapse:collapse;width:100%;font-size:14px}
.skill-body th,.skill-body td{border:1px solid var(--stone-200);padding:8px 12px;text-align:left;vertical-align:top}
.skill-body th{background:var(--stone-100);font-family:var(--mono);font-size:12px}
.skill-body blockquote{border-left:3px solid var(--terracotta);margin:16px 0;padding:4px 0 4px 16px;color:var(--ink-soft)}
.skill-body ul,.skill-body ol{padding-left:24px}
.skill-body li{margin:6px 0}
.scrub-note{font-size:13px;color:var(--ink-soft);background:var(--stone-100);border:1px dashed var(--stone-300);border-radius:var(--radius-s);padding:10px 14px;margin:18px 0 26px}
</style>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<!-- layout:nav -->
${nav}
<!-- /layout:nav -->
<main id="main">
  <section>
    <div class="wrap-narrow">
      <p class="eyebrow"><a href="/skills">Agent Skills</a> &middot; ${esc(skill.category)} &middot; ${esc(skill.source)}</p>
      <h1>${esc(skill.name)}</h1>
      <p class="lede">${esc(skill.description)}</p>
      <p class="scrub-note">Scrubbed of personal details for the public library. The full library is re-curated weekly.</p>
      <div class="skill-body">
${skill.html}
      </div>
    </div>
  </section>
</main>
<!-- layout:footer -->
${footer}
<!-- /layout:footer -->
<script src="/assets/js/main.js?v=${ver}"></script>
</body>
</html>
`;
}

/* ---------- collect ---------- */
function collect() {
  const byId = new Map();
  for (const { base, source } of DIRS) {
    if (!existsSync(base)) continue;
    for (const id of readdirSync(base, { withFileTypes: true })) {
      if (!id.isDirectory() || id.name.startsWith(".") || id.name.startsWith("_")) continue;
      const fp = join(base, id.name, "SKILL.md");
      if (!existsSync(fp)) continue;
      /* custom skills override bundled ones with the same id */
      if (byId.has(id.name) && source === "Bundled") continue;
      const parsed = parseSkill(readFileSync(fp, "utf8"), id.name);
      byId.set(id.name, {
        id: id.name,
        source,
        name: parsed.name,
        description: parsed.description,
        category: categorize(id.name, parsed.name, parsed.description),
        html: mdToHtml(parsed.body),
      });
    }
  }
  const skills = [...byId.values()];
  skills.sort((a, b) => (a.id < b.id ? -1 : 1));
  return skills;
}

/* ---------- index page library section ---------- */
function librarySection(skills) {
  const cards = skills.map((s) =>
    `        <a class="skill-card" href="/skills/${esc(s.id)}" data-search="${esc((s.name + " " + s.description + " " + s.category).toLowerCase())}">
          <span class="cat">${esc(s.category)} &middot; ${esc(s.source)}</span>
          <h3>${esc(s.name)}</h3>
          <p>${esc(s.description)}</p>
        </a>`).join("\n");
  return `      <p class="eyebrow">The library</p>
      <h2>All skills</h2>
      <p class="muted" style="max-width:44em">${skills.length} skills, scrubbed of personal details. The full SKILL.md of each one is one tap away.</p>
      <p><input type="search" id="skill-search" class="skill-search" placeholder="Search ${skills.length} skills&hellip;" aria-label="Search skills"></p>
      <div class="shelf" id="skill-library">
${cards}
      </div>
      <p class="small muted" id="skill-count" aria-live="polite"></p>`;
}

/* ---------- main ---------- */
const skills = collect();
console.log("collected " + skills.length + " skills");

/* PII gate: fail loudly if anything survived scrubbing. */
let piiHits = 0;
for (const s of skills) {
  for (const [label, text] of [["name", s.name], ["description", s.description], ["body", s.html]]) {
    if (PII_CHECK.test(text)) { piiHits++; console.error("PII survived in " + s.id + " (" + label + ")"); }
  }
}
if (piiHits) { console.error(piiHits + " PII hits survived scrubbing"); process.exit(1); }
console.log("PII scrub clean");

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
const ver = mainJsVersion();
for (const s of skills) {
  writeFileSync(join(OUT, s.id + ".html"), skillPage(s, ver));
}
console.log("wrote " + skills.length + " skill pages");

/* patch the index page: insert the library section before the explainer */
{
  let html = read("skills.html");
  const startMark = "<!-- skills:library:start -->";
  const endMark = "<!-- skills:library:end -->";
  const section = `  <section style="padding-top:0">
    <div class="wrap">
${startMark}
${librarySection(skills)}
${endMark}
    </div>
  </section>

`;
  const si = html.indexOf(startMark), ei = html.indexOf(endMark);
  if (si !== -1 && ei !== -1) {
    const open = html.lastIndexOf('<section style="padding-top:0">', si);
    const close = html.indexOf("</section>", ei) + "</section>".length;
    html = html.slice(0, open) + section.trimEnd() + "\n" + html.slice(close);
  } else {
    const anchor = '  <section style="padding-top:0">\n    <div class="wrap-narrow">\n      <h2>What a SKILL.md skill is</h2>';
    if (!html.includes(anchor)) { console.error("index anchor not found"); process.exit(1); }
    html = html.replace(anchor, section + anchor);
  }
  /* search input needs the skills.js behaviour */
  if (!html.includes("/assets/js/skills.js")) {
    html = html.replace("</body>", '<script src="/assets/js/skills.js"></script>\n</body>');
  }
  writeFileSync(join(ROOT, "skills.html"), html);
  console.log("skills.html index updated");
}
