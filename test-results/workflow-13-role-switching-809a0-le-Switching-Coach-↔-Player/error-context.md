# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workflow-13-role-switching.spec.js >> Workflow 13 — Role Switching Coach ↔ Player
- Location: qa/e2e/workflow-13-role-switching.spec.js:94:1

# Error details

```
TypeError: Cannot read properties of undefined (reading 'push')
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - complementary [ref=e3]:
    - generic [ref=e4]:
      - generic [ref=e5]: CE
      - generic [ref=e6]:
        - strong [ref=e7]: coacheseyeGPT
        - paragraph [ref=e8]: Boitsfort RFC
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
        - button "Switch ↓" [ref=e20] [cursor=pointer]
    - navigation "Coach sections" [ref=e21]:
      - button "Overview" [ref=e22] [cursor=pointer]
      - button "Availability" [ref=e23] [cursor=pointer]
      - button "Messages" [ref=e24] [cursor=pointer]
      - button "Training" [ref=e25] [cursor=pointer]
      - button "Matchday Centre" [ref=e26] [cursor=pointer]
      - button "Medical" [ref=e27] [cursor=pointer]
      - button "Members" [ref=e28] [cursor=pointer]
    - generic [ref=e31]:
      - generic [ref=e32]: Notifications blocked
      - generic [ref=e33]: Allow in browser settings
    - generic [ref=e34]:
      - strong [ref=e35]: Boitsfort RFC · Prototype
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
        - generic [ref=e49]:
          - generic [ref=e50]: Available this week
          - strong [ref=e51]: "0"
          - generic [ref=e52]: Game responses marked available
        - generic [ref=e53]:
          - generic [ref=e54]: Unavailable
          - strong [ref=e55]: "0"
          - generic [ref=e56]: Unavailable or injured
        - generic [ref=e57]:
          - generic [ref=e58]: No response
          - strong [ref=e59]: "0"
          - generic [ref=e60]: Players to chase in-app
        - generic [ref=e61]:
          - generic [ref=e62]: Unread responses
          - strong [ref=e63]: "1"
          - generic [ref=e64]: Player replies waiting
        - generic [ref=e65]:
          - generic [ref=e66]: Medical updates
          - strong [ref=e67]: "0"
          - generic [ref=e68]: Open medical records this week
        - generic [ref=e69]:
          - generic [ref=e70]: Training attendance
          - strong [ref=e71]: 0%
          - generic [ref=e72]: Squad average this season
      - generic [ref=e73]:
        - generic [ref=e74]:
          - generic [ref=e75]:
            - generic [ref=e76]: Next fixture
            - heading "Kituro" [level=3] [ref=e77]
            - generic [ref=e78]:
              - generic [ref=e79]:
                - text: 📍
                - strong [ref=e80]: Home
              - generic [ref=e81]:
                - text: 📅
                - strong [ref=e82]: This Saturday
              - generic [ref=e83]:
                - text: 🟢
                - strong [ref=e84]: Availability open
            - generic [ref=e85]:
              - generic [ref=e86]: 0 Available
              - generic [ref=e87]: 0 No reply
              - generic [ref=e88]: 0 Injured
          - generic [ref=e89]:
            - heading "This week at a glance" [level=2] [ref=e90]
            - paragraph [ref=e91]: Click a session to open the full detail in Command Center.
            - generic [ref=e92]:
              - generic [ref=e93]:
                - generic [ref=e94]: Training
                - strong [ref=e95]: Tuesday training
                - generic [ref=e96]: Tuesday 19:45
                - strong [ref=e97]: "0"
                - generic [ref=e98]: of 0 available
                - generic [ref=e99]: 0/0 replied · 0%
                - button "View detail →" [ref=e101] [cursor=pointer]
              - generic [ref=e102]:
                - generic [ref=e103]: Training
                - strong [ref=e104]: Thursday team run
                - generic [ref=e105]: Thursday 19:45
                - strong [ref=e106]: "0"
                - generic [ref=e107]: of 0 available
                - generic [ref=e108]: 0/0 replied · 0%
                - button "View detail →" [ref=e110] [cursor=pointer]
              - generic [ref=e111]:
                - generic [ref=e112]: Match
                - strong [ref=e113]: Boitsfort Premier vs Kituro
                - generic [ref=e114]: Saturday fixture
                - strong [ref=e115]: "0"
                - generic [ref=e116]: of 0 available
                - generic [ref=e117]: 0/0 replied · 0%
                - button "View detail →" [ref=e119] [cursor=pointer]
          - generic [ref=e120]:
            - heading "Upcoming fixtures" [level=2] [ref=e121]
            - generic [ref=e122]:
              - generic [ref=e123]:
                - generic [ref=e124]:
                  - strong [ref=e125]:
                    - text: "Next Saturday:"
                    - strong [ref=e126]: ASUB
                  - text: Away · Not opened
                - generic [ref=e128]: Not opened
              - generic [ref=e129]:
                - generic [ref=e130]:
                  - strong [ref=e131]:
                    - text: "Two weeks:"
                    - strong [ref=e132]: Dendermonde
                  - text: Home · Not opened
                - generic [ref=e134]: Not opened
              - generic [ref=e135]:
                - generic [ref=e136]:
                  - strong [ref=e137]:
                    - text: "Three weeks:"
                    - strong [ref=e138]: La Hulpe
                  - text: Away · Not opened
                - generic [ref=e140]: Not opened
        - generic [ref=e141]:
          - generic [ref=e142]:
            - heading "Automation queue" [level=2] [ref=e143]
            - paragraph [ref=e144]: Scheduled availability requests for this week.
            - generic [ref=e145]:
              - generic [ref=e146]:
                - generic [ref=e147]:
                  - strong [ref=e148]: Tuesday training availability
                  - generic [ref=e149]: Sunday 18:00
                - generic [ref=e150]: Active
              - generic [ref=e151]:
                - generic [ref=e152]:
                  - strong [ref=e153]: Thursday team run availability
                  - generic [ref=e154]: Tuesday 21:30
                - generic [ref=e155]: Active
              - generic [ref=e156]:
                - generic [ref=e157]:
                  - strong [ref=e158]: Weekend match availability
                  - generic [ref=e159]: Tuesday 09:00
                - generic [ref=e160]: Active
            - button "Manage automations →" [ref=e161] [cursor=pointer]
          - generic [ref=e162]:
            - heading "Unavailable for Kituro" [level=2] [ref=e163]
            - paragraph [ref=e165]: No unavailable players yet.
    - text: ▼ ▼ ▼ ▼
```

# Test source

```ts
  1   | /**
  2   |  * Shared step implementations for Coach's Eye QA workflows.
  3   |  *
  4   |  * Contract for coachLogin: callers must attach a page.on('console', ...) listener
  5   |  * that appends to result.toasts before calling this function — the login success/failure
  6   |  * detection reads from result.toasts (populated by the toast MutationObserver).
  7   |  *
  8   |  * result shape expected: { toasts: [], missingSelectorWarnings: [], loginMethod: '' }
  9   |  */
  10  | 
  11  | import { expect } from '@playwright/test';
  12  | 
  13  | /**
  14  |  * Step: Open app — navigate to / and wait for #authPanel.
  15  |  */
  16  | export async function openApp(page) {
  17  |   await page.goto('/', { waitUntil: 'domcontentloaded' });
  18  |   await expect(page.locator('#authPanel')).toBeVisible({ timeout: 15_000 });
  19  | }
  20  | 
  21  | /**
  22  |  * Step: Coach login — uses #devLoginBtn when available and no password is set,
  23  |  * otherwise falls back to credential form. Sets result.loginMethod.
  24  |  */
  25  | export async function coachLogin(page, config, result) {
  26  |   const devBtn = page.locator('#devLoginBtn');
  27  |   const devBtnVisible = await devBtn.isVisible({ timeout: 2_000 }).catch(() => false);
  28  | 
  29  |   // The devLoginBtn is rendered conditionally after an async config fetch, so it may
  30  |   // not appear in the DOM even when devLoginAvailable=true. Check the API directly as
  31  |   // a reliable fallback and invoke devCoachLogin() in the page context if available.
  32  |   const devAvailableViaApi = !config.coachPassword && !devBtnVisible
  33  |     ? await page.evaluate(async () => {
  34  |         try {
  35  |           const res = await fetch('/api/identity?action=config');
  36  |           const data = await res.json();
  37  |           return Boolean(data.devLoginAvailable);
  38  |         } catch { return false; }
  39  |       }).catch(() => false)
  40  |     : false;
  41  | 
  42  |   if (devBtnVisible && !config.coachPassword) {
  43  |     result.loginMethod = 'dev-login-btn';
  44  |     await devBtn.click();
  45  |   } else if (devAvailableViaApi) {
  46  |     result.loginMethod = 'dev-login-evaluate';
  47  |     const evalResult = await page.evaluate(async () => {
  48  |       if (typeof window.devCoachLogin === 'function') {
  49  |         try { await window.devCoachLogin(); return { ok: true }; }
  50  |         catch (e) { return { ok: false, error: e.message }; }
  51  |       }
  52  |       // Fallback: call the API directly and reload so the app picks up the session cookie
  53  |       const res = await fetch('/api/identity', {
  54  |         method: 'POST',
  55  |         headers: { 'Content-Type': 'application/json' },
  56  |         body: JSON.stringify({ action: 'dev_coach_login' }),
  57  |       });
  58  |       const data = await res.json().catch(() => ({}));
  59  |       return { ok: res.ok && data.ok !== false, error: data.error || null, needsReload: true };
  60  |     });
  61  |     if (!evalResult.ok) {
  62  |       throw new Error(`Dev coach login failed: ${evalResult.error || 'unknown error'}`);
  63  |     }
  64  |     if (evalResult.needsReload) {
  65  |       await page.reload({ waitUntil: 'domcontentloaded' });
  66  |     }
  67  |   } else if (config.coachPassword) {
  68  |     result.loginMethod = 'credentials';
  69  |     if (!devBtnVisible) {
  70  |       const loginTab = page.getByRole('button', { name: /^Login$/i });
  71  |       const loginTabVisible = await loginTab.isVisible({ timeout: 2_000 }).catch(() => false);
  72  |       if (loginTabVisible) await loginTab.click();
  73  |     }
  74  |     await page.locator('#identityLoginEmail').fill(config.coachEmail);
  75  |     await page.locator('#identityLoginPassword').fill(config.coachPassword);
  76  |     await page.locator('#identityLoginBtn').click();
  77  |   } else {
> 78  |     result.missingSelectorWarnings.push(
      |                                    ^ TypeError: Cannot read properties of undefined (reading 'push')
  79  |       'devLoginBtn not visible, devLoginAvailable=false via API, and QA_COACH_PASSWORD not set'
  80  |     );
  81  |     throw new Error('Cannot log in: devLoginBtn not visible, devLoginAvailable=false via API, and QA_COACH_PASSWORD is not set');
  82  |   }
  83  | 
  84  |   await expect.poll(async () => {
  85  |     const membersVisible = await page
  86  |       .getByRole('button', { name: 'Members', exact: true })
  87  |       .isVisible()
  88  |       .catch(() => false);
  89  |     if (membersVisible) return 'ok';
  90  |     const coachNavVisible = await page
  91  |       .locator('#coachNav:not(.hidden)')
  92  |       .isVisible()
  93  |       .catch(() => false);
  94  |     if (coachNavVisible) return 'ok';
  95  |     const latestToast = result.toasts.at(-1)?.text || '';
  96  |     if (/too many|failed|error|invalid|limit exceeded/i.test(latestToast)) {
  97  |       throw new Error(`Login rejected — toast: "${latestToast}"`);
  98  |     }
  99  |     return 'waiting';
  100 |   }, { timeout: 15_000, message: 'coach login: authenticated UI should appear within 15s' }).toBe('ok');
  101 | }
  102 | 
  103 | /**
  104 |  * Step: Navigate to Members — click Members nav button, wait for page title.
  105 |  */
  106 | export async function navigateToMembers(page) {
  107 |   await page.getByRole('button', { name: 'Members', exact: true }).click();
  108 |   await expect(page.locator('h1#pageTitle')).toBeVisible({ timeout: 10_000 });
  109 | }
  110 | 
  111 | /**
  112 |  * Rough Redis op estimate per /api/* call based on post-optimisation analysis.
  113 |  * Used consistently across all workflow reports.
  114 |  */
  115 | export function redisEstimate(endpointPath, method = 'GET') {
  116 |   if (endpointPath.startsWith('/api/identity'))     return method === 'GET' ? 6 : 8;
  117 |   if (endpointPath.startsWith('/api/chat'))         return 8;
  118 |   if (endpointPath.startsWith('/api/invite'))       return method === 'POST' ? 8 : 4;
  119 |   if (endpointPath.startsWith('/api/availability')) return 4;
  120 |   if (endpointPath.startsWith('/api/cron'))         return 6;
  121 |   return 2;
  122 | }
  123 | 
  124 | // ─── Player login (Workflow 5) ───────────────────────────────────────────────
  125 | 
  126 | /**
  127 |  * Step: Log in as a player using email + password.
  128 |  * Handles two auth panel states: default card (shows Login tab) and already-open login form.
  129 |  * Waits for #playerNav to become visible, confirming player session is active.
  130 |  * config must have: testPlayerEmail, testPlayerPassword.
  131 |  */
  132 | export async function playerLogin(playerPage, config, result) {
  133 |   await playerPage.goto('/', { waitUntil: 'domcontentloaded' });
  134 |   await expect(playerPage.locator('#authPanel')).toBeVisible({ timeout: 15_000 });
  135 | 
  136 |   // The panel may show a user card with a "Login" tab, or already show the login form.
  137 |   const loginFormVisible = await playerPage.locator('#identityLoginEmail').isVisible({ timeout: 2_000 }).catch(() => false);
  138 |   if (!loginFormVisible) {
  139 |     const loginTab = playerPage.locator('.auth-tab').filter({ hasText: /^Login$/ });
  140 |     const tabVisible = await loginTab.isVisible({ timeout: 3_000 }).catch(() => false);
  141 |     if (tabVisible) {
  142 |       await loginTab.click();
  143 |     } else {
  144 |       result.missingSelectorWarnings.push('Login tab not visible and #identityLoginEmail not visible — auth panel may be in unexpected state');
  145 |       throw new Error('Cannot open login form: neither Login tab nor email input visible');
  146 |     }
  147 |   }
  148 | 
  149 |   await playerPage.locator('#identityLoginEmail').fill(config.testPlayerEmail);
  150 |   await playerPage.locator('#identityLoginPassword').fill(config.testPlayerPassword);
  151 |   await playerPage.locator('#identityLoginBtn').click();
  152 | 
  153 |   // Player nav appears when session is active
  154 |   try {
  155 |     await expect(playerPage.locator('#playerNav:not(.hidden)')).toBeVisible({ timeout: 15_000 });
  156 |   } catch {
  157 |     const toasts = result.playerToasts || [];
  158 |     const latestToast = toasts.at(-1)?.text || '';
  159 |     throw new Error(latestToast
  160 |       ? `Player login failed — toast: "${latestToast}"`
  161 |       : 'Player nav did not appear within 15s — login may have failed or player is not yet approved');
  162 |   }
  163 | 
  164 |   // After login the app may call coach-only endpoints (/api/invite, /api/schedules, etc.) during
  165 |   // initial data load. Those endpoints return 403 for players, which incorrectly triggers
  166 |   // handleSessionExpiry() and shows the "session has expired" overlay even though the player
  167 |   // IS authenticated. Dismiss it if present — the session is valid (playerNav is visible).
  168 |   const sessionOverlayVisible = await playerPage.locator('#identityLoginEmail').isVisible({ timeout: 2_000 }).catch(() => false);
  169 |   if (sessionOverlayVisible) {
  170 |     await playerPage.evaluate(() => { if (typeof window.setAuthTab === 'function') window.setAuthTab('closed'); });
  171 |     await expect(playerPage.locator('#identityLoginEmail')).toBeHidden({ timeout: 5_000 });
  172 |   }
  173 | }
  174 | 
  175 | // ─── Group invite steps (Workflow 4) ─────────────────────────────────────────
  176 | 
  177 | /**
  178 |  * Step: Generate group invite via API.
```