import assert from 'node:assert/strict';
import test from 'node:test';

import { archiveError, archiveWorkspace } from './archive-workspace.ts';
import type { ShellOutcome } from './shell.ts';

test('archiveWorkspace quotes row identifiers and uses the supported remove command', async () => {
  let command = '';
  let timeoutMs: number | undefined;
  const outcome: ShellOutcome = { ok: true, stdout: 'done', stderr: '', exitCode: 0, error: null };

  const result = await archiveWorkspace(async (nextCommand, options) => {
    command = nextCommand;
    timeoutMs = options?.timeoutMs;
    return outcome;
  }, {
    repositoryName: "repo's-name",
    repositoryId: null,
    name: "workspace's-name",
    id: '',
  });

  assert.equal(result, outcome);
  assert.match(command, /workspace\.sh remove 'repo'\\''s-name' 'workspace'\\''s-name'$/);
  // At the platform proxy's ceiling, not below it: see CALL_TIMEOUT_MS.
  assert.equal(timeoutMs, 180_000);
});

test('archiveWorkspace names the rows it already knows so the sandbox looks nothing up', async () => {
  let command = '';
  await archiveWorkspace(async (nextCommand) => {
    command = nextCommand;
    return { ok: true, stdout: '', stderr: '', exitCode: 0, error: null };
  }, {
    repositoryName: 'notis',
    repositoryId: '00000000-0000-4000-8000-0000000000aa',
    name: 'stuck',
    id: '00000000-0000-4000-8000-0000000000bb',
  });

  assert.match(command, / --repo-id '00000000-0000-4000-8000-0000000000aa'/);
  assert.match(command, / --row-id '00000000-0000-4000-8000-0000000000bb'/);
});

test('archiveError keeps a failed row actionable with the most useful message', () => {
  assert.equal(archiveError({
    ok: false,
    stdout: '',
    stderr: 'details\nlast useful line\n',
    exitCode: 1,
    error: null,
  }), 'last useful line');
});

test('archiveWorkspaceCancellable releases a hung archive when cancelled without issuing another command', async () => {
  const { archiveWorkspaceCancellable } = await import('./archive-workspace.ts');
  const controller = new AbortController();
  let calls = 0;
  const pending = archiveWorkspaceCancellable(async () => {
    calls += 1;
    return await new Promise<ShellOutcome>(() => {});
  }, { repositoryName: 'demo', repositoryId: null, name: 'stuck', id: '' }, controller.signal, 60_000);

  controller.abort();
  const result = await pending;

  assert.equal(calls, 1);
  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /cancelled.*may still finish/i);
});

test('archiveWorkspaceCancellable turns a hung transport into an actionable timeout', async () => {
  const { archiveWorkspaceCancellable } = await import('./archive-workspace.ts');
  const result = await archiveWorkspaceCancellable(async () => (
    await new Promise<ShellOutcome>(() => {})
  ), { repositoryName: 'demo', repositoryId: null, name: 'stuck', id: '' }, new AbortController().signal, 5);

  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /timed out.*may still finish/i);
});
