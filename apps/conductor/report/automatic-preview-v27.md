# Automatic workspace previews: current-source compatibility

The installed [Conductor app](https://beta.notis.ai/apps/2abc054d-8d9f-497a-844f-676e185d32a5) was read back and freshly pulled at release **27**, revision `2026-09-06T01:16:10.485794+00:00`, package version `0.3.2`. No app or backend was deployed.

## Tested compatible source update

From this registry checkout, run the guarded local reconciliation against a fresh pull of that exact installed app:

```bash
python3.12 apps/conductor/scripts/reconcile-preview-source.py /path/to/pulled-conductor --check
python3.12 apps/conductor/scripts/reconcile-preview-source.py /path/to/pulled-conductor
```

This applies nine preview-related files only: four changed existing files and five additions. It verifies the app ID, installed version/revision and every changed file's before/after SHA-256 before writing. Already-applied content is accepted; unexpected edits or a newer release abort before any write. A second check returned zero pending changes. The recipe does not deploy or change app version metadata.

**110 other existing source files remained byte-for-byte unchanged**, including the app UI, manifests, SDK, package files, instant-loading behavior, resource deep links, explicit dev status controls and archive helpers. The v27 idempotent `workspace.sh remove` implementation is preserved. The SDK refresh performed by CLI build/verify was restored; final validation used the original v27 SDK and `verify --skip-build`.

Do not deploy the older registry package wholesale over the installed app. Apply this narrow guarded update to the compatible current-source checkout. A later installed revision requires fresh reconciliation. The machine-readable preimage manifest is [automatic-preview-v27.json](automatic-preview-v27.json).

## Actual creation and completion entry points

1. `components/onboarding.tsx` hands Start a workspace to `useHandover` with `skill: 'new-workspace'`; `notis.config.ts` maps that key to `skills/new-workspace/`. This UI does not directly create a worktree.
2. The same skill receives direct chat requests and terminal handovers, and calls `workspace.sh new` (with ordinary/new-base/existing-branch options as appropriate).
3. `new` commits the workspace row, starts the tracked preparation job and reports structured progress. Setup and dev run in the existing job/preview infrastructure.
4. `workspace.sh complete` is the skill's mandatory final-response step: exit **2** means incomplete with no `user_response`; exit **1** returns an explicit failure without a preview URL; exit **0** returns the verified URL and ready response. A local HTTP response alone does not satisfy readiness.
5. `workspace.sh pr` decorates the exact body file before creation. `sync` maintains one section in the open PR description. `workspace.sh comment` upserts one author-owned `notis-review` comment; comments created before readiness receive the verified link at later sync.

## Validation

- Reconciled v27: **9 existing Node tests + 19 Python preview tests passed**. Includes existing archive/resource/dev-controls coverage and a real git/worktree, detached setup, complete-response and later-PR shell integration test with account/preview/GitHub boundaries stubbed.
- **3 reconciliation tests passed**: idempotence, preservation of unrelated files, and whole-plan refusal for local edits/newer versions.
- Reconciled v27 TypeScript check and Vite build passed. Node 22 used the already-installed tsx loader for the SDK's TypeScript sources.
- CLI browser verification against the frozen preserved-SDK bundle passed **2/2 routes**, Workspaces and Repositories, both mounted without errors. Artifact SHA-256: `ed290a2941d0ec9bc2b9c95c8cf6715b116449d1e92a47f09403901d6b9f099f`.
- Backend companion: **24 preview tests passed**, including canonical binding lookup for trimmed/stale CLI users, no waking on Stop, missing binding rejection, status versus heartbeat readiness, port collisions and no restart after process failure.
- Real CLI preparation/complete on the registry workspace produced an explicit missing-Setup-command failure with exit 1 and no preview URL. See [actual completion readback](automatic-preview-live-failure.json). The Notis repository separately has the expected `./setup.sh` and `./dev.sh --with-portal --no-crons` configuration.

The actual `workspace.sh comment` helper was run twice against [PR #32](https://github.com/mindtheflo/notis-apps/pull/32). GitHub readback confirmed [exactly one review comment](https://github.com/mindtheflo/notis-apps/pull/32#issuecomment-5559263426), matching the generated body byte-for-byte and containing no unverified preview section. See [live GitHub readback](automatic-preview-github-readback.json).

Success-path PR/comment propagation is tested with deterministic GitHub readbacks, including a comment created before readiness, a PR created later, changed descriptions and repeated updates without duplicates. This is not a claim of a live Manager conversation or successful real-GitHub verified-link propagation.

## Live-service boundary

The CLI schema still exposes register/open/status/stop, not heartbeat. Status is intentionally a read-only registry lookup, so a local HTTP 200 does not advance a persisted `starting` row. The ready-state transition requires a heartbeat (or an explicit open).

Read-only SQL confirmed the canonical user sandbox binding exists and matches every preview. The live CLI projection omits `sandbox_id`, so the old Stop implementation falsely reports `Cloud Computer binding is unavailable`. The companion PR fixes Stop by reading the canonical binding without resuming/replacing infrastructure.

All four preview ports were reserved during the retry; a fresh registration was rejected before the corrected dev command could run. The earliest observed reservation expiry was 12:38:15 UTC; the task's original port remained reserved until 12:50:33 UTC. See [sanitized registry readback](automatic-preview-registry-readback.json). No other task's preview was stopped or registry row modified. Browser recovery reached the official Portal sign-in screen; the saved browser session is not authenticated.

The original [registered preview identity](https://beta.notis.ai/sandbox-preview/a0c5ac77-6ab9-4df3-872c-9070c57fce85) remains **unverified, not a usable preview**. No local HTTP check, registry URL, fixture URL or sign-in screen is presented as live readiness proof.

**Release dependency:** first release [backend PR #2081](https://github.com/mindtheflo/notis/pull/2081), including both heartbeat exposure and canonical Stop binding; only then activate the reconciled Conductor source from [PR #32](https://github.com/mindtheflo/notis-apps/pull/32). Neither merge nor deployment was performed. A full live Manager completion and successful real-GitHub preview-link propagation remain untested until the service can supply a verified preview.
