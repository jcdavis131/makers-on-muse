# Makers on Muse

**How capable is your Muse?** A weekly test pack for Muse owners: four scored levels, from a simple lookup to multi-step planning, plus one unscored exhibition build (L5). Run it with your Muse, then submit your answers and your own numbers. Mabel, the grandma stenographer, keeps the minutes.

Site: **makersonmuse.com**. Makers on Muse is an independent community project. Not affiliated with, endorsed by, or sponsored by Meta Platforms, Inc. Muse and Meta are trademarks of Meta Platforms, Inc.

## Status (Sep 27, 2026)

- **Season 1, Week 1** opens Mon Oct 5, 2026, 6:00 AM CT and closes Sun Oct 11, 2026, 11:59 PM CT. Until then the submit form is disabled, and the API refuses entries with 409. The dates live in `assets/js/season.js` for the pages and in `data/packs/s1w1.json` for the API; a test keeps them equal.
- **No storage is connected.** `/api/health` reports `storage: "missing"`, and `/api/submit` returns 503 and stores nothing. The storage code is written for Upstash Redis; submissions can't be saved until the database is connected (see Storage below).
- **Scores are provisional.** Every input (correctness, tokens, seconds, procedure) is self-reported. Per-player instances, fixtures and server grading are not built.
- **The leaderboard opens after the week closes.** Until then `/api/leaderboard` returns only the number of entries, and the page says when the board opens.
- **Watch plays one replay**, labelled "Demo run, unofficial". Nothing streams live until storage is connected.

## Submitting a run

1. Play the pack (`/pack.html`) while the week is open.
2. Fill in `/submit.html`: a private handle, the agent's name and, if you want us to reach you, a contact email. For each of L1-L4, either tick "Didn't attempt" (it scores 0) or give the answer, estimated tokens, seconds taken, what the agent did, a self-assessed procedure score (0-100) and self-attested correctness. Evidence URLs are optional. L5 takes a description and an optional link. You must agree to the Terms and the Privacy Policy. Showing the agent's name on the board is opt-in.
   The form shows each problem next to its field (`aria-invalid`, with the message in `aria-describedby`) and lists them all at the top. It keeps a draft in the browser's localStorage as you type, without the contact address, and clears it after a successful submit. Every storage access is wrapped in try/catch, so a blocked or private-mode browser just doesn't keep drafts.
3. The form posts JSON to `/api/submit`. The API checks the request, validates it, computes provisional scores, strips common patterns from the answers and procedures, and stores the record.
4. The response carries a short receipt code, for display only, and a secret token. The token is shown once and only its SHA-256 hash is stored. It is the credential for the receipt page (see Receipts below).
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

Redaction: `lib/redact.js` runs only on each level's answer and procedure, the L5 description, and the query string of evidence URLs and the L5 link. It strips emails, US and international phone numbers, SSNs, Luhn-valid card numbers, street addresses and API keys or tokens. Web addresses keep their host and path so graders can check sources. Every pattern runs in linear time; a 64 KB adversarial string takes a few milliseconds. The contact email isn't redacted, because the player gives it on purpose. It is stored privately with the record, and no endpoint ever returns it.

## Receipts

`/receipt.html` (also served at `/receipt`) shows an entry's status and deletes it. The secret token is the only key.

- The submit page links to `receipt.html#token=mom_…`. Browsers never send the part after `#` to a server, so the token stays out of request logs. The page reads it, removes it from the address bar, and sends it once to `POST /api/receipt` in the JSON body. The page sets `noindex` and `no-referrer` and loads nothing from other sites.
- `{"token": "mom_…", "action": "status"}` returns the status, the provisional scores, the handle and agent name, whether a contact address is on file (never the address), and when the entry expires. Every entry is `received`. The `under_review` and `verified` states exist for when grading does; nothing sets them yet.
- `{"token": "mom_…", "action": "delete"}` removes the board entry, the handle claim, the record and the token index, in that order, so a delete cut short by a storage error can be retried with the same token. While the week is open the handle can then file again, which is how an entry is edited.
- The 32-bit receipt code is never accepted. Unknown, expired and deleted tokens all get the same 404. One IP address gets 10 lookups a minute, then 429 (when storage exists). The same 403, 413 and 415 gates as `/api/submit` apply.

Don't submit through GitHub issues. This repo is public, and a Muse transcript can carry your email, your calendar and other people's data. Blank issues are off, there are no issue templates, and the new-issue page links back to the site.

## Scoring

```
level score = correctness × (w_token·tokenEff + w_time·timeEff + w_proc·procedure)
```

Every number comes from the week's pack manifest, `data/packs/s1w1.json` (version 1):

- Correctness is 0 or 1, attested by the player, and gates the level. Efficiency is `min(par / actual, 1)`. The level score is 0-100.
- Pars (tokens, time): L1 800, 60 s; L2 4,000, 4 min; L3 2,500, 3 min; L4 6,000, 6 min. They are first guesses, not calibrated on real Muse runs, and stay fixed for Week 1.
- Weights (token/time/procedure): L1 50/30/20, L2 30/20/50, L3 20/20/60, L4 30/20/50.
- 60 or more on a level earns its star. Four scored levels make up to 400 points and 0-4 stars a week. L5 is an unscored exhibition.
- L3's 30% safety cap is recorded in the manifest but not applied: nothing can detect a violation until server grading ships.

The pack page and the old scorer had different pars. The manifest keeps the pack page's set, because it is what players saw and it reproduces both `scoring.html`'s worked example (92) and the demo replay's self-reported scores (318). `data/packs/README.md` has the details.

`lib/score.js` scores from the manifest it is given and throws on anything it can't apply. `api/submit.js` passes the week's manifest and stores its id, version and hash on each record. `pack.html`, `scoring.html`, `faq.html` and `submit.html` carry the numbers as static text marked `data-pack`, written by `npm run build:pack` (`scripts/stamp-pack.mjs`). Watch reads the manifest for a run's week. `scripts/test-pack.mjs` fails if any of them disagree.

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
| `mom:tok:<sha256>` | Token hash to receipt code, for `/api/receipt` | Same |
| `mom:run:<id>:events`, `:seq`, `:meta`, `mom:runs:current` | Watch run log (last 500 events) | 30 days after the run's last event |
| `mom:rl:submit:…`, `mom:rl:receipt:…` | Rate-limit counters, keyed by a hash of the IP address | About 2 minutes |

The leaderboard (`/api/leaderboard?week=1`) holds entries back until the week closes. Before that it answers with the number of entries only (one `ZCARD`), so nobody can watch self-reported totals during the week. After close it reads the week's sorted set and one `MGET` of the top 100 records: three reads per request, whatever the number of entries. It is cached at the edge for 60 seconds and never returns handles, contact addresses, answers or procedures. A level that wasn't attempted shows as skipped.

## Answer-key policy

- Answer keys, hidden optima, trap verdicts and scenario solutions never go in this repo or on the site. The grader keeps them privately.
- Tests, docs and examples never use a real pack instance or answer. Worked values are fictional (Exampleton, 12,345).
- An instance that has appeared in public is retired and never used in a pack pool. The instances from the Sep 27 demo run are retired. The retired list is kept with the private keys, not here.
- Runs are scrubbed before they're archived: no instance details, no answers, nothing from the player's own accounts. See `docs/watch-protocol.md`.

## This repo

Plain HTML, CSS and JS, with no framework. Vercel serves the root as static files and runs `api/*.js` as functions. There is no build on Vercel. A few small Node scripts with no dependencies write into the pages, and their output is committed. `npm run build` runs the three stamps below in order; `npm test` fails if any of their output is stale.

- `npm run build:pack` (`scripts/stamp-pack.mjs`) stamps the pack manifest's numbers into the pages.
- `npm run build:layout` (`scripts/stamp-layout.mjs`) copies the shared nav and footer from `partials/nav.html` and `partials/footer.html` into every page, between `<!-- layout:nav -->` and `<!-- layout:footer -->` markers. It marks the page's own link with `aria-current="page"`, so the current page shows without JavaScript. To change the nav or footer, edit the partial, run `npm run build:layout`, and commit the partial and the pages together. A new page needs all three marker pairs. `scripts/test-layout.mjs` fails if any page differs from the partials.
- The same script stamps `partials/head.html` between `<!-- layout:head -->` markers: the icons, the theme colour, and for indexable pages the canonical link and the Open Graph and Twitter tags. It fills in the page's clean address and copies the page's own `<title>` and meta description, so those two tags stay the only place to write them. A page with `<meta name="robots" content="noindex">` (404 and receipt) gets the icons only and stays out of `sitemap.xml`, which the script also writes.
- `npm run build:assets` (`scripts/stamp-assets.mjs`) puts a version on every stylesheet and script a page loads: `/assets/css/main.css?v=<first 10 hex digits of its SHA-256>`. Vercel serves `/assets/css/` and `/assets/js/` with a one-year `immutable` cache, which is only safe because a changed file gets a new URL. After editing any CSS or JS, run `npm run build` and commit the pages with it. A script must not load another stylesheet or script by URL, since that request would carry no version.
- `npm run build:images` (`scripts/render-images.mjs`) renders the share image `assets/img/og.png` (1200x630, from `scripts/og/og.html`) and the icons (`favicon.ico` with 16 and 32 px, `assets/img/icon-32.png`, `assets/img/apple-touch-icon.png`, from `assets/img/icon.svg`) with headless Chrome. It needs `puppeteer-core`, which the site doesn't depend on: install it anywhere and set `PUPPETEER_CORE_DIR` to that folder. The images are committed, so this runs only when the design changes. The share image has no dates or pack content, so it doesn't go stale.

The nav has three groups: Play (This week, Submit, Leaderboard, Replays), Library (Playbook, Setups, Skills) and About (Rules & scoring, FAQ, About). On wide screens each group is a button with a dropdown; on phones the Menu button opens all three. The footer carries the independent-project and trademark line on every page.

`.vercelignore` keeps `scripts/`, `docs/`, `.github/`, `partials/` and the READMEs off the site. `lib/` has to stay deployed because `api/` requires it.

`vercel.json` turns on clean URLs: `/pack` serves `pack.html`, and `/pack.html` and `/pack/` answer 308 to `/pack`. Links in the pages and scripts use the clean, root-absolute form (`/pack`, `/`, `/assets/css/main.css`), so nothing costs a redirect and `404.html` works at any depth. It also 308s `www.makersonmuse.com` and `makers-on-muse.vercel.app` to `https://makersonmuse.com`, keeping the path and query (the rules match on the Host header, so preview deployments stay reachable), and redirects `/meta.html` and `/meta` to `/setups` (the page was renamed). Vercel serves `404.html`, with status 404, for any address that has no file.

`vercel.json` also sets the response headers:

- On everything: a `Content-Security-Policy` that allows scripts, styles, images, fonts and connections from this site only, and no framing (`frame-ancestors 'none'`, plus `X-Frame-Options: DENY` for old browsers). Scripts get no `'unsafe-inline'`, so no page may carry an inline `<script>`, an `on...=` attribute or a `javascript:` URL; the submit page's code lives in `assets/js/submit.js` for that reason. Styles still allow `'unsafe-inline'`, because several pages have a `<style>` block and `style=` attributes. Also `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` and a `Permissions-Policy` that turns off camera, microphone, location, payment, USB and ad topics. The receipt page asks for no referrer at all.
- Caching: versioned CSS and JS for a year (`immutable`); `/assets/img/` for a day; `favicon.ico`, `robots.txt` and `sitemap.xml` for a day. Pages and `data/` keep Vercel's default (revalidate every time). The `/(.*)` rule sets no `Cache-Control`, so `/api/health` keeps its own 30-second edge cache.
- HSTS is Vercel's default for custom domains (`max-age=63072000`).

```
index.html              landing: the test and the library, a Playbook strip
pack.html               the Week 1 pack
watch.html              narrated runs: live through the API, replays from data/runs/
playbook.html           community workflows: filters and permalinks in the query string (?w=<id>)
leaderboard.html        the board: says when it opens, then lists entries from /api/leaderboard
receipt.html            status and delete for one entry, by secret token
setups.html             Setups for the Muse app, and setup notes for each level (was meta.html)
skills.html             Skills for Muse Code: SKILL.md, and how sharing will work
about.html              who runs the site, why, grading now and planned, the code
privacy.html            what is stored, for how long, processors, deletion by token
terms.html              18+, no prizes, what entries let us show, acceptable use
scoring.html            the formula, weights and a worked example
submit.html             private submission form; closed outside an open week
faq.html                rules and FAQ
404.html                the page for any address that doesn't exist (noindex)
robots.txt              allow all but /api/; points at the sitemap
sitemap.xml             every indexable page at its clean address (written by build:layout)
favicon.ico             16 and 32 px icons (written by build:images)
api/                    serverless functions: submit, receipt, leaderboard, health, run-event, run-stream, run-state
lib/                    scoring, validation, names, redaction, tokens, pack windows; used by api/
assets/js/season.js     week dates, one source of truth for pages and tests
assets/js/main.js       nav groups and the phone menu, Mabel
assets/js/playbook-data.js  the Playbook's workflows (content under CC BY 4.0)
assets/js/playbook.js   the Playbook page: query-string filters, permalinks, cards
assets/js/submit-form.js  the submit form's checks, error mapping, receipt rows and drafts
assets/js/submit.js     the submit page: the week gate, level cards, drafts, the POST and the receipt
assets/js/board.js      the leaderboard page
assets/js/receipt.js    the receipt page
assets/js/watch.js      the Watch player: live through the API, or the archive's first run
assets/css/             styles
assets/img/             Mabel artwork, the site icon (icon.svg and PNGs), the share image og.png
data/packs/             one manifest per week: dates, levels, pars, blends, the star rule (public; no answers)
data/runs/              scrubbed runs that Watch replays
docs/watch-protocol.md  the Watch event format and the archive rules
partials/               the shared head tags, nav and footer (repo only; stamped into the pages)
scripts/                tests, an in-memory Redis for them, the pack and layout stamps, a local server that applies vercel.json, the link check, the post-deploy health check
LICENSE                 MIT, for the code
LICENSE-CONTENT         CC BY 4.0, for the Playbook content
```

## Running it locally

```sh
npm run serve
# open http://localhost:8080
```

`scripts/serve.mjs` serves the repo the way `vercel.json` says Vercel will: clean URLs, the redirects (send an `X-Forwarded-Host` header to try the host ones), the headers, `404.html`, and nothing that `.vercelignore` leaves out. It runs the real `api/` handlers too. With no storage env vars, `/api/health` says storage is "missing" and writes answer 503, as on a deploy without Upstash. It emulates only what this site's `vercel.json` uses, and it refuses to start on anything else in there, so a config change can't pass locally by accident. It is not Vercel: `scripts/check-deploy.mjs` checks the real site after a deploy.

A plain static server (`python -m http.server`) still shows the pages, but not the clean URLs, so links like `/pack` 404 there.

## Tests

```sh
npm test
```

Runs each test script in `scripts/` with Node. Run `npm ci` once first: the integration test uses the real `@upstash/redis` and `@upstash/ratelimit` packages.

- `smoke.mjs`: scoring, validation, names, tokens, pack windows and redaction, including a timing test that redacts 64 KB adversarial strings in under 50 ms.
- `test-handlers.mjs`: the API with no storage, which must fail honestly, and every intake check that works without storage (403, 413, 415, 400, 409), for `/api/submit` and `/api/receipt`. Also: the pack manifest matches `season.js`, dependencies are pinned in the lockfile, and `check-health.mjs` passes only on "reachable".
- `test-integration.mjs`: the handlers and the real Upstash client against `redis-emu.mjs`, an in-memory Redis served over the Upstash REST protocol with a clock the test controls. Covers receipts and tokens, receipt status and delete, one entry per handle, the leaderboard (count only until close, then the sorted set), the contact address kept private, 429 on the sixth post, a TTL on every key, and expiry.
- `test-copy.mjs`: the week dates, the closed form, and copy that promises things the site doesn't do.
- `test-privacy.mjs`: no public submission channel, the deploy config, the Watch archive and its scrub, and fictional worked values.
- `test-pages.mjs`: the page logic in `submit-form.js`, `receipt.js` and `board.js`. What the form sends must pass the server's validator. Every value from the API is escaped (tested with markup in every field). Drafts never throw, even when storage does. Also the receipt page's privacy settings, its `/receipt` address, and a reviewed list of every `innerHTML` assignment, so a new one fails until someone checks it.
- `test-pack.mjs`: the pack manifest contract. The manifest is well formed. The pages' marked numbers match it, and no page has lost a marker. `scoring.html`'s worked example is what `lib/score.js` computes. The scorer moves with the manifest. `api/submit.js` scores with it. The validator asks for its scored levels. The archived runs' scores reproduce under its pars.
- `test-site.mjs`: how the site is served, through `serve.mjs`. Clean URLs and their 308s, the www and vercel.app redirects to the apex (path and query kept; previews not redirected), the branded 404 at any depth, repo-only files not served, `robots.txt`, a current `sitemap.xml`, the link check, the security headers on pages, the 404, assets and the API (a CSP with no inline script, and no inline script, handler, `javascript:` URL or `eval` anywhere in the code), the cache headers, and current asset versions on every page.
- `test-seo.mjs`: the stamped head on every page. Indexable pages have a canonical link at their clean address and Open Graph and Twitter tags with absolute URLs; noindex pages have neither. Titles and descriptions are present and unique. The committed images are the sizes the tags claim, `favicon.ico` holds 16 and 32 px images, and the share image template has no dates.
- `test-layout.mjs`: every page carries the shared nav and footer from `partials/`, with the trademark line and its own link marked; the nav groups and their order; every link is served at its clean address without a redirect; the `/meta` redirects; no page links `meta.html` or any `.html` address; the trust pages state what the code does (TTLs, processors, deletion by token, no cookies); `main.js` runs the nav without `innerHTML`; the Mabel emblem uses no gradient; both license files.
- `test-playbook.mjs`: the Playbook's data and page logic. Ids are unique and URL-safe, every setup tag is explained in the page's tag legend, no tag names a connector no source lists, the stats and the home page strip match the data, the query string round-trips and ignores anything it doesn't know, every card value is escaped, and a reviewed list of `innerHTML` assignments.
- `test-watch.mjs`: the Watch player. Run time is the last event minus the start. Tokens are only what the agent reported, or "—". A reconnect adds no beat twice. The result is out of the manifest's maximum. The page follows the feed only when the reader has scrolled to its end. Also escaping, the page's first state ("Connecting…"), the demo badge, and a reviewed list of `innerHTML` assignments.

`test-privacy.mjs` can also scan every file for the retired instance values. It needs the private list, one value per line, kept outside the repo:

```sh
MOM_RETIRED_FILE=/path/outside/the/repo/retired.txt npm test
```

Without it, that scan is skipped and says so.

The link check runs on its own too:

```sh
npm run check:links                         # every link and asset in the pages and assets/js, offline
node scripts/check-links.mjs --external     # also GETs each outside link
```

Site links resolve through the same router as `serve.mjs`, so a link to `pack.html` (a 308), a file `.vercelignore` keeps off the site, or a `#fragment` with no matching id fails. Outside links are opt-in: meta.com and others often refuse automated requests, so only 404, 410 and DNS failures count as broken, and 401, 403, 429 and 5xx are listed as not verified.

## Roadmap

**Phase 1: fix and harden, before any ranked week.** Done so far: absolute dates and honest copy; the privacy cleanup (no issue templates, a scrubbed demo replay, fictional test values); intake hardening and the storage code (size cap, key allowlist, Origin and Content-Type checks, rate limits, name rules, linear-time redaction, secret tokens, a TTL on every key); receipts (status and delete by secret token), a leaderboard that opens after the week closes, and the submit form's handle, contact, "Didn't attempt", inline errors, L5 link, terms box and drafts; one pack manifest for pars, blends, totals and stars, and the Watch fixes (no forced scrolling, one final panel, "Connecting…", no invented tokens, run time from the events, the demo replay by default); the trust pages (About, Privacy, Terms), one shared nav and footer with the trademark line, the Setups and Skills library tracks, licenses, and Playbook permalinks. Still to do:

- Connect the Upstash database in the Vercel Marketplace, then run `scripts/check-health.mjs`.
- Site hygiene: clean URLs and the www redirect, 404, robots and sitemap, OG tags, security headers, contrast tokens, CI.
- A contact address: the domain has no mail records yet.

**Phase 2: the core platform.** Server-issued instances for each attempt, fixtures for L3 and L4, server grading, submissions for the Setups and Skills library, and sign-in.

## License

Code: MIT (`LICENSE`). Playbook content, the workflows in `assets/js/playbook-data.js`: CC BY 4.0 (`LICENSE-CONTENT`).
