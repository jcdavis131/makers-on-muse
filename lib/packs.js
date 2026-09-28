/* Makers on Muse — pack manifests and the server-side week window.
   Pure, Node crypto only. Each manifest is listed with a static require
   so Vercel bundles it with the functions (a directory read would not
   ship). Add one line per new week. See data/packs/README.md.

   A manifest is the one source for a week: dates, levels, pars, blends,
   correctness type, the maximum total and the star rule. lib/score.js
   scores from it, api/submit.js stamps its version and hash on every
   entry, pack.html and scoring.html carry its numbers (written by
   scripts/stamp-pack.mjs) and watch.js reads it for a run's week.
   scripts/test-pack.mjs fails if any of them disagree. */

"use strict";

var crypto = require("crypto");

var PACKS = [
  require("../data/packs/s1w1.json")
];

/* Stored submissions for a week expire this long after the week closes. */
var RETENTION_DAYS = 90;
var DAY_S = 24 * 60 * 60;

/* Correctness types lib/score.js can apply. "binary" is 0 or 1, attested
   by the player. Partial credit and rubrics need server grading. */
var CORRECTNESS_TYPES = ["binary"];

/* Keys that would mean a served manifest holds answers. */
var FORBIDDEN_KEY = /answer|solution|optim|instance|pool|trap|secret|^keys?$/i;

function ms(x) {
  if (x instanceof Date) return x.getTime();
  if (typeof x === "number") return x;
  return Date.parse(x);
}

/* The Season 1 pack for a week number, or null. */
function byWeek(week) {
  for (var i = 0; i < PACKS.length; i++) {
    if (PACKS[i].season === 1 && PACKS[i].week === week) return PACKS[i];
  }
  return null;
}

function weeks() {
  return PACKS.map(function (p) { return p.week; });
}

/* "before" | "open" | "closed". Open is opens <= now < closes. */
function state(pack, now) {
  var t = ms(now);
  if (t < ms(pack.opens)) return "before";
  if (t < ms(pack.closes)) return "open";
  return "closed";
}

/* The pack open at `now`, or null. */
function openPack(now) {
  for (var i = 0; i < PACKS.length; i++) {
    if (state(PACKS[i], now) === "open") return PACKS[i];
  }
  return null;
}

/* Unix seconds when a week's stored data expires. */
function expiresAt(pack) {
  return Math.floor(ms(pack.closes) / 1000) + RETENTION_DAYS * DAY_S;
}

/* One level of a pack by number, or null. */
function level(pack, n) {
  var list = (pack && pack.levels) || [];
  for (var i = 0; i < list.length; i++) {
    if (list[i].n === n) return list[i];
  }
  return null;
}

/* Level numbers that score points, in order. */
function scoredLevels(pack) {
  return ((pack && pack.levels) || []).filter(function (l) { return l.scored === true; })
    .map(function (l) { return l.n; });
}

/* JSON with object keys sorted at every depth and no whitespace, so the
   hash doesn't depend on formatting or line endings. */
function canonical(v) {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (v !== null && typeof v === "object") {
    return "{" + Object.keys(v).sort().map(function (k) {
      return JSON.stringify(k) + ":" + canonical(v[k]);
    }).join(",") + "}";
  }
  return JSON.stringify(v);
}

/* sha256 of the manifest's canonical JSON, hex. Stamped on each entry. */
function hash(pack) {
  return crypto.createHash("sha256").update(canonical(pack), "utf8").digest("hex");
}

function isPosInt(n) { return typeof n === "number" && isFinite(n) && n > 0 && Math.floor(n) === n; }
function isFrac(n) { return typeof n === "number" && isFinite(n) && n >= 0 && n <= 1; }

function forbiddenKeys(v, path, out) {
  if (Array.isArray(v)) {
    v.forEach(function (x, i) { forbiddenKeys(x, path + "[" + i + "]", out); });
  } else if (v !== null && typeof v === "object") {
    Object.keys(v).forEach(function (k) {
      if (FORBIDDEN_KEY.test(k)) out.push(path + "." + k + ": this file is public; no answer-shaped keys");
      forbiddenKeys(v[k], path + "." + k, out);
    });
  }
  return out;
}

/* checkManifest(pack) -> [] when the manifest is usable, else a list of
   problems. Used by the tests; the scorer also refuses what it can't
   apply. */
function checkManifest(p) {
  var out = [];
  if (!p || typeof p !== "object") return ["manifest: not an object"];
  if (p.schema !== 2) out.push("schema: must be 2");
  if (!isPosInt(p.version)) out.push("version: a positive whole number");
  if (!isPosInt(p.season) || !isPosInt(p.week)) out.push("season, week: positive whole numbers");
  if (p.id !== "s" + p.season + "w" + p.week) out.push("id: must be s<season>w<week>");
  if (isNaN(ms(p.opens)) || isNaN(ms(p.closes)) || ms(p.opens) >= ms(p.closes)) out.push("opens, closes: UTC instants, opens first");
  ["title", "timezone", "range", "opens_label", "closes_label"].forEach(function (k) {
    if (typeof p[k] !== "string" || !p[k]) out.push(k + ": required");
  });

  var s = p.scoring || {};
  if (s.inputs !== "self_reported") out.push("scoring.inputs: only self_reported is built");
  if (!isPosInt(s.level_max)) out.push("scoring.level_max: a positive whole number");
  if (!(typeof s.star_at === "number" && s.star_at > 0 && s.star_at <= s.level_max)) out.push("scoring.star_at: 1..level_max");
  if (typeof s.pars_calibrated !== "boolean") out.push("scoring.pars_calibrated: true or false");

  var levels = Array.isArray(p.levels) ? p.levels : [];
  if (!levels.length) out.push("levels: required");
  levels.forEach(function (l, i) {
    var where = "levels[" + i + "]";
    if (!l || l.n !== i + 1) { out.push(where + ".n: levels are numbered 1, 2, 3 in order"); return; }
    if (typeof l.title !== "string" || !l.title || typeof l.tag !== "string" || !l.tag) out.push(where + ": title and tag required");
    if (l.scored === true) {
      if (l.exhibition) out.push(where + ": a scored level isn't an exhibition");
      if (CORRECTNESS_TYPES.indexOf(l.correctness) === -1) out.push(where + ".correctness: the scorer applies only " + CORRECTNESS_TYPES.join(", "));
      if (!l.par || !isPosInt(l.par.tokens) || !isPosInt(l.par.seconds)) out.push(where + ".par: tokens and seconds, positive whole numbers");
      var b = l.blend || {};
      if (!isFrac(b.token) || !isFrac(b.time) || !isFrac(b.procedure) ||
          Math.abs(b.token + b.time + b.procedure - 1) > 1e-9) {
        out.push(where + ".blend: token, time and procedure, 0..1, summing to 1");
      }
      if (l.safety_cap !== undefined) {
        if (!l.safety_cap || !isFrac(l.safety_cap.cap)) out.push(where + ".safety_cap.cap: 0..1");
        if (l.safety_cap && l.safety_cap.applied !== false) out.push(where + ".safety_cap.applied: the scorer can't apply a cap yet");
      }
    } else if (l.scored === false) {
      if (l.exhibition !== true) out.push(where + ": an unscored level is an exhibition");
      if (l.par || l.blend || l.correctness) out.push(where + ": an exhibition has no par, blend or correctness");
    } else {
      out.push(where + ".scored: true or false");
    }
  });

  var nScored = scoredLevels(p).length;
  if (!nScored) out.push("levels: at least one scored level");
  if (s.max_total !== nScored * s.level_max) out.push("scoring.max_total: must be scored levels x level_max (" + nScored * s.level_max + ")");
  if (s.max_stars !== nScored) out.push("scoring.max_stars: one star per scored level (" + nScored + ")");

  return out.concat(forbiddenKeys(p, "manifest", []));
}

module.exports = {
  PACKS: PACKS,
  RETENTION_DAYS: RETENTION_DAYS,
  CORRECTNESS_TYPES: CORRECTNESS_TYPES,
  byWeek: byWeek,
  weeks: weeks,
  state: state,
  openPack: openPack,
  expiresAt: expiresAt,
  level: level,
  scoredLevels: scoredLevels,
  canonical: canonical,
  hash: hash,
  checkManifest: checkManifest
};
