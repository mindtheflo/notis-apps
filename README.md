# notis-apps

The public registry of Notis apps. Each app lives under `apps/<slug>/`. Opening a pull request here and getting it approved by `@notis/store-reviewers` is how an app ships to the Notis App Store.

This repo works the same way Raycast's `raycast/extensions` repo does: merge to `main` triggers CI to build the bundle, upload it to Notis storage, and sign a webhook that tells the Notis server to publish the new version. All existing installs of the app are then automatically updated.

## Repo layout

```
notis-apps/
  apps/
    <app-slug>/           # one folder per app
      package.json        # must declare "notisAppVersion": "x.y.z" (semver)
      notis.config.ts     # app manifest
      src/
      README.md
  packages/
    notis-sdk/            # vendored @notis/sdk until it publishes to npm
  scripts/                # CI helpers (TypeScript, run via tsx)
  .github/
    CODEOWNERS
    workflows/
      pr-validate.yml     # runs on PRs: typecheck, manifest validation, build, size cap
      merge-publish.yml   # runs on merge to main: builds, uploads bundle, fires webhook
```

## Submitting an app

1. Fork this repo.
2. Copy one of the existing apps under `apps/` as a starting point.
3. Edit `apps/<your-slug>/notis.config.ts` and `src/`.
4. Bump `"notisAppVersion"` in `apps/<your-slug>/package.json` following semver:
   - **patch** (x.y.Z) — bug fix, no manifest change
   - **minor** (x.Y.z) — new optional property, new route, new database (additive, non-breaking)
   - **major** (X.y.z) — removed/renamed properties, removed databases, changed property types
5. Open a PR. CI will validate. A reviewer from `@notis/store-reviewers` will review and merge.
6. On merge, the app auto-publishes and existing installs auto-update within seconds.

## Local development

```bash
npm install
npm run typecheck:all
npm run build:all
npm run validate -- apps/<slug>
```

## Secrets

The merge-publish workflow requires two secrets and two repo variables:

| Name | Kind | Purpose |
|---|---|---|
| `NOTIS_REGISTRY_WEBHOOK_SECRET` | secret | HMAC secret shared with the Notis server |
| `SUPABASE_STORAGE_SERVICE_KEY`  | secret | Service-role key for uploading bundles |
| `NOTIS_REGISTRY_WEBHOOK_URL`    | variable | e.g. `https://api.notis.ai/api/registry/publish` |
| `SUPABASE_STORAGE_URL`          | variable | e.g. `https://xxx.supabase.co` |

Generate the HMAC secret and register it:

```bash
openssl rand -base64 48 > .hmac-secret.txt
gh secret set NOTIS_REGISTRY_WEBHOOK_SECRET < .hmac-secret.txt
rm .hmac-secret.txt
```

(Or use the automated script in `scripts/setup-secrets.sh`.)

## Still pending

- `@notis/sdk` is vendored in `packages/notis-sdk/` until it is published to npm.
- `POST /api/registry/publish` endpoint on the Notis server must exist before `merge-publish.yml` has somewhere to POST to. Until then the workflow runs in dry-run mode (if `NOTIS_REGISTRY_WEBHOOK_URL` is unset).
