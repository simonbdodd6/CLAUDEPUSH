# First Beta Club — Launch Checklist

Operational checklist for onboarding the first real club. Work top to bottom;
every box should be ticked before the club's coach gets the link.

## 1. Pre-deployment

- [ ] `feature/core-beta-simplification` merged to `main` (or deployed as preview)
- [ ] Full test suite green locally (`npm test`) — only the two known
      date/time-brittle failures allowed (travel twin, fixture countdown)
- [ ] `git diff --check` clean; build placeholder is `"time":"n/a"` in source

## 2. Email infrastructure (blocker until done)

- [ ] Resend: domain `coacheasier.com` verified (SPF + DKIM green in Resend dashboard)
- [ ] Vercel Production env vars set:
  - [ ] `RESEND_API_KEY` (sensitive)
  - [ ] `EMAIL_FROM` = `CoachEasier <noreply@coacheasier.com>`
  - [ ] `EMAIL_REPLY_TO` = `support@coacheasier.com`
  - [ ] `APP_URL` = `https://www.coacheasier.com`
- [ ] Same vars on Preview if the beta club will use a preview URL
- [ ] Redeploy after setting vars; `/api/config` shows `"emailConfigured": true`

## 3. Real email round-trips (use your own inboxes only)

- [ ] Password reset: request for your own account → email arrives (not spam),
      link opens the deployed app, reset completes, old password rejected
- [ ] Invite: create an invite to a second inbox you control → email arrives,
      link opens the claim screen, account created, player lands in the club
- [ ] Workspace support test: personal Gmail → `support@coacheasier.com`
      arrives; reply from the Workspace inbox arrives back in Gmail; sender
      name reads as CoachEasier support; neither leg lands in spam

## 4. Deployed product smoke (preview or production URL)

- [ ] Create a fresh club via "Start a new club" (use a disposable club name)
- [ ] Invite a player (link + QR); claim on a phone on mobile data (not your wifi)
- [ ] Player submits availability; coach board shows it within one refresh
- [ ] Coach sends a squad message; player receives it; unread badge clears on read
- [ ] Session survives closing and reopening the browser on both devices
- [ ] Mobile (390-width): no horizontal scroll on welcome, shell, settings
- [ ] PWA: "Add to Home Screen" installs with the CoachEasier icon and opens standalone
- [ ] Push: enable notifications on one device and confirm a test notification
- [ ] Settings → Support shows `support@coacheasier.com` (mailto opens)

## 5. Rollback criteria — pause the beta if any of these hit

- Login or invite claim fails for the club's coach or any player
- Transactional email stops arriving (check Resend dashboard first)
- Availability or messages visibly lost or shown to the wrong people
- Any error exposing tokens, another club's data, or internals to a user

Rollback = revert Vercel to the previous deployment (instant) and tell the
coach by email; no data migration is involved.

## 6. First-club feedback questions (send after ~1 week)

1. Did every player manage to join from the invite link on their own phone?
2. What was the first moment something felt confusing or broken?
3. Is the availability board accurate for your real training/match week?
4. Did messages replace your WhatsApp group for team admin, or run beside it?
5. What one thing would make you recommend this to another coach?
