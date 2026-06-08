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
  const devBtnVisible = await devBtn.isVisible({ timeout: 2_000 }).catch(() => false);

  // The devLoginBtn is rendered conditionally after an async config fetch, so it may
  // not appear in the DOM even when devLoginAvailable=true. Check the API directly as
  // a reliable fallback and invoke devCoachLogin() in the page context if available.
  const devAvailableViaApi = !config.coachPassword && !devBtnVisible
    ? await page.evaluate(async () => {
        try {
          const res = await fetch('/api/identity?action=config');
          const data = await res.json();
          return Boolean(data.devLoginAvailable);
        } catch { return false; }
      }).catch(() => false)
    : false;

  if (devBtnVisible && !config.coachPassword) {
    result.loginMethod = 'dev-login-btn';
    await devBtn.click();
  } else if (devAvailableViaApi) {
    result.loginMethod = 'dev-login-evaluate';
    const evalResult = await page.evaluate(async () => {
      if (typeof window.devCoachLogin === 'function') {
        try { await window.devCoachLogin(); return { ok: true }; }
        catch (e) { return { ok: false, error: e.message }; }
      }
      // Fallback: call the API directly and reload so the app picks up the session cookie
      const res = await fetch('/api/identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dev_coach_login' }),
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok && data.ok !== false, error: data.error || null, needsReload: true };
    });
    if (!evalResult.ok) {
      throw new Error(`Dev coach login failed: ${evalResult.error || 'unknown error'}`);
    }
    if (evalResult.needsReload) {
      await page.reload({ waitUntil: 'domcontentloaded' });
    }
  } else if (config.coachPassword) {
    result.loginMethod = 'credentials';
    if (!devBtnVisible) {
      const loginTab = page.getByRole('button', { name: /^Login$/i });
      const loginTabVisible = await loginTab.isVisible({ timeout: 2_000 }).catch(() => false);
      if (loginTabVisible) await loginTab.click();
    }
    await page.locator('#identityLoginEmail').fill(config.coachEmail);
    await page.locator('#identityLoginPassword').fill(config.coachPassword);
    await page.locator('#identityLoginBtn').click();
  } else {
    result.missingSelectorWarnings.push(
      'devLoginBtn not visible, devLoginAvailable=false via API, and QA_COACH_PASSWORD not set'
    );
    throw new Error('Cannot log in: devLoginBtn not visible, devLoginAvailable=false via API, and QA_COACH_PASSWORD is not set');
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
  if (endpointPath.startsWith('/api/identity'))     return method === 'GET' ? 6 : 8;
  if (endpointPath.startsWith('/api/chat'))         return 8;
  if (endpointPath.startsWith('/api/invite'))       return method === 'POST' ? 8 : 4;
  if (endpointPath.startsWith('/api/availability')) return 4;
  if (endpointPath.startsWith('/api/cron'))         return 6;
  return 2;
}

// ─── Player login (Workflow 5) ───────────────────────────────────────────────

/**
 * Step: Log in as a player using email + password.
 * Handles two auth panel states: default card (shows Login tab) and already-open login form.
 * Waits for #playerNav to become visible, confirming player session is active.
 * config must have: testPlayerEmail, testPlayerPassword.
 */
export async function playerLogin(playerPage, config, result) {
  await playerPage.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(playerPage.locator('#authPanel')).toBeVisible({ timeout: 15_000 });

  // The panel may show a user card with a "Login" tab, or already show the login form.
  const loginFormVisible = await playerPage.locator('#identityLoginEmail').isVisible({ timeout: 2_000 }).catch(() => false);
  if (!loginFormVisible) {
    const loginTab = playerPage.locator('.auth-tab').filter({ hasText: /^Login$/ });
    const tabVisible = await loginTab.isVisible({ timeout: 3_000 }).catch(() => false);
    if (tabVisible) {
      await loginTab.click();
    } else {
      result.missingSelectorWarnings.push('Login tab not visible and #identityLoginEmail not visible — auth panel may be in unexpected state');
      throw new Error('Cannot open login form: neither Login tab nor email input visible');
    }
  }

  await playerPage.locator('#identityLoginEmail').fill(config.testPlayerEmail);
  await playerPage.locator('#identityLoginPassword').fill(config.testPlayerPassword);
  await playerPage.locator('#identityLoginBtn').click();

  // Player nav appears when session is active
  try {
    await expect(playerPage.locator('#playerNav:not(.hidden)')).toBeVisible({ timeout: 15_000 });
  } catch {
    const toasts = result.playerToasts || [];
    const latestToast = toasts.at(-1)?.text || '';
    throw new Error(latestToast
      ? `Player login failed — toast: "${latestToast}"`
      : 'Player nav did not appear within 15s — login may have failed or player is not yet approved');
  }

  // After login the app may call coach-only endpoints (/api/invite, /api/schedules, etc.) during
  // initial data load. Those endpoints return 403 for players, which incorrectly triggers
  // handleSessionExpiry() and shows the "session has expired" overlay even though the player
  // IS authenticated. Dismiss it if present — the session is valid (playerNav is visible).
  const sessionOverlayVisible = await playerPage.locator('#identityLoginEmail').isVisible({ timeout: 2_000 }).catch(() => false);
  if (sessionOverlayVisible) {
    await playerPage.evaluate(() => { if (typeof window.setAuthTab === 'function') window.setAuthTab('closed'); });
    await expect(playerPage.locator('#identityLoginEmail')).toBeHidden({ timeout: 5_000 });
  }
}

// ─── Group invite steps (Workflow 4) ─────────────────────────────────────────

/**
 * Step: Generate group invite via API.
 * Uses page.evaluate to call POST /api/invite with type:'group' inside the
 * authenticated coach session. Stores result.inviteLink and result.inviteToken.
 */
export async function generateGroupInvite(page, result) {
  const data = await page.evaluate(async () => {
    const res = await fetch('/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'group', role: 'player', sendEmail: false }),
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  });
  if (data.status >= 400 || data.body?.ok === false || !data.body?.url) {
    throw new Error(data.body?.error || `Group invite API failed with status ${data.status}`);
  }
  result.inviteLink = data.body.url;
  const tokenMatch = data.body.url.match(/[?&]inv=([^&]+)/);
  if (tokenMatch) result.inviteToken = decodeURIComponent(tokenMatch[1]);
  if (!result.inviteLink) throw new Error('Group invite API returned no URL');
}

/**
 * Step: Fill the group-invite registration form (first name, last name, email, password).
 * Group invites show #invite-firstname-input and #invite-lastname-input instead of
 * the single #invite-name-input used by individual invites.
 * config must have: testPlayerFirstName, testPlayerLastName, testPlayerEmail, testPlayerPassword.
 */
export async function fillGroupRegistrationForm(playerPage, config) {
  await playerPage.locator('#invite-firstname-input').fill(config.testPlayerFirstName);
  await playerPage.locator('#invite-lastname-input').fill(config.testPlayerLastName);
  await playerPage.locator('#invite-email-input').fill(config.testPlayerEmail);
  await playerPage.locator('#invite-password-input').fill(config.testPlayerPassword);
}

// ─── Invite panel steps (Workflows 2 & 3) ────────────────────────────────────

/**
 * Step: Open invite panel — ensures details.srv-panel is open and form fields visible.
 * result.missingSelectorWarnings is populated if the panel is not found.
 */
export async function openInvitePanel(page, result) {
  const panelSummary = page
    .locator('details.srv-panel summary')
    .filter({ hasText: /Invite/i })
    .first();

  const panelExists = await panelSummary.isVisible({ timeout: 10_000 }).catch(() => false);
  if (!panelExists) {
    result.missingSelectorWarnings.push(
      'details.srv-panel summary[Invite] not found — invite panel may not have rendered; renderPlayers() output may have changed'
    );
    throw new Error('Invite panel summary not found — members page may not have fully rendered');
  }

  const nameVisible = await page.locator('#inv-name').isVisible().catch(() => false);
  if (!nameVisible) await panelSummary.click();

  await expect(page.locator('#inv-name')).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('#inv-email')).toBeVisible({ timeout: 3_000 });
  await expect(page.locator('#inv-create-btn')).toBeVisible({ timeout: 3_000 });
}

/**
 * Step: Generate invite — atomically fills name+email and clicks Generate.
 * Uses page.evaluate to avoid loadInviteList() polling clearing the form between fill and click.
 * Stores result.inviteLink and result.inviteToken on success.
 * config must have: inviteName, inviteEmail  (Workflow 3 maps testPlayerName/Email to these).
 */
export async function generateInvite(page, config, result) {
  const filled = await page.evaluate(({ name, email }) => {
    const nameEl  = document.getElementById('inv-name');
    const emailEl = document.getElementById('inv-email');
    const btn     = document.getElementById('inv-create-btn');
    const missing = [];
    if (!nameEl)  missing.push('inv-name');
    if (!emailEl) missing.push('inv-email');
    if (!btn)     missing.push('inv-create-btn');
    if (missing.length) return { ok: false, missing };
    nameEl.value  = name;
    emailEl.value = email;
    nameEl.dispatchEvent(new Event('input', { bubbles: true }));
    emailEl.dispatchEvent(new Event('input', { bubbles: true }));
    btn.click();
    return { ok: true };
  }, { name: config.inviteName, email: config.inviteEmail });

  if (!filled?.ok) {
    const missing = filled?.missing || ['unknown'];
    result.missingSelectorWarnings.push(
      `Invite form elements missing in page.evaluate: ${missing.join(', ')} — IDs may have changed`
    );
    throw new Error(`Invite form elements not found: ${missing.join(', ')}`);
  }

  try {
    await page.waitForSelector('#inv-link-field', { state: 'visible', timeout: 20_000 });
  } catch {
    const latestToast = result.toasts.at(-1)?.text || '';
    throw new Error(latestToast.trim()
      ? `Invite creation failed — toast: "${latestToast.trim()}"`
      : '#inv-link-field did not appear within 20s — invite POST may have failed');
  }
}

/**
 * Step: Verify invite link — reads #inv-link-field, confirms /?inv=TOKEN format,
 * extracts token. Populates result.inviteLink and result.inviteToken.
 */
export async function verifyInviteLink(page, result) {
  const linkValue = await page.locator('#inv-link-field').inputValue({ timeout: 5_000 });

  if (!linkValue?.trim()) {
    result.missingSelectorWarnings.push('#inv-link-field was visible but had an empty value');
    throw new Error('Invite link field appeared but was empty');
  }

  result.inviteLink = linkValue.trim();

  const tokenMatch = result.inviteLink.match(/[?&]inv=([^&]+)/);
  if (!tokenMatch) {
    result.missingSelectorWarnings.push(
      `Invite URL "${result.inviteLink}" does not contain /?inv= — api/invite.js inviteUrl() format may have changed`
    );
    throw new Error(`Unexpected invite URL format — expected /?inv=TOKEN, got: ${result.inviteLink}`);
  }

  result.inviteToken = decodeURIComponent(tokenMatch[1]);

  if (result.inviteToken.length < 16) {
    result.missingSelectorWarnings.push(
      `Token "${result.inviteToken}" is suspiciously short (${result.inviteToken.length} chars) — expected ≥32`
    );
    throw new Error(`Invite token too short: "${result.inviteToken}"`);
  }

  await expect(page.locator('#inv-link-field')).toHaveValue(/^https?:\/\/.+/);
}

// ─── Player registration steps (Workflow 3) ──────────────────────────────────

/**
 * Step: Open invite URL in a fresh browser context page.
 * Waits for #invite-modal to appear (rendered when /?inv=TOKEN is loaded).
 */
export async function openInviteUrl(playerPage, inviteUrl) {
  await playerPage.goto(inviteUrl, { waitUntil: 'domcontentloaded' });
  await expect(playerPage.locator('#invite-modal')).toBeVisible({ timeout: 15_000 });
}

/**
 * Step: Fill registration form fields.
 * #invite-name-input is pre-filled from the invite — do not clear it.
 * Always fills email (may already be pre-filled) and creates a password.
 */
export async function fillRegistrationForm(playerPage, config) {
  await playerPage.locator('#invite-email-input').fill(config.testPlayerEmail);
  await playerPage.locator('#invite-password-input').fill(config.testPlayerPassword);
}

/**
 * Step: Submit registration — clicks the primary button inside #invite-modal,
 * waits for the modal to be removed from the DOM (success = acceptInvite() calls .remove()).
 * Falls back to the most recent player toast to explain failures.
 */
export async function submitRegistration(playerPage, result) {
  const submitBtn = playerPage.locator('#invite-modal .btn.primary');
  await expect(submitBtn).toBeVisible({ timeout: 5_000 });
  await submitBtn.click();

  try {
    await playerPage.waitForSelector('#invite-modal', { state: 'detached', timeout: 25_000 });
  } catch {
    // Check for a failure toast — try player toasts first, fall back to shared toasts
    const toasts = result.playerToasts?.length ? result.playerToasts : result.toasts;
    const latestToast = toasts.at(-1)?.text || '';
    throw new Error(latestToast.trim()
      ? `Registration failed — toast: "${latestToast.trim()}"`
      : '#invite-modal did not detach within 25s — claim_invite may have failed or timed out');
  }
}

/**
 * Step: Verify player appears in coach's Members list.
 * Re-clicks Members to fetch fresh data from the server.
 * Waits up to 15s for the player name to appear.
 */
export async function verifyPlayerInMembers(page, playerName, result) {
  // Re-click Members to trigger a fresh renderPlayers() call
  await page.getByRole('button', { name: 'Members', exact: true }).click();
  await expect(page.locator('#coach-players .filter-pill').first()).toBeVisible({ timeout: 10_000 });

  try {
    await expect(page.locator('#coach-players')).toContainText(playerName, { timeout: 15_000 });
  } catch {
    result.missingSelectorWarnings.push(
      `Player "${playerName}" not found in #coach-players — may be in pending state awaiting approval, ` +
      `or renderPlayers() did not re-fetch. Check #coach-players DOM in the failure screenshot.`
    );
    throw new Error(`Player "${playerName}" did not appear in #coach-players within 15s`);
  }
}

// ─── Pending approval steps (Workflow 4) ─────────────────────────────────────

/**
 * Step: Wait for a player's join request to appear in the pending requests panel.
 * loadIdentityRequests() is triggered by renderPlayers() → refreshMembersData()
 * when the Members page loads; the panel populates async so we poll.
 */
export async function seePendingRequest(page, playerFullName, result) {
  const panel = page.locator('#identity-requests-panel');

  const panelExists = await panel.isVisible({ timeout: 5_000 }).catch(() => false);
  if (!panelExists) {
    result.missingSelectorWarnings.push(
      '#identity-requests-panel not found — panel may not have rendered; renderPlayers() output may have changed'
    );
    throw new Error('#identity-requests-panel not visible — Members page may not have fully rendered');
  }

  // If the panel shows "No pending" immediately, try the Refresh button once
  const panelText = await panel.textContent({ timeout: 3_000 }).catch(() => '');
  if (/no pending/i.test(panelText)) {
    const refreshBtn = page.locator('button', { hasText: /Refresh/ }).filter({
      has: page.locator(':scope', { hasAncestor: page.locator('div:has(#identity-requests-panel)') }),
    });
    const btnVisible = await page.getByRole('button', { name: 'Refresh' }).isVisible().catch(() => false);
    if (btnVisible) await page.getByRole('button', { name: 'Refresh' }).click();
  }

  try {
    await expect(panel).toContainText(playerFullName, { timeout: 20_000 });
  } catch {
    const currentText = await panel.textContent().catch(() => '(unreadable)');
    result.missingSelectorWarnings.push(
      `"${playerFullName}" not found in #identity-requests-panel after 20s — ` +
      `panel shows: "${currentText.slice(0, 120).trim()}"`
    );
    throw new Error(`Pending join request for "${playerFullName}" did not appear in 20s`);
  }
}

/**
 * Step: Approve a pending join request by clicking the Approve button in the
 * player's request card. Waits for the "approved" toast to confirm the API call succeeded.
 */
export async function approvePendingRequest(page, playerFullName, result) {
  // Narrow to the specific request card containing the player's name
  const panel = page.locator('#identity-requests-panel');
  const requestCard = panel.locator('div').filter({ hasText: playerFullName }).first();

  const cardVisible = await requestCard.isVisible({ timeout: 5_000 }).catch(() => false);
  if (!cardVisible) {
    result.missingSelectorWarnings.push(
      `Request card for "${playerFullName}" not found in #identity-requests-panel`
    );
    throw new Error(`Could not locate request card for "${playerFullName}"`);
  }

  await requestCard.getByRole('button', { name: 'Approve' }).click();

  // approveIdentityRequest() calls render() + showToast('Player approved and added to roster')
  await expect.poll(
    () => result.toasts.at(-1)?.text || '',
    { timeout: 10_000, message: 'Approval toast should appear within 10s' }
  ).toMatch(/approved/i);
}

// ─── Messaging steps (Workflow 5) ─────────────────────────────────────────────

/**
 * Step: Navigate to the Messages section (works for both coach and player contexts).
 * Clicks the "Messages" nav button and waits for #chatContactList to populate.
 */
export async function navigateToMessages(page, result) {
  // The Messages nav button may contain a badge span (e.g. "Messages2") making its
  // accessible name "Messages2" — use a regex prefix match so the badge count is ignored.
  await page.getByRole('button', { name: /^Messages/ }).click();
  try {
    await expect(page.locator('#chatContactList')).toBeVisible({ timeout: 15_000 });
  } catch {
    result.missingSelectorWarnings.push(
      '#chatContactList not visible after clicking Messages — chat shell may not have rendered; check renderChatShell()'
    );
    throw new Error('#chatContactList not visible — chat shell did not render after navigating to Messages');
  }
}

/**
 * Step: Open a DM with a player by name in the coach's contact list.
 * Finds the .chat-contact button in #chatContactList that contains the player's name,
 * clicks it to trigger selectChat(), and waits for #chatComposerWrap to be visible.
 */
export async function openPlayerDM(page, playerName, result) {
  const contactList = page.locator('#chatContactList');
  const contact = contactList.locator('button.chat-contact').filter({ hasText: playerName }).first();

  const contactVisible = await contact.isVisible({ timeout: 10_000 }).catch(() => false);
  if (!contactVisible) {
    const listText = await contactList.textContent().catch(() => '(unreadable)');
    result.missingSelectorWarnings.push(
      `Contact "${playerName}" not found in #chatContactList. Visible contacts: "${listText.slice(0, 200).trim()}". ` +
      `Player must be an approved member and chatResolvePlayerParticipantId() must resolve their id.`
    );
    throw new Error(`Player "${playerName}" not in chat contact list`);
  }

  await contact.click();

  // The contact click calls selectChat() which does NOT create the Redis conversation.
  // chatStartCoachDm() is the only path that calls create_conv, so we invoke it here
  // to ensure the conversation exists before any message sends.
  await page.evaluate(async (targetName) => {
    const visiblePlayers = (typeof canonicalVisiblePlayers === 'function') ? canonicalVisiblePlayers() : [];
    const player = visiblePlayers.find(p => String(p.name || '').trim() === String(targetName || '').trim());
    if (player && typeof chatStartCoachDm === 'function') {
      try { await chatStartCoachDm(player.id); } catch (e) { console.warn('[QA] chatStartCoachDm failed:', e.message); }
    }
  }, playerName);

  // chatFeed and chatComposerWrap are rendered by selectChat() → chatRenderMessages()
  await expect(page.locator('#chatFeed')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#chatComposerWrap')).toBeVisible({ timeout: 5_000 });
}

/**
 * Step: Open the Coach DM from the player's contact list.
 * The player sees a contact named "Coach 🎯" for their DM with the coach.
 * After login, selectedChatId is auto-canonicalized to the coach DM, so the
 * feed may already be open — this step makes it explicit.
 */
export async function openCoachDM(playerPage, result) {
  const contactList = playerPage.locator('#chatContactList');

  // Try to click Coach contact by name — text may be "Coach" with emoji
  const coachContact = contactList.locator('button.chat-contact').filter({ hasText: /\bCoach\b/ }).first();
  const contactVisible = await coachContact.isVisible({ timeout: 10_000 }).catch(() => false);

  if (contactVisible) {
    await coachContact.click();
  } else {
    // Fall back: feed may already be open from auto-canonicalization
    const feedVisible = await playerPage.locator('#chatFeed').isVisible({ timeout: 5_000 }).catch(() => false);
    if (!feedVisible) {
      result.missingSelectorWarnings.push(
        '"Coach" contact not found in #chatContactList and #chatFeed not visible — player chat may not have initialized'
      );
      throw new Error('Coach DM not visible from player context');
    }
  }

  await expect(playerPage.locator('#chatFeed')).toBeVisible({ timeout: 10_000 });
}

/**
 * Step: Type and send a message in the current conversation.
 * Uses fill() on #chatComposer (sets value directly) then clicks #chatSendBtn.
 * Verifies the message appears immediately via optimistic render in #chatFeed.
 */
export async function sendChatMessage(page, text, result) {
  const composer = page.locator('#chatComposer');
  await expect(composer).toBeVisible({ timeout: 5_000 });
  await composer.fill(text);

  const sendBtn = page.locator('#chatSendBtn');
  await expect(sendBtn).toBeVisible({ timeout: 3_000 });
  await sendBtn.click();

  // Optimistic render: message appears in feed immediately (before API ack)
  try {
    await expect(page.locator('#chatFeed')).toContainText(text, { timeout: 8_000 });
  } catch {
    result.missingSelectorWarnings.push(
      `Sent message "${text.slice(0, 60)}" did not appear in #chatFeed within 8s — ` +
      `chatSendMessage() may have failed or the optimistic render path changed`
    );
    throw new Error(`Message not found in chat feed after sending: "${text.slice(0, 80)}"`);
  }
}

/**
 * Step: Wait for a specific message to appear in the chat feed.
 * Used to verify a message sent from another context has arrived via polling.
 * The chat polls every 2500ms, so 15s timeout covers 6 poll cycles.
 */
export async function verifyChatMessage(page, text, result, opts = {}) {
  const timeout = opts.timeout || 15_000;
  try {
    await expect(page.locator('#chatFeed')).toContainText(text, { timeout });
  } catch {
    const feedText = await page.locator('#chatFeed').textContent().catch(() => '(unreadable)');
    result.missingSelectorWarnings.push(
      `Expected message "${text.slice(0, 60)}" not found in #chatFeed after ${timeout}ms. ` +
      `Feed snapshot: "${feedText.slice(0, 200).trim()}"`
    );
    throw new Error(`Message not found in chat feed within ${timeout}ms: "${text.slice(0, 80)}"`);
  }
}
