# The Playbook — Community claims

Real workflows claimed by Muse owners in the wild, collected 2026-09-27.
These are CLAIMS, not verified runs — the pack is the receipts machine.
Each entry follows the Playbook schema, plus claimed_by / trust / review_gate.

## Workflow: Medical Bills, Audited Line by Line
- id: medical-bill-audit
- track: persona
- persona: parent
- difficulty: 4
- time: 2 hr
- setup: [browser-login]
- recipe:
  1. "Log in to my [PROVIDER] patient portal. Download the itemized bills for my last [N] visits — I need line-item detail, not summaries."
  2. "Go through every line and flag anything billed twice, any code that doesn't match the visit notes, and any charge that looks wrong. Show me each flag with the line number and amount."
  3. "For the flagged lines: find the provider's billing-dispute process and draft the dispute message for each one. Also check whether they offer a self-pay or prompt-pay discount and ask for it."
  4. "Send nothing until I approve each draft. Give me a final table: what you found, what you asked for, total dollars recovered."
- test: Every flagged line traces to a real line on a real bill; nothing is disputed without your approval; dollars recovered are documented.
- proves: Whether your Muse can do supervised money-adjacent work inside a logged-in portal without hallucinating numbers.
- claimed_by: @Ryan_Holdaway via shipwithmuse.live — $4,000+ claimed, screenshot
- trust: medium-high
- review_gate: false

## Workflow: A Week of Muse Errands
- id: errand-week-sprint
- track: persona
- persona: professional
- difficulty: 5
- time: 1 week, background
- setup: [gmail, calendar, instagram, browser]
- recipe:
  1. "This week you're my errand runner. First: I got an iPhone delivered by FedEx and something's off — track it, figure out what went wrong, and get me a refund from Apple. Report back what happened."
  2. "Buy two Primetime tickets for [EVENT/DATE]. Then book dinner for [N] at [RESTAURANT] on [DATE] — and if plans change, handle the cancellation and refund too."
  3. "Build me a leads list from my Instagram and LinkedIn network: people in [INDUSTRY/ROLE], with name, role, company, and why they're a fit. Spreadsheet."
  4. "There's a 3-hour application form at [URL]. Fill it out completely from my details — flag anything you're unsure about instead of guessing."
- test: Refund actually issued; tickets are real; dinner booking and refund both confirmed; leads list has real people with correct roles; the form is submitted with zero invented fields.
- proves: Whether your Muse can run a multi-day, multi-domain errand queue with real money and real submissions — the full autonomous week.
- claimed_by: @AlecEllin via shipwithmuse.live
- trust: medium
- review_gate: false

## Workflow: The Money Recovery Sweep
- id: money-recovery-sweep
- track: persona
- persona: professional
- difficulty: 4
- time: 3 hr
- setup: [browser-login, phone]
- recipe:
  1. "Audit my recurring bills. Start with AT&T — log in, check my plan against what I'm actually using, and get me the cheapest plan that keeps my coverage. I want $300/year or better."
  2. "Check my Amazon orders from the last 90 days for anything returnable I haven't returned, and start the returns."
  3. "I have an IKEA return to handle — [ITEM, receipt details]. Do the whole return flow."
  4. "File the $516 vet claim for my dog with [PET INSURER]: gather the invoice, fill the claim, submit it. Itemize everything you recovered at the end."
- test: Itemized recovery total matches real credits and refunds; the plan change is confirmed on the account; the vet claim is filed with a confirmation number.
- proves: Whether your Muse can chain logins, support chats, returns, and insurance filings into one itemized money-recovery run.
- claimed_by: @armand_ruiz via shipwithmuse.live — $2,120.95 itemized
- trust: medium-high
- review_gate: false

## Workflow: The Fare Matrix
- id: fare-matrix-europe
- track: moment
- moment: long-flight
- difficulty: 5
- time: 3 hr
- setup: [flightaware]
- recipe:
  1. "I'm flying SFO to Spain and back from Italy. Search cash AND award fares from SFO to each of these 11 Spanish cities [LIST], returning from each of these 10 Italian cities [LIST], across these 7 dates [DATES]. That's the full matrix — don't skip combinations."
  2. "Rank every valid round trip by total price, then separately by points cost. Flag any open-jaw combos that beat the simple round trips."
  3. "Give me the top 3 cash and top 3 award options with exact flight numbers, times, and booking links. Tell me which one you'd book and why."
- test: 146 searches actually run (count them); the cheapest option is genuinely the cheapest of the matrix; flight numbers and prices are real at time of search.
- proves: Whether your Muse can execute a large, tedious search matrix without shortcutting — the grind test.
- claimed_by: @mehtadeep via shipwithmuse.live — 146 searches
- trust: high
- review_gate: false

## Workflow: The Disaster Paperwork Double-File
- id: disaster-paperwork-double-file
- track: persona
- persona: parent
- difficulty: 4
- time: 2 hr
- setup: [browser, gmail]
- recipe:
  1. "My AC died and there's damage. First, file a police report online for [CITY/COUNTY] — here's what happened: [DETAILS]. Get me the report number."
  2. "Now file the homeowner's insurance claim with [INSURER]: upload the photos, attach the police report number, describe the damage and the timeline."
  3. "Find three licensed HVAC repair companies near [ZIP] with 4+ stars, and get me written quotes — email them the photos and the damage description."
  4. "Summarize: report number, claim number, and the three quotes side by side. Don't authorize any work."
- test: Police report has a real report number; insurance claim is filed with confirmation; quotes come from real companies; no work authorized.
- proves: Whether your Muse can run bureaucratic filings across two institutions plus vendor outreach in one stressed session.
- claimed_by: @HouseHackerJon via shipwithmuse.live
- trust: medium
- review_gate: true

## Workflow: The Marketplace Lowball Blitz
- id: marketplace-lowball-blitz
- track: persona
- persona: student
- difficulty: 3
- time: 2 hr
- setup: [messenger]
- recipe:
  1. "I want a brand-new M5 Pro MacBook Pro, 48GB RAM, 2TB. Search Facebook Marketplace within [RADIUS] of [ZIP] for every listing."
  2. "Message all of them — start at $2,200 and negotiate up, but never above $2,500. Be polite, be fast, and keep a spreadsheet: seller, list price, their counter, status."
  3. "The moment someone accepts $2,500 or less for a sealed/new unit, stop and tell me. Don't agree to meet anyone — I handle pickup."
- test: Roughly 50 sellers contacted (count the threads); final price ≤ $2,500; the unit matches the exact spec; no meetup agreed without you.
- proves: Whether your Muse can run high-volume parallel negotiation with a hard price ceiling and clean bookkeeping.
- claimed_by: @jingusucks via shipwithmuse.live — $2,500 sealed unit
- trust: medium-high
- review_gate: false

## Workflow: Contractor Estimates, Remotely
- id: contractor-estimate-remote
- track: persona
- persona: parent
- difficulty: 4
- time: 1 hr
- setup: [phone, gmail]
- recipe:
  1. "I need estimates for [JOB, e.g. fence repair]. Call these contractors [NAMES/NUMBERS]: introduce yourself as my assistant, describe the job, and ask for a ballpark and their availability this month."
  2. "Email each one photos of the work area plus a written description, and ask for a written estimate in reply."
  3. "Chase anyone who hasn't replied in 48 hours — one polite follow-up call. Then give me a comparison: price, timeline, and who was most responsive."
- test: Calls actually placed (transcripts exist); emails sent with the right photos attached; follow-ups happen on schedule; the comparison covers real quotes.
- proves: Whether your Muse can run a phone-plus-email vendor process you never have to attend.
- claimed_by: @ZachSB via shipwithmuse.live
- trust: medium
- review_gate: false

## Workflow: The Delay Compensation Claim
- id: delay-compensation-claim
- track: moment
- moment: airport-wait
- difficulty: 2
- time: 15 min
- setup: [gmail, flightaware]
- recipe:
  1. "My Delta flight [NUMBER] on [DATE] was delayed 7 hours. Claim every cent of compensation I'm owed — check Delta's policy, DOT rules, and my SkyMiles account."
  2. "While you're at it: rebook me on the earliest workable alternative and confirm the new itinerary."
  3. "There's a support email thread about this in my inbox — read it and reply appropriately so nothing falls through the cracks."
- test: The credit actually lands in the account; the rebooking is confirmed with a real confirmation code; the email reply is sent and accurate.
- proves: Whether your Muse turns a travel disaster into money plus a new itinerary in minutes.
- claimed_by: @cryptopunk7213 via shipwithmuse.live — 3 screenshots
- trust: high
- review_gate: false

## Workflow: The Credit Dispute Blitz
- id: credit-dispute-blitz
- track: persona
- persona: professional
- difficulty: 3
- time: 1 hr
- setup: [browser-login]
- recipe:
  1. "Pull my credit reports from all three bureaus. List every collections account with creditor, amount, and date."
  2. "For each collections account, check whether it's past the statute of limitations in my state and whether the details match my records. Flag any errors."
  3. "Draft and submit disputes for the ones with errors — use the bureau's online dispute process. Log the confirmation numbers and tell me exactly what you submitted and when."
- test: Both collections actually removed (check the reports after); dispute submissions have real confirmation numbers; timestamps documented.
- proves: Whether your Muse can execute a regulated dispute process fast and cleanly.
- claimed_by: @ChrisUniverse via shipwithmuse.live — both removed in 76 minutes
- trust: high
- review_gate: true

## Workflow: Day-of Errands Autopilot
- id: day-of-errands-autopilot
- track: persona
- persona: parent
- difficulty: 3
- time: 30 min setup, runs all day
- setup: [gmail, shopping, maps]
- recipe:
  1. "Today you're running my errands. Buy me [SOCKS/SPECIFICS] on Amazon — cheapest decent option, not the cheapest garbage."
  2. "Order my usual Whole Foods groceries for delivery today. You know the list — check my last two orders and repeat, minus the [ITEM] I didn't like."
  3. "Book a cleaning service for [DATE] — 4.5+ stars, under $[X]. And get me a burger for dinner from somewhere good near me, arriving by 7pm."
  4. "Text me a receipt for each one as it completes. If anything costs more than $[LIMIT], ask me first."
- test: All four errands complete with real order confirmations; the grocery list matches past orders; nothing over the limit without approval.
- proves: Whether your Muse can run a mixed shopping, services, and food day across apps with a spending governor.
- claimed_by: @nicbstme via shipwithmuse.live
- trust: medium
- review_gate: false

## Workflow: The Unclaimed Property Sweep
- id: unclaimed-property-sweep
- track: persona
- persona: professional
- difficulty: 3
- time: 45 min
- setup: [browser]
- recipe:
  1. "I've lived in [STATE 1], [STATE 2], [STATE 3]. Search every one of those states' unclaimed property databases for my name and any past addresses."
  2. "For every hit: tell me the amount, the holder, and the claim ID. Then fill out the claim forms — I'll sign and provide ID where needed."
  3. "Don't submit anything that needs my signature without showing me first. Give me a final list: total found, total claimed, what's pending on me."
- test: Searches run in every listed state; hits are real and verifiable on state sites; forms are correctly filled; nothing submitted without review.
- proves: Whether your Muse does exhaustive multi-site lookup plus form-filling without missing a state.
- claimed_by: two independent builders via shipwithmuse.live — $800+ in 10 min
- trust: medium-high
- review_gate: true

## Workflow: The Personal Stylist App
- id: wardrobe-stylist-app
- track: persona
- persona: professional
- difficulty: 4
- time: 2 hr
- setup: [shopping, media-library]
- recipe:
  1. "Learn my style. Here are my measurements [LIST], my top 20 stores [LIST], and my budget rules [RULES]. Save all of it — this is my profile now."
  2. "Pick one hero piece from [STORE/CATALOG] under $[X] that anchors my wardrobe, and build 5 full looks around it using pieces I own plus new buys."
  3. "Keep a 'loves' list of everything you recommend. Every new item needs a real product link, a price, and a reason it fits my profile."
- test: Hero piece is real, in budget, with a working link; looks reference actual owned pieces; the profile persists across sessions.
- proves: Whether your Muse can build and maintain a persistent personal profile that compounds over time.
- claimed_by: @shriyanevatia via shipwithmuse.live
- trust: medium
- review_gate: false

## Workflow: The Friends-Only Feed
- id: friends-feed-dashboard
- track: persona
- persona: grandparent
- difficulty: 3
- time: 1 hr
- setup: [instagram]
- recipe:
  1. "Look through my Instagram DMs and figure out who my actual inner circle is — family and close friends I talk to most."
  2. "Build me a private dashboard: just their posts and stories, newest first, nothing else. No ads, no suggested content."
  3. "Keep it updated daily. If someone in the circle posts something big — a baby, a move, an engagement — flag it for me so I don't miss it."
- test: The circle matches real DM frequency; the feed contains only those people; milestone flags correspond to real posts.
- proves: Whether your Muse can derive a social graph from behavior and maintain a living artifact.
- claimed_by: @shivambharuka via shipwithmuse.live
- trust: medium
- review_gate: false

## Workflow: The Playlist Pitcher
- id: playlist-pitcher
- track: persona
- persona: professional
- difficulty: 4
- time: 2 hr
- setup: [spotify, gmail]
- recipe:
  1. "My music is [GENRE/DESCRIPTION] — here's my latest track [LINK]. Research Spotify playlists that feature this genre: I want curator names, playlist sizes, and contact info."
  2. "Rank the top 20 by fit. Then write a personalized cold email for each curator — reference a specific track on their playlist, keep it short, link my song."
  3. "Send nothing yet — show me all 20 drafts first. After I approve, send them and track replies for a week, then report back who placed me."
- test: Playlists are real and genre-matched; curator contacts are real; placements are verifiable on Spotify.
- proves: Whether your Muse can run a research-to-outreach pipeline with taste and restraint.
- claimed_by: @goshfather via Threads
- trust: medium-low
- review_gate: false
