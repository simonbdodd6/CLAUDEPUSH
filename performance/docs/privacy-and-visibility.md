# Privacy & Visibility (SC2)

Source of truth: `performance/domain/visibility.js`. These are **product-level
boundaries**, not legal claims. Levels: `none` / `summary` / `full`.

## Ownership

Every profile category is owned by the **player** except coach-entered
restrictions (owned by staff, visible to the player by default as a summary).

## Default matrix (before any grants)

| Category | player (self) | team_coach* | snc_coach* | medical | club_admin | parent | system_admin† |
|---|---|---|---|---|---|---|---|
| identity | full | summary | summary | summary | summary | none | full |
| rugby | full | full | full | summary | summary | none | full |
| body | full | none | full | none | none | none | full |
| training | full | summary | full | none | none | none | full |
| strength | full | summary | full | none | none | none | full |
| equipment | full | summary | full | none | none | none | full |
| schedule | full | full | full | none | none | none | full |
| goals | full | summary | full | none | none | none | full |
| wellness | full | **none** | summary | none | **none** | none | full |
| pain | full | **none** | summary | none | **none** | none | full |
| health | full | **none** | **none — grant only** | **none — grant only** | **none** | none | full |
| coach_restrictions | summary | full | full | summary | none | none | full |
| sharing | full | none | none | none | none | none | full |

\* Coach roles see anything only for **assigned** athletes.
† `system_admin` is an operational role; its access is flagged for audit and
is not a product surface.

## Rules

1. Players always see their own data in full.
2. Club admins **never** automatically see restricted health data (or
   wellness/pain).
3. Rugby (team) coaches never automatically see wellness, pain or health.
4. S&C coaches see performance-relevant data for assigned athletes; wellness
   and pain only as summaries; restricted health **only via explicit grant**.
5. Medical staff see nothing until explicitly authorised by a grant.
6. Parent/guardian access is configurable and off by default.
7. Grants only widen access, never narrow defaults; they are revocable
   (revocation annotates, never deletes history).
8. Every consent and grant change appends to `sharing.audit` (capped at 100).
9. Consent is plain-language (privacy step), recorded with version + actor,
   and withdrawable from the same place.

## Role seam

Today's CoachEasier only knows `coach`/`player`; `mapCoachEasierRole()` maps
coach → `snc_coach`, player → `player`. Team-coach, medical, admin and parent
roles activate when the identity system carries them; until then their access
exists only through explicit grants.

## Deferred

- Server-side enforcement (SC2 is a client prototype behind the Pro gate).
- Guardian account linking and age-based consent flows.
- Per-field (rather than per-category) grants.
