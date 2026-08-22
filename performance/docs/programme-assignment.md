# Programme assignment (SC8)

An **assignment** links one athlete to one **published programme version**. It is
the record that turns the engine into a product: SC7 executes what an assignment
points at, and SC6 reads the exposures that come back.

## Source of truth

Assignments live on the **server**, at one key per club: `performance:<clubId>`
(`api/_performanceStore.js`). This is the deliberate break from every earlier
Performance milestone, which stored state on the device. A coach assigns on a
laptop and the athlete opens their phone — device storage cannot express that.

localStorage still holds the athlete's in-flight workout and immutable history
(SC7); it never holds an assignment.

## Ownership

An assignment belongs to **one club, one athlete, one programme version**. It also
captures, at assignment time and never re-derived:

* `groupId` / `groupName`, `teamId` / `teamName`
* `developmentContextSnapshot` — the squad classification that applied
* `entitlementSnapshot` — the club's plan when it was assigned

A player who moves from U18 to Seniors next season does **not** rewrite their past
assignments. History records what was true then.

## Version pinning

`snapshot` is the frozen SC4 `programme_assignment_snapshot`: the whole
prescription tree plus a snapshot of every referenced exercise at its pinned
version. Workouts are built from that snapshot, never from a live programme, so
renaming or editing an exercise next month cannot change what an athlete was
asked to do — or what their completed history says they did.

Editing an active programme creates **v2**; the athlete stays on v1 until a coach
explicitly replaces the assignment.

## Lifecycle

```
draft ─┬─► scheduled ─┬─► active ─┬─► completed
       │              │           ├─► paused ──► active
       │              │           ├─► replaced
       └──────────────┴───────────┴─► cancelled
```

`completed`, `replaced` and `cancelled` are terminal — they never reopen. A coach
who wants an athlete back on a programme creates a new assignment, so the record
of what actually happened survives.

`effectiveStatus(assignment, today)` derives scheduled→active from the start date
**without writing**: reads never mutate (the Core `c79c07a8` rule).

## Calendar

Week 1 begins on `startDate`. Within a week, today's session is the one whose SC4
training day matches today's weekday. Nothing shifts automatically: an athlete who
misses Tuesday does not silently get Tuesday moved to Wednesday. A rest day is an
honest empty state, and running past the final week yields nothing rather than
looping.

The adaptive scheduler (catch-up, congestion, fixture-aware shifting) is **not**
built — see `programme-authoring.md` for what SC9 inherits.

## One active programme

An athlete has one primary S&C programme. A second assignment is **refused** (409
`active_assignment_exists`) unless the coach declares `intent: 'replace'` or
`schedule_after`. Replacement closes the outgoing assignment and records which
assignment superseded it. Nothing is ever silently overwritten or deleted.
