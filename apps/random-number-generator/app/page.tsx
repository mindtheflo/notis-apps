'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNotis } from '@notis/sdk';
import {
  Dices,
  Sparkles,
  History,
  ArrowRight,
  Hash,
  Percent,
  Infinity as InfinityIcon,
  RefreshCw,
} from 'lucide-react';
import { cn, formatNumber, relativeTime } from '@/lib/utils';
import { type Mode, type Roll, roll } from '@/lib/rng';
import { normalizeRollRecord, sortRollRecordsDesc } from '@/lib/roll-record';
import { usePersistRoll, useRollDocuments } from '@/lib/notis-tools';

const MODES: Array<{ id: Mode; label: string; icon: typeof Hash; hint: string }> = [
  { id: 'integer', label: 'Integer', icon: Hash,        hint: 'Whole numbers only' },
  { id: 'decimal', label: 'Decimal', icon: Percent,     hint: 'Continuous range'   },
  { id: 'dice',    label: 'Dice',    icon: Dices,       hint: 'Classic 1–N roll'   },
];

export default function HomePage() {
  const { app, ready } = useNotis();
  const { documents, loading, refetch } = useRollDocuments();
  const { persist: persistRoll } = usePersistRoll();

  const [mode, setMode] = useState<Mode>('integer');
  const [min, setMin] = useState(1);
  const [max, setMax] = useState(100);
  const [current, setCurrent] = useState<Roll | null>(null);
  const [rolling, setRolling] = useState(false);

  const recent = useMemo(
    () => documents
      .map(normalizeRollRecord)
      .sort(sortRollRecordsDesc)
      .slice(0, 5),
    [documents],
  );

  const persist = useCallback(async (next: Roll) => {
    await persistRoll(next);
    refetch();
  }, [persistRoll, refetch]);

  const generate = useCallback(async () => {
    if (rolling) return;
    setRolling(true);
    const next = roll(min, max, mode);
    setCurrent(next);
    try {
      await persist(next);
    } finally {
      setRolling(false);
    }
  }, [rolling, min, max, mode, persist]);

  useEffect(() => {
    if (mode === 'dice') {
      setMin(1);
      setMax(6);
    }
  }, [mode]);

  return (
    <main className="notis-random-shell space-y-8">
      <header className="flex items-start justify-between gap-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            <span>{ready ? app?.name : 'Loading…'}</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Generator</h1>
          <p className="text-sm text-muted-foreground max-w-md">
            Pick a mode, set the range, and press generate. Every roll is saved to the History view.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh
        </button>
      </header>

      <section className="rounded-2xl border border-border bg-card p-8">
        <div className="flex flex-col items-center gap-6">
          <div
            className={cn(
              'flex items-center justify-center rounded-full border border-border bg-background',
              'h-48 w-48 transition-transform',
              rolling && 'animate-pulse',
            )}
          >
            {current ? (
              <span className="font-mono text-5xl font-semibold tabular-nums text-foreground">
                {formatNumber(current.value)}
              </span>
            ) : (
              <InfinityIcon className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
            )}
          </div>
          <button
            type="button"
            onClick={generate}
            disabled={rolling}
            className={cn(
              'inline-flex h-11 items-center gap-2 rounded-full px-6 text-sm font-medium',
              'bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition',
            )}
          >
            <Dices className="h-4 w-4" />
            {rolling ? 'Rolling…' : current ? 'Roll again' : 'Generate'}
          </button>
          {current && (
            <p className="text-xs text-muted-foreground">
              <span className="font-mono">[{formatNumber(current.min)}, {formatNumber(current.max)}]</span>
              {' · '}{current.mode}
            </p>
          )}
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-medium text-foreground">Mode</h2>
          <div className="grid gap-2">
            {MODES.map(({ id, label, icon: Icon, hint }) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={cn(
                  'flex items-center gap-3 rounded-md border px-3 py-2.5 text-left transition',
                  mode === id
                    ? 'border-foreground bg-accent text-accent-foreground'
                    : 'border-border hover:bg-accent/50',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{label}</div>
                  <div className="text-xs text-muted-foreground">{hint}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h2 className="text-sm font-medium text-foreground">Range</h2>
          <div className="grid grid-cols-2 gap-3">
            <RangeInput label="Minimum" value={min} onChange={setMin} disabled={mode === 'dice'} />
            <RangeInput label="Maximum" value={max} onChange={setMax} disabled={mode === 'dice'} />
          </div>
          {mode === 'dice' && (
            <p className="text-xs text-muted-foreground">Dice mode locks to 1–6.</p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <header className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
            <History className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            Recent rolls
          </h2>
          <a
            href="/history"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            View all <ArrowRight className="h-3 w-3" />
          </a>
        </header>
        {loading && recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : recent.length === 0 ? (
          <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            Nothing rolled yet. Press Generate to see history here.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-lg tabular-nums text-foreground">{formatNumber(r.value)}</span>
                  <span className="text-xs text-muted-foreground">{r.mode}</span>
                </div>
                <span className="text-xs text-muted-foreground">{relativeTime(r.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function RangeInput({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className={cn('block space-y-1.5', disabled && 'opacity-50')}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type="number"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const parsed = Number(e.target.value);
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
        className="h-10 w-full rounded-md border border-border bg-background px-3 font-mono text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
    </label>
  );
}
