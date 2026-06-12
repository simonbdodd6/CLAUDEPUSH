# Coach's Eye — Identity & Permissions Architecture

**Single source of truth: [`api/_permissions.js`](api/_permissions.js).** Route code never checks role names — only permissions, via `requireTenantPermission(req, PERM.X)` or `can(sessionContext, PERM.X)`.

## Architecture

```
                       ┌─────────────────────────────┐
                       │         ONE PERSON          │
                       │   users[] — one identity,   │
                       │   one email, one password   │
                       └──────────────┬──────────────┘
                                      │ 1‥n
                       ┌──────────────▼──────────────┐
                       │      TEAM MEMBERSHIPS       │
                       │ team_members[] — {teamId,   │
                       │  role, staffLevel, status}  │
                       └──────────────┬──────────────┘
                                      │ each membership
                       ┌──────────────▼──────────────┐
                       │     canonicalRole(member)   │
                       │ legacy coach+staffLevel and │
                       │ new roles → role catalogue  │
                       └──────────────┬──────────────┘
                                      │
                       ┌──────────────▼──────────────┐
                       │  ROLE_PERMISSIONS matrix    │──── permissionsFor(member) → Set
                       └──────────────┬──────────────┘
                                      │
        ┌──────────────┬──────────────┼───────────────┬─────────────┐
        ▼              ▼              ▼               ▼             ▼
  API routes      Session payload   Client UI      switch_team   AI Brain (future)
  requireTenant-  permissions[] +   canI(perm) —   re-scope to   MUST call can() —
  Permission()    memberships[]     nav/actions    any active    acts AS the
  every gate      on every session  gating         membership,   invoking identity,
                                                   no logout     never above it
```

A session is always scoped to exactly one team. Multi-team users hold several memberships; `switch_team` atomically replaces the session with one scoped to the target membership (old token revoked, no logout, no re-authentication).

## Permission matrix

| Permission | Owner | DoR | Admin | Head Coach | Assistant | Manager | Medical | S&C | Analyst | Player/Parent/Guest |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| create_clubs | ✓ | – | – | – | – | – | – | – | – | – |
| delete_clubs (danger wipe) | ✓ | ✓ | ✓ | ✓ | – | – | – | – | – | – |
| manage_subscriptions | ✓ | – | ✓ | – | – | – | – | – | – | – |
| manage_teams | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – | – | – | – |
| manage_coaches | ✓ | ✓ | ✓ | ✓ | – | – | – | – | – | – |
| manage_players | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – | – | – | – |
| publish_training | ✓ | ✓ | ✓ | ✓ | ✓ | – | – | ✓ | – | – |
| publish_squads | ✓ | ✓ | ✓ | ✓ | ✓ | – | – | – | – | – |
| medical_access | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | – | – | – |
| messaging | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – | – |
| financial_settings | ✓ | – | ✓ | – | – | – | – | – | – | – |
| reports | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| ai_intelligence | ✓ | ✓ | ✓ | ✓ | ✓ | – | – | – | ✓ | – |
| club_exports | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – | – | – | – |
| danger_zone | ✓ | ✓ | ✓ | ✓ | – | – | – | – | – | – |

Player abilities (own availability, own DMs, own profile) are **self-scoped in routes**, not club permissions. Anything not in the catalogue is denied; unknown roles canonicalise to `guest` (zero permissions); inactive memberships hold nothing.

### Endpoint → permission map
invite list/create/resend/revoke → `manage_players` (staff-role invites additionally `manage_coaches`) · identity list/approve/reject/remove/archive/restore/approve_details → `manage_players` (staff removal + set_staff_level → `manage_coaches`) · publish sessions → `publish_training` · publish squad → `publish_squads` · club config write → `manage_teams` · delete_club_data → `danger_zone` (inside `manage_teams`) · roster → `manage_players` · push/schedules/templates → `messaging` · availability board → `reports` · clear_week → `manage_players` · activity log → `reports`. `chat.js` retains its internal participant model by standing constraint (messaging logic frozen); its staff checks map 1:1 onto `messaging` when that freeze lifts.

## Migration notes

- **Zero data migration.** Legacy records map in code: `role:'coach'` + `staffLevel` → head_coach/assistant/manager; `admin`, `medical`, `player` map directly; new roles are just new `team_members.role` values, additive.
- **Behavior preservation, with two deliberate upgrades:** (1) `medical` members can now use messaging and reports endpoints (previously locked out of all coach APIs — the role was UI-only); (2) Team Managers (staffLevel `manager`) can no longer publish squads/training via API (previously any `coach` role could). Both match the intended matrix; flag to the club when assigning those roles.
- **Sessions:** existing session tokens keep working — permissions are computed at resolve time, not stored.
- **Client fallback:** `canI()` falls back to the legacy `isCoach()` check until the session payload loads (and when `features.permissionsV2 === false`), so offline/older clients behave exactly as before.
- **12-function constraint respected:** `_permissions.js` is an underscore module, not a serverless function.

## Rollout plan

1. **Now (shipped):** engine on, matrix legacy-equivalent for all existing accounts, multi-team switcher renders only for users with >1 membership (today: nobody in production — zero visible change).
2. **Beta +1 week:** assign Nick's assistant the `assistant` level via Club Admin — first real non-head staff account exercises the reduced permission set.
3. **When a second team per club appears:** create the membership server-side (Club Admin "add to team" UI is the next build); the switcher appears automatically.
4. **New roles (DoR, S&C, analyst, parent, guest):** accept in invite `VALID_ROLES` + Club Admin role picker once a club requests them — the engine, matrix and gates already handle them (tested).
5. **AI Intelligence integration:** every Intelligence endpoint authorizes with `can(ctx, PERM.AI_INTELLIGENCE)` *plus* the permission of the action it recommends (e.g. a squad suggestion requires the caller to hold `publish_squads`). The contract is pinned by test.
6. **Kill-switch:** client gating disables via `features.permissionsV2 = false`; server gates are equivalence-mapped so no server flag is needed for safety.
