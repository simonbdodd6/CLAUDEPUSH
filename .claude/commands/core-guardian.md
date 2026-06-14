Enforce the Coach's Eye Core/Intelligence architectural boundary.

Core must remain fully functional if every AI service is offline. Core never imports Intelligence.

Scope: $ARGUMENTS (if blank, check the full working tree).

Checks to perform:

1. IMPORT BOUNDARY — index.html
   Run: grep -n "executive\|consciousness\|command-centre\|brain\|intelligence" index.html
   Required: zero matches (case-insensitive).
   Any match is a CRITICAL boundary violation.

2. IMPORT BOUNDARY — /api/*.js
   Run: grep -rn "executive\|consciousness\|command-centre" api/
   Required: zero matches.

3. AI FILES NOT ON CORE BRANCHES
   Check: the following paths must not appear in any commit on main
   - lib/executive-*
   - consciousness/
   - app/command-centre/dist/
   Run: git log main --name-only --pretty=format: | grep -E "executive|consciousness|command-centre"
   Required: zero matches.

4. FEATURE FLAGS
   Confirm that any AI feature in index.html is guarded by a feature flag check
   (e.g., `if (flags.intelligenceEnabled)`) so it degrades gracefully when AI is offline.

5. CORE API SURFACE
   List all functions/endpoints that Intelligence layer is permitted to call (the published Core API).
   Confirm none of them have been removed or renamed without a migration path.

6. NEW DEPENDENCIES
   Check package.json / any import statements for new AI/ML packages added to the Core layer.
   Run: grep -n "openai\|anthropic\|langchain\|tensorflow\|replicate" package.json index.html api/*.js
   Required: zero matches in Core files.

Output:
- Each check: PASS or VIOLATION with file:line
- Severity of violations: [CRITICAL — blocks merge] [HIGH — must fix before release] [MEDIUM — address this sprint]
- Verdict: BOUNDARY INTACT / BOUNDARY VIOLATED

Rules:
- Report only. Do not modify any files.
- A CRITICAL violation blocks any merge to main until resolved.
- Do not merge feature/design-system or any branch that contains executive/consciousness/command-centre files into main.
