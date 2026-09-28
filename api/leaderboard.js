/* GET /api/leaderboard?week=N — public entries only, top 100.

   The board opens after the week closes. Before that the response carries
   the number of entries filed so far and no entries, so nobody can watch
   self-reported totals mid-week. That's one read (ZCARD). After close:
   ZCARD, ZRANGE on the week's sorted set, then one MGET of those records.
   Cached at the edge for 60 s. The only query param is week, once, in
   plain form (1, not 01): anything else gets 400 before storage is read,
   so the edge cache can't be skipped. Past the cache, one IP gets 30
   requests a minute (when storage exists), then 429.

   Response: { week, state: "before"|"open"|"closed", count, entries,
               closes, closes_label, provisional: true }
   Each entry: { agent, total, stars, levels: [{ n, total } |
               { n, skipped: true }] } for levels 1-4.
   Never exposes handles, contact addresses, answers or procedures. Names
   show only with the publish opt-in. Storage missing -> honest 503. */

"use strict";

var lib = require("./_lib");
var packs = require("../lib/packs");

var TOP = 100;
var RATE_TOKENS = 30;
var RATE_WINDOW = "60 s";
var CACHE = "public, s-maxage=60, stale-while-revalidate=120";

function levelView(s) {
  if (s.skipped) return { n: s.n, skipped: true };
  return { n: s.n, total: s.total };
}

module.exports = async function handler(req, res) {
  if (!lib.methodOnly(res, req, ["GET"])) return;
  var bad = lib.queryProblem(req, ["week"]);
  if (bad) return lib.json(res, bad.status, { error: bad.error });

  var raw = String((req.query && req.query.week) || "");
  var week = /^[1-9]\d{0,3}$/.test(raw) ? parseInt(raw, 10) : NaN;
  if (!week || week < 1) {
    return lib.json(res, 400, { error: "query param week (integer >= 1) is required" });
  }
  var pack = packs.byWeek(week);
  if (!pack) return lib.json(res, 404, { error: "no pack for week " + week });

  var store = lib.getStore();
  if (!store) return lib.json(res, 503, { error: "storage unavailable" });
  if (await lib.limitOr429(req, res, "board", RATE_TOKENS, RATE_WINDOW,
    "Too many leaderboard requests from your network in the last minute. Wait a minute and try again.")) return;

  var state = packs.state(pack, lib.now());
  var entries = [];
  var count = 0;
  try {
    var boardKey = lib.KEYS.board(pack.id);
    count = await store.zcard(boardKey);
    if (state === "closed" && count) {
      var codes = await store.zrange(boardKey, 0, TOP - 1, { rev: true });
      var records = codes.length ? await store.mget.apply(store, codes.map(function (c) {
        return lib.KEYS.sub(String(c));
      })) : [];
      records.forEach(function (rec) {
        if (!rec || typeof rec !== "object") return; // expired or unreadable
        entries.push({
          agent: rec.consent && rec.consent.publish ? rec.agent : "anonymous",
          total: rec.total,
          stars: rec.stars,
          levels: (rec.scores || []).filter(function (s) { return s.n >= 1 && s.n <= 4; }).map(levelView),
          provisional: true,
          created_at: rec.created_at
        });
      });
    }
  } catch (e) {
    return lib.json(res, 503, { error: "storage unavailable" });
  }
  entries.sort(function (a, b) {
    return (b.total - a.total) || String(a.created_at).localeCompare(String(b.created_at));
  });
  entries.forEach(function (e) { delete e.created_at; });

  lib.json(res, 200, {
    week: week,
    state: state,
    count: count,
    entries: entries,
    closes: pack.closes,
    closes_label: pack.closes_label,
    provisional: true
  }, { "Cache-Control": CACHE });
};
