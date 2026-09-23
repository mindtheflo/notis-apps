'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowSquareOutIcon,
  CircleNotchIcon,
  PlayIcon,
  StopIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import { parseJson, quote, SCRIPTS, useSandboxShell } from '@/lib/shell';

type DevStatus = {
  state: 'starting' | 'ready' | 'stopped' | 'error';
  job: string;
  entry_url: string | null;
  error?: string | null;
};

export function DevControls({ repo, name }: { repo: string; name: string }) {
  const { run } = useSandboxShell();
  const [status, setStatus] = useState<DevStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const actionGeneration = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const command = useCallback((action: string) => (
    `bash ${SCRIPTS}/workspace.sh ${action} ${quote(repo)} ${quote(name)}`
  ), [name, repo]);

  const readStatus = useCallback(async (): Promise<DevStatus | null> => {
    const result = await run(command('dev-status'));
    if (!result.ok) return null;
    return parseJson<DevStatus>(result.stdout);
  }, [command, run]);

  const waitForEntry = useCallback(async (generation: number) => {
    for (let attempt = 0; attempt < 60 && mounted.current && generation === actionGeneration.current; attempt += 1) {
      const next = await readStatus();
      if (!mounted.current || generation !== actionGeneration.current) return;
      if (next) setStatus(next);
      if (next?.state === 'ready' || next?.state === 'error' || next?.state === 'stopped') {
        if (next.state === 'error') setError(next.error || 'The dev server stopped before its URL was ready.');
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 2_000));
    }
    if (mounted.current) setError('The dev server is still starting. Try again in a moment.');
  }, [readStatus]);

  const check = useCallback(async () => {
    const generation = actionGeneration.current + 1;
    actionGeneration.current = generation;
    setBusy(true);
    setError(null);
    const next = await readStatus();
    if (!mounted.current) return;
    setBusy(false);
    if (next) {
      setStatus(next);
      if (next.state === 'error') setError(next.error || 'The dev server is not ready.');
      if (next.state === 'starting') await waitForEntry(generation);
    } else {
      setError('Could not read the dev server state.');
    }
  }, [readStatus, waitForEntry]);

  const start = useCallback(async () => {
    const generation = actionGeneration.current + 1;
    actionGeneration.current = generation;
    setBusy(true);
    setError(null);
    const result = await run(command('dev'));
    if (!result.ok) {
      if (mounted.current) {
        setBusy(false);
        setError(result.error || result.stderr.trim().split('\n').pop() || 'Could not start dev.');
      }
      return;
    }
    if (mounted.current) {
      setStatus({ state: 'starting', job: 'running', entry_url: null });
      setBusy(false);
    }
    await waitForEntry(generation);
  }, [command, run, waitForEntry]);

  const stop = useCallback(async () => {
    actionGeneration.current += 1;
    setBusy(true);
    setError(null);
    const result = await run(command('dev-stop'));
    if (mounted.current) {
      setBusy(false);
      if (result.ok) setStatus({ state: 'stopped', job: 'stopped', entry_url: null });
      else setError(result.error || result.stderr.trim().split('\n').pop() || 'Could not stop dev.');
    }
  }, [command, run]);

  const open = useCallback(async () => {
    const popup = window.open('about:blank', '_blank');
    if (!popup) {
      setError('Allow pop-ups to open the dev server.');
      return;
    }
    popup.opener = null;
    setBusy(true);
    setError(null);
    const result = await run(command('dev-url'));
    const entryUrl = result.stdout.trim().split('\n').pop() || '';
    if (mounted.current) setBusy(false);
    if (!result.ok || !entryUrl) {
      popup.close();
      const refreshed = await readStatus();
      if (mounted.current) {
        setStatus(refreshed || {
          state: 'error',
          job: 'unknown',
          entry_url: null,
          error: 'Could not refresh the dev server state.',
        });
        setError(
          refreshed?.error
          || result.error
          || result.stderr.trim().split('\n').pop()
          || 'The dev URL is not ready.',
        );
      }
      return;
    }
    if (popup.closed) {
      if (mounted.current) setError('The dev tab was closed before its URL was ready.');
      return;
    }
    popup.location.replace(entryUrl);
  }, [command, readStatus, run]);

  const active = status?.state === 'starting'
    || status?.state === 'ready'
    || (status?.state === 'error' && status.job.startsWith('running'));
  return (
    <span className="inline-flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
      {status === null ? (
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => void check()}>
          {busy ? (
            <CircleNotchIcon className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <PlayIcon className="mr-1.5 h-3.5 w-3.5" />
          )}
          Check dev
        </Button>
      ) : status.state === 'ready' ? (
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => void open()}>
          <ArrowSquareOutIcon className="mr-1.5 h-3.5 w-3.5" />
          Open dev
        </Button>
      ) : (
        <Button variant="secondary" size="sm" disabled={busy || active} onClick={() => void start()}>
          {busy || status?.state === 'starting' ? (
            <CircleNotchIcon className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <PlayIcon className="mr-1.5 h-3.5 w-3.5" />
          )}
          {status.state === 'starting' ? 'Starting dev' : status.state === 'error' ? 'Dev error' : 'Start dev'}
        </Button>
      )}
      {active && (
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void stop()}>
          <StopIcon className="mr-1.5 h-3.5 w-3.5" />
          Stop
        </Button>
      )}
      {error && (
        <span title={error} className="inline-flex max-w-48 items-center gap-1 truncate text-xs text-destructive">
          <WarningCircleIcon className="h-3.5 w-3.5 shrink-0" />
          {error}
        </span>
      )}
    </span>
  );
}
