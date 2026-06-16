# M42 — Evidence Ingestion Architecture (AI Brain)

**Status:** Architecture / design only. No implementation. This document defines
how evidence *enters* the AI Brain. It does **not** build UI, wire capabilities,
modify engines, Core or the Experience layer, or add any runtime behaviour.

**Context.** M34–M41 built the **outbound** half of the intelligence loop:
`AI Brain → @brain/product-coaches-eye façade → host runtime → Experience Adapter
→ VisualModel → props-only panels`, read-only, with seven live capabilities. This
document specifies the **inbound** half — the path by which observations become
evidence the Brain can reason over — so that the loop can later be closed without
violating any existing architectural guarantee.

**Anchoring principle (unchanged from the engines).** The Brain is deterministic
and evidence-backed. Every recommendation already carries the envelope
`{ id, recommendation, why, evidence[], confidence, priority, fallback }`. Evidence
ingestion exists to *populate the `evidence[]` substrate* so that claims remain
traceable to sources. **No evidence ⇒ no claim.**

---

## 0. Where this sits in the layering

```
 SOURCES                 INGESTION (new)              BRAIN (existing)           EXPERIENCE (existing)
 ─────────               ───────────────              ────────────────           ─────────────────────
 providers  ─┐
 manual coach┤  ──►  receive → validate → normalize  ──►  Memory / Knowledge ──►  host runtime ──► adapter
 match notes ┤       → deduplicate → link → reweight       Graph + engines         (read-only)      → panels
 video tags  ┤              │                                  │
 team sheets ┤              ▼                                  ▼
 questionn.  ┤        Evidence Store (append-only,      engines read evidence,
 scouting    ┘         provenance + audit)              never the raw channel
```

Ingestion is a **new inbound module** that sits *beside* the engines, writing into
the same Memory / Knowledge Graph the engines already read. It is the mirror of the
host runtime: the host is the single **read** composition root; the **Evidence
Gateway** (below) is the single **write** composition root. Neither the Experience
layer nor the façade ever touches ingestion — ingestion is host/server-side only.

**Boundary rule that must survive:** the Experience browser app stays standalone
and imports no `@brain`. Evidence *collection UIs* (M-later) will submit through an
adapter-injected port exactly like capabilities are consumed — never by importing
the Brain directly.

---

## 1. Evidence sources

Two families: **provider** (automatic, generally higher trust) and **manual**
(coach-entered, generally lower trust). Every source declares a stable `sourceType`.

| `sourceType` | Family | Subject(s) | Notes |
|---|---|---|---|
| `provider.frameSports` | provider | player, team, fixture | automatic match/stat feed (events, possessions, set-piece) |
| `provider.video` | provider | player, fixture, drill | future video/stat providers; clip-anchored |
| `provider.statsImport` | provider | fixture, team | imported match events / league data |
| `manual.coachObservation` | manual | any | free coach quick-input |
| `manual.matchNote` | manual | fixture, player | live/post-match note |
| `manual.videoTag` | manual | player, fixture | coach-placed tag on a clip (until provider video lands) |
| `manual.teamSheet` | manual | team, fixture | selected/available squad |
| `manual.postMatchQuestionnaire` | manual | fixture, team | the 90-second structured form |
| `manual.scoutingNote` | manual | opponent | opposition scouting |
| `manual.contextNote` | manual | fixture | referee / weather / pitch / travel |

Each source maps to a **normalizer** (§3) that knows how to turn its raw payload
into one or more normalized **signals**. New sources are additive: register a
`sourceType` + a normalizer; nothing downstream changes.

---

## 2. Evidence object model

The atomic unit is an **EvidenceRecord**: an append-only, immutable fact about *one
observation from one source at one time*. Records are never edited; corrections are
new records that supersede prior ones (provenance preserves the chain).

```
EvidenceRecord {
  id:            string            // stable, globally unique (ULID-style, time-ordered)
  schemaVersion: string            // evidence contract version (e.g. '1.0')

  // ── tenant context (STRICT isolation — see §4) ───────────────────────────
  tenant: {
    clubId:  string
    teamId:  string | null         // null = club-wide
    seasonId:string | null
  }

  // ── classification ───────────────────────────────────────────────────────
  sourceType:  string              // e.g. 'provider.frameSports' | 'manual.matchNote'
  sourceFamily:'provider' | 'manual'
  subjectType: 'player' | 'team' | 'coach' | 'fixture' | 'opponent' | 'club' | 'drill' | 'session'
  subjectId:   string              // entity key in the knowledge graph

  // ── trust + time ──────────────────────────────────────────────────────────
  confidence:  number              // 0..1 — see confidence model §6 / §4
  observedAt:  string              // ISO — when the thing happened
  recordedAt:  string              // ISO — when it entered the system
  validFrom:   string | null       // optional decay/recency window
  validTo:     string | null

  // ── authorship / provenance ───────────────────────────────────────────────
  author: {
    kind: 'coach' | 'provider' | 'system'
    id:   string                   // coachId, providerId, or pipeline id
    name: string | null
  }

  // ── the observation ────────────────────────────────────────────────────────
  raw:        any                  // verbatim source payload (immutable)
  signals:    NormalizedSignal[]   // typed, deduped facts derived from `raw` (§3)

  // ── provenance + audit ──────────────────────────────────────────────────────
  provenance: {
    derivedFrom:  string[]         // upstream EvidenceRecord ids (lineage)
    supersedes:   string | null    // prior record this corrects
    ingestRunId:  string           // which pipeline run produced this
    normalizer:   string           // which normalizer + its version
  }
  audit: AuditEntry[]              // append-only: every state transition (§3)

  // ── governance ─────────────────────────────────────────────────────────────
  sensitivity: {
    level: 'public' | 'club' | 'medical' | 'restricted'
    piiSubjectIds: string[]        // persons referenced — drives access/retention
    consentRef:    string | null   // consent record id where required (e.g. minors)
  }
}

NormalizedSignal {
  key:        string               // canonical signal name, e.g. 'lineout.winRate'
  value:      number | string | boolean | null
  unit:       string | null
  polarity:   'strength' | 'weakness' | 'neutral' | null
  confidence: number               // 0..1 — may be ≤ record confidence
  evidenceId: string               // back-reference to the owning record
}

AuditEntry {
  at:     string                   // ISO
  actor:  string                   // author or pipeline id
  action: 'received'|'validated'|'normalized'|'deduplicated'|'linked'|'reweighted'|'superseded'|'rejected'|'redacted'
  note:   string | null
}
```

Notes:
- **`raw` is kept forever** (immutable) so any normalization can be re-derived and
  audited. **`signals`** are the engine-facing, typed projection.
- A record may yield **many** signals (e.g. one team sheet → availability signals
  per player).
- IDs are **time-ordered** so the store is naturally append-only and replayable
  (mirrors the existing autonomous-assistant / knowledge-history JSONL pattern).

---

## 3. Ingestion pipeline

A deterministic, idempotent, append-only pipeline. Each stage is pure over its
input + the existing store snapshot; every stage writes an `AuditEntry`. Stage
failure rejects the *record* (with reason) and never throws into a caller.

```
receive → validate → normalize → deduplicate → link → reweight → expose
```

1. **Receive.** Accept a raw submission via the **Evidence Gateway** (the single
   write entry point). Stamp `id`, `recordedAt`, `tenant`, `author`, `ingestRunId`.
   Provider feeds and manual submissions enter the *same* gateway.
2. **Validate.** Schema-check against the evidence contract; enforce tenant
   integrity (author may only write within their `clubId`); reject on missing
   subject/tenant/sourceType. Invalid → `rejected` audit, no store write.
3. **Normalize.** Run the source's registered normalizer → `NormalizedSignal[]`.
   Normalizers are **pure + deterministic** (no LLM, no clock, no randomness;
   timestamps passed in). This mirrors the engines' determinism rule.
4. **Deduplicate.** Collapse repeats by a deterministic dedupe key
   (`tenant + subjectId + signal.key + observedAt-bucket + sourceType`). Duplicates
   become `derivedFrom`/`supersedes` links, not new truth — counts are not inflated.
5. **Link to memory.** Upsert subject + signals into the Knowledge Graph as
   evidence-typed nodes/edges (the same graph Memory Intelligence already reads).
   Evidence attaches to entities; it does not overwrite engine-derived nodes.
6. **Update confidence (reweight).** Recompute the *aggregate* confidence for each
   affected `(subject, signal.key)` from its evidence set using a fixed, documented
   weighting (provider > verified manual > unverified manual; recency decay;
   corroboration boost; conflict penalty — §4/§6). Deterministic; replayable.
7. **Expose to reasoning engines.** Engines continue to **read** evidence/signals
   from the graph/store exactly as today (read-only). Ingestion never calls an
   engine; engines never call ingestion. The contract surface is the store, not a
   function call — preserving the existing one-way dependency direction.

**Idempotence + replay.** Re-running ingestion over the same raw inputs yields the
same store state (dedupe + deterministic reweight). The store can be rebuilt from
the append-only raw log.

---

## 4. Rules (invariants the pipeline must enforce)

1. **No evidence ⇒ no claim.** An engine may only assert a signal/recommendation
   backed by ≥1 EvidenceRecord. Empty evidence ⇒ no claim (current "insufficient
   data" / placeholder behaviour stays correct).
2. **Every recommendation cites evidence.** The recommendation envelope's
   `evidence[]` must resolve to real `EvidenceRecord.id`s. Citations are mandatory,
   not decorative.
3. **Uncertainty is explicit.** Confidence is always surfaced (0..1) and never
   silently rounded to certainty. Low-evidence claims read as low-confidence.
4. **Manual < verified provider.** Manual evidence is first-class but enters at a
   lower confidence ceiling than verified provider data; provider data that fails
   verification is treated as manual-grade.
5. **Conflicting evidence is never hidden.** Contradictory records are both
   retained and linked; reweight applies a conflict penalty and the conflict is
   *exposed* (engines/UX can show "disputed"), never dropped to fabricate consensus.
6. **Strict tenant boundaries.** Every read/write is tenant-scoped (`clubId`,
   optionally `teamId`/`seasonId`). No cross-tenant evidence, ever — enforced at
   validate (write) and at every query (read). This extends the manifest's existing
   namespace isolation.
7. **No LLM-only claims in memory without source attribution.** Any content an LLM
   helps produce may enter the store **only** as `sourceFamily:'manual'`/`'system'`
   with an explicit `author` and the prompting evidence in `provenance.derivedFrom`.
   An LLM is never an authoritative source; it cannot mint evidence from nothing.
8. **Append-only + auditable.** Records are immutable; corrections supersede; the
   full `audit[]` + `provenance` chain is retained (governance, GDPR, dispute).
9. **Sensitivity is honoured end-to-end.** `medical`/`restricted` records carry
   access + retention constraints; redaction is an audited action, not a delete.

### 4a. Enforcement seams (the invariants are mechanical, not conventional)

So the rules above are *enforced*, not merely honoured by engine discipline, each
binds to a concrete, deterministic, testable gate:

- **Tenant isolation (rule 6)** — enforced inside the Evidence Gateway at `validate`
  (writes) and in **every** store query (reads). All store access is keyed by
  `clubId`; no code path can read or write across tenants. (Extends the manifest's
  namespace isolation; mirrors the existing façade gate pattern.)
- **No-evidence / citation (rules 1–2)** — enforced at the **engine → façade output
  boundary** by an *evidence-citation gate*: a deterministic validator (in the
  recommendation/envelope contract) that rejects any non-fallback claim whose
  `evidence[]` does not resolve to ≥1 real `EvidenceRecord.id` **in the same tenant**.
  The ONLY uncited output permitted is an explicit fallback/placeholder, which is
  always low/zero-confidence. This makes "no evidence ⇒ no claim" a hard gate, not a
  convention.
- **Attribution / no LLM-only claims (rule 7)** — enforced at `validate`: a record
  with no `author`/`sourceType`, or LLM-derived content without
  `provenance.derivedFrom`, is `rejected` (audited) and never reaches the store.

These gates are pure functions over their input + a store snapshot — testable in
isolation exactly like the M41 mapper tests and the façade capability gate.

---

## 5. Manual evidence collection (design targets — no UI now)

All manual inputs are just submissions to the Evidence Gateway with
`sourceFamily:'manual'`. Confidence defaults are conservative and configurable.

- **Coach quick input** — one-line observation tagged to a subject (player/team).
  Fastest path; lowest default confidence; corroboration raises it.
- **Post-match 90-second questionnaire** — a small fixed set of structured
  questions (result context, standout/concern players, set-piece feel, intensity,
  injuries) → multiple normalized signals from one submission.
- **Opposition scouting notes** — `manual.scoutingNote`, subject = opponent; feeds
  Opponent Intelligence strengths/weaknesses with explicit low confidence until
  corroborated by provider/video.
- **Player notes** — development/welfare/attendance observations per player.
- **Referee / weather / pitch / context notes** — `manual.contextNote` on a fixture;
  conditions that contextualise other evidence (e.g. weather explains a kicking dip).
- **Attachments (later)** — voice note / photo / video reference as `raw`
  attachments **submitted through the same Evidence Gateway**; transcription/tagging
  is a *future* normalizer, still deterministic at the signal layer (no LLM-only
  claims — see §4.7). Manual, provider and attachment evidence therefore share one
  ingress.

Every manual submission still flows the full pipeline (validate → normalize →
dedupe → link → reweight) and is fully attributed + audited.

---

## 6. Provider evidence

- **Frame Sports (and similar)** — automatic feed; high default confidence **after
  verification** (schema + plausibility + tenant match). Unverified provider data is
  capped at manual-grade until verified.
- **Future video/stat providers** — same gateway, new `sourceType` + normalizer;
  additive.
- **Imported match events** — batch ingest of historical/league events as evidence
  (back-fill); same dedupe + provenance guarantees.
- **Confidence weighting (deterministic, documented).** Aggregate confidence per
  `(subject, signal.key)` is a fixed function of:
  - **source trust**: verified provider > verified manual > unverified manual,
  - **recency**: configurable decay toward `validTo`,
  - **corroboration**: independent sources agreeing raise confidence (capped),
  - **conflict**: disagreement applies a penalty and flags `disputed`,
  - **volume**: saturating (diminishing) returns, never unbounded.
  The exact weights live in an **evidence-weighting contract** (a future
  `@brain/*`-style data module), versioned like the capability version contracts.

---

## 7. How evidence feeds the capabilities

Evidence feeds engines **only** through the store (graph/signals) they already read.
No new coupling; each engine consumes the signal keys relevant to it.

| Capability | Consumes (signal families) | Effect |
|---|---|---|
| **Memory Intelligence** | all → graph nodes/edges + provenance | the knowledge graph *is* the evidence substrate; evidence nodes/edges become first-class memory |
| **Opponent Intelligence** | `provider.*` events, `manual.scoutingNote`, video tags | strengths/weaknesses/threats become evidence-cited with explicit confidence; conflicts shown as disputed |
| **Training Intelligence** | availability (team sheet), welfare/load (player notes), questionnaire intensity, context notes | session objectives/constraints are justified by cited evidence; thin evidence ⇒ fallback templates (current behaviour) |
| **Match Readiness** | team sheet (availability), medical/welfare notes, training-load signals | readiness gauges + risks each cite their evidence; missing evidence ⇒ lower confidence, never invented |
| **Executive Recommendations** | aggregated signals across the above | every recommendation's `evidence[]` resolves to real records; uncited recommendations cannot be produced |
| **Future cross-capability reasoning** | the unified evidence + provenance graph | reasoning composes *cited* signals across capabilities; still deterministic; LLM (if any) only explains, never sources (§4.7) |

The Experience layer continues to consume all of this **read-only** via the existing
host runtime → adapter → mappers; evidence simply makes the underlying slices
real-and-cited instead of placeholder. Mappers stay pure reshapes (they may *carry*
`evidence`/`confidence` fields through, never compute them).

---

## 8. Non-goals (explicitly out of scope for M42 and its first implementation slice)

- **No UI** — no evidence-collection screens, forms, or panels yet.
- **No database migration** — no schema/storage migration; the store design reuses
  the existing append-only JSONL/graph patterns conceptually, not as a migration.
- **No Core integration** — Coach's Eye Core is untouched; ingestion is host/server
  side, beside the engines.
- **No live provider integration** — no Frame Sports connection, credentials or
  feed wiring.
- **No LLM decision-making** — no LLM authoring claims, scoring evidence, or
  resolving conflicts. Determinism is preserved; an LLM may only *explain* already
  evidence-backed output, with attribution.
- **No engine changes** — engines keep reading the store as they do today.

---

## Implementation sequencing (suggested, for later milestones — not part of M42)

1. **M-next (contracts):** an `@brain/evidence-contracts` data module —
   `EvidenceRecord` / `NormalizedSignal` / `AuditEntry` typedefs + enums
   (`sourceType`, `subjectType`, `sensitivity`), and the evidence-weighting contract.
   Additive, dormant, parity-tested — exactly like the platform packages.
2. **M-next+1 (gateway + pipeline):** a host-side **Evidence Gateway** implementing
   receive→…→expose over an append-only store + the knowledge graph, with pure
   normalizers and deterministic reweighting. Imported by nobody until wired.
3. **M-next+2 (one source end-to-end):** wire a single manual source (coach quick
   input) through the gateway, prove evidence cited in one capability, behind a flag.
4. **Later:** post-match questionnaire, scouting notes, then provider (Frame Sports).
5. **Later:** evidence-collection UI submits via an injected gateway port — never
   importing `@brain` — preserving the standalone Experience guarantee.

Each step keeps the existing invariants: deterministic, additive, dormant-until-
wired, tenant-isolated, read-only engines, standalone browser, evidence-cited claims.

---

**Deliverable:** this document. No code, no UI, no wiring, no runtime behaviour.
