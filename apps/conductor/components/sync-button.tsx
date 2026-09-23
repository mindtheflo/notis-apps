'use client';

import { useCallback, useState } from 'react';
import { ArrowsClockwiseIcon, CircleNotchIcon, WarningCircleIcon } from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import { SCRIPTS, quote, useSandboxShell } from '@/lib/shell';

/**
 * Re-read the truth, not the record of it.
 *
 * The plain refresh re-queries rows a skill wrote at some point in the past. It
 * cannot tell you a pull request merged ten minutes ago. This runs the same
 * `sync` the skill runs -- git, then the GitHub CLI -- so the row is rebuilt
 * from the repository and the remote before the view reloads it.
 */

export function SyncButton({
  target,
  onSynced,
  label = 'Sync',
}: {
  target: { kind: 'repository'; repo: string } | { kind: 'workspace'; repo: string; name: string };
  onSynced: () => void;
  label?: string;
}) {
  const { run } = useSandboxShell();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sync = useCallback(async () => {
    setBusy(true);
    setError(null);
    const command =
      target.kind === 'repository'
        ? `bash ${SCRIPTS}/repo.sh sync ${quote(target.repo)}`
        : `bash ${SCRIPTS}/workspace.sh sync ${quote(target.repo)} ${quote(target.name)}`;

    // Syncing talks to git and to GitHub, so it is slower than a database read
    // but nowhere near long enough to need a detached job.
    const result = await run(command, { timeoutMs: 120_000 });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || result.stderr.trim().split('\n').pop() || 'Sync failed.');
      return;
    }
    onSynced();
  }, [run, target, onSynced]);

  return (
    <span className="inline-flex items-center gap-2">
      <Button variant="secondary" size="sm" disabled={busy} onClick={() => void sync()}>
        {busy ? (
          <CircleNotchIcon className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <ArrowsClockwiseIcon className="mr-1.5 h-3.5 w-3.5" />
        )}
        {busy ? 'Syncing' : label}
      </Button>
      {error && (
        <span
          title={error}
          className="inline-flex items-center gap-1 truncate text-xs text-destructive"
        >
          <WarningCircleIcon className="h-3.5 w-3.5 shrink-0" />
          {error}
        </span>
      )}
    </span>
  );
}
