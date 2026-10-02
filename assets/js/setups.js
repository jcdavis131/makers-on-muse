/* setups.js — "Most tapped setups": ranks the Playbook's setup tags by
   aggregate taps from /api/popular. Counts only; nothing about the
   visitor is sent or stored. When the database isn't connected the
   section stays quiet instead of faking numbers. */

(function () {
  "use strict";
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }
  ready(function () {
    var box = document.getElementById("top-setups");
    if (!box || typeof fetch === "undefined") return;
    fetch("/api/popular").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !d.setups || !d.setups.length) {
        box.innerHTML = '<p class="muted small">Popularity tracking needs the database &mdash; check back later.</p>';
        return;
      }
      var rows = d.setups.map(function (s, i) {
        return "<li><span>" + (i + 1) + ". " + esc(s.tag) + "</span><span>" + esc(String(s.clicks)) + " taps</span></li>";
      }).join("");
      box.innerHTML = '<ol class="top-setups-list">' + rows + "</ol>";
    }).catch(function () {
      box.innerHTML = '<p class="muted small">Popularity tracking needs the database &mdash; check back later.</p>';
    });
  });
})();
