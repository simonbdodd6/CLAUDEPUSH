# Match-Week Rules (SC5)

Source of truth: `MATCH_WEEK_RULES` + `decideMatchWeekPlacement` in
`performance/domain/coaching-rules.js`.
Status: **PROVISIONAL_REQUIRES_SNC_REVIEW**.

## What SC5 provides

Deterministic placement CONSTRAINTS per match-day offset — the coaching
rules a later scheduling engine (SC6+) consumes. SC5 does not schedule
sessions; it says what belongs and what must be avoided on each day
relative to the match.

Work classes: heavy_lower, heavy_upper, power, high_speed_running,
high_volume_accessory, conditioning_high, conditioning_low, mobility,
primer, neck_contact_prep.

## The table

| Offset | Avoid | Prefer | Rationale |
|---|---|---|---|
| MD-5 | — | heavy lower, power, high-volume accessory, high conditioning | furthest from the match — hardest development work |
| MD-4 | — | heavy lower/upper, high conditioning | still far enough out |
| MD-3 | high conditioning | heavy lower/upper, power | last heavy strength day |
| MD-2 | heavy lower, high conditioning, high-volume accessory | heavy upper, power, short high-speed work | lower-body fatigue must clear |
| MD-1 | everything fatiguing (heavy lifts, high speed, conditioning, volume) | primer, mobility | nothing that leaves fatigue |
| MD | all training classes | primer | optional short primer at most |
| MD+1 | heavy lower, high speed, high conditioning, power | mobility, low conditioning | movement and easy circulation only |

`decideMatchWeekPlacement({matchDay})` maps a concrete match day onto the
week (e.g. Sat match → Fri = MD-1, Mon = MD-5, Sun = MD+1), returning each
day's constraints plus a deterministic reason. Multiple matches per week are
handled upstream: `decideFrequency` caps S&C at 1 when `matchCount ≥ 2`.

## Interaction with frequency

Rugby congestion caps total structured days (adult ≤ 5, youth ≤ 4 including
rugby + match); frequency never exceeds availability; a week whose only
available days all collide with rugby raises `conflicting_schedule`.

## SC6 boundary

The scheduling engine will place the blueprint's sessions onto concrete
days using these constraints (e.g. heavy-lower session → MD-3 or earlier;
primer archetype allowed MD-1/MD). SC5's table is the contract; SC6 must
not soften an `avoid` without surfacing a coach-visible flag.
