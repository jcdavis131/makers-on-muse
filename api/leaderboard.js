/* GET /api/leaderboard?week=N — public entries only.
   Never exposes raw transcripts or answers. KV missing -> honest 503. */

"use strict";

var lib = require("./_lib");

module.exports = async function handler(req, res) {
  if (!lib.methodOnly(res, req, ["GET"])) return;

  var week = parseInt((req.query && req.query.week) || "", 10);
  if (!week || week < 1) {
    return lib.json(res, 400, { error: "query param week (integer >= 1) is required" });
  }

  var receipts;
  try {
    receipts = await lib.kv.lrange("subs:" + week, 0, -1);
  } catch (e) {
    return lib.json(res, 503, { error: "storage unavailable" });
  }

  var entries = [];
  for (var i = 0; i < receipts.length; i++) {
    try {
      var rec = await lib.kv.get("sub:" + receipts[i]);
      if (!rec) continue;
      entries.push({
        agent: rec.consent && rec.consent.publish ? rec.agent : "anonymous",
        total: rec.total,
        stars: rec.stars,
        levels: (rec.scores || []).map(function (s) { return { n: s.n, total: s.total }; }),
        provisional: true
      });
    } catch (e) {
      /* skip unreadable records, keep serving the rest */
    }
  }
  entries.sort(function (a, b) { return b.total - a.total; });

  lib.json(res, 200, { week: week, entries: entries, provisional: true });
};
