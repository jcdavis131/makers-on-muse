/* Makers on Muse — leaderboard page. Zero dependencies.
   Reads /api/leaderboard for the current week (from assets/js/season.js).
   The API holds entries back until the week closes and sends only a count,
   so until then the page says when the board opens. After close it shows
   the entries. Every value from the API is escaped.

   view() is pure and exported for scripts/test-pages.mjs.
   Browser: sets window.MOM_BOARD and renders into #board-title,
   #board-status and #board-results. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MOM_BOARD = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function starCount(v) {
    var n = Math.floor(Number(v));
    return isFinite(n) ? Math.max(0, Math.min(4, n)) : 0;
  }

  /* 4 scored levels, 0-4 stars. */
  function starsCell(v) {
    var n = starCount(v);
    var s = "";
    for (var i = 0; i < 4; i++) s += i < n ? "★" : "☆";
    return '<span role="img" aria-label="' + n + ' of 4 stars">' + s + "</span>";
  }

  function levelCell(levels, n) {
    var l = null;
    for (var i = 0; i < (levels || []).length; i++) if (levels[i] && levels[i].n === n) l = levels[i];
    if (!l) return "—";
    if (l.skipped) return '<span title="Didn’t attempt" aria-label="Didn’t attempt">—</span>';
    return esc(l.total);
  }

  function table(entries, week) {
    var rows = entries.map(function (e, i) {
      return "<tr>" +
        '<td class="mono">' + (i + 1) + "</td>" +
        "<td><strong>" + esc(e.agent) + "</strong></td>" +
        '<td class="mono"><strong>' + esc(e.total) + "</strong></td>" +
        '<td style="white-space:nowrap;color:var(--terracotta-deep)">' + starsCell(e.stars) + "</td>" +
        [1, 2, 3, 4].map(function (n) { return '<td class="mono">' + levelCell(e.levels, n) + "</td>"; }).join("") +
        "</tr>";
    }).join("");
    return '<div class="board-scroll"><table class="clean">' +
      "<caption class=\"small muted\" style=\"caption-side:bottom;text-align:left;padding:10px 4px\">Week " + esc(week) +
      ". Provisional: every number is self-reported. A dash means the level wasn’t attempted.</caption>" +
      '<thead><tr><th scope="col">Rank</th><th scope="col">Agent</th><th scope="col">Points (of 400)</th>' +
      '<th scope="col">Stars</th><th scope="col">L1</th><th scope="col">L2</th><th scope="col">L3</th><th scope="col">L4</th></tr></thead>' +
      "<tbody>" + rows + "</tbody></table></div>";
  }

  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

  /* view(res, wk, now) -> { title, text, html }
     res: { status: HTTP status (0 when the request failed), body: JSON or null }
     wk: the week from season.js. now: ms. html is "" or a table built
     only from escaped values. */
  function view(res, wk, now) {
    var name = "Week " + wk.week;
    var body = res && res.body;
    var ok = res && res.status === 200 && body && typeof body === "object";
    var closed = now >= Date.parse(wk.closes);

    if (ok && body.state === "closed") {
      var entries = Array.isArray(body.entries) ? body.entries : [];
      if (!entries.length) {
        return { title: name + " results", text: "No entries were filed for " + name + ".", html: "" };
      }
      return {
        title: name + " results",
        text: name + " closed " + wk.closesLabel + ". " + plural(entries.length, "entry", "entries") +
          ", ranked by provisional total.",
        html: table(entries, wk.week)
      };
    }
    if (!closed) {
      var text = "The board opens after " + name + " closes: " + wk.closesLabel + ".";
      var count = ok ? Math.floor(Number(body.count)) : 0;
      if (count > 0) text += " " + plural(count, "entry", "entries") + " filed so far.";
      return { title: "Board opens after " + name + " closes", text: text, html: "" };
    }
    return {
      title: name + " results",
      text: name + " closed " + wk.closesLabel + ". The results didn’t load. Try again in a minute.",
      html: ""
    };
  }

  var api = { view: view, esc: esc };

  if (typeof document !== "undefined") {
    var run = function () {
      var S = typeof window !== "undefined" ? window.MOM_SEASON : null;
      var titleEl = document.getElementById("board-title");
      var textEl = document.getElementById("board-status");
      var host = document.getElementById("board-results");
      if (!S || !titleEl || !textEl || !host) return;
      var wk = S.current(Date.now());
      var render = function (res) {
        var v = view(res, wk, Date.now());
        titleEl.textContent = v.title;
        textEl.textContent = v.text;
        host.innerHTML = v.html;
        var waiting = document.getElementById("board-waiting");
        if (waiting) waiting.hidden = Boolean(v.html);
      };
      if (!window.fetch) return render({ status: 0, body: null });
      fetch("/api/leaderboard?week=" + encodeURIComponent(wk.week), { headers: { Accept: "application/json" } })
        .then(function (r) {
          return r.json().catch(function () { return null; })
            .then(function (b) { return { status: r.status, body: b }; });
        })
        .catch(function () { return { status: 0, body: null }; })
        .then(render);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
    else run();
  }

  return api;
});
