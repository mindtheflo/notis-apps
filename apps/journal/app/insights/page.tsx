'use client';

import { useMemo } from 'react';
import { useNotisNavigation } from '@notis/sdk';
import {
  BedIcon,
  CheckCircleIcon,
  ForkKnifeIcon,
  LightningIcon,
  NotebookIcon,
  PillIcon,
  SmileyIcon,
  TrendUpIcon,
} from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  APPETITES,
  APPETITE_COLOR,
  MOODS,
  average,
  dayKey,
  formatDay,
  medActiveHours,
  minutesOfDay,
  moodMeta,
  useJournalEntries,
  type JournalEntry,
} from '../journal-core';
import { EmptyState, LoadingState, SectionCard, StatTile } from '../journal-ui';

export default function InsightsPage() {
  const { entries, loading, error } = useJournalEntries();
  const navigation = useNotisNavigation();

  const chrono = useMemo(() => [...entries].reverse(), [entries]); // oldest -> newest
  const recent = useMemo(() => chrono.slice(-21), [chrono]); // last ~3 weeks for trends

  const totals = useMemo(() => summarize(entries), [entries]);
  const moodCounts = useMemo(() => countBy(entries, (e) => e.mood), [entries]);
  const morningMoodCounts = useMemo(() => countBy(entries, (e) => e.morningMood), [entries]);
  const appetiteCounts = useMemo(() => countBy(entries, (e) => e.appetite), [entries]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-8">
        <LoadingState label="Crunching your journal…" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <TrendUpIcon size={14} weight="bold" />
            Journal
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Insights</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Patterns across {entries.length} {entries.length === 1 ? 'entry' : 'entries'} — how mood,
            energy, and medication track together.
          </p>
        </div>
        <Button variant="outline" onClick={() => navigation.toRoute('/')} className="gap-1.5">
          <NotebookIcon size={16} weight="bold" />
          Back to journal
        </Button>
      </header>

      {error ? (
        <p className="mt-6 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}

      {entries.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={TrendUpIcon}
            title="No data to chart yet"
            description="Tell Notis about your day for a few days and your trends will appear here."
            action={
              <Button onClick={() => navigation.toRoute('/')} className="gap-1.5">
                <NotebookIcon size={16} weight="bold" />
                Open journal
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile label="Entries" value={entries.length} icon={NotebookIcon} />
            <StatTile
              label="Avg mood"
              value={totals.mood != null ? `${totals.mood}` : '—'}
              suffix={totals.mood != null ? '/ 5' : undefined}
              icon={SmileyIcon}
              accent="#10b981"
            />
            <StatTile
              label="Avg motivation"
              value={totals.motivation ?? '—'}
              suffix={totals.motivation != null ? '/ 10' : undefined}
              icon={LightningIcon}
              accent="#3b82f6"
            />
            <StatTile
              label="Avg sleepiness"
              value={totals.sleepiness ?? '—'}
              suffix={totals.sleepiness != null ? '/ 10' : undefined}
              icon={BedIcon}
              accent="#6366f1"
            />
            <StatTile
              label="Tasks total"
              value={totals.tasks}
              icon={CheckCircleIcon}
              accent="#8b5cf6"
            />
            <StatTile
              label="Med window"
              value={totals.medHours ?? '—'}
              suffix={totals.medHours != null ? 'h avg' : undefined}
              icon={PillIcon}
              accent="#0ea5e9"
            />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <SectionCard
              title="Motivation & sleepiness"
              description="Daily levels over your last entries"
              icon={LightningIcon}
              className="lg:col-span-2"
            >
              <TrendColumns entries={recent} />
              <div className="mt-3 flex items-center gap-4 text-[11px] text-muted-foreground">
                <LegendSwatch color="#3b82f6" label="Motivation" />
                <LegendSwatch color="#6366f1" label="Sleepiness" />
                <span className="ml-auto">Scale 1–10</span>
              </div>
            </SectionCard>

            <SectionCard title="Morning mood" description="How you woke up" icon={SmileyIcon}>
              <DistributionBars
                rows={MOODS.map((m) => ({
                  label: m.name,
                  count: morningMoodCounts.get(m.name) ?? 0,
                  color: m.color,
                }))}
                total={entries.length}
              />
            </SectionCard>

            <SectionCard title="Overall mood" description="How the day felt in the end" icon={SmileyIcon}>
              <DistributionBars
                rows={MOODS.map((m) => ({
                  label: m.name,
                  count: moodCounts.get(m.name) ?? 0,
                  color: m.color,
                }))}
                total={entries.length}
              />
            </SectionCard>

            <SectionCard
              title="Appetite"
              description="Reported appetite across days"
              icon={ForkKnifeIcon}
              className="lg:col-span-2"
            >
              <DistributionBars
                rows={APPETITES.map((a) => ({
                  label: a,
                  count: appetiteCounts.get(a) ?? 0,
                  color: APPETITE_COLOR[a],
                }))}
                total={entries.length}
              />
            </SectionCard>

            <SectionCard
              title="Meaningful tasks"
              description="Tasks completed per day"
              icon={CheckCircleIcon}
              className="lg:col-span-2"
            >
              <TaskBars entries={recent} />
            </SectionCard>

            <SectionCard
              title="Medication active window"
              description="When medication was working, on a 24-hour day"
              icon={PillIcon}
              className="lg:col-span-2"
            >
              <MedTimeline entries={recent} />
            </SectionCard>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

function TrendColumns({ entries }: { entries: JournalEntry[] }) {
  if (!entries.length) return <NoData />;
  const summary = entries
    .map((entry) => `${formatDay(entry.date)}: motivation ${entry.motivation ?? 'not logged'}, sleepiness ${entry.sleepiness ?? 'not logged'}`)
    .join('; ');
  return (
    <div
      className="flex items-end gap-1.5 overflow-x-auto pb-1"
      style={{ height: 168 }}
      role="img"
      aria-label={`Motivation and sleepiness by day. ${summary}`}
    >
      {entries.map((entry) => {
        const mot = entry.motivation ?? 0;
        const slp = entry.sleepiness ?? 0;
        return (
          <div key={entry.id} className="flex min-w-[26px] flex-1 flex-col items-center gap-1.5">
            <div className="flex h-[128px] w-full items-end justify-center gap-1">
              <Bar fraction={mot / 10} color="#3b82f6" title={`Motivation ${mot || '—'}`} />
              <Bar fraction={slp / 10} color="#6366f1" title={`Sleepiness ${slp || '—'}`} />
            </div>
            <span className="text-[9px] text-muted-foreground">{shortDay(entry.date)}</span>
          </div>
        );
      })}
    </div>
  );
}

function Bar({ fraction, color, title }: { fraction: number; color: string; title: string }) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <div className="flex h-full w-2.5 items-end" title={title}>
      <div
        className="w-full rounded-t-sm transition-all"
        style={{ height: `${Math.max(pct, fraction > 0 ? 4 : 0)}%`, backgroundColor: color }}
      />
    </div>
  );
}

function TaskBars({ entries }: { entries: JournalEntry[] }) {
  if (!entries.length) return <NoData />;
  const max = Math.max(1, ...entries.map((e) => e.meaningfulTasks ?? 0));
  const summary = entries
    .map((entry) => `${formatDay(entry.date)}: ${entry.meaningfulTasks ?? 'not logged'} meaningful tasks`)
    .join('; ');
  return (
    <div
      className="flex items-end gap-1.5 overflow-x-auto pb-1"
      style={{ height: 140 }}
      role="img"
      aria-label={`Meaningful tasks by day. ${summary}`}
    >
      {entries.map((entry) => {
        const value = entry.meaningfulTasks ?? 0;
        return (
          <div key={entry.id} className="flex min-w-[26px] flex-1 flex-col items-center gap-1.5">
            <div className="flex h-[104px] w-full items-end justify-center">
              <div
                className="w-4/5 rounded-t-md transition-all"
                style={{
                  height: `${(value / max) * 100}%`,
                  minHeight: value > 0 ? 4 : 0,
                  backgroundColor: '#8b5cf6',
                }}
                title={`${value} tasks`}
              />
            </div>
            <span className="text-[10px] font-medium tabular-nums text-muted-foreground">{value || ''}</span>
            <span className="text-[9px] text-muted-foreground">{shortDay(entry.date)}</span>
          </div>
        );
      })}
    </div>
  );
}

function MedTimeline({ entries }: { entries: JournalEntry[] }) {
  const withWindow = entries.filter((e) => {
    const on = minutesOfDay(e.medOnset);
    const off = minutesOfDay(e.medWoreOff);
    return on != null && off != null && off > on;
  });
  if (!withWindow.length) return <NoData label="No medication windows logged in this range" />;
  const summary = withWindow
    .map((entry) => `${formatDay(entry.date)}: ${medActiveHours(entry)} hours active`)
    .join('; ');
  return (
    <div role="img" aria-label={`Medication active windows. ${summary}`}>
      <div className="mb-2 flex justify-between px-[76px] text-[9px] text-muted-foreground">
        {['12a', '6a', '12p', '6p', '12a'].map((t, index) => (
          <span key={`${t}-${index}`}>{t}</span>
        ))}
      </div>
      <div className="space-y-1.5">
        {withWindow.map((entry) => {
          const on = minutesOfDay(entry.medOnset)!;
          const off = minutesOfDay(entry.medWoreOff)!;
          return (
            <div key={entry.id} className="flex items-center gap-2">
              <span className="w-[68px] shrink-0 text-[10px] text-muted-foreground">
                {formatDay(entry.date, { weekday: true })}
              </span>
              <div className="relative h-3 flex-1 rounded-full bg-muted">
                <div
                  className="absolute inset-y-0 rounded-full"
                  style={{
                    left: `${(on / 1440) * 100}%`,
                    width: `${((off - on) / 1440) * 100}%`,
                    backgroundColor: '#0ea5e9',
                  }}
                  title={`${medActiveHours(entry)}h active`}
                />
              </div>
              <span className="w-9 shrink-0 text-right text-[10px] font-medium tabular-nums text-muted-foreground">
                {medActiveHours(entry)}h
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DistributionBars({
  rows,
  total,
}: {
  rows: Array<{ label: string; count: number; color: string }>;
  total: number;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="space-y-2.5">
      {rows.map((row) => {
        const pct = total > 0 ? Math.round((row.count / total) * 100) : 0;
        return (
          <div
            key={row.label}
            className="flex items-center gap-3"
            aria-label={`${row.label}: ${row.count} entries, ${pct} percent`}
          >
            <span className="w-16 shrink-0 text-xs font-medium">{row.label}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${(row.count / max) * 100}%`, backgroundColor: row.color }}
              />
            </div>
            <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
              {row.count} · {pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function NoData({ label = 'Not enough data yet' }: { label?: string }) {
  return (
    <div className={cn('flex items-center justify-center py-10 text-xs text-muted-foreground')}>
      {label}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function summarize(entries: JournalEntry[]) {
  return {
    mood: average(entries.map((e) => moodMeta(e.mood)?.score ?? null)),
    motivation: average(entries.map((e) => e.motivation)),
    sleepiness: average(entries.map((e) => e.sleepiness)),
    tasks: entries.reduce((sum, e) => sum + (e.meaningfulTasks ?? 0), 0),
    medHours: average(entries.map((e) => medActiveHours(e))),
  };
}

function countBy(entries: JournalEntry[], pick: (e: JournalEntry) => string | null): Map<string, number> {
  const map = new Map<string, number>();
  for (const entry of entries) {
    const key = pick(entry);
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

function shortDay(value: string | null): string {
  const key = dayKey(value);
  if (!key) return '';
  const [, m, d] = key.split('-');
  return `${Number(m)}/${Number(d)}`;
}
