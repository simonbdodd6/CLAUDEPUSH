# Load & Intensity (SC6)

Source of truth: `performance/domain/load-model.js` and
`resolveBaselinePrescription` in `progression-rules.js`.
All tables PROVISIONAL_REQUIRES_SNC_REVIEW.

## Typed loads (Part 3)

Every load is `{type, value, of?}` with type from `LOAD_TYPES`: kg, lb,
percentage (must carry its reference in `of`, never resolved silently),
bodyweight, bodyweight_plus_kg, assistance_kg, machine_stack, band_level,
unknown. A bare 60 never silently means kilograms. Plate calculation is a
future consumer of these types — no workout UI exists in SC6.

**Implement convention:** hand-held loads store the PER-IMPLEMENT value
(the number on the bell) with `{per: 'implement', implements: n}`
metadata; "two 20 kg dumbbells" is `{value: 20, implements: 2}` and
`totalExternalLoad()` derives 40 kg. Progression bounds and equipment
increments apply to the per-implement value the athlete actually changes
(a 20→22 kg pair move is a 2 kg per-hand step), and SC7 UI/logging can
display the natural gym value from the same data. Test-enforced.

## Baseline resolution (Part 4)

SC5's categorical dose becomes bounded structure: sets by volume category
(very_low 2 → high 4, accessories −1), rep range + RPE target by intensity
category (technique 6–8 @5 → high 3–6 @8), durations for hold-based work.
Youth ceilings bind last (≤3 sets, RPE ≤7, technique intensity for
new/beginner). Loads are NOT part of the baseline mapping — load
resolution is separate and evidence-based.

## Initial load without 1RM (Part 5)

A true 1RM is never required and never requested. `resolveInitialLoad`
ranks the available evidence (recent completed set > coach-entered load >
athlete-reported > historical session > estimated 1RM > submaximal test >
training history) and returns:

- **known_load** (high/medium confidence) — the evidenced load;
- **e1rm_percentage** — a percentage load carrying its formula reference,
  flagged `load_confidence_low`;
- **effort_based** — RPE/RIR targets when only weak history exists;
- **manual_required** — coach/athlete selects; flagged.

The engine NEVER fabricates a kilogram number (test-enforced: weak or no
evidence yields `load: null`).

## Estimated 1RM (Part 6)

Deterministic Epley (`e1RM = load × (1 + reps/30)`), formula id
`epley_v1` recorded on every estimate with its inputs. Valid for 1–10
reps; >10 rejected. Confidence: medium (≤5 reps) or low — never high, and
the result is always `source: 'estimated'`, never presented as a tested
max. Coaches can override via `manual_next_target`/`coach_entered_working
_load`. Formula policy is provisional pending S&C review.
