# Assignment permissions and isolation (SC8)

Client-side hiding is presentation. The boundary is `performanceHandler` in
`api/publish.js`, and it is enforced on every request.

## Who may do what

| Actor | Read | Author / publish | Assign |
|---|---|---|---|
| **Player** | their OWN assignments, projected | no | no |
| **Coach** (`publish_training`) | athletes in their operational scope | yes, in scope | yes, in scope |
| **Club admin** (club-wide scope) | all groups | yes | yes |
| **Medical** | no Performance authoring | no | no |
| **S&C (`snc`)** | not activated — see below | — | — |
| **Parent/guardian** | does not exist | — | — |

## The rules that make it real

* **The athlete id for a player comes from the SESSION**, never from the request.
  Changing an id in a URL cannot reach another athlete.
* **Enumeration is bounded**: `scopedAthleteIds()` decides who a coach can even
  *see*. A Seniors coach asking for the athlete list does not receive U18 athletes
  at all — not hidden in the UI, absent from the payload.
* **Every authoring op re-resolves the athlete in scope first**
  (`resolveScopedAthlete`), so an out-of-scope id fails **before** anything is
  written. A Seniors coach naming a U18 athlete gets 403; an athlete from another
  club gets 404.
* **Server-owned fields cannot be smuggled in.** `status`, `assignedBy`, `clubId`,
  `groupId`, `audit` and the athlete's membership are resolved server-side and
  overwrite anything in the request body.
* **One key is written**: `performance:<clubId>`. A Performance write is
  structurally incapable of touching the roster, identity, medical or training.

## Privacy

The coach athlete projection carries name, position, group, **squad
classification** and assignment status. It carries no wellness log, no medical
data, no injury history and no profile health fields. The player projection
carries their training content and its context — not coach notes about them, not
review flags, not the audit trail.

Club admin gaining Performance access does **not** grant restricted health
information: SC8 exposes none.

## Limitations recorded honestly

* The canonical role `snc` exists in `api/_permissions.js` but is unreachable
  (not in invite `VALID_ROLES`, no UI). S&C staff are onboarded as coaches, and
  SC8 does not activate a half-built role.
* Coach roster reads use the server projection. `state.players` is club-wide on
  every coach's device and is never read by any Performance surface — enforced by
  test across all Performance functions.
