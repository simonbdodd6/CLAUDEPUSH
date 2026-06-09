# Club Intelligence Engine — Architecture & Test Report

*Generated: 2026-06-09*

---

## What Is This?

The **Club Intelligence Engine** is the highest-level AI engine in Coach's Eye.
It aggregates data from every other engine into a living club overview, answering
Director of Rugby level questions about players, teams, coaches, attendance,
injuries, retention, and strategic opportunities.

This is the engine the DoR brief will be generated from. Every recommendation
cites specific players, teams, or coaches with evidence.

---

## Architecture

```
qa/club-intelligence/
├── index.js                    ← Public API
├── club-profile.js             ← Living club snapshot (aggregates all engines)
├── club-health.js              ← 7-dimension health scoring (0-100)
├── club-insights.js            ← Pattern detection + Q&A engine
├── club-recommendations.js     ← Priority-ordered DoR recommendations
├── club-dashboard.js           ← Director of Rugby dashboard (Markdown + JSON)
└── generate-club-report.js     ← Full pipeline runner

ai-copilot/engines/
└── club-intelligence-adapter.js ← Copilot plugin (auto-registered)
```

### Data Flow

```
Memory Engine ──────────────────────────┐
Player Development Engine ──────────────┤
                                        ▼
                               club-profile.js
                               (living snapshot)
                                        │
                            ┌───────────┴──────────┐
                            ▼                      ▼
                    club-health.js          club-insights.js
                    (health score)          (pattern detection)
                            │                      │
                            └───────────┬──────────┘
                                        ▼
                              club-recommendations.js
                              (DoR priorities)
                                        │
                                        ▼
                               club-dashboard.js
                               (DoR Markdown brief)
```

### Future Engine Hooks (stubs in place)

| Engine | Hook Location | Data Added |
|--------|--------------|------------|
| Fixture Engine | club-profile.js `loadStubFixtures()` | Match schedule, results, win rate |
| Finance Engine | club-profile.js `loadStubFinance()` | Membership, sponsorship, merch |
| Volunteer Engine | club-profile.js `loadStubVolunteers()` | Volunteer activity, hours |
| Communication Engine | club-profile.js `loadStubCommunication()` | Push/email engagement |

---

## Health Score Dimensions

| Dimension | Weight | Scoring Logic |
|-----------|--------|---------------|
| Player Development | 20% | Avg dev score + trend adjustment |
| Attendance | 18% | Club avg attendance % → direct score |
| Injury Management | 18% | 90 - (active × 8) - (high-risk × 5) |
| Programme Activity | 15% | Active programme coverage % |
| Coach Activity | 12% | AI tool adoption + support flags |
| Membership & Retention | 10% | Retention risk distribution |
| Data Completeness | 7% | Connected data domains / total domains |

---

## Insight Categories

| Category | Examples |
|----------|---------|
| `risk` | Active injuries, retention risk, small age groups |
| `performance` | Fastest/slowest progressing teams |
| `opportunity` | AI under-utilisation, injury-free training window |
| `operational` | Programming gaps, age group imbalances |
| `people` | Coach support needs, volunteer gaps |

---

## Q&A Engine

Every question maps to structured evidence with related insights:

### "Which teams are progressing fastest?"

Insufficient team data



### "Which players are at injury risk?"

No players at elevated injury risk



### "Which coaches need support?"

1 coach(es) need support: Seán Doyle (score: 9)

**Evidence:** 1 player(s) with declining development · 1 player(s) with low attendance (<70%) · 1 player(s) without active programme

### "Which age groups are growing?"

Age groups by size: U18: 1 player

**Evidence:** U18: 1 players, avg dev 71/100

### "Which players are likely to leave?"

No players at high retention risk



### "What should the Director of Rugby focus on this week?"

Top priorities: 1 coach(es) flagged as needing support | 1 age group(s) may be too small for fixtures | Injury-free window — maximise training intensity now

**Evidence:** Seán Doyle: 1 player(s) with declining development · 1 player(s) with low attendance (<70%) · 1 play · Rugby requires 15 players (or min 7 for tag/mini formats). Small squads risk forfeiting fixtures. · Training adaptations compound fastest when all players are available and training consistently.

### "What are the biggest risks across the club?"

No players at elevated injury risk



### "What are the biggest opportunities?"

Top opportunities: Injury-free window — maximise training intensity now

**Evidence:** No active injuries across the club. This is an optimal window for progressive overload.



---

## AI Copilot Integration

The Club Intelligence Engine registers with the Copilot at priority **95**
(above Player Development at 85, below Memory Engine at 100).

It handles: `squad_analysis`, `weekly_plan`, `injury_risk`, `player_progress`, `session_summary`

When a coach asks "What are the biggest risks across the club?" or
"What should I focus on this week?" — the Club Intelligence Engine fires first,
returning a full DoR brief with evidence from every engine.

---

## Live Test Results (2026-06-09)

### Club Profile
- Club: **Kildare Valley RFC**
- Players: **1**
- Teams: **3**
- Coaches: **1**
- Average Development Score: **71/100**
- Average Attendance: **67%**
- Active Injuries: **0**
- Build Time: **436ms**

### Health Score
- Overall: **52/100 (F)** — stable
- Critical flags: 0
- Warnings: 3

| Dimension | Score | Grade |
|-----------|-------|-------|
| Player Development | 68/100 | C |
| Attendance | 67/100 | C |
| Injury Management | 90/100 | A+ |
| Programme Activity | 0/100 | F |
| Coach Activity | 0/100 | F |
| Membership & Retention | 70/100 | C+ |
| Data Completeness | 50/100 | F |

### Insights Generated
3 insights: 0 critical · 1 high · 1 medium · 1 low

**[HIGH] 1 coach(es) flagged as needing support**
> Seán Doyle has player populations showing signs of stress.
> *Why: Seán Doyle: 1 player(s) with declining development · 1 player(s) with low attendance (<70%) · 1 player(s) without active programme · No AI tools used *

**[MEDIUM] 1 age group(s) may be too small for fixtures**
> U18 has fewer than 8 registered players.
> *Why: Rugby requires 15 players (or min 7 for tag/mini formats). Small squads risk forfeiting fixtures.*

**[LOW] Injury-free window — maximise training intensity now**
> No active injuries across the club. This is an optimal window for progressive overload.
> *Why: Training adaptations compound fastest when all players are available and training consistently.*



### This Week's Priorities
1. **[HIGH] Coach Development** — Schedule 1:1 development conversations with Seán Doyle
2. **[MEDIUM] Attendance** — Set individual attendance targets for 0 player(s) below 75%
3. **[MEDIUM] Player Programming** — Generate training programmes for 1 player(s) currently without one

---

## Future Integrations

1. **Match Intelligence** — connect Fixture Engine for win/loss trends, player performance ratings from matches
2. **Financial Intelligence** — membership growth curves, sponsorship pipeline, merchandise sales correlation with team performance
3. **Volunteer Intelligence** — most active volunteers, burnout risk, succession planning
4. **Communication Intelligence** — push notification open rates by age group, optimal send times, churn prediction from communication patterns
5. **Predictive DoR Briefing** — auto-generate and send weekly DoR brief every Monday morning via cron job
6. **Club Benchmarking** — compare club health to provincial/national averages (requires external data partnership)

---

*Report generated by Coach's Eye Club Intelligence Engine*
