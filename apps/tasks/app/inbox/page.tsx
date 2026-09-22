'use client';

/**
 * Inbox — captured but not filed. Everything without a project lands here
 * until it is given one.
 */

import { useMemo } from 'react';

import { useBoard } from '@/lib/use-board';
import { compareTasks, isDone } from '@/lib/tasks';
import {
  EmptyState,
  ErrorBanner,
  MissingTaskNotice,
  PageHeader,
  PageShell,
  QuickAdd,
  TaskSection,
  useLinkedTask,
} from '@/components/task-list';
import { useTaskSearch } from '@/components/use-task-search';

export default function InboxPage() {
  const board = useBoard();
  const linked = useLinkedTask(board);
  const { query, matches } = useTaskSearch('Search the inbox');

  const { open, done } = useMemo(() => {
    const unfiled = board.tasks.filter((task) => task.projectId === null && matches(task));
    return {
      open: unfiled.filter((task) => !isDone(task)).sort(compareTasks),
      done: unfiled.filter(isDone).sort(compareTasks),
    };
  }, [board.tasks, matches]);

  return (
    <PageShell>
      <PageHeader
        title="Inbox"
        subtitle="Tasks that have not been filed under a project yet"
        count={open.length}
        live={board.live}
        onRefresh={board.refresh}
      />

      {board.error ? (
        <ErrorBanner message={board.error} onDismiss={board.dismissError} onRetry={board.refresh} />
      ) : null}
      {linked.missing ? <MissingTaskNotice /> : null}

      {linked.task && ![...open, ...done].some((task) => task.id === linked.task?.id) ? (
        <TaskSection title="Linked task" tasks={[linked.task]} board={board} />
      ) : null}
      <TaskSection tasks={open} board={board} loading={!board.hasData}>
        <QuickAdd onCreate={(patch) => void board.createTask(patch)} />
      </TaskSection>

      {done.length > 0 ? (
        <TaskSection title="Completed" tasks={done} board={board} collapsible defaultCollapsed />
      ) : null}

      {board.hasData && open.length === 0 && done.length === 0 && !linked.task ? (
        <EmptyState
          title={query ? 'Nothing matches that search.' : 'Inbox zero.'}
          hint={query ? undefined : 'Anything captured without a project shows up here.'}
        />
      ) : null}
    </PageShell>
  );
}
