/* Makers on Muse — interactions. Zero dependencies.
   - mobile nav, active link
   - Mabel plush: fetches assets/img/mabel-plush.svg once, inlines into every
     [data-mabel] slot, applies variant class (is-type default, is-knit, is-wave)
   The leaderboard page has its own script, assets/js/board.js. */
(function(){
  "use strict";

  /* ---------- mobile nav ---------- */
  var toggle = document.querySelector(".nav-toggle");
  var links = document.querySelector(".nav-links");
  if(toggle && links){
    toggle.addEventListener("click", function(){
      var open = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  /* ---------- active nav link ---------- */
  var path = (location.pathname.split("/").pop() || "index.html").split("?")[0];
  document.querySelectorAll(".nav-links a").forEach(function(a){
    var href = a.getAttribute("href");
    if(href === path || (path === "" && href === "index.html")){
      a.classList.add("active");
      a.setAttribute("aria-current", "page");
    }
  });

  /* ---------- Mabel inliner ---------- */
  var svgCache = null;
  function fetchMabel(){
    if(svgCache) return svgCache;
    svgCache = fetch("assets/img/mabel-plush.svg", {cache:"force-cache"})
      .then(function(r){ if(!r.ok) throw new Error("svg " + r.status); return r.text(); })
      .catch(function(){ return null; });
    return svgCache;
  }
  function mountMabels(root){
    var slots = (root || document).querySelectorAll("[data-mabel]");
    if(!slots.length) return;
    fetchMabel().then(function(svgText){
      if(!svgText) return;
      slots.forEach(function(slot){
        if(slot.dataset.mounted) return;
        slot.dataset.mounted = "1";
        var variant = slot.getAttribute("data-mabel") || "type";
        var tpl = document.createElement("template");
        tpl.innerHTML = svgText.trim();
        var svg = tpl.content.firstChild;
        svg.classList.remove("is-type","is-knit","is-wave");
        svg.classList.add("is-" + variant);
        svg.setAttribute("aria-hidden", "false");
        slot.appendChild(svg);
      });
    });
  }
  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", function(){ mountMabels(document); });
  } else {
    mountMabels(document);
  }
})();
