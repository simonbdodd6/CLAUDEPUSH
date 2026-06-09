import { defineConfig } from '@playwright/test';

const BASE = process.env.QA_BASE_URL || 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: './qa/e2e',
  timeout: 120_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: BASE,
    headless: true,
    screenshot: 'only-on-failure',
    video: 'off',
  },
  reporter: [['list']],
});
