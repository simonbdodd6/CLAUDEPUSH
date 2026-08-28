# Deploying Coach's Eye to Production

**Status (2026-06-11): GitHub auto-deploy is BROKEN.** Pushing to `main` does
NOT deploy. Every release must be deployed manually until the integration is
reconnected.

## Manual deploy (current required process)

```bash
# from the repo root, on main, with a clean tree and green tests
npm test                       # must be 216/216 (or current count) green
vercel deploy --prod --yes     # CLI must be logged in as simonbdodd-9233
```

The deploy output prints the new deployment URL and aliases
`https://boitsfort-coachseye.vercel.app` automatically.

The legacy domain `boitsfort-coachseye-gpt.vercel.app` does **not** follow
production automatically (it was manually alias-pinned in May). After each
deploy, re-point it:

```bash
vercel alias set <new-deployment-url> boitsfort-coachseye-gpt.vercel.app
```

…or retire that domain entirely so there is only one production hostname.

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
