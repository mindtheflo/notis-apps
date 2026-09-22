'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useActiveResource,
  useDocuments,
  useNotis,
  useNotisNavigation,
  useTopBarSearch,
  useUpsertDocument,
} from '@notis/sdk';
import {
  MultiSelectActionBar,
  SelectionCheckbox,
  useCollectionInteractions,
} from '@notis/sdk/interactions';
import { CheckCircleIcon, CircleIcon, UserIcon } from '@phosphor-icons/react';

import { Badge } from '@/components/ui/badge';
import { MeetingListSkeleton } from '@/components/meeting-skeleton';
import { Button } from '@/components/ui/button';
import { PageHeading } from '@/components/page-heading';
import { cn } from '@/lib/utils';
import {
  formatDate,
  actionItemMatchesFilter,
  beginResourceNavigation,
  filterForRequestedActionItem,
  isDone,
  isAwaitingResourceNavigationEcho,
  pluralize,
  toActionItem,
  toMeeting,
  type ActionItemFilterKey,
  type ActionItem,
} from '@/lib/meetings';

const FILTERS: { key: ActionItemFilterKey; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'mine', label: 'Mine' },
  { key: 'done', label: 'Done' },
  { key: 'all', label: 'All' },
];

export default function ActionItemsPage() {
  const { documents, loading, hasData, error, refetch } = useDocuments('meeting_action_items', {
    pageSize: 100,
    fetchAll: true,
  });
  const { documents: meetingDocs } = useDocuments('meetings', { pageSize: 100, fetchAll: true });
  const { upsert } = useUpsertDocument('meeting_action_items');
  const { resourceId } = useNotis();
  const { toRoute } = useNotisNavigation();

  const [filter, setFilter] = useState<ActionItemFilterKey>('open');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const bulkSavingRef = useRef(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const pendingResourceIdRef = useRef<string | null | undefined>(undefined);

  const onSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (resourceId || pendingResourceIdRef.current !== undefined) {
      setActiveId(null);
      const transition = beginResourceNavigation(
        resourceId,
        pendingResourceIdRef.current,
        null,
      );
      pendingResourceIdRef.current = transition.pendingResourceId;
      if (transition.shouldNavigate) toRoute('/action-items', { resourceId: null });
    }
  }, [resourceId, toRoute]);
  useTopBarSearch({ value: search, onChange: onSearchChange, placeholder: 'Search action items…' });

  const meetingTitles = useMemo(() => {
    const map = new Map<string, string>();
    for (const doc of meetingDocs) {
      const meeting = toMeeting(doc);
      map.set(meeting.id, meeting.title);
    }
    return map;
  }, [meetingDocs]);

  const items = useMemo(() => {
    const rows = documents.map(toActionItem);
    rows.sort((a, b) => {
      const left = a.meetingDate ? Date.parse(a.meetingDate) : 0;
      const right = b.meetingDate ? Date.parse(b.meetingDate) : 0;
      return right - left;
    });
    return rows;
  }, [documents]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items
      .filter((item) => {
        return actionItemMatchesFilter(item, filter);
      })
      .filter((item) => {
        if (!needle) return true;
        return [item.title, item.description ?? '', item.assignee ?? '']
          .join(' ')
          .toLowerCase()
          .includes(needle);
      });
  }, [items, filter, search]);

  const requestedItem = useMemo(
    () => resourceId ? items.find((item) => item.id === resourceId) ?? null : null,
    [items, resourceId],
  );
  const missingResource = Boolean(resourceId && !loading && !error && !requestedItem);

  useEffect(() => {
    if (isAwaitingResourceNavigationEcho(pendingResourceIdRef.current, resourceId)) return;
    if (pendingResourceIdRef.current !== undefined) {
      pendingResourceIdRef.current = undefined;
    }
    if (!resourceId) return;
    if (!requestedItem) {
      if (!loading && !error) setActiveId(null);
      return;
    }

    setActiveId(requestedItem.id);
    if (search) setSearch('');
    const nextFilter = filterForRequestedActionItem(requestedItem, filter);
    if (nextFilter !== filter) {
      setFilter(nextFilter);
    }
  }, [error, filter, loading, requestedItem, resourceId, search]);

  const focusItem = useCallback((id: string | null) => {
    setActiveId(id);
    if (!id) return;
    const transition = beginResourceNavigation(
      resourceId,
      pendingResourceIdRef.current,
      id,
    );
    pendingResourceIdRef.current = transition.pendingResourceId;
    if (transition.shouldNavigate) toRoute('/action-items', { resourceId: id });
  }, [resourceId, toRoute]);

  const toggle = useCallback(
    async (item: ActionItem) => {
      setSaving(item.id);
      try {
        await upsert({
          documentId: item.id,
          properties: { Status: isDone(item) ? 'PENDING' : 'COMPLETED' },
        });
        refetch();
      } finally {
        setSaving(null);
      }
    },
    [upsert, refetch],
  );

  const collection = useCollectionInteractions({
    items: filtered,
    getId: (item: ActionItem) => item.id,
    defaultActiveId: activeId,
    onActivate: (item) => focusItem(item.id),
    enableDragSelect: false,
    enabled: !bulkSaving,
    actions: [{
      id: 'complete',
      intent: 'complete',
      label: 'Mark complete',
      icon: <CheckCircleIcon className="h-4 w-4" />,
      pending: bulkSaving,
      onRun: async ({ selectedItems, clearSelection }) => {
        if (bulkSavingRef.current) return;
        bulkSavingRef.current = true;
        setBulkSaving(true);
        setBulkError(null);
        try {
          const results = await Promise.allSettled(selectedItems.map((item) => upsert({
            documentId: item.id,
            properties: { Status: 'COMPLETED' },
          })));
          const failedIds = selectedItems.filter((_, index) => results[index].status === 'rejected').map(item => item.id);
          if (failedIds.length) {
            collection.select(failedIds);
            setBulkError(`${failedIds.length} action item updates failed. They remain selected so you can retry.`);
          } else clearSelection();
          refetch();
        } finally {
          bulkSavingRef.current = false;
          setBulkSaving(false);
        }
      },
    }],
  });

  const activeItem = useMemo(
    () => activeId ? items.find((item) => item.id === activeId) ?? null : null,
    [activeId, items],
  );
  useActiveResource(activeItem ? {
    id: activeItem.id,
    kind: 'meeting-action-item',
    label: activeItem.title,
    attributes: {
      status: activeItem.status,
      assignee: activeItem.assignee,
      meetingDate: activeItem.meetingDate,
      forMe: activeItem.forMe,
    },
    snapshot: activeItem.description
      ? { format: 'text', content: activeItem.description }
      : null,
  } : null);

  useEffect(() => {
    if (!activeId) return;
    rowRefs.current.get(activeId)?.scrollIntoView({ block: 'nearest' });
  }, [activeId, filtered]);

  return (
    <main className="notis-app-shell space-y-4">
      <PageHeading
        title="Action Items"
        description={hasData ? pluralize(filtered.length, 'item') : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-1">
            {FILTERS.map((entry) => (
              <Button
                key={entry.key}
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilter(entry.key);
                  setActiveId(null);
                  if (resourceId) toRoute('/action-items', { resourceId: null });
                }}
                className={cn(
                  'h-7 px-3 text-xs',
                  entry.key === filter ? 'bg-muted text-foreground' : 'text-muted-foreground',
                )}
              >
                {entry.label}
              </Button>
            ))}
          </div>
        }
      />

      {bulkError ? <p role="alert" className="text-sm text-destructive">{bulkError}</p> : null}
      {error ? (
        <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error.message}
        </p>
      ) : null}

      {missingResource ? (
        <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
          Action item no longer available. Showing your open items.
        </p>
      ) : null}

      {loading && !hasData ? (
        <MeetingListSkeleton actions />
      ) : hasData ? (
        filtered.length ? (
          <ul
            {...collection.getContainerProps()}
            role="listbox"
            aria-label="Action items"
            aria-multiselectable="true"
            className="space-y-1.5"
          >
            {filtered.map((item) => {
              const done = isDone(item);
              const meetingTitle = item.meetingIds
                .map((id) => meetingTitles.get(id))
                .find((title): title is string => Boolean(title));

              return (
                <li
                  key={item.id}
                  {...collection.getItemProps(item.id)}
                  ref={(node) => {
                    if (node) rowRefs.current.set(item.id, node);
                    else rowRefs.current.delete(item.id);
                  }}
                  role="option"
                  className={cn(
                    'list-row flex items-start gap-3 outline-none',
                    collection.isSelected(item.id) && 'list-row-selected',
                    collection.activeId === item.id && !collection.isSelected(item.id) && 'bg-muted',
                  )}
                >
                  <SelectionCheckbox
                    {...collection.getCheckboxProps(item.id)}
                    alwaysVisible={collection.isSelected(item.id)}
                    ariaLabel={collection.isSelected(item.id) ? 'Deselect action item' : 'Select action item'}
                  />
                  <button
                    type="button"
                    onClick={() => void toggle(item)}
                    disabled={saving === item.id}
                    aria-label={done ? 'Mark as pending' : 'Mark as completed'}
                    className="mt-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                  >
                    {done ? (
                      <CheckCircleIcon size={18} weight="fill" className="text-primary" />
                    ) : (
                      <CircleIcon size={18} />
                    )}
                  </button>

                  <div className="min-w-0 flex-1 space-y-1">
                    <p className={cn('text-sm', done && 'text-muted-foreground line-through')}>
                      {item.title}
                    </p>
                    {item.description ? (
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {item.assignee ? (
                        <span className="flex items-center gap-1">
                          <UserIcon size={12} />
                          {item.assignee}
                        </span>
                      ) : null}
                      {meetingTitle ? <span className="truncate">{meetingTitle}</span> : null}
                      <span>{formatDate(item.meetingDate)}</span>
                    </div>
                  </div>

                  {item.forMe && !done ? (
                    <Badge variant="default" className="h-5 shrink-0 px-1.5 text-xs font-normal">
                      Mine
                    </Badge>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-xl px-4 py-10 text-center text-sm text-muted-foreground">
            {items.length ? 'Nothing here with those filters.' : 'No action items captured yet.'}
          </p>
        )
      ) : null}

      <MultiSelectActionBar
        {...collection.getActionBarProps()}
        itemLabel={{ singular: 'action item', plural: 'action items' }}
      />
    </main>
  );
}
