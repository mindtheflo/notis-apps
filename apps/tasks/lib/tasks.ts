/**
 * Shared task/project vocabulary for the Tasks app.
 *
 * Everything the UI needs to read a row lives here so the pages stay about
 * layout and the rows stay about editing.
 */

import type { DocumentRecord } from '@notis/sdk';

export const TASK_DATABASE_SLUG = 'tasks';
export const PROJECT_DATABASE_SLUG = 'projects';

export const DEFAULT_TASK_TITLE = 'Untitled task';
export const DEFAULT_PROJECT_TITLE = 'Untitled project';

// --- Task status ------------------------------------------------------------

export const TASK_STATUSES = ['Backlog', 'In progress', 'Ready for review', 'Done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const DONE_STATUS: TaskStatus = 'Done';

// --- Priority ---------------------------------------------------------------

export const PRIORITIES = ['P1', 'P2', 'P3', 'P4'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABELS: Record<Priority, string> = {
  P1: 'Priority 1',
  P2: 'Priority 2',
  P3: 'Priority 3',
  P4: 'Priority 4',
};

/**
 * Priority tints. The checkbox ring and the flag share one colour per level so
 * a glance down the list reads as a single signal.
 */
export const PRIORITY_CLASSES: Record<Priority, { text: string; ring: string; fill: string }> = {
  // Urgent/high sit on the destructive token, medium on primary, low/none flat.
  P1: { text: 'text-destructive', ring: 'border-destructive', fill: 'bg-destructive/10' },
  P2: { text: 'text-destructive', ring: 'border-destructive', fill: 'bg-destructive/10' },
  P3: { text: 'text-primary', ring: 'border-primary', fill: 'bg-primary/10' },
  P4: { text: 'text-foreground', ring: 'border-foreground/30', fill: 'bg-foreground/[0.07]' },
};

export const DEFAULT_PRIORITY: Priority = 'P4';

export function asPriority(value: unknown): Priority {
  return typeof value === 'string' && (PRIORITIES as readonly string[]).includes(value)
    ? (value as Priority)
    : DEFAULT_PRIORITY;
}

/** P1 sorts first. */
export function priorityRank(priority: Priority): number {
  return PRIORITIES.indexOf(priority);
}

// --- Project status ---------------------------------------------------------

export const PROJECT_STATUSES = [
  'Inbox',
  'Planned',
  'In Progress',
  'On Hold',
  'Completed',
  'Cancelled',
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_CLASSES: Record<ProjectStatus, string> = {
  // Active work reads on the primary token; paused/done/archived fall back to muted.
  Inbox: 'bg-muted text-muted-foreground',
  Planned: 'text-primary',
  'In Progress': 'text-primary',
  'On Hold': 'text-muted-foreground',
  Completed: 'text-muted-foreground',
  Cancelled: 'text-muted-foreground line-through',
};

export const PROJECT_COLORS = [
  'rose',
  'amber',
  'emerald',
  'sky',
  'violet',
  'fuchsia',
  'teal',
  'slate',
] as const;
export type ProjectColor = (typeof PROJECT_COLORS)[number];

export const PROJECT_COLOR_DOT: Record<ProjectColor, string> = {
  rose: 'bg-rose-500',
  amber: 'bg-amber-500',
  emerald: 'bg-emerald-500',
  sky: 'bg-sky-500',
  violet: 'bg-violet-500',
  fuchsia: 'bg-fuchsia-500',
  teal: 'bg-teal-500',
  slate: 'bg-slate-400',
};

/** Stable colour for a project that has never been given one. */
export function fallbackProjectColor(id: string): ProjectColor {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return PROJECT_COLORS[hash % PROJECT_COLORS.length];
}

export function asProjectColor(value: unknown, id: string): ProjectColor {
  return typeof value === 'string' && (PROJECT_COLORS as readonly string[]).includes(value)
    ? (value as ProjectColor)
    : fallbackProjectColor(id);
}

// --- Row shapes -------------------------------------------------------------

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  due: string | null;
  labels: string[];
  projectId: string | null;
  description: string;
  location: string | null;
  recurring: string | null;
  completedAt: string | null;
  order: number | null;
  link: string | null;
  createdAt: string | null;
}

export interface Project {
  id: string;
  title: string;
  status: ProjectStatus;
  description: string;
  parentId: string | null;
  color: ProjectColor;
  start: string | null;
  due: string | null;
  order: number | null;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readDate(value: unknown): string | null {
  const text = readString(value).trim();
  if (!text) return null;
  // Notis returns the start of a date property; keep the calendar day only.
  return text.slice(0, 10);
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function readFirstRelation(value: unknown): string | null {
  const ids = readStringArray(value);
  return ids.length > 0 ? ids[0] : null;
}

export function toTask(document: DocumentRecord): Task {
  const properties = document.properties ?? {};
  const status = readString(properties.Status);
  return {
    id: document.id,
    title: document.title?.trim() || DEFAULT_TASK_TITLE,
    status: (TASK_STATUSES as readonly string[]).includes(status)
      ? (status as TaskStatus)
      : 'Backlog',
    priority: asPriority(properties.Priority),
    due: readDate(properties.Due),
    labels: readStringArray(properties.Labels),
    projectId: readFirstRelation(properties.Project),
    description: readString(properties.Description),
    location: readString(properties.Location) || null,
    recurring: readString(properties.Recurring) || null,
    completedAt: readDate(properties['Completed at']),
    order: readNumber(properties.Order),
    link: readString(properties.Link) || null,
    createdAt: document.createdAt ?? null,
  };
}

export function toProject(document: DocumentRecord): Project {
  const properties = document.properties ?? {};
  const status = readString(properties.Status);
  return {
    id: document.id,
    title: document.title?.trim() || DEFAULT_PROJECT_TITLE,
    status: (PROJECT_STATUSES as readonly string[]).includes(status)
      ? (status as ProjectStatus)
      : 'Inbox',
    description: readString(properties.Description),
    parentId: readFirstRelation(properties['Parent project']),
    color: asProjectColor(properties.Color, document.id),
    start: readDate(properties.Start),
    due: readDate(properties.Due),
    order: readNumber(properties.Order),
  };
}

export function isDone(task: Task): boolean {
  return task.status === DONE_STATUS;
}

// --- Dates ------------------------------------------------------------------

/** Local calendar day as YYYY-MM-DD — never the UTC day. */
export function toDayKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function todayKey(): string {
  return toDayKey(new Date());
}

export function parseDayKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function isOverdue(task: Task): boolean {
  return !isDone(task) && task.due !== null && task.due < todayKey();
}

export function isDueToday(task: Task): boolean {
  return task.due === todayKey();
}

const WEEKDAY_FORMAT = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const DAY_FORMAT = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const DAY_YEAR_FORMAT = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const LONG_DAY_FORMAT = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** "Today", "Tomorrow", "Fri 12 Sep" — whichever is shortest and unambiguous. */
export function formatDueLabel(key: string | null): string | null {
  const date = key ? parseDayKey(key) : null;
  if (!key || !date) return null;

  const today = new Date();
  const diff = Math.round(
    (date.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime())
      / 86_400_000,
  );
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return WEEKDAY_FORMAT.format(date);
  if (date.getFullYear() === today.getFullYear()) return DAY_FORMAT.format(date);
  return DAY_YEAR_FORMAT.format(date);
}

export function formatDayHeading(key: string): string {
  const date = parseDayKey(key);
  if (!date) return key;
  const label = LONG_DAY_FORMAT.format(date);
  const today = todayKey();
  if (key === today) return `${label} · Today`;
  if (key === toDayKey(addDays(new Date(), 1))) return `${label} · Tomorrow`;
  return label;
}

// --- Sorting ----------------------------------------------------------------

/**
 * Manual order first, then priority, then due date, then creation time — the
 * order a task list has to have for drag-free triage to feel stable.
 */
export function compareTasks(a: Task, b: Task): number {
  if (a.order !== null || b.order !== null) {
    const left = a.order ?? Number.MAX_SAFE_INTEGER;
    const right = b.order ?? Number.MAX_SAFE_INTEGER;
    if (left !== right) return left - right;
  }
  const priority = priorityRank(a.priority) - priorityRank(b.priority);
  if (priority !== 0) return priority;
  if (a.due !== b.due) {
    if (a.due === null) return 1;
    if (b.due === null) return -1;
    return a.due < b.due ? -1 : 1;
  }
  return (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
}

export function compareProjects(a: Project, b: Project): number {
  if (a.order !== null || b.order !== null) {
    const left = a.order ?? Number.MAX_SAFE_INTEGER;
    const right = b.order ?? Number.MAX_SAFE_INTEGER;
    if (left !== right) return left - right;
  }
  return a.title.localeCompare(b.title);
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
