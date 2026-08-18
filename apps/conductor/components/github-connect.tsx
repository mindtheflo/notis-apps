'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowSquareOutIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  CopyIcon,
  GithubLogoIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import { useCloudComputer } from '@notis/sdk';

import { SCRIPTS, parseJson, useSandboxShell } from '@/lib/shell';

/**
 * Sign the cloud computer's GitHub CLI in, from the app.
 *
 * This used to be a sentence to copy into a chat. The app can run commands on
 * the cloud computer now, so it drives the same `gh_login.py` the skill uses:
 * it reads the real `gh auth status`, starts the device flow, shows the
 * one-time code, and polls until GitHub says the grant went through.
 *
 * The poll is deliberately short and repeated rather than one long call. The
 * script will happily block for four minutes, which is far longer than a person
 * should watch a spinner with no way to tell whether anything is happening.
 */

type Grant = {
  already_authenticated?: boolean;
  user_code?: string;
  verification_uri?: string;
  status?: string;
  detail?: string;
  account?: string | null;
};

type Phase =
  | { kind: 'checking' }
  | { kind: 'connected'; account: string | null }
  | { kind: 'disconnected' }
  | { kind: 'awaiting'; code: string; url: string }
  | { kind: 'failed'; message: string };

export function GithubConnect({ onConnected }: { onConnected?: () => void }) {
  const { run } = useSandboxShell();
  const { facts, loading } = useCloudComputer();
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' });
  const [copied, setCopied] = useState(false);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    const github = facts?.available ? facts.cli_auth.gh : null;
    setPhase(
      github?.authenticated === true
        ? { kind: 'connected', account: github.account ?? null }
        : { kind: 'disconnected' },
    );
  }, [facts, loading]);

  const poll = useCallback(
    async (code: string, url: string) => {
      // Each call waits a short while server-side, so a few rounds cover the
      // time a person needs to open GitHub and type the code.
      for (let attempt = 0; attempt < 12 && !cancelled.current; attempt += 1) {
        const result = await run(`python3 ${SCRIPTS}/gh_login.py poll --budget 20`, {
          timeoutMs: 45_000,
        });
        if (cancelled.current) return;
        if (!result.ok) {
          setPhase({
            kind: 'failed',
            message:
              result.error
              ?? (result.stderr.trim() || 'GitHub approval check failed'),
          });
          return;
        }
        const grant = parseJson<Grant>(result.stdout);
        if (grant?.status === 'authenticated') {
          setPhase({ kind: 'connected', account: grant.account ?? null });
          onConnected?.();
          return;
        }
        if (grant?.status && !['pending', 'no_pending_grant'].includes(grant.status)) {
          setPhase({
            kind: 'failed',
            message: grant.detail || `GitHub returned ${grant.status}.`,
          });
          return;
        }
        setPhase({ kind: 'awaiting', code, url });
      }
      if (!cancelled.current) {
        setPhase({ kind: 'failed', message: 'The code expired before it was approved.' });
      }
    },
    [run, onConnected],
  );

  const connect = useCallback(async () => {
    setPhase({ kind: 'checking' });
    const result = await run(`python3 ${SCRIPTS}/gh_login.py start`, { timeoutMs: 45_000 });
    if (cancelled.current) return;
    const grant = parseJson<Grant>(result.stdout);
    if (grant?.already_authenticated) {
      setPhase({ kind: 'connected', account: grant.account ?? null });
      onConnected?.();
      return;
    }
    if (!grant?.user_code || !grant.verification_uri) {
      setPhase({
        kind: 'failed',
        message: result.error || result.stderr || 'Could not start the GitHub sign-in.',
      });
      return;
    }
    setPhase({ kind: 'awaiting', code: grant.user_code, url: grant.verification_uri });
    void poll(grant.user_code, grant.verification_uri);
  }, [run, poll, onConnected]);

  if (phase.kind === 'checking') {
    return (
      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <CircleNotchIcon className="h-4 w-4 animate-spin" />
        Checking GitHub
      </span>
    );
  }

  if (phase.kind === 'connected') {
    return (
      <span className="inline-flex items-center gap-2 text-sm">
        <CheckCircleIcon
          weight="fill"
          className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
        />
        GitHub connected{phase.account ? ` as ${phase.account}` : ''}
      </span>
    );
  }

  if (phase.kind === 'awaiting') {
    return (
      <div className="rounded-md border border-border bg-muted/40 p-3">
        <p className="text-sm">
          Open GitHub and enter this code. This view is watching for the approval.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="rounded-md border border-border bg-background px-3 py-1.5 font-mono text-base tracking-widest">
            {phase.code}
          </code>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(phase.code)
                .then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                })
                .catch(() => setCopied(false));
            }}
          >
            <CopyIcon className="mr-1.5 h-3.5 w-3.5" />
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <a
            href={phase.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm underline-offset-2 hover:underline"
          >
            {phase.url.replace('https://', '')}
            <ArrowSquareOutIcon className="h-3.5 w-3.5" />
          </a>
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <CircleNotchIcon className="h-3.5 w-3.5 animate-spin" />
            Waiting
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="outline" size="sm" onClick={() => void connect()}>
        <GithubLogoIcon className="mr-1.5 h-3.5 w-3.5" />
        Connect GitHub
      </Button>
      {phase.kind === 'failed' && (
        <span className="inline-flex items-center gap-1.5 text-sm text-red-700 dark:text-red-400">
          <WarningCircleIcon className="h-4 w-4" />
          {phase.message}
        </span>
      )}
    </div>
  );
}
