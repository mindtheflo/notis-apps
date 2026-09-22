import type { ShellOutcome } from './shell.ts';

const SCRIPTS = '/vercel/sandbox/.notis/skills/workspaces-shared/scripts';

function quote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export type ArchiveRunner = (
  command: string,
  options?: { timeoutMs?: number; cwd?: string },
) => Promise<ShellOutcome>;

/**
 * The rows the board is already showing. Handing their ids to the cleanup
 * script is what keeps one archive to one write: without them the sandbox has
 * to read the repositories table and scan the workspaces table to find again
 * what the browser is looking at, and it archives the first row that happens to
 * share the name rather than the one that was selected.
 */
export type ArchiveTarget = {
  repositoryName: string;
  repositoryId: string | null;
  name: string;
  id: string;
};

/**
 * The shell call's own ceiling; past it the transport, not the command, is
 * stuck.
 *
 * It sits at the platform proxy's own ceiling rather than below it, so the
 * transport is the thing that reports a stuck call. Giving up first is not
 * free: the command keeps running on the cloud computer, and a removal
 * abandoned at the old two-minute mark went on to delete its worktree and
 * archive its row minutes after the dialog had already written it off.
 */
const CALL_TIMEOUT_MS = 180_000;

const CANCELLED = 'Archive cancelled. The current cleanup may still finish; refresh before retrying.';
const TIMED_OUT = 'Archive request timed out. The current cleanup may still finish; refresh before retrying.';

function interrupted(error: string): ShellOutcome {
  return { ok: false, stdout: '', stderr: '', exitCode: -1, error };
}

export function archiveError(outcome: ShellOutcome): string {
  return outcome.error || outcome.stderr.trim().split('\n').pop() || 'Archive failed.';
}

/** Run the one supported workspace cleanup path used by both archive UIs. */
export async function archiveWorkspace(
  run: ArchiveRunner,
  target: ArchiveTarget,
): Promise<ShellOutcome> {
  const identifiers = [
    ...(target.repositoryId ? ['--repo-id', quote(target.repositoryId)] : []),
    ...(target.id ? ['--row-id', quote(target.id)] : []),
  ].join(' ');
  return run(
    `bash ${SCRIPTS}/workspace.sh remove ${quote(target.repositoryName)} ${quote(target.name)}`
    + (identifiers ? ` ${identifiers}` : ''),
    { timeoutMs: CALL_TIMEOUT_MS },
  );
}

/**
 * Wait for one archive request without letting the wait outlive the person.
 * Cancelling stops this UI from dispatching further removals; it deliberately
 * does not retry or assume the in-flight command was rolled back, because that
 * command may already have removed a worktree.
 */
export async function archiveWorkspaceCancellable(
  run: ArchiveRunner,
  target: ArchiveTarget,
  signal: AbortSignal,
  timeoutMs = CALL_TIMEOUT_MS + 5_000,
): Promise<ShellOutcome> {
  if (signal.aborted) return interrupted(CANCELLED);

  let timeout: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      archiveWorkspace(run, target),
      new Promise<ShellOutcome>((resolve) => {
        onAbort = () => resolve(interrupted(CANCELLED));
        signal.addEventListener('abort', onAbort, { once: true });
        timeout = setTimeout(() => resolve(interrupted(TIMED_OUT)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
    if (onAbort) signal.removeEventListener('abort', onAbort);
  }
}
