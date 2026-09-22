/**
 * Archiving a selection.
 *
 * The walk lives here rather than inside the page so the three things that went
 * wrong in the dialog can be stated as behaviour: a run reports each removal as
 * it happens, several removals are in flight at once, and a cancelled run stops
 * dispatching immediately instead of working through the rest of the selection.
 *
 * Overlapping matters because a removal is mostly waiting. The cleanup itself
 * is seconds of local git work, but every command the board sends crosses the
 * platform to reach the cloud computer, and that crossing dominates. Running a
 * few at a time turns a selection of twenty from a coffee break into a wait.
 */

import { archiveError, archiveWorkspaceCancellable, type ArchiveRunner } from './archive-workspace.ts';
import type { ShellOutcome } from './shell.ts';

export type BulkArchiveTarget = {
  id: string;
  name: string;
  repositoryName: string | null;
  repositoryId: string | null;
  path?: string | null;
};

export type BulkArchiveFailure = { id: string; name: string; message: string };

export type BulkArchiveResult = {
  archived: number;
  failures: BulkArchiveFailure[];
  cancelled: boolean;
};

/**
 * What the dialog is allowed to say while a run is walking the selection.
 *
 * `completed` and `archived` are deliberately separate. A removal that timed
 * out or came back refused has finished as far as the walk is concerned, but
 * nothing was archived -- and the command it gave up waiting on may still be
 * running on the cloud computer. Counting those two together is what let the
 * dialog report "Archived 8 of 19" over a board where all nineteen rows were
 * still there.
 */
export type BulkArchiveProgress = {
  completed: number;
  total: number;
  archived: number;
  failed: number;
};

const UNLINKED = 'The workspace is not linked to an available repository.';

/**
 * Enough to hide the round trip, few enough that a mistake cannot storm the
 * cloud computer -- and worktree removals in one repository stay rare enough
 * not to queue behind each other's git locks.
 */
export const BULK_ARCHIVE_CONCURRENCY = 4;

export async function runBulkArchive(options: {
  targets: BulkArchiveTarget[];
  archive: (target: BulkArchiveTarget, signal: AbortSignal) => Promise<ShellOutcome>;
  signal: AbortSignal;
  onArchived: (workspaceId: string) => void;
  onProgress: (progress: BulkArchiveProgress) => void;
  onFailures: (failures: BulkArchiveFailure[]) => void;
  concurrency?: number;
}): Promise<BulkArchiveResult> {
  const {
    targets, archive, signal, onArchived, onProgress, onFailures,
    concurrency = BULK_ARCHIVE_CONCURRENCY,
  } = options;

  // Indexed by position so a failure list read left to right matches the board,
  // whatever order the removals happen to finish in.
  const failed: Array<BulkArchiveFailure | null> = targets.map(() => null);
  let archived = 0;
  let completed = 0;
  let cancelled = false;
  let next = 0;

  const report = () => {
    const failures = failed.filter((failure): failure is BulkArchiveFailure => failure !== null);
    onFailures(failures);
    onProgress({
      completed,
      total: targets.length,
      archived,
      failed: failures.length,
    });
  };

  const worker = async () => {
    while (!signal.aborted) {
      const index = next;
      next += 1;
      if (index >= targets.length) return;
      const target = targets[index];

      if (!target.repositoryName && target.path) {
        failed[index] = { id: target.id, name: target.name, message: UNLINKED };
      } else {
        const outcome = await archive(target, signal);
        // A cancelled wait says nothing about the command it was waiting on, so
        // it is not a failure to show against the row -- the run just ends.
        if (signal.aborted) {
          cancelled = true;
          return;
        }
        if (outcome.ok) {
          archived += 1;
          onArchived(target.id);
        } else {
          failed[index] = { id: target.id, name: target.name, message: archiveError(outcome) };
        }
      }

      completed += 1;
      report();
    }
    cancelled = true;
  };

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, targets.length)) }, worker),
  );

  return {
    archived,
    failures: failed.filter((failure): failure is BulkArchiveFailure => failure !== null),
    cancelled: cancelled || signal.aborted,
  };
}

/** The archive step the dialog runs with: one cancellable cleanup per row. */
export function sandboxArchiver(run: ArchiveRunner) {
  return (target: BulkArchiveTarget, signal: AbortSignal) => archiveWorkspaceCancellable(
    run,
    {
      repositoryName: target.repositoryName ?? '',
      repositoryId: target.repositoryId,
      name: target.name,
      id: target.id,
    },
    signal,
  );
}
