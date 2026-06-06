# QA Report

Generated: 2026-06-06T10:08:43.566Z
Base URL: http://localhost:3000
Status: failed

## Summary

- Passed steps: 1
- Failed steps: 1
- Skipped steps: 0
- Test player email: nightly-qa-1780740167@coachseye.test
- Expected baseline players: (none)

## Browser Launch

- Local browser smoke status: passed
- Browser channel: system chrome fallback
- Cloud GitHub Actions recommended: yes for nightly QA; local macOS 12.7.6 browser launch requires running outside the Codex sandbox
- Launch browser, open QA_BASE_URL, save screenshot, close browser: passed

## Step Results

| # | Step | Status | Screenshot | Notes |
|---:|---|---|---|---|
| 1 | Open latest preview or local app | passed | [02-open-latest-preview-or-local-app.png](qa/artifacts/2026-06-06T10-03-04-537Z/02-open-latest-preview-or-local-app.png) |  |
| 2 | Log in as Simon Coach | failed |  | page.evaluate: Target page, context or browser has been closed |

## What Passes

- Open latest preview or local app

## What Fails

- Log in as Simon Coach: page.evaluate: Target page, context or browser has been closed

## Notes

- The QA agent does not modify app, authentication, messaging, Redis, or data architecture code.
- Group invite creation is attempted through the real invite API because the current UI only exposes personal invite links.
- The legacy Simon Coach credential is currently a temporary seeded password/PIN (`1111`) for the seeded coach account. Keep using explicit `QA_COACH_EMAIL` and `QA_COACH_PASSWORD` until production auth is finalized.
- Diagnosis: sandboxed local Playwright runs on macOS 12.7.6 abort Chrome/Chromium before navigation. Running the same smoke command outside the Codex sandbox launches Chrome, opens the app, screenshots, and closes successfully.

## GitHub Actions Nightly Next Steps

- Add a scheduled workflow that runs `npm ci`, installs Playwright browsers, and executes `npm run qa:e2e` against a Vercel preview URL.
- Store `QA_BASE_URL`, `QA_COACH_EMAIL`, `QA_COACH_PASSWORD`, `QA_TEST_PLAYER_EMAIL`, and `QA_TEST_PLAYER_PASSWORD` as GitHub Actions secrets or environment variables.
- Upload `QA_REPORT.md`, `qa/artifacts`, `qa/test-results`, and `qa/playwright-report` as workflow artifacts.
- Use a unique nightly `QA_TEST_PLAYER_EMAIL` or provision a cleanup/reset path before making the run blocking.

## Exact Commands

```sh
npm run qa:smoke
npm run qa:e2e
npm run qa:e2e:headed
QA_BROWSER_CHANNEL=chromium npm run qa:smoke
QA_BROWSER_CHANNEL=chrome QA_HEADLESS=false npm run qa:smoke
```

