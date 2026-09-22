'use client';

import { useCallback, useState, useRef, useEffect } from 'react';
import {
  ArchiveIcon,
  CircleNotchIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import { archiveError } from '@/lib/archive-workspace';
import { batchArchiver } from '@/lib/archive-batch';
import { useArchiveWriter } from '@/lib/use-archive-writer';
import { useSandboxShell } from '@/lib/shell';
import type { Workspace } from '@/lib/types';

/**
 * Archive through the same supported script used by the new-workspace skill.
 * The script removes only the local worktree, retains its git branch, and sets
 * the existing database row to Archived. Nothing is deleted from the ledger.
 */
export function ArchiveButton({
  workspace,
  repositoryName,
  onArchived,
  disabled = false,
}: {
  workspace: Workspace;
  repositoryName: string | null;
  onArchived: () => void;
  disabled?: boolean;
}) {
  const { run } = useSandboxShell();
  const writeArchive = useArchiveWriter();
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const archive = useCallback(async () => {
    setBusy(true);
    setError(null);
    const active = new AbortController();
    controller.current = active;
    const target = { repositoryName, repositoryId: workspace.repositoryId, name: workspace.name, id: workspace.id, path: workspace.path };
    try {
      const result = await batchArchiver(run, [target], writeArchive)(target, active.signal);
      if (!result.ok) { setError(archiveError(result)); return; }
      setConfirming(false);
      onArchived();
    } finally {
      if (controller.current === active) controller.current = null;
      setBusy(false);
    }
  }, [onArchived, repositoryName, run, writeArchive, workspace]);

  if (!confirming) {
    return (
      <Button
        variant="ghost"
        size="sm"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          setError(null);
          setConfirming(true);
        }}
      >
        <ArchiveIcon className="mr-1.5 h-3.5 w-3.5" />
        Archive
      </Button>
    );
  }

  return (
    <div
      className="flex max-w-md flex-wrap items-center justify-end gap-2"
      onClick={(event) => event.stopPropagation()}
    >
      <span className="text-xs text-muted-foreground">
        {workspace.dirtyFiles
          ? `${workspace.dirtyFiles} uncommitted file${workspace.dirtyFiles === 1 ? '' : 's'} will be removed. `
          : ''}
        The local checkout will be removed; the branch and record stay available.
      </span>
      <Button
        variant="ghost"
        size="sm"
        disabled={disabled}
        onClick={() => {
          if (busy) { controller.current?.abort(); return; }
          setConfirming(false);
          setError(null);
        }}
      >
        Cancel
      </Button>
      <Button
        variant="destructive"
        size="sm"
        disabled={busy || disabled}
        onClick={() => void archive()}
      >
        {busy ? (
          <CircleNotchIcon className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <ArchiveIcon className="mr-1.5 h-3.5 w-3.5" />
        )}
        {busy ? 'Archiving' : 'Archive workspace'}
      </Button>
      {error && (
        <span
          role="alert"
          title={error}
          className="inline-flex items-center gap-1 text-xs text-destructive"
        >
          <WarningCircleIcon className="h-3.5 w-3.5 shrink-0" />
          {error}
        </span>
      )}
    </div>
  );
}
