'use client';

/**
 * Upcoming — everything scheduled, laid out day by day.
 */

import { useMemo } from 'react';

import { useBoard } from '@/lib/use-board';
import {
  addDays,
  compareTasks,
  formatDayHeading,
  isDone,
  isOverdue,
  toDayKey,
  todayKey,
  type Task,
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

/** Days always shown, so an empty day still offers somewhere to add a task. */
const HORIZON_DAYS = 7;

export default function UpcomingPage() {
  const board = useBoard();
  const linked = useLinkedTask(board);
  const { query, matches } = useTaskSearch('Search upcoming tasks');

  const open = useMemo(
    () => board.tasks.filter((task) => !isDone(task) && matches(task)),
    [board.tasks, matches],
  );

  const { horizon, later, unscheduled, overdue } = useMemo(() => {
    const today = todayKey();
    const days = Array.from({ length: HORIZON_DAYS }, (_, index) =>
      toDayKey(addDays(new Date(), index)),
    );
    const lastDay = days[days.length - 1];
    const byDay = new Map<string, Task[]>(days.map((day) => [day, []]));

    const beyond: Task[] = [];
    const none: Task[] = [];
    const late: Task[] = [];

    for (const task of open) {
      if (task.due === null) {
        none.push(task);
      } else if (task.due < today) {
        late.push(task);
      } else if (task.due <= lastDay) {
        byDay.get(task.due)?.push(task);
      } else {
        beyond.push(task);
      }
    }

    return {
      horizon: days.map((day) => ({ day, tasks: (byDay.get(day) ?? []).sort(compareTasks) })),
      later: beyond.sort(compareTasks),
      unscheduled: none.sort(compareTasks),
      overdue: late.sort(compareTasks),
    };
  }, [open]);

  const scheduledCount = horizon.reduce((total, group) => total + group.tasks.length, 0)
    + later.length;

  return (
    <PageShell>
      <PageHeader
        title="Upcoming"
        subtitle={`The next ${HORIZON_DAYS} days, then everything after`}
        count={scheduledCount}
        live={board.live}
        onRefresh={board.refresh}
      />

      {board.error ? (
        <ErrorBanner message={board.error} onDismiss={board.dismissError} onRetry={board.refresh} />
      ) : null}
      {linked.missing ? <MissingTaskNotice /> : null}

      {linked.task &&
      ![
        ...overdue,
        ...horizon.flatMap((group) => group.tasks),
        ...later,
        ...unscheduled,
      ].some((task) => task.id === linked.task?.id) ? (
        <TaskSection title="Linked task" tasks={[linked.task]} board={board} />
      ) : null}
      {overdue.length > 0 ? (
        <TaskSection
          title="Overdue"
          tone="danger"
          tasks={overdue.filter(isOverdue)}
          board={board}
          collapsible
        />
      ) : null}

      {horizon.map(({ day, tasks }, index) => (
        <TaskSection
          key={day}
          title={formatDayHeading(day)}
          tasks={tasks}
          board={board}
          // The day buckets are static; only the first (today) carries a
          // skeleton for the first read so the rest of the week stays visible.
          loading={index === 0 ? !board.hasData : false}
        >
          <QuickAdd
            onCreate={(patch) => void board.createTask(patch)}
            defaults={{ due: day }}
            placeholder="Add a task"
          />
        </TaskSection>
      ))}

      {later.length > 0 ? (
        <TaskSection title="Later" tasks={later} board={board} collapsible />
      ) : null}

      {unscheduled.length > 0 ? (
        <TaskSection
          title="No date"
          tasks={unscheduled}
          board={board}
          collapsible
          defaultCollapsed
        />
      ) : null}

      {board.hasData && scheduledCount + unscheduled.length + overdue.length === 0 && query && !linked.task ? (
        <EmptyState title="Nothing matches that search." />
      ) : null}
    </PageShell>
  );
}
