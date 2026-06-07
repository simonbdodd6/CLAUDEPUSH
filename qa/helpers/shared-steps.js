/**
 * Shared step implementations for Coach's Eye QA workflows.
 *
 * Contract for coachLogin: callers must attach a page.on('console', ...) listener
 * that appends to result.toasts before calling this function — the login success/failure
 * detection reads from result.toasts (populated by the toast MutationObserver).
 *
 * result shape expected: { toasts: [], missingSelectorWarnings: [], loginMethod: '' }
 */

import { expect } from '@playwright/test';

/**
 * Step: Open app — navigate to / and wait for #authPanel.
 */
export async function openApp(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#authPanel')).toBeVisible({ timeout: 15_000 });
}

/**
 * Step: Coach login — uses #devLoginBtn when available and no password is set,
 * otherwise falls back to credential form. Sets result.loginMethod.
 */
export async function coachLogin(page, config, result) {
  const devBtn = page.locator('#devLoginBtn');
  const devAvailable = await devBtn.isVisible({ timeout: 2_000 }).catch(() => false);

  if (devAvailable && !config.coachPassword) {
    result.loginMethod = 'dev-login-btn';
    await devBtn.click();
  } else if (config.coachPassword) {
    result.loginMethod = 'credentials';
    if (!devAvailable) {
      const loginTab = page.getByRole('button', { name: /^Login$/i });
      const loginTabVisible = await loginTab.isVisible({ timeout: 2_000 }).catch(() => false);
      if (loginTabVisible) await loginTab.click();
    }
    await page.locator('#identityLoginEmail').fill(config.coachEmail);
    await page.locator('#identityLoginPassword').fill(config.coachPassword);
    await page.locator('#identityLoginBtn').click();
  } else {
    result.missingSelectorWarnings.push(
      'devLoginBtn not visible and QA_COACH_PASSWORD not set — set QA_COACH_PASSWORD or run against a preview deployment with devLoginAvailable: true'
    );
    throw new Error('Cannot log in: devLoginBtn not visible and QA_COACH_PASSWORD is not set');
  }

  await expect.poll(async () => {
    const membersVisible = await page
      .getByRole('button', { name: 'Members', exact: true })
      .isVisible()
      .catch(() => false);
    if (membersVisible) return 'ok';
    const coachNavVisible = await page
      .locator('#coachNav:not(.hidden)')
      .isVisible()
      .catch(() => false);
    if (coachNavVisible) return 'ok';
    const latestToast = result.toasts.at(-1)?.text || '';
    if (/too many|failed|error|invalid|limit exceeded/i.test(latestToast)) {
      throw new Error(`Login rejected — toast: "${latestToast}"`);
    }
    return 'waiting';
  }, { timeout: 15_000, message: 'coach login: authenticated UI should appear within 15s' }).toBe('ok');
}

/**
 * Step: Navigate to Members — click Members nav button, wait for page title.
 */
export async function navigateToMembers(page) {
  await page.getByRole('button', { name: 'Members', exact: true }).click();
  await expect(page.locator('h1#pageTitle')).toBeVisible({ timeout: 10_000 });
}

/**
 * Rough Redis op estimate per /api/* call based on post-optimisation analysis.
 * Used consistently across all workflow reports.
 */
export function redisEstimate(endpointPath, method = 'GET') {
  if (endpointPath.startsWith('/api/identity'))    return method === 'GET' ? 6 : 8;
  if (endpointPath.startsWith('/api/chat'))        return 8;
  if (endpointPath.startsWith('/api/invite'))      return method === 'POST' ? 8 : 4;
  if (endpointPath.startsWith('/api/availability')) return 4;
  if (endpointPath.startsWith('/api/cron'))        return 6;
  return 2;
}
