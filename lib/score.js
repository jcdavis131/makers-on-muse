/* Makers on Muse — provisional scoring. Pure, zero deps.

   Every number comes from the week's pack manifest (data/packs/, loaded
   through lib/packs.js): which levels are scored, each level's pars and
   blend (token / time / procedure weights), the star threshold and the
   correctness type. The caller passes the manifest. Nothing here falls
   back to a default week.

   level score = correctness x (w_token x TokenEff + w_time x TimeEff + w_proc x Procedure) x 100
   Correctness is a gate (binary: 0 or 1). Efficiency is min(par / actual, 1).
   A level scoring star_at or more earns its star. A level the player
   didn't attempt scores 0. Exhibition levels (L5) score nothing.

   PROVISIONAL: every input (correctness, tokens, seconds, procedure_score)
   is SELF-REPORTED by the submitter. This never verifies a run; server
   grading is not built yet. */

"use strict";

function r3(x) { return Math.round(x * 1000) / 1000; }

/* The scored level spec for level n, or a thrown Error when the pack
   can't score it: the scorer refuses what it can't apply rather than
   scoring it some other way. */
function levelSpec(pack, n) {
  if (!pack || !Array.isArray(pack.levels) || !pack.scoring) {
    throw new TypeError("provisional scoring needs a pack manifest");
  }
  var spec = null;
  for (var i = 0; i < pack.levels.length; i++) {
    if (pack.levels[i].n === n) spec = pack.levels[i];
  }
  if (!spec || spec.scored !== true) {
    throw new Error("level " + n + " is not a scored level of pack " + pack.id);
  }
  if (spec.correctness !== "binary") {
    throw new Error("pack " + pack.id + " level " + n + ": correctness type " +
      JSON.stringify(spec.correctness) + " needs server grading, which isn't built");
  }
  if (spec.safety_cap && spec.safety_cap.applied !== false) {
    throw new Error("pack " + pack.id + " level " + n + ": the safety cap needs server grading, which isn't built");
  }
  return spec;
}

/* provisionalScore(level, pack) -> { total, star, provisional, parts, blend, note }
   level: { n, correct: 0|1 (self-attested), tokens_est, seconds,
            procedure_score: 0..1 (self-assessed, optional) } */
function provisionalScore(level, pack) {
  var spec = levelSpec(pack, level.n);
  var blend = spec.blend;
  var par = spec.par;

  var correct = level.correct === 1 ? 1 : 0;
  var tokenEff = Math.min(1, par.tokens / Math.max(1, Number(level.tokens_est) || 0));
  var timeEff = Math.min(1, par.seconds / Math.max(1, Number(level.seconds) || 0));
  var procRaw = typeof level.procedure_score === "number"
    ? Math.max(0, Math.min(1, level.procedure_score))
    : null;
  var procNote = null;
  if (procRaw === null) {
    procNote = "no procedure self-assessment supplied — scored as 0";
  }
  var procEff = procRaw === null ? 0 : procRaw;

  var inner = blend.token * tokenEff + blend.time * timeEff + blend.procedure * procEff;
  var total = Math.round(correct * inner * pack.scoring.level_max);

  return {
    total: total,
    star: total >= pack.scoring.star_at,
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

/* provisionalSubmissionScore(levels, pack) -> { levels:[...], total, stars, max_total, max_stars }
   Each level comes back as one of:
     { n, total, star, parts, provisional }       an attempted scored level
     { n, skipped: true, total: 0, star: false }  "Didn't attempt": scores 0
     { n, exhibition: true }                      an exhibition level: no points */
function provisionalSubmissionScore(levels, pack) {
  if (!pack || !Array.isArray(pack.levels) || !pack.scoring) {
    throw new TypeError("provisional scoring needs a pack manifest");
  }
  var scored = (levels || []).map(function (lv) {
    var spec = null;
    for (var i = 0; i < pack.levels.length; i++) {
      if (pack.levels[i].n === lv.n) spec = pack.levels[i];
    }
    if (spec && spec.exhibition === true) return { n: lv.n, exhibition: true, provisional: true };
    if (lv.skipped === true) {
      levelSpec(pack, lv.n);
      return { n: lv.n, skipped: true, total: 0, star: false, provisional: true };
    }
    var s = provisionalScore(lv, pack);
    return { n: lv.n, total: s.total, star: s.star, parts: s.parts, provisional: true };
  });
  var counted = scored.filter(function (s) { return !s.exhibition; });
  var total = counted.reduce(function (a, s) { return a + s.total; }, 0);
  var stars = counted.filter(function (s) { return s.star; }).length;
  return {
    levels: scored,
    total: total,
    stars: stars,
    max_total: pack.scoring.max_total,
    max_stars: pack.scoring.max_stars,
    provisional: true
  };
}

module.exports = {
  levelSpec: levelSpec,
  provisionalScore: provisionalScore,
  provisionalSubmissionScore: provisionalSubmissionScore
};
