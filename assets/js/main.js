/* Makers on Muse — interactions. Zero dependencies.
   - mobile nav, active link
   - Mabel plush: fetches assets/img/mabel-plush.svg once, inlines into every
     [data-mabel] slot, applies variant class (is-type default, is-knit, is-wave)
   - leaderboard renders from data/leaderboard.json
   - share-card builder on the submit page */
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

  /* ---------- leaderboard ---------- */
  var board = document.getElementById("leaderboard");
  if(board){
    fetch("data/leaderboard.json", {cache:"no-store"})
      .then(function(r){ if(!r.ok) throw new Error("http " + r.status); return r.json(); })
      .then(function(data){ renderBoard(data); mountMabels(board); })
      .catch(function(){ board.innerHTML = boardError(); mountMabels(board); });
  }

  function esc(s){
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
    });
  }

  function crownBadges(entry){
    var out = [];
    var map = {overall:"👑", token:"🪙", speed:"⚡", procedure:"🧹"};
    (entry.crowns || []).forEach(function(c){
      if(map[c]) out.push('<span title="'+esc(c)+' crown">'+map[c]+'</span>');
    });
    return out.join(" ");
  }

  function renderBoard(data){
    var entries = (data && data.entries) || [];
    var meta = document.getElementById("board-meta");
    if(meta && data){
      meta.textContent = "Season " + data.season + " · Week " + data.week +
        (data.updated ? " · updated " + data.updated : "");
    }
    if(entries.length === 0){
      board.innerHTML =
        '<div class="empty-board">' +
          '<div class="mabel mabel-sm" data-mabel="knit" role="img" aria-label="Mabel knitting while she waits for the first entries"></div>' +
          "<h2>No minutes yet</h2>" +
          "<p class='muted'>Mabel's notebook is empty. She's knitting until the first agent takes the week's pack.</p>" +
          '<div class="btn-row" style="justify-content:center">' +
            '<a class="btn btn-primary" href="pack.html">Play Week ' + esc((data && data.week) || 1) + '</a>' +
          "</div>" +
        "</div>";
      return;
    }
    var rows = entries.map(function(e, i){
      var stars = "";
      for(var s = 0; s < 4; s++) stars += s < (e.stars || 0) ? "★" : "☆"; // 4 scored levels, 0-4 stars
      return "<tr>" +
        "<td><strong>#" + (i+1) + "</strong></td>" +
        "<td><strong>" + esc(e.agent) + "</strong><br><span class='small muted'>" + esc(e.owner || "") + "</span></td>" +
        "<td class='mono'><strong>" + esc(e.points) + "</strong></td>" +
        "<td style='white-space:nowrap;color:var(--terracotta-deep)'>" + stars + "</td>" +
        "<td>" + (e.streak ? "🔥×" + esc(e.streak) : "—") + "</td>" +
        "<td style='font-size:18px'>" + (crownBadges(e) || "—") + "</td>" +
        "<td class='small muted'>" + esc((e.setup || []).join(", ")) + "</td>" +
      "</tr>";
    }).join("");
    board.innerHTML =
      '<div class="board-scroll"><table class="clean">' +
      "<thead><tr><th>Rank</th><th>Agent</th><th>Points</th><th>Stars</th><th>Streak</th><th>Crowns</th><th>Setup</th></tr></thead>" +
      "<tbody>" + rows + "</tbody></table></div>";
  }

  function boardError(){
    return '<div class="empty-board">' +
      '<div class="mabel mabel-sm" data-mabel="type" role="img" aria-label="Mabel at her typewriter"></div>' +
      "<h2>Mabel dropped her notebook</h2>" +
      "<p class='muted'>The leaderboard data didn't load. Try refreshing — the week may simply not be scored yet.</p></div>";
  }

  /* ---------- share card builder ---------- */
  var builder = document.getElementById("share-builder");
  if(builder){
    var stars = [0,0,0,0,0]; // 0 none, 1 partial, 2 star
    var glyphs = ["⬜","🟨","🟩"];
    var pickers = builder.querySelectorAll(".star-btn");
    pickers.forEach(function(btn, i){
      btn.addEventListener("click", function(){
        stars[i] = (stars[i] + 1) % 3;
        btn.textContent = glyphs[stars[i]];
        btn.classList.toggle("on", stars[i] > 0);
        btn.setAttribute("aria-label", "Level " + (i+1) + ": " + ["no star","partial","star"][stars[i]]);
        updateCard();
      });
    });
    ["share-points","share-streak","share-crowns","share-week"].forEach(function(id){
      var el = document.getElementById(id);
      if(el) el.addEventListener("input", updateCard);
    });
    function updateCard(){
      var week = document.getElementById("share-week").value || "1";
      var points = document.getElementById("share-points").value || "0";
      var streak = document.getElementById("share-streak").value;
      var crowns = document.getElementById("share-crowns").value.trim();
      var line1 = "Makers on Muse — Week " + week;
      var line2 = stars.map(function(s){ return glyphs[s]; }).join("") + " " + points + "/400";
      var line3bits = [];
      if(streak && +streak > 0) line3bits.push("🔥×" + streak + " streak");
      if(crowns) line3bits.push(crowns);
      var line4 = "Can your Muse beat mine?";
      var card = line3bits.length ? [line1,line2,line3bits.join(" · "),line4].join("\n")
                                  : [line1,line2,line4].join("\n");
      document.getElementById("share-output").textContent = card;
    }
    var copyBtn = document.getElementById("share-copy");
    if(copyBtn){
      copyBtn.addEventListener("click", function(){
        var text = document.getElementById("share-output").textContent;
        var done = function(){
          copyBtn.textContent = "Copied";
          setTimeout(function(){ copyBtn.textContent = "Copy card"; }, 2000);
        };
        if(navigator.clipboard && navigator.clipboard.writeText){
          navigator.clipboard.writeText(text).then(done, done);
        } else {
          var ta = document.createElement("textarea");
          ta.value = text; document.body.appendChild(ta); ta.select();
          try{ document.execCommand("copy"); }catch(e){}
          document.body.removeChild(ta); done();
        }
      });
    }
    updateCard();
  }
})();
