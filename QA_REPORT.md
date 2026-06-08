# QA Report

Generated: 2026-06-08T13:58:13.996Z
Base URL: https://boitsfort-coachseye-4adn3a8q0-simonbdodd-9233s-projects.vercel.app
Status: failed

## Summary

- Passed steps: 0
- Failed steps: 1
- Skipped steps: 0
- Test player email: not set
- Expected baseline players: (none)

## Browser Launch

- Local browser smoke status: passed
- Browser channel: system chrome fallback
- Cloud GitHub Actions recommended: yes for nightly QA; local macOS 12.7.6 browser launch requires running outside the Codex sandbox
- Launch browser, open QA_BASE_URL, save screenshot, close browser: passed

## Step Results

| # | Step | Status | Screenshot | Notes |
|---:|---|---|---|---|
| 1 | Launch Playwright Chromium | failed |  | Playwright exited before the QA journey started (exit code 1). See qa/test-results/workflow-13-role-switching-809a0-le-Switching-Coach-↔-Player-chromium/error-context.md. |

## What Passes

- Nothing has passed yet.

## What Fails

- Launch Playwright Chromium: Playwright exited before the QA journey started (exit code 1). See qa/test-results/workflow-13-role-switching-809a0-le-Switching-Coach-↔-Player-chromium/error-context.md.

## Notes

- The QA agent does not modify app, authentication, messaging, Redis, or data architecture code.
- Group invite creation is attempted through the real invite API because the current UI only exposes personal invite links.
- Coach login must use explicit `QA_COACH_EMAIL` and `QA_COACH_PASSWORD`; the QA agent no longer supplies a shared legacy password fallback.
- Diagnosis: sandboxed local Playwright runs on macOS 12.7.6 abort Chrome/Chromium before navigation. Running the same smoke command outside the Codex sandbox launches Chrome, opens the app, screenshots, and closes successfully.
- The browser failed before the first journey step, so no app behavior was exercised.

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

