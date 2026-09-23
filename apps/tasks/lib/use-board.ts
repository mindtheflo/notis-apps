'use client';

/**
 * The app's single data layer: every page reads tasks and projects from here
 * and every edit goes back through it.
 *
 * Edits apply to the local copy first and are reconciled against the row the
 * server sends back, so inline editing never waits on a round trip. A failed
 * write drops its override and surfaces the error instead of leaving the list
 * showing something that was not saved.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDatabaseSubscription, useUpsertDocument } from '@notis/sdk';

import {
  PROJECT_DATABASE_SLUG,
  TASK_DATABASE_SLUG,
  compareProjects,
  compareTasks,
  toProject,
  toTask,
  type Project,
  type Task,
} from '@/lib/tasks';

/** Fields a caller may change on a task. `title` is stored on the document. */
export type TaskPatch = Partial<
  Pick<
    Task,
    | 'title'
    | 'status'
    | 'priority'
    | 'due'
    | 'labels'
    | 'projectId'
    | 'description'
    | 'location'
    | 'recurring'
    | 'link'
  >
>;

export type ProjectPatch = Partial<
  Pick<Project, 'title' | 'status' | 'description' | 'color' | 'start' | 'due' | 'parentId'>
>;

const PAGE_SIZE = 500;

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => item === b[index]);
  }
  return a === b;
}

/** True once every overridden field is what the server now reports. */
function overrideSettled<T extends object>(override: Partial<T>, row: T): boolean {
  return (Object.keys(override) as Array<keyof T>).every((key) =>
    sameValue(override[key], row[key]),
  );
}

function applyOverrides<T extends { id: string }>(
  rows: T[],
  overrides: Record<string, Partial<T>>,
): T[] {
  if (Object.keys(overrides).length === 0) return rows;
  return rows.map((row) => (overrides[row.id] ? { ...row, ...overrides[row.id] } : row));
}

/** Task fields as the upsert tool wants them: flat, keyed by property name. */
function taskProperties(patch: TaskPatch): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  if (patch.status !== undefined) properties.Status = patch.status;
  if (patch.priority !== undefined) properties.Priority = patch.priority;
  if (patch.due !== undefined) properties.Due = patch.due;
  if (patch.labels !== undefined) properties.Labels = patch.labels;
  if (patch.projectId !== undefined) {
    properties.Project = patch.projectId ? [patch.projectId] : [];
  }
  if (patch.description !== undefined) properties.Description = patch.description;
  if (patch.location !== undefined) properties.Location = patch.location;
  if (patch.recurring !== undefined) properties.Recurring = patch.recurring;
  if (patch.link !== undefined) properties.Link = patch.link;
  // A task that leaves Done stops carrying a completion date.
  if (patch.status !== undefined) {
    properties['Completed at'] = patch.status === 'Done' ? new Date().toISOString().slice(0, 10) : null;
  }
  return properties;
}

function projectProperties(patch: ProjectPatch): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  if (patch.status !== undefined) properties.Status = patch.status;
  if (patch.description !== undefined) properties.Description = patch.description;
  if (patch.color !== undefined) properties.Color = patch.color;
  if (patch.start !== undefined) properties.Start = patch.start;
  if (patch.due !== undefined) properties.Due = patch.due;
  if (patch.parentId !== undefined) {
    properties['Parent project'] = patch.parentId ? [patch.parentId] : [];
  }
  return properties;
}

export interface Board {
  tasks: Task[];
  projects: Project[];
  tasksById: Map<string, Task>;
  projectsById: Map<string, Project>;
  loading: boolean;
  hasData: boolean;
  isFetching: boolean;
  tasksError: string | null;
  error: string | null;
  live: boolean;
  refresh: () => void;
  dismissError: () => void;
  updateTask: (id: string, patch: TaskPatch) => Promise<void>;
  createTask: (patch: TaskPatch & { title: string }) => Promise<void>;
  archiveTask: (id: string) => Promise<void>;
  updateProject: (id: string, patch: ProjectPatch) => Promise<void>;
  createProject: (patch: ProjectPatch & { title: string }) => Promise<void>;
}

export function useBoard(): Board {
  const taskQuery = useDatabaseSubscription(TASK_DATABASE_SLUG, {
    pageSize: PAGE_SIZE,
    fetchAll: true,
  });
  const projectQuery = useDatabaseSubscription(PROJECT_DATABASE_SLUG, {
    pageSize: PAGE_SIZE,
    fetchAll: true,
  });
  const taskWriter = useUpsertDocument(TASK_DATABASE_SLUG);
  const projectWriter = useUpsertDocument(PROJECT_DATABASE_SLUG);

  const [taskOverrides, setTaskOverrides] = useState<Record<string, TaskPatch>>({});
  const [projectOverrides, setProjectOverrides] = useState<Record<string, ProjectPatch>>({});
  // Rows created locally, kept until the query that will contain them lands.
  const [pendingTasks, setPendingTasks] = useState<Task[]>([]);
  const [pendingProjects, setPendingProjects] = useState<Project[]>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    taskQuery.refetch();
    projectQuery.refetch();
  }, [taskQuery.refetch, projectQuery.refetch]);

  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  const serverTasks = useMemo(
    () => taskQuery.documents.map(toTask),
    [taskQuery.documents],
  );
  const serverProjects = useMemo(
    () => projectQuery.documents.map(toProject),
    [projectQuery.documents],
  );

  // Drop overrides and optimistic rows the server has caught up with, so an
  // edit made elsewhere is never masked by a stale local value.
  useEffect(() => {
    const known = new Map(serverTasks.map((task) => [task.id, task]));
    setTaskOverrides((current) => {
      const next: Record<string, TaskPatch> = {};
      let changed = false;
      for (const [id, override] of Object.entries(current)) {
        const row = known.get(id);
        if (row && overrideSettled(override, row)) {
          changed = true;
          continue;
        }
        next[id] = override;
      }
      return changed ? next : current;
    });
    setPendingTasks((current) => {
      const next = current.filter((task) => !known.has(task.id));
      return next.length === current.length ? current : next;
    });
    // Keep hiding an archived row only while the server still returns it.
    setRemovedIds((current) => {
      const next = current.filter((id) => known.has(id));
      return next.length === current.length ? current : next;
    });
  }, [serverTasks]);

  useEffect(() => {
    const known = new Map(serverProjects.map((project) => [project.id, project]));
    setProjectOverrides((current) => {
      const next: Record<string, ProjectPatch> = {};
      let changed = false;
      for (const [id, override] of Object.entries(current)) {
        const row = known.get(id);
        if (row && overrideSettled(override, row)) {
          changed = true;
          continue;
        }
        next[id] = override;
      }
      return changed ? next : current;
    });
    setPendingProjects((current) => {
      const next = current.filter((project) => !known.has(project.id));
      return next.length === current.length ? current : next;
    });
  }, [serverProjects]);

  const tasks = useMemo(() => {
    const removed = new Set(removedIds);
    return applyOverrides<Task>([...serverTasks, ...pendingTasks], taskOverrides)
      .filter((task) => !removed.has(task.id))
      .sort(compareTasks);
  }, [serverTasks, pendingTasks, taskOverrides, removedIds]);

  const projects = useMemo(
    () =>
      applyOverrides<Project>([...serverProjects, ...pendingProjects], projectOverrides).sort(
        compareProjects,
      ),
    [serverProjects, pendingProjects, projectOverrides],
  );

  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const projectsById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );

  const reportError = useCallback((err: unknown, action: string) => {
    const message = err instanceof Error ? err.message : String(err);
    setError(`${action} failed: ${message}`);
  }, []);

  const updateTask = useCallback(
    async (id: string, patch: TaskPatch) => {
      setTaskOverrides((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
      setError(null);
      try {
        const saved = await taskWriter.upsert({
          documentId: id,
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          properties: taskProperties(patch),
        });
        // Reconcile against what was actually stored rather than what was sent.
        const stored = toTask(saved);
        setTaskOverrides((current) => {
          const override = current[id];
          if (!override) return current;
          return { ...current, [id]: { ...override, ...pickPatch(stored, override) } };
        });
        refreshRef.current();
      } catch (err) {
        setTaskOverrides((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
        reportError(err, 'Saving the task');
      }
    },
    [taskWriter.upsert, reportError],
  );

  const createTask = useCallback(
    async (patch: TaskPatch & { title: string }) => {
      setError(null);
      try {
        const created = await taskWriter.upsert({
          title: patch.title,
          properties: taskProperties({ status: 'Backlog', priority: 'P4', ...patch }),
          operation: 'create',
        });
        setPendingTasks((current) => [...current, toTask(created)]);
        refreshRef.current();
      } catch (err) {
        reportError(err, 'Creating the task');
      }
    },
    [taskWriter.upsert, reportError],
  );

  const archiveTask = useCallback(
    async (id: string) => {
      setRemovedIds((current) => [...current, id]);
      setError(null);
      try {
        await taskWriter.upsert({ documentId: id, operation: 'archive' });
        refreshRef.current();
      } catch (err) {
        setRemovedIds((current) => current.filter((value) => value !== id));
        reportError(err, 'Deleting the task');
      }
    },
    [taskWriter.upsert, reportError],
  );

  const updateProject = useCallback(
    async (id: string, patch: ProjectPatch) => {
      setProjectOverrides((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
      setError(null);
      try {
        const saved = await projectWriter.upsert({
          documentId: id,
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          properties: projectProperties(patch),
        });
        const stored = toProject(saved);
        setProjectOverrides((current) => {
          const override = current[id];
          if (!override) return current;
          return { ...current, [id]: { ...override, ...pickPatch(stored, override) } };
        });
        refreshRef.current();
      } catch (err) {
        setProjectOverrides((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
        reportError(err, 'Saving the project');
      }
    },
    [projectWriter.upsert, reportError],
  );

  const createProject = useCallback(
    async (patch: ProjectPatch & { title: string }) => {
      setError(null);
      try {
        const created = await projectWriter.upsert({
          title: patch.title,
          properties: projectProperties({ status: 'Inbox', ...patch }),
          operation: 'create',
        });
        setPendingProjects((current) => [...current, toProject(created)]);
        refreshRef.current();
      } catch (err) {
        reportError(err, 'Creating the project');
      }
    },
    [projectWriter.upsert, reportError],
  );

  return {
    tasks,
    projects,
    tasksById,
    projectsById,
    loading: taskQuery.loading || projectQuery.loading,
    // True once both the tasks and projects reads have returned at least once,
    // including a successful-but-empty result. Empty states must wait on this.
    hasData: taskQuery.hasData && projectQuery.hasData,
    isFetching: taskQuery.isFetching || projectQuery.isFetching,
    tasksError: taskQuery.error?.message ?? null,
    error: error ?? taskQuery.error?.message ?? projectQuery.error?.message ?? null,
    live: taskQuery.live && projectQuery.live,
    refresh,
    dismissError: () => setError(null),
    updateTask,
    createTask,
    archiveTask,
    updateProject,
    createProject,
  };
}

/** Narrows a stored row down to the keys an override actually owns. */
function pickPatch<T extends object>(row: T, override: Partial<T>): Partial<T> {
  const picked: Partial<T> = {};
  for (const key of Object.keys(override) as Array<keyof T>) {
    picked[key] = row[key];
  }
  return picked;
}
