# Pack manifests

One JSON file per week, named `s<season>w<week>.json`. It is the one
source for that week's dates, levels, pars, blends, correctness type,
maximum total and star rule.

These files are served publicly. Never put answers, answer keys, hidden
optima, instance pools or trap verdicts in them. `lib/packs.js`
`checkManifest()` refuses answer-shaped keys, and the tests run it.

## Who reads it

- `lib/packs.js` loads each file with a static `require` so Vercel bundles
  it with the functions. Add a line there for each new week.
- `lib/score.js` scores from it: pars, blends, the star threshold and the
  level maximum. The caller passes the manifest; nothing falls back to a
  default week. It throws on a correctness type or a safety cap it can't
  apply, instead of scoring some other way.
- `api/submit.js` scores each entry with the week's manifest and stores
  the manifest's `id`, `version` and `hash` on the record. The submit
  response and the receipt status carry them too.
- `pack.html`, `scoring.html`, `faq.html` and `submit.html` carry the
  numbers as static text in elements marked `data-pack="<path>"`, so the
  pages read right without JavaScript. `scripts/stamp-pack.mjs` writes that text from the
  manifest: run `npm run build:pack` after any change here.
- `assets/js/watch.js` fetches the manifest for a run's week, for the
  maximum total, the star rule and which levels score.
- `assets/js/season.js` carries the same dates for the pages.

`scripts/test-pack.mjs` fails if any of these disagree with the manifest,
or if a page loses a marker it needs. `scripts/test-handlers.mjs` checks
the dates against `season.js`.

## Fields

| Field | Meaning |
|-------|---------|
| `schema` | Manifest format. 2 since levels were added. |
| `version` | This week's revision, a whole number. Bump it on any change after the week is published. |
| `id` | `s1w1`. Also the storage key segment for the week. |
| `season`, `week` | Numbers. |
| `title` | The pack's title. |
| `timezone` | The zone the labels are written in. |
| `opens` | UTC instant the week opens. Submissions are accepted from here. |
| `closes` | UTC instant the week closes. Submissions are refused from here. |
| `range`, `opens_label`, `closes_label` | The dates as the pages print them. |
| `scoring.inputs` | `self_reported`: every scoring input comes from the player. The only kind built. |
| `scoring.level_max` | Points for a perfect level (100). |
| `scoring.max_total` | Points for a perfect week: `level_max` times the scored levels (400). |
| `scoring.star_at` | A level scoring this or more earns its star (60). |
| `scoring.max_stars` | One star per scored level (4). |
| `scoring.pars_calibrated` | `false` until pars are set from measured Muse runs. |
| `levels[]` | Numbered 1, 2, 3 in order. |
| `levels[].tag`, `.title` | As the pack page prints them. |
| `levels[].scored` | `true` for a scored level, `false` for an exhibition. |
| `levels[].exhibition` | `true` on an unscored level (L5). It has no par, blend or correctness. |
| `levels[].correctness` | `binary`: 0 or 1, attested by the player. The only type the scorer applies. Partial credit and rubric grading need server grading. |
| `levels[].par` | `tokens` and `seconds`. Efficiency is `min(par / actual, 1)`. |
| `levels[].blend` | `token`, `time` and `procedure` weights, summing to 1. |
| `levels[].safety_cap` | L3's planned cap for an irreversible action taken without the player's OK. `applied` stays `false` until server grading can detect it. |

The hash is the SHA-256 of the manifest's canonical JSON (keys sorted, no
whitespace), so line endings and formatting don't change it.

## Pars

Before this manifest, the pack page and the scorer used different pars:

| Level | Pack page (kept) | Old scorer (dropped) |
|-------|------------------|----------------------|
| L1 | 800 tokens, 60 s | 800 tokens, 120 s |
| L2 | 4,000 tokens, 4 min | 6,000 tokens, 600 s |
| L3 | 2,500 tokens, 3 min | 5,000 tokens, 480 s |
| L4 | 6,000 tokens, 6 min | 6,000 tokens, 600 s |

The manifest keeps the pack page's set, for four reasons:

1. It is the set players were shown.
2. `scoring.html`'s worked example (860 tokens and 70 s on L1) scores 92
   with it, as the page says. The old scorer set gave 97.
3. The archived demo run's self-reported scores (57, 81, 90 and 90, 318 in
   all) come out the same with it. The old scorer set gives 57, 86, 100
   and 90 (333).
4. The scorer's own comment called its set "demo defaults".

`scripts/test-pack.mjs` checks points 2 and 3, so the choice can't drift.

Both sets were first guesses. Neither has been checked against real Muse
runs, so `pars_calibrated` is `false`. Week 1's pars stay fixed once the
week opens. A change applies to a later pack, with a new `version`.

## Retention

Stored submissions for a week expire 90 days after `closes`.
