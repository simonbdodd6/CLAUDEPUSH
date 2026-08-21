# Readiness Modification (SC6)

Source of truth: `analyseReadiness` in `progression-evidence.js` +
readiness handling in `decideProgression`. Thresholds
PROVISIONAL_REQUIRES_SNC_REVIEW. This is a training modifier, never a
medical judgement.

## Inputs

SC2 player-reported wellness entries only (sleep, fatigue, soreness,
stress, motivation, perceived readiness — 1–5 scales). Restricted health
data is NOT consumed; anything needing it stays behind the SC2 visibility
model's explicit grants.

## Anti-overreaction rules (Part 14)

| Signal | Engine behaviour |
|---|---|
| No entries | `no_data` — base prescription preserved; absence is never treated as poor readiness |
| Ordinary scores (incl. normal soreness) | `normal` — no change |
| One low entry (avg ≤ 2), latest | `one_low` — no change, reason recorded ("a single report never rewrites the programme") |
| Old low entries with recovery since | `normal` — not a trend |
| ≥3 low entries within the 5-entry window | `sustained_low` — exactly one set removed (`regress_sets`), flagged `sustained_low_readiness` |

Sustained low readiness also contributes ONE deload signal (never enough
alone — see deload-and-plateau.md).

## What readiness may do

No change · remove optional volume/one set · lower an effort target ·
maintain instead of progress · contribute a deload signal · surface a
review flag.

## What readiness must never do

Diagnose · prescribe rehabilitation · dramatically rewrite a programme
from one check-in · treat missing data as a problem. All test-enforced.
