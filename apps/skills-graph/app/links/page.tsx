'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { NotisSelectionBoundary, ViewSkeleton, useActiveResource, useNotisRuntime, useTopBarSearch } from '@notis/sdk';
import { useCollectionInteractions } from '@notis/sdk/interactions';
import { ArrowRightIcon, ArrowSquareOutIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { Input } from '@/components/ui/input';
import { PageHeading } from '@/components/page-heading';
import { EmptyState, ErrorState, LinkModeToggle, RefreshButton } from '@/components/graph-chrome';
import { clusterColor, isolatedNodes, linkRows, rankedNodes } from '@/lib/graph-view';
import { LINK_KIND_LABEL, graphStats, type SkillNode } from '@/lib/skill-links';
import { skillEditorUrl } from '@/lib/skills-api';
import { useSkillGraph, type LinkMode } from '@/lib/use-skill-graph';
import { cn } from '@/lib/utils';

/** Bare label + figure, used for a page's stat row when it already has other panels. */
function StatFigure({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold tabular-nums text-foreground">{value}</span>
      {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

function RankColumn({ title, nodes, metric }: { title: string; nodes: SkillNode[]; metric: 'incoming' | 'outgoing' }) {
  return (
    <div className="min-w-0">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {nodes.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Nothing yet.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {nodes.map((node) => (
            <li key={node.id} className="flex items-center gap-2 text-sm">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: clusterColor(node.cluster) }} aria-hidden />
              <span className="min-w-0 truncate text-foreground">{node.name}</span>
              <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">{node[metric]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function LinksPage() {
  const runtime = useNotisRuntime();
  const [mode, setMode] = useState<LinkMode>('strong');
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { graph, skills, loading, isFetching, hasData, error, reload } = useSkillGraph(mode);
  const stats = useMemo(() => graphStats(graph), [graph]);
  const rows = useMemo(() => linkRows(graph, query), [graph, query]);
  const isolated = useMemo(() => isolatedNodes(graph), [graph]);
  const collection = useCollectionInteractions({
    items: rows,
    getId: ({ link }) => `${link.sourceId}->${link.targetId}`,
    selectionMode: 'none',
    activeId: expandedId,
    onActiveIdChange: setExpandedId,
  });
  const activeRow = useMemo(
    () => rows.find(({ link }) => `${link.sourceId}->${link.targetId}` === expandedId) ?? null,
    [expandedId, rows],
  );
  const contextResource = useMemo(() => activeRow ? ({
    id: `${activeRow.link.sourceId}->${activeRow.link.targetId}`,
    kind: 'skill_link',
    label: `${activeRow.source.name} → ${activeRow.target.name}`,
    attributes: {
      source_skill_id: activeRow.link.sourceId,
      target_skill_id: activeRow.link.targetId,
      mentions: activeRow.link.mentions,
      mode,
    },
  }) : null, [activeRow, mode]);
  useActiveResource(contextResource);

  const hasTopBar = Boolean(runtime?.registerTopBarSearch);
  const onSearchChange = useCallback((value: string) => setQuery(value), []);
  useTopBarSearch({ value: query, onChange: onSearchChange, placeholder: 'Filter by skill or line…' });

  // First read still in flight, nothing has resolved yet: keep the heading
  // and actions visible, only the content region below becomes a skeleton.
  const showSkeleton = loading;
  // The first read failed before any cached data existed.
  const showFirstLoadError = Boolean(error) && !hasData;
  // A background refresh failed after cached data already existed: keep
  // showing that content and surface a scoped, retryable banner above it.
  const showRefreshError = Boolean(error) && hasData;
  const showEmpty = hasData && skills.length === 0;
  const showContent = hasData && skills.length > 0;

  return (
    <div className="skill-graph-shell flex flex-col gap-8" data-store-screenshot="links">
      <div className="flex flex-col gap-3">
        <PageHeading
          title="Links"
          description="Every reference one skill makes to another, with the line it was found on."
          actions={
            <>
              {!hasTopBar && (
                <div className="relative">
                  <MagnifyingGlassIcon size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Filter by skill or line…"
                    className="h-9 w-56 pl-8 text-sm"
                  />
                </div>
              )}
              <LinkModeToggle mode={mode} onChange={setMode} />
              <RefreshButton onClick={reload} disabled={isFetching} />
            </>
          }
        />

        {showRefreshError && error && (
          <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error.message}{' '}
            <button type="button" className="font-medium underline" onClick={reload}>Retry</button>
          </p>
        )}
      </div>

      {showSkeleton ? (
        <ViewSkeleton variant="table" rows={6} />
      ) : showFirstLoadError && error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : showEmpty ? (
        <EmptyState />
      ) : showContent ? (
        <>
          <div className="flex flex-wrap items-start gap-x-10 gap-y-4">
            <StatFigure label="Links" value={stats.links} />
            <StatFigure label="Connected" value={`${stats.connected}/${stats.skills}`} hint="Skills with at least one link" />
            <StatFigure label="Most referenced" value={stats.mostReferenced?.incoming ?? 0} hint={stats.mostReferenced?.name} />
            <StatFigure label="Standalone" value={stats.isolated} hint="No link in either direction" />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <RankColumn title="Referenced the most" nodes={rankedNodes(graph, 'incoming', 6)} metric="incoming" />
            <RankColumn title="References the most" nodes={rankedNodes(graph, 'outgoing', 6)} metric="outgoing" />
          </div>

          <div {...collection.getContainerProps()}>
            <div className="hidden grid-cols-[1.2fr_1.2fr_140px_2fr] gap-3 border-b border-border/60 px-2 pb-1.5 text-xs font-medium text-muted-foreground lg:grid">
              <span>Skill</span>
              <span>References</span>
              <span>Signal</span>
              <span>Found on</span>
            </div>

            <div role="list" aria-label="Skill links" className="flex flex-col">
              {rows.length === 0 && (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground">No links match this filter.</p>
              )}

              {rows.map(({ link, source, target }) => {
                const rowId = `${link.sourceId}->${link.targetId}`;
                const expanded = expandedId === rowId;
                const rowResource = {
                  id: rowId,
                  kind: 'skill_link',
                  label: `${source.name} → ${target.name}`,
                  attributes: {
                    source_skill_id: link.sourceId,
                    target_skill_id: link.targetId,
                    mentions: link.mentions,
                    mode,
                  },
                };
                const evidence = (expanded ? link.evidence : link.evidence.slice(0, 1)).map((item, index) => (
                  <p key={index} className={index > 0 ? 'mt-1.5' : undefined}>
                    {item.snippet}
                  </p>
                ));
                const moreEvidence = !expanded && link.evidence.length > 1 && (
                  <p className="mt-1 text-xs text-muted-foreground/80">
                    +{link.evidence.length - 1} more line{link.evidence.length > 2 ? 's' : ''}
                  </p>
                );

                return (
                  <div
                    key={rowId}
                    {...collection.getItemProps(rowId)}
                    role="listitem"
                    onClick={() => setExpandedId(expanded ? null : rowId)}
                    className={cn('list-row cursor-pointer py-2.5', expanded && 'list-row-selected')}
                  >
                    {/* Stacked layout below lg */}
                    <div className="flex min-w-0 flex-col gap-1 lg:hidden">
                      <div className="flex min-w-0 items-center gap-1.5 text-sm">
                        <span className="min-w-0 truncate text-foreground">{source.name}</span>
                        <ArrowRightIcon size={12} className="shrink-0 text-muted-foreground" />
                        <span className="min-w-0 truncate text-foreground">{target.name}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {LINK_KIND_LABEL[link.evidence[0].kind]}
                        {link.mentions > 1 ? ` · ${link.mentions}` : ''}
                      </p>
                      <NotisSelectionBoundary resource={rowResource} className="min-w-0 text-xs text-muted-foreground">
                        {evidence}
                        {moreEvidence}
                      </NotisSelectionBoundary>
                    </div>

                    {/* Column layout at lg and above */}
                    <div className="hidden min-w-0 gap-3 lg:grid lg:grid-cols-[1.2fr_1.2fr_140px_2fr] lg:items-start">
                      <div className="min-w-0 truncate text-sm text-foreground">{source.name}</div>
                      <div className="flex min-w-0 items-center gap-1.5 text-sm text-foreground">
                        <ArrowRightIcon size={12} className="shrink-0 text-muted-foreground" />
                        <span className="min-w-0 truncate">{target.name}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {LINK_KIND_LABEL[link.evidence[0].kind]}
                        {link.mentions > 1 ? ` · ${link.mentions}` : ''}
                      </div>
                      <NotisSelectionBoundary resource={rowResource} className="min-w-0 text-xs text-muted-foreground">
                        {evidence}
                        {moreEvidence}
                      </NotisSelectionBoundary>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Standalone skills ({isolated.length})
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Nothing points at these and they point at nothing. Name one inside another skill to chain them.
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {isolated.map((node) => (
                <li key={node.id}>
                  <a
                    href={skillEditorUrl(node.id)}
                    className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.07] px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-foreground/[0.12] hover:text-foreground"
                  >
                    {node.name}
                    <ArrowSquareOutIcon size={10} />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}
