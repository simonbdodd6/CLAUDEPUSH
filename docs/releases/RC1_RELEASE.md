# Coach's Eye Core Beta — RC1

## Release date
2026-07-04

## Production commit
- **Code serving production:** commit **`2279a9c9`** (`feature/core-beta-simplification`) — verified live on the production alias (Members "Coaches & staff" section, coach‑to‑coach messaging, and Request Availability all present; identical to the committed `2279a9c9` tree).
- **Build stamp:** `_BUILD_INFO.sha = ef0fd61`, `env = production`. The stamp reads `ef0fd61` rather than `2279a9c9` because production was promoted from the **already‑tested** deployment, which was built when `HEAD = ef0fd617` with the approved "Coaches & staff" change still in the working tree. That change was then committed unchanged as `2279a9c9`, so the served bytes equal `2279a9c9` while the build tag is `ef0fd617` (`gitDirty`).
- **Previous production:** `4fb123e` (Availability request action only).

## Summary
RC1 is a Beta polish and messaging/invite hardening release: 11 commits on `feature/core-beta-simplification` ahead of the prior production `4fb123e`. It restores the core availability workflow, simplifies the primary coach screens for a premium Beta, fixes the messaging backend integrity issues, and makes coach/staff invites and coach‑to‑coach messaging work end‑to‑end without polluting player‑only lists.

## Features delivered
- **Availability** — restored a visible **Request Availability** action (session‑scoped, with confirmation and "date to be confirmed" fallbacks) and added a premium **player‑details popup** on the availability board.
- **Members** — simplified the roster table (3 per‑session columns merged into one compact "Availability" summary, design‑token colours, larger touch targets) and added a read‑only **"Coaches & staff"** section sourced from user identity (never the player roster).
- **Training** — Beta simplification to **Planner + History**; advanced tools (coach‑sheet auto‑send, video libraries, analytics) hidden behind the Beta flag; empty‑state and touch‑target fixes.
- **Match Centre** — bigger, more‑dominant pitch; selected players read instantly vs empty slots; premium empty state when no squad is picked.
- **Messages** — safe frontend polish (composer anti‑autofill, picker autofocus, sidebar search by name/position/email, clean empty states, honest send‑failure feedback, team‑switch cleanup) and **coach‑to‑coach DM visibility** (staff surfaced from identity data with role labels).
- **Coach/staff invites** — invited coaches now create **real server accounts** via the same `claim_invite` flow as players.
- **Notifications & mobile** — per‑type notification deep‑link routing and dark‑theme/mobile fixes (delivered earlier in the branch).

## Bugs fixed
- **Squad chat "Not authorized"** for any club other than the default — built‑in `squad`/`coaching`/`announce` conversations are now team‑agnostic; DMs and custom groups remain club‑scoped.
- **Coach invite created only a local (browser‑only) account** — now a real server account + session, invite consumed, cross‑device login works; staff are never injected into `state.players`.
- **Backend message‑order corruption** on edit/react/delete (`rebuildConvMsgs` inverted order) and **non‑atomic rebuild** (DEL‑then‑repush data‑loss window) — fixed with correct ordering and a temp‑key + atomic RENAME swap.
- **Players could post into a group they could not read** — write access is now no broader than read (participant‑gated) for non‑squad groups.
- **DM conversation‑id spoofing** — a player‑created DM id must embed the creator.
- **Messages UI** — composer password/email autofill, new‑message picker not focusing, sidebar blank on no‑match, raw `dm:` ids shown as titles, false "sent" on network failure, and cross‑club message bleed on team switch.
- **Availability request had no reachable button** (restored; shipped in the prior production build).
- **Staff leaking into player lists** — coaches now live in `state.users` only; Members shows them in a dedicated section; Match Centre selection continues to exclude staff.

## Manual testing completed
Verified by the product owner on preview builds before promotion:
- Availability request: button visible, confirm dialog, cancel sends nothing, send delivers.
- Coach↔player DM round‑trip; squad chat send/receive; message order preserved after delete.
- Coach invite: real account created, log in again on another browser/device, lands in coach view, not selectable in Match Centre, not shown as a player in Availability.
- Coach‑to‑coach messaging (invited coach can find and DM the head coach).
- Members "Coaches & staff" section shows invited coaches with role badges; player table unchanged.
- Mobile / real‑device testing of the messaging and availability flows.

## Known RC2 backlog
- **Player delete on phone** — players cannot delete their own messages on mobile (known limitation, not a blocker).
- **Per‑team group channels** — `squad`/`coaching`/`announce` are currently a single shared store; fine for the single‑club Beta, but a multi‑club rollout needs team‑namespaced channels (redesign).
- **Unread‑count alias‑blindness** — unread math keys on a single id and can inflate badges for a user's aliased own messages (backend).
- **DM push club‑scoping** — DM pushes are 1:1‑targeted; a club‑membership intersection is deferred (low risk).
- **Concurrent send during a conversation rebuild** — a narrow window remains; a lock/Lua script would fully close it.
- **`isStaffSession` excludes `medical`** on the backend — medical DMs work via the participant check, but medical staff get no blanket bypass.
- **Dead‑code `sendInAppMessage`** — an unreachable path that would broadcast a private DM to the squad; should be deleted.
- **Members staff section is read‑only** — no staff management from Beta Members (Club Admin is hidden in Beta).
- **Test hygiene** — flaky `chat-unread` test and a date‑brittle Travel‑module test; chat `console.log` diagnostics are noise (not errors).

## Promotion details
- **Method:** `vercel promote` of the tested deployment — **no rebuild of different code, not deployed from another commit**.
- **Promoted from (tested):** `dpl_8vzv4TcBTZVjs2yEtaqWpzU8XUKT` (the approved "Coaches & staff" preview; content = `2279a9c9`).
- **Production deployment:** `dpl_DzT5w4jYrPTBnF92d9pM9ztDPxTh` — `target: production`, `meta.action: promote`.
- **Production URL:** https://boitsfort-coachseye.vercel.app
- **Git ref of the promoted build:** `ef0fd617` (`gitDirty`) — content equals committed `2279a9c9`.
- **Branch:** `feature/core-beta-simplification` unchanged (HEAD `2279a9c9`). **`main` untouched** (`625835e6`). No application code changed during promotion.
