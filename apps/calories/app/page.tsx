'use client';

import { useMemo } from 'react';
import { NotisSelectionBoundary, ViewSkeleton, useActiveResource } from '@notis/sdk';
import { ImageIcon, SparkleIcon } from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import { PageHeading } from '@/components/page-heading';
import {
  addPeriod,
  dayKey,
  formatPeriod,
  mealsInPeriod,
  totalsForMeals,
  useCaloriesData,
  usePeriodResource,
} from './calories-core';
import {
  DateStepper,
  MacroDashboard,
  MacroDashboardSkeleton,
  MealCard,
  MealsEmpty,
  StatCardSkeleton,
} from './calories-ui';

export default function DayPage() {
  const { meals, activeGoal, hasData, error, refetch } = useCaloriesData();
  const { date, resourceId: dateKey, missingResource, navigateToDate } = usePeriodResource('day');
  const dayMeals = useMemo(() => mealsInPeriod(meals, date, 'day'), [meals, date]);
  const totals = useMemo(() => totalsForMeals(dayMeals), [dayMeals]);
  const isToday = dateKey === dayKey(new Date());
  const dateLabel = formatPeriod(date, 'day');
  const dayResource = {
    id: dateKey,
    kind: 'nutrition-day',
    label: isToday ? `Calories — Today` : `Calories — ${dateLabel}`,
    attributes: {
      date: dateKey,
      meals: dayMeals.length,
      calories: Math.round(totals.calories),
    },
  };
  useActiveResource(dayResource);

  return (
    <NotisSelectionBoundary resource={dayResource}>
      <div data-store-screenshot="day" className="calories-page mx-auto w-full max-w-5xl">
        <PageHeading
          title={isToday ? 'Today' : dateLabel}
          description="Your meals and macro balance, captured with Notis."
          actions={
            <DateStepper
              label={dateLabel}
              onPrevious={() => navigateToDate(addPeriod(date, 'day', -1))}
              onNext={() => navigateToDate(addPeriod(date, 'day', 1))}
              disableNext={isToday}
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
            Requested day isn’t available. Showing today.
          </p>
        ) : null}

        {hasData ? (
          <div className="calories-day-grid mt-6">
            <section className="space-y-4">
              <MacroDashboard totals={totals} goal={activeGoal} title={isToday ? 'Today' : 'This day'} />

              <div className="calories-stat-grid grid gap-3">
                <div className="rounded-2xl bg-muted p-4">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <ImageIcon size={14} />
                    Meals logged
                  </div>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">{dayMeals.length}</p>
                </div>
                <div className="rounded-2xl bg-muted p-4">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <SparkleIcon size={14} />
                    Goal
                  </div>
                  <p className="mt-2 truncate text-sm font-semibold">
                    {activeGoal?.goal ?? 'Not set'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {activeGoal?.weeklyRate
                      ? `${activeGoal.weeklyRate > 0 ? '+' : ''}${activeGoal.weeklyRate} kg / week`
                      : 'Run onboarding to personalize'}
                  </p>
                </div>
              </div>

              <p className="px-1 text-xs leading-relaxed text-muted-foreground">
                Photo estimates are directional. Correct the portion, cooking oil, sauces, or ingredients
                in chat whenever Notis marks an entry as uncertain.
              </p>
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold">Meals</h2>
                  <p className="text-xs text-muted-foreground">
                    {dayMeals.length
                      ? `${dayMeals.length} ${dayMeals.length === 1 ? 'entry' : 'entries'}`
                      : 'Send a photo to Notis to begin'}
                  </p>
                </div>
                {dayMeals.length ? (
                  <span className="text-xs font-medium text-muted-foreground">
                    {Math.round(totals.calories)} kcal total
                  </span>
                ) : null}
              </div>
              <div className="space-y-3">
                {dayMeals.length
                  ? dayMeals.map((meal) => <MealCard key={meal.id} meal={meal} />)
                  : <MealsEmpty />}
              </div>
            </section>
          </div>
        ) : error ? null : (
          <div className="calories-day-grid mt-6">
            <section className="space-y-4">
              <MacroDashboardSkeleton />
              <div className="calories-stat-grid grid gap-3">
                <StatCardSkeleton />
                <StatCardSkeleton />
              </div>
            </section>
            <section>
              <h2 className="mb-3 text-sm font-semibold">Meals</h2>
              <ViewSkeleton variant="table" rows={4} />
            </section>
          </div>
        )}
      </div>
    </NotisSelectionBoundary>
  );
}
