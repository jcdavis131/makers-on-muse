/* skills.js — client-side search over the full skills library.
   Filters the skill cards as you type; no network, no tracking. */
(function () {
  "use strict";
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }
  ready(function () {
    var input = document.getElementById("skill-search");
    var lib = document.getElementById("skill-library");
    var count = document.getElementById("skill-count");
    if (!input || !lib) return;
    var cards = Array.prototype.slice.call(lib.querySelectorAll(".skill-card"));
    function apply() {
      var q = input.value.trim().toLowerCase();
      var shown = 0;
      cards.forEach(function (c) {
        var hit = !q || (c.getAttribute("data-search") || "").indexOf(q) !== -1;
        c.style.display = hit ? "" : "none";
        if (hit) shown++;
      });
      if (count) count.textContent = q ? ("Showing " + shown + " of " + cards.length + " skills") : "";
    }
    input.addEventListener("input", apply);
  });
})();
