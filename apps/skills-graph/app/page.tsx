'use client';

import { useCallback, useMemo, useState } from 'react';
import { NotisSelectionBoundary, Skeleton, ViewSkeleton, useActiveResource, useNotisRuntime, useTopBarSearch } from '@notis/sdk';
import { useCollectionInteractions } from '@notis/sdk/interactions';
import { MagnifyingGlassIcon } from '@phosphor-icons/react';
import { Input } from '@/components/ui/input';
import { PageHeading } from '@/components/page-heading';
import { SkillMap } from '@/components/skill-map';
import { SkillDetail } from '@/components/skill-detail';
import { EmptyState, ErrorState, LinkModeToggle, RefreshButton, StatFigure } from '@/components/graph-chrome';
import { clusterSummaries, connectedOnly, isolatedNodes } from '@/lib/graph-view';
import { graphStats } from '@/lib/skill-links';
import { useSkillGraph, type LinkMode } from '@/lib/use-skill-graph';

export default function MapPage() {
  const runtime = useNotisRuntime();
  const [mode, setMode] = useState<LinkMode>('strong');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const { graph, skills, loading, isFetching, hasData, error, reload } = useSkillGraph(mode);
  const stats = useMemo(() => graphStats(graph), [graph]);
  const clusters = useMemo(() => clusterSummaries(graph), [graph]);
  const isolated = useMemo(() => isolatedNodes(graph), [graph]);
  // The map only draws skills that link to something; the rest stay in the
  // standalone list beside it.
  const mapGraph = useMemo(() => connectedOnly(graph), [graph]);
  const selectedSkill = useMemo(
    () => graph.nodes.find((node) => node.id === selectedId) ?? null,
    [graph.nodes, selectedId],
  );
  const skillResource = selectedSkill ? {
    id: selectedSkill.id,
    kind: 'skill',
    label: selectedSkill.name,
    attributes: {
      incomingLinks: selectedSkill.incoming,
      outgoingLinks: selectedSkill.outgoing,
    },
  } : null;
  useActiveResource(skillResource);
  const collection = useCollectionInteractions({
    // Selection covers both the map and the standalone skill list.
    items: graph.nodes,
    getId: (node) => node.id,
    selectionMode: 'none',
    activeId: selectedId,
    onActiveIdChange: setSelectedId,
    onActivate: (node) => setSelectedId(node.id),
  });
  const containerProps = collection.getContainerProps();

  const hasTopBar = Boolean(runtime?.registerTopBarSearch);
  const onSearchChange = useCallback((value: string) => setQuery(value), []);
  useTopBarSearch({ value: query, onChange: onSearchChange, placeholder: 'Search skills…' });

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

  const statValue = (value: number) => hasData ? value : showSkeleton
    ? <span aria-hidden className="inline-block h-7 w-9 animate-pulse rounded bg-muted" />
    : '—';

  return (
    <main className="notis-app-split h-auto lg:h-full">
      <section aria-label="Skill map" className="notis-app-pane-detail flex flex-col lg:h-full lg:min-h-0">
        <div className="skill-graph-header shrink-0 flex flex-col gap-3 pb-3">
          <PageHeading
            title="Map"
            description={
              hasData
                ? `${stats.links} link${stats.links === 1 ? '' : 's'} between ${stats.connected} of your ${stats.skills} skills.`
                : showSkeleton ? <Skeleton style={{ width: 220, height: 16 }} /> : 'Explore how your skills connect.'
            }
            actions={
              <>
                {!hasTopBar && (
                  <div className="relative">
                    <MagnifyingGlassIcon size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search skills…"
                      className="h-9 w-52 pl-8 text-sm"
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
        <div className="skill-graph-header shrink-0 pb-3">
          <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
            <StatFigure label="Skills" value={statValue(stats.skills)} />
            <StatFigure label="Links" value={statValue(stats.links)} hint={mode === 'strong' ? 'Clear references only' : 'Every mention'} />
            <StatFigure label="Chains" value={statValue(stats.clusters)} hint="Groups that reference each other" />
            <StatFigure label="Standalone" value={statValue(stats.isolated)} hint="Hidden from the map" />
          </div>
        </div>
        <div
          {...containerProps}
          role="application"
          aria-label="Skill graph"
          className="relative h-[clamp(360px,60vh,620px)] shrink-0 lg:h-auto lg:min-h-0 lg:flex-1"
        >
          {showSkeleton ? (
            <ViewSkeleton variant="graph" />
          ) : showFirstLoadError && error ? (
            <ErrorState error={error} onRetry={reload} />
          ) : showEmpty ? (
            <EmptyState />
          ) : showContent ? (
            <SkillMap graph={mapGraph} selectedId={selectedId} onSelect={setSelectedId} query={query} />
          ) : null}
        </div>
      </section>

      {/* The inspector is a sibling of the whole map pane, not just its canvas. */}
      <aside aria-label="Skill inspector" className="notis-app-pane-list flex flex-col border-t border-border lg:h-full lg:min-h-0 lg:overflow-y-auto lg:border-t-0 lg:border-r-0 lg:border-l">
        {showSkeleton ? (
          <div aria-label="Loading skill inspector" aria-busy="true" className="space-y-4 p-4 lg:p-6">
            <Skeleton style={{ width: 100, height: 16 }} />
            {[0, 1, 2, 3].map((row) => <Skeleton key={row} style={{ width: '100%', height: 24 }} />)}
          </div>
        ) : showContent ? selectedId ? (
          <NotisSelectionBoundary resource={skillResource} className="min-h-0 flex-1">
            <SkillDetail graph={graph} skillId={selectedId} onSelect={setSelectedId} />
          </NotisSelectionBoundary>
        ) : (
          <div className="flex flex-col gap-4 p-4 lg:p-6">
            <section className="space-y-2">
              <h2 className="text-xs font-medium text-muted-foreground">Chains</h2>
              {clusters.length === 0 ? (
                <p className="text-sm text-muted-foreground">No skill references another one yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {clusters.map((cluster) => (
                    <li key={cluster.cluster}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(cluster.anchor.id)}
                        className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                      >
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: cluster.color }} aria-hidden />
                        <span className="truncate text-foreground">{cluster.anchor.name}</span>
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">{cluster.size}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-2">
              <h2 className="text-xs font-medium text-muted-foreground">
                Standalone ({isolated.length}) · not on the map
              </h2>
              <div className="flex flex-wrap gap-1">
                {isolated.slice(0, 24).map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => setSelectedId(node.id)}
                    className="rounded-full bg-foreground/[0.07] px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-foreground/[0.12] hover:text-foreground"
                  >
                    {node.name}
                  </button>
                ))}
                {isolated.length > 24 && (
                  <span className="px-1 py-0.5 text-xs text-muted-foreground">+{isolated.length - 24} more</span>
                )}
              </div>
            </section>

            <section className="space-y-2">
              <h2 className="text-xs font-medium text-muted-foreground">How a link is found</h2>
              <ul className="space-y-1 text-xs leading-relaxed text-muted-foreground">
                <li><span className="text-foreground">Bundle path</span> — .agents/skills/other-skill</li>
                <li><span className="text-foreground">Slash command</span> — /other-skill</li>
                <li><span className="text-foreground">Named in code</span> — `other-skill`</li>
                <li><span className="text-foreground">Called a skill</span> — the other-skill skill</li>
                <li><span className="text-foreground">Name appears</span> — plain prose, dashed line, in All mentions</li>
              </ul>
            </section>

            <p className="text-xs leading-relaxed text-muted-foreground">
              Click a skill to see what it references, what references it, and the exact lines
              that link them.
            </p>
          </div>
        ) : (
          <p className="p-4 text-sm text-muted-foreground lg:p-6">Connections appear here when skills are available.</p>
        )}
      </aside>
    </main>
  );
}
