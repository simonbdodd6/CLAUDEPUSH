# Match Centre V2 — Product Design Proposal

> Status: **PROPOSAL ONLY** (no implementation). Recorded 2026-06-29 after a full
> QA pass of the current Match Centre (build `ffe4f65`) found no genuine bugs.
> Core stays AI-free; any "intelligence" belongs in the optional Brain layer.

## Thesis
Today's Match Centre is a solid drag-a-name-onto-a-pitch editor. The best rugby
team-selection tool isn't a prettier pitch — it's one that **thinks in rugby** and
**runs the coach's match week**: who's available → pick a legal, balanced 23 →
brief the players → manage the game. V2 makes the right selection obvious and the
wrong one hard, without taking the decision away from the coach.

## 1. Workflow redesign — match week as a light left-to-right spine
Availability → Selection → Bench & cover → Brief → Matchday (tabs, freely
navigable). Start on "who can play this fixture" (from the existing Weekly
Availability data), not a blank pitch.

## 2. Screen architecture
One screen, modes (not many pages). Pitch is hero in Selection mode; shrinks to a
summary in Brief/Matchday. Availability becomes a first-class panel.

## 3. Layout (Selection mode)
- Left ~65%: the pitch (keep — spatial mental model + emotional core).
- Right ~35%: "Available squad" **grouped by unit** (front row / second row /
  back row / half-backs / centres / back three) with availability status chips.
- Under pitch: Bench (23) with cover indicators; collapsed Substitute plan.
- Top: fixture header + "Selected 15/15 · Bench 8/8 · Available 18" + one
  legality/readiness pill (green when the 23 is valid).
- Empty slots invite action (dashed jersey + position + "tap to pick"); optional
  coach-initiated, deterministic "Auto-arrange available by position" helper
  (not AI; fully editable).

## 4. Coach-interaction improvements (rule-based, Core-safe)
- Positional fit at a glance (natural position vs where placed) — awareness, not blocking.
- **Front-row & bench cover legality** (uncontested-scrum risk) — a real rugby differentiator, pure rules.
- Unit completeness ticks (front row 3/3, back row 3/3).
- Availability-aware selection (dim "Out"; "show only Available").
- Faster placement: keep click-to-pick + drag; add **tap-a-player-then-tap-a-slot**
  (mobile) and long-press to swap. Keep readonly plates (autofill fix).
- Per-player quick-menu (Move to bench, Swap, Captain, Remove, View profile).
- Captain / goal-kicker / lineout-caller chips that publish to players.

## 5. Premium UX
- Professional shareable **team-sheet graphic** (not a raw screenshot).
- Pre-publish confidence summary ("23 selected · front-row cover ✓ · 2 Maybe").
- Mobile-first selection (tap-to-assign, unit-grouped pool, bottom-sheet picker).
- Saved/previous lineups ("start from last week", named templates).
- Calm motion (jersey settle, gentle unit highlight).

## 6. STAY (works — don't rebuild)
Green pitch + jersey markers; click-to-pick + drag; readonly name plates; ID-based
single-placement + dedup; explicit-only slots / no auto-pick; data model
(`formationNames` / `benchPlayers` / `subPlan` / `matchCentre`) + Publish/Save/Export.

## 7. CHANGE
Flat pool → unit-grouped, availability-aware. KPIs → selection progress + legality
pill. Add rule-based rugby awareness (front-row cover, fit, unit completeness).
Add tap-to-assign + per-player quick-menu. Top becomes the match-week spine.
Mobile long-name handling (no hover) via quick-menu/profile.

## 8. DO NOT TOUCH YET
Weekly Availability scheduler (complete/verified). Core/Intelligence boundary — no
AI auto-selection in Core; a "suggested XV" is a future Brain (premium) capability
that reads the squad but never owns the decision. Notifications/messaging/auth/
storage internals. A full visual restyle (V2 is workflow + interaction first).

## Recommended phasing
1. Availability-aware, unit-grouped pool + selection-progress/legality pill.
2. Front-row cover + unit completeness (rules only).
3. Tap-to-assign + per-player quick-menu (mobile-first).
4. Professional team-sheet export + pre-publish summary.
5. Saved lineups / "start from last week".
