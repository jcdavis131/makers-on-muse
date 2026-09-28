/* Submit flow: builds level cards, keeps a draft, checks fields, POSTs to
   /api/submit, renders the receipt. Pure pieces live in
   assets/js/submit-form.js (MOM_SUBMIT); every innerHTML below is built
   from escaped strings.
   This was an inline script in submit.html. It lives here so the
   Content-Security-Policy can allow scripts from this site only
   (script-src 'self'). submit.html loads it after season.js and
   submit-form.js, not deferred. */
(function(){
"use strict";
var F = window.MOM_SUBMIT;
var esc = F.esc;
function $(id){ return document.getElementById(id); }

/* Week gate. Dates come from assets/js/season.js (one source of truth).
   The static HTML ships closed (fieldset disabled, notice shown), so the
   form stays a preview if the season script fails to load.
   setClosed(title, body): the whole form is a preview (before open, after close).
   setPaused(title, body): the week is open but storage isn't, so fields
   stay editable (a draft keeps them) and only the submit button waits. */
var fields = $("sub-fields");
var gate = $("sub-gate");
var btn = $("sub-btn");
var paused = false;
function showGate(title, body){
  gate.hidden = false;
  $("sub-gate-title").textContent = title;
  $("sub-gate-body").textContent = body;
}
function setClosed(title, body){
  fields.disabled = true;
  showGate(title, body);
}
function setPaused(title, body){
  fields.disabled = false;
  paused = true;
  btn.disabled = true;
  showGate(title, body);
}
function setOpen(){
  fields.disabled = false;
  gate.hidden = true;
}
var week = 1;
(function(){
  var S = window.MOM_SEASON;
  if(!S) return; // keep the static closed state
  var g = S.submitGate(Date.now());
  week = g.week;
  $("f-week").value = g.week;
  if(g.open) setOpen(); else setClosed(g.title, g.body);
  /* While the week is open, pause the submit button if storage can't keep
     entries. /api/health is cached for 30 s (and may be served stale for
     60 s), so this can lag a change by up to a minute. If the check itself
     fails, leave the form open: a submit reports its own error. */
  if(g.open && window.fetch){
    fetch("/api/health", {headers: {"Accept": "application/json"}})
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(h){
        if(h && h.storage && h.storage !== "reachable"){
          setPaused("Submissions can't be saved yet.",
            "Storage isn't connected, so nothing sent now would be kept. You can still fill in the form: it saves in this browser as a draft. Reload this page later to submit.");
        }
      })
      .catch(function(){});
  }
})();

/* ---------- level cards ---------- */
var host = $("level-cards");
F.LEVELS.forEach(function(L){
  var wrap = document.createElement("div");
  wrap.innerHTML = F.cardHtml(L);
  host.appendChild(wrap.firstChild);
});
function syncSkip(n){
  var k = $("k"+n), b = $("b"+n);
  if(!k || !b) return;
  b.disabled = k.checked;
  b.hidden = k.checked;
}
[1,2,3,4].forEach(function(n){
  $("k"+n).addEventListener("change", function(){ syncSkip(n); });
});

/* ---------- reading and writing the form ---------- */
var LEVEL_KEYS = ["a","t","s","p","r","c","e"];
function readValues(){
  var v = {
    week: week, handle: $("f-handle").value, agent: $("f-agent").value, contact: $("f-contact").value,
    terms: $("c-terms").checked, publish: $("c-publish").checked, levels: {}
  };
  [1,2,3,4].forEach(function(n){
    var x = { k: $("k"+n).checked };
    LEVEL_KEYS.forEach(function(k){ x[k] = $(k+n).value; });
    v.levels[n] = x;
  });
  v.levels[5] = { a: $("a5").value, l: $("l5").value };
  return v;
}
function applyValues(d){
  if(!d) return;
  if(typeof d.handle === "string") $("f-handle").value = d.handle;
  if(typeof d.agent === "string") $("f-agent").value = d.agent;
  $("c-publish").checked = Boolean(d.publish);
  var lv = d.levels || {};
  [1,2,3,4].forEach(function(n){
    var x = lv[n] || {};
    $("k"+n).checked = Boolean(x.k);
    LEVEL_KEYS.forEach(function(k){ $(k+n).value = typeof x[k] === "string" ? x[k] : ""; });
    syncSkip(n);
  });
  var x5 = lv[5] || {};
  $("a5").value = typeof x5.a === "string" ? x5.a : "";
  $("l5").value = typeof x5.l === "string" ? x5.l : "";
  if($("a5").value || $("l5").value) $("card5").open = true;
}

/* ---------- drafts (this browser only; every access is guarded) ---------- */
var store = F.browserStorage();
var draftKey = F.draftKey(week);
var draftNote = $("draft-note");
(function(){
  var d = F.loadDraft(store, draftKey);
  if(d){
    applyValues(d.values);
    draftNote.textContent = "Restored your draft from this browser.";
  }
})();
var draftTimer = null;
function saveSoon(){
  clearTimeout(draftTimer);
  draftTimer = setTimeout(function(){
    if(F.saveDraft(store, draftKey, readValues())){
      draftNote.textContent = "Draft saved in this browser.";
    } else {
      draftNote.textContent = "Drafts can't be saved in this browser.";
    }
  }, 400);
}
$("sub-form").addEventListener("input", saveSoon);
$("sub-form").addEventListener("change", saveSoon);
$("draft-clear").addEventListener("click", function(){
  clearTimeout(draftTimer);
  F.clearDraft(store, draftKey);
  applyValues({ handle: "", agent: "", publish: false, levels: {} });
  $("f-contact").value = "";
  $("c-terms").checked = false;
  clearErrors();
  draftNote.textContent = "Draft cleared.";
});

/* ---------- errors: inline, plus a summary ---------- */
function describedBy(el, id, on){
  var ids = (el.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean)
    .filter(function(x){ return x !== id; });
  if(on) ids.push(id);
  if(ids.length) el.setAttribute("aria-describedby", ids.join(" "));
  else el.removeAttribute("aria-describedby");
}
function clearErrors(){
  var bad = document.querySelectorAll("#sub-form [aria-invalid]");
  for(var i = 0; i < bad.length; i++){
    bad[i].removeAttribute("aria-invalid");
    describedBy(bad[i], bad[i].id + "-err", false);
  }
  var msgs = document.querySelectorAll("#sub-form .ferr");
  for(var j = 0; j < msgs.length; j++){ msgs[j].hidden = true; msgs[j].textContent = ""; }
  var box = $("sub-errors");
  box.classList.remove("show");
  box.innerHTML = "";
}
function markField(id, msg){
  var el = $(id), err = $(id + "-err");
  if(!el || !err) return false;
  if(id === "a5" || id === "l5") $("card5").open = true;
  // A level marked "Didn't attempt" hides its fields; don't mark hidden ones.
  var m = /^[atsprce]([1-4])$/.exec(id);
  if(m && $("k"+m[1]).checked) return false;
  el.setAttribute("aria-invalid", "true");
  err.textContent = msg;
  err.hidden = false;
  describedBy(el, id + "-err", true);
  return true;
}
/* list: [{ field, msg }] or plain strings. Fields get inline errors; the
   summary lists everything, linking to fields. Focus goes to the first
   marked field, or to the summary when nothing could be marked. */
function showErrors(list, heading){
  clearErrors();
  if(!list.length) return;
  var first = null;
  var items = list.map(function(e){
    if(typeof e === "string") e = { field: null, msg: e };
    var marked = e.field ? markField(e.field, e.msg) : false;
    if(marked && !first) first = $(e.field);
    var text = (e.field ? F.label(e.field) + ": " : "") + e.msg;
    return marked ? '<a href="#' + esc(e.field) + '">' + esc(text) + "</a>" : esc(text);
  });
  var box = $("sub-errors");
  box.innerHTML = "<h2>" + esc(heading || HEADINGS[400]) + "</h2><ul><li>" + items.join("</li><li>") + "</li></ul>";
  box.classList.add("show");
  if(first){ first.focus(); first.scrollIntoView({block: "center"}); }
  else { box.focus(); box.scrollIntoView({block: "nearest"}); }
}
$("sub-errors").addEventListener("click", function(ev){
  var a = ev.target.closest ? ev.target.closest("a[href^='#']") : null;
  if(!a) return;
  var el = $(a.getAttribute("href").slice(1));
  if(el){ ev.preventDefault(); el.focus(); el.scrollIntoView({block: "center"}); }
});

/* Headings by HTTP status, so a server-side problem never reads as the
   player's mistake. */
var HEADINGS = {
  400: "Almost — a few things need attention:",
  409: "Not filed.",
  413: "Not filed: this entry is too long.",
  415: "Not filed.",
  429: "Not filed: too many tries.",
  503: "Not filed: storage isn't connected yet."
};

/* ---------- submit ---------- */
$("sub-form").addEventListener("submit", function(ev){
  ev.preventDefault();
  if(fields.disabled || paused) return;
  var out = F.collect(readValues());
  if(out.errors.length){ showErrors(out.errors); return; }
  clearErrors();
  var body = out.body;

  btn.disabled = true; btn.textContent = "Filing…";
  $("receipt").classList.remove("show");

  fetch("/api/submit", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(body)
  }).then(function(r){
    return r.json().catch(function(){ return null; })
      .then(function(d){ return {ok: r.ok, status: r.status, data: d}; });
  })
  .then(function(res){
    btn.disabled = false; btn.textContent = "Submit run";
    var d = res.data || {};
    if(!res.ok || !d.receipt){
      var list;
      if(res.status === 400 && d.errors) list = F.serverErrors(d.errors, body);
      else if(res.status === 503) list = ["This is on our side, not yours. Nothing was saved, and your answers are still in the form and in your draft."];
      else if(d.message) list = [d.message];
      else list = [d.error || ("Something went wrong (HTTP " + res.status + "). Nothing was filed.")];
      showErrors(list, HEADINGS[res.status] || "Not filed.");
      return;
    }
    showReceipt(d);
    clearTimeout(draftTimer);
    F.clearDraft(store, draftKey);
    draftNote.textContent = "Filed. Your draft is cleared.";
  }).catch(function(){
    btn.disabled = false; btn.textContent = "Submit run";
    showErrors(["Could not reach the scorekeeper. Check your connection and try again. Nothing was filed, and your draft is still here."], "Not filed.");
  });
});

function showReceipt(d){
  $("receipt-code").textContent = d.receipt;
  $("token-code").textContent = d.token || "—";
  var link = location.origin + "/receipt#token=" + encodeURIComponent(d.token || "");
  $("receipt-link").href = link;
  $("receipt-link").setAttribute("data-link", link);
  $("receipt-rows").innerHTML = F.receiptRows(d.scores);
  $("receipt-total").textContent = String(d.total);
  if(typeof d.max_total === "number") $("receipt-max").textContent = String(d.max_total);
  $("receipt-note").innerHTML =
    "<strong>Provisional scores</strong>. Every input is self-reported, and nothing is verified yet. " +
    "<strong>" + esc(d.redactions) + "</strong> value(s) matching common personal patterns were removed before filing. " +
    "Your receipt code <strong>" + esc(d.receipt) + "</strong> is for display. It proves nothing on its own. The secret token below does.";
  var rc = $("receipt");
  rc.classList.add("show");
  rc.scrollIntoView({behavior: "smooth", block: "start"});
}

/* ---------- copy buttons ---------- */
function copy(text, button, idle){
  function done(ok){
    button.textContent = ok ? "Copied" : "Copy failed: select it by hand";
    setTimeout(function(){ button.textContent = idle; }, 1800);
  }
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(function(){ done(true); }, function(){ done(false); });
  } else {
    done(false);
  }
}
$("token-copy").addEventListener("click", function(){
  copy($("token-code").textContent, this, "Copy token");
});
$("link-copy").addEventListener("click", function(){
  copy($("receipt-link").getAttribute("data-link") || "", this, "Copy private link");
});
$("receipt-copy").addEventListener("click", function(){
  var code = $("receipt-code").textContent;
  var total = $("receipt-total").textContent;
  var txt = "Makers on Muse, Week " + week + ": receipt " + code + " · provisional " + total +
    "/" + $("receipt-max").textContent + ", self-reported · https://makersonmuse.com/pack";
  copy(txt, this, "Copy receipt");
});
})();
