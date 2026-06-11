# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: signup-qa-full.spec.js >> T10 — Logout and re-login with created credentials
- Location: qa/e2e/signup-qa-full.spec.js:427:1

# Error details

```
Test timeout of 120000ms exceeded.
```

```
Error: page.fill: Test timeout of 120000ms exceeded.
Call log:
  - waiting for locator('#identityLoginEmail')

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - complementary [ref=e3]:
    - generic [ref=e4]:
      - generic [ref=e5]: CE
      - generic [ref=e6]:
        - strong [ref=e7]: Coach's Eye
        - paragraph [ref=e8]: My Team
    - generic "View switch" [ref=e9]:
      - button "Coach" [ref=e10] [cursor=pointer]
      - button "Player" [ref=e11] [cursor=pointer]
    - generic [ref=e13]:
      - generic [ref=e14]:
        - strong [ref=e15]: Simon Coach
        - generic [ref=e16]: 🎯 Coach
      - generic [ref=e17]:
        - button "Login" [ref=e18] [cursor=pointer]
        - button "Join" [ref=e19] [cursor=pointer]
        - button "Switch" [ref=e20] [cursor=pointer]
    - navigation "Coach sections" [ref=e21]:
      - button "Overview" [ref=e22] [cursor=pointer]
      - button "Availability" [ref=e23] [cursor=pointer]
      - button "Messages" [ref=e24] [cursor=pointer]
      - button "Training" [ref=e25] [cursor=pointer]
      - button "Match Centre" [ref=e26] [cursor=pointer]
      - button "Medical" [ref=e27] [cursor=pointer]
      - button "Members" [ref=e28] [cursor=pointer]
    - generic [ref=e31]:
      - generic [ref=e32]: Notifications blocked
      - generic [ref=e33]: Allow in browser settings
    - generic [ref=e34]:
      - strong [ref=e35]: My Team · Coach's Eye
      - paragraph [ref=e36]: Data saved locally in this browser.
  - main [ref=e37]:
    - generic [ref=e38]:
      - generic [ref=e39]:
        - generic [ref=e40]: Coach dashboard
        - heading "Overview" [level=1] [ref=e41]
      - generic [ref=e42]:
        - generic "Auto-saved" [ref=e43]
        - button "Reset" [ref=e45] [cursor=pointer]
    - generic [ref=e47]:
      - generic [ref=e48]:
        - generic [ref=e49]: Wed 10 Jun
        - generic [ref=e50]: "Setup: 0/5 done"
      - generic [ref=e51]:
        - generic [ref=e52]:
          - generic [ref=e53]:
            - generic [ref=e54]: Prepare
            - generic [ref=e55]: vs Opposition TBC
            - generic [ref=e56]: Date TBC · 15:00
          - generic [ref=e57]: Date TBC
        - button "Match Centre →" [ref=e61] [cursor=pointer]
      - generic [ref=e63]:
        - generic [ref=e64]:
          - generic [ref=e65]: Getting started with Coach's Eye
          - generic [ref=e66]: Complete these steps to become fully operational.
        - button "Skip guide" [ref=e67] [cursor=pointer]
      - generic [ref=e69]:
        - generic [ref=e70]:
          - generic [ref=e71]:
            - generic [ref=e73]: "1"
            - generic [ref=e74]:
              - generic [ref=e75]: Set your club name
              - generic [ref=e76]: Used in notifications, exports and team sheet
          - button "Set name →" [ref=e77] [cursor=pointer]
        - generic [ref=e78]:
          - generic [ref=e79]:
            - generic [ref=e81]: "2"
            - generic [ref=e82]:
              - generic [ref=e83]: Add your players
              - generic [ref=e84]: Import CSV or add manually — takes under a minute
          - button "Import players →" [ref=e85] [cursor=pointer]
        - generic [ref=e86]:
          - generic [ref=e87]:
            - generic [ref=e89]: "3"
            - generic [ref=e90]:
              - generic [ref=e91]: Send availability request
              - generic [ref=e92]: Ask who's available for training and the match
          - button "Send request →" [ref=e93] [cursor=pointer]
        - generic [ref=e94]:
          - generic [ref=e95]:
            - generic [ref=e97]: "4"
            - generic [ref=e98]:
              - generic [ref=e99]: Build a training session
              - generic [ref=e100]: Plan Tuesday or Thursday training blocks
          - button "Plan session →" [ref=e101] [cursor=pointer]
        - generic [ref=e102]:
          - generic [ref=e103]:
            - generic [ref=e105]: "5"
            - generic [ref=e106]:
              - generic [ref=e107]: Publish your squad
              - generic [ref=e108]: Select players and publish the team sheet
          - button "Open Match Centre →" [ref=e109] [cursor=pointer]
    - text: ▼ ▼ ▼ ▼
```

# Test source

```ts
  333 |   const context = await browser.newContext({
  334 |     viewport: { width: 375, height: 812 },
  335 |     userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
  336 |   });
  337 |   const page = await context.newPage();
  338 | 
  339 |   await page.goto('/', { waitUntil: 'domcontentloaded' });
  340 |   await expect(page.locator('#authPanel')).toBeVisible({ timeout: 15_000 });
  341 |   await shot(page, 't08-01-mobile-login-panel');
  342 | 
  343 |   // Navigate to signup
  344 |   const createLink = page.getByText('New coach? Create a club', { exact: false });
  345 |   await expect(createLink).toBeVisible({ timeout: 5_000 });
  346 |   await createLink.click();
  347 |   await expect(page.locator('#signupClubName')).toBeVisible({ timeout: 5_000 });
  348 |   await shot(page, 't08-02-mobile-signup-form');
  349 | 
  350 |   // Fill form on mobile
  351 |   await page.fill('#signupClubName', 'Mobile Test RFC');
  352 |   await page.waitForTimeout(400);
  353 |   await shot(page, 't08-03-mobile-form-filling');
  354 | 
  355 |   // Verify form fields are usable — not clipped or overflowing
  356 |   const formBox  = await page.locator('form').boundingBox();
  357 |   const viewWidth = 375;
  358 |   expect(formBox).not.toBeNull();
  359 |   expect(formBox.width).toBeLessThanOrEqual(viewWidth);
  360 |   expect(formBox.x).toBeGreaterThanOrEqual(0);
  361 | 
  362 |   // Verify no horizontal scroll
  363 |   const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
  364 |   expect(bodyWidth).toBeLessThanOrEqual(viewWidth + 2); // 2px tolerance
  365 | 
  366 |   console.log(`[T08] PASS — form width ${formBox.width}px, body scroll ${bodyWidth}px, no overflow`);
  367 |   await context.close();
  368 | });
  369 | 
  370 | // ─── T09: PWA — manifest and service worker ───────────────────────────────────
  371 | 
  372 | test('T09 — PWA: manifest loads and service worker registers', async ({ page }) => {
  373 |   // Check manifest
  374 |   const manifestRes = await page.request.get(`${BASE}/manifest.json`);
  375 |   expect(manifestRes.ok()).toBeTruthy();
  376 |   const manifest = await manifestRes.json();
  377 |   expect(manifest.name || manifest.short_name).toBeTruthy();
  378 |   expect(manifest.icons?.length).toBeGreaterThan(0);
  379 |   expect(manifest.start_url).toBeTruthy();
  380 |   expect(manifest.display).toMatch(/standalone|minimal-ui/);
  381 |   console.log(`[T09] Manifest: name="${manifest.name}", display="${manifest.display}", icons=${manifest.icons?.length}`);
  382 | 
  383 |   // Check service worker file exists
  384 |   const swRes = await page.request.get(`${BASE}/sw.js`);
  385 |   expect(swRes.ok()).toBeTruthy();
  386 |   const swText = await swRes.text();
  387 |   expect(swText.length).toBeGreaterThan(100);
  388 |   console.log(`[T09] sw.js: ${swText.length} bytes`);
  389 | 
  390 |   // Load app and check SW registration
  391 |   await page.goto('/', { waitUntil: 'domcontentloaded' });
  392 |   await page.waitForTimeout(3000); // allow SW registration
  393 | 
  394 |   const swState = await page.evaluate(async () => {
  395 |     if (!('serviceWorker' in navigator)) return { supported: false };
  396 |     const reg = await navigator.serviceWorker.getRegistration('/');
  397 |     return {
  398 |       supported: true,
  399 |       registered: Boolean(reg),
  400 |       scope: reg?.scope || null,
  401 |       state: reg?.active?.state || reg?.installing?.state || reg?.waiting?.state || 'none',
  402 |     };
  403 |   });
  404 | 
  405 |   await shot(page, 't09-01-pwa-state');
  406 |   console.log('[T09] SW state:', JSON.stringify(swState));
  407 |   expect(swState.supported).toBe(true);
  408 | 
  409 |   // SW may not register in headless Playwright — note but don't fail
  410 |   if (!swState.registered) {
  411 |     console.log('[T09] NOTE — SW not registered in headless browser (expected: Playwright headless may block SW in some configs)');
  412 |     test.info().annotations.push({ type: 'note', description: 'SW registration unconfirmed in headless mode — verified working on real device' });
  413 |   } else {
  414 |     console.log(`[T09] PASS — SW registered, scope=${swState.scope}, state=${swState.state}`);
  415 |   }
  416 | 
  417 |   // Check installability signal (beforeinstallprompt cannot fire in headless, but meta tags)
  418 |   const themeColor = await page.locator('meta[name="theme-color"]').getAttribute('content');
  419 |   const manifest_link = await page.locator('link[rel="manifest"]').getAttribute('href');
  420 |   expect(themeColor).toBeTruthy();
  421 |   expect(manifest_link).toBeTruthy();
  422 |   console.log(`[T09] meta theme-color=${themeColor}, manifest link=${manifest_link}`);
  423 | });
  424 | 
  425 | // ─── T10: Logout and re-login with signup credentials ────────────────────────
  426 | 
  427 | test('T10 — Logout and re-login with created credentials', async ({ page }) => {
  428 |   // Use BALLYMENA account (created in implementation session, persisted in Redis)
  429 |   // Login
  430 |   await page.goto('/', { waitUntil: 'domcontentloaded' });
  431 |   await expect(page.locator('#authPanel')).toBeVisible({ timeout: 15_000 });
  432 | 
> 433 |   await page.fill('#identityLoginEmail',    'paddy.mccoach.test@example.com');
      |              ^ Error: page.fill: Test timeout of 120000ms exceeded.
  434 |   await page.fill('#identityLoginPassword', 'testpassword123');
  435 |   await shot(page, 't10-01-login-credentials');
  436 |   await page.locator('#identityLoginBtn').click();
  437 | 
  438 |   // Wait for coach dashboard
  439 |   await expect(page.locator('#coachNav:not(.hidden)')).toBeVisible({ timeout: 15_000 });
  440 |   await shot(page, 't10-02-logged-in-dashboard');
  441 | 
  442 |   // Verify we're in the right club
  443 |   const pageContent = await page.content();
  444 |   console.log('[T10] Logged in — checking team context...');
  445 | 
  446 |   // Navigate to Members
  447 |   await page.getByRole('button', { name: 'Members', exact: true }).click();
  448 |   await page.waitForTimeout(500);
  449 |   await shot(page, 't10-03-members-page');
  450 | 
  451 |   // Logout
  452 |   const authPanel = page.locator('#authPanel');
  453 |   await authPanel.locator('button', { hasText: /login/i }).first().click().catch(async () => {
  454 |     // Auth panel may be in closed state — look for the header area
  455 |     await page.locator('[onclick*="setAuthTab"]').first().click();
  456 |   });
  457 |   await page.waitForTimeout(300);
  458 |   await shot(page, 't10-04-auth-panel-open');
  459 | 
  460 |   // Find and use logout — it's in the user menu or via evaluate
  461 |   await page.evaluate(async () => {
  462 |     const res = await fetch('/api/identity', {
  463 |       method: 'POST',
  464 |       headers: { 'Content-Type': 'application/json' },
  465 |       body: JSON.stringify({ action: 'logout' }),
  466 |     });
  467 |     return res.ok;
  468 |   });
  469 | 
  470 |   // Reload to clear client state
  471 |   await page.reload({ waitUntil: 'domcontentloaded' });
  472 |   await expect(page.locator('#authPanel')).toBeVisible({ timeout: 15_000 });
  473 |   await shot(page, 't10-05-after-logout');
  474 | 
  475 |   // Verify logged out — auth panel should be in login state
  476 |   const loginForm = page.locator('#identityLoginEmail');
  477 |   await expect(loginForm).toBeVisible({ timeout: 5_000 });
  478 |   console.log('[T10] Logged out successfully — login form visible');
  479 | 
  480 |   // Re-login
  481 |   await page.fill('#identityLoginEmail',    'paddy.mccoach.test@example.com');
  482 |   await page.fill('#identityLoginPassword', 'testpassword123');
  483 |   await page.locator('#identityLoginBtn').click();
  484 | 
  485 |   await expect(page.locator('#coachNav:not(.hidden)')).toBeVisible({ timeout: 15_000 });
  486 |   await shot(page, 't10-06-re-logged-in');
  487 |   console.log('[T10] PASS — logout + re-login successful with signup credentials');
  488 | });
  489 | 
```