'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  NotisSelectionBoundary,
  useActiveResource,
  useNotis,
  useNotisNavigation,
  useTopBarSearch,
  ViewSkeleton,
} from '@notis/sdk';
import {
  ArrowClockwiseIcon,
  ArrowSquareOutIcon,
  KeyIcon,
  TerminalWindowIcon,
} from '@phosphor-icons/react';

import { Onboarding } from '@/components/onboarding';
import { GithubConnect } from '@/components/github-connect';
import { SecretsUpload } from '@/components/secrets-upload';
import { SyncButton } from '@/components/sync-button';
import { Field, Mono, StateBadge } from '@/components/status';
import { Button } from '@/components/ui/button';
import { PageHeading } from '@/components/page-heading';
import { relativeTime, useWorkspacesData } from '@/lib/data';
import type { Repository, Workspace } from '@/lib/types';
import { beginResourceNavigation, findRequestedResource } from '@/lib/resource-deep-links';
import { cn } from '@/lib/utils';

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
        {!repository.demo && <SecretsUpload repository={repository} onUploaded={onUploaded} />}
      </div>
    </div>
  );
}

/**
 * Amendment 1: no panel per repository. Each entry is a flat section
 * separated from the next by a single hairline. Amendment 2: branch, path,
 * and command values are inline mono text, never chips.
 */
function RepositoryCard({
  repository,
  workspaces,
  onUploaded,
  selected,
  onSelect,
  selectedRef,
  isFirst,
}: {
  repository: Repository;
  workspaces: Workspace[];
  onUploaded: () => void;
  selected: boolean;
  onSelect: () => void;
  selectedRef: RefObject<HTMLDivElement | null>;
  isFirst: boolean;
}) {
  const active = workspaces.filter((row) => row.status !== 'Archived').length;

  return (
    <div
      ref={selected ? selectedRef : undefined}
      tabIndex={-1}
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
      className={cn('py-4', !isFirst && 'border-t border-border', selected && 'bg-primary/[0.06]')}
    >
    <NotisSelectionBoundary
      resource={{
        id: repository.id,
        kind: 'code-repository',
        label: repository.name,
        url: repository.gitUrl,
        attributes: { owner: repository.owner, repository: repository.repo, status: repository.status },
      }}
      className="block px-2"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{repository.name}</h3>
            <StateBadge state={repository.secretsStatus} />
            <StateBadge state={repository.status} />
          </div>
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
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
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

      <div className="mt-4">
        <div className="mb-2 flex items-center gap-2">
          <TerminalWindowIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Commands</span>
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

      <div className="mt-4">
        <div className="mb-2 flex items-center gap-2">
          <KeyIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Environment files</span>
        </div>
        <Secrets repository={repository} onUploaded={onUploaded} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Setup last verified {relativeTime(repository.setupVerifiedAt)}
        </p>
        {!repository.demo && <SyncButton target={{ kind: 'repository', repo: repository.name }} onSynced={onUploaded} />}
      </div>
    </NotisSelectionBoundary>
    </div>
  );
}

export default function RepositoriesPage() {
  const { resourceId } = useNotis();
  const navigation = useNotisNavigation();
  const { repositories, workspaces, hasData, error, refresh, live } = useWorkspacesData();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [unavailableResourceId, setUnavailableResourceId] = useState<string | null>(null);
  const selectedCardRef = useRef<HTMLDivElement>(null);
  const pendingResourceIdRef = useRef<string | null | undefined>(undefined);

  const selectRepository = useCallback((repositoryId: string | null) => {
    setSelectedId(repositoryId);
    const transition = beginResourceNavigation(
      resourceId,
      pendingResourceIdRef.current,
      repositoryId,
    );
    pendingResourceIdRef.current = transition.pendingResourceId;
    if (transition.shouldNavigate) {
      navigation.toRoute('/repositories', { resourceId: repositoryId });
    }
  }, [navigation, resourceId]);

  useTopBarSearch({
    value: search,
    onChange: setSearch,
    placeholder: 'Search repositories',
  });
  useEffect(() => {
    if (pendingResourceIdRef.current !== undefined) {
      if (pendingResourceIdRef.current !== resourceId) return;
      pendingResourceIdRef.current = undefined;
    }
    if (!resourceId) {
      setUnavailableResourceId(null);
      return;
    }
    if (!hasData) {
      setUnavailableResourceId(null);
      return;
    }
    const requested = findRequestedResource(resourceId, repositories, (row) => row.id);
    if (requested) {
      setSearch('');
      setSelectedId(requested.id);
      setUnavailableResourceId(null);
    } else {
      setSelectedId(null);
      setUnavailableResourceId(resourceId);
    }
  }, [hasData, repositories, resourceId]);

  useEffect(() => {
    if (!resourceId || selectedId !== resourceId) return;
    selectedCardRef.current?.focus({ preventScroll: true });
    selectedCardRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [resourceId, selectedId]);

  const selectedRepository = repositories.find((row) => row.id === selectedId) ?? null;
  useActiveResource(selectedRepository ? {
    id: selectedRepository.id,
    kind: 'code-repository',
    label: selectedRepository.name,
    url: selectedRepository.gitUrl,
    attributes: {
      owner: selectedRepository.owner,
      repository: selectedRepository.repo,
      status: selectedRepository.status,
    },
  } : null);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return repositories;
    return repositories.filter((repository) =>
      repository.id === selectedId || [repository.name, repository.owner, repository.repo, repository.path]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle)),
    );
  }, [repositories, search, selectedId]);

  if (!hasData) {
    return (
      <div className="px-6 py-5" data-store-screenshot="repositories">
        <PageHeading title="Repositories" />
        {error ? (
          <div role="alert" className="mt-6 rounded-xl bg-destructive/10 px-4 py-3 text-sm">
            <p className="font-medium text-destructive">Could not load repositories</p>
            <p className="mt-1 text-muted-foreground">{error}</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={refresh}>
              Try again
            </Button>
          </div>
        ) : (
          <ViewSkeleton variant="table" />
        )}
      </div>
    );
  }

  if (repositories.length === 0) {
    return <Onboarding hasRepository={false} hasWorkspace={false} />;
  }

  return (
    <div className="px-6 py-5" data-store-screenshot="repositories">
      <PageHeading
        title="Repositories"
        description={`${repositories.length} configured on your cloud computer`}
        actions={
          <>
            <GithubConnect />
            {/* Same rule as the Workspaces board: the reload only appears on
                hosts without a change feed. */}
            {live ? (
              <span className="text-xs text-muted-foreground">Live</span>
            ) : (
              <Button variant="secondary" size="sm" onClick={refresh}>
                <ArrowClockwiseIcon className="mr-1.5 h-3.5 w-3.5" />
                Reload
              </Button>
            )}
          </>
        }
      />

      {error ? (
        <div role="alert" className="mt-5 rounded-xl bg-destructive/10 px-4 py-3 text-sm">
          <p className="font-medium text-destructive">Could not refresh repositories.</p>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={refresh}>
            Retry
          </Button>
        </div>
      ) : null}

      <div className="mt-6">
        {unavailableResourceId ? (
          <p className="mb-4 rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
            This repository is no longer available. Showing all repositories instead.
          </p>
        ) : null}
        {visible.map((repository, index) => (
          <RepositoryCard
            key={repository.id}
            repository={repository}
            workspaces={workspaces.filter((row) => row.repositoryId === repository.id)}
            onUploaded={refresh}
            selected={repository.id === selectedId}
            onSelect={() => selectRepository(repository.id)}
            selectedRef={selectedCardRef}
            isFirst={index === 0}
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
