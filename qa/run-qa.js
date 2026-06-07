import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const headed = process.argv.includes('--headed');
const smoke = process.argv.includes('--smoke');
const loginMembers = process.argv.includes('--login-members');
const phase5Invite = process.argv.includes('--phase5-invite');
const workflow1 = process.argv.includes('--workflow-1');
const workflow2 = process.argv.includes('--workflow-2');
const workflow3    = process.argv.includes('--workflow-3');
const workflow4    = process.argv.includes('--workflow-4');
const allWorkflows = process.argv.includes('--all-workflows');
const args = ['playwright', 'test', '--config=playwright.config.js'];
if (headed) args.push('--headed');
if (allWorkflows) {
  // Run all four workflow specs in sequence — the nightly suite
  args.push(
    'qa/e2e/workflow-1-coach-login-members.spec.js',
    'qa/e2e/workflow-2-invite-generation.spec.js',
    'qa/e2e/workflow-3-player-registration.spec.js',
    'qa/e2e/workflow-4-pending-approval.spec.js'
  );
} else {
  args.push(
    smoke
      ? 'qa/e2e/browser-smoke.spec.js'
      : loginMembers
        ? 'qa/e2e/coach-login-members.spec.js'
        : phase5Invite
          ? 'qa/e2e/invite-flow.spec.js'
          : workflow1
            ? 'qa/e2e/workflow-1-coach-login-members.spec.js'
            : workflow2
              ? 'qa/e2e/workflow-2-invite-generation.spec.js'
              : workflow3
                ? 'qa/e2e/workflow-3-player-registration.spec.js'
                : workflow4
                  ? 'qa/e2e/workflow-4-pending-approval.spec.js'
                  : 'qa/e2e/nightly-qa-agent.spec.js'
  );
}

const resultPath = path.join(process.cwd(), 'qa/results/qa-run.json');
const smokeResultPath = path.join(process.cwd(), 'qa/results/browser-smoke.json');
fs.rmSync(resultPath, { force: true });
if (smoke) fs.rmSync(smokeResultPath, { force: true });

const test = spawn('npx', args, { stdio: 'inherit', shell: process.platform === 'win32' });

function writePreTestFailure(code) {
  const targetPath = smoke ? smokeResultPath : resultPath;
  if (fs.existsSync(targetPath)) return;

  const testResultsDir = path.join(process.cwd(), 'qa/test-results');
  const errorContext = fs.existsSync(testResultsDir)
    ? fs.readdirSync(testResultsDir, { recursive: true })
      .map(file => path.join(testResultsDir, file))
      .find(file => file.endsWith('error-context.md'))
    : null;

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify({
    status: 'failed',
    startedAt: null,
    finishedAt: new Date().toISOString(),
    baseURL: process.env.QA_BASE_URL || 'http://127.0.0.1:3000',
    testPlayerEmail: process.env.QA_TEST_PLAYER_EMAIL || 'not set',
    expectedBaselinePlayers: (process.env.QA_EXPECTED_BASELINE_PLAYERS || '').split(',').map(v => v.trim()).filter(Boolean),
    steps: [{
      name: 'Launch Playwright Chromium',
      status: 'failed',
      screenshot: null,
      error: `Playwright exited before the QA journey started (exit code ${code}). See ${errorContext ? path.relative(process.cwd(), errorContext) : 'qa/test-results'}.`,
    }],
    notes: ['The browser failed before the first journey step, so no app behavior was exercised.'],
  }, null, 2));
}

test.on('close', code => {
  if (code) writePreTestFailure(code);
  const report = spawn('node', ['qa/report.js'], { stdio: 'inherit' });
  report.on('close', reportCode => {
    process.exit(code || reportCode || 0);
  });
});
