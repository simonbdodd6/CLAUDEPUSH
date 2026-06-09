# AI Timeline

**Module:** `autonomous-assistant/ai-timeline.js`  
**Version:** 1.0

---

## What It Is

The AI Timeline replaces the traditional "recent activity" view with a forward-looking, 14-day prediction window. Instead of showing what *happened*, it shows what *will happen* — and what the platform will do about it automatically.

Every event has:
- A probability score (0–100%)
- An impact level (HIGH / MEDIUM / LOW)
- A type (FIXTURE / PREDICTION / RISK / REMINDER / OPPORTUNITY / MILESTONE)
- An optional linked auto-action

---

## Event Types

| Type          | Icon | Meaning                                    | Example                                      |
|---------------|------|--------------------------------------------|----------------------------------------------|
| `FIXTURE`     | ⚽   | Scheduled match, high confidence           | "U16 Red vs Rathcoole RFC — Saturday 2pm"    |
| `PREDICTION`  | 📊   | Forecast based on current trends           | "Predicted attendance: 64%"                  |
| `RISK`        | ⚠️   | Elevated probability of a negative event   | "Double-fixture week — fatigue risk"         |
| `REMINDER`    | 📋   | Time-sensitive administrative action       | "5 memberships expire this week"             |
| `OPPORTUNITY` | ⭐   | Optional but beneficial action window      | "Above-average attendance — reinforce"       |
| `MILESTONE`   | 🏆   | Player or club achievement                 | "Player 100th session"                       |

---

## Generation Logic

### Fixture Events
Source: `fixture-engine/getUpcomingFixtures()`  
Confidence: 95% (confirmed bookings)  
Auto-actions: Generate match pack, Confirm volunteers

### Attendance Predictions
Formula:
```
predictedRate(day) = baseRate + (weeklyDelta * round(day / 7))
baseRate = obs.attendance.averageRate
weeklyDelta = declining → -4 | stable → 0 | strong → +2
```
Confidence: 72%  
Flag: `low-attendance` when predicted < 65%

### Injury Risk Window
Triggers when `injuries.total > 2`  
Description: "Modify high-contact drills this week"  
Confidence: 65%

### Double-Fixture Fatigue Window
Triggers when `fixtures.within7d.length > 1`  
Description: Rotation and recovery protocols  
Confidence: 70%

### Communication Reminders
- Newsletter due: next occurrence at 7-day cadence from last send
- Overdue overlay: fires on Day 0 if `lastNewsletterDays > 14`
- Post-match comms window: Sunday evening, Day +6 (40% higher open rates)

### Membership Expiry Reminders
- Day 0: Primary reminder (auto-sendable)
- Day +7: Follow-up for non-responders (auto-sendable)

### Volunteer Confirmations
- Generated per fixture within 7 days
- Due 2 days before kickoff (48-hour deadline)
- Not auto-executable — requires human confirmation

### Opportunities
- Positive reinforcement if attendance > 80%
- Sponsor check-in at Day +10 (fortnightly cadence)
- Digital Twin auto-refresh at Day +14

---

## Output Structure

```js
{
  generatedAt:      ISO string,
  days:             14,
  totalEvents:      number,
  automatableCount: number,
  events:           TimelineEvent[],  // sorted by date
  byDay:            [{ date, label, events[] }]
}
```

### TimelineEvent
```js
{
  id:           string,
  date:         ISO string,
  dateLabel:    'Today' | 'Tomorrow' | 'Monday, 9 Jun' | …,
  type:         FIXTURE | PREDICTION | RISK | REMINDER | OPPORTUNITY | MILESTONE,
  title:        string,
  description:  string,
  probability:  0–100,
  impact:       HIGH | MEDIUM | LOW,
  icon:         string (emoji),
  automatable:  boolean,
  autoAction?:  { label, actionId, params },
  fixtureId?:   string,
  flag?:        'low-attendance' | 'overdue' | null,
}
```

---

## Example Output (from live CLI run, 9 June 2026)

```
Tuesday, 9 Jun
  🔴 Overdue: Newsletter not sent in 18 days
  🎫 5 memberships expire this week [auto]

Today
  ⚽ U16 Red vs Rathcoole RFC — Saturday 2:00pm

Tomorrow
  ⚽ U14 Blue vs Monkstown RFC — Sunday 11:00am
  📊 Predicted attendance: 68%

Friday, 12 Jun
  🩹 Elevated injury risk window
  📩 Weekly newsletter due [auto]

Saturday, 13 Jun
  📉 Predicted attendance: 64% ⚠ low

Sunday, 14 Jun
  ⚠️ Double-fixture week — squad fatigue risk

Monday, 15 Jun
  📬 Post-match comms window [auto]

Tuesday, 16 Jun
  📊 Predicted attendance: 60% ⚠ low

Wednesday, 17 Jun
  ⭐ Sponsor check-in window

Sunday, 21 Jun
  🎫 Follow-up: Unpaid renewals [auto]
  📩 Weekly newsletter due [auto]

Monday, 23 Jun
  🔄 Digital Twin auto-refresh [auto]
```

Total: 18 events · 5 automatable

---

## Probability Calibration

| Event type              | Probability | Rationale                             |
|-------------------------|-------------|---------------------------------------|
| Confirmed fixture       | 95%         | Booked and confirmed in fixture engine|
| Newsletter due          | 100%        | Calendar-based, certain               |
| Membership expiry       | 100%        | Known expiry date                     |
| Attendance prediction   | 72%         | Linear trend model, moderate accuracy |
| Injury risk window      | 65%         | Based on current load, not confirmed  |
| Fatigue risk            | 70%         | Fixture density, not player data      |
| Sponsor opportunity     | 60%         | Heuristic cadence                     |

Probabilities are displayed to coaches to build appropriate trust in predictions.

---

## Future Enhancements

1. **Weather API integration** — Replace placeholder with Met Éireann real-time forecasts
2. **ML attendance model** — Replace linear trend with LSTM trained on 12+ months of history
3. **Referee arrival warnings** — Parse referee confirmation emails for late notifications
4. **Injury recurrence risk** — Flag players returning from injury for modified training
5. **Opponent intelligence** — Surface known opposition patterns from Knowledge Engine
