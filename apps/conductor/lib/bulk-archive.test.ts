import assert from 'node:assert/strict';
import test from 'node:test';

import { runBulkArchive, type BulkArchiveProgress } from './bulk-archive.ts';
import type { ShellOutcome } from './shell.ts';

const ok: ShellOutcome = { ok: true, stdout: 'removed', stderr: '', exitCode: 0, error: null };

function targets(...names: string[]) {
  return names.map((name, index) => ({
    id: `row-${index}`,
    name,
    repositoryName: 'demo',
    repositoryId: 'repo-row',
  }));
}

test('progress and hidden rows follow each removal instead of waiting for the batch', async () => {
  const progress: BulkArchiveProgress[] = [];
  const archived: string[] = [];

  const result = await runBulkArchive({
    targets: targets('one', 'two'),
    archive: async () => ok,
    signal: new AbortController().signal,
    onArchived: (id) => archived.push(id),
    onProgress: (value) => progress.push(value),
    onFailures: () => {},
  });

  assert.deepEqual(progress, [
    { completed: 1, total: 2, archived: 1, failed: 0 },
    { completed: 2, total: 2, archived: 2, failed: 0 },
  ]);
  assert.deepEqual(archived.sort(), ['row-0', 'row-1']);
  assert.equal(result.cancelled, false);
  assert.deepEqual(result.failures, []);
});

test('several removals are in flight at once, up to the limit and no further', async () => {
  let inFlight = 0;
  let peak = 0;

  const result = await runBulkArchive({
    targets: targets('a', 'b', 'c', 'd', 'e'),
    archive: async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return ok;
    },
    signal: new AbortController().signal,
    onArchived: () => {},
    onProgress: () => {},
    onFailures: () => {},
    concurrency: 2,
  });

  assert.equal(peak, 2);
  assert.equal(result.archived, 5);
});

test('cancelling stops the run instead of working through the rest of the selection', async () => {
  const controller = new AbortController();
  const dispatched: string[] = [];

  const result = await runBulkArchive({
    targets: targets('one', 'two', 'three', 'four', 'five', 'six'),
    archive: async (target, signal) => {
      dispatched.push(target.name);
      controller.abort();
      return signal.aborted
        ? { ok: false, stdout: '', stderr: '', exitCode: -1, error: 'Archive cancelled.' }
        : ok;
    },
    signal: controller.signal,
    onArchived: () => {},
    onProgress: () => {},
    onFailures: () => {},
    concurrency: 2,
  });

  // Whatever was already in flight is left to finish on the cloud computer;
  // nothing past the first wave is ever sent.
  assert.ok(dispatched.length <= 2, `dispatched ${dispatched.join(', ')}`);
  assert.deepEqual(dispatched.filter((name) => !['one', 'two'].includes(name)), []);
  assert.equal(result.cancelled, true);
  assert.deepEqual(result.failures, []);
});

test('one workspace that cannot be archived does not stop the others', async () => {
  const result = await runBulkArchive({
    targets: [
      { id: 'row-0', name: 'unlinked', repositoryName: null, repositoryId: null, path: '/existing/checkout' },
      { id: 'row-1', name: 'broken', repositoryName: 'demo', repositoryId: 'repo-row' },
      { id: 'row-2', name: 'fine', repositoryName: 'demo', repositoryId: 'repo-row' },
    ],
    archive: async (target) => (target.name === 'broken'
      ? { ok: false, stdout: '', stderr: 'fatal: worktree is locked\n', exitCode: 1, error: null }
      : ok),
    signal: new AbortController().signal,
    onArchived: () => {},
    onProgress: () => {},
    onFailures: () => {},
  });

  assert.deepEqual(result.failures.map(({ name, message }) => ({ name, message })), [
    { name: 'unlinked', message: 'The workspace is not linked to an available repository.' },
    { name: 'broken', message: 'fatal: worktree is locked' },
  ]);
  assert.equal(result.archived, 1);
});

test('a removal that failed is never counted as an archive', async () => {
  // The board reported "Archived 8 of 19" over nineteen untouched rows because
  // every one of those eight had timed out waiting for the cloud computer.
  const progress: BulkArchiveProgress[] = [];
  const timedOut: ShellOutcome = {
    ok: false,
    stdout: '',
    stderr: '',
    exitCode: -1,
    error: 'Archive request timed out. The current cleanup may still finish; refresh before retrying.',
  };

  const result = await runBulkArchive({
    targets: targets('one', 'two', 'three'),
    archive: async (target) => (target.name === 'two' ? ok : timedOut),
    signal: new AbortController().signal,
    onArchived: () => {},
    onProgress: (value) => progress.push(value),
    onFailures: () => {},
    concurrency: 1,
  });

  assert.deepEqual(progress, [
    { completed: 1, total: 3, archived: 0, failed: 1 },
    { completed: 2, total: 3, archived: 1, failed: 1 },
    { completed: 3, total: 3, archived: 1, failed: 2 },
  ]);
  assert.equal(result.archived, 1);
  assert.equal(result.failures.length, 2);
});

test('an unlinked workspace counts as failed, not archived', async () => {
  const progress: BulkArchiveProgress[] = [];

  await runBulkArchive({
    targets: [{ id: 'row-0', name: 'unlinked', repositoryName: null, repositoryId: null, path: '/existing/checkout' }],
    archive: async () => ok,
    signal: new AbortController().signal,
    onArchived: () => {},
    onProgress: (value) => progress.push(value),
    onFailures: () => {},
  });

  assert.deepEqual(progress, [{ completed: 1, total: 1, archived: 0, failed: 1 }]);
});

test('cancelling reports no progress for the removal it stopped waiting on', async () => {
  const controller = new AbortController();
  const progress: BulkArchiveProgress[] = [];

  const result = await runBulkArchive({
    targets: targets('one', 'two', 'three', 'four'),
    archive: async (target, signal) => {
      controller.abort();
      return signal.aborted
        ? { ok: false, stdout: '', stderr: '', exitCode: -1, error: 'Archive cancelled.' }
        : ok;
    },
    signal: controller.signal,
    onArchived: () => {},
    onProgress: (value) => progress.push(value),
    onFailures: () => {},
    concurrency: 1,
  });

  // The in-flight command may still be removing its worktree, so the dialog is
  // told nothing about it rather than being told it archived or failed.
  assert.deepEqual(progress, []);
  assert.equal(result.archived, 0);
  assert.equal(result.cancelled, true);
});
