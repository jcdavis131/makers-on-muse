/* Makers on Muse — receipt page. Zero dependencies.
   The owner's view of one entry: its status (received, under review,
   verified), its provisional scores, and a delete button. The secret token
   is the only key. It arrives in the link's fragment (#token=mom_…), which
   browsers never send to a server, and this page removes it from the
   address bar as soon as it has read it. The token goes to /api/receipt
   only in a POST body.

   Pure pieces (tokenFromHash, statusView, errorView, deletedView) are
   exported for scripts/test-pages.mjs. Every value from the API is
   escaped. Browser: sets window.MOM_RECEIPT. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MOM_RECEIPT = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var TOKEN_RE = /^mom_[A-Za-z0-9_-]{22}$/;

  var STEPS = [
    { id: "received", label: "Received",
      text: "Filed. It counts on the board, provisionally, once the week closes. Nobody reviews entries yet: server grading isn’t built." },
    { id: "under_review", label: "Under review",
      text: "A grader is checking this entry." },
    { id: "verified", label: "Verified",
      text: "A grader has checked this entry." }
  ];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* "#token=mom_…" (or a bare "#mom_…") -> the token, or "". */
  function tokenFromHash(hash) {
    var h = String(hash == null ? "" : hash).replace(/^#/, "");
    var m = /(?:^|&)token=([^&]*)/.exec(h);
    var v = m ? m[1] : h;
    try { v = decodeURIComponent(v); } catch (e) { /* keep raw */ }
    v = v.trim();
    return TOKEN_RE.test(v) ? v : "";
  }

  function validToken(t) { return TOKEN_RE.test(String(t == null ? "" : t).trim()); }

  function when(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    try {
      return d.toLocaleString("en-US", {
        timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric",
        year: "numeric", hour: "numeric", minute: "2-digit"
      }) + " CT";
    } catch (e) { return d.toISOString(); }
  }

  function row(k, v) {
    return '<div class="rc-row"><dt>' + esc(k) + "</dt><dd>" + v + "</dd></div>";
  }

  /* statusView(d) -> HTML for a 200 status response. */
  function statusView(d) {
    d = d || {};
    var current = 0;
    for (var i = 0; i < STEPS.length; i++) if (STEPS[i].id === d.status) current = i;
    var steps = STEPS.map(function (s, i) {
      var cls = i < current ? "done" : i === current ? "now" : "later";
      return '<li class="' + cls + '"' + (i === current ? ' aria-current="step"' : "") + ">" +
        "<strong>" + esc(s.label) + "</strong>" + (i === current ? "<span>" + esc(s.text) + "</span>" : "") + "</li>";
    }).join("");
    var scores = (Array.isArray(d.scores) ? d.scores : []).map(function (s) {
      var right;
      if (s && s.exhibition) right = "Exhibition, unscored";
      else if (s && s.skipped) right = "Didn’t attempt · 0 / 100";
      else right = esc(s && s.total) + " / 100" + (s && s.star ? ' <span class="star" role="img" aria-label="star">★</span>' : "");
      return "<li><span>Level " + esc(s && s.n) + "</span><span>" + right + "</span></li>";
    }).join("");
    var closed = d.week_state === "closed";
    return '<p class="eyebrow">Receipt</p>' +
      '<p class="rc-code">' + esc(d.receipt) + "</p>" +
      '<ol class="rc-steps" aria-label="Status">' + steps + "</ol>" +
      '<dl class="rc-list">' +
        row("Week", "Season " + esc(d.season) + ", Week " + esc(d.week) + (closed ? " (closed)" : "")) +
        row("Filed", esc(when(d.created_at))) +
        row("Handle", esc(d.handle)) +
        row("Agent", esc(d.agent)) +
        row("On the board", d.published ? "As " + esc(d.agent) + ", after the week closes" : "As “anonymous”, after the week closes") +
        row("Contact email", d.contact_on_file ? "On file (not shown here)" : "None given") +
        row("Provisional total", esc(d.total) + " / 400, " + esc(d.stars) + " of 4 stars") +
        row("Kept until", esc(when(d.expires))) +
      "</dl>" +
      '<ul class="rc-scores">' + scores + "</ul>" +
      '<p class="small muted">Every number here is self-reported and provisional. Nothing is verified yet.</p>';
  }

  /* errorView(status, body) -> { title, text } for a failed request. */
  function errorView(status, body) {
    if (status === 400) return { title: "That isn’t a valid token.", text: "A token starts with mom_ and has 26 characters. Copy it again from where you saved it." };
    if (status === 404) return { title: "No entry matches this token.", text: "It may have been deleted, or it expired 90 days after its week closed." };
    if (status === 429) return { title: "Too many tries.", text: "Wait a minute, then try again." };
    if (status === 503) {
      return { title: "Entries can’t be looked up right now.",
        text: (body && body.message) || "Storage isn’t connected yet, so there is nothing to look up. This is on our side, not yours." };
    }
    if (!status) return { title: "Could not reach the site.", text: "Check your connection and try again." };
    return { title: "Something went wrong.", text: "The site answered with HTTP " + Number(status) + ". Try again in a minute." };
  }

  /* deletedView(d) -> HTML after a successful delete. */
  function deletedView(d) {
    d = d || {};
    return '<p class="eyebrow">Deleted</p>' +
      "<h2>Entry " + esc(d.receipt) + " is deleted.</h2>" +
      "<p>Its answers, scores and handle claim are gone from our storage, and the token no longer works.</p>" +
      (d.can_refile
        ? '<p>Week ' + esc(d.week) + ' is still open, so you can <a href="submit.html">file again</a> with the same handle.</p>'
        : "<p>The week is closed, so it can’t be filed again.</p>");
  }

  var api = {
    TOKEN_RE: TOKEN_RE,
    tokenFromHash: tokenFromHash,
    validToken: validToken,
    statusView: statusView,
    errorView: errorView,
    deletedView: deletedView,
    esc: esc
  };

  if (typeof document !== "undefined" && typeof window !== "undefined") {
    var run = function () {
      var form = document.getElementById("tok-form");
      if (!form) return;
      var input = document.getElementById("tok");
      var inputErr = document.getElementById("tok-err");
      var msg = document.getElementById("rc-msg");
      var result = document.getElementById("rc-result");
      var body = document.getElementById("rc-body");
      var del = document.getElementById("rc-delete");
      var confirmBox = document.getElementById("rc-confirm");
      var checkBtn = document.getElementById("tok-check");
      var current = "";

      // Read the token from the fragment, then drop it from the address bar.
      var fromHash = tokenFromHash(window.location.hash);
      if (window.location.hash && window.history && window.history.replaceState) {
        try { window.history.replaceState(null, "", window.location.pathname + window.location.search); } catch (e) { /* ignore */ }
      }

      function setInputError(text) {
        if (text) {
          input.setAttribute("aria-invalid", "true");
          input.setAttribute("aria-describedby", "tok-hint tok-err");
          inputErr.textContent = text;
          inputErr.hidden = false;
        } else {
          input.removeAttribute("aria-invalid");
          input.setAttribute("aria-describedby", "tok-hint");
          inputErr.textContent = "";
          inputErr.hidden = true;
        }
      }
      function showMsg(v) {
        if (!v) { msg.hidden = true; msg.innerHTML = ""; return; }
        msg.innerHTML = "<p><strong>" + esc(v.title) + "</strong></p><p>" + esc(v.text) + "</p>";
        msg.hidden = false;
      }
      function call(payload) {
        return fetch("/api/receipt", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
          referrerPolicy: "no-referrer"
        }).then(function (r) {
          return r.json().catch(function () { return null; })
            .then(function (b) { return { status: r.status, body: b }; });
        }).catch(function () { return { status: 0, body: null }; });
      }
      function lookup(tok) {
        showMsg(null);
        result.hidden = true;
        confirmBox.hidden = true;
        checkBtn.disabled = true;
        call({ token: tok, action: "status" }).then(function (res) {
          checkBtn.disabled = false;
          if (res.status === 200 && res.body) {
            current = tok;
            body.innerHTML = statusView(res.body);
            del.hidden = false;
            result.hidden = false;
            result.focus();
          } else {
            current = "";
            showMsg(errorView(res.status, res.body));
          }
        });
      }

      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var tok = input.value.trim();
        if (!validToken(tok)) {
          setInputError(tok ? "A token starts with mom_ and has 26 characters." : "Paste the secret token from your receipt.");
          input.focus();
          return;
        }
        setInputError("");
        lookup(tok);
      });
      document.getElementById("rc-delete-start").addEventListener("click", function () {
        confirmBox.hidden = false;
        document.getElementById("rc-delete-no").focus();
      });
      document.getElementById("rc-delete-no").addEventListener("click", function () {
        confirmBox.hidden = true;
        document.getElementById("rc-delete-start").focus();
      });
      document.getElementById("rc-delete-yes").addEventListener("click", function () {
        if (!current) return;
        var yes = this;
        yes.disabled = true;
        call({ token: current, action: "delete" }).then(function (res) {
          yes.disabled = false;
          if (res.status === 200 && res.body && res.body.deleted) {
            current = "";
            input.value = "";
            body.innerHTML = deletedView(res.body);
            del.hidden = true;
            confirmBox.hidden = true;
            result.focus();
          } else {
            showMsg(errorView(res.status, res.body));
          }
        });
      });

      if (fromHash) {
        input.value = fromHash;
        lookup(fromHash);
      }
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
    else run();
  }

  return api;
});
