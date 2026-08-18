'use client';

import { useMemo, useState } from 'react';
import { useTopBarSearch } from '@notis/sdk';
import {
  ArrowClockwiseIcon,
  ArrowSquareOutIcon,
  CircleNotchIcon,
  FolderOpenIcon,
  GitBranchIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';

import { Onboarding } from '@/components/onboarding';
import { SyncButton } from '@/components/sync-button';
import { Field, Mono, StateBadge } from '@/components/status';
import { Button } from '@/components/ui/button';
import { relativeTime, useWorkspacesData } from '@/lib/data';
import type { Repository, Workspace } from '@/lib/types';

function PullRequest({ workspace }: { workspace: Workspace }) {
  if (!workspace.prUrl || !workspace.prNumber) {
    return <StateBadge state={workspace.prState ?? 'None'} />;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StateBadge state={workspace.prState} />
      <a
        href={workspace.prUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-sm text-foreground underline-offset-2 hover:underline"
      >
        #{workspace.prNumber}
        <ArrowSquareOutIcon className="h-3.5 w-3.5 text-muted-foreground" />
      </a>
      {workspace.checks && (
        <span className="text-xs text-muted-foreground">{workspace.checks}</span>
      )}
    </div>
  );
}

function WorkspaceCard({
  workspace,
  repositoryName,
  onSynced,
}: {
  workspace: Workspace;
  repositoryName: string | null;
  onSynced: () => void;
}) {
  const ahead = workspace.ahead ?? 0;
  const dirty = workspace.dirtyFiles ?? 0;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <GitBranchIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <h3 className="truncate text-sm font-semibold">{workspace.name}</h3>
          </div>
          {workspace.task && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{workspace.task}</p>
          )}
        </div>
        <StateBadge state={workspace.status} className="shrink-0" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        <Field label="Branch">
          <Mono value={workspace.branch} />
        </Field>
        <Field label="Base">
          <span className="text-sm text-muted-foreground">{workspace.base ?? 'unknown'}</span>
        </Field>
        <Field label="Changes">
          <span className="text-sm text-muted-foreground">
            {ahead} ahead
            {dirty > 0 ? `, ${dirty} uncommitted` : ''}
          </span>
        </Field>
        <Field label="Pull request">
          <PullRequest workspace={workspace} />
        </Field>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <Mono value={workspace.path} className="min-w-0 flex-1" />
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-xs text-muted-foreground">
            synced {relativeTime(workspace.lastSynced)}
          </span>
          {repositoryName && (
            <SyncButton
              target={{ kind: 'workspace', repo: repositoryName, name: workspace.name }}
              onSynced={onSynced}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default function WorkspacesPage() {
  const { repositories, workspaces, loading, error, refresh, live } = useWorkspacesData();
  const [search, setSearch] = useState('');

  useTopBarSearch({
    value: search,
    onChange: setSearch,
    placeholder: 'Search workspaces by name, branch, or task',
  });

  const byRepository = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const matches = workspaces.filter((workspace) => {
      if (!needle) return true;
      return [workspace.name, workspace.branch, workspace.task, workspace.base]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });

    const lookup = new Map<string, Repository>(repositories.map((row) => [row.id, row]));
    const groups = new Map<string, { repository: Repository | null; rows: Workspace[] }>();
    for (const workspace of matches) {
      const key = workspace.repositoryId ?? '__unlinked__';
      if (!groups.has(key)) {
        groups.set(key, {
          repository: workspace.repositoryId ? lookup.get(workspace.repositoryId) ?? null : null,
          rows: [],
        });
      }
      groups.get(key)!.rows.push(workspace);
    }
    // Active work first; an archived workspace is history.
    for (const group of groups.values()) {
      group.rows.sort((a, b) => {
        const rank = (row: Workspace) => (row.status === 'Archived' ? 1 : 0);
        return rank(a) - rank(b) || a.name.localeCompare(b.name);
      });
    }
    return [...groups.values()];
  }, [repositories, workspaces, search]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
        <CircleNotchIcon className="h-4 w-4 animate-spin" />
        Loading workspaces
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <WarningCircleIcon className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">Could not load workspaces</p>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={refresh}>
          Try again
        </Button>
      </div>
    );
  }

  if (workspaces.length === 0) {
    return (
      <Onboarding hasRepository={repositories.length > 0} hasWorkspace={false} />
    );
  }

  return (
    <div className="px-6 py-5" data-store-screenshot="workspaces">
      <header className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Workspaces</h1>
          <p className="text-sm text-muted-foreground">
            {workspaces.length} workspace{workspaces.length === 1 ? '' : 's'} across{' '}
            {repositories.length} repositor{repositories.length === 1 ? 'y' : 'ies'}
          </p>
        </div>
        {/* The board follows the database on its own where there is a change
            feed, so the reload is offered only where there is not -- a button
            that exists to do what already happened is worse than no button. */}
        {live ? (
          <span className="text-xs text-muted-foreground">Live</span>
        ) : (
          <Button variant="outline" size="sm" onClick={refresh}>
            <ArrowClockwiseIcon className="mr-1.5 h-3.5 w-3.5" />
            Reload
          </Button>
        )}
      </header>

      <div className="space-y-6">
        {byRepository.map((group, index) => (
          <section key={group.repository?.id ?? `unlinked-${index}`}>
            <div className="mb-2 flex items-center gap-2">
              <FolderOpenIcon className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-medium">
                {group.repository?.name ?? 'Not linked to a repository'}
              </h2>
              {group.repository?.defaultBranch && (
                <span className="text-xs text-muted-foreground">
                  default {group.repository.defaultBranch}
                </span>
              )}
            </div>
            <div className="space-y-3">
              {group.rows.map((workspace) => (
                <WorkspaceCard
                  key={workspace.id}
                  workspace={workspace}
                  repositoryName={group.repository?.name ?? null}
                  onSynced={refresh}
                />
              ))}
            </div>
          </section>
        ))}

        {byRepository.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No workspace matches “{search}”.
          </p>
        )}
      </div>
    </div>
  );
}
