import {ReaderSelection} from '@/components/reader-selection';
'use client';

/**
 * Versions — one release per row, with the full published changelog entry.
 *
 * The body of a version row is the exact copy that ships to
 * your configured public changelog, so this view is both the release ledger and the
 * archive: pick a version and you get its changelog plus every ticket that
 * shipped in it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Markdown,
  useCollectionInteractions,
  useShortcuts,
  
  ViewSkeleton,
  useActiveResource,
  useDocument,
  useDocuments,
  useNotis,
  useNotisNavigation,
  useTopBarSearch,
  useUpsertDocument,
} from '@notis/sdk';
import {
  ArrowSquareOutIcon,
  BugIcon,
  CircleNotchIcon,
  PlusIcon,
  SparkleIcon,
  VideoIcon,
} from '@phosphor-icons/react';

import { ReaderShortcutHints } from '@/components/reader-shortcut-hints';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Menu, MenuCaret, PriorityMark, StatusMark, TypeDot } from '../controls';
import {
  STATUS_META,
  TICKETS_DB,
  VERSIONS_DB,
  VERSION_STATUSES,
  beginResourceNavigation,
  compareTickets,
  compareVersions,
  formatDate,
  resolveVersionResource,
  toTicket,
  toVersion,
  versionMatchesSearch,
  type Version,
  type VersionStatus,
} from '../product';

const STATUS_TONE: Record<VersionStatus, string> = {
  Draft: 'bg-muted text-muted-foreground',
  Ready: 'bg-foreground/[0.07] text-foreground',
  'Ready for review': 'bg-foreground/[0.07] text-foreground',
  Published: 'bg-primary/10 text-primary',
};

export default function VersionsPage() {
  const { resourceId } = useNotis();
  const navigation = useNotisNavigation();
  const versionQuery = useDocuments(VERSIONS_DB, { pageSize: 100, fetchAll: true, includeContent: false });
  const ticketQuery = useDocuments(TICKETS_DB, { pageSize: 200, fetchAll: true, includeContent: false });
  const { upsert } = useUpsertDocument(VERSIONS_DB);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, VersionStatus>>({});
  const [resourceNotice, setResourceNotice] = useState<string | null>(null);
  const pendingResourceIdRef = useRef<string | null | undefined>(undefined);
  const revealedResourceIdRef = useRef<string | null>(null);

  const selectVersionResource = useCallback((versionId: string | null) => {
    setSelectedId(versionId);
    const transition = beginResourceNavigation(
      resourceId,
      pendingResourceIdRef.current,
      versionId,
    );
    pendingResourceIdRef.current = transition.pendingResourceId;
    if (transition.shouldNavigate) {
      navigation.toRoute('/versions', { resourceId: versionId });
    }
  }, [navigation, resourceId]);

  useTopBarSearch({ value: search, onChange: setSearch, placeholder: 'Search releases…' });

  const versions = useMemo(
    () =>
      versionQuery.documents
        .map(toVersion)
        .map((version) => ({ ...version, status: statusOverrides[version.id] ?? version.status }))
        .sort(compareVersions),
    [versionQuery.documents, statusOverrides],
  );

  const tickets = useMemo(() => ticketQuery.documents.map(toTicket), [ticketQuery.documents]);

  const filtered = useMemo(
    () => versions.filter((version) => versionMatchesSearch(version, search)),
    [versions, search],
  );

  // Read by the deep-link reveal below without making it a dependency: typing in
  // the release search must not re-trigger a reveal.
  const searchRef = useRef(search);
  searchRef.current = search;

  useEffect(() => {
    if (!resourceId && !selectedId && filtered.length > 0) setSelectedId(filtered[0].id);
  }, [filtered, resourceId, selectedId]);

  const selected = versions.find((version) => version.id === selectedId) ?? null;
  // `LOCAL_NOTIS_DATABASE_QUERY` returns properties only, so the stored
  // changelog body comes from a single-document read of the selected release.
  const selectedDetail = useDocument(selectedId);
  const changelog = selectedDetail.document?.contentMarkdown ?? null;
  const activeResource = useMemo(
    () =>
      selected
        ? {
            id: selected.id,
            kind: 'product-version',
            label: selected.name,
            url: selected.changelogUrl,
            attributes: {
              status: selected.status,
              release_date: selected.releaseDate,
            },
            revision: selectedDetail.document?.lastEditedTime,
            snapshot: changelog
              ? { format: 'markdown' as const, content: changelog }
              : null,
          }
        : null,
    [changelog, selected,selectedDetail.document?.lastEditedTime],
  );
  useActiveResource(activeResource);

  useEffect(() => {
    if (pendingResourceIdRef.current !== undefined) {
      if (pendingResourceIdRef.current !== resourceId) return;
      if (
        pendingResourceIdRef.current
        && !resolveVersionResource(pendingResourceIdRef.current, versions)
      ) return;
      pendingResourceIdRef.current = undefined;
    }
    if (!resourceId) {
      revealedResourceIdRef.current = null;
      setResourceNotice(null);
      return;
    }
    if (versionQuery.loading) return;
    if (versionQuery.error) {
      setResourceNotice(null);
      return;
    }
    const target = resolveVersionResource(resourceId, versions);
    if (!target) {
      setSelectedId(null);
      setResourceNotice('This version is no longer available. Showing Versions instead.');
      return;
    }
    setResourceNotice(null);
    setSelectedId(target.id);

    // This effect re-runs on every release refetch and status override, so the
    // reveal runs once per resource — otherwise an open release kept wiping the
    // search box underneath the reader.
    if (revealedResourceIdRef.current === target.id) return;
    revealedResourceIdRef.current = target.id;
    if (!versionMatchesSearch(target, searchRef.current)) setSearch('');
  }, [resourceId, versionQuery.error, versionQuery.loading, versions]);

  const shipped = useMemo(() => {
    if (!selected) return [];
    return tickets
      .filter((ticket) => ticket.versionIds.includes(selected.id))
      .sort(compareTickets);
  }, [tickets, selected]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const ticket of tickets) {
      for (const versionId of ticket.versionIds) {
        map.set(versionId, (map.get(versionId) ?? 0) + 1);
      }
    }
    return map;
  }, [tickets]);

  const setStatus = async (version: Version, status: VersionStatus) => {
    setStatusOverrides((current) => ({ ...current, [version.id]: status }));
    try {
      await upsert({ documentId: version.id, operation: 'update', properties: { Status: status } });
    } finally {
      versionQuery.refetch();
    }
  };

  const createVersion = async () => {
    setCreating(true);
    try {
      const created = await upsert({
        operation: 'create',
        title: nextVersionName(versions),
        properties: { Status: 'Draft' },
      });
      selectVersionResource(created.id);
      versionQuery.refetch();
    } finally {
      setCreating(false);
    }
  };

  const versionListRef=useRef<HTMLElement|null>(null);
  const versionKeys=useCollectionInteractions<Version>({items:filtered,getId:v=>v.id,selectionMode:'none',enableDragSelect:false,onActivate:v=>selectVersionResource(v.id),shortcuts:{clear:false}});
  useEffect(()=>{if(selectedId&&filtered.some(v=>v.id===selectedId))versionKeys.setActive(selectedId);},[selectedId]);
  const versionOwner=versionKeys.getActionBarProps();
  const {style:_listSelectionStyle,...versionContainer}=versionKeys.getContainerProps();
  useShortcuts([{id:'versions.back',keys:'Escape',label:'Focus release list',onTrigger:()=>(versionListRef.current?.querySelector<HTMLElement>('[data-notis-active="true"]')||versionListRef.current?.querySelector<HTMLElement>('[data-notis-collection-item-id]'))?.focus()}, {id:'versions.refresh',keys:'R',label:'Refresh releases',onTrigger:()=>versionQuery.refetch()}],{scope:'route',collectionOwnerId:versionOwner.collectionOwnerId,isAvailable:versionOwner.isAvailable});
  const error = versionQuery.error ?? ticketQuery.error;

  return (
    <div {...versionContainer} className="flex h-full min-h-0 w-full max-w-none flex-col bg-background">
      <header className="flex items-center gap-3 bg-background px-5 py-3">
        <h1 className="text-sm font-semibold">Versions</h1>
        <span className="text-xs tabular-nums text-muted-foreground">{filtered.length}</span>
        <div className="ml-auto">
          <Button size="sm" onClick={() => void createVersion()} disabled={creating}>
            {creating ? (
              <CircleNotchIcon className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <PlusIcon className="mr-1.5 h-3.5 w-3.5" />
            )}
            New version
          </Button>
        </div>
      </header>

      <div className={cn('notis-app-split', 'min-h-0 flex-1')}>
        <nav ref={versionListRef} className={cn('notis-app-pane-list', 'overflow-y-auto')}>
          <div className="p-3"><ReaderShortcutHints/></div>
          {resourceNotice ? (
            <p className="m-3 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
              {resourceNotice}
            </p>
          ) : null}
          {error ? (
            <p className="m-2 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error.message}{' '}
              <button
                type="button"
                className="font-medium underline"
                onClick={() => {
                  versionQuery.refetch();
                  ticketQuery.refetch();
                }}
              >
                Retry
              </button>
            </p>
          ) : null}
          {!versionQuery.hasData ? (
            error ? null : <ViewSkeleton variant="table" rows={6} />
          ) : (
            <div className="space-y-1 p-2" role="listbox" aria-label="Release list">
              {filtered.map((version) => (
                <div
                  {...versionKeys.getItemProps(version.id)} role="option" aria-selected={version.id===selectedId}
                  key={version.id}
                  className={cn(
                    'list-row flex w-full flex-col items-start gap-0.5 text-left',
                    version.id === selectedId && 'list-row-selected',
                  )}
                >
                  <span className="flex w-full items-center gap-2">
                    <span className="font-mono text-xs font-medium">{version.name}</span>
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                      {counts.get(version.id) ?? 0}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(version.releaseDate) || 'Unscheduled'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </nav>

        <div className={cn('notis-app-pane-detail', 'overflow-y-auto')}>
          {selected ? (
            <ReaderSelection resource={activeResource}><article className="mx-auto max-w-3xl px-8 py-6">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-mono text-lg font-semibold">{selected.name}</h2>
                <Menu
                  options={VERSION_STATUSES.map((status) => ({ value: status, label: status }))}
                  value={selected.status}
                  onSelect={(status) => void setStatus(selected, status)}
                  trigger={
                    <span
                      className={cn(
                        'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                        STATUS_TONE[selected.status],
                      )}
                    >
                      {selected.status}
                      <MenuCaret />
                    </span>
                  }
                />
                <span className="text-xs text-muted-foreground">
                  {formatDate(selected.releaseDate) || 'Unscheduled'}
                </span>
                <div className="ml-auto flex items-center gap-3">
                  {selected.video ? (
                    <a
                      href={selected.video}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <VideoIcon className="h-3.5 w-3.5" />
                      Video
                    </a>
                  ) : null}
                  {selected.changelogUrl ? (
                    <a
                      href={selected.changelogUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Published changelog
                      <ArrowSquareOutIcon className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                </div>
              </div>

              {selected.headline ? (
                <p className="mt-2 text-base font-medium">{selected.headline}</p>
              ) : null}
              {selected.summary ? (
                <p className="mt-2 text-sm text-muted-foreground">{selected.summary}</p>
              ) : null}

              <section className="mt-6">
                <h3 className="text-xs font-medium text-muted-foreground">
                  Shipped in this release
                </h3>
                {shipped.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    No ticket is linked to this version yet.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {shipped.map((ticket) => (
                      <li key={ticket.id} className="list-row flex items-center gap-2 text-sm">
                        <PriorityMark priority={ticket.priority} />
                        <StatusMark status={ticket.status} />
                        <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">
                          {ticket.key}
                        </span>
                        <TypeDot type={ticket.type} />
                        <span className="min-w-0 flex-1 truncate">{ticket.title}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {STATUS_META[ticket.status].label}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <SparkleIcon className="h-3 w-3" />
                    {shipped.filter((ticket) => ticket.type === 'Feature').length} features
                  </span>
                  <span className="flex items-center gap-1">
                    <BugIcon className="h-3 w-3" />
                    {shipped.filter((ticket) => ticket.type === 'Bug').length} bugs
                  </span>
                </p>
              </section>

              <section className="mt-8">
                <h3 className="text-xs font-medium text-muted-foreground">
                  Published changelog
                </h3>
                {changelog ? (
                  <div className="mt-3 text-sm">
                    <Markdown value={changelog} />
                  </div>
                ) : selectedDetail.error ? (<p role="alert" className="mt-2 text-sm text-muted-foreground">Could not load the changelog. <button type="button" onClick={selectedDetail.refetch}>Retry</button></p>) : selectedDetail.hasData ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    No changelog copy stored for this release yet.
                  </p>
                ) : (
                  <ViewSkeleton variant="detail" rows={3} />
                )}
              </section>
            </article></ReaderSelection>
          ) : (
            <p className="p-8 text-sm text-muted-foreground">Pick a release on the left.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Suggests the next `MM.YY` label from today, so a new release starts named. */
function nextVersionName(versions: Version[]): string {
  const now = new Date();
  const candidate = `${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getFullYear()).slice(2)}`;
  if (!versions.some((version) => version.name === candidate)) return candidate;
  return `${candidate} (draft)`;
}
