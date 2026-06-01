# coacheseyeGPT Real MVP Testing

## Scope

This pass completed and audited the coach/player browser push availability workflow without redesigning the UI or rewriting the app.

## Manual Test Flow

1. Open the deployed `index.html` application.
2. Confirm the header shows the demo coach account and a saved status.
3. In Coach View, open Message Center.
4. Send a Tuesday training availability request.
5. Switch to the Simon player account.
6. Open Player View > Availability.
7. Mark Tuesday training as Available.
8. Refresh the browser.
9. Confirm Simon still shows Available for Tuesday.
10. Switch back to Demo coach.
11. Open Message Center and confirm Simon appears as Available in the Tuesday register.
12. Confirm only one coach message exists for Simon's Tuesday availability response even after clicking the same answer again.

---

# Phase 1 Auth Guard Testing

## Quick Start (No Firebase Required)

### Option A: Simple curl tests (fastest)

With a running local server, test without auth first:

```bash
# Should fail with 401 (no auth)
curl -X GET http://localhost:3001/api/chat?action=conversations

# Should fail with 401 (missing Bearer token)
curl -X POST http://localhost:3001/api/subscribe \
  -H "Content-Type: application/json" \
  -d '{"endpoint":"https://example.com"}'

# Should succeed with Bearer token (dummy token for local testing)
curl -X GET http://localhost:3001/api/chat?action=conversations \
  -H "Authorization: Bearer test-user-123"
```

### Option B: Automated test suite

```bash
# Make sure local server is running on port 3001
node test/test-local-api.js
```

This runs 10 tests covering auth rejection, auth acceptance, and user ID enforcement.

---

## Full Local Testing Setup

### Step 1: Start Vercel dev server locally

```bash
cd /Users/simondodd/CLAUDEPUSH

# Install Vercel CLI if needed
npm install -g vercel

# Start local dev server (runs serverless functions)
vercel dev
```

### Step 2: Quick mock auth (for local testing without Firebase)

For fast local iteration, use dummy tokens starting with `test-`:

```bash
NODE_ENV=development vercel dev
```

Then curl with:
```bash
curl -X GET http://localhost:3001/api/chat \
  -H "Authorization: Bearer test-user-123"
```

The `api/_auth.js` will accept any token starting with `test-` in development mode.

### Step 3: Real Firebase testing (final validation)

1. Get Firebase service account key:
   - Firebase Console > Project Settings > Service Accounts
   - Click "Generate New Private Key"
   - Save as `serviceAccountKey.json` in workspace root

2. Set environment variable:
   ```bash
   export FIREBASE_ADMIN_SDK_KEY=$PWD/serviceAccountKey.json
   ```

3. Start dev server:
   ```bash
   vercel dev
   ```

4. Get a real ID token from your Firebase project and test with it.

---

## Test Scenarios

### Scenario 1: Subscribe endpoint (requires auth)

```bash
# ✗ Without auth
curl -X POST http://localhost:3001/api/subscribe \
  -H "Content-Type: application/json" \
  -d '{"endpoint":"https://fcm.googleapis.com/push/test"}'
# Expected: 401 Unauthorized

# ✓ With auth
curl -X POST http://localhost:3001/api/subscribe \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-user-123" \
  -d '{"endpoint":"https://fcm.googleapis.com/push/test"}'
# Expected: 200 OK { "ok": true, ... }
```

### Scenario 2: Chat send (requires auth + user ID match)

```bash
# ✗ Without auth
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"action":"send","convId":"squad","senderId":"alice","text":"Hi"}'
# Expected: 401 Unauthorized

# ✗ Mismatched senderId (security check)
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-alice" \
  -d '{"action":"send","convId":"squad","senderId":"bob","text":"Hi"}'
# Expected: 403 Forbidden - "Sender must match authenticated user"

# ✓ Correct user sending as self
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-alice" \
  -d '{"action":"send","convId":"squad","senderId":"alice","text":"Hi"}'
# Expected: 200 OK with message created
```

### Scenario 3: Invite public token validation (NO auth required)

```bash
# ✓ Public token validation works without auth
curl -X GET "http://localhost:3001/api/invite?token=abc123"
# Expected: 404 (token doesn't exist, but NO 401 error)
```

### Scenario 4: Invite list/management (requires auth)

```bash
# ✗ List invites without auth
curl -X GET http://localhost:3001/api/invite
# Expected: 401 Unauthorized

# ✓ Create invite with auth
curl -X POST http://localhost:3001/api/invite \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-coach" \
  -d '{"name":"John","role":"player"}'
# Expected: 201 Created { "ok": true, "token": "...", ... }
```

### Scenario 5: Schedules (requires auth)

```bash
# ✗ Without auth
curl -X GET http://localhost:3001/api/schedules
# Expected: 401 Unauthorized

# ✓ With auth
curl -X GET http://localhost:3001/api/schedules \
  -H "Authorization: Bearer test-coach"
# Expected: 200 OK { "schedules": [...] }
```

---

## Checklist Before Committing

- [ ] All secured endpoints reject requests without `Authorization` header
- [ ] All secured endpoints accept requests with valid Bearer token
- [ ] Public endpoints (invite token validation) work without auth
- [ ] User ID fields match authenticated `uid` (senderId, userId, etc.)
- [ ] CORS includes `Authorization` header support
- [ ] Local tests pass: `node test/test-local-api.js`
- [ ] Vercel dev server starts: `vercel dev`
- [ ] No syntax errors: `node --check api/*.js`
13. Open a second browser tab with the same file.
14. Change availability in one tab.
15. Confirm the other tab updates when the newer saved revision is detected.

## Automated Verification Commands

```bash
node - <<'NODE'
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
for (const [i, match] of [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].entries()) {
  new Function(match[1]);
  console.log(`script ${i + 1} syntax ok`);
}
NODE
```

```bash
curl -I http://localhost:8123/coach-eye-real-mvp.html
```

```bash
npm test
```

The automated tests cover message template variables, timezone scheduling, saved no-reply targeting, saved availability responses, and rejection of unregistered response devices. They use simulated Redis storage and do not consume live Upstash requests.

## Live Push Test

1. Configure Vercel settings from `PUSH_NOTIFICATIONS.md` and redeploy.
2. Open Player View on a phone, enable notifications, and leave the page installed/open as required by the browser.
3. In Coach View > Message Center, send an availability message.
4. Tap a response action on the phone notification.
5. Refresh the Message Center status list and confirm the answer is saved.

## Test Accounts

- Coach: `coach@coachseye.test`, PIN `1111`
- Simon player: `simon@coachseye.test`, PIN `2222`
- Alexis player: `alexis@coachseye.test`, PIN `3333`

## What Was Checked

- Browser refresh persistence.
- Local backup recovery path.
- Duplicate availability response prevention.
- Coach-only message sending and medical check-in actions.
- Player-only message replies.
- Multiple tab revision sync.
- Blank message protection.
- Message thread persistence.
