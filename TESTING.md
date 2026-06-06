# coacheseyeGPT Real MVP Testing

## Scope

This pass completed and audited the coach/player browser push availability workflow without redesigning the UI or rewriting the app.

## Manual Test Flow

1. Open the deployed `index.html` application.
2. Confirm the header shows the demo coach account and a saved status.
3. In Coach View, open Message Center.
4. Send a Tuesday training availability request.
5. Switch to the Simon player account.
6. Open Player View > Availability.
7. Mark Tuesday training as Available.
8. Refresh the browser.
9. Confirm Simon still shows Available for Tuesday.
10. Switch back to Demo coach.
11. Open Message Center and confirm Simon appears as Available in the Tuesday register.
12. Confirm only one coach message exists for Simon's Tuesday availability response even after clicking the same answer again.
13. Open a second browser tab with the same file.
14. Change availability in one tab.
15. Confirm the other tab updates when the newer saved revision is detected.

## Automated Verification Commands

```bash
node - <<'NODE'
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
for (const [i, match] of [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].entries()) {
  new Function(match[1]);
  console.log(`script ${i + 1} syntax ok`);
}
NODE
```

```bash
curl -I http://localhost:8123/coach-eye-real-mvp.html
```

```bash
npm test
```

The automated tests cover message template variables, timezone scheduling, saved no-reply targeting, saved availability responses, and rejection of unregistered response devices. They use simulated Redis storage and do not consume live Upstash requests.

## Live Push Test

1. Configure Vercel settings from `PUSH_NOTIFICATIONS.md` and redeploy.
2. Open Player View on a phone, enable notifications, and leave the page installed/open as required by the browser.
3. In Coach View > Message Center, send an availability message.
4. Tap a response action on the phone notification.
5. Refresh the Message Center status list and confirm the answer is saved.

## Test Accounts

- Coach: configure `LEGACY_COACH_PASSWORD` for temporary legacy coach login; no shared coach PIN is stored in source.
- Simon player: `simon@coachseye.test`, PIN `2222`
- Alexis player: `alexis@coachseye.test`, PIN `3333`

## What Was Checked

- Browser refresh persistence.
- Local backup recovery path.
- Duplicate availability response prevention.
- Coach-only message sending and medical check-in actions.
- Player-only message replies.
- Multiple tab revision sync.
- Blank message protection.
- Message thread persistence.
