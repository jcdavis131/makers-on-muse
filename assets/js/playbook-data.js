/* The Playbook: community workflows for Muse.

   Content license: Creative Commons Attribution 4.0 International
   (CC BY 4.0). See LICENSE-CONTENT in the repo root. You may copy and
   adapt these workflows with credit to Makers on Muse.

   None of these has been checked on a real Muse yet. Each "setup" tag
   must be one playbook.html's tag legend explains (scripts/test-playbook.mjs
   checks it). A workflow's id is its permalink: /playbook?w=<id>.
   Never change an id once published; add a new one instead.

   Browser: sets window.MOM_PLAYBOOKS. Node: module.exports. */
(function (root) {
  var PLAYBOOKS = [
    {
      "id": "fridge-dinner-rescue",
      "title": "Fridge Dinner Rescue",
      "track": "persona",
      "persona": "parent",
      "group": "parent",
      "difficulty": 2,
      "time": "10 min",
      "setup": [],
      "recipe": [
        "Here is exactly what is in my fridge and pantry right now: [paste your list]. Give me 3 dinners I can make in under 30 minutes that two kids under 10 will actually eat. Use ONLY ingredients from my list, plus salt, oil, and basic spices.",
        "Pick the fastest one and write it out step by step with timing, including what I can have the kids do to help.",
        "What is missing from my list that would unlock 3 more easy dinners? Give me a short grocery add-on list."
      ],
      "test": "You get 3 dinners that use only what you listed, each genuinely under 30 minutes, plus a step-by-step for one. If it invents an ingredient you don't have, it failed.",
      "proves": "Whether your Muse respects hard constraints instead of hallucinating a fully stocked kitchen."
    },
    {
      "id": "birthday-party-in-a-box",
      "title": "Birthday Party in a Box",
      "track": "persona",
      "persona": "parent",
      "group": "parent",
      "difficulty": 3,
      "time": "20 min",
      "setup": [
        "browser"
      ],
      "recipe": [
        "My kid turns 7 on [date]. I am inviting 12 kids to our house, 2-4pm. Plan the party: theme ideas, food, one main activity, and a full supply list. Total budget $150.",
        "Now find the supplies online with real prices and links. Adjust the list until the total is at or under $150, and show me the itemized math.",
        "Write the invitation text I can paste into the group chat, with date, time, address placeholder, and RSVP request."
      ],
      "test": "Itemized list with real product links totaling $150 or less, plus usable invitation text. If the math doesn't add up or links are dead, it failed.",
      "proves": "Whether your Muse can do multi-step shopping research and hold a budget line.",
      "note": "Find and price only. Don't let Muse buy anything."
    },
    {
      "id": "sunday-photo-letter",
      "title": "The Sunday Photo Letter",
      "track": "persona",
      "persona": "grandparent",
      "group": "grandparent",
      "difficulty": 1,
      "time": "5 min",
      "setup": [
        "photo-upload"
      ],
      "recipe": [
        "I'm uploading this month's photos of my grandkids. Pick the 5 best ones and tell me which they are.",
        "Write a warm letter to my sister describing what is happening in each photo, one short paragraph per photo. Keep it cheerful and under 300 words total.",
        "Now make a shorter version I can paste as a text message, and list the photos in the same order so I can attach them."
      ],
      "test": "5 picks from the photos you uploaded, and a letter that describes things actually visible in those photos.",
      "proves": "The simplest possible capability check — can your Muse look at your photos and talk about them like a person would."
    },
    {
      "id": "pillbox-sunday",
      "title": "Pillbox Sunday",
      "track": "persona",
      "persona": "grandparent",
      "group": "grandparent",
      "difficulty": 3,
      "time": "15 min",
      "setup": [
        "google-calendar"
      ],
      "recipe": [
        "I take these medications: [list each with dose and schedule, e.g. 'lisinopril 10mg every morning']. Build me a clear weekly pill schedule, morning / afternoon / evening.",
        "Put a daily reminder on my calendar for each dose time. Then check: are any two of these known to interact? If so, flag it and tell me to confirm with my pharmacist — do NOT tell me to change anything yourself.",
        "Print me a one-page wallet card version of the schedule: medication, dose, and time, big text, simple layout."
      ],
      "test": "Calendar reminders appear at the right times every day, and any interaction is flagged with a clear 'ask your pharmacist' note rather than medical advice.",
      "proves": "Whether your Muse handles health-adjacent tasks with proper caution — flagging, never prescribing.",
      "note": "Health information. Muse's answer is not medical advice; confirm with your pharmacist."
    },
    {
      "id": "syllabus-to-calendar",
      "title": "Syllabus to Calendar",
      "track": "persona",
      "persona": "student",
      "group": "student",
      "difficulty": 2,
      "time": "10 min",
      "setup": [
        "google-calendar"
      ],
      "recipe": [
        "Here is my course syllabus: [paste the text]. Extract every exam date, assignment deadline, and project due date. List them with the course name.",
        "Add each one to my calendar with a reminder 3 days before. Then give me a one-page summary of my crunch weeks — any week with 2 or more deadlines.",
        "Double-check: read back every date you added so I can verify nothing got missed."
      ],
      "test": "Every deadline from the syllabus is on your calendar with a 3-day reminder, and the read-back matches the syllabus exactly.",
      "proves": "Extraction accuracy plus write access — the two halves of a useful student setup."
    },
    {
      "id": "exam-week-battle-plan",
      "title": "Exam Week Battle Plan",
      "track": "persona",
      "persona": "student",
      "group": "student",
      "difficulty": 3,
      "time": "15 min",
      "setup": [
        "google-calendar",
        "gmail"
      ],
      "recipe": [
        "My finals: [subject + date + time for each]. I work [shifts] and have classes until [date]. Build me a day-by-day study plan for the next 14 days, hardest exam first, with rest built in.",
        "Check my calendar for conflicts with the study blocks and move anything that clashes. Tell me exactly what you moved.",
        "Email the final plan to me so I have it on my phone."
      ],
      "test": "The plan respects your work shifts, no study block overlaps a real calendar event, and the email actually arrives with the final version.",
      "proves": "Whether your Muse can juggle constraints across two connectors without dropping one."
    },
    {
      "id": "race-week-brief",
      "title": "Race Week Brief",
      "track": "persona",
      "persona": "athlete",
      "group": "athlete",
      "difficulty": 3,
      "time": "15 min",
      "setup": [
        "google-calendar"
      ],
      "recipe": [
        "I am running a 10K on Sunday at 8am in [city]. I run about 25 miles a week. Give me a 7-day race-week plan: workouts, sleep targets, and what to eat the night before and morning of.",
        "Check the weather forecast for race morning in [city] and tell me exactly what to wear, when to arrive, and how much water to bring.",
        "Put the race on my calendar, set a Muse reminder for 6am race morning, and remind me to lay out my gear Saturday night."
      ],
      "test": "A complete 7-day plan, a clothing call that matches the real forecast, and the calendar event and reminders actually set.",
      "proves": "Whether your Muse blends live external data with a personal plan instead of giving generic advice."
    },
    {
      "id": "protein-grocery-run",
      "title": "Protein Grocery Run",
      "track": "persona",
      "persona": "athlete",
      "group": "athlete",
      "difficulty": 2,
      "time": "10 min",
      "setup": [
        "browser"
      ],
      "recipe": [
        "I lift 4 times a week and need about 150g of protein a day. My grocery budget is $80 a week. Build me a one-week grocery list that hits the protein target.",
        "Find the cheapest real options online for the protein staples (chicken, eggs, Greek yogurt, protein powder) with prices and links. Rework the total until it fits $80.",
        "Turn the final list into a single shopping list grouped by store section: produce, meat, dairy, dry goods."
      ],
      "test": "The list hits roughly 150g/day of protein and the linked prices total $80 or less.",
      "proves": "Budget-constrained optimization — the 'and keep it cheap' part most setups fumble.",
      "note": "Find and price only. Don't let Muse buy anything."
    },
    {
      "id": "pre-dawn-briefing",
      "title": "The Pre-Dawn Briefing",
      "track": "persona",
      "persona": "professional",
      "group": "professional",
      "difficulty": 2,
      "time": "5 min",
      "setup": [
        "gmail",
        "google-calendar"
      ],
      "recipe": [
        "Brief me for today. First scan my inbox for anything that arrived since 8pm last night and flag what is actually urgent. Then walk through my calendar in time order. For each meeting, tell me in one line what I need to be ready for. I have 10 minutes before the kids wake up — keep it tight.",
        "Draft the one reply I owe [name] about [topic]. Short, in my voice, no fluff. Do NOT send it — just show me the draft.",
        "Now give me the single most important thing to do in the next hour, and the single thing I can safely ignore until tomorrow."
      ],
      "test": "The briefing covers overnight email plus today's meetings in order, fits in a 2-minute read, and the draft appears unsent for your review.",
      "proves": "Triage judgment plus restraint — a good chief of staff knows what not to send."
    },
    {
      "id": "international-trip-handled",
      "title": "The International Trip, Handled",
      "track": "persona",
      "persona": "professional",
      "group": "professional",
      "difficulty": 5,
      "time": "30 min",
      "setup": [
        "gmail",
        "google-calendar",
        "browser"
      ],
      "recipe": [
        "I am flying to London for a conference, out [OUT DATE], back [BACK DATE]. I need to leave [HOME CITY] the afternoon before and land the next morning. Research real flight options under [BUDGET], one stop max, and give me the top 3 with flight numbers, times, and prices.",
        "Put tentative holds on my calendar for the best two options, labeled clearly as tentative. Then draft my out-of-office email for [OUT DATE] to [BACK DATE] mentioning the conference and who to contact urgently.",
        "Build a packing checklist for 4 conference days plus one nice dinner, considering London weather for those dates. Then show me how to track my chosen flight's live status on the day.",
        "Summarize everything — flights, calendar holds, OOO draft, packing list — in one message I can forward to my spouse."
      ],
      "test": "3 real flight options under your budget with flight numbers, two tentative calendar holds, a ready-to-paste OOO draft, and a weather-aware packing list.",
      "proves": "The full autonomous-errand test — research, calendar writes, drafting, and synthesis in one run.",
      "note": "Search only. Don't let Muse book or pay for anything."
    },
    {
      "id": "shift-swap-ask",
      "title": "The Shift-Swap Ask",
      "track": "persona",
      "persona": "nurse",
      "group": "nurse",
      "difficulty": 2,
      "time": "10 min",
      "setup": [
        "gmail"
      ],
      "recipe": [
        "I need to swap my Friday night shift (7pm-7am) for someone's Saturday night shift (7pm-7am). Draft a message for our unit group chat: polite, explains it is for a family commitment, and offers my banana bread as a thank-you bribe. Keep it short.",
        "Now draft a separate, more professional message to my charge nurse asking permission to arrange the swap, before I post anything to the group.",
        "Check my email for any existing schedule-change policies from my manager and tell me if I am missing a required step."
      ],
      "test": "Two drafts with the right shift times — the charge-nurse ask first, the group message second — plus a yes/no on whether policy requires anything else.",
      "proves": "Tone control and workplace protocol — knowing the permission comes before the announcement."
    },
    {
      "id": "license-renewal-countdown",
      "title": "License Renewal Countdown",
      "track": "persona",
      "persona": "nurse",
      "group": "nurse",
      "difficulty": 3,
      "time": "15 min",
      "setup": [
        "google-calendar",
        "gmail"
      ],
      "recipe": [
        "My nursing license renews on [date] and I still need 20 continuing-education hours. Find accredited online CE courses that total at least 20 hours for under $100 combined, with links.",
        "Look at my calendar and block realistic study sessions around my shifts over the next 6 weeks — never on a day I work nights.",
        "Set a reminder 30 days before my renewal date titled 'License renewal: confirm CE hours submitted.'"
      ],
      "test": "Real accredited courses totaling 20+ hours under $100, study blocks that avoid night-shift days, and the 30-day reminder on your calendar.",
      "proves": "Deadline-driven planning against a real shift calendar — the constraints are the whole game."
    },
    {
      "id": "grading-sprint",
      "title": "The Grading Sprint",
      "track": "persona",
      "persona": "teacher",
      "group": "teacher",
      "difficulty": 2,
      "time": "10 min",
      "setup": [
        "google-calendar"
      ],
      "recipe": [
        "I have 60 essays to grade, about 8 minutes each. I have Saturday 9am-1pm and Sunday 2-5pm free. Build me a grading schedule with a 10-minute break every hour.",
        "Add the blocks to my calendar. Tell me exactly how many essays per block I need to finish to stay on track.",
        "If the math does not work, say so plainly and propose a fix — do not just squeeze it in."
      ],
      "test": "The honest version of this: 60 essays at 8 minutes is 8 hours, but you only have 7 — your Muse MUST flag the shortfall and propose a real fix (fewer minutes per essay, an extra evening, or splitting across two weekends).",
      "proves": "Whether your Muse does arithmetic honestly or cheerfully schedules the impossible. This one catches sycophants."
    },
    {
      "id": "conference-night-prep",
      "title": "Conference Night, Prepped",
      "track": "persona",
      "persona": "teacher",
      "group": "teacher",
      "difficulty": 4,
      "time": "25 min",
      "setup": [
        "gmail",
        "google-calendar"
      ],
      "recipe": [
        "Parent-teacher conferences are Thursday 4-7pm, 10 minutes per family. Here are my students and one concern for each: [paste your list]. Build the schedule — hardest conversations first, with a 10-minute buffer built in halfway.",
        "For each student, draft 3 bullet talking points: one genuine strength, the concern, and one concrete next step the parent can do at home. Save it as a printable document.",
        "Check my email for any parent messages about conferences I have not answered, and list them with a one-line suggested reply each."
      ],
      "test": "A schedule that fits in 3 hours with the buffer, every student gets strength/concern/next-step bullets, and no parent email goes unanswered.",
      "proves": "Structured synthesis from messy input — turning a rough list into a calm, professional evening."
    },
    {
      "id": "gate-change-guardian",
      "title": "Gate Change Guardian",
      "track": "moment",
      "moment": "airport-wait",
      "group": "airport-wait",
      "difficulty": 2,
      "time": "10 min",
      "setup": [
        "browser"
      ],
      "recipe": [
        "My flight is [AIRLINE + NUMBER] out of [AIRPORT] today. Check its live status and tell me the gate, boarding time, and any delay risk.",
        "If it's delayed more than an hour, find me the next two alternate flights to [DESTINATION] tonight and draft exactly what I'd say at the rebooking desk.",
        "Remind me to re-check the flight status 40 minutes from now."
      ],
      "test": "Muse returns the live gate and boarding time from a real lookup, names real alternate flights with flight numbers, and the reminder is actually set.",
      "proves": "whether your Muse does live lookups and turns them into an action plan under time pressure.",
      "note": "Look up only. Don't let Muse rebook or pay for anything."
    },
    {
      "id": "terminal-power-hour",
      "title": "Terminal Power Hour",
      "track": "moment",
      "moment": "airport-wait",
      "group": "airport-wait",
      "difficulty": 4,
      "time": "50 min",
      "setup": [
        "gmail",
        "google-calendar",
        "browser"
      ],
      "recipe": [
        "I have a 90-minute layover at [AIRPORT TERMINAL]. Scan my inbox for anything that arrived in the last 3 hours and give me a triage: urgent, action, FYI — 5 bullets max.",
        "For anything urgent, draft the reply. Don't send anything — show me each draft for approval.",
        "Check my calendar for tomorrow and flag any meeting that needs prep; tell me the one thing I should skim before it.",
        "Find me a quiet coffee spot near gate [GATE] with outlets, and tell me the exact time I need to start walking to make boarding."
      ],
      "test": "every triage item traces to a real message (nothing invented), drafts sound like you, and the walk-time accounts for real terminal distance.",
      "proves": "whether your Muse can juggle inbox, calendar and web lookups in one errand without hallucinating."
    },
    {
      "id": "wheels-down-brief",
      "title": "Wheels-Down Brief",
      "track": "moment",
      "moment": "long-flight",
      "group": "long-flight",
      "difficulty": 1,
      "time": "15 min",
      "setup": [
        "browser"
      ],
      "recipe": [
        "I land in [CITY] at [TIME] tonight. Give me a wheels-down brief: current weather, how long the train or taxi takes to [HOTEL ADDRESS] right now, and one dinner spot nearby that takes walk-ins.",
        "Compress that into 4 lines I can screenshot before we take off.",
        "If my flight gets delayed past [TIME], what's my backup plan for getting downtown — last train times and what changes?"
      ],
      "test": "weather is current, the transit time is a real estimate not a guess, and the restaurant is actually open tonight. (Needs connectivity before takeoff.)",
      "proves": "whether your Muse grounds answers in live data instead of vibes."
    },
    {
      "id": "airplane-mode-deep-dive",
      "title": "Airplane Mode Deep Dive",
      "track": "moment",
      "moment": "long-flight",
      "group": "long-flight",
      "difficulty": 3,
      "time": "2 hr",
      "setup": [
        "podcast"
      ],
      "recipe": [
        "Before I board: make me a 20-minute private podcast episode on [TOPIC, e.g. the 2026 World Cup host cities] — just what I'd need for small talk at the conference. Generate it now while I have wifi.",
        "Also make a one-page cheat sheet of the names, dates, and numbers from the episode that I can review offline.",
        "After I land: quiz me with 5 questions on the episode and score me."
      ],
      "test": "the episode plays end to end, the cheat sheet matches what the episode actually said, and the quiz scores you fairly. (Every step needs a connection: Muse runs in the cloud.)",
      "proves": "whether your Muse can produce real media artifacts and pick the thread back up hours later."
    },
    {
      "id": "copilot-fuel-math",
      "title": "Co-Pilot Fuel Math",
      "track": "moment",
      "moment": "road-trip",
      "group": "road-trip",
      "difficulty": 3,
      "time": "1 hr",
      "setup": [
        "browser"
      ],
      "recipe": [
        "We're driving [START] to [END] — about [MILES] miles. My car gets [MPG] mpg highway and I have half a tank ([GALLONS] gallons). Where's the cheapest gas stop that keeps me above a quarter tank the whole way?",
        "Add a 20-minute stretch break at the halfway point with the best-reviewed taco spot within 5 minutes of the highway.",
        "If we leave at [TIME], what time do we actually arrive, accounting for both stops?"
      ],
      "test": "the gas math checks out (miles divided by mpg against tank capacity), the taco spot is real and near the route, and the arrival time includes both stops.",
      "proves": "whether your Muse can chain arithmetic, route lookups and reviews into one plan without dropping a constraint."
    },
    {
      "id": "rolling-podcast-producer",
      "title": "Rolling Podcast Producer",
      "track": "moment",
      "moment": "road-trip",
      "group": "road-trip",
      "difficulty": 5,
      "time": "3 hr",
      "setup": [
        "podcast",
        "gmail",
        "google-calendar",
        "spotify",
        "browser"
      ],
      "recipe": [
        "Plan a 4-episode audio series for our drive from [START] to [END]: 45 minutes each, on [THEME, e.g. the history of BBQ joints along our route]. Generate episode 1 now.",
        "While episode 1 plays: scan my email for anything from my boss this week and give me a 3-bullet summary I'll listen to between episodes.",
        "Build a Spotify playlist of [GENRE] that fills the gaps between episodes — about 90 minutes total.",
        "At the end of the drive, run a 5-question trivia game from the episodes for me and my passenger."
      ],
      "test": "episodes reference real places on your actual route, the email summary is accurate, the playlist is the right length, and the trivia answers match the episodes.",
      "proves": "whether your Muse can run a multi-hour, multi-skill production while you drive — the full autonomous errand."
    },
    {
      "id": "dmv-document-check",
      "title": "DMV Document Check",
      "track": "moment",
      "moment": "dmv",
      "group": "dmv",
      "difficulty": 1,
      "time": "10 min",
      "setup": [
        "browser"
      ],
      "recipe": [
        "I'm at the [STATE] DMV to [TASK, e.g. renew my driver's license]. What documents do I need? Quiz me one at a time.",
        "I have [WHAT YOU BROUGHT]. Is that enough, or am I missing something?",
        "What's the one mistake that gets people sent home for this?"
      ],
      "test": "the document list matches the official state requirements and the gotcha answer is a real one (e.g. wrong proof of residency).",
      "proves": "whether your Muse gives you the official answer instead of a confident guess."
    },
    {
      "id": "line-time-life-admin",
      "title": "Line-Time Life Admin",
      "track": "moment",
      "moment": "dmv",
      "group": "dmv",
      "difficulty": 3,
      "time": "30 min",
      "setup": [
        "gmail",
        "finances"
      ],
      "recipe": [
        "I'm stuck in line for 30 minutes. Pull my last 10 bank transactions and flag any subscriptions over $10/month I haven't used recently.",
        "Draft a cancellation email for the most useless one — polite, firm, with account details left as [BLANKS] for me to fill in. Don't invent my account number.",
        "Now check my inbox for any unread bill or renewal notice from the last 7 days and list what needs paying this week."
      ],
      "test": "every transaction cited is real with matching amounts, the draft has blanks instead of invented account numbers, and no bill is invented.",
      "proves": "whether your Muse can do supervised money-adjacent work without hallucinating numbers — the trust test.",
      "note": "Bank data. Nothing gets cancelled or paid without your OK."
    },
    {
      "id": "ceremony-survival-kit",
      "title": "Ceremony Survival Kit",
      "track": "moment",
      "moment": "graduation",
      "group": "graduation",
      "difficulty": 2,
      "time": "20 min",
      "setup": [
        "browser"
      ],
      "recipe": [
        "I'm at a 2-hour outdoor graduation at [VENUE]. It's [TEMP] degrees. Give me a survival checklist: what goes in my bag, where the shade will be at [TIME] given the sun's position, and the nearest water refill.",
        "Find the ceremony program or livestream link so I can follow along when I can't hear the names.",
        "Draft a 2-sentence congratulations text to the graduate I'll send the moment it's over — warm, not cheesy."
      ],
      "test": "the shade advice accounts for the actual venue orientation and time of day, the livestream link is real, and the text sounds like you.",
      "proves": "whether your Muse blends physical-world reasoning (sun, heat, venue) with a digital lookup."
    },
    {
      "id": "commencement-toast-ghostwriter",
      "title": "Commencement Toast Ghostwriter",
      "track": "moment",
      "moment": "graduation",
      "group": "graduation",
      "difficulty": 4,
      "time": "1 hr",
      "setup": [
        "photo-upload"
      ],
      "recipe": [
        "My [GRADUATE] asked me to say a few words at the graduation dinner tonight. Ask me 5 questions about them — one at a time — then draft a 90-second toast.",
        "I'm uploading some recent family photos. Pick 3 that match the stories in the toast. Tell me which ones and why.",
        "Now tighten it: cut 30%, keep the funny line about [DETAIL], end on the future, not the past."
      ],
      "test": "the toast uses only details you actually gave (no invented childhood anecdotes), the photo picks come from the photos you uploaded, and it reads aloud in about 90 seconds.",
      "proves": "whether your Muse can interview you, respect your stories, and edit to a hard time constraint."
    },
    {
      "id": "pickup-line-eta",
      "title": "Pickup Line ETA",
      "track": "moment",
      "moment": "pickup-line",
      "group": "pickup-line",
      "difficulty": 1,
      "time": "10 min",
      "setup": [
        "browser"
      ],
      "recipe": [
        "I'm [MINUTES] from [SCHOOL] in current traffic. School lets out at [TIME]. Will I make it, or should I text the teacher?",
        "Draft the text to the teacher: running [X] minutes late, kid's name is [NAME]. Keep it to 2 sentences.",
        "If I'm going to be more than 10 minutes late, find the school's front-office number so I can call ahead."
      ],
      "test": "the ETA uses live traffic (needs connectivity), and the draft has the right details with nothing invented.",
      "proves": "whether your Muse does live math before giving you advice."
    },
    {
      "id": "after-school-ops",
      "title": "After-School Ops",
      "track": "moment",
      "moment": "pickup-line",
      "group": "pickup-line",
      "difficulty": 3,
      "time": "20 min",
      "setup": [
        "google-calendar",
        "gmail",
        "browser"
      ],
      "recipe": [
        "Here's our afternoon: pickup at [SCHOOL] at [TIME], practice at [LOCATION] at [TIME], dinner somewhere between. Build the timeline with real drive times.",
        "Check my email for anything from the coach about practice changes this week.",
        "Find a dinner spot between the school and the field that a [AGE]-year-old will actually eat at, open by [TIME]."
      ],
      "test": "drive times are real, any coach email is quoted rather than paraphrased from memory, and the restaurant is on the route and open at that hour.",
      "proves": "whether your Muse can coordinate three moving parts without dropping one."
    },
    {
      "id": "appointment-prep-script",
      "title": "Appointment Prep Script",
      "track": "moment",
      "moment": "waiting-room",
      "group": "waiting-room",
      "difficulty": 2,
      "time": "15 min",
      "setup": [],
      "recipe": [
        "I'm seeing my doctor in 20 minutes about [ISSUE]. Help me write down my recent readings or symptoms, current meds, and my top 3 questions — ask me for each one.",
        "Condense that into a 30-second script I can read to the doctor so I don't forget anything.",
        "What's the one thing people forget to ask at a follow-up like this?"
      ],
      "test": "the script fits in 30 seconds read aloud, nothing you said is misrecorded, and the forgotten-question answer is genuinely useful (e.g. home cuff calibration for blood pressure).",
      "proves": "whether your Muse listens precisely and structures under a hard time box.",
      "note": "Health information. Muse's answer is not medical advice."
    },
    {
      "id": "waiting-room-inbox-zero",
      "title": "Waiting Room Inbox Zero",
      "track": "moment",
      "moment": "waiting-room",
      "group": "waiting-room",
      "difficulty": 4,
      "time": "35 min",
      "setup": [
        "gmail",
        "google-calendar"
      ],
      "recipe": [
        "I have 30 minutes. Triage my inbox: anything I can answer in under 2 minutes, draft the reply and queue it for my approval. Batch all drafts — send nothing.",
        "For threads older than 5 days that I've ignored, draft one polite nudge each.",
        "Check tomorrow's calendar and pre-draft the agenda for my [TIME] meeting based on the email threads about it.",
        "Final list: what you drafted, what needs my decision, what you left alone — and why."
      ],
      "test": "zero emails sent without approval, every draft traces to a real thread, and the agenda reflects the actual email discussion.",
      "proves": "whether your Muse can be trusted with your inbox at near-autonomy — drafts, judgment, and restraint."
    },
    {
      "id": "medical-bill-audit",
      "title": "Medical Bill Audit",
      "track": "persona",
      "persona": "parent",
      "group": "parent",
      "difficulty": 4,
      "time": "2 hr",
      "setup": [
        "browser"
      ],
      "recipe": [
        "Log in to my [PROVIDER] patient portal. Download the itemized bills for my last [N] visits — I need line-item detail, not summaries.",
        "Go through every line and flag anything billed twice, any code that doesn't match the visit notes, and any charge that looks wrong. Show me each flag with the line number and amount.",
        "For the flagged lines: find the provider's billing-dispute process and draft the dispute message for each one. Also check whether they offer a self-pay or prompt-pay discount and ask for it.",
        "Send nothing until I approve each draft. Give me a final table: what you found, what you asked for, total dollars recovered."
      ],
      "test": "Every flagged line traces to a real line on a real bill. Nothing is disputed that you didn't approve, and the dollars recovered are documented.",
      "proves": "Whether your Muse can do supervised money-adjacent work inside a logged-in portal without hallucinating numbers.",
      "claimed_by": "@Ryan_Holdaway via shipwithmuse.live",
      "trust": "medium-high"
    },
    {
      "id": "errand-week-sprint",
      "title": "Errand Week Sprint",
      "track": "persona",
      "persona": "professional",
      "group": "professional",
      "difficulty": 5,
      "time": "1 week, in the background",
      "setup": [
        "gmail",
        "google-calendar",
        "browser"
      ],
      "recipe": [
        "This week you're my errand runner. First: I got an iPhone delivered by FedEx and something's off — track it, figure out what went wrong, and get me a refund from Apple. Report back what happened.",
        "Buy two Primetime tickets for [EVENT/DATE]. Then book dinner for [N] at [RESTAURANT] on [DATE] — and if plans change, handle the cancellation and refund too.",
        "Build me a leads list from my Instagram and LinkedIn network: people in [INDUSTRY/ROLE], with name, role, company, and why they're a fit. Spreadsheet.",
        "There's a 3-hour application form at [URL]. Fill it out completely from my details — flag anything you're unsure about instead of guessing."
      ],
      "test": "The refund is actually issued. The tickets are real. The dinner booking and the refund are both confirmed. The leads list has real people with correct roles. The form is submitted with zero invented fields.",
      "proves": "Whether your Muse can run a multi-day, multi-domain errand queue with real money and real submissions — the full autonomous week.",
      "claimed_by": "@AlecEllin via shipwithmuse.live",
      "trust": "medium"
    },
    {
      "id": "money-recovery-sweep",
      "title": "Money Recovery Sweep",
      "track": "persona",
      "persona": "professional",
      "group": "professional",
      "difficulty": 4,
      "time": "3 hr",
      "setup": [
        "browser",
        "phone"
      ],
      "recipe": [
        "Audit my recurring bills. Start with AT&T — log in, check my plan against what I'm actually using, and get me the cheapest plan that keeps my coverage. I want $300/year or better.",
        "Check my Amazon orders from the last 90 days for anything returnable I haven't returned, and start the returns.",
        "I have an IKEA return to handle — [ITEM, receipt details]. Do the whole return flow.",
        "File the $516 vet claim for my dog with [PET INSURER]: gather the invoice, fill the claim, submit it. Itemize everything you recovered at the end."
      ],
      "test": "The itemized recovery total matches real credits and refunds. The AT&T plan change is confirmed on the account. The vet claim is filed with a confirmation number.",
      "proves": "Whether your Muse can chain logins, support chats, returns, and insurance filings into one itemized money-recovery run.",
      "claimed_by": "@armand_ruiz via shipwithmuse.live",
      "trust": "medium-high"
    },
    {
      "id": "fare-matrix-europe",
      "title": "Europe Fare Matrix",
      "track": "moment",
      "moment": "long-flight",
      "group": "long-flight",
      "difficulty": 5,
      "time": "3 hr",
      "setup": [
        "browser"
      ],
      "recipe": [
        "I'm flying SFO to Spain and back from Italy. Search cash AND award fares from SFO to each of these 11 Spanish cities [LIST], returning from each of these 10 Italian cities [LIST], across these 7 dates [DATES]. That's the full matrix — don't skip combinations.",
        "Rank every valid round trip by total price, then separately by points cost. Flag any open-jaw combos that beat the simple round trips.",
        "Give me the top 3 cash and top 3 award options with exact flight numbers, times, and booking links. Tell me which one you'd book and why."
      ],
      "test": "All 146 searches actually run — count them. The cheapest option is genuinely the cheapest of the matrix. Flight numbers and prices are real at the time of search.",
      "proves": "Whether your Muse can execute a large, tedious search matrix without shortcutting — the grind test.",
      "claimed_by": "@mehtadeep via shipwithmuse.live",
      "trust": "high"
    },
    {
      "id": "disaster-paperwork-double-file",
      "title": "Disaster Paperwork Double-File",
      "track": "persona",
      "persona": "parent",
      "group": "parent",
      "difficulty": 4,
      "time": "2 hr",
      "setup": [
        "browser",
        "gmail"
      ],
      "recipe": [
        "My AC died and there's damage. First, file a police report online for [CITY/COUNTY] — here's what happened: [DETAILS]. Get me the report number.",
        "Now file the homeowner's insurance claim with [INSURER]: upload the photos, attach the police report number, describe the damage and the timeline.",
        "Find three licensed HVAC repair companies near [ZIP] with 4+ stars, and get me written quotes — email them the photos and the damage description.",
        "Summarize: report number, claim number, and the three quotes side by side. Don't authorize any work."
      ],
      "test": "The police report has a real report number. The insurance claim is filed with confirmation. The quotes come from real companies. No work was authorized.",
      "proves": "Whether your Muse can run bureaucratic filings across two institutions plus vendor outreach in one stressed session.",
      "note": "Review everything before anything is filed. Read the police report and the insurance claim yourself before Muse submits them.",
      "review_gate": true,
      "claimed_by": "@HouseHackerJon via shipwithmuse.live",
      "trust": "medium"
    },
    {
      "id": "marketplace-lowball-blitz",
      "title": "Marketplace Lowball Blitz",
      "track": "persona",
      "persona": "student",
      "group": "student",
      "difficulty": 3,
      "time": "2 hr",
      "setup": [
        "browser"
      ],
      "recipe": [
        "I want a brand-new M5 Pro MacBook Pro, 48GB RAM, 2TB. Search Facebook Marketplace within [RADIUS] of [ZIP] for every listing.",
        "Message all of them — start at $2,200 and negotiate up, but never above $2,500. Be polite, be fast, and keep a spreadsheet: seller, list price, their counter, status.",
        "The moment someone accepts $2,500 or less for a sealed/new unit, stop and tell me. Don't agree to meet anyone — I handle pickup."
      ],
      "test": "About 50 sellers are contacted — count the threads. The final price is $2,500 or less. The unit matches the exact spec. No meetup was agreed without you.",
      "proves": "Whether your Muse can run high-volume parallel negotiation with a hard price ceiling and clean bookkeeping.",
      "claimed_by": "@jingusucks via shipwithmuse.live",
      "trust": "medium-high"
    },
    {
      "id": "contractor-estimate-remote",
      "title": "Remote Contractor Estimates",
      "track": "persona",
      "persona": "parent",
      "group": "parent",
      "difficulty": 4,
      "time": "1 hr",
      "setup": [
        "phone",
        "gmail"
      ],
      "recipe": [
        "I need estimates for [JOB, e.g. fence repair]. Call these contractors [NAMES/NUMBERS]: introduce yourself as my assistant, describe the job, and ask for a ballpark and their availability this month.",
        "Email each one photos of the work area plus a written description, and ask for a written estimate in reply.",
        "Chase anyone who hasn't replied in 48 hours — one polite follow-up call. Then give me a comparison: price, timeline, and who was most responsive."
      ],
      "test": "The calls are actually placed — transcripts exist. The emails go out with the right photos attached. Follow-ups happen on schedule. The comparison covers real quotes.",
      "proves": "Whether your Muse can run a phone-plus-email vendor process you never have to attend.",
      "claimed_by": "@ZachSB via shipwithmuse.live",
      "trust": "medium"
    },
    {
      "id": "delay-compensation-claim",
      "title": "Delay Compensation Claim",
      "track": "moment",
      "moment": "airport-wait",
      "group": "airport-wait",
      "difficulty": 2,
      "time": "15 min",
      "setup": [
        "gmail",
        "browser"
      ],
      "recipe": [
        "My Delta flight [NUMBER] on [DATE] was delayed 7 hours. Claim every cent of compensation I'm owed — check Delta's policy, DOT rules, and my SkyMiles account.",
        "While you're at it: rebook me on the earliest workable alternative and confirm the new itinerary.",
        "There's a support email thread about this in my inbox — read it and reply appropriately so nothing falls through the cracks."
      ],
      "test": "The credit actually lands in the account. The rebooking is confirmed with a real confirmation code. The email reply is sent and accurate.",
      "proves": "Whether your Muse turns a travel disaster into money plus a new itinerary in minutes.",
      "claimed_by": "@cryptopunk7213 via shipwithmuse.live",
      "trust": "high"
    },
    {
      "id": "credit-dispute-blitz",
      "title": "Credit Dispute Blitz",
      "track": "persona",
      "persona": "professional",
      "group": "professional",
      "difficulty": 3,
      "time": "1 hr",
      "setup": [
        "browser"
      ],
      "recipe": [
        "Pull my credit reports from all three bureaus. List every collections account with creditor, amount, and date.",
        "For each collections account, check whether it's past the statute of limitations in my state and whether the details match my records. Flag any errors.",
        "Draft and submit disputes for the ones with errors — use the bureau's online dispute process. Log the confirmation numbers and tell me exactly what you submitted and when."
      ],
      "test": "The collections are actually removed — check the reports after. The dispute submissions have real confirmation numbers. Timestamps are documented.",
      "proves": "Whether your Muse can execute a regulated dispute process fast and cleanly.",
      "note": "Review every dispute before it's submitted. Check the confirmation numbers and exactly what was sent.",
      "review_gate": true,
      "claimed_by": "@ChrisUniverse via shipwithmuse.live",
      "trust": "high"
    },
    {
      "id": "day-of-errands-autopilot",
      "title": "Day-of Errands Autopilot",
      "track": "persona",
      "persona": "parent",
      "group": "parent",
      "difficulty": 3,
      "time": "30 min setup, runs all day",
      "setup": [
        "gmail",
        "browser"
      ],
      "recipe": [
        "Today you're running my errands. Buy me [SOCKS/SPECIFICS] on Amazon — cheapest decent option, not the cheapest garbage.",
        "Order my usual Whole Foods groceries for delivery today. You know the list — check my last two orders and repeat, minus the [ITEM] I didn't like.",
        "Book a cleaning service for [DATE] — 4.5+ stars, under $[X]. And get me a burger for dinner from somewhere good near me, arriving by 7pm.",
        "Text me a receipt for each one as it completes. If anything costs more than $[LIMIT], ask me first."
      ],
      "test": "All four errands complete with real order confirmations. The grocery list matches past orders. Nothing over the limit without approval.",
      "proves": "Whether your Muse can run a mixed shopping, services, and food day across apps with a spending governor.",
      "claimed_by": "@nicbstme via shipwithmuse.live",
      "trust": "medium"
    },
    {
      "id": "unclaimed-property-sweep",
      "title": "Unclaimed Property Sweep",
      "track": "persona",
      "persona": "professional",
      "group": "professional",
      "difficulty": 3,
      "time": "45 min",
      "setup": [
        "browser"
      ],
      "recipe": [
        "I've lived in [STATE 1], [STATE 2], [STATE 3]. Search every one of those states' unclaimed property databases for my name and any past addresses.",
        "For every hit: tell me the amount, the holder, and the claim ID. Then fill out the claim forms — I'll sign and provide ID where needed.",
        "Don't submit anything that needs my signature without showing me first. Give me a final list: total found, total claimed, what's pending on me."
      ],
      "test": "Searches run in every listed state. The hits are real — verifiable on the state sites. The forms are correctly filled. Nothing is submitted without review.",
      "proves": "Whether your Muse does exhaustive multi-site lookup plus form-filling without missing a state.",
      "note": "Review every claim form before it's submitted. Nothing needs your signature without your eyes on it first.",
      "review_gate": true,
      "claimed_by": "two builders via shipwithmuse.live",
      "trust": "medium-high"
    },
    {
      "id": "wardrobe-stylist",
      "title": "Wardrobe Stylist",
      "track": "persona",
      "persona": "professional",
      "group": "professional",
      "difficulty": 4,
      "time": "2 hr",
      "setup": [
        "browser",
        "photo-upload"
      ],
      "recipe": [
        "Learn my style. Here are my measurements [LIST], my top 20 stores [LIST], and my budget rules [RULES]. Save all of it — this is my profile now.",
        "Pick one hero piece from [STORE/CATALOG] under $[X] that anchors my wardrobe, and build 5 full looks around it using pieces I own plus new buys.",
        "Keep a 'loves' list of everything you recommend. Every new item needs a real product link, a price, and a reason it fits my profile."
      ],
      "test": "The hero piece is real, in budget, with a working link. The looks reference actual owned pieces. The profile persists across sessions.",
      "proves": "Whether your Muse can build and maintain a persistent personal profile that compounds over time.",
      "claimed_by": "@shriyanevatia via shipwithmuse.live",
      "trust": "medium"
    },
    {
      "id": "friends-feed-dashboard",
      "title": "Friends-Only Feed",
      "track": "persona",
      "persona": "grandparent",
      "group": "grandparent",
      "difficulty": 3,
      "time": "1 hr",
      "setup": [
        "browser"
      ],
      "recipe": [
        "Look through my Instagram DMs and figure out who my actual inner circle is — family and close friends I talk to most.",
        "Build me a private dashboard: just their posts and stories, newest first, nothing else. No ads, no suggested content.",
        "Keep it updated daily. If someone in the circle posts something big — a baby, a move, an engagement — flag it for me so I don't miss it."
      ],
      "test": "The circle matches real DM frequency. The feed contains only those people. Milestone flags correspond to real posts.",
      "proves": "Whether your Muse can derive a social graph from behavior and maintain a living artifact.",
      "claimed_by": "@shivambharuka via shipwithmuse.live",
      "trust": "medium"
    },
    {
      "id": "playlist-pitcher",
      "title": "Playlist Pitcher",
      "track": "persona",
      "persona": "professional",
      "group": "professional",
      "difficulty": 4,
      "time": "2 hr",
      "setup": [
        "spotify",
        "gmail"
      ],
      "recipe": [
        "My music is [GENRE/DESCRIPTION] — here's my latest track [LINK]. Research Spotify playlists that feature this genre: I want curator names, playlist sizes, and contact info.",
        "Rank the top 20 by fit. Then write a personalized cold email for each curator — reference a specific track on their playlist, keep it short, link my song.",
        "Send nothing yet — show me all 20 drafts first. After I approve, send them and track replies for a week, then report back who placed me."
      ],
      "test": "The playlists are real and genre-matched. The curator contacts are real. Placements are verifiable on Spotify.",
      "proves": "Whether your Muse can run a research-to-outreach pipeline with taste and restraint.",
      "claimed_by": "@goshfather via Threads",
      "trust": "medium-low"
    }
  ];
  if (typeof module === "object" && module.exports) module.exports = PLAYBOOKS;
  else root.MOM_PLAYBOOKS = PLAYBOOKS;
})(typeof self !== "undefined" ? self : this);
