# Player programme delivery (SC8)

## What the athlete gets

`Performance → My Programme` shows their own assignment: title, status,
development context, version, current week and progress, start/end dates, and
this week's sessions with today marked.

`Performance → Workouts` resolves **today's real session** from the pinned
snapshot and hands it to the SC7 flow unchanged — check-in, set logging, rest
timer, substitution, pain-stop, recovery on reload, completion and immutable
history.

## The Today source (the SC8 change)

```
real live assignment ─► session for today from the PINNED snapshot
        │
        └─ no session today ─► honest state (rest day / paused / starts soon / finished)

no assignment at all ─► "No programme assigned"
                        (local demo host only: the labelled demo fixture)
```

**A real assignment always wins.** An athlete who has *any* real assignment record
never sees the demo fixture, even on a developer machine — a paused programme is
still their programme, and a demo workout would misrepresent it. The demo survives
only for a developer with no real assignment, on a local demo host.

## Honest states

An athlete with a programme is **never** told they have none. "Rest day",
"Programme paused", "Programme starts soon" and "Programme finished" each say what
is actually true, and each offers a route to their programme page.

A paused programme serves no workout and deletes no history.

## History fidelity

Every workout records `programmeAssignmentId`, `programmeVersionId` and the
`developmentContext` it was performed under. Publishing v2 of the programme does
not touch a workout logged against v1 — the completed record stays exactly as it
was performed.

## Entitlement

The athlete's club must be entitled to Performance. An unentitled club receives
402 with `performance_not_entitled` — reported as itself, never as an empty list,
so "not enabled" is never mistaken for "no programme".
