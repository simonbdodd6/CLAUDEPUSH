import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const baseURL = process.env.QA_BASE_URL || 'http://127.0.0.1:3000';
const browserChannel = process.env.QA_BROWSER_CHANNEL || (process.env.CI ? undefined : 'chrome');
const browserHome = process.env.QA_BROWSER_HOME || (!process.env.CI && process.platform === 'darwin'
  ? path.join(os.tmpdir(), 'coacheseye-qa-browser-home')
  : undefined);
const crashDir = process.env.QA_BROWSER_CRASH_DIR || path.join(os.tmpdir(), 'coacheseye-qa-browser-crashes');

if (browserHome) fs.mkdirSync(browserHome, { recursive: true });
fs.mkdirSync(crashDir, { recursive: true });

const launchOptions = {
  timeout: Number(process.env.QA_BROWSER_LAUNCH_TIMEOUT || 60_000),
  ...(browserHome ? {
    env: {
      ...process.env,
      HOME: browserHome,
      XDG_CONFIG_HOME: path.join(browserHome, '.config'),
      XDG_CACHE_HOME: path.join(browserHome, '.cache'),
    },
  } : {}),
  args: [
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-crash-reporter',
    '--disable-crashpad',
    '--noerrdialogs',
    `--crash-dumps-dir=${crashDir}`,
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion,Crashpad',
  ],
};

export default defineConfig({
  testDir: './qa/e2e',
  timeout: Number(process.env.QA_TEST_TIMEOUT || 180_000),
  expect: { timeout: Number(process.env.QA_EXPECT_TIMEOUT || 15_000) },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: Number(process.env.QA_WORKERS || 1),
  reporter: [['list'], ['html', { outputFolder: 'qa/playwright-report', open: 'never' }]],
  use: {
    baseURL,
    ...(browserChannel ? { channel: browserChannel } : {}),
    launchOptions,
    headless: process.env.QA_HEADLESS === 'false' ? false : undefined,
    viewport: { width: 1440, height: 1000 },
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  outputDir: 'qa/test-results',
});
