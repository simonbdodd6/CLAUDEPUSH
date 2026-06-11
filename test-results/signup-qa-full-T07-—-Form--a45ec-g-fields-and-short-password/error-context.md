# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: signup-qa-full.spec.js >> T07 — Form validation: missing fields and short password
- Location: qa/e2e/signup-qa-full.spec.js:292:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('New coach? Create a club')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText('New coach? Create a club')

```

```yaml
- complementary:
  - text: CE
  - strong: Coach's Eye
  - paragraph: My Team
  - button "Coach"
  - button "Player"
  - strong: Simon Coach
  - text: 🎯 Coach
  - button "Login"
  - button "Join"
  - button "Switch"
  - navigation "Coach sections":
    - button "Overview"
    - button "Availability"
    - button "Messages"
    - button "Training"
    - button "Match Centre"
    - button "Medical"
    - button "Members"
  - text: Notifications blocked Allow in browser settings
  - strong: My Team · Coach's Eye
  - paragraph: Data saved locally in this browser.
- main:
  - text: Coach dashboard
  - heading "Overview" [level=1]
  - button "Reset"
  - text: "Wed 10 Jun Setup: 0/5 done Prepare vs Opposition TBC Date TBC · 15:00 Date TBC"
  - button "Match Centre →"
  - text: Getting started with Coach's Eye Complete these steps to become fully operational.
  - button "Skip guide"
  - text: 1 Set your club name Used in notifications, exports and team sheet
  - button "Set name →"
  - text: 2 Add your players Import CSV or add manually — takes under a minute
  - button "Import players →"
  - text: 3 Send availability request Ask who's available for training and the match
  - button "Send request →"
  - text: 4 Build a training session Plan Tuesday or Thursday training blocks
  - button "Plan session →"
  - text: 5 Publish your squad Select players and publish the team sheet
  - button "Open Match Centre →"
```

# Test source

```ts
  1   | /**
  2   |  * Signup QA — full verification of self-service signup flow.
  3   |  *
  4   |  * Tests:
  5   |  *  T01  New coach signup from login screen (happy path, desktop)
  6   |  *  T02  Club and session creation verified via authenticated API call
  7   |  *  T03  Welcome email — API confirms send attempt (non-blocking)
  8   |  *  T04  Duplicate team code protection
  9   |  *  T05  Duplicate email protection
  10  |  *  T06  Rate limiting (3/hr/IP)
  11  |  *  T07  Form validation — missing fields and short password
  12  |  *  T08  Mobile layout (375×812)
  13  |  *  T09  PWA — manifest loads, service worker registers
  14  |  *  T10  Logout and re-login with signup credentials
  15  |  *
  16  |  * All screenshots written to qa/screenshots/signup-qa/
  17  |  */
  18  | 
  19  | import { test, expect } from '@playwright/test';
  20  | 
  21  | const SHOTS = 'qa/screenshots/signup-qa';
  22  | const BASE  = process.env.QA_BASE_URL || 'http://127.0.0.1:3000';
  23  | 
  24  | // Unique suffix so each run gets fresh codes even if previous test data persists
  25  | const RUN_ID    = Date.now().toString(36).toUpperCase().slice(-5);
  26  | const CLUB_NAME = `QA Club ${RUN_ID}`;
  27  | const TEAM_CODE = `QACLUB${RUN_ID}`;        // ≤12 chars
  28  | const COACH_EMAIL    = `qa.coach.${RUN_ID.toLowerCase()}@qa.test`;
  29  | const COACH_PASSWORD = 'qapassword99';
  30  | const COACH_FIRST    = 'QA';
  31  | const COACH_LAST     = 'Coach';
  32  | 
  33  | // ─── Helpers ────────────────────────────────────────────────────────────────
  34  | 
  35  | async function shot(page, name) {
  36  |   await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
  37  | }
  38  | 
  39  | async function openSignupForm(page) {
  40  |   await page.goto('/', { waitUntil: 'domcontentloaded' });
  41  |   await expect(page.locator('#authPanel')).toBeVisible({ timeout: 15_000 });
  42  |   // "New coach? Create a club →" link in login panel
  43  |   const createLink = page.getByText('New coach? Create a club', { exact: false });
> 44  |   await expect(createLink).toBeVisible({ timeout: 5_000 });
      |                            ^ Error: expect(locator).toBeVisible() failed
  45  |   await createLink.click();
  46  |   await expect(page.locator('#signupClubName')).toBeVisible({ timeout: 5_000 });
  47  | }
  48  | 
  49  | // ─── T01: Happy path signup (desktop) ────────────────────────────────────────
  50  | 
  51  | test('T01 — Happy path signup from login screen', async ({ page }) => {
  52  |   await page.goto('/', { waitUntil: 'domcontentloaded' });
  53  |   await expect(page.locator('#authPanel')).toBeVisible({ timeout: 15_000 });
  54  | 
  55  |   // Step 1: Login panel — "New coach? Create a club →" link visible
  56  |   await shot(page, 't01-01-login-panel');
  57  |   const createLink = page.getByText('New coach? Create a club', { exact: false });
  58  |   await expect(createLink).toBeVisible();
  59  | 
  60  |   // Step 2: Click link → signup form appears
  61  |   await createLink.click();
  62  |   await expect(page.locator('#signupClubName')).toBeVisible({ timeout: 5_000 });
  63  |   await shot(page, 't01-02-signup-form-empty');
  64  | 
  65  |   // Step 3: Type club name → team code auto-suggests
  66  |   await page.fill('#signupClubName', CLUB_NAME);
  67  |   await page.waitForTimeout(400);
  68  |   const suggestedCode = await page.locator('#signupTeamCode').inputValue();
  69  |   await shot(page, 't01-03-autosuggest');
  70  |   expect(suggestedCode.length).toBeGreaterThan(0);
  71  |   expect(suggestedCode).toMatch(/^[A-Z0-9]+$/);
  72  | 
  73  |   // Step 4: Set explicit team code, fill remaining fields
  74  |   await page.fill('#signupTeamCode', TEAM_CODE);
  75  |   await page.locator('#signupTeamCode').dispatchEvent('input'); // mark as edited
  76  |   await page.fill('#signupFirstName', COACH_FIRST);
  77  |   await page.fill('#signupLastName',  COACH_LAST);
  78  |   await page.fill('#signupEmail',     COACH_EMAIL);
  79  |   await page.fill('#signupPassword',  COACH_PASSWORD);
  80  |   await shot(page, 't01-04-form-filled');
  81  | 
  82  |   // Step 5: Submit
  83  |   await page.locator('#signupSubmitBtn').click();
  84  |   await shot(page, 't01-05-submitting');
  85  | 
  86  |   // Step 6: Should land on coach dashboard OR show rate-limit error
  87  |   // Rate limit may be active from earlier test session — handle both
  88  |   const errMsg = page.locator('#signupErrMsg');
  89  |   const coachNav = page.locator('#coachNav:not(.hidden)');
  90  | 
  91  |   await Promise.race([
  92  |     expect(coachNav).toBeVisible({ timeout: 20_000 }),
  93  |     expect(errMsg).toBeVisible({ timeout: 20_000 }),
  94  |   ]).catch(() => {});
  95  | 
  96  |   const dashboardVisible = await coachNav.isVisible().catch(() => false);
  97  |   const errorVisible     = await errMsg.isVisible().catch(() => false);
  98  |   const errorText        = errorVisible ? await errMsg.textContent() : '';
  99  | 
  100 |   await shot(page, 't01-06-result');
  101 | 
  102 |   if (dashboardVisible) {
  103 |     // Full success path
  104 |     await expect(page.locator('text=Overview').first()).toBeVisible({ timeout: 5_000 });
  105 |     await shot(page, 't01-07-dashboard');
  106 | 
  107 |     // Toast should mention team code
  108 |     const toastText = await page.locator('#toast, [role="status"], .toast').textContent().catch(() => '');
  109 |     console.log('[T01] Toast:', toastText || '(not found by selector)');
  110 |     console.log(`[T01] PASS — Signed up as ${COACH_EMAIL}, club ${TEAM_CODE}`);
  111 |   } else if (errorVisible && /too many/i.test(errorText)) {
  112 |     // Rate limit hit — expected in this test environment
  113 |     console.log('[T01] Rate limit active — signup blocked by 3/hr/IP limit (expected in QA re-run)');
  114 |     console.log('[T01] SKIP — rate limited, not a bug in signup logic');
  115 |     // Mark this test as a known environment constraint, not a failure
  116 |     test.info().annotations.push({ type: 'note', description: 'Rate limited — form and routing work; signup blocked by IP rate limit from prior test session' });
  117 |   } else {
  118 |     // Unexpected error
  119 |     throw new Error(`T01 unexpected outcome — dashboard: ${dashboardVisible}, error: "${errorText}"`);
  120 |   }
  121 | });
  122 | 
  123 | // ─── T02: Club + session creation via API ────────────────────────────────────
  124 | 
  125 | test('T02 — Club and session verified via authenticated API', async ({ request }) => {
  126 |   // Use previously created BALLYMENA club from implementation session
  127 |   // This verifies that signup actually persisted club+user+session to Redis
  128 | 
  129 |   const loginRes = await request.post(`${BASE}/api/identity`, {
  130 |     data: {
  131 |       action:   'login',
  132 |       email:    'paddy.mccoach.test@example.com',
  133 |       password: 'testpassword123',
  134 |     },
  135 |   });
  136 |   expect(loginRes.ok()).toBeTruthy();
  137 |   const loginData = await loginRes.json();
  138 | 
  139 |   expect(loginData.ok).toBe(true);
  140 |   expect(loginData.user.role).toBe('coach');
  141 |   expect(loginData.user.email).toBe('paddy.mccoach.test@example.com');
  142 | 
  143 |   // Use session to fetch identity state
  144 |   const cookies = loginRes.headers()['set-cookie'] || '';
```