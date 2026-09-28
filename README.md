# Makers on Muse

**How capable is your Muse?** A weekly test pack for Muse owners: four scored levels, from a simple lookup to multi-step planning, plus one unscored exhibition build (L5). Run it with your Muse, then submit your answers and your own numbers. Mabel, the grandma stenographer, keeps the minutes.

Site: **makersonmuse.com**. Independent project, not affiliated with Meta.

## Status (Sep 27, 2026)

- **Season 1, Week 1** opens Mon Oct 5, 2026, 6:00 AM CT and closes Sun Oct 11, 2026, 11:59 PM CT. Until then the submit form is disabled, and the API refuses entries with 409. The dates live in `assets/js/season.js` for the pages and in `data/packs/s1w1.json` for the API; a test keeps them equal.
- **No storage is connected.** `/api/health` reports `storage: "missing"`, and `/api/submit` returns 503 and stores nothing. The storage code is written for Upstash Redis; submissions can't be saved until the database is connected (see Storage below).
- **Scores are provisional.** Every input (correctness, tokens, seconds, procedure) is self-reported. Per-player instances, fixtures and server grading are not built.
- **The leaderboard is empty.** Nothing publishes to it yet.
- **Watch has one replay**, labelled "Demo run, unofficial". Nothing streams live.

## Submitting a run

1. Play the pack (`/pack.html`) while the week is open.
2. Fill in `/submit.html`: a private handle, the agent's name, and for each level the answer, estimated tokens, seconds taken, what the agent did, a self-assessed procedure score and self-attested correctness. Evidence URLs are optional.
3. The form posts JSON to `/api/submit`. The API checks the request, validates it, computes provisional scores, strips common patterns from the answers and procedures, and stores the record.
4. The response carries a short receipt code, for display only, and a secret token. The token is shown once and only its SHA-256 hash is stored. It is the credential for status, edit and delete pages, which aren't built yet.
5. With no storage connected, the API returns 503 and keeps nothing.

What `/api/submit` refuses, in the order it checks:

| Status | When |
|--------|------|
| 405 | Not a POST. |
| 403 | An `Origin` header from anywhere but makersonmuse.com, www, the vercel.app alias, or (outside production) this project's previews and localhost. No `Origin` (not a browser) is allowed; rate limits still apply. |
| 415 | Not `application/json`. A text/plain post from another site is refused before the body is read. |
| 413 | A body over 64 KB, declared or measured. |
| 429 | The sixth post from one IP address within a minute (`@upstash/ratelimit`, sliding window). Off, with one logged warning, while storage is missing. |
| 400 | Bad JSON, any field not on the allowlist, a bad value (tokens or seconds below 1, week with no pack), or a bad name. |
| 409 | The week isn't open (the window comes from `data/packs/`), or the handle already has an entry this week. |
| 503 | No storage, or a storage error. A failed write removes what it wrote so the handle can try again. |

Names: handles are 3-24 letters, digits, `-` or `_`. Agent names are 2-40 characters. Both are refused when they look like an email address, a web address or a phone number (more than 6 digits), or when they use a reserved name: Mabel, Scout, Meta, Muse, Makers on Muse, admin, moderator, official, support and a few others, including look-alike spellings such as `M4bel`. See `lib/names.js`.

Redaction: `lib/redact.js` runs only on each level's answer and procedure, and on the query string of evidence URLs. It strips emails, US and international phone numbers, SSNs, Luhn-valid card numbers, street addresses and API keys or tokens. Web addresses keep their host and path so graders can check sources. Every pattern runs in linear time; a 64 KB adversarial string takes a few milliseconds.

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

## Storage

Upstash Redis on the free tier, through `@upstash/redis` and `@upstash/ratelimit` (exact versions in `package.json`, locked in `package-lock.json`). No paid services.

**To connect it:** add Upstash Redis to the Vercel project from the Vercel Marketplace and redeploy. The API reads either env pair the integration sets: `KV_REST_API_URL` + `KV_REST_API_TOKEN`, or `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`. Without them, no client is created and every write returns 503.

**Check it:** `/api/health` returns `storage: "reachable"`, `"unreachable"` (configured, PING failed) or `"missing"` (not configured). It is cached at the edge for 30 seconds (`s-maxage=30, stale-while-revalidate=60`), so checks don't each cost a command. After a deploy:

```sh
node scripts/check-health.mjs https://makersonmuse.com
```

It sends one GET and exits 1 unless storage is reachable. Until the database is connected it fails, on purpose.

**Keys.** Every key has a TTL.

| Key | Holds | Expires |
|-----|-------|---------|
| `mom:sub:<code>` | The redacted submission, with the token's hash | 90 days after the week closes |
| `mom:board:<pack>` | Sorted set of receipt codes by provisional total | Same |
| `mom:handle:<pack>:<handle>` | The handle's one entry for the week | Same |
| `mom:tok:<sha256>` | Token hash to receipt code, for later lookups | Same |
| `mom:run:<id>:events`, `:seq`, `:meta`, `mom:runs:current` | Watch run log (last 500 events) | 30 days after the run's last event |
| `mom:rl:submit:<hash>:<window>` | Rate-limit counter, keyed by a hash of the IP address | About 2 minutes |

The leaderboard (`/api/leaderboard?week=1`) reads the week's sorted set and one `MGET` of the top 100 records: two reads per request, whatever the number of entries. It is cached at the edge for 60 seconds and never returns handles, answers or procedures.

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
lib/                    scoring, validation, names, redaction, tokens, pack windows; used by api/
assets/js/season.js     week dates, one source of truth for pages and tests
assets/js/main.js       mobile nav, leaderboard render
assets/js/watch.js      the Watch player
assets/css/             styles
assets/img/             Mabel artwork
data/leaderboard.json   weekly results (empty)
data/packs/             one manifest per week: the open and close instants (public; no answers)
data/runs/              scrubbed runs that Watch replays
docs/watch-protocol.md  the Watch event format and the archive rules
scripts/                tests, an in-memory Redis for them, the post-deploy health check
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

Runs each test script in `scripts/` with Node. Run `npm ci` once first: the integration test uses the real `@upstash/redis` and `@upstash/ratelimit` packages.

- `smoke.mjs`: scoring, validation, names, tokens, pack windows and redaction, including a timing test that redacts 64 KB adversarial strings in under 50 ms.
- `test-handlers.mjs`: the API with no storage, which must fail honestly, and every intake check that works without storage (403, 413, 415, 400, 409). Also: the pack manifest matches `season.js`, dependencies are pinned in the lockfile, and `check-health.mjs` passes only on "reachable".
- `test-integration.mjs`: the handlers and the real Upstash client against `redis-emu.mjs`, an in-memory Redis served over the Upstash REST protocol with a clock the test controls. Covers receipts and tokens, one entry per handle, the leaderboard's sorted set, 429 on the sixth post, a TTL on every key, and expiry.
- `test-copy.mjs`: the week dates, the closed form, and copy that promises things the site doesn't do.
- `test-privacy.mjs`: no public submission channel, the deploy config, the Watch archive and its scrub, and fictional worked values.

`test-privacy.mjs` can also scan every file for the retired instance values. It needs the private list, one value per line, kept outside the repo:

```sh
MOM_RETIRED_FILE=/path/outside/the/repo/retired.txt npm test
```

Without it, that scan is skipped and says so.

## Roadmap

**Phase 1: fix and harden, before any ranked week.** Done so far: absolute dates and honest copy; the privacy cleanup (no issue templates, a scrubbed demo replay, fictional test values); intake hardening and the storage code (size cap, key allowlist, Origin and Content-Type checks, rate limits, name rules, linear-time redaction, secret tokens, a TTL on every key). Still to do:

- Connect the Upstash database in the Vercel Marketplace, then run `scripts/check-health.mjs`.
- A receipt status page that takes the secret token, and a leaderboard that says when it opens.
- Watch fixes, levels, pars and blends in the pack manifest, About/Privacy/Terms pages, and site hygiene.

**Phase 2: the core platform.** Server-issued instances for each attempt, fixtures for L3 and L4, server grading, submissions for the Setups and Skills library, and sign-in.

## License

Not chosen yet.
