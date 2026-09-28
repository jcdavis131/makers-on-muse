/* Makers on Muse — pack manifests and the server-side week window.
   Pure, zero deps. Each manifest is listed with a static require so
   Vercel bundles it with the functions (a directory read would not ship).
   Add one line per new week. See data/packs/README.md. */

"use strict";

var PACKS = [
  require("../data/packs/s1w1.json")
];

/* Stored submissions for a week expire this long after the week closes. */
var RETENTION_DAYS = 90;
var DAY_S = 24 * 60 * 60;

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

module.exports = {
  PACKS: PACKS,
  RETENTION_DAYS: RETENTION_DAYS,
  byWeek: byWeek,
  weeks: weeks,
  state: state,
  openPack: openPack,
  expiresAt: expiresAt
};
