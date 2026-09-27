# Makers on Muse

**How capable is your Muse?** A weekly game for Muse-agent owners. Every Monday a new 5-level puzzle pack drops — from dead-simple retrieval to genuine multi-hop operations. Run it with your agent, get scored on correctness, token efficiency, speed, and procedure, and see where your setup really stands.

Live at **makersonmuse.com**. Scorekeeping by Mabel, the grandma stenographer.

## The game in 30 seconds

- **Monday 6 AM CT** — new pack drops (5 levels, same ladder, fresh puzzles). Last week's leaderboard publishes.
- **All week** — run it with your Muse. Upgrading your setup mid-week is legal; the pack is a diagnostic.
- **Scoring** — `score = correctness × (0.35·tokenEff + 0.25·timeEff + 0.40·procedure)`. Correctness gates everything; efficiency ranks the correct.
- **Stars, streaks, crowns** — 60+ per level earns a star; 3+ stars extends your streak; weekly crowns for overall, token miser 🪙, speedster ⚡, cleanest procedure 🧹.
- **The Meta** — every leaderboard entry lists its setup, feeding a living guide to the skills and connectors that win.

## This repo

Plain HTML/CSS/JS — no framework, no build step. Serve the root statically (Vercel, GitHub Pages, anything).

```
index.html          landing
pack.html           this week's pack (Season 1 · Week 1)
leaderboard.html    renders from data/leaderboard.json
meta.html           The Meta setup guide ("Mabel's notes")
scoring.html        the composite formula, worked example, weights
submit.html         per-level submissions via GitHub issues + share-card builder
faq.html            rules & FAQ
assets/css/main.css japandi v4 design system
assets/js/main.js   mobile nav, leaderboard render, share-card builder
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
