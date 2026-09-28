/* Makers on Muse — season calendar. Zero dependencies.
   One source of truth for week dates, used by the pages and by the Node
   tests (scripts/test-copy.mjs). All instants are UTC.

   Season 1, Week 1 opens Mon Oct 5 2026, 6:00 AM CT (CDT, UTC-5) and
   takes entries through Sun Oct 11 2026, 11:59 PM CT. It is closed from
   midnight CT, which is 05:00 UTC on Mon Oct 12. Daylight saving time
   ends Nov 1 2026, so later weeks must be written in CST (UTC-6).

   Browser: sets window.MOM_SEASON and fills any [data-season-status]
   element with the current status line. The element's static text should
   be the "before" line, so the page is right without JavaScript too. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MOM_SEASON = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var WEEKS = [
    {
      season: 1,
      week: 1,
      title: "First Day as Chief of Staff",
      opens: "2026-10-05T11:00:00Z",
      closes: "2026-10-12T05:00:00Z",
      range: "Mon Oct 5 – Sun Oct 11, 2026",
      opensLabel: "Mon Oct 5, 2026, 6:00 AM CT",
      closesLabel: "Sun Oct 11, 2026, 11:59 PM CT"
    }
  ];

  function ms(x) {
    if (x instanceof Date) return x.getTime();
    if (typeof x === "number") return x;
    return Date.parse(x);
  }

  /* The week that matters at `now`: the first one not yet closed,
     or the last one once every week has closed. */
  function current(now) {
    var t = ms(now);
    for (var i = 0; i < WEEKS.length; i++) {
      if (t < ms(WEEKS[i].closes)) return WEEKS[i];
    }
    return WEEKS[WEEKS.length - 1];
  }

  /* "before" | "open" | "closed" for a week (default: current(now)). */
  function status(now, wk) {
    var t = ms(now);
    wk = wk || current(t);
    if (t < ms(wk.opens)) return "before";
    if (t < ms(wk.closes)) return "open";
    return "closed";
  }

  function statusText(now) {
    var wk = current(now);
    var s = status(now, wk);
    var name = "Week " + wk.week;
    if (s === "before") return name + " opens " + wk.opensLabel + " and closes " + wk.closesLabel + ".";
    if (s === "open") return name + " is open until " + wk.closesLabel + ".";
    return name + " closed " + wk.closesLabel + ".";
  }

  /* What the submit form shows at `now`: open, or closed with a reason. */
  function submitGate(now) {
    var wk = current(now);
    var s = status(now, wk);
    if (s === "open") return { open: true, week: wk.week };
    if (s === "before") {
      return {
        open: false,
        week: wk.week,
        title: "Submissions open " + wk.opensLabel + ".",
        body: "Week " + wk.week + " runs " + wk.range + " and closes " +
          wk.closesLabel + ". The form below is a preview until then."
      };
    }
    return {
      open: false,
      week: wk.week,
      title: "Submissions are closed.",
      body: "Week " + wk.week + " closed " + wk.closesLabel +
        ". The next week's dates aren't posted yet."
    };
  }

  var api = {
    WEEKS: WEEKS,
    current: current,
    status: status,
    statusText: statusText,
    submitGate: submitGate
  };

  if (typeof document !== "undefined") {
    var fill = function () {
      var els = document.querySelectorAll("[data-season-status]");
      var text = statusText(Date.now());
      for (var i = 0; i < els.length; i++) els[i].textContent = text;
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fill);
    } else {
      fill();
    }
  }

  return api;
});
