# notis-apps

The public registry of Notis apps. Each app lives under `apps/<slug>/`. Opening a pull request here and getting it approved by `@notis/store-reviewers` is how an app ships to the Notis App Store.

This repo works the same way Raycast's `raycast/extensions` repo does: merge to `main` triggers CI to build the bundle, upload it to Notis storage, and sign a webhook that tells the Notis server to publish the new version. All existing installs of the app are then automatically updated.

## Repo layout

```
notis-apps/
  apps/
    <app-slug>/           # one folder per app, fully self-contained
      package.json        # must declare "notisAppVersion": "x.y.z" (semver)
      package-lock.json   # each app owns its dependency tree
      packages/sdk/       # vendored @notis/sdk until it publishes to npm
      notis.config.ts     # app manifest
      notis-listing.json  # Store listing (3-6 screenshots, each with alt text)
      src/
      README.md
  scripts/                # CI helpers (TypeScript, run via tsx)
  .github/
    CODEOWNERS
    workflows/
      pr-validate.yml     # runs on PRs: typecheck, manifest validation, build, size cap
      merge-publish.yml   # runs on merge to main: builds, uploads bundle, fires webhook
```

Apps are **independent packages**, not npm workspaces. Each one has its own
lockfile and its own vendored copy of `@notis/sdk`, so a change to one app can
never break the install of another. The root `package.json` exists only to
provide `tsx` for `scripts/`.

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

Install the repo tooling once, then work inside the app you are changing.

```bash
npm ci                            # repo root: tsx for scripts/

cd apps/<slug>
npm ci
npm run typecheck
npm run build

cd ../..
npm run validate -- apps/<slug>    # manifest + Store listing checks
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

- `@notis/sdk` is vendored per app in `apps/<slug>/packages/sdk/` until it is published to npm. The canonical source is `packages/sdk/` in the Notis monorepo.
- A failure in `merge-publish.yml` is currently silent. Add a `if: failure()` notification step.
