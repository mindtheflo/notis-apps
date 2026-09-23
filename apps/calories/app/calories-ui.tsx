'use client';

import type { ReactNode } from 'react';
import { Skeleton } from '@notis/sdk';
import {
  CaretDownIcon,
  CaretUpIcon,
  ForkKnifeIcon,
  ImageIcon,
  TargetIcon,
  type Icon,
} from '@phosphor-icons/react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  percent,
  remaining,
  round,
  type MacroGoal,
  type MacroTotals,
  type Meal,
} from './calories-core';

export const MACRO_STYLE = {
  calories: { label: 'Calories', unit: 'kcal', color: 'hsl(var(--primary))' },
  protein: { label: 'Protein', unit: 'g', color: 'hsl(var(--primary) / 0.7)' },
  carbs: { label: 'Carbs', unit: 'g', color: 'hsl(var(--primary) / 0.45)' },
  fat: { label: 'Fat', unit: 'g', color: 'hsl(var(--primary) / 0.25)' },
} as const;

export function DateStepper({
  label,
  onPrevious,
  onNext,
  disableNext,
}: {
  label: string;
  onPrevious: () => void;
  onNext: () => void;
  disableNext?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 text-right">
        <p className="text-xs text-muted-foreground">Viewing</p>
        <p className="truncate text-sm font-medium">{label}</p>
      </div>
      <div className="flex flex-col rounded-lg bg-muted p-0.5">
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-7 rounded-md"
          onClick={onPrevious}
          aria-label="Previous period"
          title="Previous period"
        >
          <CaretUpIcon size={14} weight="bold" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-7 rounded-md"
          onClick={onNext}
          disabled={disableNext}
          aria-label="Next period"
          title="Next period"
        >
          <CaretDownIcon size={14} weight="bold" />
        </Button>
      </div>
    </div>
  );
}

export function MacroDashboard({
  totals,
  goal,
  title = 'Today',
}: {
  totals: MacroTotals;
  goal: MacroGoal | null;
  title?: string;
}) {
  if (!goal) {
    return (
      <Card className="p-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
          <TargetIcon size={20} />
        </div>
        <h2 className="mt-4 text-base font-semibold">Set your macro goals</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Open Calories onboarding in Notis. It will calculate a starting target from your body,
          activity, and goal.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-4">
        <p className="text-xs font-medium text-muted-foreground">{title}’s progress</p>
        <div className="mt-1 flex items-end justify-between gap-4">
          <div>
            <span className="text-3xl font-semibold tabular-nums">{round(totals.calories)}</span>
            <span className="ml-1.5 text-sm text-muted-foreground">of {round(goal.calories)} kcal</span>
          </div>
          <Badge variant="secondary">{remaining(totals.calories, goal.calories)} left</Badge>
        </div>
        <Progress value={totals.calories} goal={goal.calories} color={MACRO_STYLE.calories.color} className="mt-4" />
      </div>

      <div className="calories-macro-grid grid px-5 pb-5">
        {(['protein', 'carbs', 'fat'] as const).map((key) => {
          const style = MACRO_STYLE[key];
          return (
            <div key={key}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium">{style.label}</span>
                <span className="text-xs text-muted-foreground">
                  {remaining(totals[key], goal[key])}{style.unit} left
                </span>
              </div>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {round(totals[key])}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  / {round(goal[key])}{style.unit}
                </span>
              </p>
              <Progress value={totals[key]} goal={goal[key]} color={style.color} className="mt-2.5" />
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function Progress({
  value,
  goal,
  color,
  className,
}: {
  value: number;
  goal: number;
  color: string;
  className?: string;
}) {
  const fill = percent(value, goal);
  const over = goal > 0 && value > goal;
  return (
    <div
      className={cn('h-2 overflow-hidden rounded-full bg-muted', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={goal}
      aria-valuenow={value}
    >
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${fill}%`, backgroundColor: over ? 'hsl(var(--destructive))' : color }}
      />
    </div>
  );
}

export function MealCard({ meal }: { meal: Meal }) {
  const time = meal.date
    ? new Date(meal.date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : null;
  return (
    <Card className="overflow-hidden">
      <div className="flex gap-4 p-3.5">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
          {meal.imageUrl ? (
            <img src={meal.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon size={24} className="text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-sm font-semibold">{meal.title}</h3>
                {meal.confidence === 'Low' ? <Badge variant="secondary">Check estimate</Badge> : null}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {[meal.mealType, time].filter(Boolean).join(' · ')}
              </p>
            </div>
            <p className="shrink-0 text-sm font-semibold tabular-nums">{round(meal.calories)} kcal</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <MacroDot label="Protein" value={meal.protein} color={MACRO_STYLE.protein.color} />
            <MacroDot label="Carbs" value={meal.carbs} color={MACRO_STYLE.carbs.color} />
            <MacroDot label="Fat" value={meal.fat} color={MACRO_STYLE.fat.color} />
          </div>
          {meal.ingredients ? (
            <p className="mt-2 truncate text-xs text-muted-foreground">{meal.ingredients}</p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function MacroDot({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {round(value)}g {label.toLowerCase()}
    </span>
  );
}

export function MealsEmpty() {
  return (
    <Card className="px-6 py-10 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-muted">
        <ForkKnifeIcon size={22} />
      </div>
      <h3 className="mt-3 text-sm font-semibold">No meals yet</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        Send a meal photo to Notis. It will estimate the portion and macros, confirm anything
        uncertain, then add the meal here.
      </p>
    </Card>
  );
}

/** Content-shaped placeholder matching MacroDashboard's figure while the first read is in flight. */
export function MacroDashboardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-4">
        <Skeleton style={{ width: 96, height: 12 }} />
        <div className="mt-2 flex items-end justify-between gap-4">
          <Skeleton style={{ width: 128, height: 32 }} />
          <Skeleton style={{ width: 64, height: 20, borderRadius: 999 }} />
        </div>
        <Skeleton style={{ marginTop: 16, height: 8, borderRadius: 999 }} />
      </div>
      <div className="calories-macro-grid grid px-5 pb-5">
        {[0, 1, 2].map((index) => (
          <div key={index} className="space-y-2">
            <Skeleton style={{ width: 64, height: 12 }} />
            <Skeleton style={{ width: 80, height: 20 }} />
            <Skeleton style={{ height: 8, borderRadius: 999 }} />
          </div>
        ))}
      </div>
    </Card>
  );
}

export function StatCard({
  label,
  value,
  detail,
  icon: IconComponent,
}: {
  label: string;
  value: string | number;
  detail?: string;
  icon: Icon;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <IconComponent size={15} className="text-muted-foreground" />
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
    </Card>
  );
}

/** Content-shaped placeholder matching StatCard while the first read is in flight. */
export function StatCardSkeleton() {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <Skeleton style={{ width: 72, height: 12 }} />
        <Skeleton style={{ width: 15, height: 15, borderRadius: 999 }} />
      </div>
      <Skeleton style={{ marginTop: 8, width: 48, height: 28 }} />
      <Skeleton style={{ marginTop: 4, width: 88, height: 12 }} />
    </Card>
  );
}

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      <div className="mt-5">{children}</div>
    </Card>
  );
}
