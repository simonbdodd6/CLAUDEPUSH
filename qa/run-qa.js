import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const headed = process.argv.includes('--headed');
const smoke = process.argv.includes('--smoke');
const args = ['playwright', 'test', '--config=playwright.config.js'];
if (headed) args.push('--headed');
args.push(smoke ? 'qa/e2e/browser-smoke.spec.js' : 'qa/e2e/nightly-qa-agent.spec.js');

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
