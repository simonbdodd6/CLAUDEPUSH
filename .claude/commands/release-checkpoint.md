Run a full pre-release checklist for Coach's Eye before merging to main or deploying to Vercel.

Checklist — check every item and report PASS / FAIL / WARN:

1. TESTS
   Run: npm test
   Required: 0 failures. If any fail, BLOCK release and list failing test names.

2. AI BRAIN BOUNDARY
   Check: no files from lib/executive-*, consciousness/, or app/command-centre/dist/ are staged or committed to main
   Run: git diff main --name-only | grep -E "executive|consciousness|command-centre"
   Required: zero matches. If any found, BLOCK release.

3. SIMON TEST PLAYER INTEGRITY
   Check: no commits that delete, rename, or alter Simon Test Player's data or identity
   Run: git log main..HEAD --oneline | head -20 — review for any identity/auth/player commits
   Required: no identity changes without explicit approval.

4. MISSION CONTROL UNTOUCHED
   Check: api/mission-control.js must not appear in the diff
   Run: git diff main -- api/mission-control.js
   Required: zero diff. If touched, BLOCK release.

5. CORE/INTELLIGENCE ISOLATION
   Check: index.html must not import from lib/executive-*, consciousness/, or app/command-centre/
   Run: grep -n "executive\|consciousness\|command-centre" index.html
   Required: zero matches.

6. VERCEL FUNCTION CAP
   Check: count of /api/*.js files must not exceed 12 (Vercel Hobby plan limit)
   Run: ls api/*.js | wc -l
   Required: ≤ 12. If exceeded, WARN and list which to consolidate.

7. NO HARDCODED SECRETS
   Run: grep -rn "ghp_\|sk-\|AIza\|AKIA\|fc-[a-zA-Z0-9]" --include="*.js" --include="*.html" .
   Required: zero matches in tracked files.

8. INDEX.HTML SANITY
   Check: index.html must be valid (no unclosed tags, no broken template literals)
   Run: node -e "require('fs').readFileSync('index.html','utf8'); console.log('OK')"
   Required: no parse/read errors.

9. CLEAN WORKING TREE
   Run: git status
   Required: no uncommitted changes to tracked files before tagging.

10. COMMIT MESSAGE FORMAT
    Run: git log main..HEAD --oneline
    Required: all commits follow `feat(scope): description` or `fix(scope): description` format.

Output:
- Table: Item | Status | Notes
- VERDICT at the bottom: GO / HOLD
- If HOLD: list every blocking issue with file references

Rules:
- This is a review only. Do not push, tag, merge, or deploy unless the user explicitly instructs.
- Do not skip any checklist item.
