/* Makers on Muse — provisional scoring. Pure, zero deps.
   Applies the published blends (scoring.html):
     L1 50/30/20   L2 30/20/50   L3 20/20/60   L4 30/20/50   (token/time/procedure)
   Correctness is a multiplicative gate. Token/time efficiency are
   min(par / actual, 1). Pars are demo defaults — the real weekly pars ship
   with each pack and can be passed via opts.pars.
   Four scored levels (L1-L4): up to 400 points and 0-4 stars. A level
   the player didn't attempt scores 0. L5 is an unscored exhibition.
   PROVISIONAL: every input (correctness, tokens, seconds, procedure_score)
   is SELF-REPORTED by the submitter. This never verifies a run; server
   grading is not built yet. */

"use strict";

var BLENDS = {
  1: { token: 0.50, time: 0.30, procedure: 0.20 },
  2: { token: 0.30, time: 0.20, procedure: 0.50 },
  3: { token: 0.20, time: 0.20, procedure: 0.60 },
  4: { token: 0.30, time: 0.20, procedure: 0.50 },
  5: { token: 0.35, time: 0.25, procedure: 0.40 } // baseline blend; L5 is exhibition
};

/* Demo pars. Real pars are published with each weekly pack. */
var DEFAULT_PARS = {
  1: { tokens: 800, seconds: 120 },
  2: { tokens: 6000, seconds: 600 },
  3: { tokens: 5000, seconds: 480 },
  4: { tokens: 6000, seconds: 600 },
  5: { tokens: 6000, seconds: 600 }
};

var STAR_AT = 60; // scoring.html: score 60+ earns the level star

function r3(x) { return Math.round(x * 1000) / 1000; }

/* provisionalScore(level, opts) -> { total, star, provisional, parts, blend, note }
   level: { n:1..5, correct:0|1 (self-attested), tokens_est, seconds,
            procedure_score:0..1 (self-assessed, optional) }
   opts: { pars } — override weekly pars */
function provisionalScore(level, opts) {
  opts = opts || {};
  var n = level.n;
  var blend = BLENDS[n] || BLENDS[5];
  var pars = (opts.pars && opts.pars[n]) || DEFAULT_PARS[n] || DEFAULT_PARS[5];

  var correct = level.correct === 1 ? 1 : 0;
  var tokenEff = Math.min(1, pars.tokens / Math.max(1, Number(level.tokens_est) || 0));
  var timeEff = Math.min(1, pars.seconds / Math.max(1, Number(level.seconds) || 0));
  var procRaw = typeof level.procedure_score === "number"
    ? Math.max(0, Math.min(1, level.procedure_score))
    : null;
  var procNote = null;
  if (procRaw === null) {
    procNote = "no procedure self-assessment supplied — scored as 0";
  }
  var procEff = procRaw === null ? 0 : procRaw;

  var inner = blend.token * tokenEff + blend.time * timeEff + blend.procedure * procEff;
  var total = Math.round(correct * inner * 100);

  return {
    total: total,
    star: total >= STAR_AT,
    provisional: true,
    parts: {
      correctness: correct,
      tokens: r3(tokenEff),
      time: r3(timeEff),
      procedure: r3(procEff)
    },
    blend: { token: blend.token, time: blend.time, procedure: blend.procedure },
    note: "Provisional: every input is self-reported, not verified." +
      (procNote ? " " + procNote + "." : "")
  };
}

/* provisionalSubmissionScore(levels, opts) -> { levels:[...], total, stars }
   Each level comes back as one of:
     { n, total, star, parts, provisional }       an attempted level 1-4
     { n, skipped: true, total: 0, star: false }  "Didn't attempt": scores 0
     { n: 5, exhibition: true }                   L5: unscored, no points */
function provisionalSubmissionScore(levels, opts) {
  var scored = (levels || []).map(function (lv) {
    if (lv.n === 5) return { n: 5, exhibition: true, provisional: true };
    if (lv.skipped === true) return { n: lv.n, skipped: true, total: 0, star: false, provisional: true };
    var s = provisionalScore(lv, opts);
    return { n: lv.n, total: s.total, star: s.star, parts: s.parts, provisional: true };
  });
  var scoredMain = scored.filter(function (s) { return s.n >= 1 && s.n <= 4; });
  var total = scoredMain.reduce(function (a, s) { return a + s.total; }, 0);
  var stars = scoredMain.filter(function (s) { return s.star; }).length;
  return { levels: scored, total: total, stars: stars, provisional: true };
}

module.exports = {
  BLENDS: BLENDS,
  DEFAULT_PARS: DEFAULT_PARS,
  STAR_AT: STAR_AT,
  provisionalScore: provisionalScore,
  provisionalSubmissionScore: provisionalSubmissionScore
};
