/* Makers on Muse — submit form logic. Zero dependencies.
   Pure pieces of the submit page, shared by submit.html and the Node tests
   (scripts/test-pages.mjs): the level cards, reading and checking what the
   player typed, mapping server errors onto fields, the receipt rows, and
   drafts kept in this browser's localStorage.

   Browser: sets window.MOM_SUBMIT. Node: module.exports. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MOM_SUBMIT = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var LEVELS = [
    { n: 1, tag: "L1 · Scout", title: "What's the number?", hint: "The figure and the source your agent found." },
    { n: 2, tag: "L2 · Researcher", title: "Brief me.", hint: "The under-300-word brief, with its citations." },
    { n: 3, tag: "L3 · Operator", title: "Fix my morning.", hint: "The conflict analysis and the reschedule draft. Remember the safety rule: nothing sent." },
    { n: 4, tag: "L4 · Detective", title: "Get me to the wedding.", hint: "Itinerary, total price, and the constraints you checked." },
    { n: 5, tag: "L5 · Boss · exhibition", title: "Make it legible.", hint: "Unscored. Describe what you built and link to it if you can.", exhibition: true }
  ];

  /* Field ids: a answer, t tokens, s seconds, p procedure, r procedure
     self-assessment, c correctness, e evidence, k "didn't attempt",
     l the L5 link. Each is the letter plus the level number. */
  var SERVER_KEYS = { answer: "a", tokens_est: "t", seconds: "s", procedure: "p", procedure_score: "r", correct: "c", evidence: "e", link: "l", skipped: "k" };
  var LABELS = { a: "answer", t: "tokens", s: "seconds", p: "procedure", r: "procedure self-assessment", c: "correctness", e: "evidence links", l: "link", k: "didn't attempt" };
  var TOP_FIELDS = { handle: "f-handle", agent: "f-agent", contact: "f-contact", "consent.terms": "c-terms" };
  var TOP_LABELS = { "f-handle": "Handle", "f-agent": "Agent name", "f-contact": "Contact email", "c-terms": "Terms" };

  var HANDLE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{2,23}$/;
  var EMAIL_RE = /^[^\s@]{1,64}@[^\s@.][^\s@]{0,188}\.[A-Za-z]{2,63}$/;
  var URL_RE = /^https?:\/\/[^\s/$.?#][^\s]*$/i;
  var WHOLE_RE = /^\d{1,8}$/;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function label(id) {
    if (TOP_LABELS[id]) return TOP_LABELS[id];
    var m = /^([a-z])(\d)$/.exec(id);
    return m ? "L" + m[2] + " " + (LABELS[m[1]] || "") : id;
  }

  /* ---------- level cards ---------- */

  function field(id, text, control, hint) {
    return '<div class="field"><label for="' + id + '">' + esc(text) + "</label>" + control +
      (hint ? '<p class="fhint" id="' + id + '-hint">' + esc(hint) + "</p>" : "") +
      '<p class="ferr" id="' + id + '-err" hidden></p></div>';
  }
  function described(id, hint) { return hint ? ' aria-describedby="' + id + '-hint"' : ""; }

  /* The HTML for one level card. Every string is escaped, including our own. */
  function cardHtml(L) {
    var n = L.n;
    var head = '<span class="step">' + esc(L.tag) + "</span><h2>" + esc(L.title) + '</h2><p class="hint">' + esc(L.hint) + "</p>";
    if (L.exhibition) {
      // A <summary> may hold only phrasing and heading content, so the card
      // styling goes on the summary itself and the hints are spans.
      return '<details class="lvl5" id="card' + n + '"><summary class="sub-card" style="margin:0">' +
        '<span class="step">' + esc(L.tag) + "</span><h2>" + esc(L.title) + '</h2><span class="hint">' + esc(L.hint) + "</span>" +
        '<span class="hint" style="margin:0">Optional. Open this to add your exhibition entry.</span></summary>' +
        '<div class="sub-card" style="margin-top:12px">' +
        field("a" + n, "What did you build?", '<textarea id="a' + n + '" maxlength="4000"></textarea>') +
        field("l" + n, "Link to your build (optional)",
          '<input type="url" id="l' + n + '" maxlength="500" placeholder="https://" autocomplete="off" spellcheck="false"' + described("l" + n, 1) + ">",
          "A page anyone can open, starting with https://. Leave it blank if you have nothing to share.") +
        "</div></details>";
    }
    return '<div class="sub-card" id="card' + n + '">' + head +
      '<label class="check skip-check"><input type="checkbox" id="k' + n + '"><span><strong>Didn’t attempt this level.</strong> ' +
      "It scores 0, and you can leave its fields empty.</span></label>" +
      '<p class="ferr" id="k' + n + '-err" hidden></p>' +
      '<fieldset class="lvl-fields" id="b' + n + '" aria-label="Level ' + n + ' details">' +
      field("a" + n, "Answer", '<textarea id="a' + n + '" maxlength="4000" placeholder="Your agent’s final answer for this level"></textarea>') +
      '<div class="field-row2">' +
        field("t" + n, "Tokens used (est.)", '<input type="text" inputmode="numeric" id="t' + n + '" maxlength="8" autocomplete="off"' + described("t" + n, 1) + ">", "A whole number, 1 or more.") +
        field("s" + n, "Seconds taken", '<input type="text" inputmode="numeric" id="s' + n + '" maxlength="8" autocomplete="off"' + described("s" + n, 1) + ">", "A whole number, 1 or more.") +
      "</div>" +
      field("p" + n, "Procedure: what did your agent actually do?", '<textarea id="p' + n + '" maxlength="2000" placeholder="Steps in order: searched X, cross-checked Y, drafted Z…"></textarea>') +
      '<div class="field-row2">' +
        field("r" + n, "Procedure, self-assessed (%)", '<input type="text" inputmode="numeric" id="r' + n + '" maxlength="3" autocomplete="off"' + described("r" + n, 1) + ">", "Your own estimate, 0 to 100.") +
        field("c" + n, "Correctness, self-attested", '<select id="c' + n + '"><option value="">Choose…</option>' +
          '<option value="1">Correct: I’m confident</option><option value="0">Not correct, or unsure</option></select>') +
      "</div>" +
      field("e" + n, "Evidence links (optional)", '<input type="text" id="e' + n + '" maxlength="2600" placeholder="https://…" autocomplete="off" spellcheck="false"' + described("e" + n, 1) + ">",
        "Up to 5. Separate them with commas or spaces.") +
      "</fieldset></div>";
  }

  /* ---------- reading and checking ---------- */

  function trim(v) { return String(v == null ? "" : v).trim(); }
  function splitLinks(s) { return trim(s) ? trim(s).split(/[\s,]+/).filter(Boolean) : []; }

  /* collect(v) -> { body, errors: [{ field, msg }] }
     v holds the raw form values:
       { week, handle, agent, contact, terms, publish,
         levels: { 1..4: { k, a, t, s, p, r, c, e }, 5: { a, l } } }
     The body is exactly what /api/submit accepts. */
  function collect(v) {
    var errors = [];
    function err(field, msg) { errors.push({ field: field, msg: msg }); }
    var handle = trim(v.handle), agent = trim(v.agent), contact = trim(v.contact);
    if (!handle) err("f-handle", "Required.");
    else if (!HANDLE_RE.test(handle)) err("f-handle", "3 to 24 letters, digits, - or _, starting with a letter or digit.");
    if (!agent) err("f-agent", "Required.");
    else if (agent.length < 2 || agent.length > 40) err("f-agent", "2 to 40 characters.");
    if (contact && (contact.length > 254 || !EMAIL_RE.test(contact))) err("f-contact", "An email address like name@example.com, or leave it blank.");

    var levels = [];
    var attempted = 0;
    var lv = v.levels || {};
    [1, 2, 3, 4].forEach(function (n) {
      var x = lv[n] || {};
      if (x.k) { levels.push({ n: n, skipped: true }); return; }
      attempted++;
      var a = trim(x.a), p = trim(x.p), t = trim(x.t), s = trim(x.s), r = trim(x.r), c = trim(x.c);
      if (!a) err("a" + n, "Required. Paste your agent’s final answer, or tick “Didn’t attempt”.");
      if (!t) err("t" + n, "Required.");
      else if (!WHOLE_RE.test(t) || +t < 1) err("t" + n, "A whole number, 1 or more.");
      if (!s) err("s" + n, "Required.");
      else if (!WHOLE_RE.test(s) || +s < 1) err("s" + n, "A whole number, 1 or more.");
      if (!p) err("p" + n, "Required. Say what your agent did, step by step.");
      if (!r) err("r" + n, "Required. Your own estimate, 0 to 100.");
      else if (!/^\d{1,3}$/.test(r) || +r > 100) err("r" + n, "A number from 0 to 100.");
      if (c !== "0" && c !== "1") err("c" + n, "Choose one.");
      var links = splitLinks(x.e);
      if (links.length > 5) err("e" + n, "Up to 5 links.");
      else if (links.some(function (u) { return u.length > 500 || !URL_RE.test(u); })) {
        err("e" + n, "Each link must start with http:// or https://.");
      }
      var out = {
        n: n, answer: a, tokens_est: +t, seconds: +s, procedure: p,
        correct: c === "1" ? 1 : 0, procedure_score: +r / 100
      };
      if (links.length) out.evidence = links;
      levels.push(out);
    });
    if (!attempted) err("k1", "Attempt at least one of levels 1–4.");

    var x5 = lv[5] || {};
    var a5 = trim(x5.a), l5 = trim(x5.l);
    if (a5 || l5) {
      if (!a5) err("a5", "Describe what you built, or clear the link.");
      if (l5 && (l5.length > 500 || !URL_RE.test(l5))) err("l5", "A link that starts with http:// or https://.");
      var ex = { n: 5, answer: a5 };
      if (l5) ex.link = l5;
      levels.push(ex);
    }
    if (!v.terms) err("c-terms", "Tick this box to file your run.");

    var body = {
      week: Number(v.week) || 1,
      handle: handle,
      agent: agent,
      levels: levels,
      consent: { terms: Boolean(v.terms), publish: Boolean(v.publish) }
    };
    if (contact) body.contact = contact;
    return { body: body, errors: errors };
  }

  /* serverErrors(list, body) -> [{ field, msg }]. The server names levels
     by their index in the posted array; map that back to level numbers. */
  function serverErrors(list, body) {
    var posted = (body && body.levels) || [];
    return (Array.isArray(list) ? list : []).map(function (e) {
      var s = String(e);
      var m = /^(handle|agent|contact|consent\.terms): (.*)$/.exec(s);
      if (m) return { field: TOP_FIELDS[m[1]], msg: m[2] };
      m = /^levels\[(\d+)\](?:\.(\w+))?(?:\[\d+\])?(?: \(didn't attempt\))?: (.*)$/.exec(s);
      if (m && posted[+m[1]]) {
        var n = posted[+m[1]].n;
        var key = m[2] ? SERVER_KEYS[m[2]] : null;
        if (!key) key = n === 5 ? "a" : (posted[+m[1]].skipped ? "k" : "a");
        return { field: key + n, msg: m[3] };
      }
      return { field: null, msg: s };
    });
  }

  /* ---------- receipt ---------- */

  function receiptRows(scores) {
    return (Array.isArray(scores) ? scores : []).map(function (s) {
      var right;
      if (s && s.exhibition) right = "Exhibition, unscored";
      else if (s && s.skipped) right = "Didn’t attempt · 0 / 100";
      else right = esc(s && s.total) + " / 100" + (s && s.star ? ' <span class="star" role="img" aria-label="star">★</span>' : "");
      return '<div class="rrow"><span class="lvl">LEVEL ' + esc(s && s.n) + '</span><span class="pts">' + right + "</span></div>";
    }).join("");
  }

  /* ---------- drafts (this browser only) ---------- */

  function draftKey(week) { return "mom:draft:s1w" + (Number(week) || 1); }

  /* The storage object, or null. Reading window.localStorage itself can
     throw when site data is blocked. */
  function browserStorage() {
    try { return typeof window !== "undefined" && window.localStorage ? window.localStorage : null; } catch (e) { return null; }
  }

  /* What a draft keeps: everything but the contact address and the terms
     box, which are asked fresh each time. */
  function draftValues(v) {
    var out = { handle: trim(v.handle), agent: v.agent || "", publish: Boolean(v.publish), levels: {} };
    var lv = v.levels || {};
    [1, 2, 3, 4, 5].forEach(function (n) {
      var x = lv[n] || {};
      var keep = {};
      ["k", "a", "t", "s", "p", "r", "c", "e", "l"].forEach(function (k) {
        if (x[k] !== undefined && x[k] !== "" && x[k] !== false) keep[k] = x[k];
      });
      out.levels[n] = keep;
    });
    return out;
  }

  function saveDraft(storage, key, v) {
    try {
      if (!storage) return false;
      storage.setItem(key, JSON.stringify({ v: 1, saved: Date.now(), values: draftValues(v) }));
      return true;
    } catch (e) { return false; }
  }

  function loadDraft(storage, key) {
    try {
      if (!storage) return null;
      var raw = storage.getItem(key);
      if (!raw) return null;
      var d = JSON.parse(raw);
      if (!d || d.v !== 1 || !d.values || typeof d.values !== "object") return null;
      return d;
    } catch (e) { return null; }
  }

  function clearDraft(storage, key) {
    try { if (storage) storage.removeItem(key); return true; } catch (e) { return false; }
  }

  return {
    LEVELS: LEVELS,
    esc: esc,
    label: label,
    cardHtml: cardHtml,
    collect: collect,
    serverErrors: serverErrors,
    receiptRows: receiptRows,
    draftKey: draftKey,
    browserStorage: browserStorage,
    draftValues: draftValues,
    saveDraft: saveDraft,
    loadDraft: loadDraft,
    clearDraft: clearDraft
  };
});
