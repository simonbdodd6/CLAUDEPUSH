# M31 — `@brain/contracts` Type Surface + `coaches-eye` ProductManifest (Spec)

**Status:** Documentation / specification only. No implementation, no migrations, no
Coach's Eye Core changes, no UI, no auth, no LLM. All current APIs and tests preserved.
Coach's Eye Core must still work with AI completely disabled (the `free` / `ai.enabled:false`
baseline below is the formal statement of that invariant).

> Tier ids are kept **exactly as the engines emit them today**
> (`free · starter · performance · club · professional · enterprise`).
> The five named commercial tiers map as: **Basic/Core → `starter`**,
> **Performance → `performance`**, **Professional → `professional`**, **Club → `club`**,
> **Enterprise → `enterprise`**. `free` = AI-disabled baseline (Core only).

---

## 1. Exact `@brain/contracts` type surface

Types only. These describe objects the engines **already** produce (M17 envelope,
M18–M28 `rec()`, M19 profile/observation), named once.

```ts
// ─── identity & scope ──────────────────────────────────────────────────────
export type TenantId   = string                       // e.g. "default" (today's single tenant)
export type ProductId  = 'coaches-eye' | 'travel' | 'language' | (string & {})
export type SubjectId  = string                       // coachId | opponentId | matchId | teamId | clubId
export type Tier       = 'free' | 'starter' | 'performance' | 'club' | 'professional' | 'enterprise'
export type Visibility = 'private' | 'shared'

export interface Scope {
  tenant:     TenantId
  product:    ProductId
  namespace:  string
  visibility: Visibility            // default 'private'
}

// ─── the M17 integration envelope (frozen, unchanged shape) ────────────────
export type Reason =
  | 'insufficient_tier' | 'feature_disabled' | 'brain_unavailable'
  | 'invalid_input' | 'ai_not_enabled'
export interface Envelope<T = unknown> {
  available: boolean
  ok:        boolean
  reason:    Reason | null
  data:      T | null
  version:   string                 // capability output version (e.g. "2.0")
}

// ─── the M18–M28 recommendation/explanation primitive (frozen) ─────────────
export type Severity = 'high' | 'medium' | 'low'
export interface Recommendation {
  id:             string
  recommendation: string
  why:            string            // every rec explains WHY
  evidence:       string[]          // evidence ids (chain back to observations)
  confidence:     number | null     // shared confidence ∈ [0,1] (or null)
  priority:       Severity
  fallback:       string | null     // used when underlying data is missing
}

// ─── memory & learning (M7 / M19) ──────────────────────────────────────────
export interface MemoryRecord<T = unknown> {
  key:       string
  scope:     Scope
  value:     T
  version:   string
  updatedAt: string | null          // ISO; never wall-clock-derived inside engines
}
export interface Observation<D = unknown> {
  observationId: string
  subjectId:     SubjectId
  type:          string             // eventType
  data:          D
  recordedAt:    string | null
}
export interface SubjectProfile<P = unknown> {
  subjectId:        SubjectId
  kind:             string          // 'coach' | 'opponent' | ...
  profileVersion:   string          // e.g. LEARNING_VERSION "1.0"
  observations:     Observation[]   // append-only; replayable
  derived:          P               // engine-derived state (read-only to products)
  observationCount: number
}

// ─── events, audit, approvals (M12 policy, PIF-2 ledger) ────────────────────
export interface BrainEvent<T = unknown> {
  id: string; scope: Scope; type: string; payload: T; at: string | null
}
export interface AuditRecord {
  id: string; scope: Scope; action: string; actor: string
  evidence: string[]; outcome: 'allow' | 'deny' | 'approve' | 'reject'; at: string | null
}
export interface ApprovalRequest {
  id: string; product: ProductId; tenant: TenantId
  action: string; evidence: string[]; risk: Severity; requestedBy: string
}
export interface ApprovalDecision {
  id: string; state: 'pending' | 'approved' | 'rejected' | 'expired'
  decidedBy: string | null; at: string | null
}

// ─── capabilities, flags, versions (M17 matrix, M18–M28 flags/_VERSION) ─────
export interface Capability { key: string; tiers: Tier[] }     // tier SET, not a min (Club is non-linear)
export interface FeatureFlag { key: string; defaultOn: boolean; killSwitch?: boolean }
export interface VersionContract {
  capability:    string
  outputVersion: string            // current emitted version
  supports:      string[]          // versions still served
  deprecates?:   string[]
}

// ─── product manifest & runtime ports (interfaces only) ────────────────────
export interface ShareRule { namespace: string; schema: string; retention: string; readableBy: ProductId[] }
export interface ApprovalRule { action: string; risk: Severity }
export interface PluginRegistration { slot: string; engine: string; version: string; tiers: Tier[]; flag?: string }

export interface ProductManifest {
  productId:      ProductId
  tiers:          Tier[]
  capabilities:   Capability[]
  namespaces:     string[]
  shares:         ShareRule[]
  flags:          FeatureFlag[]
  approvals:      ApprovalRule[]
  plugins:        PluginRegistration[]
  versions:       VersionContract[]
  globalKillFlag: string            // 'ai.enabled'
}

// Runtime ports — interfaces only; products hold a ProductRuntime, never internals.
export interface MemoryPort { /* get/set/list/replay/clear, all scope-bound */ }
export interface EventPort  { /* publish/subscribe, scope-bound; default no-op */ }
export interface FlagPort   { resolve(flag: string, ctx: { tier: Tier; flags?: Record<string, boolean> }): boolean }
export interface PolicyPort { canRead(target: Scope, by: Scope): boolean; redact<T>(v: T): T }
export interface ApprovalPort { /* submit/decide/ledger */ }
export interface AuditPort  { append(r: AuditRecord): void }
export interface ProviderGateway { /* model/tool/embedding — abstraction only, no LLM */ }
export interface ProductRuntime {
  memory: MemoryPort; events: EventPort; flags: FlagPort; policy: PolicyPort
  approvals: ApprovalPort; audit: AuditPort; providers: ProviderGateway
  confidence(signals: unknown): number
  explain(rec: Omit<Recommendation, 'confidence'> & { confidence?: number }): Recommendation
}
export interface BrainRuntime { forProduct(p: ProductId, t: TenantId): ProductRuntime }
```

---

## 2. Exact `ProductManifest` for `coaches-eye`

Spec literal (data, not logic). Versions/flags/tier-sets are copied from the live
constants so the manifest reproduces today's gating exactly.

```ts
export const COACHES_EYE_MANIFEST: ProductManifest = {
  productId: 'coaches-eye',
  tiers: ['free', 'starter', 'performance', 'club', 'professional', 'enterprise'],
  globalKillFlag: 'ai.enabled',

  capabilities: [
    { key: 'coach.dashboard',            tiers: ['starter','performance','club','professional','enterprise'] },
    { key: 'coach.weeklyBrief',          tiers: ['starter','performance','professional','enterprise'] },        // NOT club
    { key: 'coach.matchReadiness',       tiers: ['performance','club','professional','enterprise'] },
    { key: 'coach.playerCard',           tiers: ['performance','professional','enterprise'] },                  // NOT club
    { key: 'coach.clubSnapshot',         tiers: ['club','professional','enterprise'] },
    { key: 'coach.selectionAssistant',   tiers: ['performance','club','professional','enterprise'] },           // bundled at matchReadiness tier
    { key: 'coach.coachDna',             tiers: ['professional','club','enterprise'] },                         // DNA_TIERS (NOT performance)
    { key: 'coach.opponentIntelligence', tiers: ['performance','club','professional','enterprise'] },
    { key: 'coach.trainingDesigner',     tiers: ['performance','club','professional','enterprise'] },
    { key: 'coach.matchStrategy',        tiers: ['performance','club','professional','enterprise'] },
    { key: 'coach.liveMatch',            tiers: ['performance','club','professional','enterprise'] },
    { key: 'coach.seasonIntelligence',   tiers: ['performance','club','professional','enterprise'] },
    { key: 'coach.learning',             tiers: ['starter','performance','club','professional','enterprise'] }, // infra, not a sold product
  ],

  namespaces: ['coach-profiles', 'coach-dna', 'opponents', 'live-matches', 'observations', 'memory', 'approvals'],

  shares: [
    // Nothing shared cross-product by default. Opponent scouting MAY later be shared
    // within a tenant across that tenant's own teams — declared explicitly when needed:
    // { namespace: 'opponents', schema: 'opponent-profile@1.0', retention: 'season', readableBy: ['coaches-eye'] }
  ],

  flags: [
    { key: 'ai.enabled',              defaultOn: true, killSwitch: true },   // GLOBAL_AI_FLAG (M17)
    { key: 'ai.learning',             defaultOn: true },                      // M19 LEARNING_FLAG
    { key: 'ai.coachProfile',         defaultOn: true },                      // M19 PROFILE_FLAG
    { key: 'ai.personalisation',      defaultOn: true },                      // M20
    { key: 'ai.matchReadiness',       defaultOn: true },                      // M21
    { key: 'ai.selectionAssistant',   defaultOn: true },                      // M22
    { key: 'ai.coachDNA',             defaultOn: true },                      // M23
    { key: 'ai.opponentIntelligence', defaultOn: true },                      // M24
    { key: 'ai.trainingDesigner',     defaultOn: true },                      // M25
    { key: 'ai.matchStrategy',        defaultOn: true },                      // M26
    { key: 'ai.liveMatch',            defaultOn: true },                      // M27
    { key: 'ai.seasonIntelligence',   defaultOn: true },                      // M28
  ],

  approvals: [
    // AI is advisory; nothing auto-acts on Core. Rules declared for outward/irreversible
    // actions only (none fire while unused, so behaviour is unchanged):
    { action: 'coach.message.send', risk: 'medium' },   // if Intelligence ever drafts a coach message
    { action: 'opponent.share',     risk: 'high'   },   // publishing scouting to a shared scope
  ],

  plugins: [
    { slot: 'coach.weeklyBrief',          engine: 'weekly-brief',        version: '2.0', tiers: ['starter','performance','professional','enterprise'], flag: 'ai.enabled' },
    { slot: 'coach.matchReadiness',       engine: 'match-readiness',     version: '2.0', tiers: ['performance','club','professional','enterprise'], flag: 'ai.matchReadiness' },
    { slot: 'coach.selectionAssistant',   engine: 'selection-assistant', version: '1.0', tiers: ['performance','club','professional','enterprise'], flag: 'ai.selectionAssistant' },
    { slot: 'coach.coachDna',             engine: 'coach-dna',           version: '1.0', tiers: ['professional','club','enterprise'], flag: 'ai.coachDNA' },
    { slot: 'coach.opponentIntelligence', engine: 'opponent',            version: '1.0', tiers: ['performance','club','professional','enterprise'], flag: 'ai.opponentIntelligence' },
    { slot: 'coach.trainingDesigner',     engine: 'training-designer',   version: '1.0', tiers: ['performance','club','professional','enterprise'], flag: 'ai.trainingDesigner' },
    { slot: 'coach.matchStrategy',        engine: 'match-strategy',      version: '1.0', tiers: ['performance','club','professional','enterprise'], flag: 'ai.matchStrategy' },
    { slot: 'coach.liveMatch',            engine: 'live-match',          version: '1.0', tiers: ['performance','club','professional','enterprise'], flag: 'ai.liveMatch' },
    { slot: 'coach.seasonIntelligence',   engine: 'season',              version: '1.0', tiers: ['performance','club','professional','enterprise'], flag: 'ai.seasonIntelligence' },
    { slot: 'coach.learning',             engine: 'learning',            version: '1.0', tiers: ['starter','performance','club','professional','enterprise'], flag: 'ai.learning' },
  ],

  versions: [/* see §6 */],
}
```

---

## 3. Namespaces for Coach's Eye Intelligence

All `private`, partitioned by `(tenant, product, namespace)`. Mapping to today's stores so
behaviour is identical.

| Namespace | Backs (today) | Key (SubjectId) | Retention | Notes |
|---|---|---|---|---|
| `coach-profiles` | M19 learning store | `coachId` | season+ | observations append-only; replayable; `_clear()` → namespace clear |
| `coach-dna` | M23 DNA cache + reset markers | `coachId` | season | derived cache; rebuilt from `coach-profiles` |
| `opponents` | M24 opponent observation store | `opponentId` | multi-season | candidate for tenant-internal `shared` later (explicit) |
| `live-matches` | M27 event log store | `matchId` | ephemeral / short TTL | high-volume; per-match |
| `observations` | M6/M8 intelligence timeline | `subjectId` | season | general observation log |
| `memory` | M7 semantic memory | `subjectId` | configurable | knowledge memory |
| `approvals` | PIF-2 ledger reference | `requestId` | audit-permanent | product-scoped view of the shared ledger |

Stateless engines (M25 Training, M26 Strategy, M28 Season) hold **no namespace** — they compute
from passed-in context, exactly as today.

---

## 4. Capability list & tier mapping (exact, preserves current behaviour)

`✓` = capability `available`. Basic/Core = `starter`; `free` = AI disabled (Core only).

| Capability | free | Basic/Core (starter) | performance | club | professional | enterprise |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| coach.dashboard | – | ✓ | ✓ | ✓ | ✓ | ✓ |
| coach.weeklyBrief | – | ✓ | ✓ | – | ✓ | ✓ |
| coach.matchReadiness | – | – | ✓ | ✓ | ✓ | ✓ |
| coach.playerCard | – | – | ✓ | – | ✓ | ✓ |
| coach.clubSnapshot | – | – | – | ✓ | ✓ | ✓ |
| coach.selectionAssistant | – | – | ✓ | ✓ | ✓ | ✓ |
| coach.coachDna | – | – | – | ✓ | ✓ | ✓ |
| coach.opponentIntelligence | – | – | ✓ | ✓ | ✓ | ✓ |
| coach.trainingDesigner | – | – | ✓ | ✓ | ✓ | ✓ |
| coach.matchStrategy | – | – | ✓ | ✓ | ✓ | ✓ |
| coach.liveMatch | – | – | ✓ | ✓ | ✓ | ✓ |
| coach.seasonIntelligence | – | – | ✓ | ✓ | ✓ | ✓ |
| coach.learning (infra) | – | ✓ | ✓ | ✓ | ✓ | ✓ |

Two intentional non-linearities preserved from M17: **Club has no `weeklyBrief`/`playerCard`**
(org-focused), and **Coach DNA starts at `professional`** (not `performance`). The `free`
column is all `–` — the formal statement of "Core works with AI completely disabled."

---

## 5. Feature flag list

| Flag | Scope | Default | Kill-switch | Source |
|---|---|---|---|---|
| `ai.enabled` | global | on | yes | M17 GLOBAL_AI_FLAG |
| `ai.learning` | product | on | – | M19 LEARNING_FLAG |
| `ai.coachProfile` | product | on | – | M19 PROFILE_FLAG |
| `ai.personalisation` | per-product modifier | on | – | M20 |
| `ai.matchReadiness` | capability | on | – | M21 |
| `ai.selectionAssistant` | capability | on | – | M22 |
| `ai.coachDNA` | capability | on | – | M23 |
| `ai.opponentIntelligence` | capability | on | – | M24 |
| `ai.trainingDesigner` | capability | on | – | M25 |
| `ai.matchStrategy` | capability | on | – | M26 |
| `ai.liveMatch` | capability | on | – | M27 |
| `ai.seasonIntelligence` | capability | on | – | M28 |

Resolution rule (already the engine behaviour, centralized): **flag absent ⇒ enabled** (opt-out);
explicit `false` ⇒ disabled; `ai.enabled:false` ⇒ all capabilities `available:false`.

---

## 6. Version contracts for existing AI modules

| Capability / module | outputVersion | supports | Source constant |
|---|---|---|---|
| integration envelope | 1.0 | [1.0] | INTEGRATION_VERSION |
| coach.weeklyBrief | 2.0 | [2.0] | BRIEF_VERSION |
| coach.matchReadiness | 2.0 | [2.0] | MR_VERSION |
| coach.selectionAssistant | 1.0 | [1.0] | SA_VERSION |
| coach.playerCard / coach.clubSnapshot | 1.0 | [1.0] | M16 product version |
| coach.learning (CoachProfile) | 1.0 | [1.0] | LEARNING_VERSION |
| coach.coachDna | 1.0 | [1.0] | DNA_VERSION |
| coach.opponentIntelligence | 1.0 | [1.0] | PROFILE_VERSION |
| coach.trainingDesigner | 1.0 | [1.0] | DESIGNER_VERSION |
| coach.matchStrategy | 1.0 | [1.0] | STRATEGY_VERSION |
| coach.liveMatch | 1.0 | [1.0] | LIVE_VERSION |
| coach.seasonIntelligence | 1.0 | [1.0] | SEASON_VERSION |

Each becomes a `VersionContract` in `@brain/versioning`; products pin a range (default `*`),
and a breaking output shape requires a new version string with the old one kept in `supports`
for the deprecation window.

---

## 7. Memory isolation rules

1. **Partition is the key.** Every record is keyed by `(tenant, product, namespace, subjectId)`.
   Clients never supply a raw key; they receive a scope-bound `MemoryPort`.
2. **Private by default.** All seven coaches-eye namespaces are `private`. Cross-namespace and
   cross-product reads are impossible through the port.
3. **Cross-scope read = explicit grant + check + audit.** Requires a declared `ShareRule`
   (`readableBy`), passes `PolicyPort.canRead(target, by)`, and writes an `AuditRecord`.
   `coaches-eye` declares no shares today.
4. **Tenant isolation.** `tenant` is always supplied by the host; engines never default or infer
   it (today: `"default"`). Tenant A can never read Tenant B.
5. **Retention per namespace** (`live-matches` short-TTL, `approvals` permanent); enforced by the
   driver, not the engine.
6. **Determinism + tests preserved.** Default driver = in-memory Map; `_clear()` maps to namespace
   clear → existing store tests pass unchanged.
7. **Derived state is read-only to products.** `SubjectProfile.derived` (CoachProfile preferences,
   DNA) is writable only by its owning engine — preserves "CoachProfile read-only outside the
   Learning Engine" and "explicit coach settings override DNA."

---

## 8. Approval / safety rules

1. **AI is advisory.** No Intelligence output mutates Core; engines have no Core import and no
   write port into Core.
2. **Kill-switch is absolute.** `ai.enabled:false` ⇒ every capability returns
   `{available:false, reason:'ai_not_enabled'}`; Core is unaffected. (Formal "Core works if AI
   is disabled.")
3. **Policy guard (M12) on gated actions.** Any action in `manifest.approvals` routes
   `ApprovalRequest → PolicyPort → ApprovalDecision → immutable AuditRecord`. None fire while
   unused, so behaviour is unchanged.
4. **Redaction.** `PolicyPort.redact` strips PII before any record crosses a scope boundary or
   enters a shared namespace.
5. **Evidence + explanation mandatory.** Every `Recommendation` carries `why` + `evidence[]` +
   `fallback`; the audit log references the same evidence ids.
6. **Read-only profiles.** Products read `SubjectProfile`; only the owning engine writes —
   enforced at the port.

---

## 9. Dependency rules (CI-enforced)

1. **Apps** import only `product-*` façade + `@brain/contracts`. (Core imports only the
   `coaches-eye` façade, behind flags.)
2. **Product façades** import `@brain/runtime` + `@brain/contracts` + `@brain/products` +
   their `engines/*`.
3. **Engines** import only `@brain/contracts` (types) + their own files — no runtime, no provider,
   no other engine, no Core. (Generalizes today's per-module "Brain-only, self-relative imports"
   structural test.)
4. **No app → app. No engine → runtime. No cross-product private read. No cycles.**
5. **`@brain/contracts` and `@brain/versioning` depend on nothing.**
6. Enforced by dependency-cruiser in CI (report-only first, then failing).

---

## 10. Tests required before implementation

All must exist (and the relevant ones be red) before any migration code is written:

1. **Master gate:** the full existing 1,803-test suite passes unmodified at every step.
2. **Parity / golden-output:** for each engine, `AI.*` / `CoachAI.*` output via the platform
   `deepEqual`s today's output (recommendations byte-identical).
3. **Capability-matrix parity:** resolution reproduces §4 exactly, including Club exclusions and
   DNA-at-`professional`.
4. **Flag resolution:** absent ⇒ on, explicit-false ⇒ off, `ai.enabled:false` ⇒ all `available:false`.
5. **"Core works with AI disabled":** with `ai.enabled:false`, every capability is unavailable and
   a Core-only path is unaffected.
6. **Isolation contract (red first):** product A cannot read product B's private scope; tenant X
   cannot read tenant Y; cross-namespace read blocked without a grant.
7. **Dependency-graph test:** dependency-cruiser fails on app→app, engine→runtime, cross-product
   private read, or cycles.
8. **Version negotiation:** pinned range resolves to expected `outputVersion`; a deprecated version
   is still served within its window.
9. **Approval/audit ledger:** submit → policy → decide → immutable append; cross-scope read emits
   an `AuditRecord`.
10. **Store-parity + `_clear`:** memory port over the default Map round-trips identically and clears
    per-namespace (existing store tests unchanged).
11. **Rollback:** package downgrade / version-pin reverts behaviour with no data migration.

---

*End of spec. No implementation, no migrations, no Core/UI/auth/LLM. All current APIs and tests
preserved; Core remains fully functional with AI disabled.*
