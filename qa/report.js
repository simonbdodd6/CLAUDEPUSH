import fs from 'node:fs';
import path from 'node:path';

const resultPath = path.join(process.cwd(), 'qa/results/qa-run.json');
const smokePath = path.join(process.cwd(), 'qa/results/browser-smoke.json');
const reportPath = path.join(process.cwd(), 'QA_REPORT.md');

function readResult() {
  if (!fs.existsSync(resultPath)) {
    return {
      status: 'not-run',
      startedAt: null,
      finishedAt: new Date().toISOString(),
      baseURL: process.env.QA_BASE_URL || 'http://127.0.0.1:3000',
      steps: [],
      notes: ['No qa/results/qa-run.json file exists yet. Run npm run qa:e2e first.'],
    };
  }
  return JSON.parse(fs.readFileSync(resultPath, 'utf8'));
}

function rel(file) {
  return file ? path.relative(process.cwd(), file).replaceAll(path.sep, '/') : '';
}

function mdEscape(value) {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
}

const result = readResult();
const smoke = fs.existsSync(smokePath) ? JSON.parse(fs.readFileSync(smokePath, 'utf8')) : null;
const passed = result.steps.filter(step => step.status === 'passed');
const failed = result.steps.filter(step => step.status === 'failed');
const skipped = result.steps.filter(step => step.status === 'skipped');

const lines = [
  '# QA Report',
  '',
  `Generated: ${new Date().toISOString()}`,
  `Base URL: ${result.baseURL || 'unknown'}`,
  `Status: ${result.status || 'unknown'}`,
  '',
  '## Summary',
  '',
  `- Passed steps: ${passed.length}`,
  `- Failed steps: ${failed.length}`,
  `- Skipped steps: ${skipped.length}`,
  `- Test player email: ${result.testPlayerEmail || process.env.QA_TEST_PLAYER_EMAIL || 'not set'}`,
  `- Expected baseline players: ${(result.expectedBaselinePlayers || []).join(', ') || '(none)'}`,
  '',
  '## Browser Launch',
  '',
  `- Local browser smoke status: ${smoke?.status || 'not-run'}`,
  `- Browser channel: ${process.env.QA_BROWSER_CHANNEL || (process.env.CI ? 'bundled chromium' : 'system chrome fallback')}`,
  `- Cloud GitHub Actions recommended: ${process.env.CI ? 'running in cloud' : 'yes for nightly QA; local macOS 12.7.6 browser launch requires running outside the Codex sandbox'}`,
  ...(smoke?.steps || []).map(step => `- ${step.name}: ${step.status}${step.error ? ` - ${step.error}` : ''}`),
  '',
  '## Step Results',
  '',
  '| # | Step | Status | Screenshot | Notes |',
  '|---:|---|---|---|---|',
  ...result.steps.map((step, index) => {
    const shot = rel(step.screenshot);
    const link = shot ? `[${path.basename(shot)}](${shot})` : '';
    return `| ${index + 1} | ${mdEscape(step.name)} | ${step.status} | ${link} | ${mdEscape(step.error || step.note || '')} |`;
  }),
  '',
  '## What Passes',
  '',
  ...(passed.length ? passed.map(step => `- ${step.name}`) : ['- Nothing has passed yet.']),
  '',
  '## What Fails',
  '',
  ...(failed.length ? failed.map(step => `- ${step.name}: ${step.error || 'failed'}`) : ['- No failing steps recorded.']),
  '',
  '## Notes',
  '',
  '- The QA agent does not modify app, authentication, messaging, Redis, or data architecture code.',
  '- Group invite creation is attempted through the real invite API because the current UI only exposes personal invite links.',
  '- Coach login must use explicit `QA_COACH_EMAIL` and `QA_COACH_PASSWORD`; the QA agent no longer supplies a shared legacy password fallback.',
  '- Diagnosis: sandboxed local Playwright runs on macOS 12.7.6 abort Chrome/Chromium before navigation. Running the same smoke command outside the Codex sandbox launches Chrome, opens the app, screenshots, and closes successfully.',
  ...(result.notes || []).map(note => `- ${note}`),
  '',
  '## GitHub Actions Nightly Next Steps',
  '',
  '- Add a scheduled workflow that runs `npm ci`, installs Playwright browsers, and executes `npm run qa:e2e` against a Vercel preview URL.',
  '- Store `QA_BASE_URL`, `QA_COACH_EMAIL`, `QA_COACH_PASSWORD`, `QA_TEST_PLAYER_EMAIL`, and `QA_TEST_PLAYER_PASSWORD` as GitHub Actions secrets or environment variables.',
  '- Upload `QA_REPORT.md`, `qa/artifacts`, `qa/test-results`, and `qa/playwright-report` as workflow artifacts.',
  '- Use a unique nightly `QA_TEST_PLAYER_EMAIL` or provision a cleanup/reset path before making the run blocking.',
  '',
  '## Exact Commands',
  '',
  '```sh',
  'npm run qa:smoke',
  'npm run qa:e2e',
  'npm run qa:e2e:headed',
  'QA_BROWSER_CHANNEL=chromium npm run qa:smoke',
  'QA_BROWSER_CHANNEL=chrome QA_HEADLESS=false npm run qa:smoke',
  '```',
  '',
];

fs.writeFileSync(reportPath, `${lines.join('\n')}\n`);
console.log(`Wrote ${reportPath}`);
