Review Coach's Eye Intelligence (Brain) layer changes to ensure they stay within their permitted boundary.

The Brain may ONLY: read published Core APIs, add files under lib/executive-*, consciousness/, or app/command-centre/. It must NEVER modify Core files (index.html, api/*.js, package.json, test/).

Scope: $ARGUMENTS (if blank, check git diff main..HEAD for Brain-related commits).

Checks to perform:

1. PERMITTED FILE PATHS
   Brain commits may only touch:
   - lib/executive-*/
   - consciousness/
   - app/command-centre/
   Any Brain commit that touches index.html, api/*.js, package.json, or test/ is a VIOLATION.
   Run: git diff main..HEAD --name-only | grep -v -E "^(lib/executive|consciousness|app/command-centre)"

2. CORE API READS ONLY
   Brain files must only call Core by reading published endpoints or events.
   Flag any Brain file that imports a Core module directly (not via API call).
   Run: grep -rn "require.*\.\./index\|import.*index\.html\|require.*api/" lib/executive-* consciousness/ 2>/dev/null

3. NO SIDE EFFECTS ON CORE DATA
   Brain must not write to Redis keys owned by Core (club:*, team:*, player:*, session:*).
   Flag any Redis SET/HSET/DEL in Brain files targeting Core namespaces.

4. ISOLATION ON MAIN
   Confirm Brain files are NOT present on the main branch:
   Run: git ls-tree -r main --name-only | grep -E "executive|consciousness|command-centre"
   Required: zero matches.

5. FEATURE FLAG GUARD
   Any Brain capability surfaced in Core UI must be behind a feature flag.
   Confirm the flag exists and defaults to disabled.

6. NO NEW CORE DEPENDENCIES
   Brain commits must not add packages to package.json that Core would need to install.
   Run: git diff main -- package.json

Output:
- Each check: PASS or VIOLATION with file:line
- Verdict: BRAIN BOUNDARY INTACT / BRAIN BOUNDARY VIOLATED
- If violated: exact files and commits that must be excluded from any merge to main

Rules:
- Report only. Do not modify any files.
- Do not merge Brain commits to main under any circumstances.
- Do not work on QA Agent or merge feature/nightly-qa-agent.
