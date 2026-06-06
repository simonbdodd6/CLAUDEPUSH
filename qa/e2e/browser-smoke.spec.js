import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const runId = new Date().toISOString().replace(/[:.]/g, '-');
const artifactDir = path.join(process.cwd(), 'qa/artifacts', `smoke-${runId}`);
const resultPath = path.join(process.cwd(), 'qa/results/browser-smoke.json');

function writeSmokeResult(result) {
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  fs.writeFileSync(resultPath, JSON.stringify({
    baseURL: process.env.QA_BASE_URL || 'http://127.0.0.1:3000',
    browserChannel: process.env.QA_BROWSER_CHANNEL || (process.env.CI ? 'bundled chromium' : 'system chrome fallback'),
    finishedAt: new Date().toISOString(),
    ...result,
  }, null, 2));
}

test('browser launch smoke opens QA_BASE_URL and screenshots', async ({ page }) => {
  fs.mkdirSync(artifactDir, { recursive: true });
  const screenshot = path.join(artifactDir, 'browser-smoke.png');
  const startedAt = new Date().toISOString();

  try {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await expect(page.locator('body')).toBeVisible();
    await page.screenshot({ path: screenshot, fullPage: true });
    writeSmokeResult({
      status: 'passed',
      startedAt,
      steps: [{
        name: 'Launch browser, open QA_BASE_URL, save screenshot, close browser',
        status: 'passed',
        screenshot,
      }],
    });
  } catch (error) {
    await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
    writeSmokeResult({
      status: 'failed',
      startedAt,
      steps: [{
        name: 'Launch browser, open QA_BASE_URL, save screenshot, close browser',
        status: 'failed',
        screenshot: fs.existsSync(screenshot) ? screenshot : null,
        error: error?.message || String(error),
      }],
    });
    throw error;
  }
});
