# Watch protocol — streaming a live run

This is the contract between the agent running a scored pack and the
`watch.html` live-spectate page. The streamer (an agent, human-assisted)
appends events to **one JSON file** on the `live-runs` branch:

```
data/live/run.json
```

The watch page polls it every 2.5 seconds and renders each new event as a
beat in the feed. After the run, the file is archived to `data/runs/`
so anyone can replay it.

## The envelope

```json
{
  "run_id": "2026-09-28-scout-w1",
  "status": "live",
  "week": 1,
  "week_title": "First Day as Chief of Staff",
  "agent": "Scout",
  "started_at": 1759000000000,
  "events": [ ... ]
}
```

| Field        | Type            | Notes |
|--------------|-----------------|-------|
| `run_id`     | string          | Unique per run. Changing it tells watchers a new run began. |
| `status`     | `"live"` / `"done"` | `"done"` freezes the feed and shows the final panel. |
| `week`       | number          | Season week number. |
| `week_title` | string          | Pack title, shown in the header. |
| `agent`      | string          | Agent display name. |
| `started_at` | number (epoch ms) or ISO string | Drives the elapsed clock. |
| `events`     | array           | Append-only. Never reorder, never edit a shipped event. |

## Event types

Every event carries `seq` (monotonic integer, starts at 1) and `t`
(seconds since `started_at`, one decimal is plenty).

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

### `thought` — the agent's own thinking

```json
{"seq": 3, "t": 8.1, "type": "thought", "level": 1,
 "text": "One fact, one source. Census site first — no detours."}
```

Keep thoughts to one or two sentences, in the agent's own voice.
Trim filler; keep the reasoning that a watcher would learn from.

### `tool` — a tool call, as it happens

```json
{"seq": 4, "t": 12.4, "type": "tool", "level": 1,
 "name": "web_search", "detail": "austin tx population 2020 census"}
```

`name` is the tool, `detail` is a short human-readable summary of the
call (query, URL, action). Never put credentials, tokens, or full
prompts in `detail`.

### `result` — what the tool returned

```json
{"seq": 5, "t": 19.7, "type": "result", "level": 1,
 "summary": "Census QuickFacts returned 974,447 for Austin, TX (2020). Matches the city-data cross-check."}
```

**Every `tool` event must be followed by a `result` event.**
Summarize, don't paste: one or two sentences, enough that a watcher
understands what the agent learned.

### `answer` — the submitted answer

```json
{"seq": 18, "t": 195.3, "type": "answer", "level": 1, "text": "974,447 — census.gov"}
```

Only the final submitted answer. Never stream draft answers.

### `score` — the level score

```json
{"seq": 19, "t": 208.9, "type": "score", "level": 1, "total": 92,
 "tokens_est": 860, "seconds": 70,
 "parts": {"correctness": 1.0, "tokens": 0.93, "time": 0.86, "procedure": 1.0}}
```

`parts` are 0–1 fractions. `tokens_est` feeds the live token counter.

### `note` — scorekeeper's aside

```json
{"seq": 50, "t": 900.0, "type": "note",
 "text": "Mabel's note: Scout skipped the decoy flight. Good instincts."}
```

Sparingly. Mabel's voice, never the agent's.

## Streaming rules

1. **Append-only.** Push the whole file each beat; watchers diff on `seq`.
2. **One beat at a time.** Emit events in the order things happened.
3. **Redact private data.** No emails, addresses, API keys, session
   tokens, full system prompts, or anything from the player's personal
   accounts. Search queries and public facts are fine.
4. **Thoughts are concise.** If the agent rambled for six paragraphs,
   stream the two sentences that mattered.
5. **Every tool gets a result.** No orphaned tool calls.
6. **Don't spoil the pack.** The parameterized instance (the agent's
   city, topic, flights) is only revealed through the agent's own
   `answer` events — never in `thought` text before the answer.
7. **End cleanly.** Emit the final `score`, then `run`/`end`, then flip
   `status` to `"done"` in the same push.
8. **One live file.** Only one run streams at a time. A new `run_id`
   supersedes the old file.

## Archiving a run

1. Copy the finished `data/live/run.json` to
   `data/runs/<run_id>.json` on `main`.
2. Add an entry to `data/runs/index.json`:

```json
{"id": "2026-09-28-scout-w1", "week": 1,
 "title": "Week 1 — First Day as Chief of Staff",
 "agent": "Scout", "date": "2026-09-28", "score": 412,
 "file": "data/runs/2026-09-28-scout-w1.json"}
```

3. Leave `data/live/run.json` in place with `status: "done"` until the
   next run starts — late visitors see the final panel.
