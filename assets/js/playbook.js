/* Makers on Muse — the Playbook page. Zero dependencies.

   Pure pieces first, shared with the Node tests (scripts/test-playbook.mjs):
   reading and writing the filter state in the query string, matching,
   and the escaped card markup. Then the page wiring, which runs only in a
   browser that has the Playbook's grid.

   Query string (every value is checked against the data before use):
     ?w=<id>          one workflow, its recipe open (a permalink)
     ?track=persona   or moment
     ?group=<group>   a persona or moment chip; implies its track
     ?diff=1..5       one difficulty
     ?q=<text>        search, up to 100 characters

   Browser: sets window.MOM_PLAYBOOK. Node: module.exports. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MOM_PLAYBOOK = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var TRACKS = ["all", "persona", "moment"];
  var Q_MAX = 100;

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function human(s) {
    return String(s).split("-").map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(" ");
  }

  function emptyState() { return { track: "all", group: null, diff: 0, q: "", w: null, comm: 0 }; }

  /* groups(data) -> { persona: [...], moment: [...] } in data order. */
  function groups(data) {
    var out = { persona: [], moment: [] };
    data.forEach(function (w) {
      var arr = out[w.track];
      if (arr && arr.indexOf(w.group) === -1) arr.push(w.group);
    });
    return out;
  }
  function trackOfGroup(data, g) {
    for (var i = 0; i < data.length; i++) if (data[i].group === g) return data[i].track;
    return null;
  }
  function byId(data, id) {
    for (var i = 0; i < data.length; i++) if (data[i].id === id) return data[i];
    return null;
  }

  /* parseQuery("?track=persona&group=parent", data) -> state. Unknown or
     malformed values fall back to the defaults; nothing from the URL is
     used unless it names a real track, group, difficulty or id. */
  function parseQuery(search, data) {
    var s = emptyState();
    var p;
    try { p = new URLSearchParams(String(search || "")); } catch (e) { return s; }
    var w = p.get("w");
    if (w && byId(data, w)) s.w = w;
    var track = p.get("track");
    if (track && TRACKS.indexOf(track) > -1) s.track = track;
    var g = p.get("group");
    var gt = g ? trackOfGroup(data, g) : null;
    if (gt) { s.group = g; s.track = gt; }
    var d = p.get("diff");
    if (d && /^[1-5]$/.test(d)) s.diff = Number(d);
    var q = p.get("q");
    if (q) s.q = q.trim().slice(0, Q_MAX);
    if (p.get("comm") === "1") s.comm = 1;
    return s;
  }

  /* toQuery(state) -> "" or "?..." (defaults left out). A permalink
     carries only its id. */
  function toQuery(state) {
    var p = [];
    if (state.w) return "?w=" + encodeURIComponent(state.w);
    if (state.track && state.track !== "all") p.push("track=" + encodeURIComponent(state.track));
    if (state.group) p.push("group=" + encodeURIComponent(state.group));
    if (state.diff) p.push("diff=" + state.diff);
    if (state.q) p.push("q=" + encodeURIComponent(state.q));
    if (state.comm) p.push("comm=1");
    return p.length ? "?" + p.join("&") : "";
  }

  function matches(w, state) {
    if (state.w) return w.id === state.w;
    if (state.comm && !w.claimed_by) return false;
    if (state.track !== "all" && w.track !== state.track) return false;
    if (state.group && w.group !== state.group) return false;
    if (state.diff && w.difficulty !== state.diff) return false;
    if (state.q) {
      var hay = (w.title + " " + w.group + " " + w.test + " " + w.proves + " " + w.recipe.join(" ") + " " + w.setup.join(" ") + " " + (w.claimed_by || "")).toLowerCase();
      if (hay.indexOf(state.q.toLowerCase()) === -1) return false;
    }
    return true;
  }
  function filter(data, state) { return data.filter(function (w) { return matches(w, state); }); }

  /* permalink(pageUrl, id) -> the page's address with ?w=<id>. */
  function permalink(pageUrl, id) {
    var base = String(pageUrl || "/playbook").split("#")[0].split("?")[0];
    return base + "?w=" + encodeURIComponent(id);
  }

  function dots(n) {
    var d = Math.max(0, Math.min(5, Number(n) || 0));
    var h = '<span class="pb-dots" role="img" aria-label="Difficulty ' + d + ' of 5">';
    for (var i = 1; i <= 5; i++) h += "<i" + (i <= d ? ' class="on"' : "") + "></i>";
    return h + "</span>";
  }

  /* cardHtml(w, { open }) -> one workflow card. Every value is escaped. */
  function cardHtml(w, opts) {
    opts = opts || {};
    var tag = w.track === "persona" ? "persona" : "moment";
    var setup = w.setup.length
      ? w.setup.map(function (s) { return '<a class="pb-tagchip" href="#tags">' + esc(s) + "</a>"; }).join("")
      : '<span class="none">no setup needed</span>';
    var steps = w.recipe.map(function (s, i) {
      return '<li><div class="pb-step-head"><span>Step ' + (i + 1) + "</span>" +
        '<button type="button" class="pb-copy" aria-label="Copy step ' + (i + 1) + " of " + esc(w.title) + '">Copy</button></div>' +
        "<pre><code>" + esc(s) + "</code></pre></li>";
    }).join("");
    var link = permalink("/playbook", w.id);
    var comm = w.claimed_by ? " is-community" : "";
    var attrib = w.claimed_by
      ? '<p class="pb-attrib"><span class="who">Claimed by</span> ' + esc(w.claimed_by) +
        (w.trust ? ' <span class="pb-trust">receipts: ' + esc(w.trust) + "</span>" : "") + "</p>"
      : "";
    var noteHtml = "";
    if (w.note && w.review_gate) noteHtml = '<p class="pb-gate"><strong>Review before submit</strong>' + esc(w.note) + "</p>";
    else if (w.note) noteHtml = '<p class="pb-note-card">' + esc(w.note) + "</p>";
    return '<article class="pb-card' + comm + '" id="w-' + esc(w.id) + '" data-id="' + esc(w.id) + '">' +
      '<div class="pb-card-top"><span class="pb-tag ' + tag + '">' + esc(human(w.group)) + "</span>" + dots(w.difficulty) + "</div>" +
      '<h3><a href="' + esc(link) + '">' + esc(w.title) + "</a></h3>" +
      attrib +
      '<p class="pb-time">' + esc(w.time) + "</p>" +
      '<div class="pb-setup" role="group" aria-label="Setup">' + setup + "</div>" +
      noteHtml +
      '<details class="pb-recipe"' + (opts.open ? " open" : "") + "><summary>Recipe · " + w.recipe.length + " steps</summary><ol>" + steps + "</ol></details>" +
      '<p class="pb-test"><strong>The test</strong>' + esc(w.test) + "</p>" +
      '<p class="pb-proves"><strong>Proves</strong>' + esc(w.proves) + "</p>" +
      '<div class="pb-links"><button type="button" class="pb-link" data-id="' + esc(w.id) + '">Copy link</button>' +
      '<a href="/pack">Train this muscle &rarr;</a><a href="/setups">Setup notes &rarr;</a></div>' +
      "</article>";
  }

  function cardsHtml(list, open) {
    return list.map(function (w) { return cardHtml(w, { open: open }); }).join("");
  }

  function chipsHtml(label, list) {
    return '<span class="pb-chips-label">' + esc(label) + "</span>" +
      list.map(function (g) {
        return '<button type="button" data-group="' + esc(g) + '" aria-pressed="false">' + esc(human(g)) + "</button>";
      }).join("");
  }

  function countText(shown, total, state) {
    if (state.w) return "Showing 1 workflow of " + total + ".";
    return shown + " of " + total + " workflows";
  }

  var api = {
    esc: esc,
    human: human,
    emptyState: emptyState,
    groups: groups,
    parseQuery: parseQuery,
    toQuery: toQuery,
    matches: matches,
    filter: filter,
    permalink: permalink,
    cardHtml: cardHtml,
    cardsHtml: cardsHtml,
    chipsHtml: chipsHtml,
    countText: countText
  };

  /* ---------- page wiring (browser only) ---------- */
  if (typeof document !== "undefined" && typeof window !== "undefined") {
    var run = function () {
      var data = window.MOM_PLAYBOOKS;
      var grid = document.getElementById("pb-grid");
      if (!data || !grid) return;
      var empty = document.getElementById("pb-empty");
      var count = document.getElementById("pb-count");
      var q = document.getElementById("pb-q");
      var diff = document.getElementById("pb-diff");
      var clearBtn = document.getElementById("pb-clear");
      var single = document.getElementById("pb-single");
      var showAll = document.getElementById("pb-show-all");
      var personaChips = document.getElementById("persona-chips");
      var momentChips = document.getElementById("moment-chips");
      var state = parseQuery(window.location.search, data);

      var g = groups(data);
      personaChips.innerHTML = chipsHtml("Personas", g.persona);
      momentChips.innerHTML = chipsHtml("Moments", g.moment);

      function syncUrl() {
        try {
          window.history.replaceState(null, "", window.location.pathname + toQuery(state) + window.location.hash);
        } catch (e) { /* file:// or a locked-down frame: the page still works */ }
      }
      function syncUI() {
        document.querySelectorAll(".pb-track button").forEach(function (b) {
          b.setAttribute("aria-pressed", String(!state.w && b.getAttribute("data-track") === state.track));
        });
        document.querySelectorAll(".pb-chips button[data-group]").forEach(function (b) {
          b.setAttribute("aria-pressed", String(!state.w && b.getAttribute("data-group") === state.group));
        });
        document.querySelectorAll(".pb-track button[data-comm]").forEach(function (b) {
          b.setAttribute("aria-pressed", String(!state.w && state.comm === 1));
        });
        diff.value = String(state.diff);
        if (q.value !== state.q) q.value = state.q;
        if (single) single.hidden = !state.w;
      }
      function render() {
        var list = filter(data, state);
        grid.innerHTML = cardsHtml(list, Boolean(state.w));
        empty.hidden = list.length > 0;
        count.textContent = countText(list.length, data.length, state);
      }
      function update(changes) {
        // Any filter change leaves the single-workflow view.
        state.w = null;
        for (var k in changes) if (Object.prototype.hasOwnProperty.call(changes, k)) state[k] = changes[k];
        syncUI(); render(); syncUrl();
      }

      document.querySelector(".pb-track").addEventListener("click", function (e) {
        var b = e.target.closest("button"); if (!b) return;
        if (b.hasAttribute("data-comm")) { update({ comm: state.comm ? 0 : 1 }); return; }
        var t = b.getAttribute("data-track");
        var ch = { track: t };
        if (state.group && trackOfGroup(data, state.group) !== t) ch.group = null;
        update(ch);
      });
      [personaChips, momentChips].forEach(function (el) {
        el.addEventListener("click", function (e) {
          var b = e.target.closest("button[data-group]"); if (!b) return;
          var grp = b.getAttribute("data-group");
          if (!state.w && state.group === grp) update({ group: null });
          else update({ group: grp, track: trackOfGroup(data, grp) });
        });
      });
      diff.addEventListener("change", function () {
        var d = parseInt(diff.value, 10);
        update({ diff: d >= 1 && d <= 5 ? d : 0 });
      });
      var qt;
      q.addEventListener("input", function () {
        clearTimeout(qt);
        qt = setTimeout(function () { update({ q: q.value.trim().slice(0, 100) }); }, 150);
      });
      clearBtn.addEventListener("click", function () {
        state = emptyState();
        syncUI(); render(); syncUrl();
        q.focus();
      });
      if (showAll) showAll.addEventListener("click", function () {
        var id = state.w;
        state = emptyState();
        syncUI(); render(); syncUrl();
        var card = id && document.getElementById("w-" + id);
        if (card) {
          var h = card.querySelector("h3 a");
          if (h) h.focus();
        }
      });

      function copyText(text, btn, label) {
        function done(ok) {
          btn.textContent = ok ? "Copied" : "Copy failed";
          setTimeout(function () { btn.textContent = label; }, 1400);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
          return;
        }
        var t = document.createElement("textarea");
        t.value = text; t.setAttribute("readonly", ""); t.style.position = "absolute"; t.style.left = "-9999px";
        document.body.appendChild(t); t.select();
        var ok = false;
        try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
        document.body.removeChild(t);
        done(ok);
      }
      grid.addEventListener("click", function (e) {
        var c = e.target.closest(".pb-copy");
        if (c) {
          var li = c.closest("li");
          var code = li && li.querySelector("code");
          if (code) copyText(code.textContent, c, "Copy");
          return;
        }
        var l = e.target.closest(".pb-link");
        if (l) copyText(permalink(window.location.href, l.getAttribute("data-id")), l, "Copy link");
      });

      syncUI(); render(); syncUrl();

      // A permalink (?w=<id>) shows one workflow, below the hero and the
      // filters. Bring the "one workflow" notice and the card into view
      // and put focus on the card's link, so the visitor sees what the
      // link was for.
      if (state.w) {
        var linked = document.getElementById("w-" + state.w);
        var linkedA = linked && linked.querySelector("h3 a");
        if (linked) (single || linked).scrollIntoView({ block: "start" });
        if (linkedA) {
          try { linkedA.focus({ preventScroll: true }); } catch (e) { linkedA.focus(); }
        }
      }
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
    else run();
  }

  return api;
});
