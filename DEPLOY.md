# Deploying Coach's Eye to Production

**Status (2026-06-11): GitHub auto-deploy is BROKEN.** Pushing to `main` does
NOT deploy. Every release is manual.

**Prerequisite:** the Vercel CLI must be installed and logged in as
`simonbdodd-9233` (`vercel whoami`). Without it nothing here works.

## What production actually is

Production is **not** the feature branch. It is a `core-deploy-NN` branch:
the previous `core-deploy-NN` plus the feature commits that are cleared to
ship, **minus the production-only exclusions**. Each release increments NN.

The exclusions, their reasons and every protection rule live in
**`config/production-exclusions.json`** — deliberately data, so you can read
and challenge them without opening a script. In one sentence:

> **Production = feature branch − the excluded commits.**

It is *not* a list of files to strip by hand; the file differences people used
to copy manually are simply what those commits happened to touch.

Currently excluded:

| Exclusion | Commit | Why |
|---|---|---|
| Tactics Board | `292916b7` *feat: mount the Tactics Board as a coach section* | Separate product, own repository and release cycle. Its absence is what makes `/tactics/tactics-board.mjs` return 404. |
| Club export | `e3762b6c` *feat: add scoped club export for AI CEO* | For a future AI CEO integration that is not live; adds an endpoint to a production API for no current benefit. |

**Performance / S&C:** `performance/` is legacy shell code from the removed
integration — the real product lives in its own repository. A release must
never move it: the gate blocks any deploy where `performance/` differs from
the previous production branch.

## The release workflow

```bash
npm run deploy:prepare     # 1. build the next core-deploy-NN branch
#                            inspect the printed include/exclude list and diff
npm run deploy:check       # 2. run the full gate (takes a few minutes)
#                            review the output
npm run deploy:release     # 3. deploy, re-point the legacy alias, verify
```

Each step is separate and human-initiated. **No script deploys on its own.**

### 1. `npm run deploy:prepare`

Verifies a clean tree, confirms the newest `core-deploy-NN` is what
`https://www.coacheasier.com/api/config` is actually serving, then creates the
next branch and cherry-picks every feature commit not yet in production,
skipping the configured exclusions. It prints exactly what was included and
excluded.

It **fails closed**: if an exclusion no longer matches the repository, if a
commit's subject matches an exclusion but its patch differs (an adapted
cherry-pick of work that must never ship), or if a cherry-pick conflicts, it
stops and restores the repository rather than guessing. Use `--dry-run` to see
the plan without creating anything.

### 2. `npm run deploy:check`

The gate. Runnable standalone against any branch
(`npm run deploy:check -- core-deploy-83`). It verifies the excluded commits
are absent, the Tactics and club-export protections hold, `performance/` has
not moved, the API function count is within the Vercel cap of 12,
`api/mission-control.js` is unchanged, there are no hardcoded secrets, the
Core/Intelligence boundary holds, and `git diff --check` is clean.

**Baseline-relative test gating.** The suite is not zero-failure on
production, and pretending otherwise would make the gate meaningless. The gate
runs the full suite on the previous production branch — in a throwaway
`git worktree`, so your checkout is untouched — and again on the candidate,
then blocks only on failures *this release introduces*. Pre-existing failures
are reported separately, never hidden.

Two failures are known and accepted (both documented in the config): the
traveller-twin fixture's unpinned clock, and a `BETA_NAV_IDS` assertion in
`test/pre-v2-messaging-removed.test.js` that expects `"tactics"` — the tactics
commit never touched that file, so excluding it leaves an assertion that
contradicts production by construction. Fixing that one would make "green
suite" a meaningful signal again.

> Never delete or weaken a test to pass this gate. If a new failure appears,
> fix the cause or abandon the release.

`--skip-tests` runs structural checks only and exits 2 — useful while
iterating, never sufficient for a release.

### 3. `npm run deploy:release`

Runs the gate again and refuses to continue if it fails. Then
`vercel deploy --prod --yes`, re-points the legacy alias, and verifies with
read-only requests that all three hostnames report the new version, the
homepage is 200, `devLogin` is false, and the Tactics asset is 404.

## Aliases

Three hostnames serve production:

| Host | Follows a deploy? |
|---|---|
| `www.coacheasier.com` | yes |
| `boitsfort-coachseye.vercel.app` | yes (aliased by the deploy) |
| `boitsfort-coachseye-gpt.vercel.app` | **no — manual re-point required** |

The legacy domain was alias-pinned by hand in May 2026 and was found serving a
stale build during the `1718a90` release. `deploy:release` now re-points and
verifies it every time; if you ever deploy by hand, do it yourself:

```bash
vercel alias set <new-deployment-url> boitsfort-coachseye-gpt.vercel.app
```

…or retire that domain so there is only one production hostname.

## Emergency / manual fallback

If the scripts are unavailable or broken, the underlying process is still just:

```bash
git checkout -b core-deploy-NN core-deploy-<NN-1>   # branch from production
git cherry-pick <commits>                           # NEVER the excluded ones
npm test                                            # compare to the previous branch
vercel deploy --prod --yes
vercel alias set <new-deployment-url> boitsfort-coachseye-gpt.vercel.app
```

Before doing that, read `config/production-exclusions.json` and check by hand
that no `tactics/` files, no `!/tactics` line in `.vercelignore`, no Tactics
mount in `index.html`, and no `api/_clubExport*.js` files are present. To roll
back instead, see **Rollback procedure** below.

## Post-deploy smoke check (~30 seconds)

```bash
BASE=https://boitsfort-coachseye.vercel.app
curl -s $BASE/api/config            # pushConfigured:true, devLogin:false
curl -s $BASE/api/invite            # {"ok":false,"error":"Authentication required"}
curl -s "$BASE/api/chat?action=conversations"   # same 401
```

If `devLogin` is ever `true` here, stop and remove the `DEV_LOGIN` env var:
`vercel env rm DEV_LOGIN production --yes && vercel deploy --prod --yes`

## Is production broken? (error monitoring)

The app reports unexpected failures to itself. Nothing is emailed or alerted —
you have to look — but looking takes ten seconds.

**In the app:** Settings → Advanced (diagnostics) → **Recent errors** →
*Check for errors*. "No errors recorded" is the healthy answer. Each entry
shows what failed, when, and **which deployment it happened on** — that last
column is what tells you whether a release caused it.

**From a terminal** (needs a coach session cookie; the read is permission-gated):

```bash
BASE=https://www.coacheasier.com
curl -s "$BASE/api/config"              # version, devLogin, storage/push/email flags
curl -s "$BASE/api/config?health=1"     # live Redis probe: storageHealth.code == "ok"
curl -s "$BASE/api/config?errors=1&limit=25" -b "ce_session=<token>"
```

What gets recorded: uncaught errors, unhandled promise rejections, and 5xx or
network failures from our own API. What does **not**: 401/403/404/410/400/409/
422/429 — those are the app correctly refusing something, and recording them
would bury a real incident in noise. Reports never contain query strings or
fragments, so an invitation token cannot appear here (see H1, `f8859e47`).

Storage is bounded: the newest 200 entries, trimmed on every write.

## Rollback procedure

Use this when a deploy has broken production. It takes about two minutes.

**1. Identify what is live now.**

```bash
curl -s https://www.coacheasier.com/api/config | grep -o '"version":"[^"]*"'
vercel ls --prod          # newest first; the top row is live
```

**2. Identify the last known-good deployment.** The row below the current one
is usually it. Cross-check its commit:

```bash
vercel inspect <deployment-url>      # shows the commit SHA it was built from
git log --oneline -10                # confirm that SHA is the release you want
```

**3. Roll back.** This re-points production at an existing, already-built
deployment. It does not rebuild anything, so it is fast and cannot fail on a
compile error:

```bash
vercel rollback <last-good-deployment-url> --yes
vercel rollback status               # wait for it to report complete
```

**4. Verify the rollback.**

```bash
BASE=https://www.coacheasier.com
curl -s -o /dev/null -w '%{http_code}\n' $BASE/           # expect 200
curl -s $BASE/api/config                                   # expect:
#   version         == the last-good short SHA (NOT the broken one)
#   devLogin        == false
#   storageConfigured, pushConfigured, emailConfigured == true
curl -s "$BASE/api/config?health=1"                        # storageHealth.code == "ok"
curl -s $BASE/api/invite                                   # expect 401 (auth still enforced)
```

If `version` still shows the broken SHA, the rollback has not propagated —
re-run `vercel rollback status` before doing anything else.

**5. Record the incident.** In `KNOWN_ISSUES.md`, one short entry: when it
started, what the symptom was, the broken SHA, the SHA rolled back to, and what
the error log showed. This is what stops the same fault shipping twice.

**6. Return to a fixed deployment.** Rolling back does not revert the code —
`main`/the release branch still contains the bad commit. Fix it forward:

```bash
git checkout -b fix/<short-name>     # never commit a fix straight onto a release branch
# ...fix, add a regression test that fails without the fix...
npm test                             # full suite green except the known failure
vercel deploy --prod --yes           # deploys the corrected commit
curl -s https://www.coacheasier.com/api/config   # version == the fix commit
```

**Do not** roll back by reverting commits and redeploying while production is
broken — that rebuilds, takes longer, and can fail. Re-point first with
`vercel rollback`, then fix at your own pace.

## Hard constraints

- **Vercel Hobby plan allows at most 12 serverless functions** — that is, 12
  non-underscore `.js` files in `api/`. We are at exactly 12. **Adding any new
  file to `api/` makes every production deploy fail** with
  "No more than 12 Serverless Functions". Fold new server logic into an
  existing function and add a rewrite in `vercel.json` (see
  `/api/roster` → `/api/publish?resource=roster` and
  `/api/reminder` → `/api/cron?job=reminder` for the pattern).
- Production environment variables live in Vercel
  (`vercel env ls production`). `DEV_LOGIN` must never be set in production.

## Fixing auto-deploy (one-time, requires dashboard access)

`vercel git connect` fails from the CLI — the Vercel GitHub App has lost
access to `simonbdodd6/CLAUDEPUSH`. To fix:

1. github.com → Settings → Applications → Vercel → grant access to the
   `CLAUDEPUSH` repository.
2. vercel.com → `boitsfort-coachseye-gpt` project → Settings → Git →
   Connect `simonbdodd6/CLAUDEPUSH`, production branch `main`.
3. Push a trivial commit and confirm a deployment appears in the dashboard.

Auto-deploys stopped on 2026-06-06; deployments between then and 2026-06-11
never reached users until the manual deploy on 2026-06-11.
