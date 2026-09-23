'use client';

/**
 * Projects — the overview when nothing is selected, and a single project's
 * work when the sidebar has one open.
 *
 * The folder tree in the sidebar is portal chrome driven by the route's
 * `collection` config; this page only renders what belongs beside it.
 */

import { useMemo, useState } from 'react';
import { CalendarBlankIcon, PlusIcon } from '@phosphor-icons/react';

import { cn } from '@/lib/utils';
import { useBoard, type Board } from '@/lib/use-board';
import {
  PROJECT_COLORS,
  PROJECT_COLOR_DOT,
  PROJECT_STATUSES,
  PROJECT_STATUS_CLASSES,
  compareTasks,
  formatDueLabel,
  isDone,
  pluralize,
  type Project,
  type ProjectColor,
  type ProjectStatus,
} from '@/lib/tasks';
import { useNotis, ViewSkeleton } from '@notis/sdk';
import {
  Chip,
  DatePicker,
  InlineText,
  InlineTextarea,
  MenuItem,
  Popover,
} from '@/components/inline';
import {
  EmptyState,
  ErrorBanner,
  PageHeader,
  PageShell,
  QuickAdd,
  TaskSection,
} from '@/components/task-list';
import { useTaskSearch } from '@/components/use-task-search';

export default function ProjectsPage() {
  const board = useBoard();
  const { collectionItem } = useNotis();
  const selectedId = collectionItem?.id ?? null;
  const project = selectedId ? board.projectsById.get(selectedId) ?? null : null;

  return selectedId && project ? (
    <ProjectDetail board={board} project={project} />
  ) : (
    <ProjectOverview board={board} pendingId={selectedId} />
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function ProjectOverview({ board, pendingId }: { board: Board; pendingId: string | null }) {
  const [adding, setAdding] = useState(false);

  const stats = useMemo(() => {
    const open = new Map<string, number>();
    const total = new Map<string, number>();
    for (const task of board.tasks) {
      if (!task.projectId) continue;
      total.set(task.projectId, (total.get(task.projectId) ?? 0) + 1);
      if (!isDone(task)) open.set(task.projectId, (open.get(task.projectId) ?? 0) + 1);
    }
    return { open, total };
  }, [board.tasks]);

  // The sidebar can select a project a beat before the query returns it.
  if (pendingId && !board.hasData) {
    return (
      <PageShell>
        <PageHeader
          title="Projects"
          subtitle="Every project and how much of it is left"
          live={board.live}
          onRefresh={board.refresh}
        />
        <ViewSkeleton variant="table" />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="Projects"
        subtitle="Every project and how much of it is left"
        live={board.live}
        onRefresh={board.refresh}
      />

      {board.error ? (
        <ErrorBanner message={board.error} onDismiss={board.dismissError} onRetry={board.refresh} />
      ) : null}

      {!board.hasData ? (
        <ViewSkeleton variant="table" />
      ) : board.projects.length === 0 ? (
        <EmptyState
          title="No projects yet."
          hint="Create one below, or from the plus in the sidebar."
        />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {board.projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              open={stats.open.get(project.id) ?? 0}
              total={stats.total.get(project.id) ?? 0}
            />
          ))}
        </ul>
      )}

      <div className="mt-3">
        {adding ? (
          <InlineText
            value=""
            autoEdit
            ariaLabel="New project name"
            placeholder="Project name"
            className="text-sm"
            onCommit={(title) => {
              void board.createProject({ title, status: 'In Progress' });
              setAdding(false);
            }}
            onEditingChange={(editing) => {
              if (!editing) setAdding(false);
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex w-full items-center gap-2 rounded-md px-1.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            <PlusIcon className="h-4 w-4" />
            Add a project
          </button>
        )}
      </div>
    </PageShell>
  );
}

function ProjectCard({
  project,
  open,
  total,
}: {
  project: Project;
  open: number;
  total: number;
}) {
  const completed = total - open;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

  return (
    <li className="rounded-2xl bg-muted p-4">
      <div className="flex items-center gap-2">
        <span className={cn('size-2.5 shrink-0 rounded-full', PROJECT_COLOR_DOT[project.color])} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {project.title}
        </span>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
            PROJECT_STATUS_CLASSES[project.status],
          )}
        >
          {project.status}
        </span>
      </div>
      {project.description ? (
        <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{project.description}</p>
      ) : null}
      <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full', PROJECT_COLOR_DOT[project.color])}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {total === 0 ? 'No tasks yet' : `${pluralize(open, 'task')} left · ${percent}% done`}
      </p>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

function ProjectDetail({ board, project }: { board: Board; project: Project }) {
  const { query, matches } = useTaskSearch(`Search ${project.title}`);

  const { open, done } = useMemo(() => {
    const mine = board.tasks.filter((task) => task.projectId === project.id && matches(task));
    return {
      open: mine.filter((task) => !isDone(task)).sort(compareTasks),
      done: mine.filter(isDone).sort(compareTasks),
    };
  }, [board.tasks, project.id, matches]);

  const total = open.length + done.length;
  const percent = total === 0 ? 0 : Math.round((done.length / total) * 100);

  function patch(next: Parameters<Board['updateProject']>[1]) {
    void board.updateProject(project.id, next);
  }

  return (
    <PageShell>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <ColorPicker
              value={project.color}
              onChange={(color) => patch({ color })}
              label={project.title}
            />
            <InlineText
              value={project.title}
              ariaLabel={`Project name: ${project.title}`}
              placeholder="Project name"
              onCommit={(title) => patch({ title })}
              className="text-2xl font-semibold tracking-tight"
            />
          </span>
        }
        count={open.length}
        live={board.live}
        onRefresh={board.refresh}
      >
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <StatusPicker value={project.status} onChange={(status) => patch({ status })} />
          <DateChip
            value={project.start}
            label="Start"
            onChange={(start) => patch({ start })}
          />
          <DateChip value={project.due} label="Due" onChange={(due) => patch({ due })} />
          <ParentPicker board={board} project={project} onChange={(parentId) => patch({ parentId })} />
        </div>

        <InlineTextarea
          value={project.description}
          ariaLabel={`Description of ${project.title}`}
          placeholder="Add a description"
          onCommit={(description) => patch({ description })}
          className="mt-1"
        />

        {total > 0 ? (
          <div className="mt-3">
            <div className="h-1 overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full', PROJECT_COLOR_DOT[project.color])}
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {done.length} of {total} done · {percent}%
            </p>
          </div>
        ) : null}
      </PageHeader>

      {board.error ? (
        <ErrorBanner message={board.error} onDismiss={board.dismissError} onRetry={board.refresh} />
      ) : null}

      <TaskSection tasks={open} board={board} showProject={false} loading={!board.hasData}>
        <QuickAdd
          onCreate={(next) => void board.createTask(next)}
          defaults={{ projectId: project.id }}
        />
      </TaskSection>

      {done.length > 0 ? (
        <TaskSection
          title="Completed"
          tasks={done}
          board={board}
          showProject={false}
          collapsible
          defaultCollapsed
        />
      ) : null}

      {board.hasData && total === 0 ? (
        <EmptyState
          title={query ? 'Nothing matches that search.' : 'No tasks in this project yet.'}
          hint={query ? undefined : 'Add the first one above.'}
        />
      ) : null}
    </PageShell>
  );
}

function ColorPicker({
  value,
  onChange,
  label,
}: {
  value: ProjectColor;
  onChange: (color: ProjectColor) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      className="min-w-0"
      trigger={({ toggle }) => (
        <button
          type="button"
          aria-label={`Colour for ${label}`}
          onClick={toggle}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-muted"
        >
          <span className={cn('size-3 rounded-full', PROJECT_COLOR_DOT[value])} />
        </button>
      )}
    >
      <div className="grid grid-cols-4 gap-1 p-1">
        {PROJECT_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={color}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onChange(color);
              setOpen(false);
            }}
            className={cn(
              'inline-flex size-7 items-center justify-center rounded-md transition-colors hover:bg-muted',
              color === value && 'bg-muted',
            )}
          >
            <span className={cn('size-3 rounded-full', PROJECT_COLOR_DOT[color])} />
          </button>
        ))}
      </div>
    </Popover>
  );
}

function StatusPicker({
  value,
  onChange,
}: {
  value: ProjectStatus;
  onChange: (status: ProjectStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={({ toggle }) => (
        <button
          type="button"
          aria-label={`Status: ${value}`}
          onClick={toggle}
          className={cn(
            'rounded-full px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-80',
            PROJECT_STATUS_CLASSES[value],
          )}
        >
          {value}
        </button>
      )}
    >
      {PROJECT_STATUSES.map((status) => (
        <MenuItem
          key={status}
          active={status === value}
          onSelect={() => {
            onChange(status);
            setOpen(false);
          }}
        >
          {status}
        </MenuItem>
      ))}
    </Popover>
  );
}

function DateChip({
  value,
  label,
  onChange,
}: {
  value: string | null;
  label: string;
  onChange: (next: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const formatted = formatDueLabel(value);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      className="min-w-0 p-0"
      trigger={({ toggle }) => (
        <Chip ariaLabel={`${label} date`} onClick={toggle} muted={!formatted}>
          <CalendarBlankIcon className="h-3.5 w-3.5" />
          {formatted ? `${label} ${formatted}` : label}
        </Chip>
      )}
    >
      <DatePicker value={value} onChange={onChange} onClose={() => setOpen(false)} />
    </Popover>
  );
}

/** Sub-projects are what the sidebar tree renders, so the parent is editable here. */
function ParentPicker({
  board,
  project,
  onChange,
}: {
  board: Board;
  project: Project;
  onChange: (parentId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const parent = project.parentId ? board.projectsById.get(project.parentId) ?? null : null;
  const descendants = useMemo(() => collectDescendants(board.projects, project.id), [
    board.projects,
    project.id,
  ]);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={({ toggle }) => (
        <Chip ariaLabel="Parent project" onClick={toggle} muted={!parent}>
          {parent ? `In ${parent.title}` : 'Top level'}
        </Chip>
      )}
    >
      <div className="max-h-[260px] w-[220px] overflow-y-auto">
        <MenuItem
          active={parent === null}
          onSelect={() => {
            onChange(null);
            setOpen(false);
          }}
        >
          Top level
        </MenuItem>
        {board.projects
          .filter((candidate) => candidate.id !== project.id && !descendants.has(candidate.id))
          .map((candidate) => (
            <MenuItem
              key={candidate.id}
              active={candidate.id === project.parentId}
              onSelect={() => {
                onChange(candidate.id);
                setOpen(false);
              }}
            >
              <span className={cn('size-2 shrink-0 rounded-full', PROJECT_COLOR_DOT[candidate.color])} />
              <span className="truncate">{candidate.title}</span>
            </MenuItem>
          ))}
      </div>
    </Popover>
  );
}

/** Guards the parent picker against creating a cycle in the sidebar tree. */
function collectDescendants(projects: Project[], rootId: string): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const project of projects) {
    if (!project.parentId) continue;
    const siblings = childrenByParent.get(project.parentId) ?? [];
    siblings.push(project.id);
    childrenByParent.set(project.parentId, siblings);
  }

  const found = new Set<string>();
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.pop() as string;
    for (const child of childrenByParent.get(current) ?? []) {
      if (found.has(child)) continue;
      found.add(child);
      queue.push(child);
    }
  }
  return found;
}
