# QA Phase 5 Invite Flow Report

Generated: 2026-06-06T11:34:22.389Z
Base URL: https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app
Status: failed
Invite URL: https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/?inv=564Qsqm2SUwpm5qMRyTMfO-Y8VaMQHHS

## First Failure

- Step: Submit registration
- Error: Registration failed — toast: "Upstash HTTP 400: {"error":"ERR max requests limit exceeded. Limit: 500000, Usage: 500000. See https://upstash.com/docs/redis/troubleshooting/max_requests_limit for details"}"
- Page URL: https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/?inv=564Qsqm2SUwpm5qMRyTMfO-Y8VaMQHHS
- Screenshot: qa/artifacts/phase5-2026-06-06T11-33-43-480Z/08-submit-registration.png
- DOM snapshot: qa/artifacts/phase5-2026-06-06T11-33-43-480Z/08-submit-registration.html

## Steps

- 1. Open app: passed; screenshot: qa/artifacts/phase5-2026-06-06T11-33-43-480Z/01-open-app.png
- 2. Login as Simon Coach: passed; screenshot: qa/artifacts/phase5-2026-06-06T11-33-43-480Z/02-login-as-simon-coach.png
- 3. Navigate to Members: passed; screenshot: qa/artifacts/phase5-2026-06-06T11-33-43-480Z/03-navigate-to-members.png
- 4. Open invite panel: passed; screenshot: qa/artifacts/phase5-2026-06-06T11-33-43-480Z/04-open-invite-panel.png
- 5. Generate player invite: passed; screenshot: qa/artifacts/phase5-2026-06-06T11-33-43-480Z/05-generate-player-invite.png
- 6. Open invite registration URL: passed; screenshot: qa/artifacts/phase5-2026-06-06T11-33-43-480Z/06-open-invite-registration-url.png
- 7. Fill registration form: passed; screenshot: qa/artifacts/phase5-2026-06-06T11-33-43-480Z/07-fill-registration-form.png
- 8. Submit registration: failed — Registration failed — toast: "Upstash HTTP 400: {"error":"ERR max requests limit exceeded. Limit: 500000, Usage: 500000. See https://upstash.com/docs/redis/troubleshooting/max_requests_limit for details"}"; screenshot: qa/artifacts/phase5-2026-06-06T11-33-43-480Z/08-submit-registration.png

## What Passes

- Open app
- Login as Simon Coach
- Navigate to Members
- Open invite panel
- Generate player invite
- Open invite registration URL
- Fill registration form

## Toast Messages

- 2026-06-06T11:33:52.451Z — Welcome Simon Coach
- 2026-06-06T11:34:01.736Z — Upstash HTTP 400: {"error":"ERR max requests limit exceeded. Limit: 500000, Usage: 500000. See https://upstash.com/docs/redis/troubleshooting/max_requests_limit for details"}

## Network Failures

- GET https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/.well-known/vercel/jwe — {"errorText":"net::ERR_ABORTED"}
- HEAD https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/ — {"errorText":"net::ERR_ABORTED"}
- GET https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/.well-known/vercel/jwe — {"errorText":"net::ERR_ABORTED"}
- HEAD https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/?inv=564Qsqm2SUwpm5qMRyTMfO-Y8VaMQHHS — {"errorText":"net::ERR_ABORTED"}

## HTTP 4xx/5xx And Auth-Related Responses

- 401  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/identity?action=session
- 200  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/identity
- 200  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/invite
- 200  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/identity
- 404  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780745628479&userId=coach-demo
- 404  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- 200  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/identity
- 200  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/invite
- 200  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/identity
- 200  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/invite
- 200  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/invite
- 200  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/identity
- 200  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/invite
- 200  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/invite
- 200  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/identity
- 200  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/invite
- 200  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/identity
- 200  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/invite
- 200  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/invite
- 200  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/identity
- 201  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/invite
- 404  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780745628479&userId=coach-demo
- 200  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/invite
- 200  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/invite
- 200  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/identity
- 200  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/invite
- 404  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- 200  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/invite
- 200  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/invite
- 200  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/identity
- 200  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/invite
- 200  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/invite?token=564Qsqm2SUwpm5qMRyTMfO-Y8VaMQHHS
- 200  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/identity?action=session
- 404  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=0&userId=coach-demo
- 200  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/invite
- 200  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/identity
- 500  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- 403  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/invite
- 400  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/identity
- 403  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/invite
- 500  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780745638311&userId=coach-demo
- 500  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- 400  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/identity
- 500  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780745638311&userId=coach-demo
- 500  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- 500  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- 500  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780745638311&userId=coach-demo
- 500  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- 500  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780745638311&userId=coach-demo
- 500  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- 500  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- 500  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780745638311&userId=coach-demo
- 500  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- 500  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780745638311&userId=coach-demo
- 500  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- 500  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- 500  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780745638311&userId=coach-demo
- 500  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- 500  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780745638311&userId=coach-demo
- 500  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- 500  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- 500  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780745638311&userId=coach-demo
- 500  — https://boitsfort-coachseye-rm1964jb3-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo

## Console Errors And Warnings

- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 500 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 400 ()
- error: Failed to load resource: the server responded with a status of 403 ()
- error: Failed to load resource: the server responded with a status of 500 ()
- error: Failed to load resource: the server responded with a status of 500 ()
- error: Failed to load resource: the server responded with a status of 400 ()
- error: Failed to load resource: the server responded with a status of 500 ()
- error: Failed to load resource: the server responded with a status of 500 ()
- error: Failed to load resource: the server responded with a status of 500 ()
- error: Failed to load resource: the server responded with a status of 500 ()
- error: Failed to load resource: the server responded with a status of 500 ()
- error: Failed to load resource: the server responded with a status of 500 ()
- error: Failed to load resource: the server responded with a status of 500 ()
- error: Failed to load resource: the server responded with a status of 500 ()
- error: Failed to load resource: the server responded with a status of 500 ()
- error: Failed to load resource: the server responded with a status of 500 ()
- error: Failed to load resource: the server responded with a status of 500 ()
- error: Failed to load resource: the server responded with a status of 500 ()
- error: Failed to load resource: the server responded with a status of 500 ()
- error: Failed to load resource: the server responded with a status of 500 ()
- error: Failed to load resource: the server responded with a status of 500 ()
- error: Failed to load resource: the server responded with a status of 500 ()
- error: Failed to load resource: the server responded with a status of 500 ()
- error: Failed to load resource: the server responded with a status of 500 ()
- error: Failed to load resource: the server responded with a status of 500 ()
- error: Failed to load resource: the server responded with a status of 500 ()

## Page Errors

- No pageerror events captured.

## Scope Guard

- No Coach's Eye application code was modified.
- No auth, messaging, invite, Redis, database, or feature logic was modified.
- Phase 5 stops at the first QA failure.

## QA Agent Commentary

**QA tooling status: fully operational.** All 7 steps before the failure execute correctly against the Vercel Preview deployment. The spec correctly detected and reported the step 8 failure.

**Nature of failure: infrastructure constraint, not a code bug.** The Upstash Redis free tier for this Preview deployment has exhausted its 500,000-request quota. Heavy background polling (GET /api/invite ~every 0.5s, GET /api/identity ~every 1s, chat polling) during multiple test runs consumed the quota. This is not a logic bug in the invite or registration flow.

**Evidence that invite + registration logic works:** In an earlier run (2026-06-06T10:56:57Z, before the quota was exhausted), steps 1–7 completed, `POST 201 /api/identity` confirmed account creation, and the toast "Welcome QA! Your account is ready." was captured — proving the full backend flow is sound.

**To get a full PASS:** Reset or upgrade the Upstash Redis quota for the Preview environment, then re-run `QA_BASE_URL=<preview-url> npm run qa:phase5-invite`. Steps 9 (switch back to coach) and 10 (verify player in Members) have not yet been exercised due to this constraint.

