'use client';

/**
 * Today — what is actually due, and what should have been.
 */

import { useMemo } from 'react';

import { useBoard } from '@/lib/use-board';
import {
  compareTasks,
  formatDayHeading,
  isDone,
  isDueToday,
  isOverdue,
  todayKey,
} from '@/lib/tasks';
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

export default function TodayPage() {
  const board = useBoard();
  const linked = useLinkedTask(board);
  const { query, matches } = useTaskSearch('Search today’s tasks');

  const { overdue, due } = useMemo(() => {
    const open = board.tasks.filter((task) => !isDone(task) && matches(task));
    return {
      overdue: open.filter(isOverdue).sort(compareTasks),
      due: open.filter(isDueToday).sort(compareTasks),
    };
  }, [board.tasks, matches]);

  const doneToday = useMemo(
    () =>
      board.tasks
        .filter((task) => isDone(task) && task.completedAt === todayKey() && matches(task))
        .sort(compareTasks),
    [board.tasks, matches],
  );

  return (
    <PageShell>
      <PageHeader
        title="Today"
        subtitle={formatDayHeading(todayKey())}
        count={overdue.length + due.length}
        live={board.live}
        onRefresh={board.refresh}
      />

      {board.error ? (
        <ErrorBanner message={board.error} onDismiss={board.dismissError} onRetry={board.refresh} />
      ) : null}
      {linked.missing ? <MissingTaskNotice /> : null}

      {linked.task && ![...overdue, ...due, ...doneToday].some((task) => task.id === linked.task?.id) ? (
        <TaskSection title="Linked task" tasks={[linked.task]} board={board} />
      ) : null}
      {overdue.length > 0 ? (
        <TaskSection title="Overdue" tone="danger" tasks={overdue} board={board} collapsible />
      ) : null}

      <TaskSection title="Due today" tasks={due} board={board} loading={!board.hasData}>
        <QuickAdd
          onCreate={(patch) => void board.createTask(patch)}
          defaults={{ due: todayKey() }}
        />
      </TaskSection>

      {doneToday.length > 0 ? (
        <TaskSection
          title="Completed today"
          tasks={doneToday}
          board={board}
          collapsible
          defaultCollapsed
        />
      ) : null}

      {board.hasData && overdue.length + due.length + doneToday.length === 0 && !linked.task ? (
        <EmptyState
          title={query ? 'Nothing matches that search.' : 'Nothing due today.'}
          hint={query ? undefined : 'Add a task above, or look ahead in Upcoming.'}
        />
      ) : null}
    </PageShell>
  );
}
