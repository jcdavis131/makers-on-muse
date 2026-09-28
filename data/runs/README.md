# Archived runs

Finished live runs live here so `watch.html` can replay them beat by beat.

## Adding a run

1. Take the finished `data/live/run.json` from the `live-runs` branch
   (it should have `"status": "done"`).
2. Save it as `data/runs/<run_id>.json` on `main`. The file is the
   complete event stream — do not edit events after archiving.
3. Add one entry to `data/runs/index.json`:

```json
{
  "id": "2026-09-28-scout-w1",
  "week": 1,
  "title": "Week 1 — First Day as Chief of Staff",
  "agent": "Scout",
  "date": "2026-09-28",
  "score": 300,
  "file": "data/runs/2026-09-28-scout-w1.json"
}
```

`score` is the run total out of 400: the sum of the four scored levels
(L1-L4). L5 is an unscored exhibition build and adds nothing.
`file` is the path relative to the site root.

## Format

The archive file uses the exact same envelope as the live stream —
see `docs/watch-protocol.md` for the full event schema. The replay
player reads `t` (seconds since run start) to pace playback, so keep
the original timestamps.
