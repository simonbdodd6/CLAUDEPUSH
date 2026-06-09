# Lead Personalisation Agent — Build Report

**Branch:** feature/nightly-qa-agent  
**Date:** 2026-06-09  
**Status:** Complete and operational

---

## What Was Built

A pipeline that connects Market Intelligence lead data with Rugby Coaching Assistant knowledge to generate personalised club profiles and outreach drafts. Nothing is sent automatically — all output requires human review.

---

## Files Created

```
qa/lead-personalisation/
  select-leads.js        ← Filter + rank leads from market DB; demo mode for empty DB
  club-profile.js        ← Country/level/size-aware club profile builder
  coaching-preview.js    ← 60-min session + coaching insight from rugby knowledge base
  outreach-draft.js      ← Short email, long email, LinkedIn draft generator
  generate-report.js     ← Writes 3 Markdown reports
  lead-personalisation.js ← CLI orchestrator + Mission Control summary JSON
  data/
    personalisation-summary.json  ← Mission Control feed (auto-generated)

LEAD_PERSONALISATION_REPORT.md      (generated)
TOP_10_CLUB_PREVIEWS.md             (generated)
PERSONALISED_OUTREACH_DRAFTS.md     (generated)
LEAD_PERSONALISATION_AGENT_REPORT.md (this file)
qa/market-input/csv/sample-clubs.csv (seed data template)
```

**Updated files:**
```
api/mission-control.js      ← collectLeadPersonalisation(), ?action=lead-personalise
mission-control/index.html  ← #lpPanel + .lp-toggle button
mission-control/app.js      ← renderLpPanel(), loadLpData(), open/close/refresh
mission-control/styles.css  ← .lp-toggle, #lpPanel, .lp-lead-row, .lp-score-*
package.json                ← lead:personalise, lead:personalise:demo scripts
```

---

## How It Connects the Agents

```
Market Intelligence Agent
  qa/market-data/leads.json          ← source of truth for lead scores and contact info
           ↓
  select-leads.js                    ← filter: score ≥7.5, has contact, status new/reviewed
           ↓
  club-profile.js                    ← enrich with country context, pain points, CE value props
           ↓
Rugby Intelligence Agent
  qa/rugby-knowledge/knowledge.jsonl ← context for personalisation
           ↓
Rugby Coaching Assistant
  qa/rugby-assistant/query.js        ← retrieve relevant coaching items per club's age groups
           ↓
  coaching-preview.js                ← generate 60-min session idea + coaching insight
           ↓
  outreach-draft.js                  ← generate personalised drafts (Claude or template)
           ↓
  generate-report.js                 ← write 3 Markdown reports
           ↓
  Mission Control panel              ← live stats on personalised leads + ARR pipeline
```

---

## Commands

```bash
npm run lead:personalise           # Run against real lead database (or auto-demo if empty)
npm run lead:personalise:demo      # Always use synthetic demo leads
node qa/lead-personalisation/lead-personalisation.js --threshold=8.0 --limit=5
node qa/lead-personalisation/lead-personalisation.js --dry-run  # Preview without writing
```

---

## Sample Personalised Club Preview

**Club:** Kildare Valley RFC (Ireland) · Fit Score: 9.2 · Expected ARR: €252

**Club Context:**
Strong community club culture with Leinster/Munster/Connacht/Ulster provincial affiliation.
Running U8 through Senior across 280 registered players.

**Top Pain Points:**
1. Managing player availability across 10+ age groups via fragmented WhatsApp threads
2. IRFU registration and player welfare compliance across mini, youth, and senior squads
3. Parent communication for youth squads — coaches share personal phone numbers

**Messaging Problem (specific to this club):**
With 280 players across 6 age groups, Kildare Valley RFC is running at least 9 separate WhatsApp or message threads. Parents, players, and coaches all receive different messages, and availability confirmations get buried in chat history.

**Session Idea — U16 defensive line speed (60 min):**

| Phase | Activity |
|---|---|
| Warm-up | Tag game with ball (10 min) — maximise touches per player |
| Main activity | Defensive line speed — technique at half speed, then add opposition (25 min) |
| Game | Conditioned match applying session skill. Bonus point for correct execution (20 min) |

**Key coaching point:** Train line speed as a team habit — count seconds from set piece to defensive organisation.

**Coaching Insight from Knowledge Base:**
Defensive line speed is the single biggest predictor of turnover rate at amateur level. Teams that arrive at the tackle from an organised line create far more pressure than faster-rushing individuals.

**Why Coach's Eye Fits:**
Replace the WhatsApp chaos. One app for all squads — from U8 minis to senior men and women.

---

## Sample Outreach Draft

**Subject lines:**
1. A coaching idea for Kildare Valley RFC's U16s
2. Kildare Valley — one thing worth trying this season
3. Quick thought on defensive line speed for Kildare Valley

**Short email (< 100 words):**
```
Hi [Name],

I came across Kildare Valley RFC — impressive setup running U8–Senior across the season.

Quick question: are your coaches still coordinating 280 players through group chats? Most clubs in Ireland are.

Coach's Eye gives Kildare Valley's coaches one app for squad management and player communication — without the WhatsApp admin overhead.

Worth a 15-minute call? Happy to share a U16 defensive line speed session plan as a starting point.

[Your name]
```

**Long email (150–200 words):**
```
Hi [Name],

I was looking at what Kildare Valley RFC is doing with your U8–Senior programme — genuinely impressive for a community club.

One thing I've noticed coaching clubs like yours in Ireland: the biggest time drain isn't the training itself, it's the admin around it. Managing player availability across 10+ age groups via fragmented WhatsApp threads.

I built Coach's Eye to solve exactly that. It gives coaches a single app for player availability, squad communication, and session planning — without the WhatsApp chaos.

I've put together a U16 defensive line speed session plan I'd love to share with you. Key coaching point: train line speed as a team habit — count the seconds from set piece to defensive organisation.

The session took about 3 minutes to generate. The kind of thing your coaches could use tomorrow.

If you're open to it, I'd love to show Kildare Valley's Club Secretary or Head Coach how it works — 15 minutes, no pressure. I think it'd be genuinely useful.

Best,
[Your name]
Coach's Eye
```

> ⚠️ DRAFT ONLY — requires human review, name substitution, and personalisation before sending.

---

## Mission Control Panel

The **Leads** toggle (bottom bar, third button) opens the Personalised Leads panel showing:
- Total personalised leads + estimated ARR
- Top 5 clubs with fit score, expected ARR, and recommended next action
- Countries covered
- Draft status (how many require review)
- Most urgent next outreach action

**API endpoint:** `GET /api/mission-control?action=lead-personalise`

---

## Risks and Limitations

### Data quality
- **Fit scores are synthetic** in demo mode — real scores require CSV import and scoring via `npm run market:score`
- **Club profiles are inferred** from country + size — not scraped or researched
- **Contact details** in demo leads are fictional — real email addresses must come from the CSV importer

### Outreach quality
- **Template mode** (no Claude API key) produces generic-but-correct drafts. They need significant personalisation before sending.
- **Claude mode** produces better copy but still requires human review for accuracy and tone
- **No real club knowledge** — the agent knows only what's in the knowledge base. Pain points are country-archetype based, not specific to each club

### Ethics / compliance
- These are drafts for research, not spam automation
- All outreach must comply with GDPR / applicable privacy law (especially for EU clubs in France, Spain)
- Cold email requires a legitimate interest basis — consult legal before any real send

---

## Recommended Phase 2

### Immediate improvements
1. **Import real leads** — Add your club CSV to `qa/market-input/csv/` and run `npm run market:import` + `npm run market:score`
2. **Set Claude API key** — `export ANTHROPIC_API_KEY=sk-...` then re-run for higher-quality personalisation
3. **Review + approve drafts** — Read PERSONALISED_OUTREACH_DRAFTS.md, add your name and personalise before any send

### Medium term
4. **CRM-style status tracking** — Update lead status in leads.json after each outreach (contacted, responded, demo_booked). Mission Control will reflect this.
5. **Club website parser** — For leads with a website, extract the club's age groups and recent news to inform personalisation with real data (not inferred data).
6. **Response templates** — When a club responds positively, generate a demo follow-up using the coaching knowledge base.
7. **A/B draft testing** — Track which subject lines and email styles get the best response rates across clubs.

### Future
8. **In-app warm introduction** — If Coach's Eye already has a user at a club in the same league, use that as a warm intro signal rather than cold outreach.
9. **Automated pipeline monitoring** — Run `lead:personalise` nightly. When new high-fit leads appear (from discovery pipeline), auto-generate previews and notify via Mission Control.
10. **Personalised demo environment** — When a club books a demo, pre-populate their Coach's Eye demo environment with their likely age groups, players, and a session plan using this pipeline's output.

---

*Built on feature/nightly-qa-agent — no production app code modified. No emails sent.*
