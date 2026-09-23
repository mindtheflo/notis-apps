'use client';

/**
 * One task, editable where it sits.
 *
 * The collapsed row carries the fields that are worth scanning — title, due
 * date, project, labels — and each one is its own inline control. Expanding
 * the row adds description, status, location and recurrence without navigating
 * anywhere.
 */

import { useEffect, useRef, useState } from 'react';
import { useNotis, useNotisNavigation } from '@notis/sdk';
import {
  CalendarBlankIcon,
  CaretRightIcon,
  FlagIcon,
  HashIcon,
  LinkSimpleIcon,
  MapPinIcon,
  RepeatIcon,
  TrashIcon,
} from '@phosphor-icons/react';

import { cn } from '@/lib/utils';
import {
  DONE_STATUS,
  PRIORITIES,
  PRIORITY_CLASSES,
  PRIORITY_LABELS,
  PROJECT_COLOR_DOT,
  TASK_STATUSES,
  formatDueLabel,
  isDone,
  isOverdue,
  type Priority,
  type Project,
  type Task,
} from '@/lib/tasks';
import type { TaskPatch } from '@/lib/use-board';
import {
  Chip,
  DatePicker,
  InlineText,
  InlineTextarea,
  LabelPicker,
  MenuItem,
  Popover,
} from '@/components/inline';

const LOCATIONS = ['Work', 'Home'] as const;
const RECURRENCES = ['daily', 'weekly', 'monthly'] as const;

function PriorityCheckbox({
  task,
  onToggle,
}: {
  task: Task;
  onToggle: () => void;
}) {
  const done = isDone(task);
  const tint = PRIORITY_CLASSES[task.priority];
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
      onClick={onToggle}
      className={cn(
        // notis-design-allow: no-border-box priority checkbox needs a visible unchecked ring
        'group/check mt-0.5 inline-flex size-[18px] shrink-0 items-center justify-center rounded-full border transition-colors',
        done ? 'border-transparent bg-muted-foreground/40' : cn(tint.ring, tint.fill),
      )}
    >
      <svg
        viewBox="0 0 10 10"
        aria-hidden="true"
        className={cn(
          'h-2.5 w-2.5 transition-opacity',
          done ? 'opacity-100 text-background' : cn('opacity-0 group-hover/check:opacity-60', tint.text),
        )}
      >
        <path
          d="M1 5.2 3.7 8 9 2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

function PriorityMenu({ value, onChange }: { value: Priority; onChange: (next: Priority) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={({ toggle }) => (
        <Chip ariaLabel={`Priority: ${PRIORITY_LABELS[value]}`} onClick={toggle} muted>
          <FlagIcon
            weight={value === 'P4' ? 'regular' : 'fill'}
            className={cn('h-3.5 w-3.5', PRIORITY_CLASSES[value].text)}
          />
          {value !== 'P4' ? <span className={PRIORITY_CLASSES[value].text}>{value}</span> : null}
        </Chip>
      )}
    >
      {PRIORITIES.map((priority) => (
        <MenuItem
          key={priority}
          active={priority === value}
          onSelect={() => {
            onChange(priority);
            setOpen(false);
          }}
        >
          <FlagIcon
            weight={priority === 'P4' ? 'regular' : 'fill'}
            className={cn('h-3.5 w-3.5', PRIORITY_CLASSES[priority].text)}
          />
          {PRIORITY_LABELS[priority]}
        </MenuItem>
      ))}
    </Popover>
  );
}

function DueChip({
  value,
  overdue,
  onChange,
}: {
  value: string | null;
  overdue: boolean;
  onChange: (next: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = formatDueLabel(value);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      className="min-w-0 p-0"
      trigger={({ toggle }) => (
        <Chip
          ariaLabel={label ? `Due ${label}` : 'Set a due date'}
          onClick={toggle}
          muted={!label}
          className={cn(overdue && 'text-destructive hover:text-destructive')}
        >
          <CalendarBlankIcon className="h-3.5 w-3.5" />
          {label ?? 'Date'}
        </Chip>
      )}
    >
      <DatePicker value={value} onChange={onChange} onClose={() => setOpen(false)} />
    </Popover>
  );
}

function ProjectChip({
  project,
  projects,
  onChange,
}: {
  project: Project | null;
  projects: Project[];
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      trigger={({ toggle }) => (
        <Chip
          ariaLabel={project ? `Project: ${project.title}` : 'Assign a project'}
          onClick={toggle}
          muted
        >
          <span
            className={cn(
              'size-2 shrink-0 rounded-full',
              project ? PROJECT_COLOR_DOT[project.color] : 'bg-muted-foreground/40',
            )}
          />
          <span className="truncate">{project?.title ?? 'Inbox'}</span>
        </Chip>
      )}
    >
      <div className="max-h-[280px] w-[220px] overflow-y-auto">
        <MenuItem
          active={project === null}
          onSelect={() => {
            onChange(null);
            setOpen(false);
          }}
        >
          <span className="size-2 shrink-0 rounded-full bg-muted-foreground/40" />
          Inbox
        </MenuItem>
        {projects.map((candidate) => (
          <MenuItem
            key={candidate.id}
            active={candidate.id === project?.id}
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

function LabelsChip({
  labels,
  allLabels,
  onChange,
}: {
  labels: string[];
  allLabels: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      className="min-w-0 p-0"
      trigger={({ toggle }) => (
        <Chip
          ariaLabel={labels.length ? `Labels: ${labels.join(', ')}` : 'Add labels'}
          onClick={toggle}
          muted
        >
          <HashIcon className="h-3.5 w-3.5" />
          <span className="truncate">{labels.length ? labels.join(', ') : 'Label'}</span>
        </Chip>
      )}
    >
      <LabelPicker selected={labels} options={allLabels} onChange={onChange} />
    </Popover>
  );
}

function OptionChip({
  value,
  options,
  placeholder,
  icon,
  onChange,
}: {
  value: string | null;
  options: readonly string[];
  placeholder: string;
  icon: React.ReactNode;
  onChange: (next: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={({ toggle }) => (
        <Chip ariaLabel={value ? `${placeholder}: ${value}` : `Set ${placeholder}`} onClick={toggle} muted>
          {icon}
          <span className="truncate capitalize">{value ?? placeholder}</span>
        </Chip>
      )}
    >
      <MenuItem
        active={value === null}
        onSelect={() => {
          onChange(null);
          setOpen(false);
        }}
      >
        None
      </MenuItem>
      {options.map((option) => (
        <MenuItem
          key={option}
          active={option === value}
          onSelect={() => {
            onChange(option);
            setOpen(false);
          }}
        >
          <span className="capitalize">{option}</span>
        </MenuItem>
      ))}
    </Popover>
  );
}

export function TaskRow({
  task,
  project,
  projects,
  allLabels,
  showProject = true,
  onPatch,
  onDelete,
}: {
  task: Task;
  project: Project | null;
  projects: Project[];
  allLabels: string[];
  showProject?: boolean;
  onPatch: (patch: TaskPatch) => void;
  onDelete: () => void;
}) {
  const { resourceId, route } = useNotis();
  const navigation = useNotisNavigation();
  const [expanded, setExpanded] = useState(false);
  const done = isDone(task);
  const overdue = isOverdue(task);
  const focused = resourceId === task.id;
  const rowRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (!focused) return;
    setExpanded(true);
    const frame = window.requestAnimationFrame(() => {
      rowRef.current?.focus({ preventScroll: true });
      rowRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focused]);

  function toggleExpanded() {
    const next = !expanded;
    setExpanded(next);
    const path = route?.path ?? '/';
    if (path === '/projects') return;
    if (next) navigation.toRoute(path, { resourceId: task.id });
    else if (focused) navigation.toRoute(path, { resourceId: null });
  }

  return (
    <li
      ref={rowRef}
      tabIndex={focused ? -1 : undefined}
      aria-current={focused ? 'true' : undefined}
      className={cn('group/row list-row', focused && 'list-row-selected')}
    >
      <div className="flex items-start gap-2">
        <PriorityCheckbox
          task={task}
          onToggle={() => onPatch({ status: done ? 'Backlog' : DONE_STATUS })}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1">
            <InlineText
              value={task.title}
              ariaLabel={`Task name: ${task.title}`}
              placeholder="Task name"
              onCommit={(title) => onPatch({ title })}
              className="text-sm leading-5"
              readClassName={cn(done && 'text-muted-foreground line-through')}
            />
            <button
              type="button"
              aria-label={expanded ? 'Hide task details' : 'Show task details'}
              aria-expanded={expanded}
              onClick={toggleExpanded}
              className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100 aria-expanded:opacity-100"
            >
              <CaretRightIcon
                className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-90')}
              />
            </button>
            <button
              type="button"
              aria-label={`Delete ${task.title}`}
              onClick={onDelete}
              className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-destructive focus-visible:opacity-100 group-hover/row:opacity-100"
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </button>
          </div>

          {!expanded && task.description ? (
            <p className="truncate px-1.5 text-xs text-muted-foreground">{task.description}</p>
          ) : null}

          <div className="mt-0.5 flex flex-wrap items-center gap-0.5">
            <DueChip value={task.due} overdue={overdue} onChange={(due) => onPatch({ due })} />
            <PriorityMenu value={task.priority} onChange={(priority) => onPatch({ priority })} />
            <LabelsChip
              labels={task.labels}
              allLabels={allLabels}
              onChange={(labels) => onPatch({ labels })}
            />
            {showProject ? (
              <ProjectChip
                project={project}
                projects={projects}
                onChange={(projectId) => onPatch({ projectId })}
              />
            ) : null}
            {!expanded && task.recurring ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs capitalize text-muted-foreground">
                <RepeatIcon className="h-3.5 w-3.5" />
                {task.recurring}
              </span>
            ) : null}
          </div>

          {expanded ? (
            <div className="mb-1 mt-2 space-y-2 rounded-xl bg-background p-3">
              <InlineTextarea
                value={task.description}
                ariaLabel={`Description of ${task.title}`}
                onCommit={(description) => onPatch({ description })}
              />
              <div className="flex flex-wrap items-center gap-1">
                <OptionChip
                  value={task.status}
                  options={TASK_STATUSES}
                  placeholder="Status"
                  icon={<span className="size-2 rounded-full bg-muted-foreground/50" />}
                  onChange={(status) => onPatch({ status: (status ?? 'Backlog') as Task['status'] })}
                />
                <OptionChip
                  value={task.location}
                  options={LOCATIONS}
                  placeholder="Location"
                  icon={<MapPinIcon className="h-3.5 w-3.5" />}
                  onChange={(location) => onPatch({ location })}
                />
                <OptionChip
                  value={task.recurring}
                  options={RECURRENCES}
                  placeholder="Repeat"
                  icon={<RepeatIcon className="h-3.5 w-3.5" />}
                  onChange={(recurring) => onPatch({ recurring })}
                />
              </div>
              <div className="flex items-center gap-1.5 px-0.5">
                <LinkSimpleIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <InlineText
                  value={task.link ?? ''}
                  ariaLabel={`Link for ${task.title}`}
                  placeholder="Add a link"
                  allowEmpty
                  onCommit={(link) => onPatch({ link: link || null })}
                  className="text-xs"
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}
