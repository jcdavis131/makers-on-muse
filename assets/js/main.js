/* Makers on Muse — interactions. Zero dependencies.
   - nav: the three group buttons (Play, Library, About) and the phone
     Menu panel. The markup is partials/nav.html, stamped into each page
     with the current link already marked (scripts/stamp-layout.mjs).
   - Mabel plush: fetches assets/img/mabel-plush.svg once, inlines into every
     [data-mabel] slot, applies variant class (is-type default, is-knit, is-wave)
   The leaderboard page has its own script, assets/js/board.js. */
(function(){
  "use strict";

  /* ---------- nav ---------- */
  // Without this class, CSS opens a group on hover and keyboard focus.
  document.documentElement.classList.add("js");

  var header = document.querySelector("header.nav");
  var toggle = document.querySelector(".nav-toggle");
  var links = document.getElementById("navlinks");
  var groups = Array.prototype.slice.call(document.querySelectorAll(".nav-group-btn"));

  function setGroup(btn, open){ btn.setAttribute("aria-expanded", open ? "true" : "false"); }
  function isOpen(btn){ return btn.getAttribute("aria-expanded") === "true"; }
  function closeGroups(except){
    groups.forEach(function(b){ if(b !== except && isOpen(b)) setGroup(b, false); });
  }
  function closePanel(){
    if(links && links.classList.contains("open")){
      links.classList.remove("open");
      if(toggle) toggle.setAttribute("aria-expanded", "false");
      return true;
    }
    return false;
  }

  if(toggle && links){
    toggle.addEventListener("click", function(){
      var open = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      if(!open) closeGroups();
    });
  }
  groups.forEach(function(btn){
    btn.addEventListener("click", function(){
      var open = !isOpen(btn);
      closeGroups(btn);
      setGroup(btn, open);
    });
    // Tabbing out of a group closes it. A click elsewhere is handled below.
    var group = btn.parentNode;
    group.addEventListener("focusout", function(e){
      if(e.relatedTarget && !group.contains(e.relatedTarget)) setGroup(btn, false);
    });
  });
  document.addEventListener("keydown", function(e){
    if(e.key !== "Escape" && e.key !== "Esc") return;
    var openBtn = groups.filter(isOpen)[0];
    if(openBtn){
      setGroup(openBtn, false);
      openBtn.focus();
    } else if(closePanel() && toggle){
      toggle.focus();
    }
  });
  document.addEventListener("click", function(e){
    var t = e.target;
    if(header && t && header.contains(t)){
      if(!(t.closest && t.closest(".nav-group"))) closeGroups();
      return;
    }
    closeGroups();
    closePanel();
  });

  /* ---------- Mabel inliner ---------- */
  var svgCache = null;
  function fetchMabel(){
    if(svgCache) return svgCache;
    svgCache = fetch("/assets/img/mabel-plush.svg", {cache:"force-cache"})
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
