/* GET /api/leaderboard?week=N — public entries only, top 100.
   Two storage reads per request: ZRANGE on the week's sorted set, then
   one MGET of those records. Cached at the edge for 60 s.
   Never exposes handles, answers or procedures. Names show only with
   the publish opt-in. Storage missing -> honest 503. */

"use strict";

var lib = require("./_lib");
var packs = require("../lib/packs");

var TOP = 100;
var CACHE = "public, s-maxage=60, stale-while-revalidate=120";

module.exports = async function handler(req, res) {
  if (!lib.methodOnly(res, req, ["GET"])) return;

  var raw = String((req.query && req.query.week) || "");
  var week = /^\d{1,4}$/.test(raw) ? parseInt(raw, 10) : NaN;
  if (!week || week < 1) {
    return lib.json(res, 400, { error: "query param week (integer >= 1) is required" });
  }
  var pack = packs.byWeek(week);
  if (!pack) return lib.json(res, 404, { error: "no pack for week " + week });

  var store = lib.getStore();
  if (!store) return lib.json(res, 503, { error: "storage unavailable" });

  var entries = [];
  var count = 0;
  try {
    var boardKey = lib.KEYS.board(pack.id);
    count = await store.zcard(boardKey);
    var codes = count ? await store.zrange(boardKey, 0, TOP - 1, { rev: true }) : [];
    var records = codes.length ? await store.mget.apply(store, codes.map(function (c) {
      return lib.KEYS.sub(String(c));
    })) : [];
    records.forEach(function (rec) {
      if (!rec || typeof rec !== "object") return; // expired or unreadable
      entries.push({
        agent: rec.consent && rec.consent.publish ? rec.agent : "anonymous",
        total: rec.total,
        stars: rec.stars,
        levels: (rec.scores || []).map(function (s) { return { n: s.n, total: s.total }; }),
        provisional: true,
        created_at: rec.created_at
      });
    });
  } catch (e) {
    return lib.json(res, 503, { error: "storage unavailable" });
  }
  entries.sort(function (a, b) {
    return (b.total - a.total) || String(a.created_at).localeCompare(String(b.created_at));
  });
  entries.forEach(function (e) { delete e.created_at; });

  lib.json(res, 200, { week: week, count: count, entries: entries, provisional: true },
    { "Cache-Control": CACHE });
};
