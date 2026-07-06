# Coach's Eye Core Beta RC2

## Date / time
2026-07-06 (promoted to production ~11:25 UTC / 13:25 CEST)

## Production
- **Production URL:** https://boitsfort-coachseye.vercel.app
- **Production deployment ID:** `dpl_9KApTC7vAgQE5ew8ikbHdjy5iUXs` (`target: production`, direct URL: `boitsfort-coachseye-2866smjlq-simonbdodd-9233s-projects.vercel.app`)
- **Production code commit:** **`a1df1a8b`** (`feature/core-beta-simplification`) — verified live: `_BUILD_INFO.sha = "a1df1a8"`, `env = "production"`.

### Build-label note
Unlike RC1, the production build label **matches the committed head** — RC2 was built from a **clean commit** (`git status` clean at `a1df1a8b`), so `_BUILD_INFO.sha` reads `a1df1a8`. No working-tree/label discrepancy. (Previous production: `ae7d2ed0`.)

## Summary
RC2 is a Beta feature + hardening release — **8 commits** on `feature/core-beta-simplification` ahead of the prior production `ae7d2ed0` (6 functional + 2 release-notes docs). It introduces backend-persisted per-coach Match Centre drafts, makes coach drafts private end-to-end, adds a reusable coach/staff invite link that upgrades existing members to staff, and finishes mobile polish (build badge no longer overlaps the Messages composer).

## Features included
- **Match Centre — private coach drafts (Phase 1 of Coach Draft Compare).** Each coach's match-day selection is now persisted to the backend, scoped per **team + coach** (`publish:{teamId}:draft:{userId}`). A coach's edits save to their **own** draft only; another coach can never overwrite it by editing. Drafts survive refresh / a new device. The official published squad remains the single source of truth for players and is written **only** on explicit Publish.
- **Match Centre — draft privacy.** Coaches no longer auto-adopt the shared published squad into their editable sheet, and editing after publish no longer auto-overwrites the official squad. Publishing stays explicit and unchanged.
- **Coach/staff invites — reusable group link.** One permanent, reusable link per role (Coach / Admin / Medical), gated by `MANAGE_COACHES`; the player group link is unchanged. Claiming the link **upgrades an existing member** (e.g. a current player) to staff and removes any stale roster profile, so staff never linger in player-only lists.
- **Mobile polish.** The build/version diagnostic pill is hidden on mobile so it never overlaps the Messages composer / send button (the top-of-screen stale-domain warning is preserved). Additional safe-area / touch-target improvements.

## Backend changes
- **New Redis key:** `publish:{teamId}:draft:{userId}` — per-coach private draft. Separate from the official `publish:{teamId}:squad`.
- **New `/api/publish` endpoints (coach/admin only, `PUBLISH_SQUADS`):**
  - `GET ?type=draft` → returns **only the caller's own** draft.
  - `POST { type:'draft', data }` → saves the caller's draft; **owner is taken from the session, never the request body**, so a coach can only ever write their own key.
  - Official `type:'squad'` publish/unpublish, `type:'sessions'`, roster and club endpoints are unchanged; `?type=all` never returns drafts (players never receive them).
- **Invites** (`api/invite.js`, `api/_identityStore.js`): role-aware reusable group invites; claim forces the staff role for staff invites and drops stale roster profiles.

## Manual tests completed
Verified by the product owner before promotion, and by end-to-end API tests on the clean-commit preview:
- **Coach Draft Compare Phase 1 (approved deployment preview):** all manual tests passed.
- Two coaches in one team (B joined via a coach invite): each saved a different draft and read back only their own; neither overwrote the other; the official squad was `null` until Publish; after Coach A published, Coach B's draft was unchanged and Coach A's draft stayed distinct from the official squad.
- Draft endpoints reject unauthenticated requests (401) in preview and production.
- Availability, Messages, Training and Members unaffected.

## Promotion details
- **Method:** `vercel promote` of the **explicitly approved** clean-commit preview — no rebuild of different code, not deployed from another commit.
- **Approved & promoted from (preview):** `dpl_8w8H8JQK3TEMp4oV4iquErWb7X3W` (built from `a1df1a8b`, `_BUILD_INFO.sha = a1df1a8`).
- **Production deployment:** `dpl_9KApTC7vAgQE5ew8ikbHdjy5iUXs` — `target: production`, aliased to `boitsfort-coachseye.vercel.app`.
- **Branch:** `feature/core-beta-simplification` unchanged. **`main` untouched** (`0ffcf50c`). No application code changed during promotion.

## Commits included (`2279a9c9..a1df1a8b`)
- `a1df1a8b` feat(match-centre): persist private coach drafts
- `fc8bf881` fix(mobile): hide build badge over message composer
- `c20bda7a` fix(match-centre): keep coach squad drafts private
- `cf7d008d` feat(invite): reusable coach/staff group link; upgrade existing members to staff
- `84cf2526` fix(invite): reusable coach link upgrades members to staff
- `ae7d2ed0` style(mobile): improve safe-area support and touch targets *(already live before RC2)*
- `fe2e6c03`, `c3366432` docs: RC1 release notes

## Known RC3 backlog
- **Coach Draft Compare — read-only compare UI** is not built yet (Phase 1 is storage only). No tabs / side-by-side view for other coaches' drafts.
- **No `DELETE draft` endpoint** — clearing a sheet saves an empty draft record instead (functionally equivalent).
- **`fphotoIds` (slot photos) and `subPlan` are not persisted server-side** — same as the existing published-squad behaviour; photos stay device-local.
- **Shared-device / concurrent-device drafts:** load hydrates only an empty local sheet; simultaneous edits of the same draft on two devices are last-write-wins per device.
- Carries over the RC1 backlog (per-team group channels, unread alias-blindness, DM push club-scoping, concurrent-send rebuild window, `isStaffSession` excludes medical, dead-code `sendInAppMessage`, read-only Members staff section, date-brittle Travel test).
