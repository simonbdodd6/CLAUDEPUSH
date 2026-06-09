# Coach Decision Support

**Module:** `autonomous-assistant/decision-support.js`  
**Version:** 1.0

---

## Purpose

The Decision Support layer answers the most important question in autonomous AI:

> **"Is this something the AI should do, or something the coach must do?"**

It classifies every recommendation into one of three tiers — AUTO, APPROVE, or HUMAN — and ensures that the platform never takes unilateral action on decisions that involve player welfare, safety, or significant financial risk.

---

## The Three-Tier Model

### TIER 1 — AUTO
*"The platform will handle this."*

**Criteria:**
- Confidence ≥ 75%
- Impact ≠ HIGH
- Type not in HUMAN_TYPES list
- Urgency ≠ CRITICAL

**Examples:**
- Send membership renewal reminders (confidence 75%, impact MEDIUM)
- Generate weekly newsletter (confidence 72%, impact MEDIUM)
- Schedule Digital Twin refresh (confidence 100%, impact LOW)
- Send weather alert to players (confidence 55%, impact LOW)

**Behaviour:** The assistant calls the Action Library directly. Result is logged. Coach sees a "handled" note in next briefing.

---

### TIER 2 — APPROVE
*"One tap from you, and I'll do it."*

**Criteria:**
- Confidence 50–75%, OR
- Urgency = HIGH (needs acknowledgement even if automatable)

**Examples:**
- Contact volunteers for Saturday match (high urgency, needs confirmation)
- Remind committee about pending approvals (impact MEDIUM, wants sign-off)
- Broadcast volunteer appeal via newsletter (touches external comms)

**Behaviour:** Surfaces in the Decision Queue. Single button tap approves and executes. The coach sees the full recommendation before approving.

---

### TIER 3 — HUMAN
*"This one's yours."*

**Criteria:**
- Urgency = CRITICAL (squad selection crisis, match-day forfeits)
- Confidence < 50% (data too uncertain to act)
- Type in HUMAN_TYPES

**HUMAN_TYPES (never auto-executed):**

| Type                   | Why it's always HUMAN                                                    |
|------------------------|--------------------------------------------------------------------------|
| `INJURY_POSITION_CRISIS`| Squad selection is a coaching decision. Platform cannot pick the team.   |
| `PLAYER_OVERLOAD`      | Safeguarding decision. Coach must personally review and record.          |
| `SAFEGUARDING`         | Legal/welfare matter. No automation permissible.                          |
| `FINANCIAL_DECISION`   | Financial authority rests with the committee, not the platform.          |

**Behaviour:** Surfaces in the briefing with clear urgency signal. Platform provides all supporting data and suggested options. The coach makes the call.

---

## Decision Queue

The queue prioritises APPROVE items by rank score:

```js
getDecisionQueue(recommendations)
→ [{
    id, type, title, urgency, confidence,
    primaryAction: { label, actionId, params },
    timeSaved
  }]
```

This feeds the "Needs Your Approval" section in the Mobile app and Command Centre.

---

## Automation Report

```js
getAutomationReport(recommendations)
→ {
    total:        8,
    autoCount:    3,          // platform handles automatically
    approveCount: 3,          // one-tap approve
    humanCount:   2,          // coach must decide
    autoPercent:  37.5%,
    minutesSaved: 95,         // across auto + half of approve
    breakdown: { auto[], approve[], human[] }
  }
```

---

## Coach Briefing

`generateCoachBriefing()` produces a structured morning summary:

```
🔴 CRITICAL: 3 volunteer roles unfilled — MATCH THIS WEEKEND
⚽ Next match: Rathcoole RFC in 1 day
📊 8 recommendations — 0 automated, 4 need approval, 4 need judgement
⚡ Top priority: 4 approval items (2 overdue)
📅 Today: U16 Red vs Rathcoole RFC
⏱ Automating 3 tasks will save ~55 minutes today
```

The briefing is designed to be readable in under 30 seconds.

---

## Trust Calibration Principles

The system is tuned conservatively for v1. **When in doubt, HUMAN wins.**

| Scenario                        | Tier    | Rationale                                |
|---------------------------------|---------|------------------------------------------|
| Membership renewal (confidence 75%)| AUTO | Benign, reversible, saves significant time |
| Newsletter auto-send (confidence 72%)| AUTO | Standard club comms, pre-approved content |
| Volunteer contact (confidence 60%)  | APPROVE | External contact — coach confirms first |
| Squad selection advice (any confidence)| HUMAN | Coaching decision — never delegated     |
| Injury management (any confidence)  | HUMAN | Welfare decision — never delegated      |
| Financial approval (any confidence) | HUMAN | Financial authority — never delegated   |

---

## Expanding AUTO Trust Over Time

The confidence thresholds can be tuned per club in a future `assistant-config.js`:

```js
export const TRUST_CONFIG = {
  autoThreshold:    75,    // raise to 85 for conservative clubs
  approveThreshold: 50,
  autoTypes:        new Set(['MEMBERSHIP_EXPIRY', 'COMMUNICATION_GAP', 'WEATHER_RISK']),
};
```

As the platform accumulates feedback (accepted recommendations, coach overrides), confidence calibration improves. The system earns autonomy incrementally.

---

## Audit Trail

Every auto-executed action is recorded in the JSONL state store with:
- `recId`, `recType`, `actionId`, `params`, `executedAt`, `result`

Coaches can review what the platform did and when. Any action can be reversed by running the inverse via the Action Library.

---

## Integration with Mobile Command Layer

The Decision Queue maps directly to the Mobile app's **Actions** tab and the **Alert** badge count:

```
HUMAN recs + CRITICAL APPROVE recs → Alert badge (red)
APPROVE recs                        → Actions tab Decision Queue
AUTO recs                           → "Handled" section in Today view
```

The coach's morning flow:
1. Open app → Home shows briefing headline
2. Today tab → full briefing, handled items listed
3. Actions tab → Decision Queue (APPROVE items, one-tap)
4. Alerts tab → HUMAN items (each with full data and options)
