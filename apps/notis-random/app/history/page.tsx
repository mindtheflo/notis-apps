'use client';

import { useMemo } from 'react';
import { useDatabase } from '@notis/sdk';
import { Dices, History, Hash, Percent } from 'lucide-react';
import { formatNumber, relativeTime } from '@/lib/utils';
import type { Mode } from '@/lib/rng';

const MODE_ICONS: Record<Mode, typeof Hash> = {
  integer: Hash,
  decimal: Percent,
  dice: Dices,
};

export default function HistoryPage() {
  const { documents, loading } = useDatabase('rolls');

  const rows = useMemo(
    () => documents.map((doc) => ({
      id: doc.id,
      value: Number(doc.properties?.['Value'] ?? 0),
      mode: String(doc.properties?.['Mode'] ?? 'integer') as Mode,
      min: Number(doc.properties?.['Min'] ?? 0),
      max: Number(doc.properties?.['Max'] ?? 0),
      at: String(doc.properties?.['Rolled At'] ?? doc.createdAt ?? ''),
    })),
    [documents],
  );

  return (
    <main className="notis-random-shell space-y-6">
      <header className="flex items-center gap-2 text-sm text-muted-foreground">
        <History className="h-4 w-4" strokeWidth={1.5} />
        <span>Roll history</span>
      </header>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        {rows.length} {rows.length === 1 ? 'roll' : 'rolls'}
      </h1>

      {loading && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          Nothing rolled yet. Head back to the generator and press Generate.
        </div>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {rows.map((row) => {
            const Icon = MODE_ICONS[row.mode] ?? Hash;
            return (
              <div key={row.id} className="flex items-center gap-4 px-5 py-3.5">
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" strokeWidth={1.5} />
                <span className="font-mono text-lg tabular-nums text-foreground">{formatNumber(row.value)}</span>
                <div className="flex-1 min-w-0 text-xs text-muted-foreground">
                  <span className="font-mono">[{formatNumber(row.min)}, {formatNumber(row.max)}]</span>
                  {' · '}{row.mode}
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{relativeTime(row.at)}</span>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
