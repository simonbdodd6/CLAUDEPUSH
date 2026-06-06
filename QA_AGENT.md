# Nightly QA Agent

This adds a Playwright QA agent for the Coach's Eye real user journey. It only adds testing, QA scripts, and documentation.

## Local Run

Start the app locally with the API routes available, for example:

```sh
npx vercel dev --listen 3000
```

Then run:

```sh
QA_BASE_URL=http://127.0.0.1:3000 \
QA_COACH_EMAIL=simonbdodd@gmail.com \
QA_COACH_PASSWORD='<set-explicit-coach-password>' \
QA_TEST_PLAYER_EMAIL=nightly-qa-local@example.com \
QA_TEST_PLAYER_PASSWORD='CoachEyeQA123!' \
npm run qa:e2e
```

Use `npm run qa:headed` to watch the browser. Use `npm run qa:report` to regenerate `QA_REPORT.md` from the last structured QA result.

On this macOS 12.7.6 machine, Playwright Chrome/Chromium launch fails inside the Codex filesystem sandbox before app code runs. The smoke test passes when run outside that sandbox. If local launch fails with `SIGABRT`, run:

```sh
npm run qa:smoke
npm run qa:e2e:headed
```

from a normal terminal, or run the GitHub Actions workflow below.

## Vercel Preview Run

```sh
QA_BASE_URL=https://your-preview-url.vercel.app \
QA_COACH_EMAIL=simonbdodd@gmail.com \
QA_COACH_PASSWORD='<set-explicit-coach-password>' \
QA_TEST_PLAYER_EMAIL=nightly-qa-preview@example.com \
QA_TEST_PLAYER_PASSWORD='CoachEyeQA123!' \
npm run qa:e2e
```

For stable nightly runs, use a unique `QA_TEST_PLAYER_EMAIL` each run or add a reset/cleanup endpoint before making the check blocking.

## Environment

- `QA_BASE_URL`: preview or local URL.
- `QA_COACH_EMAIL`: Simon Coach account email.
- `QA_COACH_PASSWORD`: Simon Coach account password.
- `QA_TEST_PLAYER_EMAIL`: new player email for this run.
- `QA_TEST_PLAYER_PASSWORD`: new player password for this run.
- `QA_EXPECTED_BASELINE_PLAYERS`: optional comma-separated roster names expected before the invite flow. Defaults to empty, matching the current local seed.

If the deployed environment temporarily enables the legacy Simon Coach login bridge, set `QA_COACH_PASSWORD` explicitly from that environment secret. The QA agent does not include a shared password fallback.

## Artifacts

- `QA_REPORT.md`: generated markdown report.
- `qa/results/qa-run.json`: structured result used by the report generator.
- `qa/artifacts/<run-id>/`: screenshots for each major step.
- `qa/playwright-report/`: Playwright HTML report.
- `qa/test-results/`: traces, videos, and failure screenshots.

## Browser Smoke

Run the minimal browser check before the full journey:

```sh
QA_BASE_URL=http://127.0.0.1:3000 npm run qa:smoke
```

The smoke test only launches the browser, opens `QA_BASE_URL`, takes a screenshot, and closes.

## Nightly GitHub Actions Next Steps

- Add a scheduled workflow with `cron`.
- Run `npm ci` and `npx playwright install --with-deps chromium`.
- Set the QA environment variables as GitHub Actions secrets or environment variables.
- Run `npm run qa:e2e`.
- Upload `QA_REPORT.md`, `qa/artifacts`, `qa/playwright-report`, and `qa/test-results`.
- Keep the job non-blocking until test data cleanup is available.
