'use client';

import type { ReactNode } from 'react';
import { ArrowsClockwiseIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { LinkMode } from '@/lib/use-skill-graph';
import { cn } from '@/lib/utils';

/** Bare label + figure. Used instead of a tinted tile when the page already
 * has another grouping panel (e.g. the map/sidebar split), per the design
 * bar's "stats are figures, not tiles" rule. */
export function StatFigure({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold tabular-nums text-foreground">{value}</span>
      {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function LinkModeToggle({ mode, onChange }: { mode: LinkMode; onChange: (mode: LinkMode) => void }) {
  const options: Array<{ id: LinkMode; label: string; title: string }> = [
    { id: 'strong', label: 'Clear links', title: 'Slash commands, bundle paths, backticked names, and names called a skill' },
    { id: 'all', label: 'All mentions', title: 'Also include a skill name appearing anywhere in the prose' },
  ];

  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5 text-xs">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          title={option.title}
          onClick={() => onChange(option.id)}
          className={cn(
            'rounded-md px-2.5 py-1 transition-colors',
            mode === option.id ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function RefreshButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={disabled} className="gap-1.5">
      <ArrowsClockwiseIcon size={14} />
      Rescan
    </Button>
  );
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <Card className="flex flex-col items-center gap-3 p-10 text-center">
      <WarningCircleIcon size={22} className="text-destructive" />
      <p className="text-sm text-foreground">Could not read your skills.</p>
      <p className="max-w-md text-xs text-muted-foreground">{error.message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </Card>
  );
}

export function EmptyState() {
  return (
    <Card className="flex flex-col items-center gap-2 p-10 text-center">
      <p className="text-sm text-foreground">No skills on this account yet.</p>
      <p className="max-w-md text-xs text-muted-foreground">
        Install a skill from the store or write one, then come back to see how it connects.
      </p>
    </Card>
  );
}
