'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  Dialog,
  NotisSelectionBoundary,
  useActiveResource,
  useNotis,
  useNotisNavigation,
  useTopBarSearch,
  ViewSkeleton,
} from '@notis/sdk';
import {
  MultiSelectActionBar,
  SelectionCheckbox,
  ShortcutHints,
  useCollectionInteractions,
  type CollectionAction,
  type CollectionInteractionController,
} from '@notis/sdk/interactions';
import {
  ArchiveIcon,
  ArrowClockwiseIcon,
  ArrowSquareOutIcon,
  CheckSquareIcon,
  CircleNotchIcon,
  FolderOpenIcon,
  GitBranchIcon,
} from '@phosphor-icons/react';

import { Onboarding } from '@/components/onboarding';
import { ArchiveButton } from '@/components/archive-button';
import { DevControls } from '@/components/dev-controls';
import { SyncButton } from '@/components/sync-button';
import { Field, Mono, StateBadge } from '@/components/status';
import { Button } from '@/components/ui/button';
import { PageHeading } from '@/components/page-heading';
import {
  runBulkArchive,
  type BulkArchiveFailure,
  type BulkArchiveProgress,
} from '@/lib/bulk-archive';
import { relativeTime, useWorkspacesData } from '@/lib/data';
import { useSandboxShell } from '@/lib/shell';
import { batchArchiver } from '@/lib/archive-batch';
import { useArchiveWriter } from '@/lib/use-archive-writer';
import type { Repository, Workspace } from '@/lib/types';
import { cn } from '@/lib/utils';
import { beginResourceNavigation, findRequestedResource } from '@/lib/resource-deep-links';

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

function formatDiskSize(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

/**
 * Amendment 1: no panel per workspace. Each entry is a flat row, separated
 * from the next by a single hairline -- never a tinted or bordered box.
 * Amendment 2: branch/path/command values are inline mono text, not chips.
 */
function WorkspaceCard({
  workspace,
  repositoryName,
  onSynced,
  resourceSelected,
  selectedRef,
  onArchived,
  collection,
  bulkBusy,
  isFirst,
}: {
  workspace: Workspace;
  repositoryName: string | null;
  onSynced: () => void;
  resourceSelected: boolean;
  selectedRef: RefObject<HTMLDivElement | null>;
  onArchived: () => void;
  collection: CollectionInteractionController<Workspace>;
  bulkBusy: boolean;
  isFirst: boolean;
}) {
  const ahead = workspace.ahead ?? 0;
  const dirty = workspace.dirtyFiles ?? 0;
  const selectedForBulk = collection.isSelected(workspace.id);
  const active = collection.activeId === workspace.id;

  return (
    <div
      {...collection.getItemProps(workspace.id)}
      ref={resourceSelected ? selectedRef : undefined}
      role="option"
      aria-current={resourceSelected ? 'true' : undefined}
      className={cn(
        'py-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        !isFirst && 'border-t border-border',
        (selectedForBulk || resourceSelected) && 'bg-primary/[0.06]',
        !selectedForBulk && !resourceSelected && active && 'bg-muted/60',
      )}
    >
    <NotisSelectionBoundary
      resource={{
        id: workspace.id,
        kind: 'coding-workspace',
        label: workspace.name,
        attributes: { branch: workspace.branch, status: workspace.status, repository: repositoryName },
      }}
      className="block px-2"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SelectionCheckbox
              {...collection.getCheckboxProps(workspace.id)}
              ariaLabel={`${selectedForBulk ? 'Deselect' : 'Select'} ${workspace.name}`}
              alwaysVisible
            />
            <GitBranchIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <h3 className="truncate text-sm font-semibold">{workspace.name}</h3>
            <StateBadge state={workspace.status} />
          </div>
          {workspace.task && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{workspace.task}</p>
          )}

          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
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

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <Mono value={workspace.path} className="min-w-0 text-xs" />
            {workspace.diskMb != null && workspace.diskMb > 0 && (
              <span title="Worktree size on the cloud computer">{formatDiskSize(workspace.diskMb)}</span>
            )}
            <span>synced {relativeTime(workspace.lastSynced)}</span>
          </div>
        </div>

        <div
            className="flex flex-wrap items-center justify-end gap-2 sm:shrink-0"
            onClick={(event) => event.stopPropagation()}
          >
            {repositoryName && !workspace.demo && <>
            <DevControls repo={repositoryName} name={workspace.name} />
            <SyncButton
              target={{ kind: 'workspace', repo: repositoryName, name: workspace.name }}
              onSynced={onSynced}
            />
            </>}
            <ArchiveButton
              workspace={workspace}
              repositoryName={repositoryName}
              onArchived={onArchived}
              disabled={bulkBusy || workspace.demo}
            />
          </div>
      </div>
    </NotisSelectionBoundary>
    </div>
  );
}

export default function WorkspacesPage() {
  const { resourceId } = useNotis();
  const navigation = useNotisNavigation();
  const { run } = useSandboxShell();
  const writeArchive = useArchiveWriter();
  const { repositories, workspaces, hasData, error, refresh, live } = useWorkspacesData();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [unavailableResourceId, setUnavailableResourceId] = useState<string | null>(null);
  const [archivedIds, setArchivedIds] = useState<Set<string>>(() => new Set());
  const [bulkRequest, setBulkRequest] = useState<Workspace[] | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkCancelling, setBulkCancelling] = useState(false);
  const bulkController = useRef<AbortController | null>(null);
  const [bulkProgress, setBulkProgress] = useState<BulkArchiveProgress | null>(null);
  const [bulkErrors, setBulkErrors] = useState<BulkArchiveFailure[]>([]);
  const selectedCardRef = useRef<HTMLDivElement>(null);
  const pendingResourceIdRef = useRef<string | null | undefined>(undefined);

  const activeWorkspaces = useMemo(
    () => workspaces.filter((workspace) => workspace.status !== 'Archived' && !archivedIds.has(workspace.id)),
    [archivedIds, workspaces],
  );

  const selectWorkspace = useCallback((workspaceId: string | null) => {
    setSelectedId(workspaceId);
    const transition = beginResourceNavigation(
      resourceId,
      pendingResourceIdRef.current,
      workspaceId,
    );
    pendingResourceIdRef.current = transition.pendingResourceId;
    if (transition.shouldNavigate) navigation.toRoute('/', { resourceId: workspaceId });
  }, [navigation, resourceId]);

  const handleArchived = useCallback((workspaceId: string) => {
    // The archive script has already marked the database row as Archived when
    // this callback runs. Hide only that successful row locally so archiving
    // several workspaces remains uninterrupted. The database subscription
    // reconciles the authoritative rows in the background; an explicit
    // refresh here would put the whole page back into its loading state.
    setArchivedIds((current) => {
      const next = new Set(current);
      next.add(workspaceId);
      return next;
    });
    setBulkErrors((current) => current.filter((failure) => failure.id !== workspaceId));
    if (selectedId === workspaceId) selectWorkspace(null);
  }, [selectWorkspace, selectedId]);

  useTopBarSearch({
    value: search,
    onChange: setSearch,
    placeholder: 'Search workspaces by name, branch, or task',
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
    const requested = findRequestedResource(resourceId, activeWorkspaces, (row) => row.id);
    if (requested) {
      setSearch('');
      setSelectedId(requested.id);
      setFocusedId(requested.id);
      setUnavailableResourceId(null);
    } else {
      setSelectedId(null);
      setUnavailableResourceId(resourceId);
    }
  }, [activeWorkspaces, hasData, resourceId]);

  useEffect(() => {
    if (!resourceId || selectedId !== resourceId) return;
    selectedCardRef.current?.focus({ preventScroll: true });
    selectedCardRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [resourceId, selectedId]);

  const selectedWorkspace = activeWorkspaces.find((row) => row.id === selectedId) ?? null;
  const selectedRepository = selectedWorkspace
    ? repositories.find((row) => row.id === selectedWorkspace.repositoryId) ?? null
    : null;
  useActiveResource(selectedWorkspace ? {
    id: selectedWorkspace.id,
    kind: 'coding-workspace',
    label: selectedWorkspace.name,
    url: selectedWorkspace.prUrl,
    attributes: {
      branch: selectedWorkspace.branch,
      status: selectedWorkspace.status,
      repository: selectedRepository?.name ?? null,
    },
  } : null);

  const byRepository = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const matches = activeWorkspaces.filter((workspace) => {
      if (workspace.id === selectedId) return true;
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
    for (const group of groups.values()) {
      group.rows.sort((a, b) => a.name.localeCompare(b.name));
    }
    return [...groups.values()];
  }, [activeWorkspaces, repositories, selectedId, search]);

  const orderedWorkspaces = useMemo(
    () => byRepository.flatMap((group) => group.rows),
    [byRepository],
  );
  const bulkArchiveAction = useMemo<CollectionAction<Workspace>>(() => ({
    id: 'archive-workspaces',
    intent: 'archive',
    label: 'Archive',
    icon: <ArchiveIcon className="h-3.5 w-3.5" />,
    destructive: true,
    pending: bulkBusy,
    disabled: bulkBusy,
    onRun: ({ selectedItems }) => {
      if (bulkBusy || selectedItems.length === 0) return;
      if (selectedItems.some(item => item.demo)) { setBulkErrors(selectedItems.filter(item => item.demo).map(item => ({id:item.id,name:item.name,message:'Demo workspaces are read-only.'}))); return; }
      setBulkErrors([]);
      setBulkProgress(null);
      setBulkRequest(selectedItems);
    },
  }), [bulkBusy]);
  const collection = useCollectionInteractions({
    items: orderedWorkspaces,
    getId: (workspace: Workspace) => workspace.id,
    activeId: focusedId,
    onActiveIdChange: setFocusedId,
    onActivate: (workspace) => selectWorkspace(workspace.id),
    enabled: !bulkBusy,
    enableDragSelect: false,
    actions: [bulkArchiveAction],
  });

  const cancelBulkArchive = useCallback(() => {
    if (!bulkBusy) {
      setBulkRequest(null);
      return;
    }
    // The wait is what is cancelled, not the cleanup already running on the
    // cloud computer: nothing here retries or rolls back a removal that may
    // have happened.
    setBulkCancelling(true);
    bulkController.current?.abort();
  }, [bulkBusy]);

  const confirmBulkArchive = useCallback(async () => {
    if (bulkBusy || !bulkRequest?.length) return;
    const controller = new AbortController();
    bulkController.current = controller;
    const repositoryNames = new Map(repositories.map((repository) => [repository.id, repository.name]));

    setBulkBusy(true);
    setBulkCancelling(false);
    setBulkErrors([]);
    setBulkProgress({ completed: 0, total: bulkRequest.length, archived: 0, failed: 0 });

    const targets = bulkRequest.map((workspace) => ({
          id: workspace.id,
          name: workspace.name,
          repositoryName: workspace.repositoryId
            ? repositoryNames.get(workspace.repositoryId) ?? null
            : null,
          repositoryId: workspace.repositoryId,
          path: workspace.path,
        }));
    try {
      await runBulkArchive({
        targets,
        archive: batchArchiver(run, targets, writeArchive),
        signal: controller.signal,
        onArchived: handleArchived,
        onProgress: setBulkProgress,
        onFailures: setBulkErrors,
      });
    } finally {
      if (bulkController.current === controller) bulkController.current = null;
      setBulkBusy(false);
      setBulkCancelling(false);
      setBulkRequest(null);
    }
  }, [bulkBusy, bulkRequest, handleArchived, repositories, run, writeArchive]);

  const allVisibleSelected = orderedWorkspaces.length > 0
    && orderedWorkspaces.every((workspace) => collection.isSelected(workspace.id));

  if (!hasData) {
    return (
      <div className="px-6 py-5" data-store-screenshot="workspaces">
        <PageHeading title="Workspaces" />
        {error ? (
          <div role="alert" className="mt-6 rounded-xl bg-destructive/10 px-4 py-3 text-sm">
            <p className="font-medium text-destructive">Could not load workspaces</p>
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

  if (workspaces.length === 0) {
    return (
      <Onboarding hasRepository={repositories.length > 0} hasWorkspace={false} />
    );
  }

  return (
    <div className="px-6 py-5" data-store-screenshot="workspaces">
      <PageHeading
        title="Workspaces"
        description={`${activeWorkspaces.length} active workspace${activeWorkspaces.length === 1 ? '' : 's'} across ${repositories.length} repositor${repositories.length === 1 ? 'y' : 'ies'}`}
        actions={
          // The board follows the database on its own where there is a change
          // feed, so the reload is offered only where there is not -- a button
          // that exists to do what already happened is worse than no button.
          <>
            <Button
              variant="secondary"
              size="sm"
              disabled={bulkBusy || orderedWorkspaces.length === 0}
              onClick={allVisibleSelected ? collection.clear : collection.selectAll}
            >
              <CheckSquareIcon className="mr-1.5 h-3.5 w-3.5" />
              {allVisibleSelected ? 'Clear selection' : `Select all (${orderedWorkspaces.length})`}
            </Button>
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
          <p className="font-medium text-destructive">Could not refresh workspaces.</p>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={refresh}>
            Retry
          </Button>
        </div>
      ) : null}

      <ShortcutHints
        className="mt-4"
        shortcuts={[
          { id: 'navigate', keys: 'J', label: 'Next · K previous' },
          { id: 'toggle', keys: 'X', label: 'Select' },
          { id: 'range', keys: 'Shift+ArrowDown', label: 'Select range' },
          { id: 'all', keys: 'Mod+A', label: 'Select all' },
          { id: 'open', keys: 'Enter', label: 'Open' },
        ]}
      />

      {bulkErrors.length > 0 ? (
        <div role="alert" className="mt-5 rounded-xl bg-destructive/10 px-4 py-3 text-sm">
          <p className="font-medium text-destructive">
            {bulkErrors.length} workspace{bulkErrors.length === 1 ? '' : 's'} could not be archived.
          </p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {bulkErrors.map((failure) => (
              <li key={failure.id}><span className="font-medium text-foreground">{failure.name}:</span> {failure.message}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">Failed rows remain visible and selected so you can retry them.</p>
        </div>
      ) : null}

      <div
        {...collection.getContainerProps()}
        role="listbox"
        aria-label="Active workspaces"
        aria-multiselectable="true"
        className="mt-6 space-y-6"
      >
        {unavailableResourceId ? (
          <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
            This workspace is no longer available. Showing all workspaces instead.
          </p>
        ) : null}
        {byRepository.map((group, index) => (
          <section key={group.repository?.id ?? `unlinked-${index}`}>
            <div className="mb-1 flex items-center gap-2">
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
            <div>
              {group.rows.map((workspace, rowIndex) => (
                <WorkspaceCard
                  key={workspace.id}
                  workspace={workspace}
                  repositoryName={group.repository?.name ?? null}
                  onSynced={refresh}
                  resourceSelected={workspace.id === selectedId}
                  selectedRef={selectedCardRef}
                  onArchived={() => handleArchived(workspace.id)}
                  collection={collection}
                  bulkBusy={bulkBusy}
                  isFirst={rowIndex === 0}
                />
              ))}
            </div>
          </section>
        ))}

        {byRepository.length === 0 && search && (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No workspace matches “{search}”.
          </p>
        )}
        {byRepository.length === 0 && !search && (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No active workspaces. Archived records remain available in the Workspaces database.
          </p>
        )}
      </div>

      {!bulkRequest ? (
        <MultiSelectActionBar
          {...collection.getActionBarProps()}
          itemLabel={{ singular: 'workspace', plural: 'workspaces' }}
          />
      ) : null}

      {bulkRequest ? (
        <Dialog
          open
          onClose={cancelBulkArchive}
          role="alertdialog"
          title={`Archive ${bulkRequest.length} workspace${bulkRequest.length === 1 ? '' : 's'}?`}
          description="Local checkouts will be removed. Branches and archived records will remain available."
        >
          {bulkBusy ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Removing checkouts, then saving archive records. This can take a minute. Cancel stops waiting; cleanup already started may finish.
            </p>
          ) : null}
          {bulkProgress ? (
            <p role="status" className="mt-2 text-sm text-muted-foreground">
              Archived {bulkProgress.archived} of {bulkProgress.total}
              {bulkProgress.failed > 0 ? (
                <span className="text-destructive">
                  {' \u00b7 '}
                  {bulkProgress.failed} failed
                </span>
              ) : null}
            </p>
          ) : null}
          <div className="mt-5 flex justify-end gap-2">
            <Button
              autoFocus
              variant="secondary"
              disabled={bulkCancelling}
              onClick={cancelBulkArchive}
            >
              {bulkCancelling ? 'Cancelling' : 'Cancel'}
            </Button>
            <Button
              variant="destructive"
              disabled={bulkBusy}
              onClick={() => void confirmBulkArchive()}
            >
              {bulkBusy ? <CircleNotchIcon className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ArchiveIcon className="mr-1.5 h-3.5 w-3.5" />}
              {bulkCancelling ? 'Cancelling' : bulkBusy ? 'Archiving' : 'Archive selected'}
            </Button>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
