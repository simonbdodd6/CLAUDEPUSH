# Executive Knowledge Graph (PIF-4)

The canonical relationship layer that connects everything across the platform:
people, companies, projects, leads, meetings, tasks, recommendations, evidence,
decisions, memories, events, products, customers. **Every entity exists exactly
once; everything else references it.**

Implementation: [`lib/executive-knowledge-graph/`](lib/executive-knowledge-graph/).
It is domain-agnostic and supports **Coach's Eye, Website Lead, Wedding, Travel,
Hospitality and future products without modification**. It is **not** another AI,
reasoning, memory, recommendation or explanation engine — entities are canonical
*references* into their owning engines (`ref:{engine, externalId}`), never copies.

## Architecture diagram

```
   OWNING ENGINES                 EXECUTIVE KNOWLEDGE GRAPH                 CONSUMERS
   (source of truth)              (canonical reference layer)
 ┌────────────────────┐        ┌───────────────────────────────────┐
 │ memory-engine      │        │  Entity registry  (exists once)   │
 │ lead-personalisation├──ref──►│   • Universal Entity nodes        │     ┌──────────────────┐
 │ knowledge-engine   │        │   • deterministic content-hash id │     │ Executive        │
 │ identity-platform  │        │                                   ├────►│ Reasoning (PIF-3)│
 │ trip-platform      │        │  Relationship registry            │     │ dashboards       │
 │ club-digital-twin  │        │   • temporal (validFrom/Until)    │     │ future AI        │
 └────────────────────┘        │   • versioned + audited           │     └──────────────────┘
         ▲                      │                                   │            │ data only,
         │ records never        │  Traversal: neighbors · bfs ·     │            │ UI-independent
         │ copied into graph    │   shortestPath · subgraph · asOf  │            ▼
         └──────────────────────┤                                   │
                                │  Views: recommendation-dependency │
                                │   · decision-dependency           │
                                │   · evidence-graph · digital-twin │
                                └───────────────────────────────────┘
```

## Entity Registry

The conventional entity types (the model accepts **any** non-empty string, so future
products participate unmodified). Defined in
[`constants.js`](lib/executive-knowledge-graph/constants.js) `ENTITY_TYPE`.

| Type | Purpose | Example owning engine |
|---|---|---|
| `person` | a human identity (shared across domains) | identity-platform |
| `company` | an organisation | lead-personalisation |
| `project` | a body of work | — |
| `lead` | a sales lead | lead-personalisation |
| `meeting` | a scheduled meeting | calendar |
| `task` | an actionable task | workflow-engine |
| `recommendation` | an AI recommendation | autonomous-assistant |
| `evidence` | a cited fact | knowledge-engine |
| `decision` | a classified decision | decision-support |
| `memory` | a stored memory | memory-engine |
| `event` | a platform/world event | platform-events |
| `product` | a product / SKU | — |
| `customer` | a paying customer | billing |
| `player`, `team` | Coach's Eye domain | memory-engine |
| `venue`, `booking` | Wedding / Hospitality | — |
| `trip` | Travel | trip-platform |

**Every entity supports:** `id · type · domain · ref · owner · label · status ·
confidence · created · updated · version · relationships · timeline · citations ·
approvalHistory · featureFlags · attributes`.

## Relationship Registry

Conventional relationship types (open set). Defined in `RELATIONSHIP_TYPE`.

| Type | Meaning |
|---|---|
| `owns` | subject owns object |
| `member_of` | subject is a member of object |
| `part_of` | subject is part of object |
| `works_for` | person works for company |
| `assigned_to` | task assigned to person |
| `attends` | person attends meeting/event |
| `references` | generic reference |
| `related_to` | generic association |
| `depends_on` | dependency (recommendation/decision graphs) |
| `derived_from` | provenance |
| `cites` | evidence citation |
| `evidenced_by` | inverse of cites |
| `decided_by` | recommendation decided by a decision |
| `approved_by` | linked to an approval |
| `about` | subject is about an entity |
| `produced` | subject produced object |

**Every relationship supports:** `id · type · from · to · directed · confidence ·
status · validFrom · validUntil · created · updated · version · citations ·
attributes`.

## Example graph (generated, deterministic)

Produced by `buildExampleGraph()` — five domains connected through one graph, with
two shared canonical people referenced across them:

```
STATS  →  14 entities · 13 relationships
by domain → platform: 2, coaches-eye: 6, website-lead: 3, wedding: 2, travel: 1
by type   → person: 2, recommendation: 3, team/player/evidence/decision/company/
            lead/venue/booking/trip: 1 each

Simon (person, platform)
  ├─owns──────────►  U16 Squad (team, coaches-eye)  ◄─member_of── Darragh (player)
  └─works_for─────►  Naas RFC (company, website-lead)            ▲
                                                                 │about
  Attendance review (recommendation, coaches-eye) ───────────────┘
      ├─cites────────►  Attendance evidence (evidence)
      ├─derived_from─►  Attendance evidence
      ├─decided_by──►  Approve review (decision)
      └─approved by  apr-9 (approvalHistory on the entity)
  Parent-engagement (recommendation) ─depends_on─► Attendance review   ← rec→rec dependency

Emma (person, platform)
  ├─owns──►  Wedding booking (booking, wedding) ─part_of─► Grange Manor (venue)
  └─owns──►  Bali honeymoon (trip, travel)
```

The same `Simon` and `Emma` person nodes are referenced by Coach's Eye, Website
Lead, Wedding and Travel simultaneously — proving "exists only once, referenced
everywhere".

## Guarantees

- **No duplicate entities / ids / relationships** — content-hash identity + upsert.
- **Deterministic** — reproducible ids; injectable clock; `export()` sorts by id.
- **Versioned** — full entity and relationship history.
- **Temporal** — relationships carry validity windows; `relationshipsAsOf(t)`.
- **Auditable** — every change can be mirrored to an append-only journal sink.
- **Explainable** — feeds the PIF-3 Executive Reasoning layer with structured
  relationships, citations and provenance.
- **Feature-flagged** — entities carry `featureFlags`; consumers gate via the
  existing `brain/config.js` schema.
