'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * State colours. Deliberately a small, muted palette on the portal's own
 * tokens: this is a status board that sits next to the portal chrome, not a
 * dashboard that wants attention.
 */
const TONE = {
  neutral: 'border-border bg-muted/60 text-muted-foreground',
  progress: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  good: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  bad: 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-400',
  info: 'border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-400',
} as const;

type Tone = keyof typeof TONE;

const STATE_TONE: Record<string, Tone> = {
  // Repository
  Pending: 'neutral',
  Cloning: 'progress',
  Configuring: 'progress',
  Ready: 'good',
  Error: 'bad',
  // Secrets
  Missing: 'bad',
  Staged: 'progress',
  Verified: 'good',
  // Workspace
  Creating: 'progress',
  'Setting up': 'progress',
  Working: 'info',
  Archived: 'neutral',
  // Pull request
  None: 'neutral',
  Draft: 'neutral',
  Open: 'good',
  Merged: 'info',
  Closed: 'bad',
};

export function StateBadge({
  state,
  className,
}: {
  state: string | null | undefined;
  className?: string;
}) {
  if (!state) return <span className="text-xs text-muted-foreground">unknown</span>;
  return (
    <Badge
      variant="outline"
      className={cn('font-medium', TONE[STATE_TONE[state] ?? 'neutral'], className)}
    >
      {state}
    </Badge>
  );
}

/** A path, command, or branch. Long values truncate rather than wrap. */
export function Mono({ value, className }: { value: string | null; className?: string }) {
  if (!value) return <span className="text-xs text-muted-foreground">not set</span>;
  return (
    <code
      title={value}
      className={cn(
        'block max-w-full truncate rounded bg-muted/70 px-1.5 py-0.5 font-mono text-xs text-foreground',
        className,
      )}
    >
      {value}
    </code>
  );
}

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="min-w-0 text-sm">{children}</div>
    </div>
  );
}
