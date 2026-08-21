# Performance ↔ Core integration (INT2)

What the integrated slice actually does today, and — more importantly — what
it deliberately does **not** do. Written against Core `acc56f88`.

## Role mapping

Core's real roles, not aspirational ones.

| Performance role | Core reality | Limitation |
|---|---|---|
| **Athlete** | `role: 'player'`, one `playerGroupId`, own player shell | Sees only their own profile, workouts, library and preferences. `getPlayer()` has no roster fallback, and the player shell exposes no coach surface. |
| **Team coach** | `role: 'coach'` + `staffLevel` + `accessProfile` + `accessScope` | Reaches the Performance section with `publish_training`, within their existing operational scope. No athlete roster is wired (see below). |
| **S&C coach** | canonical role `snc` EXISTS in `api/_permissions.js` but is **unreachable** — not in invite `VALID_ROLES`, no client UI, no `ROLE_DEFAULT_PROFILE` entry | **Not activated.** S&C staff are onboarded as coaches. Activating a half-built server role across invite/session/`isStaffMember` was out of scope and would have been a silent half-measure. |
| **Medical staff** | `role: 'medical'` and/or additive `member.medicalAccess`, group-filtered server-side | Performance **does not widen** medical access. It surfaces no clinical data: pain-stop produces a non-medical review flag, nothing more. |
| **Club admin** | `role: 'admin'` → club-wide scope | Gains no detailed Performance health data. Note a pre-existing Core behaviour: an unprofiled legacy admin/head coach still inherits `medical_access` by role — Performance neither uses nor extends that. |
| **Parent / guardian** | **Does not exist** as an account relationship. A permissionless `parent` enum and inert `parentGuardianName/Email` fields are all that is there | Not implemented. There is no third `activeView`, no parent login and no child-scoped resolution. Nothing in Performance pretends otherwise. |

## Entitlement

`performance` is a registered premium feature (`minimumPlan: 'pro'`) gated by
`canUseFeature('performance')` — Core's single chokepoint. There is no
`isPro` shortcut, and the capability architecture still supports later
individual / team / club / trial / promotional entitlement by extending that
one function plus the session payload. No checkout exists.

While `BETA_HIDE_COMMERCIAL` is true, an unentitled club is not offered the
section in navigation (there is no upgrade destination to send them to), but
**route-level gating is unchanged and mandatory** — `renderPerformance()`
checks the entitlement before rendering anything, and `performance` is
registered in `SECTION_PERM_MAP` so `setSection()` gates it too.

## Group isolation

Performance reads **no** club-wide data. All 144 Performance functions are
free of `state.players`, `canonicalVisiblePlayers`, `_adminData.members` and
`state.medicalRecords` — enforced by test.

The Athletes screen renders isolated sample data. Real coach roster access is
**deliberately disabled** rather than wired unsafely: `state.players` is
club-wide on every coach's device, so a scoped coach reading it would see
another group's athletes. When it is wired, `operationalPlayers()` — which
fails closed while access data loads — is the only correct source, with
`?group=` and `assertOperationalGroup` on the server side.

## Development context

Core's authoritative group record carries `developmentCategory`
(`youth_u16 | youth_u18 | adult | mixed_open | unknown`). Precedence, all of
it inside the pure SC5 module:

1. **Athlete age evidence wins.** A U18 athlete in a squad classified `adult`
   keeps U18 safeguards; the mismatch is surfaced as a conflict, not resolved
   silently.
2. **A known adult is not demoted** by an accidental youth classification.
3. **Group context supports** when athlete evidence is missing — a
   `youth_u16` squad applies youth rules conservatively.
4. **`unknown` is restrictive.** No group label alone unlocks adult
   programming, and a missing classification never does.
5. **Names carry no weight.** A group *called* "U18" but classified `unknown`
   is treated as unknown. Nothing parses display names.

## Demo data

The SC7 demo assignment is a development fixture available only on Core's
local demo hosts (`_isLocalDemoHost()`). Production shows an honest
"No programme assigned" state, and `perfWkStart()` refuses to fabricate a
session even when called directly. Real coach assignment tooling does not
exist yet — that is the next milestone, not something INT2 faked.

## Person-scoped state

`performanceProfile`, `performanceLibrary` and `performanceWorkout` are
cleared on identity change (shared devices); `performanceWorkout` is also
cleared on a club switch, since a session belongs to a club's programme.
`performanceSettings` is a device display preference and is kept.
