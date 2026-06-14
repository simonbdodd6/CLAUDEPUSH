Review the Coach's Eye Redis data layer. Scope: $ARGUMENTS (if blank, audit all /api/*.js files and any Redis key access in index.html).

Checks to perform:

1. KEY NAMESPACE ISOLATION
   - All keys must be scoped to club or team: e.g. `club:{clubId}:...` or `team:{teamId}:...`
   - Flag any key pattern that could allow cross-club data access
   - Flag any key built from unvalidated user input

2. TTL HYGIENE
   - Session keys, invite codes, and one-time tokens must have TTLs
   - Persistent data (player records, club settings) must NOT have TTLs that could silently expire data
   - Flag any `SET` without `EX` where the data is ephemeral

3. ATOMICITY
   - Multi-step Redis operations (read-then-write) that are not wrapped in a transaction/pipeline
   - Patterns that could leave Redis in a partially-written state on crash

4. DATA SHAPE CONSISTENCY
   - Are the same logical entities stored consistently (always as Hash, or always as JSON string — not mixed)?
   - Are field names consistent across read and write paths for the same key?

5. MISSING DATA HANDLING
   - Is every Redis GET followed by a null check before use?
   - Does the app crash or return 500 if a key is unexpectedly missing?

6. OVER-FETCHING
   - Are there HGETALL calls on large hashes where only one field is needed?
   - KEYS or SCAN patterns that could block Redis on large datasets?

7. MIGRATION SAFETY
   - Do not create Redis migrations without a proven root cause (per standing project rule)
   - Flag any migration script and ask: is the root cause confirmed?

Output:
- Grouped by the 7 categories above
- Each finding: file:line — description — recommended fix
- Severity: [DATA LOSS RISK] [SECURITY] [PERFORMANCE] [HYGIENE]

Rules:
- Report only. Do not modify any files.
- Do not create Redis migrations as part of this review.
