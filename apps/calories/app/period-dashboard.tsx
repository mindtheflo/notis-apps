'use client';

import { useMemo } from 'react';
import { NotisSelectionBoundary, ViewSkeleton, useActiveResource } from '@notis/sdk';
import {
  CalendarBlankIcon,
  ChartBarIcon,
  ForkKnifeIcon,
  TargetIcon,
} from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import { PageHeading } from '@/components/page-heading';
import {
  addPeriod,
  formatPeriod,
  groupMeals,
  mealsInPeriod,
  numberOfDays,
  dailyMealSummaries,
  onTargetDays,
  chartCalories,
  round,
  totalsForMeals,
  useCaloriesData,
  usePeriodResource,
  type Period,
} from './calories-core';
import {
  DateStepper,
  MACRO_STYLE,
  Progress,
  Section,
  StatCard,
  StatCardSkeleton,
} from './calories-ui';

export default function PeriodDashboard({ period }: { period: Exclude<Period, 'day'> }) {
  const { meals, activeGoal, hasData, error, refetch } = useCaloriesData();
  const { date, resourceId, missingResource, navigateToDate } = usePeriodResource(period);
  const periodMeals = useMemo(() => mealsInPeriod(meals, date, period), [meals, date, period]);
  const totals = useMemo(() => totalsForMeals(periodMeals), [periodMeals]);
  const buckets = useMemo(() => groupMeals(periodMeals, date, period), [periodMeals, date, period]);
  const days = numberOfDays(period, date);
  const dailySummaries = useMemo(() => dailyMealSummaries(periodMeals), [periodMeals]);
  const daysWithMeals = dailySummaries.length;
  const averageCalories = daysWithMeals ? round(totals.calories / daysWithMeals) : 0;
  const goalCalories = activeGoal?.calories ?? 0;
  const adherenceDays = onTargetDays(dailySummaries, goalCalories);
  const periodLabel = formatPeriod(date, period);
  const periodResource = {
    id: resourceId,
    kind: `nutrition-${period}`,
    label: `Calories — ${periodLabel}`,
    attributes: {
      period,
      start: resourceId,
      meals: periodMeals.length,
      activeDays: daysWithMeals,
      averageCalories,
    },
  };
  useActiveResource(periodResource);

  return (
    <NotisSelectionBoundary resource={periodResource}>
      <div
        data-store-screenshot={period}
        className="mx-auto w-full max-w-5xl px-5 py-6 sm:px-20 sm:py-10"
      >
      <PageHeading
        title={periodLabel}
        description={`Intake, consistency, and macro balance across the ${period}.`}
        actions={
          <DateStepper
            label={periodLabel}
            onPrevious={() => navigateToDate(addPeriod(date, period, -1))}
            onNext={() => navigateToDate(addPeriod(date, period, 1))}
          />
        }
      />

      {error ? (
        <div className="mt-5 flex items-center justify-between gap-3 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error}</span>
          <Button size="sm" variant="ghost" onClick={refetch}>Retry</Button>
        </div>
      ) : null}

      {missingResource ? (
        <p className="mt-5 rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
          Requested {period} isn’t available. Showing the current {period}.
        </p>
      ) : null}

      {hasData ? (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Average calories"
              value={averageCalories}
              detail={goalCalories ? `${round(goalCalories)} kcal daily goal` : 'No goal set'}
              icon={TargetIcon}
            />
            <StatCard
              label="Meals logged"
              value={periodMeals.length}
              detail={`${daysWithMeals} active ${daysWithMeals === 1 ? 'day' : 'days'}`}
              icon={ForkKnifeIcon}
            />
            <StatCard
              label="On-target days"
              value={adherenceDays}
              detail="85–100% of calorie goal"
              icon={ChartBarIcon}
            />
            <StatCard
              label="Coverage"
              value={`${Math.round((daysWithMeals / days) * 100)}%`}
              detail={`${daysWithMeals} of ${days} days`}
              icon={CalendarBlankIcon}
            />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
            <Section
              title={period === 'year' ? 'Daily average by month' : 'Calories by day'}
              description={period === 'year' ? 'Averages for days with logged meals; line marks the daily target' : 'The line marks your daily target'}
            >
              <CalorieBars buckets={buckets} goal={goalCalories} period={period} />
            </Section>

            <Section title="Average macro balance" description="Average for days with logged meals">
              <div className="space-y-5">
                {(['protein', 'carbs', 'fat'] as const).map((key) => {
                  const macro = MACRO_STYLE[key];
                  const dailyAverage = daysWithMeals ? totals[key] / daysWithMeals : 0;
                  const target = activeGoal?.[key] ?? 0;
                  return (
                    <div key={key}>
                      <div className="flex items-end justify-between gap-3">
                        <span className="text-xs font-medium">{macro.label}</span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {round(dailyAverage)} / {round(target)}{macro.unit}
                        </span>
                      </div>
                      <Progress value={dailyAverage} goal={target} color={macro.color} className="mt-2" />
                    </div>
                  );
                })}
              </div>
            </Section>
          </div>
        </>
      ) : error ? null : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
            <Section
              title={period === 'year' ? 'Daily average by month' : 'Calories by day'}
              description={period === 'year' ? 'Averages for days with logged meals; line marks the daily target' : 'The line marks your daily target'}
            >
              <ViewSkeleton variant="graph" />
            </Section>

            <Section title="Average macro balance" description="Average for days with logged meals">
              <ViewSkeleton variant="detail" rows={3} />
            </Section>
          </div>
        </>
      )}
      </div>
    </NotisSelectionBoundary>
  );
}

function CalorieBars({
  buckets,
  goal,
  period,
}: {
  buckets: ReturnType<typeof groupMeals>;
  goal: number;
  period: Exclude<Period, 'day'>;
}) {
  const max = Math.max(goal, ...buckets.map((bucket) => chartCalories(bucket, period)), 1);
  const sparseLabels = buckets.length > 14;
  return (
    <div className="relative h-64 pt-2">
      {goal > 0 ? (
        <div
          className="pointer-events-none absolute left-0 right-0 h-px bg-muted-foreground/40"
          style={{ bottom: `${(goal / max) * 88 + 12}%` }}
        >
          <span className="absolute -top-4 right-0 text-xs text-muted-foreground">
            {round(goal)} goal
          </span>
        </div>
      ) : null}
      <div
        className="grid h-full items-end gap-1"
        style={{ gridTemplateColumns: `repeat(${buckets.length}, minmax(0, 1fr))` }}
      >
        {buckets.map((bucket, index) => {
          const value = chartCalories(bucket, period);
          const height = value > 0 ? Math.max(3, (value / max) * 88) : 1;
          const showLabel = !sparseLabels || index === 0 || index === buckets.length - 1 || index % 5 === 0;
          return (
            <div key={`${bucket.label}-${index}`} className="flex h-full min-w-0 flex-col justify-end">
              <div
                className="group relative w-full rounded-t-sm bg-foreground/75 transition-opacity hover:opacity-80"
                style={{ height: `${height}%` }}
                title={`${bucket.label}: ${round(value)} kcal`}
              />
              <span className="mt-2 h-4 truncate text-center text-xs text-muted-foreground">
                {showLabel ? bucket.label : ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
