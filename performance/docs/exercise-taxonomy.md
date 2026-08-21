# Exercise Taxonomy (SC3)

Source of truth: `performance/types/exercise.js`. All values are controlled
ids; UI labels live beside them. Extending a taxonomy is a reviewed schema
change, not a data entry.

## Categories (17)
warmup · activation · mobility · power · strength · hypertrophy · accessory ·
trunk · neck · sprint · agility · plyometric · conditioning · contact_prep ·
recovery · cooldown · testing

## Movement patterns (24)
squat · hinge · horizontal_push · vertical_push · horizontal_pull ·
vertical_pull · lunge · step · carry · rotation · anti_rotation ·
anti_extension · anti_lateral_flexion · locomotion · acceleration ·
max_velocity · deceleration · jump · land · throw · neck_flexion ·
neck_extension · neck_lateral · isometric_contact

## Physical qualities (17)
max_strength · relative_strength · hypertrophy · rfd · power · acceleration ·
max_velocity · repeat_sprint · aerobic · anaerobic · trunk_capacity ·
neck_capacity · mobility · stability · robustness · coordination ·
technical_skill

## Equipment catalogue (18)
Normalised ids aligned with the SC2 athlete equipment model — each entry
carries `athleteItem`, the athlete-profile item that satisfies it (null for
facility attributes like `partner`, `wall`, `pullup_bar`, `plyo_box`).
`equipmentGap()` maps an exercise's requirements against an athlete's SC2
access; unmapped items are reported for coach judgement, never as hard
blockers. Free-text equipment exists only as the supplementary
`equipment.notes` field on the athlete profile — never as classification.

## Prescription types (16)
sets_reps · load · percentage · rpe · rir · tempo · rest · duration ·
distance · speed_target · work_rest · hold · per_side · rounds · density ·
quality — each exercise declares which of these are valid for it; the future
engine may only prescribe within that declaration.

## Safety vocabularies
- Contraindication tags (routing signals, never diagnoses):
  acute_pain_reported, recent_concussion_protocol, unresolved_* (neck,
  shoulder, knee, back, hamstring), load_restriction_in_place.
- Precaution tags: requires_supervision, requires_spotter,
  youth_technique_first, high_fatigue_sensitivity, grass_wet_surface_care.
- Youth suitability: suitable · technique_only · not_recommended · needs_review.

## Scales
Difficulty: beginner/intermediate/advanced · Impact: low/moderate/high ·
Complexity: simple/moderate/complex · Relevance: core/high/medium/low.
