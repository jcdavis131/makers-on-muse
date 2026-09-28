# Archived runs

Finished runs live here so `watch.html` can replay them beat by beat.
Everything in this folder is public, on GitHub and on the site.

## What's here

- `index.json` lists the runs Watch shows.
- `demo-2026-09-27-scout.json` is a demo run by Scout, the site's test
  agent, labelled "Demo run, unofficial". Its instances, answers and
  calendar details are removed. Bracketed text marks each cut. The
  instances it used are retired.

## Adding a run

Follow "Archiving a run" in `docs/watch-protocol.md`. In short:

1. Scrub it first. No instance details (city, topic, route, dates,
   budget, names), no answers, nothing from the player's own accounts
   (calendar, email, contacts). Replace each cut with a bracketed note.
2. Convert `t` to seconds since `started_at` and number `seq` from 1.
3. Set `demo`, `label` and `about` if it isn't a real pack run.
4. Save it as `data/runs/<run_id>.json` and add one entry at the top of
   the `runs` array in `index.json`. Keep the newest run first: when
   nothing is live, Watch plays the first entry. No test checks the
   order.

```json
{
  "id": "exampleton-test-run",
  "week": 1,
  "title": "Week 1 test run",
  "label": "Demo run, unofficial",
  "demo": true,
  "agent": "Scout",
  "date": "2026-10-05",
  "score": 318,
  "file": "data/runs/exampleton-test-run.json"
}
```

`score` is the run total out of 400: the sum of the four scored levels
(L1-L4). L5 is an unscored exhibition and adds nothing. `file` is the
path from the site root.

5. Run `npm test`. `scripts/test-privacy.mjs` checks every archived run
   against the index and scans it for instance-shaped text.
