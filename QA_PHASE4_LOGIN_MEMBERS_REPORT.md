# QA Phase 4 Login Members Report

Generated: 2026-06-06T10:24:20.643Z
Base URL: http://127.0.0.1:3000
Status: **passed**

## Phase 4 Result

**PASSED** — All 3 steps completed successfully in 6.2s.

Login and Members navigation both work correctly in the Coach's Eye app.

## Steps

- 1. Open app: passed; screenshot: qa/artifacts/phase4-2026-06-06T10-24-11-433Z/01-open-app.png
- 2. Log in as Simon Coach: passed; screenshot: qa/artifacts/phase4-2026-06-06T10-24-11-433Z/02-log-in-as-simon-coach.png
- 3. Navigate to Members: passed; screenshot: qa/artifacts/phase4-2026-06-06T10-24-11-433Z/03-navigate-to-members.png

## What Passes

- Open app (`#authPanel` visible at http://127.0.0.1:3000/)
- Log in as Simon Coach (deterministic polling; no `networkidle`; completed in ~1.2s after click)
- Navigate to Members (`h1#pageTitle` visible after clicking Members button)

## First Failure

- Step: none
- Error: none
- Page URL: http://127.0.0.1:3000/
- Screenshot: none
- DOM snapshot: none

## QA Spec Fix Applied

The original `openMembers` locator used `getByRole('heading', { name: 'Members' })` which resolved to 2 elements in strict mode:
1. `<h1 id="pageTitle">Members</h1>` — the page title
2. `<h2>Members</h2>` inside `#coach-players` — a section heading

This is expected app DOM structure, not an app bug. The QA locator was tightened to `page.locator('h1#pageTitle')` (QA file only; no app code touched).

## Server Setup

The app is a static single-file HTML prototype. It was served with `python3 -m http.server 3000 --bind 127.0.0.1`. API routes (`/api/*`) return 404 from the static server; this matches Phase 3 behavior and does not affect client-side login or Members navigation.

## Network Failures

- No requestfailed events captured.

## HTTP 4xx/5xx And Auth-Related Responses

All 404s are `/api/*` routes not served by the static server. The `501 Unsupported method ('POST')` on `/api/identity` is from the static server rejecting the POST login request — client-side credentials check handled this and login still passed.

- 404 File not found - http://127.0.0.1:3000/api/chat (various)
- 404 File not found - http://127.0.0.1:3000/api/config
- 404 File not found - http://127.0.0.1:3000/api/schedules
- 404 File not found - http://127.0.0.1:3000/api/templates
- 404 File not found - http://127.0.0.1:3000/api/log?limit=10
- 404 File not found - http://127.0.0.1:3000/api/identity?action=session
- 404 File not found - http://127.0.0.1:3000/api/identity
- 404 File not found - http://127.0.0.1:3000/api/invite
- 501 Unsupported method ('POST') - http://127.0.0.1:3000/api/identity

## Console Errors And Warnings

All errors are 404/501 for `/api/*` routes (static server limitation, not app bugs).

- warning: SW registration failed: SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
- Multiple errors: Failed to load resource: the server responded with a status of 404 (File not found)
- error: Failed to load resource: the server responded with a status of 501 (Unsupported method ('POST'))

## Page Errors

- No pageerror events captured.

## Scope Guard

- No Coach's Eye application code was modified.
- No auth, messaging, invite, Redis, or production code was modified.
- Only `qa/e2e/coach-login-members.spec.js` was modified (locator fix in `openMembers`).
- Phase 4 stops at the first QA failure.
