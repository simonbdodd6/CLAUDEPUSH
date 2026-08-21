# Programme Versioning, Assignment & Snapshots (SC4)

Source of truth: `performance/domain/programme-versioning.js`; tested in
`performance/tests/programme-versioning.test.js`.

## Versioning contract

- A **draft** version may be edited in place.
- **Publishing** (`publishProgrammeVersion`) stamps the version and
  **deep-freezes its training content** (the phases tree). The envelope's
  `versionStatus` remains mutable for exactly one legal transition —
  published → superseded — which is audited; the structure itself can never
  change after publication.
- **Editing a programme whose latest version is published creates a new
  draft version** (`beginEdit`): a deep copy with `versionNumber + 1` and
  every node id renamed into the new version's namespace. Calling
  `beginEdit` while a draft exists returns that draft — versions never
  stack accidentally.
- Publishing v(n+1) marks v(n) superseded; its frozen content and any
  assignment made against it keep working forever.

## Assignment contract (future milestones must obey this)

Assignment itself ships later — SC4 defines what it must capture.
`snapshotForProgrammeAssignment(programme, versionNumber, {catalogue,
collectionsMeta, now})` refuses drafts and returns a **deep-frozen**
snapshot containing:

| Preserved | Via |
|---|---|
| Programme Version | `programmeVersionId` + `versionNumber` (already immutable content) |
| Exercise Version | an SC3 `snapshotForAssignment` per referenced exercise (id, version, names, category/pattern, prescription types, safety notes, pain-stop text) |
| Collection Version | `collectionsVersion` + the ordered `collectionIds` referenced by blocks/origins |
| Prescription | the full frozen prescription tree as assigned |

**Rule:** every completed workout must always render exactly as assigned —
even if the programme is re-versioned, the exercise definitions are edited,
the collections change, or any of them are archived. Tests prove the
snapshot stays byte-identical through subsequent programme edits and
simulated catalogue edits.

## Audit history

`appendProgrammeAudit` (pure, capped at 200 entries) records lifecycle
events at both programme level (created, draft_created, version_published)
and version level (published, superseded, drafted_from_previous). Every
entry: action, actor, timestamp, bounded detail.

## Ownership & visibility

Programme ownership mirrors the SC3 exercise tiers:

- **coacheasier** — platform-owned; only system administration may modify;
  players see approved programmes only.
- **club** — visible inside the owning club; club S&C coaches author and
  publish versions; the **club admin approves** (never the author —
  `canApproveProgramme` enforces an independent reviewer); players see
  approved club programmes.
- **coach** — private to the owning coach; usable by that coach without a
  separate approval step (clearly their own content); invisible to everyone
  else.
- Archived programmes disappear for players and remain visible to owning
  staff for history.

## Future engine integration

The engine (later milestone) must:
1. build trees exclusively through these builders so validation passes;
2. select exercises only where `isEngineEligible` (approved, validated
   tier) — already enforced by tree validation;
3. respect each exercise's declared prescription types — enforced at
   set-field level;
4. respect `substitutionPolicy` per prescription and the SC3 substitution
   rules (pain always routes to stop-and-review, never to a swap);
5. publish through `publishProgrammeVersion` and assign only via
   `snapshotForProgrammeAssignment`;
6. fill week volume/intensity placeholders with authored summaries — the
   placeholders are strings by design so no silent arithmetic creeps in.

## Deferred decisions

- Where assignments live (per-athlete assignment records land with the
  assignment milestone; the snapshot shape here is their contract).
- Template instantiation semantics (template flag exists; copying rules
  arrive with coach tools).
- Server-side enforcement — all rules are pure-domain today and become the
  API layer's contract.
