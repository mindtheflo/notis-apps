'use client';

import { useEffect, useMemo, useState } from 'react';
import { useNotisNavigation, useTopBarSearch } from '@notis/sdk';
import {
  ArrowClockwiseIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  CurrencyDollarIcon,
  FunnelIcon,
  PaperPlaneTiltIcon,
  SparkleIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  PIPELINE,
  SEGMENTS,
  compactNumber,
  money,
  statusTone,
  type AffiliateProspect,
} from '@/lib/affiliate-data';
import { useAffiliateProspects } from '@/lib/notis-tools';

export default function DashboardPage() {
  const { prospects, loading, error, refetch } = useAffiliateProspects();
  const navigation = useNotisNavigation();
  const [search, setSearch] = useState('');
  const { setLoading } = useTopBarSearch({
    value: search,
    onChange: setSearch,
    placeholder: 'Filter affiliate prospects…',
  });
  useEffect(() => setLoading(loading), [loading, setLoading]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return prospects;
    return prospects.filter((prospect) =>
      [prospect.name, prospect.company, prospect.segment, prospect.status, prospect.source]
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }, [prospects, search]);

  const metrics = useMemo(() => {
    const qualified = prospects.filter((p) => p.fitScore >= 75 && p.status !== 'Disqualified').length;
    const active = prospects.filter((p) => p.status === 'Activated').length;
    const conversations = prospects.filter((p) =>
      ['Replied', 'Interested', 'Applied', 'Activated'].includes(p.status),
    ).length;
    const mrr = prospects.reduce((sum, p) => sum + p.attributedMrr, 0);
    return { qualified, active, conversations, mrr };
  }, [prospects]);

  const priority = useMemo(
    () =>
      [...filtered]
        .filter((p) => !p.optedOut && !['Activated', 'Disqualified'].includes(p.status))
        .sort((a, b) => b.fitScore - a.fitScore)
        .slice(0, 6),
    [filtered],
  );

  const segmentRows = useMemo(
    () =>
      SEGMENTS.map((segment) => {
        const rows = prospects.filter((p) => p.segment === segment.name);
        const engaged = rows.filter((p) => ['Replied', 'Interested', 'Applied', 'Activated'].includes(p.status)).length;
        return { ...segment, total: rows.length, engaged };
      }).sort((a, b) => b.total - a.total),
    [prospects],
  );

  return (
    <main data-store-screenshot="dashboard" className="affiliate-app-shell space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <SparkleIcon size={14} weight="fill" />
            Affiliate recruiting control center
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Campaign dashboard</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            One place to source, qualify, contact, and activate affiliates—while Notis watches the
            pipeline and local Codex workers do the heavy research.
          </p>
        </div>
        <button
          type="button"
          onClick={refetch}
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <ArrowClockwiseIcon className={loading ? 'animate-spin' : ''} size={16} />
          Refresh
        </button>
      </header>

      {error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error.message}
        </div>
      ) : null}

      <section className="affiliate-stat-grid gap-3">
        <Metric icon={UsersThreeIcon} label="Prospects" value={compactNumber(prospects.length)} />
        <Metric icon={FunnelIcon} label="Qualified" value={compactNumber(metrics.qualified)} />
        <Metric icon={PaperPlaneTiltIcon} label="Conversations" value={compactNumber(metrics.conversations)} />
        <Metric icon={CheckCircleIcon} label="Activated" value={compactNumber(metrics.active)} />
        <Metric icon={CurrencyDollarIcon} label="Attributed MRR" value={money(metrics.mrr)} />
      </section>

      <section className="affiliate-dashboard-grid gap-4">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Priority queue</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Highest-fit prospects needing a next action.</p>
            </div>
            <button
              type="button"
              onClick={() => navigation.toRoute('/prospects')}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              All prospects <ArrowRightIcon size={13} />
            </button>
          </CardHeader>
          <CardContent>
            {loading && !prospects.length ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading the pipeline…</p>
            ) : priority.length ? (
              <div className="divide-y divide-border">
                {priority.map((prospect) => <PriorityRow key={prospect.id} prospect={prospect} />)}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                No prospects need attention.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pipeline</CardTitle>
            <p className="text-xs text-muted-foreground">Current distribution across recruiting stages.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {PIPELINE.slice(0, 9).map((status) => {
              const count = prospects.filter((p) => p.status === status).length;
              const width = prospects.length ? Math.max((count / prospects.length) * 100, count ? 4 : 0) : 0;
              return (
                <div key={status}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{status}</span>
                    <span className="font-medium tabular-nums">{count}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Segment coverage</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Where the campaign is deep—and where sourcing should run next.</p>
          </div>
          <button
            type="button"
            onClick={() => navigation.toRoute('/segments')}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Playbooks <ArrowRightIcon size={13} />
          </button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {segmentRows.map((segment) => (
              <div key={segment.name} className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium">{segment.short}</p>
                <p className="mt-1 text-xs text-muted-foreground">{segment.source}</p>
                <div className="mt-3 flex items-end justify-between">
                  <span className="text-2xl font-semibold tabular-nums">{segment.total}</span>
                  <span className="text-xs text-muted-foreground">{segment.engaged} engaged</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UsersThreeIcon;
  label: string;
  value: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        </div>
        <div className="rounded-lg bg-muted p-2 text-muted-foreground">
          <Icon size={18} />
        </div>
      </div>
    </Card>
  );
}

function PriorityRow({ prospect }: { prospect: AffiliateProspect }) {
  return (
    <div className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
          {prospect.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('')}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{prospect.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {prospect.company || prospect.segment} · {prospect.nextAction || 'Review qualification'}
          </p>
        </div>
      </div>
      <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${statusTone(prospect.status)}`}>
        {prospect.status}
      </span>
      <span className="w-12 text-right text-sm font-semibold tabular-nums">{prospect.fitScore}</span>
    </div>
  );
}
