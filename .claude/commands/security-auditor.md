Perform a security audit of the Coach's Eye codebase. Focus on the areas below. Scope: $ARGUMENTS (if blank, audit the full codebase).

Audit checklist — check every item and report findings:

1. AUTHENTICATION & AUTHORIZATION
   - Are all API routes protected? Check /api/*.js for missing auth middleware
   - Are coach vs player vs admin roles enforced at the API layer, not just the UI
   - Can a player impersonate a coach or access another team's data?

2. PUBLIC ENDPOINTS
   - List every endpoint that accepts requests without a session/token
   - Confirm each one is intentionally public and cannot leak private data

3. RATE LIMITING
   - Are write endpoints (login, register, message send) rate-limited?
   - Can any endpoint be called in a tight loop to cause resource exhaustion?

4. INPUT VALIDATION
   - Is user-supplied data validated before reaching Redis or any storage?
   - Are there injection risks in key construction (e.g. `club:${userInput}:data`)?
   - Are numeric inputs (minute values, jersey numbers) bounded?

5. ENVIRONMENT VARIABLES & SECRETS
   - Are all secrets (Redis URL, API keys, push keys) read from process.env only?
   - Is there any hardcoded secret, token, or credential in tracked files?
   - Run: grep -r "sk-\|ghp_\|AIza\|AKIA\|password\s*=\s*['\"]" --include="*.js" --include="*.html" .

6. DATABASE ACCESS RULES (Redis)
   - Are Redis key namespaces scoped by club/team to prevent cross-team data access?
   - Can a request read or delete keys outside its own club namespace?
   - Are TTLs set on ephemeral keys (sessions, codes)?

7. USER ROLES & PERMISSIONS
   - Verify that the permissions engine (api/permissions.js or similar) is called consistently
   - Spot any route that skips the permissions check and accesses data directly
   - Check that role elevation (e.g. player → coach) requires explicit admin approval

8. OWASP WEB APP RISKS
   - XSS: Is user content rendered via innerHTML anywhere without sanitisation?
   - CSRF: Do state-mutating requests require a same-site cookie or token?
   - Sensitive data exposure: Are error messages verbose enough to leak internal paths or keys?
   - Security misconfiguration: Are debug endpoints, dev routes, or verbose logging reachable in prod?

9. PUSH NOTIFICATION SECURITY
   - Can a user subscribe to push notifications for another user's events?
   - Is the push subscription validated server-side before storing?
   - Are VAPID keys stored securely (env vars only)?

10. MESSAGING PRIVACY
    - Can a coach read messages from another club's players?
    - Can a player read messages not addressed to them?
    - Is message data scoped by club and conversation ID throughout the stack?

Output format:
- Group findings by the 10 categories above
- Each finding: [CRITICAL/HIGH/MEDIUM/LOW] file:line — description — recommended fix
- End with: total findings per severity, and a TOP 3 PRIORITIES list

Rules:
- REPORT ONLY. Do not modify any code or files.
- Do not raise hypothetical risks — every finding must be traceable to actual code.
- If a check passes cleanly, state "PASS" for that category — do not omit it.
- Do not modify Mission Control (api/mission-control.js) under any circumstances.
