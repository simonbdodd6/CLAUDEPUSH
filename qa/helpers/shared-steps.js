// qa/helpers/shared-steps.js — reusable Playwright helpers shared across test suites.
import { expect } from '@playwright/test';

// Navigate to the app root and wait for auth panel or coach nav to appear.
export async function openApp(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  // Either the auth panel (logged out) or the coach nav (already logged in) must appear.
  await expect(
    page.locator('#authPanel, #coachNav').first()
  ).toBeVisible({ timeout: 20_000 });
}

// Log in as coach using dev-login (DEV_LOGIN=true) or credentials as fallback.
export async function coachLogin(page, config = {}, resultObj = null) {
  // If already in coach view, nothing to do.
  const alreadyIn = await page.locator('#coachNav').isVisible().catch(() => false);
  if (alreadyIn) return;

  const devEnabled = await page.evaluate(() => Boolean(window._devLoginEnabled)).catch(() => false);

  if (devEnabled) {
    await page.evaluate(() => devLogin('coach-demo'));
    await expect(page.locator('#coachNav')).toBeVisible({ timeout: 10_000 });
    if (resultObj) resultObj.loginMethod = 'dev-login-btn';
    return;
  }

  // Credentials fallback (for non-dev environments)
  if (!config.coachEmail || !config.coachPassword) {
    throw new Error('coachEmail and coachPassword are required when DEV_LOGIN is off');
  }
  const emailInput = page.locator('input[type="email"]').first();
  await expect(emailInput).toBeVisible({ timeout: 10_000 });
  await emailInput.fill(config.coachEmail);
  await page.locator('input[type="password"]').first().fill(config.coachPassword);
  await page.locator('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in")').first().click();
  await expect(page.locator('#coachNav')).toBeVisible({ timeout: 20_000 });
  if (resultObj) resultObj.loginMethod = 'credentials';
}

// Log in as player via dev-login. Returns the player's state object.
export async function playerLogin(page, userId = 'player-simon-test') {
  await page.evaluate((id) => devLogin(id), userId);
  // Player view shows player-specific sections
  await expect(
    page.locator('#player-availability, #player-messages, #player-week').first()
  ).toBeVisible({ timeout: 10_000 });
}

// Navigate to the coach Availability section (Availability Centre tab).
export async function navigateToAvailability(page) {
  await page.evaluate(() => setSection('coach', 'message'));
  await expect(page.locator('#coach-message')).toBeVisible({ timeout: 8_000 });
  // Wait for the board content to load
  await page.waitForTimeout(500);
}

// Navigate to the player Availability section.
export async function navigateToPlayerAvailability(page) {
  await page.evaluate(() => setSection('player', 'availability'));
  await expect(page.locator('#player-availability')).toBeVisible({ timeout: 8_000 });
  await page.waitForTimeout(400);
}

// Navigate to the coach Members section (triggers syncIdentityStateToLocalRoster).
export async function navigateToMembers(page) {
  await page.evaluate(() => setSection('coach', 'players'));
  await expect(page.locator('#coach-players')).toBeVisible({ timeout: 8_000 });
}

// Intercept toasts via showToast wrapper installed before page load.
export function installToastCapture(page) {
  return page.addInitScript(() => {
    window.__qaToasts = [];
    const install = () => {
      if (typeof window.showToast === 'function' && window.showToast !== window.__qaWrapped) {
        const orig = window.showToast;
        window.showToast = function(msg) {
          window.__qaToasts.push({ text: String(msg), ts: Date.now() });
          return orig.apply(this, arguments);
        };
        window.__qaWrapped = window.showToast;
      }
    };
    document.addEventListener('DOMContentLoaded', install);
    new MutationObserver(install).observe(document.documentElement, { childList: true, subtree: true });
  });
}

// Reset all availability data via the seed API. Requires DEV_LOGIN=true.
export async function resetAvailabilityData(baseURL) {
  const res = await fetch(`${baseURL}/api/seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reset_availability' }),
  });
  if (!res.ok) throw new Error(`Seed reset failed: ${res.status}`);
  return res.json();
}
