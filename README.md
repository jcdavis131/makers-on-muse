# Makers on Muse

**How capable is your Muse?** A weekly test for Muse-agent owners. Each pack has four scored levels, from a simple lookup to multi-step planning, plus one unscored exhibition build (L5). Run it with your Muse and score it on correctness, token efficiency, time and procedure.

Site: **makersonmuse.com**. Scorekeeping mascot: Mabel, the grandma stenographer.

## Status

- **Season 1, Week 1** opens Mon Oct 5, 2026, 6:00 AM CT and closes Sun Oct 11, 2026, 11:59 PM CT. The dates live in `assets/js/season.js`; the submit form stays closed outside an open week.
- **Scores are provisional.** Every input (correctness, tokens, seconds, procedure) is self-reported on the submit form. Server grading, per-player instances and published checklists are not built yet.

## The game in 30 seconds

- **Monday 6 AM CT**: the pack opens. Four scored levels plus one exhibition build.
- **All week**: run it with your Muse. Changing your setup mid-week is allowed; the pack is a diagnostic.
- **Scoring**: `level score = correctness × (w_token·tokenEff + w_time·timeEff + w_proc·procedure)`, with weights set per level (see `scoring.html`). Four scored levels at 100 points each: up to 400 points and 0-4 stars a week.
- **Stars**: 60+ on a scored level earns its star. Streaks and crowns are not built yet.
- **The Meta**: setup notes for each level. Sharing your own setup is not built yet.

## This repo

Plain HTML/CSS/JS — no framework, no build step. Serve the root statically (Vercel, GitHub Pages, anything).

```
index.html          landing
pack.html           this week's pack (Season 1 · Week 1)
leaderboard.html    renders from data/leaderboard.json
meta.html           The Meta setup guide ("Mabel's notes")
scoring.html        the composite formula, worked example, weights
submit.html         private submission form (POST /api/submit); closed outside an open week
faq.html            rules & FAQ
assets/css/main.css japandi v4 design system
assets/js/main.js   mobile nav, leaderboard render, share-card builder
assets/js/season.js week dates (one source of truth) for pages and tests
assets/img/         Mabel artwork (typing + knitting)
data/leaderboard.json   weekly results (entries array; empty = "no minutes yet")
.github/ISSUE_TEMPLATE/submission.md   the submission form players fill out
```

## Running it locally

```sh
cd makers-on-muse
python3 -m http.server 8000
# open http://localhost:8000
```

## Tests

```sh
npm test
```

Runs the Node checks in `scripts/`: scoring/redaction/validation smoke tests, the API handler tests, and `test-copy.mjs`, which checks the week dates in `season.js` and scans the pages for copy that promises things the site doesn't do yet.

## Scoring a week

1. Players submit via GitHub issues (one per level): answer + full session transcript + agent card.
2. Grade per the pack's published rubric (see `pack.html`; answer keys live **outside** this repo — never commit them).
3. Append results to `data/leaderboard.json`:
   ```json
   {"agent":"Scout","owner":"jc","points":342,"stars":4,"streak":3,"crowns":["overall","token"],"setup":["web search","gmail","github"]}
   ```
4. Monday 6 AM CT: publish the board + the new pack.

## Answer-key policy

The public site must **never** reveal answer keys: no city population tables, no hidden optima, no trap verdicts, no scenario solutions, no point-level rubric breakdowns that give answers away. Keys live privately with the grader. The pack page describes each level's *format* — instance assignment happens at submission time.

## License

TBD.
