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
