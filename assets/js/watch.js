/* Makers on Muse — Watch: a narrated run, live or replayed. Zero dependencies.

   Where a run comes from:
   - Live, from the API. The page asks /api/health first and opens
     /api/run-stream?run_id=latest (Server-Sent Events) only when storage
     is "reachable". A run plays live only while its status is "live"
     (or when ?run=<id> names it). Beats are kept by seq, so a reconnect
     that replays from the start adds nothing twice. The stream is closed
     when the run ends; nothing polls a finished run.
   - The archive. data/runs/index.json lists scrubbed, finished runs.
     With no live run, the page plays the first run in the index. Today
     that is the demo run, labelled "Demo run, unofficial".
   Until one of them answers, the page says "Connecting…".

   Numbers: the maximum total, the star threshold and which levels score
   come from the run week's pack manifest (data/packs/s1w<week>.json).
   Tokens are what the agent reported on its score events, shown as a
   self-reported estimate, or "—" when it reported none. Run time is the
   last event's time minus the start.

   Scrolling: the page scrolls on its own only while the reader follows
   the feed (the feed's end on screen, its top above the middle of the
   window). Loading the page, finishing a run and the final panel never
   move it. The final panel renders once per run.

   The pure helpers are exported for scripts/test-watch.mjs. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MOM_WATCH = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var RUNS_INDEX = "data/runs/index.json";
  var PACK_PREFIX = "data/packs/s1w"; // + week + ".json" (Season 1)
  var HEALTH_URL = "/api/health";
  var STREAM_GRACE_MS = 4000;
  var FOLLOW_SLACK_PX = 80;
  var CATCHUP_AT = 6;

  /* ---------- pure helpers ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function packUrl(week) { return PACK_PREFIX + encodeURIComponent(week) + ".json"; }

  /* Seconds -> "m:ss" or "h:mm:ss"; unknown -> "--:--". */
  function fmtClock(sec) {
    if (sec === null || sec === undefined || !isFinite(sec)) return "--:--";
    var s = Math.max(0, Math.floor(sec));
    var m = Math.floor(s / 60), h = Math.floor(m / 60);
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return (h > 0 ? h + ":" + p(m % 60) : m) + ":" + p(s % 60);
  }

  function fmtInt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }

  function startMs(v) {
    if (typeof v === "number" && isFinite(v)) return v;
    if (typeof v === "string") { var t = Date.parse(v); return isNaN(t) ? null : t; }
    return null;
  }

  /* An event's time in seconds since the run started. Archived runs carry
     seconds; the live API stamps an ISO time. null when unknown. */
  function eventSeconds(ev, startedAt) {
    if (!ev) return null;
    if (typeof ev.t === "number" && isFinite(ev.t)) return Math.max(0, ev.t);
    if (typeof ev.t === "string") {
      var t = Date.parse(ev.t), s = startMs(startedAt);
      if (!isNaN(t) && s !== null) return Math.max(0, (t - s) / 1000);
    }
    return null;
  }

  /* Run time: the last event minus the start, in seconds, or null. */
  function runSeconds(events, startedAt) {
    var best = null;
    (events || []).forEach(function (e) {
      var s = eventSeconds(e, startedAt);
      if (s !== null && (best === null || s > best)) best = s;
    });
    return best;
  }

  /* Tokens the agent reported on its score events, summed; null when it
     reported none. Never padded or guessed. */
  function reportedTokens(events) {
    var sum = 0, any = false;
    (events || []).forEach(function (e) {
      if (e && e.type === "score" && typeof e.tokens_est === "number" && isFinite(e.tokens_est) && e.tokens_est >= 0) {
        sum += e.tokens_est;
        any = true;
      }
    });
    return any ? sum : null;
  }

  function tokenText(n) { return n === null || n === undefined ? "—" : fmtInt(n); }

  /* Keep a beat unless its seq is already there. Returns true if added. */
  function addEvent(list, seen, ev) {
    if (!ev || typeof ev !== "object" || typeof ev.seq !== "number" || !isFinite(ev.seq)) return false;
    if (seen[ev.seq]) return false;
    seen[ev.seq] = true;
    list.push(ev);
    return true;
  }

  function scoredLevels(pack) {
    return ((pack && pack.levels) || []).filter(function (l) { return l.scored === true; })
      .map(function (l) { return l.n; });
  }

  function exhibitionLevels(pack) {
    return ((pack && pack.levels) || []).filter(function (l) { return l.exhibition === true; })
      .map(function (l) { return l.n; });
  }

  function earnsStar(pack, total) {
    return Boolean(pack && pack.scoring) && typeof total === "number" && total >= pack.scoring.star_at;
  }

  /* The run's result from its score events and its week's manifest. The
     last score event for a level wins. Without a manifest there is no
     maximum and no star rule, so those stay null. */
  function summary(events, pack) {
    var byLevel = {};
    (events || []).forEach(function (e) {
      if (e && e.type === "score" && typeof e.level === "number" && typeof e.total === "number") byLevel[e.level] = e.total;
    });
    var scored = pack ? scoredLevels(pack) : null;
    var total = 0, stars = 0;
    Object.keys(byLevel).forEach(function (k) {
      var n = Number(k);
      if (scored && scored.indexOf(n) === -1) return;
      total += byLevel[k];
      if (earnsStar(pack, byLevel[k])) stars++;
    });
    return {
      total: total,
      byLevel: byLevel,
      maxTotal: pack ? pack.scoring.max_total : null,
      stars: pack ? stars : null,
      maxStars: pack ? pack.scoring.max_stars : null,
      scoredCount: scored ? scored.length : null,
      exhibitions: pack ? exhibitionLevels(pack) : []
    };
  }

  /* Is the reader following the feed? They have scrolled, the feed's end
     is on screen and its top is above the middle of the window. Never
     true for a reader who hasn't scrolled, so loading the page can't
     move it. */
  function isFollowing(rect, viewportH, scrollY) {
    if (!rect || !viewportH || !(scrollY > 0)) return false;
    return rect.bottom >= 0 && rect.bottom <= viewportH + FOLLOW_SLACK_PX && rect.top < viewportH / 2;
  }

  /* The run to play when nothing is live: the first in the archive. */
  function defaultRun(index) {
    var runs = (index && Array.isArray(index.runs)) ? index.runs : [];
    return runs.length ? runs[0] : null;
  }

  function runIdFrom(search) {
    var m = /[?&]run=([^&]+)/.exec(search || "");
    if (!m) return null;
    var id;
    try { id = decodeURIComponent(m[1]); } catch (e) { return null; }
    return /^[A-Za-z0-9._-]{1,80}$/.test(id) ? id : null;
  }

  function pct(x) { return Math.round(Math.max(0, Math.min(1, Number(x) || 0)) * 100); }

  /* eventView(ev, ctx) -> { tag, cls, html } or null for a type this page
     doesn't draw. ctx: { agent, pack }. Every value is escaped. */
  function eventView(ev, ctx) {
    ctx = ctx || {};
    var lvl = typeof ev.level === "number" ? " · L" + ev.level : "";
    var who = function (w) { return '<span class="who">' + esc(w) + "</span>"; };
    if (ev.type === "thought") {
      return { tag: "div", cls: "ev thought", html: who((ctx.agent || "Agent") + " · note" + lvl) + "<p>" + esc(ev.text) + "</p>" };
    }
    if (ev.type === "tool") {
      return { tag: "div", cls: "ev tool", html: who("tool call" + lvl) + '<span class="tool-name">' + esc(ev.name) + "</span>" +
        (ev.detail ? "<code>" + esc(ev.detail) + "</code>" : "") };
    }
    if (ev.type === "result") {
      return { tag: "details", cls: "ev result", html: "<summary>Result" + esc(lvl) + "</summary><p>" + esc(ev.summary) + "</p>" };
    }
    if (ev.type === "answer") {
      return { tag: "div", cls: "ev answer", html: who("answer" + lvl) + '<div class="answer-text">' + esc(ev.text) + "</div>" };
    }
    if (ev.type === "score") return { tag: "div", cls: "ev score", html: scoreHtml(ev, ctx.pack) };
    if (ev.type === "level" && ev.phase === "start") {
      return { tag: "div", cls: "ev level-banner", html: '<span class="lvl">Level ' + esc(ev.n) + "</span><h3>" + esc(ev.title) + "</h3>" };
    }
    if (ev.type === "level" && ev.phase === "end") {
      return { tag: "div", cls: "ev level-banner end", html: "<h3>Level " + esc(ev.n) + " done</h3>" };
    }
    if (ev.type === "run" && ev.phase === "start") {
      return { tag: "div", cls: "ev note", html: "Run started. " + esc(ctx.agent || "The agent") + " sits down at the desk." };
    }
    if (ev.type === "note") return { tag: "div", cls: "ev note", html: esc(ev.text) };
    return null; // run end (the final panel covers it) and unknown types
  }

  function scoreHtml(ev, pack) {
    var parts = ev.parts || {};
    var rows = [["Correctness", parts.correctness], ["Tokens", parts.tokens], ["Time", parts.time], ["Procedure", parts.procedure]];
    var bars = rows.map(function (r) {
      var p = pct(r[1]);
      return '<div class="score-row"><span>' + r[0] + '</span><span class="bar"><i data-w="' + p + '"></i></span><span>' + p + "</span></div>";
    }).join("");
    var reported = [];
    if (typeof ev.tokens_est === "number") reported.push(esc(fmtInt(ev.tokens_est)) + " tokens (est.)");
    if (typeof ev.seconds === "number") reported.push(esc(fmtClock(ev.seconds)));
    var star = earnsStar(pack, ev.total) ? ' <span class="star" role="img" aria-label="star">★</span>' : "";
    return '<span class="who">score · level ' + esc(ev.level) + "</span>" +
      '<div class="score-bars">' + bars + "</div>" +
      '<div class="score-total">' + esc(ev.total) + (pack ? "/" + esc(pack.scoring.level_max) : "") + star + "</div>" +
      (reported.length ? '<p class="score-reported">Reported by the agent: ' + reported.join(", ") + "</p>" : "");
  }

  /* finalHtml(view) -> the final panel. view: { agent, label, demo,
     events, startedAt, pack }. */
  function finalHtml(view) {
    var s = summary(view.events, view.pack);
    var secs = runSeconds(view.events, view.startedAt);
    var toks = reportedTokens(view.events);
    var starLine = "";
    if (s.maxStars !== null) {
      for (var i = 0; i < s.maxStars; i++) starLine += i < s.stars ? "★" : "☆";
    }
    var facts = [];
    if (secs !== null) facts.push("Run time " + esc(fmtClock(secs)));
    facts.push(toks === null ? "No tokens reported" : esc(fmtInt(toks)) + " tokens, est., self-reported");
    var who = esc(view.agent || "The agent");
    var starText = s.maxStars !== null
      ? who + " earned a star on " + esc(s.stars) + " of " + esc(s.scoredCount) + " scored levels. "
      : "";
    var exhibit = s.exhibitions.length
      ? s.exhibitions.map(function (n) { return "L" + esc(n); }).join(", ") + (s.exhibitions.length > 1 ? " are unscored exhibitions. " : " is an unscored exhibition. ")
      : "";
    return '<div class="run-end">' +
      '<img src="assets/img/mabel-plush.svg" width="132" height="152" alt="Mabel stamping the final scores into the minutes">' +
      '<p class="eyebrow">Final minutes' + (view.label ? " · " + esc(view.label) : "") + "</p>" +
      '<div class="big-score">' + esc(s.total) + (s.maxTotal !== null ? '<span class="small muted">/' + esc(s.maxTotal) + "</span>" : "") + "</div>" +
      (starLine ? '<div class="stars" role="img" aria-label="' + esc(s.stars) + " of " + esc(s.maxStars) + ' stars">' + starLine + "</div>" : "") +
      '<p class="muted">' + starText + exhibit + "Every score here is self-reported and " + (view.demo ? "unofficial." : "provisional.") + "</p>" +
      '<p class="small muted">' + facts.join(" · ") + "</p>" +
      '<div class="btn-row" style="justify-content:center"><a class="btn btn-primary" href="pack.html">See the pack</a></div>' +
      "</div>";
  }

  /* Replay list button content. */
  function runItemHtml(run, pack) {
    var score = "";
    if (typeof run.score === "number") {
      score = '<span class="rscore">' + esc(run.score) + (pack ? "/" + esc(pack.scoring.max_total) : " points") + "</span>";
    }
    return '<span class="rmain"><strong>' + esc(run.title || run.id) + "</strong>" +
      (run.label ? ' <span class="rlabel">' + esc(run.label) + "</span>" : "") + "<br>" +
      '<span class="rid">' + esc(run.id) + (run.agent ? " · " + esc(run.agent) : "") +
      (run.date ? " · " + esc(run.date) : "") + "</span></span>" + score;
  }

  var api = {
    RUNS_INDEX: RUNS_INDEX,
    HEALTH_URL: HEALTH_URL,
    STREAM_GRACE_MS: STREAM_GRACE_MS,
    esc: esc,
    packUrl: packUrl,
    fmtClock: fmtClock,
    eventSeconds: eventSeconds,
    runSeconds: runSeconds,
    reportedTokens: reportedTokens,
    tokenText: tokenText,
    addEvent: addEvent,
    summary: summary,
    earnsStar: earnsStar,
    isFollowing: isFollowing,
    defaultRun: defaultRun,
    runIdFrom: runIdFrom,
    eventView: eventView,
    finalHtml: finalHtml,
    runItemHtml: runItemHtml
  };

  /* ---------- the page ---------- */
  function page(win, doc) {
    function $(id) { return doc.getElementById(id); }
    var feed = $("feed"), runEnd = $("run-end"), idleState = $("idle-state"), replayAbout = $("replay-about");
    var liveBadge = $("live-badge"), doneBadge = $("done-badge"), replayBadge = $("replay-badge"), demoBadge = $("demo-badge");
    var runAgent = $("run-agent"), runTitle = $("run-title");
    var clockEl = $("clock"), clockLabel = $("clock-label"), tokEl = $("tokcount");
    var dotsEl = $("level-dots");
    var dots = dotsEl ? Array.prototype.slice.call(dotsEl.querySelectorAll(".dot")) : [];
    var replayList = $("replay-list"), controls = $("replay-controls"), statusEl = $("watch-status");
    var rpToggle = $("rp-toggle"), rpExit = $("rp-exit"), rpBar = $("rp-bar"), rpTime = $("rp-time");
    if (!feed || !runEnd || !replayList) return;

    var reduced = Boolean(win.matchMedia && win.matchMedia("(prefers-reduced-motion: reduce)").matches);
    var packs = {};
    var mode = "connecting"; // connecting | live | replay | idle
    var view = null;         // the run on screen
    var session = 0;
    var liveAvailable = false;
    var es = null, streamTimer = null, liveQueue = [], flushTimer = null;
    var clockTimer = null;
    var rp = null;           // replay player
    var indexRuns = [];
    var requestedRun = runIdFrom(win.location && win.location.search);

    function getPack(week) {
      var key = String(week);
      if (!packs[key]) {
        packs[key] = win.fetch ? win.fetch(packUrl(week), { cache: "no-cache" })
          .then(function (r) { return r.ok ? r.json() : null; })
          .catch(function () { return null; }) : Promise.resolve(null);
      }
      return packs[key];
    }

    function announce(text) { if (statusEl) statusEl.textContent = text; }
    function setHeader(agent, title) {
      runAgent.textContent = agent;
      runTitle.textContent = title;
    }
    function badges(on) {
      liveBadge.hidden = !on.live;
      liveBadge.classList.toggle("on", Boolean(on.live));
      doneBadge.hidden = !on.done;
      replayBadge.hidden = !on.replay;
      demoBadge.hidden = !on.demo;
      if (on.demo) demoBadge.textContent = on.demo;
    }

    /* ----- clock and tokens ----- */
    function stopClock() { if (clockTimer) { clearInterval(clockTimer); clockTimer = null; } }
    function staticClock(sec, label) {
      stopClock();
      clockEl.textContent = fmtClock(sec);
      clockLabel.textContent = label;
    }
    function tickingClock(start) {
      stopClock();
      clockLabel.textContent = "elapsed";
      var tick = function () { clockEl.textContent = fmtClock((Date.now() - start) / 1000); };
      tick();
      clockTimer = setInterval(tick, 1000);
    }
    function showTokens() { tokEl.textContent = tokenText(reportedTokens(view && view.events)); }

    /* ----- level dots ----- */
    function paintDots() {
      var pack = view && view.pack;
      var ex = exhibitionLevels(pack);
      var done = 0, stars = 0, scored = scoredLevels(pack);
      dots.forEach(function (d, i) {
        var n = i + 1, st = (view && view.dots[n]) || {};
        d.classList.toggle("exhibit", ex.indexOf(n) !== -1);
        d.classList.toggle("current", st.state === "current");
        d.classList.toggle("done", st.state === "done");
        d.classList.toggle("star", Boolean(st.star));
        if (st.state === "done" && scored.indexOf(n) !== -1) done++;
        if (st.star) stars++;
      });
      if (dotsEl) {
        var label = "Level progress";
        if (view && scored.length) {
          label += ": " + done + " of " + scored.length + " scored levels done, " + stars + (stars === 1 ? " star" : " stars");
          if (ex.length) label += ". " + ex.map(function (n) { return "L" + n; }).join(", ") + " is an exhibition";
        }
        dotsEl.setAttribute("aria-label", label + ".");
      }
    }
    function trackDots(ev) {
      var d = view.dots;
      if (ev.type === "level" && typeof ev.n === "number") {
        var cur = d[ev.n] || {};
        if (ev.phase === "start" && cur.state !== "done") {
          Object.keys(d).forEach(function (k) { if (d[k].state === "current") d[k].state = "open"; });
          d[ev.n] = { state: "current", star: cur.star };
        }
        if (ev.phase === "end") d[ev.n] = { state: "done", star: cur.star };
      } else if (ev.type === "score" && typeof ev.level === "number") {
        d[ev.level] = { state: "done", star: earnsStar(view.pack, ev.total) };
      }
    }

    /* ----- feed ----- */
    function following() {
      if (feed.hidden) return false;
      return isFollowing(feed.getBoundingClientRect(), win.innerHeight, win.scrollY || win.pageYOffset || 0);
    }
    /* "auto" follows the page's CSS: smooth, or instant under reduced motion. */
    function reveal(node, instant) {
      node.scrollIntoView({ block: "nearest", behavior: reduced || instant ? "auto" : "smooth" });
    }
    function renderEvent(ev, instant) {
      view.events.push(ev);
      trackDots(ev);
      var v = eventView(ev, { agent: view.agent, pack: view.pack });
      if (v) {
        var follow = following();
        var node = doc.createElement(v.tag);
        node.className = v.cls + (instant || reduced ? " noanim" : "");
        node.innerHTML = v.html;
        feed.appendChild(node);
        var bars = node.querySelectorAll(".bar i");
        var fill = function () {
          for (var i = 0; i < bars.length; i++) bars[i].style.width = bars[i].getAttribute("data-w") + "%";
        };
        if (bars.length) { if (instant || reduced) fill(); else setTimeout(fill, 60); }
        if (follow) reveal(node, instant);
      }
      paintDots();
      showTokens();
    }

    function newView(o) {
      session++;
      stopClock();
      view = {
        key: String(o.runId) + "#" + session,
        runId: o.runId, week: o.week, agent: o.agent || "", label: o.label || "", demo: Boolean(o.demo),
        startedAt: o.startedAt, pack: o.pack || null, events: [], seen: {}, dots: {}, finalShown: null
      };
      feed.innerHTML = "";
      feed.hidden = false;
      runEnd.hidden = true;
      runEnd.innerHTML = "";
      idleState.hidden = true;
      clockEl.textContent = "--:--";
      showTokens();
      paintDots();
    }

    /* The final panel, once per run on screen. */
    function finalPanel() {
      if (!view || view.finalShown === view.key) return;
      view.finalShown = view.key;
      var follow = following();
      runEnd.innerHTML = finalHtml(view);
      runEnd.hidden = false;
      if (follow) reveal(runEnd, false);
      var s = summary(view.events, view.pack);
      announce("Run finished: " + s.total + (s.maxTotal !== null ? " of " + s.maxTotal : "") + " points" +
        (s.maxStars !== null ? ", " + s.stars + " of " + s.maxStars + " stars" : "") + ". Scores are self-reported.");
    }

    /* ----- states ----- */
    function setConnecting() {
      mode = "connecting";
      badges({});
      setHeader("Connecting…", "Checking for a live run");
      staticClock(null, "run time");
      tokEl.textContent = "—";
      idleState.hidden = true;
      announce("Checking for a live run.");
    }
    function showIdle() {
      mode = "idle";
      view = null;
      stopClock();
      badges({});
      setHeader("No live run right now", "Mabel is knitting until the next one");
      staticClock(null, "run time");
      tokEl.textContent = "—";
      feed.innerHTML = "";
      feed.hidden = true;
      runEnd.hidden = true;
      idleState.hidden = false;
      paintDots();
      announce("No live run right now.");
    }

    /* ----- live ----- */
    function closeStream() {
      if (streamTimer) { clearTimeout(streamTimer); streamTimer = null; }
      if (es) { try { es.close(); } catch (e) {} es = null; }
    }
    /* Beats queued for a run that is no longer on screen. */
    function dropQueue() {
      liveQueue = [];
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    }
    function enterLive(meta) {
      stopReplay();
      dropQueue();
      mode = "live";
      newView({ runId: meta.run_id, week: meta.week, agent: meta.agent, startedAt: meta.started_at });
      controls.hidden = true;
      if (replayAbout) { replayAbout.hidden = true; replayAbout.textContent = ""; }
      badges({ live: true });
      setHeader(meta.agent || "Live run", "Week " + (meta.week || "?") + (meta.week_title ? " — " + meta.week_title : ""));
      var start = startMs(meta.started_at);
      if (start !== null) tickingClock(start); else staticClock(null, "elapsed");
      markList(null);
      announce("Live run: " + (meta.agent || "an agent") + ".");
      var v = view;
      v.packReady = getPack(meta.week || 1).then(function (p) { if (view === v) { v.pack = p; paintDots(); } });
      if (meta.status === "done") markDone();
    }
    function markDone() {
      if (!view || view.done) return;
      view.done = true;
      badges({ done: true });
      staticClock(runSeconds(view.events, view.startedAt), "run time");
    }
    function finishLive() {
      closeStream();
      if (mode !== "live" || !view) return;
      var v = view;
      v.packReady.then(function () {
        if (view !== v) return;
        flushLive();
        markDone();
        staticClock(runSeconds(v.events, v.startedAt), "run time");
        finalPanel();
      });
    }
    function queueBeat(ev) {
      if (mode !== "live" || !view) return;
      if (!addEvent(liveQueue, view.seen, ev)) return;
      if (!flushTimer) {
        var v = view;
        flushTimer = setTimeout(function () {
          flushTimer = null;
          v.packReady.then(function () { if (view === v) flushLive(); });
        }, 0);
      }
    }
    function flushLive() {
      if (!liveQueue.length || !view) return;
      var batch = liveQueue.sort(function (a, b) { return a.seq - b.seq; });
      liveQueue = [];
      var instant = batch.length > CATCHUP_AT;
      var ended = false;
      batch.forEach(function (ev) {
        renderEvent(ev, instant);
        if (ev.type === "run" && ev.phase === "end") ended = true;
      });
      if (view.done) staticClock(runSeconds(view.events, view.startedAt), "run time");
      if (ended) finishLive();
    }

    /* Resolves true when a run should play live. */
    function openStream(runId, explicit) {
      return new Promise(function (resolve) {
        var settled = false;
        var settle = function (v) { if (!settled) { settled = true; resolve(v); } };
        closeStream();
        var src;
        try {
          src = es = new win.EventSource("/api/run-stream?run_id=" + encodeURIComponent(runId));
        } catch (e) { return settle(false); }
        var pending = true;
        src.addEventListener("meta", function (msg) {
          if (es !== src) return;
          var meta = null;
          try { meta = JSON.parse(msg.data); } catch (e) { return; }
          if (!meta) return;
          if (pending) {
            pending = false;
            if (streamTimer) { clearTimeout(streamTimer); streamTimer = null; }
            var playable = meta.status === "live" || explicit;
            if (!playable || mode === "replay") {
              closeStream();
              return settle(playable);
            }
            enterLive(meta);
            return settle(true);
          }
          if (mode === "live" && view && meta.status === "done") markDone();
        });
        src.addEventListener("beat", function (msg) {
          if (pending || es !== src) return;
          try { queueBeat(JSON.parse(msg.data)); } catch (e) {}
        });
        src.addEventListener("end", function () { if (es === src) finishLive(); });
        src.addEventListener("error", function () {
          if (src.readyState !== 2) return; // 2 = CLOSED; otherwise it reconnects by itself
          if (es === src) closeStream();
          if (pending) return settle(false);
          if (mode === "live" && view && !view.done) {
            stopClock();
            runTitle.textContent = "The live connection closed.";
          }
        });
        streamTimer = setTimeout(function () {
          streamTimer = null;
          if (pending) { closeStream(); settle(false); }
        }, STREAM_GRACE_MS);
      });
    }

    function checkLive() {
      if (!win.fetch || !("EventSource" in win)) return Promise.resolve(false);
      return win.fetch(HEALTH_URL, { headers: { Accept: "application/json" } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; })
        .then(function (h) {
          if (!h || h.storage !== "reachable") return false;
          return openStream(requestedRun || "latest", Boolean(requestedRun));
        });
    }

    /* ----- replay ----- */
    function stopReplay() {
      if (rp && rp.timer) clearTimeout(rp.timer);
      rp = null;
    }
    function markList(runId) {
      var items = replayList.querySelectorAll(".replay-item");
      for (var i = 0; i < items.length; i++) {
        if (items[i].getAttribute("data-run") === runId) items[i].setAttribute("aria-current", "true");
        else items[i].removeAttribute("aria-current");
      }
    }
    function playArchived(run, opts) {
      opts = opts || {};
      if (!win.fetch) return;
      win.fetch(run.file, { cache: "no-cache" })
        .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
        .then(function (data) {
          return getPack(data.week || run.week || 1).then(function (pack) { enterReplay(data, run, pack, opts); });
        })
        .catch(function () {
          announce("That replay didn't load.");
          if (mode === "connecting") showIdle();
        });
    }
    function enterReplay(data, run, pack, opts) {
      var speed = rp ? rp.speed : 1;
      closeStream();
      dropQueue();
      stopReplay();
      mode = "replay";
      var label = data.label || run.label || "";
      var demo = Boolean(data.demo || run.demo);
      var week = data.week || run.week;
      newView({ runId: data.run_id || run.id, week: week, agent: data.agent || run.agent, label: label,
        demo: demo, startedAt: data.started_at, pack: pack });
      badges({ replay: true, demo: demo ? (label || "Demo run, unofficial") : "" });
      setHeader(view.agent || "Replay", data.week_title ? "Week " + week + " — " + data.week_title : (run.title || "Week " + week));
      staticClock(null, "run time");
      if (replayAbout) {
        replayAbout.textContent = (label ? label + ". " : "") + (data.about || "");
        replayAbout.hidden = !(label || data.about);
      }
      var events = (data.events || []).slice().sort(function (a, b) { return a.seq - b.seq; });
      rp = { events: events, idx: 0, timer: null, speed: speed, playing: true,
        total: runSeconds(events, data.started_at), data: data, run: run, pack: pack };
      controls.hidden = false;
      rpExit.hidden = !liveAvailable;
      setSpeed(rp.speed);
      setToggle("Pause", false);
      markList(run.id);
      announce("Replay: " + (view.agent || "a run") + ", " + (run.title || "Week " + week) + (label ? ". " + label : "") + ".");
      if (opts.user) {
        controls.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
        rpToggle.focus({ preventScroll: true });
      }
      playNext();
    }
    function setToggle(text, pressed) {
      rpToggle.textContent = text;
      rpToggle.setAttribute("aria-pressed", pressed ? "true" : "false");
    }
    function setSpeed(s) {
      [1, 2, 4].forEach(function (v) {
        var b = $("rp-" + v + "x");
        if (b) b.setAttribute("aria-pressed", v === s ? "true" : "false");
      });
    }
    function playNext() {
      if (!rp || !rp.playing) return;
      if (rp.idx >= rp.events.length) return finishReplay();
      var ev = rp.events[rp.idx];
      renderEvent(ev, false);
      var at = eventSeconds(ev, rp.data.started_at);
      clockEl.textContent = fmtClock(at);
      rpBar.style.width = (100 * (rp.idx + 1) / rp.events.length).toFixed(1) + "%";
      rpTime.textContent = fmtClock(at) + " / " + fmtClock(rp.total);
      rp.idx++;
      var next = rp.events[rp.idx];
      var gap = 0;
      if (next) {
        var dt = (eventSeconds(next, rp.data.started_at) || 0) - (at || 0);
        gap = Math.max(0.35, Math.min(4, dt / rp.speed));
      }
      rp.timer = setTimeout(playNext, gap * 1000);
    }
    function finishReplay() {
      rp.playing = false;
      rp.timer = null;
      setToggle("Replay", true);
      staticClock(runSeconds(view.events, view.startedAt), "run time");
      finalPanel();
    }
    function restartReplay() {
      var r = rp;
      enterReplay(r.data, r.run, r.pack, {});
    }

    function wire() {
      rpToggle.addEventListener("click", function () {
        if (!rp) return;
        if (!rp.playing && rp.idx >= rp.events.length) return restartReplay();
        rp.playing = !rp.playing;
        setToggle(rp.playing ? "Pause" : "Play", !rp.playing);
        if (rp.playing) playNext();
        else if (rp.timer) { clearTimeout(rp.timer); rp.timer = null; }
      });
      [1, 2, 4].forEach(function (v) {
        var b = $("rp-" + v + "x");
        if (b) b.addEventListener("click", function () { if (rp) { rp.speed = v; setSpeed(v); } });
      });
      rpExit.addEventListener("click", function () {
        stopReplay();
        controls.hidden = true;
        if (replayAbout) { replayAbout.hidden = true; replayAbout.textContent = ""; }
        setConnecting();
        feed.innerHTML = "";
        runEnd.hidden = true;
        openStream(requestedRun || "latest", Boolean(requestedRun)).then(function (live) {
          liveAvailable = live;
          if (!live && mode === "connecting") startDefault();
        });
      });
    }

    function loadIndex() {
      if (!win.fetch) return Promise.resolve([]);
      return win.fetch(RUNS_INDEX, { cache: "no-cache" })
        .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
        .then(function (index) {
          indexRuns = (index && Array.isArray(index.runs)) ? index.runs : [];
          if (!indexRuns.length) {
            replayList.innerHTML = "<p class='muted'>No archived runs yet.</p>";
            return indexRuns;
          }
          return Promise.all(indexRuns.map(function (run) { return getPack(run.week || 1); })).then(function (runPacks) {
            replayList.innerHTML = "";
            indexRuns.forEach(function (run, i) {
              var b = doc.createElement("button");
              b.type = "button";
              b.className = "replay-item";
              b.setAttribute("data-run", run.id);
              b.innerHTML = runItemHtml(run, runPacks[i]);
              b.addEventListener("click", function () { playArchived(run, { user: true }); });
              replayList.appendChild(b);
            });
            if (view && mode === "replay") markList(view.runId);
            return indexRuns;
          });
        })
        .catch(function () {
          replayList.innerHTML = "<p class='muted'>Couldn't load the archive.</p>";
          return [];
        });
    }

    var indexReady = null;
    function startDefault() {
      indexReady.then(function (runs) {
        if (mode !== "connecting") return;
        var run = defaultRun({ runs: runs });
        if (run) playArchived(run, {});
        else showIdle();
      });
    }

    wire();
    setConnecting();
    indexReady = loadIndex();
    checkLive().then(function (live) {
      liveAvailable = live;
      if (rpExit) rpExit.hidden = !live || mode !== "replay";
      if (!live) startDefault();
    });
  }

  if (typeof document !== "undefined" && typeof window !== "undefined") {
    var boot = function () { page(window, document); };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }

  return api;
});
