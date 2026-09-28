# Makers on Muse

**How capable is your Muse?** A weekly test pack for Muse owners: four scored levels, from a simple lookup to multi-step planning, plus one unscored exhibition build (L5). Run it with your Muse, then submit your answers and your own numbers. Mabel, the grandma stenographer, keeps the minutes.

Site: **makersonmuse.com**. Independent project, not affiliated with Meta.

## Status (Sep 27, 2026)

- **Season 1, Week 1** opens Mon Oct 5, 2026, 6:00 AM CT and closes Sun Oct 11, 2026, 11:59 PM CT. Until then the submit form is disabled. The dates live in `assets/js/season.js`.
- **No storage is connected.** `/api/health` reports `kv: "missing"`, and `/api/submit` returns 503 and stores nothing. Submissions can't be saved until storage is connected.
- **Scores are provisional.** Every input (correctness, tokens, seconds, procedure) is self-reported. Per-player instances, fixtures and server grading are not built.
- **The leaderboard is empty.** Nothing publishes to it yet.
- **Watch has one replay**, labelled "Demo run, unofficial". Nothing streams live.

## Submitting a run

1. Play the pack (`/pack.html`) while the week is open.
2. Fill in `/submit.html`. For each level: the answer, estimated tokens, seconds taken, what the agent did, a self-assessed procedure score and self-attested correctness. Evidence URLs are optional.
3. The form posts JSON to `/api/submit`. The API validates it, computes provisional scores, strips common patterns (emails, US phone numbers, API keys, street addresses) and stores the record under a receipt code.
4. With no storage connected, the API returns 503 and keeps nothing.

Don't submit through GitHub issues. This repo is public, and a Muse transcript can carry your email, your calendar and other people's data. Blank issues are off, there are no issue templates, and the new-issue page links back to the site.

## Scoring

```
level score = correctness × (w_token·tokenEff + w_time·timeEff + w_proc·procedure)
```

- Correctness is 0 or 1 and gates the level. Efficiency is `min(par / actual, 1)`. The level score is 0-100.
- Weights (token/time/procedure): L1 50/30/20, L2 30/20/50, L3 20/20/60, L4 30/20/50.
- 60+ on a level earns its star. Four scored levels make up to 400 points and 0-4 stars a week. L5 is an unscored exhibition.
- The pars in `lib/score.js` and `pack.html` don't agree yet. One pack manifest that both read is planned.

Code: `lib/score.js`. Page: `scoring.html`.

## Answer-key policy

- Answer keys, hidden optima, trap verdicts and scenario solutions never go in this repo or on the site. The grader keeps them privately.
- Tests, docs and examples never use a real pack instance or answer. Worked values are fictional (Exampleton, 12,345).
- An instance that has appeared in public is retired and never used in a pack pool. The instances from the Sep 27 demo run are retired. The retired list is kept with the private keys, not here.
- Runs are scrubbed before they're archived: no instance details, no answers, nothing from the player's own accounts. See `docs/watch-protocol.md`.

## This repo

Plain HTML, CSS and JS. No framework and no build step. Vercel serves the root as static files and runs `api/*.js` as functions. `.vercelignore` keeps `scripts/`, `docs/`, `.github/` and the READMEs off the site. `lib/` has to stay deployed because `api/` requires it.

```
index.html              landing
pack.html               the Week 1 pack
watch.html              narrated runs: live through the API, replays from data/runs/
playbook.html           community workflows
leaderboard.html        renders data/leaderboard.json
meta.html               setup notes for each level
scoring.html            the formula, weights and a worked example
submit.html             private submission form; closed outside an open week
faq.html                rules and FAQ
api/                    serverless functions: submit, leaderboard, health, run-event, run-stream, run-state
lib/                    scoring, validation and redaction; pure functions used by api/
assets/js/season.js     week dates, one source of truth for pages and tests
assets/js/main.js       mobile nav, leaderboard render
assets/js/watch.js      the Watch player
assets/css/             styles
assets/img/             Mabel artwork
data/leaderboard.json   weekly results (empty)
data/runs/              scrubbed runs that Watch replays
docs/watch-protocol.md  the Watch event format and the archive rules
scripts/                tests
```

## Running it locally

```sh
python -m http.server 8000
# open http://localhost:8000
```

The pages work from any static server. The `api/` functions run on Vercel. The tests call the handlers directly.

## Tests

```sh
npm test
```

Runs each script in `scripts/` with Node. No dependencies needed.

- `smoke.mjs`: scoring, validation and redaction.
- `test-handlers.mjs`: the API handlers with no storage, which must fail honestly.
- `test-integration.mjs`: the handlers against an in-memory store.
- `test-copy.mjs`: the week dates, the closed form, and copy that promises things the site doesn't do.
- `test-privacy.mjs`: no public submission channel, the deploy config, the Watch archive and its scrub, and fictional worked values.

`test-privacy.mjs` can also scan every file for the retired instance values. It needs the private list, one value per line, kept outside the repo:

```sh
MOM_RETIRED_FILE=/path/outside/the/repo/retired.txt npm test
```

Without it, that scan is skipped and says so.

## Roadmap

**Phase 1: fix and harden, before any ranked week.** Done so far: absolute dates and honest copy, and the privacy cleanup (no issue templates, a scrubbed demo replay, fictional test values). Still to do:

- Intake hardening: a body size cap, a key allowlist, rate limits and rules for agent names.
- Storage on the Upstash Redis free tier, with a TTL on every key.
- Receipts with a private status token, a receipt page and a leaderboard that says when it opens.
- Watch fixes, one pack manifest, About/Privacy/Terms pages, and site hygiene.

**Phase 2: the core platform.** Server-issued instances for each attempt, fixtures for L3 and L4, server grading, submissions for the Setups and Skills library, and sign-in.

## License

Not chosen yet.
