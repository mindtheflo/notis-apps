'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTopBarSearch } from '@notis/sdk';
import { ArrowClockwiseIcon, CalendarBlankIcon, EnvelopeSimpleIcon, LinkedinLogoIcon } from '@phosphor-icons/react';

import { Card } from '@/components/ui/card';
import { compactNumber, statusTone } from '@/lib/affiliate-data';
import { useAffiliateProspects } from '@/lib/notis-tools';

export default function ProspectsPage() {
  const { prospects, loading, error, refetch } = useAffiliateProspects();
  const [search, setSearch] = useState('');
  const { setLoading } = useTopBarSearch({
    value: search,
    onChange: setSearch,
    placeholder: 'Search name, company, segment, status, or source…',
  });
  useEffect(() => setLoading(loading), [loading, setLoading]);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...prospects]
      .filter((prospect) =>
        !query ||
        [prospect.name, prospect.company, prospect.segment, prospect.status, prospect.source]
          .join(' ')
          .toLowerCase()
          .includes(query),
      )
      .sort((a, b) => b.fitScore - a.fitScore);
  }, [prospects, search]);

  return (
    <main data-store-screenshot="prospects" className="affiliate-app-shell space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Affiliate recruiting CRM</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{rows.length} prospects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ask Notis to add, enrich, qualify, or move prospects; this view stays the reference layer.
          </p>
        </div>
        <button
          type="button"
          onClick={refetch}
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowClockwiseIcon className={loading ? 'animate-spin' : ''} size={16} />
          Refresh
        </button>
      </header>

      {error ? <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error.message}</p> : null}

      <Card className="affiliate-desktop-table overflow-x-auto">
        <table className="affiliate-data-table w-full border-collapse text-left">
          <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Prospect</th>
              <th className="px-4 py-3 font-medium">Segment</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Fit</th>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium">Next action</th>
              <th className="px-4 py-3 font-medium">Reach</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((prospect) => (
              <tr key={prospect.id} className="transition hover:bg-muted/30">
                <td className="px-4 py-3">
                  <p className="text-sm font-medium">{prospect.name}</p>
                  <p className="text-xs text-muted-foreground">{prospect.company || prospect.website}</p>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{prospect.segment}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${statusTone(prospect.status)}`}>
                    {prospect.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums">{prospect.fitScore}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{prospect.source}</td>
                <td className="px-4 py-3">
                  <p className="max-w-52 truncate text-xs">{prospect.nextAction || '—'}</p>
                  <p className="text-[11px] text-muted-foreground">{formatDate(prospect.nextActionDate)}</p>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    {prospect.email ? <EnvelopeSimpleIcon size={15} /> : null}
                    {prospect.linkedInUrl ? <LinkedinLogoIcon size={15} /> : null}
                    <span className="text-[11px]">{compactNumber(prospect.audienceSize || prospect.trafficEstimate)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="affiliate-mobile-cards space-y-3">
        {rows.map((prospect) => (
          <Card key={prospect.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{prospect.name}</p>
                <p className="truncate text-xs text-muted-foreground">{prospect.company || prospect.segment}</p>
              </div>
              <span className="text-sm font-semibold tabular-nums">{prospect.fitScore}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${statusTone(prospect.status)}`}>
                {prospect.status}
              </span>
              <span className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">{prospect.segment}</span>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarBlankIcon size={14} />
              {prospect.nextAction || 'Review qualification'} · {formatDate(prospect.nextActionDate)}
            </div>
          </Card>
        ))}
      </div>
    </main>
  );
}

function formatDate(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date);
}
