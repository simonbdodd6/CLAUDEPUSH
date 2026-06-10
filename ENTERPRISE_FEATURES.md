# Enterprise Features

**Coach's Eye — Feature Gate Decisions**  
**Version tiering: Free → Pro → Club → Enterprise**  
**Date:** June 2026

---

## Tiering Philosophy

The feature gate exists for two reasons:
1. **Revenue:** Enterprise features justify premium pricing
2. **Trust:** Enterprise features require maturity — clubs need months of data before advanced capabilities are meaningful

A coach who has been using the platform for 3 months should not see a "Prediction Accuracy: Not enough data" message. Enterprise features unlock naturally as clubs accumulate data.

---

## Feature Gate Map

### Free Tier — Acquisition Engine

**Purpose:** Get clubs in the door. Show immediate value. No credit card required.

| Feature | Why Free |
|---------|---------|
| Season phase + prescription (current phase only) | Immediate value, requires no data |
| Morning briefing (today's priorities) | Habit-forming, daily touchpoint |
| Basic club health score (1 team, 3 dimensions) | Shows the concept; full score is Pro |
| Fixture countdown + next match | Obvious utility, low risk |
| Match pack generation (basic) | Coaches love this; drives upgrade to Pro |
| Training reminder (single send) | Must work free to demonstrate value |
| Knowledge Q&A (5 queries/month) | Discovery feature |
| Mobile app (read-only) | Access to briefing and fixtures from phone |

**Free tier converts to Pro when:**
- Coach sends their 3rd communication
- Coach wants the second team's health score
- Coach wants recommendations panel
- Club reaches 10 fixtures

---

### Pro Tier — Individual Club Operations

**Price target: €49/month per club**

| Feature | Included in Pro |
|---------|----------------|
| Season Intelligence — full (all 7 phases, all 5 predictions) | |
| Autonomous recommendations panel (full) | |
| All 8 health dimensions | |
| Communications — full template library | |
| Availability polls + response tracking | |
| AI timeline (14-day) | |
| Fixture preparation — full timeline + match pack | |
| Post-match review + season standings | |
| Push notifications | |
| Workflow execution (NL commands) | |
| Knowledge Q&A (unlimited) | |
| Action history | |
| Mobile UI (full, including command bar) | |

**Pro is the target subscription for >90% of clubs.**

---

### Club Tier — Multi-Team Clubs

**Price target: €149/month**

Designed for large clubs with 5+ teams, a committee structure, and a DoR who manages multiple coaches.

| Feature | Why Club Tier |
|---------|--------------|
| Multi-team health dashboard | Requires multiple teams' data |
| Committee approvals queue | Governance workflow — admin overhead |
| Board health report (PDF export) | Committee audience, not coaching audience |
| Season simulation (Current vs Expected vs Ideal chart) | Strategic planning tool — needs 1+ season of data |
| Multi-coach access (up to 5 users) | Team management overhead |
| Volunteer management hub | Complex scheduling for large clubs |
| Sponsor communications | Not relevant to small clubs |
| Scheduled recurring sends (weekly newsletter automation) | Requires delivery infrastructure |
| Communications analytics (open rates, churn risk) | Volume-dependent; only meaningful for large lists |

---

### Enterprise Tier — Federations & Large Clubs

**Price target: Custom / €500–2,500/month**

Enterprise customers are provincial unions, national federations, or very large clubs managing 10+ teams across multiple age groups.

| Feature | Why Enterprise | Technical Requirement |
|---------|--------------|----------------------|
| Club Digital Twin — full model | Multi-club aggregation for federation view | Multi-tenancy |
| Prediction accuracy reporting (CIS) | Requires 6+ months of outcome data | Mature data set |
| Learning Engine full access | Meta-feature for sophisticated users | Calibrated data |
| Cross-club benchmarking | Provincial averages — "Your U16 attendance vs Connacht average" | Federation data agreement |
| IRFU / provincial data integration | Official data feeds | Data sharing agreement |
| White-label / custom branding | Reseller use case | Custom deployment |
| API access | Integration with existing club management systems | Auth + rate limiting |
| Dedicated support SLA | Large-club operational dependency | Human support team |
| SSO / Active Directory | Corporate IT requirement | Auth providers |
| Custom data retention policy | GDPR enterprise requirements | Compliance infrastructure |
| Audit log | Data protection officer requirement | Event logging |

---

## Lock-In Features (Retention Drivers)

These features become more valuable over time and create switching costs. They should be included at Pro tier to drive retention, not gated to Enterprise.

| Feature | Why it drives retention |
|---------|------------------------|
| Learning Engine — Club Intelligence Score | Score grows with time. Leaving means starting over at 20/100. |
| Season Intelligence — Year-over-Year Comparison | Requires 2 full seasons of data. Switching means losing the comparison. |
| Player development history | Long-form player records across seasons. Hard to export + reconstruct elsewhere. |
| Communication history + analytics | Open rates and recipient history — coaches want to see trends. |
| Morning briefing tone | After 6 months, the briefing understands the club's rhythm. Feels personal. |

---

## Features That Should NOT Be Built

Based on the audit, several capabilities that could be imagined are out of scope for a club management platform:

| Feature | Why not build it |
|---------|-----------------|
| Video analysis | Completely different technical domain; dedicated products exist (Hudl, Sportscode) |
| GPS / wearable integration | Hardware dependency; rugby-specific data standards vary widely |
| Fantasy rugby / stat gaming | Wrong use case for club management |
| Social media publishing | Integrations with Twitter/Instagram API are fragile; not core to operations |
| Ticketing / event sales | Specialist tools exist; not our domain |
| Payroll / financial accounting | Compliance risk; specialist tools exist |
| Player marketplace / transfer portal | Completely different product |
| AI match commentary | Content creation, not operations |

---

## Competitor Differentiation

What makes Coach's Eye Enterprise different from existing platforms:

| Competitor | What they do | What we do differently |
|-----------|-------------|----------------------|
| Pitchero | Club website + basic comms | We have AI recommendations + season intelligence |
| ClubBuzz | Club admin (fees, events) | We have autonomous assistant + fixture intelligence |
| TeamApp | Communication only | We have full coaching intelligence stack |
| SportsEngine | Youth sports platform (US) | We are rugby-specific, Irish market-first |
| Hudl Assist | Video + performance stats | We are club operations + AI coaching, not video |

**Enterprise differentiator:** No competitor has a platform that gets measurably smarter over time for a specific club. The Club Intelligence Score and Learning Engine are genuinely novel.

---

## Pricing Model Recommendation

| Tier | Price | Clubs | Annual Revenue (at 100 clubs) |
|------|-------|-------|------------------------------|
| Free | €0 | — | €0 |
| Pro | €49/mo | ~60% | €35,280 |
| Club | €149/mo | ~30% | €53,640 |
| Enterprise | €800/mo avg | ~10% | €96,000 |
| **Total** | | | **€184,920/year** |

At 500 clubs (a realistic 3-year target for Irish grassroots rugby):

| Tier | Clubs | Annual |
|------|-------|--------|
| Pro 60% | 300 | €176,400 |
| Club 30% | 150 | €268,200 |
| Enterprise 10% | 50 | €480,000 |
| **Total** | **500** | **€924,600** |

**Revenue target:** €1M ARR is achievable at ~540 paying clubs. There are approximately 240 affiliated clubs in the IRFU system. Expansion to UK, Scotland, and Wales (rugby culture, similar club structures) multiplies the addressable market by 10×.

---

## Go-To-Market Sequence

1. **V1 Beta (0–3 months):** 5 hand-picked clubs, free. Goal: validate UX and data quality.
2. **V1 Launch (3–6 months):** 50 clubs, Pro tier only. Goal: product-market fit signal.
3. **V2 (6–12 months):** 150 clubs, Pro + Club tiers. Real email delivery, multi-tenancy.
4. **Enterprise (12–24 months):** Provincial union pilots, white-label. Federation as distribution channel.
5. **International (24–36 months):** UK, Scotland, Wales, France (similar grassroots structure).

---

*See PRODUCTION_ROADMAP.md for V1/V2 feature decisions.*  
*See MVP_INTEGRATION_PLAN.md for sprint plan.*
