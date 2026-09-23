'use client';

/**
 * Page shell, task sections, and the quick-add row.
 *
 * Every view in the app is a header plus one or more sections of rows, so the
 * shared parts live here and each page decides only what goes in which section.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useActiveResource, useNotis, ViewSkeleton } from '@notis/sdk';
import {
  ArrowClockwiseIcon,
  CaretRightIcon,
  PlusIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';

import { cn } from '@/lib/utils';
import { pluralize, type Task } from '@/lib/tasks';
import type { Board, TaskPatch } from '@/lib/use-board';
import { TaskRow } from '@/components/task-row';
import { DismissButton } from '@/components/inline';

export function useLinkedTask(board: Board) {
  const { resourceId } = useNotis();
  const task = resourceId ? board.tasksById.get(resourceId) ?? null : null;
  const resource = useMemo(
    () =>
      task
        ? {
            id: task.id,
            kind: 'task',
            label: task.title,
            url: task.link,
            attributes: {
              status: task.status,
              priority: task.priority,
              due: task.due,
              project_id: task.projectId,
            },
            snapshot: task.description
              ? { format: 'text' as const, content: task.description }
              : null,
          }
        : null,
    [task],
  );
  useActiveResource(resource);
  return {
    resourceId,
    task,
    missing: Boolean(resourceId && !board.loading && !board.tasksError && !task),
  };
}

export function MissingTaskNotice() {
  return (
    <div className="mb-3 rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
      This task is no longer available. Showing this view instead.
    </div>
  );
}

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="notis-app-shell">
      <div className="notis-app-surface mx-auto w-full max-w-3xl px-6 py-6">{children}</div>
    </div>
  );
}

// Mirrors the portal's PortalPageHeader: plain title, one-line description,
// actions on the right. No eyebrow, no rule underneath.
export function PageHeader({
  title,
  subtitle,
  count,
  live,
  onRefresh,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  count?: number;
  live?: boolean;
  onRefresh?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          {subtitle ? <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          {typeof count === 'number' ? (
            <span className="text-xs text-muted-foreground">{pluralize(count, 'task')}</span>
          ) : null}
          {onRefresh && !live ? (
            <button
              type="button"
              aria-label="Refresh"
              onClick={onRefresh}
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowClockwiseIcon className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
      {children}
    </header>
  );
}

export function ErrorBanner({
  message,
  onDismiss,
  onRetry,
}: {
  message: string;
  onDismiss: () => void;
  onRetry?: () => void;
}) {
  return (
    <div className="mb-3 flex items-start gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <WarningCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">{message}</span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium underline-offset-2 hover:underline"
        >
          Retry
        </button>
      ) : null}
      <DismissButton onClick={onDismiss} label="Dismiss error" />
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="py-12 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * The one-line composer. Enter adds the task and keeps the field open, so a
 * capture session never needs a second click.
 */
export function QuickAdd({
  onCreate,
  placeholder = 'Add a task',
  defaults,
}: {
  onCreate: (patch: TaskPatch & { title: string }) => void;
  placeholder?: string;
  defaults?: TaskPatch;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function submit() {
    const title = draft.trim();
    if (!title) return;
    onCreate({ ...defaults, title });
    setDraft('');
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 flex w-full items-center gap-2 rounded-md px-1.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
      >
        <PlusIcon className="h-4 w-4" />
        {placeholder}
      </button>
    );
  }

  return (
    <div className="mt-1 flex items-center gap-2 rounded-md bg-muted px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
      <PlusIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <input
        ref={inputRef}
        aria-label={placeholder}
        value={draft}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          submit();
          setOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            submit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            setDraft('');
            setOpen(false);
          }
        }}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
      />
    </div>
  );
}

export function TaskSection({
  title,
  tasks,
  board,
  showProject = true,
  tone = 'default',
  collapsible = false,
  defaultCollapsed = false,
  emptyLabel,
  loading = false,
  children,
}: {
  title?: string;
  tasks: Task[];
  board: Board;
  showProject?: boolean;
  tone?: 'default' | 'danger';
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  emptyLabel?: string;
  /** First read for this section has not returned yet — show row-shaped placeholders. */
  loading?: boolean;
  children?: React.ReactNode;
}) {
  const { resourceId } = useNotis();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const allLabels = collectLabels(board.tasks);
  const showRows = !collapsible || !collapsed;

  useEffect(() => {
    if (resourceId && tasks.some((task) => task.id === resourceId)) {
      setCollapsed(false);
    }
  }, [resourceId, tasks]);

  return (
    <section className="mb-5">
      {title ? (
        <div className="mb-1 flex items-center gap-1">
          {collapsible ? (
            <button
              type="button"
              aria-expanded={!collapsed}
              onClick={() => setCollapsed((value) => !value)}
              className="inline-flex size-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <CaretRightIcon
                className={cn('h-3.5 w-3.5 transition-transform', !collapsed && 'rotate-90')}
              />
            </button>
          ) : null}
          <h2
            className={cn(
              'text-sm font-semibold',
              tone === 'danger' ? 'text-destructive' : 'text-foreground',
            )}
          >
            {title}
          </h2>
          <span className="ml-1 text-xs text-muted-foreground">{tasks.length}</span>
        </div>
      ) : null}

      {showRows ? (
        <>
          {loading ? (
            <ViewSkeleton variant="table" rows={3} />
          ) : tasks.length > 0 ? (
            <ul className="space-y-1">
              {tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  project={task.projectId ? board.projectsById.get(task.projectId) ?? null : null}
                  projects={board.projects}
                  allLabels={allLabels}
                  showProject={showProject}
                  onPatch={(patch) => void board.updateTask(task.id, patch)}
                  onDelete={() => void board.archiveTask(task.id)}
                />
              ))}
            </ul>
          ) : emptyLabel ? (
            <p className="px-1.5 py-3 text-sm text-muted-foreground">{emptyLabel}</p>
          ) : null}
          {children}
        </>
      ) : null}
    </section>
  );
}

/** Every label in use, so the picker suggests what already exists. */
export function collectLabels(tasks: Task[]): string[] {
  const labels = new Set<string>();
  for (const task of tasks) {
    for (const label of task.labels) labels.add(label);
  }
  return [...labels].sort((a, b) => a.localeCompare(b));
}
