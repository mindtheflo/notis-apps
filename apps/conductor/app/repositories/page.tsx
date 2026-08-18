'use client';

import { useMemo, useState } from 'react';
import { useTopBarSearch } from '@notis/sdk';
import {
  ArrowClockwiseIcon,
  ArrowSquareOutIcon,
  CircleNotchIcon,
  KeyIcon,
  TerminalWindowIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';

import { Onboarding } from '@/components/onboarding';
import { GithubConnect } from '@/components/github-connect';
import { SecretsUpload } from '@/components/secrets-upload';
import { SyncButton } from '@/components/sync-button';
import { Field, Mono, StateBadge } from '@/components/status';
import { Button } from '@/components/ui/button';
import { relativeTime, useWorkspacesData } from '@/lib/data';
import type { Repository, Workspace } from '@/lib/types';

function Secrets({
  repository,
  onUploaded,
}: {
  repository: Repository;
  onUploaded: () => void;
}) {
  return (
    <div>
      {repository.secretFiles.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No environment files yet. Add them here and they are copied into every workspace
          created from this repository.
        </p>
      ) : (
        <>
          <ul className="space-y-1">
            {repository.secretFiles.map((file) => (
              <li key={file} className="flex items-center gap-2">
                <KeyIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <code className="truncate font-mono text-xs">{file}</code>
              </li>
            ))}
          </ul>
          {/* Names only, never values -- and now that is the storage rather
              than a convention: the row holds a `secret` property, whose only
              fields are a reference, a status and metadata. The files
              themselves live outside every checkout on the cloud computer. */}
          <p className="mt-2 text-xs text-muted-foreground">
            Stored on the cloud computer at{' '}
            <code className="font-mono">{repository.secretsPath}</code>.
          </p>
        </>
      )}

      <div className="mt-3">
        <SecretsUpload repository={repository} onUploaded={onUploaded} />
      </div>
    </div>
  );
}

function RepositoryCard({
  repository,
  workspaces,
  onUploaded,
}: {
  repository: Repository;
  workspaces: Workspace[];
  onUploaded: () => void;
}) {
  const active = workspaces.filter((row) => row.status !== 'Archived').length;

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{repository.name}</h3>
          {repository.gitUrl && (
            <a
              href={repository.gitUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-2 hover:underline"
            >
              {repository.owner}/{repository.repo}
              <ArrowSquareOutIcon className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StateBadge state={repository.secretsStatus} />
          <StateBadge state={repository.status} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        <Field label="Default branch">
          <Mono value={repository.defaultBranch} />
        </Field>
        <Field label="Checkout">
          <Mono value={repository.path} />
        </Field>
        <Field label="Workspaces">
          <span className="text-sm text-muted-foreground">
            {active} active, {workspaces.length} total
          </span>
        </Field>
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <div className="mb-2 flex items-center gap-2">
          <TerminalWindowIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Commands
          </span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Field label="Setup">
            <Mono value={repository.setupCommand} />
          </Field>
          <Field label="Run">
            <Mono value={repository.devCommand} />
          </Field>
          <Field label="Archive">
            <Mono value={repository.archiveCommand} />
          </Field>
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <div className="mb-2 flex items-center gap-2">
          <KeyIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Environment files
          </span>
        </div>
        <Secrets repository={repository} onUploaded={onUploaded} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p className="text-xs text-muted-foreground">
          Setup last verified {relativeTime(repository.setupVerifiedAt)}
        </p>
        <SyncButton target={{ kind: 'repository', repo: repository.name }} onSynced={onUploaded} />
      </div>
    </div>
  );
}

export default function RepositoriesPage() {
  const { repositories, workspaces, loading, error, refresh, live } = useWorkspacesData();
  const [search, setSearch] = useState('');

  useTopBarSearch({
    value: search,
    onChange: setSearch,
    placeholder: 'Search repositories',
  });

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return repositories;
    return repositories.filter((repository) =>
      [repository.name, repository.owner, repository.repo, repository.path]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle)),
    );
  }, [repositories, search]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
        <CircleNotchIcon className="h-4 w-4 animate-spin" />
        Loading repositories
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <WarningCircleIcon className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">Could not load repositories</p>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={refresh}>
          Try again
        </Button>
      </div>
    );
  }

  if (repositories.length === 0) {
    return <Onboarding hasRepository={false} hasWorkspace={false} />;
  }

  return (
    <div className="px-6 py-5" data-store-screenshot="repositories">
      <header className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Repositories</h1>
          <p className="text-sm text-muted-foreground">
            {repositories.length} configured on your cloud computer
          </p>
        </div>
        <div className="flex items-center gap-3">
          <GithubConnect />
          {/* Same rule as the Workspaces board: the reload only appears on
              hosts without a change feed. */}
          {live ? (
            <span className="text-xs text-muted-foreground">Live</span>
          ) : (
            <Button variant="outline" size="sm" onClick={refresh}>
              <ArrowClockwiseIcon className="mr-1.5 h-3.5 w-3.5" />
              Reload
            </Button>
          )}
        </div>
      </header>

      <div className="space-y-4">
        {visible.map((repository) => (
          <RepositoryCard
            key={repository.id}
            repository={repository}
            workspaces={workspaces.filter((row) => row.repositoryId === repository.id)}
            onUploaded={refresh}
          />
        ))}
        {visible.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No repository matches “{search}”.
          </p>
        )}
      </div>
    </div>
  );
}
