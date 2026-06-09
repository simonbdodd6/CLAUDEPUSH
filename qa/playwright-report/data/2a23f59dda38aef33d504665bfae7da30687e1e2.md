# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workflow-7-session-expiry.spec.js >> Workflow 7 — Player Session Expiry Recovery
- Location: qa/e2e/workflow-7-session-expiry.spec.js:460:1

# Error details

```
Error: Re-login did not clear session-expired message within 15s. #authPanel: "
        
          Log in
          ✕
        
        Your session has expired. Please log in again.
        
          
          
          Log in
          Forgot password?
          Dev: Login a"
```

# Test source

```ts
  345 | // ─── Listeners ───────────────────────────────────────────────────────────────
  346 | function attachResponseListener(page) {
  347 |   page.on('response', response => {
  348 |     const url    = response.url();
  349 |     const status = response.status();
  350 |     const parsed = (() => { try { return new URL(url); } catch { return null; } })();
  351 |     if (parsed?.pathname.startsWith('/api/')) {
  352 |       result.apiCalls.push({
  353 |         endpoint: parsed.pathname,
  354 |         method:   response.request().method(),
  355 |         status,
  356 |         at: new Date().toISOString(),
  357 |       });
  358 |       if (status === 401) {
  359 |         result.expiryEvents.push({
  360 |           endpoint: parsed.pathname,
  361 |           status,
  362 |           at: new Date().toISOString(),
  363 |         });
  364 |       }
  365 |     }
  366 |     if (status >= 400 && status !== 401) {
  367 |       result.requestFailures.push({
  368 |         method:  response.request().method(),
  369 |         url,
  370 |         failure: { errorText: `HTTP ${status} ${response.statusText()}` },
  371 |         at: new Date().toISOString(),
  372 |       });
  373 |     }
  374 |   });
  375 |   page.on('requestfailed', request => {
  376 |     result.requestFailures.push({
  377 |       method:  request.method(),
  378 |       url:     request.url(),
  379 |       failure: request.failure(),
  380 |       at:      new Date().toISOString(),
  381 |     });
  382 |   });
  383 | }
  384 | 
  385 | async function injectToastObserver(page) {
  386 |   await page.addInitScript(() => {
  387 |     document.addEventListener('DOMContentLoaded', () => {
  388 |       const toastEl = document.getElementById('toast');
  389 |       if (!toastEl) return;
  390 |       new MutationObserver(() => {
  391 |         if (toastEl.classList.contains('visible') && toastEl.textContent.trim()) {
  392 |           console.log('[QA_TOAST] ' + toastEl.textContent.trim());
  393 |         }
  394 |       }).observe(toastEl, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
  395 |     });
  396 |   });
  397 | }
  398 | 
  399 | // ─── Session helpers ─────────────────────────────────────────────────────────
  400 | 
  401 | /**
  402 |  * Overwrite the ce_session cookie with a garbage token so the next API call
  403 |  * returns 401 → intercept401 fires → handleSessionExpiry() runs.
  404 |  */
  405 | async function expireSession(page) {
  406 |   const cookies = await page.context().cookies();
  407 |   const session = cookies.find(c => c.name === 'ce_session');
  408 |   if (!session) {
  409 |     result.cookieFound = false;
  410 |     result.missingSelectorWarnings.push(
  411 |       'ce_session cookie not found after player login. ' +
  412 |       'Workflow 7 requires a real server session — ensure the test server has Redis and ' +
  413 |       'loginUser() creates a session cookie on POST /api/identity.'
  414 |     );
  415 |     throw new Error('ce_session cookie not found — cannot force session expiry');
  416 |   }
  417 |   result.cookieFound = true;
  418 |   await page.context().addCookies([{
  419 |     name:     session.name,
  420 |     value:    `EXPIRED_QA_SESSION_${Date.now()}`,
  421 |     domain:   session.domain,
  422 |     path:     session.path || '/',
  423 |     httpOnly: session.httpOnly,
  424 |     secure:   session.secure,
  425 |     sameSite: session.sameSite || 'Lax',
  426 |     expires:  session.expires,
  427 |   }]);
  428 | }
  429 | 
  430 | /**
  431 |  * Re-login as player using the credential form that is shown by handleSessionExpiry().
  432 |  * Players cannot use devLoginBtn (coach-only). After login, dismisses any 403-triggered
  433 |  * overlay that may appear from coach-only endpoint calls during initial data load.
  434 |  */
  435 | async function reLoginAsPlayer(page, playerEmail, playerPassword) {
  436 |   await page.locator('#identityLoginEmail').fill(playerEmail);
  437 |   await page.locator('#identityLoginPassword').fill(playerPassword);
  438 |   await page.locator('#identityLoginBtn').click();
  439 | 
  440 |   // Session-expired message must clear (loginIdentityAccount() clears _sessionExpiredMessage on success)
  441 |   try {
  442 |     await expect(page.locator('#authPanel')).not.toContainText('session has expired', { timeout: 15_000 });
  443 |   } catch {
  444 |     const authText = await page.locator('#authPanel').textContent().catch(() => '(unreadable)');
> 445 |     throw new Error(`Re-login did not clear session-expired message within 15s. #authPanel: "${authText.slice(0, 200)}"`);
      |           ^ Error: Re-login did not clear session-expired message within 15s. #authPanel: "
  446 |   }
  447 | 
  448 |   // Player nav must be visible (session restored)
  449 |   await expect(page.locator('#playerNav:not(.hidden)')).toBeVisible({ timeout: 10_000 });
  450 | 
  451 |   // Dismiss 403-triggered overlay if it reappears during post-login data loads
  452 |   const loginFormReappeared = await page.locator('#identityLoginEmail').isVisible({ timeout: 2_000 }).catch(() => false);
  453 |   if (loginFormReappeared) {
  454 |     await page.evaluate(() => { if (typeof window.setAuthTab === 'function') window.setAuthTab('closed'); });
  455 |     await expect(page.locator('#identityLoginEmail')).toBeHidden({ timeout: 5_000 });
  456 |   }
  457 | }
  458 | 
  459 | // ─── Main test ───────────────────────────────────────────────────────────────
  460 | test('Workflow 7 — Player Session Expiry Recovery', async ({ browser }) => {
  461 |   ensureDirs();
  462 | 
  463 |   if (!config.playerEmail || !config.playerName) {
  464 |     throw new Error(
  465 |       'Workflow 7 requires player credentials. ' +
  466 |       'Run Workflow 4 first (saves credentials to qa/results/workflow-4.json), ' +
  467 |       'or set QA_W7_PLAYER_EMAIL, QA_W7_PLAYER_PASSWORD, QA_W7_PLAYER_NAME.'
  468 |     );
  469 |   }
  470 | 
  471 |   const playerContext = await browser.newContext();
  472 |   const playerPage    = await playerContext.newPage();
  473 | 
  474 |   await injectToastObserver(playerPage);
  475 |   playerPage.on('console', msg => {
  476 |     const entry = { type: msg.type(), text: msg.text(), at: new Date().toISOString() };
  477 |     result.console.push(entry);
  478 |     if (msg.text().startsWith('[QA_TOAST] ')) result.toasts.push({ text: msg.text().replace('[QA_TOAST] ', ''), at: entry.at });
  479 |   });
  480 |   playerPage.on('pageerror', error => result.pageErrors.push({ message: error.message, stack: error.stack, at: new Date().toISOString() }));
  481 |   attachResponseListener(playerPage);
  482 | 
  483 |   try {
  484 |     // ── Steps 1–2: player login ───────────────────────────────────────────
  485 |     await workflowStep(playerPage, 'Open app', async () => {
  486 |       await playerPage.goto('/', { waitUntil: 'domcontentloaded' });
  487 |       await expect(playerPage.locator('#authPanel')).toBeVisible({ timeout: 15_000 });
  488 |     });
  489 | 
  490 |     await workflowStep(playerPage, 'Player login', async () => {
  491 |       await playerLogin(playerPage, {
  492 |         testPlayerEmail:    config.playerEmail,
  493 |         testPlayerPassword: config.playerPassword,
  494 |       }, result);
  495 |     });
  496 | 
  497 |     // ── Steps 3–4: Messages baseline ─────────────────────────────────────
  498 |     await workflowStep(playerPage, 'Navigate to Messages', async () => {
  499 |       await navigateToMessages(playerPage, result);
  500 |     });
  501 | 
  502 |     await workflowStep(playerPage, 'Open Squad channel — verify message history', async () => {
  503 |       const contactList = playerPage.locator('#chatContactList');
  504 |       const squad = contactList.locator('button.chat-contact').filter({ hasText: 'Squad' }).first();
  505 | 
  506 |       const squadVisible = await squad.isVisible({ timeout: 10_000 }).catch(() => false);
  507 |       if (!squadVisible) {
  508 |         result.missingSelectorWarnings.push(
  509 |           'Squad channel not found in #chatContactList. ' +
  510 |           'Run Workflow 6 first or check that the player is an approved member.'
  511 |         );
  512 |         throw new Error('Squad channel not found in contact list');
  513 |       }
  514 | 
  515 |       await squad.click();
  516 |       await expect(playerPage.locator('#chatFeed')).toBeVisible({ timeout: 10_000 });
  517 | 
  518 |       // At minimum a "No messages" or existing message text should appear — feed is accessible
  519 |       result.steps.at(-1).note = 'Squad channel open; chat feed visible';
  520 |     });
  521 | 
  522 |     // ── Step 5: force session expiry ─────────────────────────────────────
  523 |     await workflowStep(playerPage, 'Force session expiry — corrupt ce_session cookie', async () => {
  524 |       await expireSession(playerPage);
  525 |       result.steps.at(-1).note = `ce_session overwritten with EXPIRED_QA_SESSION_... token`;
  526 |     });
  527 | 
  528 |     // ── Step 6: verify session-expiry overlay ────────────────────────────
  529 |     await workflowStep(playerPage, 'Verify session-expiry overlay appears', async () => {
  530 |       // The 2.5s chat poll fires within ~2500ms and returns 401 with the corrupted cookie.
  531 |       // intercept401 → handleSessionExpiry() → authTab='login' → render() shows login form.
  532 |       //
  533 |       // We race: wait for the first 401 response, then assert the UI updated.
  534 |       await playerPage.waitForResponse(
  535 |         res => res.status() === 401,
  536 |         { timeout: 8_000 }
  537 |       ).catch(() => {
  538 |         // If no 401 arrives, the UI assertion below will fail with a clearer message
  539 |       });
  540 | 
  541 |       await expect(playerPage.locator('#authPanel')).toContainText('session has expired', { timeout: 8_000 });
  542 |       await expect(playerPage.locator('#identityLoginEmail')).toBeVisible({ timeout: 3_000 });
  543 |       await expect(playerPage.locator('#identityLoginBtn')).toBeVisible({ timeout: 3_000 });
  544 | 
  545 |       // Verify the red error banner (not just any text containing "session has expired")
```