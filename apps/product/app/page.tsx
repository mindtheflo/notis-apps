'use client';

/**
 * Tickets — the issue list.
 *
 * One flat query per database, grouped client-side by status. Every property a
 * triager changes often (status, priority, type, version) is editable inline
 * from the row, and the detail panel carries the rest.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  MultiSelectActionBar,
  MultiSelectCheckbox,
  MultiSelectDragOverlay,
  ViewSkeleton,
  useActiveResource,
  useDocument,
  useDocuments,
  useCollectionInteractions,
  useShortcuts,
  useNotis,
  useNotisNavigation,
  useTopBarSearch,
  useUpsertDocument,
} from '@notis/sdk';
import {
  ArrowSquareOutIcon,
  BookOpenTextIcon,
  CircleNotchIcon,
  MegaphoneIcon,
  PackageIcon,
  PlusIcon,
  ProhibitIcon,
  TrashIcon,
} from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Menu,
  MenuCaret,
  PriorityMark,
  SegmentedControl,
  StatusMark,
  TypeDot,
  type MenuOption,
} from './controls';
import { ReaderShortcutHints } from '@/components/reader-shortcut-hints';
import { TicketDetail } from './ticket-detail';
import {
  DEFAULT_TICKET_FILTERS,
  PRIORITY_ORDER,
  STATUS_META,
  STATUS_ORDER,
  TICKETS_DB,
  TICKET_TYPES,
  TICKET_VIEWS,
  VERSIONS_DB,
  archiveTickets,
  nextTicketKey,
  beginResourceNavigation,
  compareTickets,
  compareVersions,
  formatShortDate,
  planTicketReveal,
  resolveTicketResource,
  ticketMatchesFilters,
  toTicket,
  toVersion,
  type Ticket,
  type TicketFilters,
  type TicketPriority,
  type TicketStatus,
  type TicketType,
  type TicketTypeFilter,
  type TicketViewKey,
} from './product';

type DeleteRequest = { source: 'single' | 'bulk'; tickets: Ticket[] };

export default function TicketsPage() {
  const { resourceId } = useNotis();
  const navigation = useNotisNavigation();
  const ticketQuery = useDocuments(TICKETS_DB, { pageSize: 200, fetchAll: true, includeContent: false });
  const versionQuery = useDocuments(VERSIONS_DB, { pageSize: 100, fetchAll: true, includeContent: false });
  const { upsert } = useUpsertDocument(TICKETS_DB);

  const [view, setView] = useState<TicketViewKey>(DEFAULT_TICKET_FILTERS.view);
  const [typeFilter, setTypeFilter] = useState<TicketTypeFilter>(DEFAULT_TICKET_FILTERS.type);
  const [versionFilter, setVersionFilter] = useState<string>(DEFAULT_TICKET_FILTERS.version);
  const [search, setSearch] = useState(DEFAULT_TICKET_FILTERS.search);
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<TicketStatus>>(() => new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const bulkPendingRef = useRef(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [archivedIds, setArchivedIds] = useState<Set<string>>(() => new Set());
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Partial<Ticket>>>({});
  const [creating, setCreating] = useState(false);
  const [resourceNotice, setResourceNotice] = useState<string | null>(null);
  const pendingResourceIdRef = useRef<string | null | undefined>(undefined);
  const revealedResourceIdRef = useRef<string | null>(null);

  const openTicketResource = useCallback((ticketId: string | null) => {
    setOpenTicketId(ticketId);
    const transition = beginResourceNavigation(
      resourceId,
      pendingResourceIdRef.current,
      ticketId,
    );
    pendingResourceIdRef.current = transition.pendingResourceId;
    if (transition.shouldNavigate) navigation.toRoute('/', { resourceId: ticketId });
  }, [navigation, resourceId]);

  // Search here is a synchronous client-side filter over already-fetched
  // tickets, not a submitted search — the top-bar spinner is reserved for an
  // explicit submitted search, never mount/background-refresh state.
  useTopBarSearch({
    value: search,
    onChange: setSearch,
    placeholder: 'Search tickets…',
  });

  const versions = useMemo(
    () => versionQuery.documents.map(toVersion).sort(compareVersions),
    [versionQuery.documents],
  );
  const versionById = useMemo(
    () => new Map(versions.map((version) => [version.id, version])),
    [versions],
  );

  const tickets = useMemo(() => {
    return ticketQuery.documents
      .map(toTicket)
      .filter((ticket) => !archivedIds.has(ticket.id))
      .map((ticket) => ({ ...ticket, ...(overrides[ticket.id] ?? {}) }));
  }, [archivedIds, ticketQuery.documents, overrides]);

  const typeCounts = useMemo(() => {
    let features = 0;
    let bugs = 0;
    for (const ticket of tickets) {
      if (ticket.type === 'Bug') bugs += 1;
      else features += 1;
    }
    return { features, bugs };
  }, [tickets]);

  const filters = useMemo<TicketFilters>(
    () => ({ view, type: typeFilter, version: versionFilter, search }),
    [view, typeFilter, versionFilter, search],
  );

  // The deep-link reveal below reads the live filters through this ref. Taking
  // them as effect dependencies instead would re-run the reveal every time the
  // triager touches a filter, which is exactly what it must not do.
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const visible = useMemo(
    () =>
      tickets
        .filter((ticket) => ticketMatchesFilters(ticket, filters))
        .sort(compareTickets),
    [tickets, filters],
  );

  const groups = useMemo(() => {
    return STATUS_ORDER.map((status) => ({
      status,
      tickets: visible.filter((ticket) => ticket.status === status),
    })).filter((group) => group.tickets.length > 0);
  }, [visible]);

  const selection = useCollectionInteractions<Ticket>({
    items: groups.filter(group => !collapsed.has(group.status)).flatMap(group => group.tickets),
    getId: (ticket) => ticket.id,
    onActivate: (ticket) => openTicketResource(ticket.id),
    enabled: !bulkPending,
    enableLongPressSelection: true,
    isItemDisabled: (ticket) => !bulkPending && pendingIds.has(ticket.id),
    actions: [
          {
            id: 'done',
            label: 'Mark shipped',
            intent: 'complete' as const,
            icon: <StatusMark status="Done" tone="inherit" />,
            onRun: () =>
              bulkSet(
                { Status: 'Done', 'Shipped on': new Date().toISOString().slice(0, 10) },
                { status: 'Done', shippedOn: new Date().toISOString().slice(0, 10) },
              ),
          },
          {
            id: 'progress',
            label: 'Start progress',
            intent: 'start-progress' as const,
            icon: <StatusMark status="In Progress" tone="inherit" />,
            onRun: () => bulkSet({ Status: 'In Progress' }, { status: 'In Progress' }),
          },
          {
            id: 'docs',
            label: 'Docs updated',
            shortcut: 'D',
            icon: <BookOpenTextIcon className="h-4 w-4" />,
            onRun: () => bulkSet({ 'Docs updated': true }, { docsUpdated: true }),
          },
          {
            id: 'social',
            label: 'Social done',
            shortcut: 'S',
            icon: <MegaphoneIcon className="h-4 w-4" />,
            onRun: () => bulkSet({ 'Social post created': true }, { socialPostCreated: true }),
          },
          {
            id: 'cancel',
            label: 'Cancel',
            shortcut: 'X',
            icon: <ProhibitIcon className="h-4 w-4" />,
            destructive: true,
            onRun: () => bulkSet({ Status: 'Canceled' }, { status: 'Canceled' }),
          },
          {
            id: 'delete',
            intent: 'delete' as const,
            icon: <TrashIcon className="h-4 w-4" />,
            onRun: ({ selectedItems }: { selectedItems: Ticket[] }) => {
              setDeleteError(null);
              setDeleteRequest({ source: 'bulk', tickets: selectedItems });
            },
          },
        ].map(action => ({ ...action, pending: bulkPending, disabled: bulkPending })),
  });

  const openTicket = openTicketId
    ? (tickets.find((ticket) => ticket.id === openTicketId) ?? null)
    : null;
  const selectedTicketDetail=useDocument(openTicketId);
  const activeDescription=selectedTicketDetail.document?.contentMarkdown??openTicket?.description??null;
  const activeResource = useMemo(
    () =>
      openTicket
        ? {
            id: openTicket.id,
            kind: 'product-ticket',
            label: `${openTicket.key}: ${openTicket.title}`,
            url: openTicket.link,
            attributes: {
              key: openTicket.key,
              status: openTicket.status,
              priority: openTicket.priority,
              type: openTicket.type,
            },
            revision: selectedTicketDetail.document?.lastEditedTime,
            snapshot: activeDescription
              ? { format: 'markdown' as const, content: activeDescription }
              : null,
          }
        : null,
    [openTicket,activeDescription,selectedTicketDetail.document?.lastEditedTime],
  );
  useActiveResource(activeResource);

  useEffect(() => {
    if (pendingResourceIdRef.current !== undefined) {
      if (pendingResourceIdRef.current !== resourceId) return;
      // A create response arrives before the fetch-all query contains its row.
      // Keep the optimistic route authoritative until that row can resolve.
      if (
        pendingResourceIdRef.current
        && !resolveTicketResource(pendingResourceIdRef.current, tickets)
      ) return;
      pendingResourceIdRef.current = undefined;
    }
    if (!resourceId) {
      revealedResourceIdRef.current = null;
      setResourceNotice(null);
      return;
    }
    if (ticketQuery.loading) return;
    if (ticketQuery.error) {
      setResourceNotice(null);
      return;
    }
    const target = resolveTicketResource(resourceId, tickets);
    if (!target) {
      setOpenTicketId(null);
      setResourceNotice('This ticket is no longer available. Showing Tickets instead.');
      return;
    }
    setResourceNotice(null);
    setOpenTicketId(target.id);

    // Reveal is a once-per-resource step, not a per-render one. This effect also
    // re-runs whenever the ticket list changes identity — every inline edit,
    // every background refetch — and re-revealing there is what used to wipe the
    // filters while a ticket was simply open.
    if (revealedResourceIdRef.current === target.id) return;
    revealedResourceIdRef.current = target.id;

    const relaxed = planTicketReveal(target, filtersRef.current);
    if (relaxed) {
      if (relaxed.view !== undefined) setView(relaxed.view);
      if (relaxed.type !== undefined) setTypeFilter(relaxed.type);
      if (relaxed.version !== undefined) setVersionFilter(relaxed.version);
      if (relaxed.search !== undefined) setSearch(relaxed.search);
    }
    setCollapsed((current) => {
      if (!current.has(target.status)) return current;
      const next = new Set(current);
      next.delete(target.status);
      return next;
    });
  }, [resourceId, ticketQuery.error, ticketQuery.loading, tickets]);

  const saveTicket = useCallback(
    async (ticket: Ticket, patch: Partial<Ticket>, properties: Record<string, unknown>) => {
      setOverrides((current) => ({ ...current, [ticket.id]: { ...current[ticket.id], ...patch } }));
      setPendingIds((current) => new Set(current).add(ticket.id));
      try {
        await upsert({ documentId: ticket.id, operation: 'update', properties });
        return true;
      } catch {
        setOverrides((current) => {
          const next = { ...current };
          delete next[ticket.id];
          return next;
        });
        return false;
      } finally {
        setPendingIds((current) => {
          const next = new Set(current);
          next.delete(ticket.id);
          return next;
        });
        ticketQuery.refetch();
      }
    },
    [upsert, ticketQuery],
  );

  const setStatus = useCallback(
    (ticket: Ticket, status: TicketStatus) => {
      const shippedOn =
        status === 'Done' && !ticket.shippedOn
          ? new Date().toISOString().slice(0, 10)
          : ticket.shippedOn;
      void saveTicket(
        ticket,
        { status, shippedOn },
        { Status: status, ...(shippedOn !== ticket.shippedOn ? { 'Shipped on': shippedOn } : {}) },
      );
    },
    [saveTicket],
  );

  const setPriority = useCallback(
    (ticket: Ticket, priority: TicketPriority) => {
      void saveTicket(ticket, { priority }, { Priority: priority });
    },
    [saveTicket],
  );

  const setVersion = useCallback(
    (ticket: Ticket, versionId: string) => {
      const versionIds = versionId === 'none' ? [] : [versionId];
      void saveTicket(ticket, { versionIds }, { Version: versionIds });
    },
    [saveTicket],
  );

  const setType = useCallback(
    (ticket: Ticket, type: TicketType) => {
      void saveTicket(ticket, { type }, { Type: type });
    },
    [saveTicket],
  );

  async function bulkSet(properties: Record<string, unknown>, patch: Partial<Ticket>) {
    if (bulkPendingRef.current) return;
    const chosen = selection.getSelectedItems();
    if (!chosen.length) return;
    bulkPendingRef.current = true;
    setBulkPending(true);
    setBulkError(null);
    const failed: string[] = [];
    try {
      for (const ticket of chosen) {
        if (!await saveTicket(ticket, patch, properties)) failed.push(ticket.id);
      }
      selection.select(failed);
      if (failed.length) setBulkError(`${failed.length} ticket updates failed. They remain selected so you can retry.`);
    } finally {
      bulkPendingRef.current = false;
      setBulkPending(false);
    }
  }

  async function confirmDelete() {
    if (!deleteRequest || bulkPendingRef.current) return;
    const request = deleteRequest;
    const ids = request.tickets.map((ticket) => ticket.id);
    bulkPendingRef.current = true;
    setBulkPending(true);
    setBulkError(null);
    setDeleteError(null);
    setPendingIds((current) => new Set([...current, ...ids]));

    try {
      const result = await archiveTickets(request.tickets, async (ticket) => {
        await upsert({ documentId: ticket.id, operation: 'archive' });
      });
      const succeededIds = new Set(result.succeeded.map((ticket) => ticket.id));
      setArchivedIds((current) => new Set([...current, ...succeededIds]));

      if (openTicketId && succeededIds.has(openTicketId)) openTicketResource(null);
      if (request.source === 'bulk') selection.select(result.failed.map((ticket) => ticket.id));

      if (result.failed.length > 0) {
        const message = request.source === 'bulk'
          ? `${result.failed.length} ${result.failed.length === 1 ? 'ticket' : 'tickets'} could not be deleted. ${result.failed.length === 1 ? 'It remains' : 'They remain'} selected so you can retry.`
          : 'This ticket could not be deleted. It is still available so you can retry.';
        setBulkError(message);
        setDeleteError(message);
        setDeleteRequest({ ...request, tickets: result.failed });
      } else {
        setDeleteRequest(null);
      }
      ticketQuery.refetch();
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        for (const id of ids) next.delete(id);
        return next;
      });
      bulkPendingRef.current = false;
      setBulkPending(false);
    }
  }

  const createTicket = useCallback(async () => {
    setCreating(true);
    try {
      const created = await upsert({
        operation: 'create',
        title: 'New ticket',
        properties: {
          Key: nextTicketKey(tickets),
          Type: typeFilter === 'all' ? 'Feature' : typeFilter,
          Status: 'Backlog',
          Priority: 'No priority',
        },
      });
      openTicketResource(created.id);
      ticketQuery.refetch();
    } finally {
      setCreating(false);
    }
  }, [openTicketResource, tickets, typeFilter, upsert, ticketQuery]);

  // Route shortcuts share collection ownership and ignore retained hidden views.
  const ticketShortcutOwner = selection.getActionBarProps();
  useShortcuts([
    { id: 'tickets.create', keys: 'C', label: 'Create ticket', enabled: selection.selectedCount === 0 && !creating && !bulkPending, onTrigger: createTicket },
    { id: 'tickets.close-detail', keys: 'Escape', label: 'Close ticket', enabled: Boolean(openTicketId) && selection.selectedCount === 0, onTrigger: () => openTicketResource(null) },
  ], {
    scope: 'route',
    collectionOwnerId: ticketShortcutOwner.collectionOwnerId,
    isAvailable: ticketShortcutOwner.isAvailable,
  });

  const versionOptions: MenuOption<string>[] = useMemo(
    () => [
      { value: 'none', label: 'No version' },
      ...versions.map((version) => ({
        value: version.id,
        label: version.name,
        hint: version.status === 'Published' ? undefined : version.status,
      })),
    ],
    [versions],
  );

  const error = ticketQuery.error ?? versionQuery.error;

  return (
    <div className="flex h-full min-h-0 w-full max-w-none flex-col bg-background">
      <div className="notis-app-split min-h-0 flex-1">
        <section
          aria-label="Ticket list"
          className={cn('min-h-0 min-w-0 flex-1 flex-col', openTicketId ? 'hidden lg:flex' : 'flex')}
        >
          <header className="shrink-0 bg-background">
            <div className="flex h-14 items-center justify-between gap-3 px-4">
              <h1 className="text-sm font-semibold">Tickets</h1>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-xs tabular-nums text-muted-foreground">{visible.length}</span>
          <Button size="sm" onClick={() => void createTicket()} disabled={creating}>
            {creating ? (
              <CircleNotchIcon className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <PlusIcon className="mr-1.5 h-3.5 w-3.5" />
            )}
            New ticket
          </Button>
        </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 px-4 pb-3" aria-label="Ticket filters">
        <SegmentedControl
          options={TICKET_VIEWS.map((entry) => ({ value: entry.value, label: entry.label }))}
          value={view}
          onChange={setView}
        />
        <SegmentedControl<TicketTypeFilter>
          options={[
            { value: 'all', label: 'All' },
            { value: 'Feature', label: 'Features', count: typeCounts.features },
            { value: 'Bug', label: 'Bugs', count: typeCounts.bugs },
          ]}
          value={typeFilter}
          onChange={setTypeFilter}
        />
        <Menu
          options={[{ value: 'all', label: 'Any version' }, ...versionOptions]}
          value={versionFilter}
          onSelect={setVersionFilter}
          trigger={
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <PackageIcon className="h-3.5 w-3.5" />
              {versionFilter === 'all'
                ? 'Any version'
                : versionFilter === 'none'
                  ? 'No version'
                  : (versionById.get(versionFilter)?.name ?? 'Version')}
              <MenuCaret />
            </span>
          }
        />
            </div>
          </header>
          <div
            className="min-h-0 min-w-0 flex-1 overflow-y-auto"
            {...selection.getContainerProps()}
          >
          <div className="px-5 py-2"><ReaderShortcutHints canDelete={selection.selectedCount>0}/></div>
          {bulkError ? <p role="alert" className="m-3 rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">{bulkError}</p> : null}
          {resourceNotice ? (
            <p className="m-3 rounded-lg bg-muted px-4 py-2 text-sm text-muted-foreground">
              {resourceNotice}
            </p>
          ) : null}
          {error ? (
            <p className="m-3 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error.message}{' '}
              <button
                type="button"
                className="font-medium underline"
                onClick={() => {
                  ticketQuery.refetch();
                  versionQuery.refetch();
                }}
              >
                Retry
              </button>
            </p>
          ) : null}
          {!ticketQuery.hasData ? (
            error ? null : <ViewSkeleton variant="table" rows={6} />
          ) : groups.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-medium">No tickets here</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Change the view, or create the first one.
              </p>
            </div>
          ) : (
            groups.map((group) => {
              const isCollapsed = collapsed.has(group.status);
              return (
                <section key={group.status}>
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsed((current) => {
                        const next = new Set(current);
                        if (next.has(group.status)) next.delete(group.status);
                        else next.add(group.status);
                        return next;
                      })
                    }
                    className="sticky top-0 z-10 flex w-full items-center gap-2 bg-background px-5 py-2 text-left"
                  >
                    <StatusMark status={group.status} />
                    <span className="text-xs font-medium">{STATUS_META[group.status].label}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {group.tickets.length}
                    </span>
                  </button>
                  {isCollapsed
                    ? null
                    : group.tickets.map((ticket) => (
                        <TicketRow
                          key={ticket.id}
                          ticket={ticket}
                          versionNames={ticket.versionIds
                            .map((id) => versionById.get(id)?.name)
                            .filter((name): name is string => Boolean(name))}
                          versionOptions={versionOptions}
                          pending={pendingIds.has(ticket.id)}
                          active={openTicketId === ticket.id}
                          selection={selection}
                          onStatus={(status) => setStatus(ticket, status)}
                          onPriority={(priority) => setPriority(ticket, priority)}
                          onVersion={(versionId) => setVersion(ticket, versionId)}
                          onType={(type) => setType(ticket, type)}
                        />
                      ))}
                </section>
              );
            })
          )}
          </div>
        </section>

        {openTicket ? (
          <TicketDetail
            ticket={openTicket}
            versions={versions}
            onClose={() => {
              openTicketResource(null);
            }}
            onDelete={() => {
              setDeleteError(null);
              setDeleteRequest({ source: 'single', tickets: [openTicket] });
            }}
            deletePending={pendingIds.has(openTicket.id)}
            onSave={async (patch, properties) => { await saveTicket(openTicket, patch, properties); }}
            onSaveBody={async (markdown) => {
              setOverrides((current) => ({
                ...current,
                [openTicket.id]: { ...current[openTicket.id], description: markdown },
              }));
              await upsert({
                documentId: openTicket.id,
                operation: 'update',
                contentMarkdown: markdown,
              });
              ticketQuery.refetch();
            }}
          />
        ) : null}
      </div>

      <MultiSelectDragOverlay rect={selection.dragRect} />
      <MultiSelectActionBar
        {...selection.getActionBarProps()}
        itemLabel={{ singular: 'ticket', plural: 'tickets' }}

      />
      <DeleteTicketsDialog
        request={deleteRequest}
        pending={bulkPending}
        error={deleteError}
        onCancel={() => {
          if (!bulkPending) {
            setDeleteRequest(null);
            setDeleteError(null);
          }
        }}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}

function DeleteTicketsDialog({
  request,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  request: DeleteRequest | null;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const count = request?.tickets.length ?? 0;
  if (!request) return null;
  const singular = count === 1;
  const subject = singular ? request.tickets[0].key || 'ticket' : `${count} tickets`;
  const description = `${singular ? 'This ticket' : 'These tickets'} will be moved to trash and removed from this view.`;

  return (
    <Dialog
      open
      onClose={onCancel}
      role="alertdialog"
      title={`Delete ${subject}?`}
      description={description}
    >
      {error ? (
        <p role="alert" className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="mt-5 flex justify-end gap-2">
        <Button autoFocus type="button" variant="secondary" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" variant="destructive" disabled={pending} onClick={onConfirm}>
          {pending ? 'Deleting…' : 'Delete'}
        </Button>
      </div>
    </Dialog>
  );
}

interface TicketRowProps {
  ticket: Ticket;
  versionNames: string[];
  versionOptions: MenuOption<string>[];
  pending: boolean;
  active: boolean;
  selection: ReturnType<typeof useCollectionInteractions<Ticket>>;
  onStatus: (status: TicketStatus) => void;
  onPriority: (priority: TicketPriority) => void;
  onVersion: (versionId: string) => void;
  onType: (type: TicketType) => void;
}

function TicketRow({
  ticket,
  versionNames,
  versionOptions,
  pending,
  active,
  selection,
  onStatus,
  onPriority,
  onVersion,
  onType,
}: TicketRowProps) {
  return (
    <div
      {...selection.getItemProps(ticket.id)}
      data-ticket-id={ticket.id}
      className={cn(
        'group flex cursor-default items-center gap-2 border-b border-border/60 px-5 py-2.5 text-sm transition-colors',
        (active || selection.isSelected(ticket.id)) ? 'bg-muted' : 'hover:bg-muted/40',
        pending && 'opacity-60',
      )}
    >
      <MultiSelectCheckbox {...selection.getCheckboxProps(ticket.id)} />
      <Menu
        options={PRIORITY_ORDER.map((priority) => ({
          value: priority,
          label: priority,
          icon: <PriorityMark priority={priority} />,
        }))}
        value={ticket.priority}
        onSelect={(priority) => onPriority(priority)}
        label="Priority"
        trigger={<PriorityMark priority={ticket.priority} />}
      />
      <Menu
        options={STATUS_ORDER.map((status) => ({
          value: status,
          label: STATUS_META[status].label,
          icon: <StatusMark status={status} />,
        }))}
        value={ticket.status}
        onSelect={(status) => onStatus(status)}
        label="Status"
        trigger={<StatusMark status={ticket.status} />}
      />
      <span className="w-16 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
        {ticket.key}
      </span>
      <Menu
        options={TICKET_TYPES.map((type) => ({
          value: type,
          label: type,
          icon: <TypeDot type={type} />,
        }))}
        value={ticket.type}
        onSelect={(type) => onType(type)}
        label="Type"
        trigger={<TypeDot type={ticket.type} />}
      />
      <span className="min-w-0 flex-1 truncate">{ticket.title}</span>
      {ticket.link ? (
        <a
          href={ticket.link}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          className="hidden shrink-0 text-muted-foreground transition-colors hover:text-foreground group-hover:block"
          aria-label="Open link"
        >
          <ArrowSquareOutIcon className="h-3.5 w-3.5" />
        </a>
      ) : null}
      {ticket.size ? (
        <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
          {ticket.size}
        </span>
      ) : null}
      <Menu
        options={versionOptions}
        value={ticket.versionIds}
        onSelect={(versionId) => onVersion(versionId)}
        align="end"
        label="Version"
        trigger={
          versionNames.length > 0 ? (
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
              {versionNames.join(', ')}
            </span>
          ) : (
            <PackageIcon className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground" />
          )
        }
      />
      <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {formatShortDate(ticket.shippedOn ?? ticket.due)}
      </span>
    </div>
  );
}
