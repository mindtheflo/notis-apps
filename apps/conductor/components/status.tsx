'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * State badges use the portal's own semantic variants, not a status-board
 * palette: an in-progress state is emphasized (default), a settled state
 * (done, or simply not active) recedes into secondary, and only a genuine
 * failure earns destructive.
 */
type Variant = 'default' | 'secondary' | 'destructive';

const STATE_VARIANT: Record<string, Variant> = {
  // Repository
  Pending: 'secondary',
  Cloning: 'default',
  Configuring: 'default',
  Ready: 'secondary',
  Error: 'destructive',
  // Secrets
  Missing: 'destructive',
  Staged: 'default',
  Verified: 'secondary',
  // Workspace
  Creating: 'default',
  'Setting up': 'default',
  Working: 'default',
  Archived: 'secondary',
  // Pull request
  None: 'secondary',
  Draft: 'secondary',
  Open: 'default',
  Merged: 'secondary',
  Closed: 'destructive',
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
    <Badge variant={STATE_VARIANT[state] ?? 'secondary'} className={cn('font-medium', className)}>
      {state}
    </Badge>
  );
}

/**
 * A path, command, branch, or id. Amendment 2: read-only values are inline
 * mono text, never a dark pill or a disabled-input lookalike.
 */
export function Mono({ value, className }: { value: string | null; className?: string }) {
  if (!value) return <span className="text-sm text-muted-foreground">not set</span>;
  return (
    <code
      title={value}
      className={cn('block max-w-full truncate font-mono text-sm text-foreground', className)}
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
      <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>
      <div className="min-w-0 text-sm">{children}</div>
    </div>
  );
}
