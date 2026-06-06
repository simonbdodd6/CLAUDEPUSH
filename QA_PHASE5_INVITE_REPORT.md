# QA Phase 5 Invite Flow Report

Generated: 2026-06-06T12:04:04.626Z
Base URL: https://boitsfort-coachseye-i8ae33djo-simonbdodd-9233s-projects.vercel.app
Status: failed


## First Failure

- Step: Login as Simon Coach
- Error: Login failed — toast: "Upstash HTTP 400: {"error":"ERR max requests limit exceeded. Limit: 500000, Usage: 500000. See https://upstash.com/docs/redis/troubleshooting/max_requests_limit for details"}"
- Page URL: https://boitsfort-coachseye-i8ae33djo-simonbdodd-9233s-projects.vercel.app/
- Screenshot: qa/artifacts/phase5-2026-06-06T12-03-51-298Z/02-login-as-simon-coach.png
- DOM snapshot: qa/artifacts/phase5-2026-06-06T12-03-51-298Z/02-login-as-simon-coach.html

## Steps

- 1. Open app: passed; screenshot: qa/artifacts/phase5-2026-06-06T12-03-51-298Z/01-open-app.png
- 2. Login as Simon Coach: failed — Login failed — toast: "Upstash HTTP 400: {"error":"ERR max requests limit exceeded. Limit: 500000, Usage: 500000. See https://upstash.com/docs/redis/troubleshooting/max_requests_limit for details"}"; screenshot: qa/artifacts/phase5-2026-06-06T12-03-51-298Z/02-login-as-simon-coach.png

## What Passes

- Open app

## Toast Messages

- 2026-06-06T12:04:03.806Z — Upstash HTTP 400: {"error":"ERR max requests limit exceeded. Limit: 500000, Usage: 500000. See https://upstash.com/docs/redis/troubleshooting/max_requests_limit for details"}

## Network Failures

- GET https://boitsfort-coachseye-i8ae33djo-simonbdodd-9233s-projects.vercel.app/.well-known/vercel/jwe — {"errorText":"net::ERR_ABORTED"}
- HEAD https://boitsfort-coachseye-i8ae33djo-simonbdodd-9233s-projects.vercel.app/ — {"errorText":"net::ERR_ABORTED"}

## HTTP 4xx/5xx And Auth-Related Responses

- 500  — https://boitsfort-coachseye-i8ae33djo-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- 401  — https://boitsfort-coachseye-i8ae33djo-simonbdodd-9233s-projects.vercel.app/api/log?limit=10
- 401  — https://boitsfort-coachseye-i8ae33djo-simonbdodd-9233s-projects.vercel.app/api/schedules
- 401  — https://boitsfort-coachseye-i8ae33djo-simonbdodd-9233s-projects.vercel.app/api/identity?action=session
- 401  — https://boitsfort-coachseye-i8ae33djo-simonbdodd-9233s-projects.vercel.app/api/templates
- 500  — https://boitsfort-coachseye-i8ae33djo-simonbdodd-9233s-projects.vercel.app/api/chat?action=conversations&userId=coach-demo
- 401  — https://boitsfort-coachseye-i8ae33djo-simonbdodd-9233s-projects.vercel.app/api/templates
- 401  — https://boitsfort-coachseye-i8ae33djo-simonbdodd-9233s-projects.vercel.app/api/identity
- 500  — https://boitsfort-coachseye-i8ae33djo-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=0&userId=coach-demo
- 401  — https://boitsfort-coachseye-i8ae33djo-simonbdodd-9233s-projects.vercel.app/api/invite
- 500  — https://boitsfort-coachseye-i8ae33djo-simonbdodd-9233s-projects.vercel.app/api/chat?action=messages&convId=coach&since=1780747440400&userId=coach-demo
- 500  — https://boitsfort-coachseye-i8ae33djo-simonbdodd-9233s-projects.vercel.app/api/chat?action=typing&convId=coach&userId=coach-demo
- 400  — https://boitsfort-coachseye-i8ae33djo-simonbdodd-9233s-projects.vercel.app/api/identity

## Console Errors And Warnings

- error: Failed to load resource: the server responded with a status of 500 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 500 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 500 ()
- error: Failed to load resource: the server responded with a status of 404 ()
- error: Failed to load resource: the server responded with a status of 401 ()
- error: Failed to load resource: the server responded with a status of 500 ()
- error: Failed to load resource: the server responded with a status of 500 ()
- error: Failed to load resource: the server responded with a status of 400 ()

## Page Errors

- No pageerror events captured.

## Scope Guard

- No Coach's Eye application code was modified.
- No auth, messaging, invite, Redis, database, or feature logic was modified.
- Phase 5 stops at the first QA failure.

