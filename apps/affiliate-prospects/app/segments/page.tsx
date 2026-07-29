'use client';

import { useMemo } from 'react';
import {
  ArrowSquareOutIcon,
  ChartLineUpIcon,
  CheckCircleIcon,
  MagnifyingGlassIcon,
  UsersIcon,
} from '@phosphor-icons/react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SEGMENTS, compactNumber } from '@/lib/affiliate-data';
import { useAffiliateProspects } from '@/lib/notis-tools';

export default function SegmentsPage() {
  const { prospects, loading, error } = useAffiliateProspects();
  const segments = useMemo(
    () =>
      SEGMENTS.map((segment) => {
        const rows = prospects.filter((prospect) => prospect.segment === segment.name);
        const qualified = rows.filter((prospect) => prospect.fitScore >= 75 && prospect.status !== 'Disqualified').length;
        const activated = rows.filter((prospect) => prospect.status === 'Activated').length;
        const reach = rows.reduce((sum, prospect) => sum + prospect.audienceSize + prospect.trafficEstimate, 0);
        return { ...segment, total: rows.length, qualified, activated, reach };
      }),
    [prospects],
  );

  return (
    <main data-store-screenshot="segments" className="affiliate-app-shell space-y-6">
      <header>
        <p className="text-xs font-medium text-muted-foreground">Seven focused acquisition motions</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Recruiting segments</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Each segment has its own sourcing signal, qualification model, and outreach playbook in
          <span className="font-medium text-foreground"> campaign/affiliate-network/segments</span>.
        </p>
      </header>

      {error ? (
        <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error.message}</p>
      ) : null}
      {loading && !prospects.length ? (
        <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
          Loading segment coverage…
        </p>
      ) : null}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {segments.map((segment, index) => (
          <Card key={segment.name}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Segment {index + 1}
                  </p>
                  <CardTitle className="mt-1 text-base">{segment.name}</CardTitle>
                </div>
                <div className="rounded-lg bg-muted p-2 text-muted-foreground">
                  <UsersIcon size={18} />
                </div>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{segment.description}</p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                <Kpi icon={MagnifyingGlassIcon} value={segment.total} label="Found" />
                <Kpi icon={ChartLineUpIcon} value={segment.qualified} label="Qualified" />
                <Kpi icon={CheckCircleIcon} value={segment.activated} label="Active" />
              </div>
              <div className="mt-4 rounded-lg bg-muted/50 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Primary source</p>
                <p className="mt-1 text-sm font-medium">{segment.source}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Combined discoverable reach: {compactNumber(segment.reach)}
                </p>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span>Playbook is source-controlled</span>
                <ArrowSquareOutIcon size={14} />
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  );
}

function Kpi({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof UsersIcon;
  value: number;
  label: string;
}) {
  return (
    <div className="rounded-lg border border-border p-2.5">
      <Icon size={14} className="text-muted-foreground" />
      <p className="mt-2 text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
