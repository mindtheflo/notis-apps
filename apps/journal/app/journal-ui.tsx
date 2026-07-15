'use client';

/** Shared presentational building blocks for Journal. */

import type { ReactNode } from 'react';
import { CircleNotchIcon, type Icon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { moodMeta } from './journal-core';

export function MoodDot({ mood, size = 10 }: { mood: string | null; size?: number }) {
  const meta = moodMeta(mood);
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full ring-1 ring-inset ring-black/5"
      style={{
        width: size,
        height: size,
        backgroundColor: meta?.color ?? 'hsl(var(--muted-foreground))',
        opacity: meta ? 1 : 0.35,
      }}
    />
  );
}

export function MoodBadge({ mood }: { mood: string | null }) {
  const meta = moodMeta(mood);
  if (!meta) {
    return <span className="text-xs text-muted-foreground">No mood</span>;
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: meta.soft, color: meta.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
      {meta.name}
    </span>
  );
}

/** A compact labelled chip used on entry rows (e.g. "8 · Motivation"). */
export function MetricChip({
  icon: IconCmp,
  value,
  label,
  tone,
}: {
  icon: Icon;
  value: ReactNode;
  label: string;
  tone?: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
      title={label}
    >
      <IconCmp size={12} weight="bold" style={tone ? { color: tone } : undefined} />
      {value}
    </span>
  );
}

export function SectionCard({
  title,
  description,
  action,
  icon: IconCmp,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: Icon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-border bg-card text-card-foreground shadow-sm',
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="flex items-start gap-2.5">
          {IconCmp ? (
            <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <IconCmp size={16} weight="bold" />
            </span>
          ) : null}
          <div>
            <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>
        {action}
      </header>
      <div className="px-5 pb-5">{children}</div>
    </section>
  );
}

export function StatTile({
  label,
  value,
  suffix,
  hint,
  icon: IconCmp,
  accent,
}: {
  label: string;
  value: ReactNode;
  suffix?: string;
  hint?: string;
  icon?: Icon;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {IconCmp ? (
          <IconCmp size={15} weight="bold" style={{ color: accent ?? 'hsl(var(--muted-foreground))' }} />
        ) : null}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
        {suffix ? <span className="text-sm text-muted-foreground">{suffix}</span> : null}
      </div>
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Thin horizontal meter (0..1 fraction). */
export function Meter({ value, color }: { value: number; color?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, backgroundColor: color ?? 'hsl(var(--primary))' }}
      />
    </div>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
      <CircleNotchIcon size={16} className="animate-spin" />
      {label}
    </div>
  );
}

export function EmptyState({
  icon: IconCmp,
  title,
  description,
  action,
}: {
  icon: Icon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 px-6 py-14 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <IconCmp size={20} weight="bold" />
      </span>
      <h3 className="mt-3 text-sm font-semibold">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
