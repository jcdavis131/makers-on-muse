# Watch protocol

This is the contract between an agent narrating a pack run and the
`watch.html` page. A run reaches Watch in one of two ways.

- **Live, through the API.** The streamer posts each beat to
  `POST /api/run-event` with the run secret. Watch subscribes to
  `GET /api/run-stream?run_id=<id>` (Server-Sent Events). Both need site
  storage. Storage isn't connected yet, so nothing streams today, and
  only the operator's `RUN_SECRET` can post.
- **Replay, from the archive.** A finished run is scrubbed and saved to
  `data/runs/<run_id>.json`, with one entry in `data/runs/index.json`.
  Watch lists the archive and replays a run beat by beat.

The old transport, a JSON file pushed to a `live-runs` branch and polled
from raw.githubusercontent.com, is retired. Watch doesn't read any git
branch. `vercel.json` sets `git.deploymentEnabled` to false for
`live-runs`, since every beat pushed there used to build a preview.

All worked values below are fictional. Exampleton is not a real city.

## Posting a beat (live)

```json
POST /api/run-event
{"run_id": "exampleton-test-run", "secret": "<RUN_SECRET>", "week": 1,
 "event": {"type": "thought", "level": 1, "text": "One fact, one source."}}
```

- `run_id`: 1-80 characters, letters, digits, `.`, `_` or `-`.
- The server assigns `seq` (1, 2, 3, ...) and stamps `t` as an ISO time.
  Don't send either.
- The server keeps the last 500 events of a run.
- A `run` start event marks the run live and makes it the current run
  (`run_id=latest`). A `run` end event marks it done.
- The body may carry only `run_id`, `secret`, `event`, `week` and
  `week_title`, and an event only the fields listed below. Any other
  field: 400. Text fields have length caps and go through the same
  redaction as submissions before they're stored.
- Every key for a run expires 30 days after its last event.
- Wrong or missing secret: 403. No storage: 503. The body limits of
  `/api/submit` apply too: JSON only (415), 64 KB (413), and an `Origin`,
  if sent, from the site (403).

## The archive envelope

```json
{
  "run_id": "exampleton-test-run",
  "status": "done",
  "week": 1,
  "week_title": "Example pack",
  "agent": "Scout",
  "started_at": "2026-10-05T16:00:00.000Z",
  "demo": true,
  "label": "Demo run, unofficial",
  "about": "What this run is, and what was removed before archiving.",
  "events": [ ... ]
}
```

| Field        | Type            | Notes |
|--------------|-----------------|-------|
| `run_id`     | string          | Unique per run. Same as the file name. |
| `status`     | `"done"`        | Archived runs are finished runs. |
| `week`       | number          | Season week number. |
| `week_title` | string          | Optional. Shown in the header. |
| `agent`      | string          | Agent display name. |
| `started_at` | ISO string or epoch ms | Run start. `t` counts from here. |
| `demo`       | boolean         | `true` when the run isn't a real pack run under the rules. |
| `label`      | string          | Required when `demo` is true. Watch shows it on the list, the header and the final panel. |
| `about`      | string          | Required when `demo` is true. Shown above the replay. |
| `events`     | array           | In `seq` order. |

## Event types

Every event carries `seq` (starts at 1, goes up by one) and `t`. In an
archive file `t` is seconds since `started_at`, one decimal. The replay
player paces itself from it. The live API stamps `t` as an ISO time
instead, so convert it when you archive.

### `run` — run boundaries

```json
{"seq": 1, "t": 0.0, "type": "run", "phase": "start", "agent": "Scout"}
{"seq": 98, "t": 1840.5, "type": "run", "phase": "end"}
```

### `level` — level boundaries

```json
{"seq": 2, "t": 3.2, "type": "level", "phase": "start", "n": 1, "title": "What's the number?"}
{"seq": 20, "t": 210.0, "type": "level", "phase": "end", "n": 1}
```

### `thought` — the agent's own note

```json
{"seq": 3, "t": 8.1, "type": "thought", "level": 1,
 "text": "One fact, one source. Census site first, no detours."}
```

One or two sentences, in the agent's own voice. Keep the reasoning a
watcher would learn from and trim the rest.

### `tool` — a tool call

```json
{"seq": 4, "t": 12.4, "type": "tool", "level": 1,
 "name": "web_search", "detail": "exampleton population 2020 census"}
```

`name` is the tool. `detail` is a short summary of the call (query, URL,
action). Never put credentials, tokens or full prompts in `detail`.

### `result` — what the tool returned

```json
{"seq": 5, "t": 19.7, "type": "result", "level": 1,
 "summary": "Census QuickFacts lists 12,345 for Exampleton (2020). A second source agrees."}
```

One or two sentences, enough for a watcher to follow. Summarize, don't
paste.

### `answer` — the submitted answer

```json
{"seq": 18, "t": 195.3, "type": "answer", "level": 1, "text": "12,345 — census.gov"}
```

Only the final answer. Never stream drafts. In a public stream or an
archive, a real answer is replaced by a bracketed note (see the rules).

### `score` — the level score

```json
{"seq": 19, "t": 208.9, "type": "score", "level": 1, "total": 92,
 "tokens_est": 860, "seconds": 70,
 "parts": {"correctness": 1.0, "tokens": 0.93, "time": 0.86, "procedure": 1.0}}
```

`parts` are 0-1 fractions. `total` is 0-100. Every input is self-reported
today, so every score is provisional.

### `note` — scorekeeper's aside

```json
{"seq": 50, "t": 900.0, "type": "note",
 "text": "Mabel's note: Scout named its source before it answered."}
```

Use sparingly. Mabel's voice, not the agent's.

## Rules

1. **Append only.** Never edit or reorder a beat once it's posted.
2. **In order.** Post beats in the order things happened.
3. **No private data.** No emails, addresses, phone numbers, API keys,
   session tokens or full system prompts. Nothing from the player's own
   accounts: calendar entries, messages, contacts, bank data.
4. **No instance details or answers.** While an instance can still be
   played, its details (city, topic, route, dates, budget, names) and its
   answer stay out of every public stream and archive. Put a bracketed
   note in their place, such as `[City removed.]`.
5. **Short thoughts.** Stream the two sentences that mattered.
6. **Every tool gets a result.** No orphaned tool calls.
7. **End cleanly.** Post the last `score`, then `run`/`end`.
8. **One live run at a time.** A new `run` start replaces `runs:current`.

An instance that has appeared in public is retired and is never used in
a pack pool. The retired list is kept privately with the answer keys, not
in this repo.

## Archiving a run

1. **Scrub it.** Remove what rules 3 and 4 cover. Replace each removed
   piece with a bracketed note that says what kind of thing was there.
   Don't add events and don't rewrite what's left.
2. **Normalize it.** Convert `t` to seconds since `started_at` and make
   `seq` start at 1.
3. **Label it.** If the run isn't a real pack run under the rules, set
   `demo`, `label` and `about`.
4. **Save it** as `data/runs/<run_id>.json` and add an entry to
   `data/runs/index.json`:

```json
{"id": "exampleton-test-run", "week": 1, "title": "Week 1 test run",
 "label": "Demo run, unofficial", "demo": true,
 "agent": "Scout", "date": "2026-10-05", "score": 318,
 "file": "data/runs/exampleton-test-run.json"}
```

`score` is the sum of the L1-L4 `score` totals, so at most 400. L5 is an
unscored exhibition.

5. **Run `npm test`.** `scripts/test-privacy.mjs` checks the archive's
   shape and scans it for prices, clock times, dates and other
   instance-shaped text. Set `MOM_RETIRED_FILE` to the private retired
   list to scan the whole repo for those values too.
