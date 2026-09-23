'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useDocuments,
  useNotis,
  useNotisNavigation,
  type DocumentRecord,
} from '@notis/sdk';

export const MEALS_DATABASE_SLUG = 'macro_meals';
export const GOALS_DATABASE_SLUG = 'macro_goals';

export const MEAL_PROP = {
  title: 'Name',
  date: 'Date',
  mealType: 'Meal Type',
  calories: 'Calories',
  protein: 'Protein',
  carbs: 'Carbs',
  fat: 'Fat',
  confidence: 'Confidence',
  ingredients: 'Ingredients',
  notes: 'Notes',
  imageUrl: 'Image URL',
  source: 'Source',
} as const;

export const GOAL_PROP = {
  title: 'Name',
  effectiveDate: 'Effective Date',
  calories: 'Calories Goal',
  protein: 'Protein Goal',
  carbs: 'Carbs Goal',
  fat: 'Fat Goal',
  bmr: 'BMR',
  tdee: 'TDEE',
  goal: 'Goal',
  weeklyRate: 'Weekly Rate',
  weight: 'Weight',
  height: 'Height',
  age: 'Age',
  activity: 'Activity',
  active: 'Active',
} as const;

export interface Meal {
  id: string;
  title: string;
  date: string | null;
  mealType: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: string | null;
  ingredients: string | null;
  notes: string | null;
  imageUrl: string | null;
  source: string | null;
}

export interface MacroGoal {
  id: string;
  title: string;
  effectiveDate: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  bmr: number | null;
  tdee: number | null;
  goal: string | null;
  weeklyRate: number | null;
  active: boolean;
}

export interface MacroTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export type Period = 'day' | 'week' | 'month' | 'year';

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function nullableNum(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function mealFromDocument(document: DocumentRecord): Meal {
  const props = document.properties;
  return {
    id: document.id,
    title: str(props[MEAL_PROP.title]) ?? str(document.title) ?? 'Meal',
    date: str(props[MEAL_PROP.date]) ?? document.createdAt ?? null,
    mealType: str(props[MEAL_PROP.mealType]),
    calories: num(props[MEAL_PROP.calories]),
    protein: num(props[MEAL_PROP.protein]),
    carbs: num(props[MEAL_PROP.carbs]),
    fat: num(props[MEAL_PROP.fat]),
    confidence: str(props[MEAL_PROP.confidence]),
    ingredients: str(props[MEAL_PROP.ingredients]),
    notes: str(props[MEAL_PROP.notes]),
    imageUrl: str(props[MEAL_PROP.imageUrl]) ?? document.cover ?? null,
    source: str(props[MEAL_PROP.source]),
  };
}

export function goalFromDocument(document: DocumentRecord): MacroGoal {
  const props = document.properties;
  return {
    id: document.id,
    title: str(props[GOAL_PROP.title]) ?? str(document.title) ?? 'Macro goal',
    effectiveDate: str(props[GOAL_PROP.effectiveDate]),
    calories: num(props[GOAL_PROP.calories]),
    protein: num(props[GOAL_PROP.protein]),
    carbs: num(props[GOAL_PROP.carbs]),
    fat: num(props[GOAL_PROP.fat]),
    bmr: nullableNum(props[GOAL_PROP.bmr]),
    tdee: nullableNum(props[GOAL_PROP.tdee]),
    goal: str(props[GOAL_PROP.goal]),
    weeklyRate: nullableNum(props[GOAL_PROP.weeklyRate]),
    active: props[GOAL_PROP.active] !== false,
  };
}

export function sortMeals(meals: Meal[]): Meal[] {
  return [...meals].sort((a, b) => (a.date ?? '') < (b.date ?? '') ? 1 : -1);
}

export function sortGoals(goals: MacroGoal[]): MacroGoal[] {
  return [...goals].sort((a, b) => (a.effectiveDate ?? '') < (b.effectiveDate ?? '') ? 1 : -1);
}

export function useCaloriesData() {
  const mealDocs = useDocuments(MEALS_DATABASE_SLUG, { pageSize: 250, fetchAll: true });
  const goalDocs = useDocuments(GOALS_DATABASE_SLUG, { pageSize: 50, fetchAll: true });

  const meals = useMemo(
    () => sortMeals(
      mealDocs.documents
        .filter((document) => MEAL_PROP.calories in document.properties)
        .map(mealFromDocument),
    ),
    [mealDocs.documents],
  );
  const goals = useMemo(
    () => sortGoals(
      goalDocs.documents
        .filter((document) => GOAL_PROP.calories in document.properties)
        .map(goalFromDocument),
    ),
    [goalDocs.documents],
  );
  const activeGoal = goals.find((goal) => goal.active) ?? goals[0] ?? null;

  return {
    meals,
    goals,
    activeGoal,
    loading: mealDocs.loading || goalDocs.loading,
    isFetching: mealDocs.isFetching || goalDocs.isFetching,
    hasData: mealDocs.hasData && goalDocs.hasData,
    error: mealDocs.error?.message ?? goalDocs.error?.message ?? null,
    refetch() {
      mealDocs.refetch();
      goalDocs.refetch();
    },
  };
}

export function addDays(value: Date, amount: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + amount);
  return next;
}

export function addPeriod(value: Date, period: Period, amount: number): Date {
  const next = new Date(value);
  if (period === 'day') next.setDate(next.getDate() + amount);
  if (period === 'week') next.setDate(next.getDate() + amount * 7);
  if (period === 'month') next.setMonth(next.getMonth() + amount);
  if (period === 'year') next.setFullYear(next.getFullYear() + amount);
  return next;
}

export function dayKey(value: string | Date | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : parseDate(value);
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDate(value: string): Date | null {
  const only = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = only
    ? new Date(Number(only[1]), Number(only[2]) - 1, Number(only[3]))
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function startOfPeriod(date: Date, period: Period): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  if (period === 'week') {
    const mondayOffset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - mondayOffset);
  }
  if (period === 'month') start.setDate(1);
  if (period === 'year') {
    start.setMonth(0);
    start.setDate(1);
  }
  return start;
}

/** Canonical app-resource identity for a day, week, month, or year. */
export function periodResourceId(date: Date, period: Period): string {
  return dayKey(startOfPeriod(date, period)) ?? '';
}

/** Parse only exact, normalized ISO period-start ids. */
export function parsePeriodResourceId(resourceId: string, period: Period): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(resourceId)) return null;
  const parsed = parseDate(resourceId);
  if (!parsed || dayKey(parsed) !== resourceId) return null;
  return periodResourceId(parsed, period) === resourceId
    ? startOfPeriod(parsed, period)
    : null;
}

export function periodRoutePath(period: Period): string {
  return period === 'day' ? '/' : `/${period}`;
}

/** Keep the visible period synchronized with the route's resource deep link. */
export function usePeriodResource(period: Period) {
  const { resourceId } = useNotis();
  const { toRoute } = useNotisNavigation();
  const [date, setDate] = useState(() => startOfPeriod(new Date(), period));
  const [missingResource, setMissingResource] = useState(false);

  useEffect(() => {
    if (!resourceId) {
      setMissingResource(false);
      return;
    }

    const requested = parsePeriodResourceId(resourceId, period);
    if (requested) {
      setDate(requested);
      setMissingResource(false);
      return;
    }

    setDate(startOfPeriod(new Date(), period));
    setMissingResource(true);
  }, [period, resourceId]);

  const navigateToDate = useCallback((nextDate: Date) => {
    const normalized = startOfPeriod(nextDate, period);
    setDate(normalized);
    setMissingResource(false);
    toRoute(periodRoutePath(period), {
      resourceId: periodResourceId(normalized, period),
    });
  }, [period, toRoute]);

  return {
    date,
    resourceId: periodResourceId(date, period),
    missingResource,
    navigateToDate,
  };
}

export function endOfPeriod(date: Date, period: Period): Date {
  const start = startOfPeriod(date, period);
  const end = addPeriod(start, period, 1);
  end.setMilliseconds(-1);
  return end;
}

export function mealsInPeriod(meals: Meal[], date: Date, period: Period): Meal[] {
  const start = startOfPeriod(date, period).getTime();
  const end = endOfPeriod(date, period).getTime();
  return meals.filter((meal) => {
    const parsed = meal.date ? parseDate(meal.date) : null;
    return parsed ? parsed.getTime() >= start && parsed.getTime() <= end : false;
  });
}

export function totalsForMeals(meals: Meal[]): MacroTotals {
  return meals.reduce(
    (total, meal) => ({
      calories: total.calories + meal.calories,
      protein: total.protein + meal.protein,
      carbs: total.carbs + meal.carbs,
      fat: total.fat + meal.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export function formatPeriod(date: Date, period: Period): string {
  if (period === 'day') {
    return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  }
  if (period === 'week') {
    const start = startOfPeriod(date, period);
    const end = endOfPeriod(date, period);
    return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }
  if (period === 'month') {
    return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  return date.toLocaleDateString(undefined, { year: 'numeric' });
}

export function numberOfDays(period: Period, date: Date): number {
  if (period === 'day') return 1;
  if (period === 'week') return 7;
  if (period === 'month') {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  }
  return (new Date(date.getFullYear(), 1, 29).getMonth() === 1) ? 366 : 365;
}

export function groupMeals(meals: Meal[], date: Date, period: Exclude<Period, 'day'>) {
  const start = startOfPeriod(date, period);
  const bucketCount = period === 'week' ? 7 : period === 'month' ? numberOfDays('month', date) : 12;
  return Array.from({ length: bucketCount }, (_, index) => {
    const bucketMeals = meals.filter((meal) => {
      const parsed = meal.date ? parseDate(meal.date) : null;
      if (!parsed) return false;
      if (period === 'week') return dayKey(parsed) === dayKey(addDays(start, index));
      if (period === 'month') return parsed.getFullYear() === date.getFullYear()
        && parsed.getMonth() === date.getMonth()
        && parsed.getDate() === index + 1;
      return parsed.getFullYear() === date.getFullYear() && parsed.getMonth() === index;
    });
    const label = period === 'week'
      ? addDays(start, index).toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2)
      : period === 'month'
        ? String(index + 1)
        : new Date(date.getFullYear(), index, 1).toLocaleDateString(undefined, { month: 'short' }).slice(0, 3);
    return { label, totals: totalsForMeals(bucketMeals), meals: bucketMeals };
  });
}

export function remaining(value: number, goal: number): number {
  return Math.max(0, Math.round(goal - value));
}

export function percent(value: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.max(0, Math.min(100, (value / goal) * 100));
}

export function round(value: number): number {
  return Math.round(value);
}

/** Calendar-day groups remain the denominator even when a chart uses months. */
export function dailyMealSummaries(meals: Meal[]) {
  const days = new Map<string, Meal[]>();
  for (const meal of meals) {
    const date = dayKey(meal.date);
    if (!date) continue;
    const group = days.get(date) ?? [];
    group.push(meal);
    days.set(date, group);
  }
  return [...days].map(([date, values]) => ({date, meals: values, totals: totalsForMeals(values)}));
}

export function onTargetDays(days: ReturnType<typeof dailyMealSummaries>, calorieGoal: number): number {
  if (calorieGoal <= 0) return 0;
  return days.filter(day => day.totals.calories >= calorieGoal * .85 && day.totals.calories <= calorieGoal).length;
}

export function chartCalories(bucket: {meals: Meal[]; totals: MacroTotals}, period: Exclude<Period, 'day'>): number {
  if (period !== 'year') return bucket.totals.calories;
  const count = dailyMealSummaries(bucket.meals).length;
  return count ? bucket.totals.calories / count : 0;
}
