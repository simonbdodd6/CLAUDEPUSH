# Coach's Eye — Core Beta Release RC3

**Release candidate:** RC3 — **SHIPPED TO PRODUCTION**
**Commit:** `9011fcd5` — *fix(messages): scope staff DMs, correct DM labels, live in-app refresh*
**Branch:** `feature/core-beta-simplification`
**Source preview deployment:** `dpl_3KDKYFqw25Lu3FmAuAGbo1crBBCD`
**Production deployment:** `dpl_4v5qPbzStwSRHKN6ot2i3ggAqw1V`
**Production URL:** https://boitsfort-coachseye.vercel.app
**Build sha:** `9011fcd` · env `production` · promoted 2026-07-09
**Baseline:** RC2 (`14871486 docs: add RC2 production release notes`)

> ✅ **Promoted to production** on 2026-07-09 from the RC3 preview (`dpl_3KDKYFqw25Lu3FmAuAGbo1crBBCD` → `dpl_4v5qPbzStwSRHKN6ot2i3ggAqw1V`). Production serves build sha `9011fcd` (env `production`). `main` is untouched.

---

## What's new since RC2

RC3 is a stabilization release focused on **messaging correctness**, a **security hotfix**, and **mobile polish**, plus the **Match Centre draft compare** viewer. Seven commits (`14871486..9011fcd5`):

| Commit | Area | Summary |
|--------|------|---------|
| `9011fcd5` | Messaging | Staff-DM privacy, DM label resolution, live in-app refresh, userId identity |
| `04a7cdee` | Security | Protect invite claims for existing accounts |
| `2d7938dd` | Mobile | Refine mobile navigation buttons |
| `34cbb715` | Messaging/Mobile | Improve mobile message-list navigation |
| `1085b446` | Members/Mobile | Compact mobile Members list + accurate player search |
| `8b58b0fb` | Mobile | Improve mobile touch feedback |
| `f5610841` | Match Centre | Coach draft compare viewer |

---

## Security fixes

- **Invite-claim account protection** (`04a7cdee`) — closed a live account-takeover path where a `claim_invite` could overwrite an existing account's password by email match. Claims against an email that already owns an account are now rejected/guarded, so an invite link can no longer hijack an established login. Verified end-to-end.

---

## Messaging fixes (`9011fcd5`)

The Messages system was rebuilt around one rule: **one authenticated `userId` = one messaging identity = one DM thread = one unread count.**

- **Identity normalization (Option A).** Messaging identity is now the authenticated `user.id` only — no name-based aliases, no `legacyPlayerId`, no email-based expansion. `actorIdsForSession` is userId-only, ending the cross-account bleed that produced the phantom **"9+"** unread badge.
- **Staff-DM privacy (server-side, `api/chat.js`).** Coaches keep full access to group/team/system channels (Squad, Coaching, Announcements), but a **direct message is returned / readable / unread-counted only for its participants**. A coach no longer receives another coach's — or a player-to-player — DM, and their unread no longer inflates from other people's threads. (Also closes an incidental privacy leak.)
- **DM thread label.** A DM row/header now **always shows the other participant**, resolved from identity — never the creator-stored `conversation.name`. Fixes the case where an account saw *itself* as the thread title.
- **Live in-app refresh.**
  - The reliable 5s poll now also refreshes the **open thread**, so a received DM appears in place without clicking it.
  - The Messages **list** now prefers the fresher of the local vs server last-message, so a DM arriving **while another thread is selected** updates that row's preview, time, unread dot, and top-sort — no click required.
- **Mobile message-list navigation** (`34cbb715`) — smoother list/thread navigation on phones.

**Test coverage added/updated:** userId-only identity, no email/legacy alias expansion, no self-DM, coach↔coach DM, coach↔player DM (only when the player is linked), staff-DM privacy, DM label resolution, open-thread live refresh, and list-row live refresh.

---

## Mobile improvements

- **Navigation buttons refined** (`2d7938dd`) for clarity and tap accuracy.
- **Touch feedback improved** (`8b58b0fb`) — clearer active/pressed states.
- **Message-list navigation** (`34cbb715`) and **compact Members list** (`1085b446`) tuned for small screens.

---

## Match Centre — draft compare

- **Coach draft compare viewer** (`f5610841`) — coaches can compare private squad drafts side by side within Match Centre. Builds on RC2's private-coach-draft persistence; drafts remain private to the coach until published.

---

## Members improvements

- **Compact mobile Members list + accurate player search** (`1085b446`) — denser, more legible Members layout on phones, with search that matches on name, position, and real email (auto-generated placeholder emails excluded).

---

## Known remaining issues

- **No known user-facing messaging defects.** All RC3 messaging scenarios (no phantom 9+, correct thread label, live refresh for open thread and non-selected rows, coach↔coach and coach↔player delivery) passed manual device testing on the RC3 preview.
- **Intentional Beta behaviour:** legacy DMs keyed under old alias ids (pre–Option A) may no longer appear in a user's list. This is the accepted "clean reset" for Beta — new DMs use canonical `dm:{userIdA}:{userIdB}` threads.
- **Non-blocking test-suite items (not product bugs):**
  - `travel-traveller-digital-twin-platform` "composes a full deterministic traveller twin" — date-brittle fixture (asserts against a hard-coded date); fails purely on today's date, unrelated to shipped features.
  - `chat-api-unread` "increments on coach DM and survives refresh" — order-dependent flaky in a full-suite run; passes in isolation.
  - These do not affect runtime behaviour and are safe to address separately.

---

## Verification

- **Full test suite:** 1818 / 1819 passing on `9011fcd5` (the single failure is the date-brittle Travel test above). Serverless function count = 12 (within limit).
- **Build:** clean preview build from exact HEAD `9011fcd5` (`_BUILD_INFO.sha = 9011fcd`).
- **Working tree:** clean; no Brain/Core-Memory files in the release (verified — messaging-only commit).

---

## Promotion checklist

- [x] Final stakeholder sign-off on preview `dpl_3KDKYFqw25Lu3FmAuAGbo1crBBCD`
- [x] Promote to production — `dpl_4v5qPbzStwSRHKN6ot2i3ggAqw1V` (https://boitsfort-coachseye.vercel.app)
- [x] Production build sha verified = `9011fcd` (env `production`)
- [x] Commit `RELEASE_RC3.md`
- [ ] Tag the release
- [ ] (Optional) Merge `feature/core-beta-simplification` into `main`

### Production smoke test (2026-07-09, post-promote)

| Check | Result |
|-------|--------|
| App shell / login screen | 200 — login UI renders |
| Public config (`/api/config`) | 200 |
| Session gate (`/api/identity?action=session`, no cookie) | 401 (correct) |
| Messages (`/api/chat?action=conversations`, no auth) | 401 (auth gate live) |
| Members (`/api/identity`, no staff auth) | 401 (staff gate live) |
| Availability (`/api/availability`) | 401 (correct) |
| Match Centre (`/api/publish?resource=roster`) | 401 (correct) |
| Service worker / manifest (PWA) | 200 / 200 |

Interactive login → Messages / Members / Match Centre / Availability flows were validated on the byte-identical RC3 preview build (`9011fcd`) prior to promotion.

**Status: RC3 live in production. `main` untouched.**
