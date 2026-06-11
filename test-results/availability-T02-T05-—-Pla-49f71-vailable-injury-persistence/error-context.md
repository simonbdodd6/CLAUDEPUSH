# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: availability.spec.js >> T02-T05 — Player submits responses (available, maybe+work, unavailable+injury) + persistence
- Location: qa/e2e/availability.spec.js:130:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('#player-availability .avail-player-card').first()
Expected: visible
Timeout: 8000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 8000ms
  - waiting for locator('#player-availability .avail-player-card').first()

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
  - navigation "Player sections":
    - button "Messages"
    - button "Availability"
    - button "This Week"
    - button "Calendar"
  - text: Notifications blocked Allow in browser settings
  - strong: My Team · Coach's Eye
  - paragraph: Data saved locally in this browser.
- main:
  - text: Player portal — —
  - heading "Availability" [level=1]
  - button "Reset"
  - paragraph: 🏉
  - paragraph: No players added yet
  - paragraph: Import your squad to get started. Takes less than a minute.
  - button "Go to Player DB →"
- text: "Dev login failed: Identity storage not configured yet"
```

# Test source

```ts
  42  |   suite:      'availability',
  43  |   runId:      new Date().toISOString().replace(/[:.]/g, '-'),
  44  |   startedAt:  new Date().toISOString(),
  45  |   finishedAt: null,
  46  |   status:     'running',
  47  |   baseURL:    BASE,
  48  |   commit:     gitCommit(),
  49  |   steps:      [],
  50  |   pageErrors: [],
  51  | };
  52  | 
  53  | function ensureDirs() {
  54  |   fs.mkdirSync(SHOTS_DIR, { recursive: true });
  55  |   fs.mkdirSync(path.dirname(RESULT_PATH), { recursive: true });
  56  | }
  57  | 
  58  | function saveResult(status = run.status) {
  59  |   run.status     = status;
  60  |   run.finishedAt = new Date().toISOString();
  61  |   fs.writeFileSync(RESULT_PATH, JSON.stringify(run, null, 2));
  62  | }
  63  | 
  64  | async function step(page, name, fn) {
  65  |   const entry = { name, status: 'running', startedAt: new Date().toISOString() };
  66  |   run.steps.push(entry);
  67  |   try {
  68  |     await fn();
  69  |     entry.status = 'passed';
  70  |   } catch (e) {
  71  |     entry.status = 'failed';
  72  |     entry.error  = e.message;
  73  |     const shotPath = path.join(SHOTS_DIR, `FAIL-${name.replace(/[^a-z0-9]+/gi, '-')}.png`);
  74  |     await page.screenshot({ path: shotPath, fullPage: false }).catch(() => {});
  75  |     entry.screenshot = path.relative(process.cwd(), shotPath);
  76  |     saveResult('failed');
  77  |     throw e;
  78  |   } finally {
  79  |     entry.finishedAt = new Date().toISOString();
  80  |     const shotPath = path.join(SHOTS_DIR, `${String(run.steps.length).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '-')}.png`);
  81  |     await page.screenshot({ path: shotPath, fullPage: false }).catch(() => {});
  82  |     entry.screenshot = path.relative(process.cwd(), shotPath);
  83  |     saveResult();
  84  |   }
  85  | }
  86  | 
  87  | // ── Before all: seed clean state ────────────────────────────────────────────
  88  | test.beforeAll(async () => {
  89  |   ensureDirs();
  90  |   // Reset availability via seed API so each run starts clean.
  91  |   const res = await fetch(`${BASE}/api/availability`, {
  92  |     method: 'POST',
  93  |     headers: { 'Content-Type': 'application/json' },
  94  |     body: JSON.stringify({ action: 'reset_availability' }),
  95  |   });
  96  |   if (!res.ok) {
  97  |     const text = await res.text().catch(() => `HTTP ${res.status}`);
  98  |     console.warn(`[seed] reset_availability returned ${res.status}: ${text}`);
  99  |   }
  100 | });
  101 | 
  102 | // ── T01: Coach opens Availability Centre ────────────────────────────────────
  103 | test('T01 — Coach opens Availability Centre', async ({ page }) => {
  104 |   await installToastCapture(page);
  105 |   page.on('console', m => { if (m.type() === 'error') run.pageErrors.push(m.text()); });
  106 | 
  107 |   await step(page, 't01-open-app',             () => openApp(page));
  108 |   await step(page, 't01-coach-login',          () => coachLogin(page));
  109 |   await step(page, 't01-navigate-availability', () => navigateToAvailability(page));
  110 | 
  111 |   await step(page, 't01-dashboard-visible', async () => {
  112 |     // The Availability Centre header must be visible
  113 |     await expect(page.locator('h2').filter({ hasText: 'Availability Centre' })).toBeVisible({ timeout: 8_000 });
  114 |     // Session cards for the schedule must render
  115 |     const cards = page.locator('.msg-session-card');
  116 |     await expect(cards.first()).toBeVisible({ timeout: 8_000 });
  117 |     // KPI grid must show Available / Unavailable counts
  118 |     await expect(page.locator('.msg-kpi.available')).toBeVisible({ timeout: 5_000 });
  119 |   });
  120 | 
  121 |   await step(page, 't01-session-picker-has-sessions', async () => {
  122 |     const count = await page.locator('.msg-session-card').count();
  123 |     if (count === 0) throw new Error('No session cards rendered in session picker');
  124 |   });
  125 | 
  126 |   saveResult('passed');
  127 | });
  128 | 
  129 | // ── T02–T05: Player availability submissions + persistence ───────────────────
  130 | test('T02-T05 — Player submits responses (available, maybe+work, unavailable+injury) + persistence', async ({ page }) => {
  131 |   await installToastCapture(page);
  132 |   page.on('console', m => { if (m.type() === 'error') run.pageErrors.push(m.text()); });
  133 | 
  134 |   await step(page, 't02-open-app',          () => openApp(page));
  135 |   await step(page, 't02-coach-login',       () => coachLogin(page));
  136 |   await step(page, 't02-enter-player-view', () => page.evaluate(() => devLogin('player-simon-test')));
  137 | 
  138 |   await step(page, 't02-navigate-player-availability', async () => {
  139 |     await navigateToPlayerAvailability(page);
  140 |     // All 3 session cards should be visible
  141 |     const blocks = page.locator('#player-availability .avail-player-card');
> 142 |     await expect(blocks.first()).toBeVisible({ timeout: 8_000 });
      |                                  ^ Error: expect(locator).toBeVisible() failed
  143 |   });
  144 | 
  145 |   // T02: Available — verify via in-memory state (toast wrapper doesn't intercept function decl closures)
  146 |   await step(page, 't02-select-available-tuesday', async () => {
  147 |     // Click the Available button for the first session (Tuesday training)
  148 |     const availBtns = page.locator('#player-availability button', { hasText: 'Available' });
  149 |     await expect(availBtns.first()).toBeVisible({ timeout: 5_000 });
  150 |     await availBtns.first().click();
  151 |     // After setPlayerAvailability runs, the first session key (trainingTuesday) must be 'available'
  152 |     await expect.poll(
  153 |       () => page.evaluate(() => {
  154 |         try { return getPlayer().trainingTuesday === 'available'; }
  155 |         catch { return false; }
  156 |       }),
  157 |       { timeout: 5_000 }
  158 |     ).toBe(true);
  159 |   });
  160 | 
  161 |   // T03: Maybe + Work — verify state and reason
  162 |   await step(page, 't03-select-maybe-thursday', async () => {
  163 |     // Click Maybe on the second session block (Thursday)
  164 |     const maybeBtns = page.locator('#player-availability button', { hasText: 'Maybe' });
  165 |     const count = await maybeBtns.count();
  166 |     await maybeBtns.nth(count > 1 ? 1 : 0).click();
  167 |     // Reason picker should appear
  168 |     await expect(page.locator('#player-availability button', { hasText: 'Work' })).toBeVisible({ timeout: 3_000 });
  169 |     // Select Work reason
  170 |     await page.locator('#player-availability button', { hasText: 'Work' }).click();
  171 |     // Verify state: trainingThursday === 'maybe' and reason === 'work'
  172 |     await expect.poll(
  173 |       () => page.evaluate(() => {
  174 |         try {
  175 |           const p = getPlayer();
  176 |           return p.trainingThursday === 'maybe' && p.trainingThursdayReason === 'work';
  177 |         } catch { return false; }
  178 |       }),
  179 |       { timeout: 5_000 }
  180 |     ).toBe(true);
  181 |   });
  182 | 
  183 |   // T04: Not Available + Injury
  184 |   await step(page, 't04-select-unavailable-game-injury', async () => {
  185 |     const unavailBtns = page.locator('#player-availability button', { hasText: "Can't make it" });
  186 |     // Click the last one (game session)
  187 |     const count = await unavailBtns.count();
  188 |     await unavailBtns.nth(count - 1).click();
  189 |     // Reason picker should appear
  190 |     await expect(page.locator('#player-availability button', { hasText: 'Injury' })).toBeVisible({ timeout: 3_000 });
  191 |     await page.locator('#player-availability button', { hasText: 'Injury' }).click();
  192 |     // Injury badge should now appear
  193 |     await expect(page.locator('#player-availability').getByText('⚠ Injury')).toBeVisible({ timeout: 5_000 });
  194 |   });
  195 | 
  196 |   // T05: Refresh persistence — re-render the section and verify responses persist
  197 |   await step(page, 't05-responses-persist-after-rerender', async () => {
  198 |     // Re-navigate to trigger a full section render
  199 |     await page.evaluate(() => setSection('player', 'week'));
  200 |     await page.waitForTimeout(300);
  201 |     await navigateToPlayerAvailability(page);
  202 |     // The Injury badge should still be visible after re-render
  203 |     await expect(page.locator('#player-availability').getByText('⚠ Injury')).toBeVisible({ timeout: 5_000 });
  204 |   });
  205 | 
  206 |   saveResult('passed');
  207 | });
  208 | 
  209 | // ── T06–T09: Coach dashboard + Remind button ────────────────────────────────
  210 | test('T06-T09 — Coach sees responses + injury badge + Remind non-responders', async ({ page }) => {
  211 |   await installToastCapture(page);
  212 |   page.on('console', m => { if (m.type() === 'error') run.pageErrors.push(m.text()); });
  213 | 
  214 |   await step(page, 't06-open-app-as-coach', async () => {
  215 |     await openApp(page);
  216 |     await coachLogin(page);
  217 |   });
  218 | 
  219 |   // First seed some demo data so the coach dashboard is non-empty.
  220 |   // The player-simon-test responses were saved in T02-T05 via the API.
  221 |   // Refresh the coach dashboard to pull them from Redis.
  222 |   await step(page, 't06-coach-refresh-availability', async () => {
  223 |     await navigateToAvailability(page);
  224 |     // Click the specific Refresh replies button (by id to avoid ambiguity)
  225 |     const refreshBtn = page.locator('#avail-refresh-btn').first();
  226 |     if (await refreshBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
  227 |       await refreshBtn.click();
  228 |       await page.waitForTimeout(1_500); // wait for fetch
  229 |     }
  230 |   });
  231 | 
  232 |   // T06: Dashboard shows correct column structure
  233 |   await step(page, 't06-dashboard-columns-present', async () => {
  234 |     await expect(page.locator('.msg-status-column.available header')).toBeVisible({ timeout: 5_000 });
  235 |     await expect(page.locator('.msg-status-column.unavailable header')).toBeVisible({ timeout: 5_000 });
  236 |   });
  237 | 
  238 |   // T07: Injury badge visible in the unavailable column header (if any injury in this session)
  239 |   // Note: the badge only appears if there's at least one injury-reasoned player — this may be empty
  240 |   // if simon-test chose 'game' (not visible in this session's default view). We test the CSS path exists.
  241 |   await step(page, 't07-injury-badge-css-present', async () => {
  242 |     const unavailHeader = page.locator('.msg-status-column.unavailable header');
```