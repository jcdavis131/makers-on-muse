/* Makers on Muse — Watch: live spectate + replays. Zero dependencies. */
(function(){
  "use strict";

  var LIVE_URL = "https://raw.githubusercontent.com/jcdavis131/makers-on-muse/live-runs/data/live/run.json";
  var RUNS_INDEX = "data/runs/index.json";

  /* SSE transport: preferred when the API backend is up; falls back to the
     branch poll below. Rendering logic is untouched — only how beats arrive. */
  function getRunId(){
    try {
      var m = /[?&]run=([^&]+)/.exec(window.location.search || "");
      if(m) return decodeURIComponent(m[1]);
    } catch(e){}
    return "week1-live";
  }
  var RUN_ID = getRunId();
  var STREAM_URL = "/api/run-stream?run_id=" + encodeURIComponent(RUN_ID);
  var STREAM_GRACE_MS = 4000;
  var es = null, streamOk = false, streamTimer = null;
  var liveData = null; // envelope accumulator fed by SSE beats
  var POLL_LIVE = 2500;
  var POLL_DONE = 30000;
  var CATCHUP_AT = 6;
  var TOKEN_PER_EVENT = 40;

  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- dom ---------- */
  function $(id){ return document.getElementById(id); }
  var feed = $("feed"), idleState = $("idle-state"), runEnd = $("run-end");
  var liveBadge = $("live-badge"), replayBadge = $("replay-badge");
  var runAgent = $("run-agent"), runTitle = $("run-title");
  var clockEl = $("clock"), tokEl = $("tokcount"), dotsEl = $("level-dots");
  var dots = dotsEl ? Array.prototype.slice.call(dotsEl.querySelectorAll(".dot")) : [];
  var replayList = $("replay-list"), replayControls = $("replay-controls");

  /* ---------- state ---------- */
  var mode = "live";            // "live" | "replay"
  var curRunId = null;
  var lastSeq = 0;
  var eventsSeen = 0;
  var scoreTokens = 0;
  var tokenTarget = 0, tokenShown = 0;
  var clockBase = null;         // epoch ms of run start (live ticking)
  var clockTimer = null, pollTimer = null, tokTimer = null;
  var rp = null;                // replay session
  var stars = [false,false,false,false,false];

  /* ---------- helpers ---------- */
  function esc(s){
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
    });
  }
  function fmtClock(ms){
    if(ms < 0) ms = 0;
    var s = Math.floor(ms / 1000);
    var m = Math.floor(s / 60), h = Math.floor(m / 60);
    function p(n){ return (n < 10 ? "0" : "") + n; }
    return (h > 0 ? h + ":" + p(m % 60) : p(m)) + ":" + p(s % 60);
  }
  function fmtTokens(n){ return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function startEpoch(v){
    if(typeof v === "number") return v;
    var t = Date.parse(v);
    return isNaN(t) ? null : t;
  }

  /* ---------- header ---------- */
  function setHeader(agent, title){
    if(agent) runAgent.textContent = agent;
    if(title) runTitle.textContent = title;
  }
  function setLiveBadge(on){
    liveBadge.hidden = !on;
    liveBadge.classList.toggle("on", !!on);
  }
  function resetDots(){
    stars = [false,false,false,false,false];
    dots.forEach(function(d){ d.classList.remove("current","done","star"); });
  }
  function dotCurrent(n){
    dots.forEach(function(d, i){
      d.classList.toggle("current", i === n - 1 && !d.classList.contains("done"));
    });
  }
  function dotDone(n, starred){
    var d = dots[n - 1];
    if(!d) return;
    d.classList.remove("current");
    d.classList.add("done");
    if(starred){ d.classList.add("star"); stars[n - 1] = true; }
  }

  function startClock(epochMs){
    stopClock();
    if(epochMs == null){ clockEl.textContent = "--:--"; return; }
    clockBase = epochMs;
    function tick(){
      clockEl.textContent = fmtClock(Date.now() - clockBase);
    }
    tick();
    clockTimer = setInterval(tick, 1000);
  }
  function stopClock(){ if(clockTimer){ clearInterval(clockTimer); clockTimer = null; } }
  function setClockStatic(ms){ stopClock(); clockEl.textContent = fmtClock(ms); }

  function startTokTicker(){
    if(tokTimer) return;
    tokTimer = setInterval(function(){
      if(tokenShown === tokenTarget) return;
      var diff = tokenTarget - tokenShown;
      var step = Math.max(1, Math.abs(diff) * 0.12) * (diff > 0 ? 1 : -1);
      tokenShown += step;
      if(Math.abs(tokenTarget - tokenShown) < 1) tokenShown = tokenTarget;
      tokEl.textContent = fmtTokens(tokenShown);
    }, 120);
  }
  function bumpTokens(){ tokenTarget = scoreTokens + eventsSeen * TOKEN_PER_EVENT; }

  /* ---------- event rendering ---------- */
  function evShell(cls, who, inner){
    var div = document.createElement("div");
    div.className = "ev " + cls;
    div.innerHTML = (who ? '<span class="who">' + esc(who) + "</span>" : "") + inner;
    return div;
  }

  function renderEvent(ev, instant){
    eventsSeen++;
    var lvl = ev.level ? " · L" + ev.level : "";
    var node = null;

    if(ev.type === "thought"){
      var animated = !instant && !reduced;
      node = evShell("thought", (ev.agent || "Scout") + " · thinking" + lvl,
        animated
          ? "<p><span class='typing'>" + esc(ev.text) + "</span></p>"
          : "<p>" + esc(ev.text) + "</p>");
    } else if(ev.type === "tool"){
      node = evShell("tool", "tool call" + lvl,
        '<span class="tool-name">' + esc(ev.name) + "</span>" +
        (ev.detail ? "<code>" + esc(ev.detail) + "</code>" : ""));
    } else if(ev.type === "result"){
      node = document.createElement("details");
      node.className = "ev result";
      node.innerHTML = '<summary>Result' + esc(lvl ? " — level " + ev.level : "") + " (tap to expand)</summary>" +
        "<p>" + esc(ev.summary) + "</p>";
    } else if(ev.type === "answer"){
      node = evShell("answer", "answer" + lvl,
        '<div class="answer-text">' + esc(ev.text) + "</div>");
    } else if(ev.type === "score"){
      node = renderScore(ev);
      if(ev.level) dotDone(ev.level, ev.total >= 60);
      if(typeof ev.tokens_est === "number") scoreTokens += ev.tokens_est;
    } else if(ev.type === "level" && ev.phase === "start"){
      dotCurrent(ev.n);
      node = document.createElement("div");
      node.className = "ev level-banner";
      node.innerHTML = '<span class="lvl">Level ' + esc(ev.n) + "</span><h3>" + esc(ev.title) + "</h3>";
    } else if(ev.type === "level" && ev.phase === "end"){
      node = document.createElement("div");
      node.className = "ev level-banner end";
      node.innerHTML = "<h3>Level " + esc(ev.n) + " complete</h3>";
    } else if(ev.type === "run" && ev.phase === "start"){
      node = evShell("note", null, "Run started — " + esc(ev.agent || "Scout") + " sits down at the desk.");
    } else if(ev.type === "note"){
      node = evShell("note", null, esc(ev.text));
    } else if(ev.type === "run" && ev.phase === "end"){
      node = null; // handled by final panel
    } else {
      return; // unknown type: skip silently
    }

    if(node){
      if(instant || reduced) node.classList.add("noanim");
      feed.appendChild(node);
      if(!reduced && !instant) node.scrollIntoView({block:"nearest", behavior:"smooth"});
    }
    bumpTokens();
  }

  function renderScore(ev){
    var parts = ev.parts || {};
    var rows = [["Correctness", parts.correctness], ["Tokens", parts.tokens],
                ["Time", parts.time], ["Procedure", parts.procedure]];
    var html = rows.map(function(r){
      var pct = Math.max(0, Math.min(1, Number(r[1]) || 0)) * 100;
      return '<div class="score-row"><span>' + r[0] + '</span>' +
        '<span class="bar"><i data-w="' + pct.toFixed(0) + '"></i></span>' +
        "<span>" + pct.toFixed(0) + "</span></div>";
    }).join("");
    var star = ev.total >= 60 ? ' <span class="star">★</span>' : "";
    var node = evShell("score", "score · level " + ev.level,
      '<div class="score-bars">' + html + '</div>' +
      '<div class="score-total">' + esc(ev.total) + "/100" + star + "</div>");
    if(!reduced){
      // animate bars after paint
      setTimeout(function(){
        var bars = node.querySelectorAll(".bar i");
        for(var i = 0; i < bars.length; i++) bars[i].style.width = bars[i].getAttribute("data-w") + "%";
      }, 60);
    } else {
      var bars2 = node.querySelectorAll(".bar i");
      for(var j = 0; j < bars2.length; j++) bars2[j].style.width = bars2[j].getAttribute("data-w") + "%";
    }
    return node;
  }

  /* ---------- final panel ---------- */
  function showFinalPanel(data){
    var totals = (data.events || []).filter(function(e){ return e.type === "score"; });
    var sum = totals.reduce(function(a, e){ return a + (Number(e.total) || 0); }, 0);
    var nStars = stars.filter(Boolean).length;
    var starLine = "";
    for(var i = 0; i < 4; i++) starLine += i < nStars ? "★" : "☆"; // 4 scored levels, 0-4 stars
    runEnd.hidden = false;
    runEnd.innerHTML =
      '<div class="run-end">' +
        '<img src="assets/img/mabel-typing.webp" alt="Mabel stamping the final scores into the minutes">' +
        '<p class="eyebrow">Final minutes</p>' +
        '<div class="big-score">' + sum + '<span class="small muted">/400</span></div>' +
        '<div class="stars">' + starLine + "</div>" +
        "<p class='muted'>Mabel stamps the minutes. " + esc(data.agent || "Scout") +
        " earns a star on " + nStars + " of 4 scored levels. Scores are self-reported and provisional.</p>" +
        '<div class="btn-row" style="justify-content:center">' +
          '<a class="btn btn-primary" href="leaderboard.html">See the leaderboard</a>' +
        "</div>" +
      "</div>";
    if(!reduced) runEnd.scrollIntoView({block:"nearest", behavior:"smooth"});
  }

  /* ---------- live mode ---------- */
  function resetLive(){
    feed.innerHTML = "";
    runEnd.hidden = true;
    runEnd.innerHTML = "";
    lastSeq = 0; eventsSeen = 0; scoreTokens = 0;
    tokenTarget = 0; tokenShown = 0; tokEl.textContent = "0";
    resetDots();
  }

  function showIdle(){
    setLiveBadge(false);
    setHeader("No run scheduled", "Mabel is keeping the seat warm");
    setClockStatic(0); clockEl.textContent = "--:--";
    feed.innerHTML = "";
    runEnd.hidden = true;
    idleState.hidden = false;
    feed.style.display = "none";
    resetDots();
  }
  function hideIdle(){
    idleState.hidden = true;
    feed.style.display = "";
  }

  function handleRun(data){
    if(mode !== "live") return;
    if(!data || !data.run_id) return;
    if(data.run_id !== curRunId){
      curRunId = data.run_id;
      resetLive();
      hideIdle();
      setHeader(data.agent, "Week " + data.week + (data.week_title ? " — " + data.week_title : ""));
      startClock(startEpoch(data.started_at));
    }
    var fresh = (data.events || []).filter(function(e){ return e.seq > lastSeq; });
    fresh.sort(function(a, b){ return a.seq - b.seq; });
    var instant = fresh.length > CATCHUP_AT;
    fresh.forEach(function(e){ renderEvent(e, instant); lastSeq = Math.max(lastSeq, e.seq); });

    if(data.status === "done"){
      setLiveBadge(false);
      stopClock();
      showFinalPanel(data);
      schedulePoll(POLL_DONE);
    } else {
      setLiveBadge(true);
      schedulePoll(POLL_LIVE);
    }
  }

  function poll(){
    fetch(LIVE_URL + "?cb=" + Date.now(), {cache:"no-store"})
      .then(function(r){
        if(r.status === 404){ showIdle(); schedulePoll(POLL_DONE); return null; }
        if(!r.ok) throw new Error("http " + r.status);
        return r.json();
      })
      .then(function(data){ if(data) handleRun(data); })
      .catch(function(){ schedulePoll(POLL_DONE); });
  }
  function schedulePoll(ms){
    if(pollTimer) clearTimeout(pollTimer);
    pollTimer = setTimeout(poll, ms);
  }

  /* ---------- SSE transport: beats arrive here when the API is up ---------- */
  function handleMeta(meta){
    if(!meta) return;
    if(!liveData || liveData.run_id !== meta.run_id){
      liveData = { run_id: meta.run_id || RUN_ID, events: [] };
    }
    liveData.status = meta.status || liveData.status || "live";
    if(meta.week != null) liveData.week = meta.week;
    if(meta.week_title) liveData.week_title = meta.week_title;
    if(meta.agent) liveData.agent = meta.agent;
    if(meta.started_at) liveData.started_at = meta.started_at;
    handleRun(liveData);
    if(streamOk && pollTimer){ clearTimeout(pollTimer); pollTimer = null; }
  }
  function handleBeat(ev){
    if(!ev || mode !== "live") return;
    if(!liveData) liveData = { run_id: RUN_ID, status: "live", events: [] };
    liveData.events.push(ev);
    handleRun(liveData);
    if(streamOk && pollTimer){ clearTimeout(pollTimer); pollTimer = null; }
  }
  function closeStream(){
    if(streamTimer){ clearTimeout(streamTimer); streamTimer = null; }
    if(es){ try { es.close(); } catch(e){} es = null; }
  }
  function tryStream(){
    if(!("EventSource" in window)) return false;
    closeStream();
    streamOk = false;
    liveData = null;
    try {
      es = new EventSource(STREAM_URL);
    } catch(e){ return false; }
    function firstMessage(){
      streamOk = true;
      if(streamTimer){ clearTimeout(streamTimer); streamTimer = null; }
    }
    es.addEventListener("meta", function(msg){
      firstMessage();
      try { handleMeta(JSON.parse(msg.data)); } catch(e){}
    });
    es.addEventListener("beat", function(msg){
      firstMessage();
      try { handleBeat(JSON.parse(msg.data)); } catch(e){}
    });
    es.addEventListener("end", function(){ closeStream(); });
    /* Mid-run drops auto-reconnect (EventSource default); replays dedupe on seq. */
    es.addEventListener("error", function(){ /* noop: reconnect or grace-timer handles it */ });
    // No message within the grace window (404/503/blocked) -> branch poll.
    streamTimer = setTimeout(function(){
      streamTimer = null;
      if(!streamOk){ closeStream(); poll(); }
    }, STREAM_GRACE_MS);
    return true;
  }
  function initTransport(){
    if(!tryStream()) poll();
  }

  /* ---------- replays ---------- */
  function loadReplayIndex(){
    fetch(RUNS_INDEX, {cache:"no-store"})
      .then(function(r){ if(!r.ok) throw new Error("http " + r.status); return r.json(); })
      .then(function(data){
        var runs = (data && data.runs) || [];
        if(!runs.length){
          replayList.innerHTML = "<p class='muted'>No archived runs yet. The first live run will land here.</p>";
          return;
        }
        replayList.innerHTML = "";
        runs.forEach(function(run){
          var b = document.createElement("button");
          b.className = "replay-item";
          b.innerHTML =
            '<span><strong>' + esc(run.title || run.id) + "</strong><br>" +
            '<span class="rid">' + esc(run.id) + " · " + esc(run.agent || "") +
            (run.date ? " · " + esc(run.date) : "") + "</span></span>" +
            (run.score != null ? '<span class="rscore">' + esc(run.score) + "/400</span>" : "");
          b.addEventListener("click", function(){ startReplay(run); });
          replayList.appendChild(b);
        });
      })
      .catch(function(){
        replayList.innerHTML = "<p class='muted'>Couldn't load the archive.</p>";
      });
  }

  function startReplay(run){
    fetch(run.file, {cache:"no-store"})
      .then(function(r){ if(!r.ok) throw new Error("http " + r.status); return r.json(); })
      .then(function(data){ enterReplay(data, run); })
      .catch(function(){ replayList.innerHTML = "<p class='muted'>That replay didn't load. Try another.</p>"; });
  }

  function enterReplay(data, meta){
    mode = "replay";
    if(pollTimer) clearTimeout(pollTimer);
    closeStream();
    resetLive();
    hideIdle();
    setLiveBadge(false);
    replayBadge.hidden = false;
    replayControls.hidden = false;
    setHeader(data.agent || meta.agent, "Week " + (data.week || meta.week) + (data.week_title ? " — " + data.week_title : "") + " · replay");
    var events = (data.events || []).slice().sort(function(a, b){ return a.seq - b.seq; });
    var totalT = events.length ? Math.max.apply(null, events.map(function(e){ return Number(e.t) || 0; })) : 0;
    rp = {events:events, idx:0, timer:null, speed:1, playing:true, totalT:totalT, data:data};
    setSpeedUI(1);
    $("rp-toggle").textContent = "Pause";
    $("rp-toggle").setAttribute("aria-pressed", "false");
    setClockStatic(0);
    playNext();
    replayControls.scrollIntoView({block:"nearest", behavior: reduced ? "auto" : "smooth"});
  }

  function playNext(){
    if(!rp || !rp.playing || rp.idx >= rp.events.length){
      if(rp && rp.idx >= rp.events.length) finishReplay();
      return;
    }
    var ev = rp.events[rp.idx];
    renderEvent(ev, false);
    setClockStatic((Number(ev.t) || 0) * 1000);
    $("rp-bar").style.width = (100 * (rp.idx + 1) / rp.events.length).toFixed(1) + "%";
    $("rp-time").textContent = fmtClock((Number(ev.t) || 0) * 1000) + " / " + fmtClock(rp.totalT * 1000);
    rp.idx++;
    var next = rp.events[rp.idx];
    var gap = next ? Math.max(0.35, Math.min(4, ((Number(next.t) || 0) - (Number(ev.t) || 0)) / rp.speed)) : 0;
    rp.timer = setTimeout(playNext, gap * 1000);
  }

  function finishReplay(){
    rp.playing = false;
    $("rp-toggle").textContent = "Replay";
    $("rp-toggle").setAttribute("aria-pressed", "true");
    showFinalPanel(rp.data);
  }

  function setSpeedUI(s){
    [1, 2, 4].forEach(function(v){
      var b = $("rp-" + v + "x");
      if(b) b.setAttribute("aria-pressed", v === s ? "true" : "false");
    });
  }

  function exitReplay(){
    if(rp && rp.timer) clearTimeout(rp.timer);
    rp = null;
    mode = "live";
    curRunId = null;
    replayBadge.hidden = true;
    replayControls.hidden = true;
    showIdle();
    initTransport();
  }

  function wireReplayControls(){
    $("rp-toggle").addEventListener("click", function(){
      if(!rp) return;
      if(rp.idx >= rp.events.length){ // finished: restart
        rp.idx = 0; resetLive(); hideIdle();
        rp.playing = true;
        this.textContent = "Pause";
        this.setAttribute("aria-pressed", "false");
        playNext();
        return;
      }
      rp.playing = !rp.playing;
      this.textContent = rp.playing ? "Pause" : "Play";
      this.setAttribute("aria-pressed", rp.playing ? "false" : "true");
      if(rp.playing) playNext();
      else if(rp.timer) clearTimeout(rp.timer);
    });
    [1, 2, 4].forEach(function(v){
      $("rp-" + v + "x").addEventListener("click", function(){
        if(!rp) return;
        rp.speed = v;
        setSpeedUI(v);
      });
    });
    $("rp-exit").addEventListener("click", exitReplay);
  }

  /* ---------- init ---------- */
  wireReplayControls();
  loadReplayIndex();
  startTokTicker();
  showIdle();
  initTransport();
})();
