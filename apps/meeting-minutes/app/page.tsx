'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Markdown,
  NotisSelectionBoundary,
  Skeleton,
  useActiveResource,
  useDocument,
  useDocuments,
  useDatabaseSubscription,
  useNotis,
  useNotisNavigation,
  useTopBarSearch,
} from '@notis/sdk';
import { useCollectionInteractions, type CollectionInteractionController } from '@notis/sdk/interactions';
import {
  ArrowSquareOutIcon,
  CalendarDotsIcon,
  ClockIcon,
  UsersThreeIcon,
  VideoCameraIcon,
} from '@phosphor-icons/react';

import { Badge } from '@/components/ui/badge';
import { MeetingListSkeleton, MeetingDetailSkeleton } from '@/components/meeting-skeleton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  beginResourceNavigation,
  formatDate,
  formatDateTime,
  formatDuration,
  groupByMonth,
  isDocumentMissingError,
  isAwaitingResourceNavigationEcho,
  pluralize,
  resolveMeetingResource,
  splitSections,
  toMeeting,
  toActionItem,
  countOpenActionItems,
  type Meeting,
} from '@/lib/meetings';

export default function MeetingsPage() {
  // The list stays light: hundreds of meetings, each carrying a full transcript,
  // is far too much to hold at once. The body is fetched for the open meeting only.
  const { documents, loading, hasData, error } = useDocuments('meetings', { pageSize: 100, fetchAll: true });
  const actionLedger = useDatabaseSubscription('meeting_action_items', {pageSize:100, fetchAll:true, includeContent:false});
  const openCounts = useMemo(() => countOpenActionItems(actionLedger.documents.map(toActionItem)), [actionLedger.documents]);
  const { resourceId } = useNotis();
  const { toRoute } = useNotisNavigation();

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [section, setSection] = useState<string | null>(null);
  const pendingResourceIdRef = useRef<string | null | undefined>(undefined);

  const onSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (resourceId || pendingResourceIdRef.current !== undefined) {
      setSelectedId(null);
      const transition = beginResourceNavigation(
        resourceId,
        pendingResourceIdRef.current,
        null,
      );
      pendingResourceIdRef.current = transition.pendingResourceId;
      if (transition.shouldNavigate) toRoute('/', { resourceId: null });
    }
  }, [resourceId, toRoute]);
  useTopBarSearch({ value: search, onChange: onSearchChange, placeholder: 'Search meetings…' });

  // Newest first: that is the order someone actually looks for a meeting in.
  const meetings = useMemo(() => {
    const rows = documents.map(toMeeting);
    rows.sort((a, b) => {
      const left = a.date ? Date.parse(a.date) : 0;
      const right = b.date ? Date.parse(b.date) : 0;
      return right - left;
    });
    return rows;
  }, [documents]);

  const listedRequestedMeeting = useMemo(
    () => resourceId ? meetings.find((meeting) => meeting.id === resourceId) ?? null : null,
    [meetings, resourceId],
  );
  const requestedDocument = useDocument(resourceId, {
    enabled: Boolean(resourceId && !listedRequestedMeeting),
  });
  const requestedDocumentMissing = isDocumentMissingError(requestedDocument.error);
  const resourceLookupError = requestedDocumentMissing
    ? null
    : requestedDocument.error?.message ?? error?.message ?? null;
  const resourceResolution = useMemo(
    () => resolveMeetingResource({
      meetings,
      resourceId,
      requestedDocument: requestedDocument.document,
      resourceSettled: !loading && !requestedDocument.loading,
      resourceFailed: Boolean(resourceLookupError),
    }),
    [loading, meetings, requestedDocument.document, requestedDocument.loading, resourceId, resourceLookupError],
  );
  const availableMeetings = useMemo(() => resourceResolution.meetings.map(meeting => ({...meeting, openActionItems: actionLedger.hasData ? (openCounts.get(meeting.id) ?? 0) : 0})), [resourceResolution.meetings, openCounts, actionLedger.hasData]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return availableMeetings;
    return availableMeetings.filter((meeting) => {
      const haystack = [
        meeting.title,
        meeting.summary ?? '',
        meeting.attendees.join(' '),
        meeting.attendeeEmails.join(' '),
        meeting.tags.join(' '),
        meeting.contentMarkdown ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [availableMeetings, search]);

  const selectMeeting = useCallback((id: string | null) => {
    setSelectedId(id);
    if (!id) return;
    const transition = beginResourceNavigation(
      resourceId,
      pendingResourceIdRef.current,
      id,
    );
    pendingResourceIdRef.current = transition.pendingResourceId;
    if (transition.shouldNavigate) toRoute('/', { resourceId: id });
  }, [resourceId, toRoute]);

  const collection = useCollectionInteractions({
    items: filtered,
    getId: (meeting: Meeting) => meeting.id,
    selectionMode: 'none',
    activeId: selectedId,
    onActiveIdChange: selectMeeting,
  });

  const selected = useMemo(
    () => filtered.find((meeting) => meeting.id === selectedId) ?? null,
    [filtered, selectedId],
  );

  useEffect(() => {
    if (isAwaitingResourceNavigationEcho(pendingResourceIdRef.current, resourceId)) return;
    if (pendingResourceIdRef.current !== undefined) {
      pendingResourceIdRef.current = undefined;
    }
    if (resourceId) {
      if (resourceResolution.requested) {
        setSearch('');
        setSelectedId(resourceResolution.requested.id);
      } else if (resourceResolution.missing) {
        setSelectedId(availableMeetings[0]?.id ?? null);
      }
      return;
    }
    if (!selected) setSelectedId(filtered[0]?.id ?? null);
  }, [availableMeetings, filtered, resourceId, resourceResolution.missing, resourceResolution.requested, selected]);

  const { document: openDocument, loading: bodyLoading } = useDocument(selectedId);

  const body = useMemo(() => {
    if (openDocument?.id === selectedId) return openDocument.contentMarkdown ?? null;
    return selected?.contentMarkdown ?? null;
  }, [openDocument, selectedId, selected]);
  const meetingResource = selected ? {
    id: selected.id,
    kind: 'meeting',
    label: selected.title,
    attributes: {
      date: selected.date,
      attendees: selected.attendees.length,
      openActionItems: selected.openActionItems,
    },
    snapshot: body ? { format: 'markdown' as const, content: body } : null,
  } : null;
  useActiveResource(meetingResource);

  const sections = useMemo(() => splitSections(body), [body]);

  useEffect(() => {
    setSection(null);
  }, [selectedId]);

  const activeSection = useMemo(() => {
    if (!sections.length) return null;
    return sections.find((entry) => entry.heading === section) ?? sections[0];
  }, [sections, section]);

  const groups = useMemo(() => groupByMonth(filtered), [filtered]);

  return (
    <main className="notis-app-split">
      <aside className="notis-app-pane-list flex h-72 flex-col overflow-hidden lg:h-full">
        <div className="flex items-baseline justify-between px-4 py-3">
          <h1 className="text-sm font-semibold">Meetings</h1>
          <span className="text-xs text-muted-foreground">
            {hasData ? pluralize(filtered.length, 'meeting') : (
              <Skeleton style={{ display: 'inline-block', width: 64, height: 12 }} />
            )}
          </span>
        </div>

        {resourceLookupError ? (
          <p className="mx-4 mb-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {resourceLookupError}
          </p>
        ) : null}

        <div
          {...collection.getContainerProps()}
          role="listbox"
          aria-label="Meetings"
          className="min-h-0 flex-1 space-y-3 overflow-y-auto px-2 pb-3"
        >
          {loading && !hasData ? (
            <MeetingListSkeleton />
          ) : hasData ? (
            filtered.length ? (
              groups.map((group) => (
                <section key={group.label} className="space-y-1">
                  <p className="px-2 text-xs font-medium text-muted-foreground">
                    {group.label}
                  </p>
                  {group.meetings.map((meeting) => (
                    <MeetingRow
                      key={meeting.id}
                      meeting={meeting}
                      active={meeting.id === selectedId}
                      itemProps={collection.getItemProps(meeting.id)}
                    />
                  ))}
                </section>
              ))
            ) : (
              <p className="px-2 py-10 text-center text-sm text-muted-foreground">
                {meetings.length ? 'No meeting matches that search.' : 'No meetings recorded yet.'}
              </p>
            )
          ) : null}
        </div>
      </aside>

      <section className="notis-app-pane-detail overflow-y-auto">
        <div className="flex min-h-full flex-col px-6 py-6 pb-10 md:px-8">
          {resourceResolution.missing ? (
            <p className="mb-4 rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
              Meeting no longer available. Showing your latest meeting.
            </p>
          ) : null}
          {selected ? (
            <NotisSelectionBoundary resource={meetingResource} className="space-y-6">
              <MeetingHeader meeting={selected} />

              {sections.length > 1 ? (
                <nav className="flex flex-wrap gap-1 pb-2">
                  {sections.map((entry) => (
                    <Button
                      key={entry.heading}
                      variant="ghost"
                      size="sm"
                      onClick={() => setSection(entry.heading)}
                      className={cn(
                        'h-7 px-3 text-xs',
                        entry.heading === activeSection?.heading
                          ? 'bg-muted text-foreground'
                          : 'text-muted-foreground',
                      )}
                    >
                      {entry.heading}
                    </Button>
                  ))}
                </nav>
              ) : null}

              {activeSection ? (
                <Markdown value={activeSection.body} />
              ) : bodyLoading ? (
                <MeetingDetailSkeleton bodyOnly />
              ) : (
                <p className="rounded-xl px-4 py-10 text-center text-sm text-muted-foreground">
                  This meeting has no write-up.
                </p>
              )}
            </NotisSelectionBoundary>
          ) : loading || requestedDocument.loading ? (
            <MeetingDetailSkeleton />
          ) : hasData ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Select a meeting to read it.
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function MeetingRow({
  meeting,
  active,
  itemProps,
}: {
  meeting: Meeting;
  active: boolean;
  itemProps: ReturnType<CollectionInteractionController<Meeting>['getItemProps']>;
}) {
  const duration = formatDuration(meeting.durationMinutes);
  return (
    <button
      {...itemProps}
      type="button"
      role="option"
      className={cn(
        'w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/60',
        active && 'bg-muted hover:bg-muted',
      )}
    >
      <p className="truncate text-sm font-medium">{meeting.title}</p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">
        {formatDate(meeting.date)}
        {duration ? ` · ${duration}` : ''}
        {meeting.attendees.length ? ` · ${pluralize(meeting.attendees.length, 'person', 'people')}` : ''}
      </p>
      {meeting.openActionItems > 0 ? (
        <Badge variant="secondary" className="mt-1.5 h-5 px-1.5 text-xs font-normal">
          {pluralize(meeting.openActionItems, 'open item')}
        </Badge>
      ) : null}
    </button>
  );
}

function MeetingHeader({ meeting }: { meeting: Meeting }) {
  const duration = formatDuration(meeting.durationMinutes);
  const people = meeting.attendees.length ? meeting.attendees : meeting.attendeeEmails;
  const badgeLabels = meeting.source ? [...meeting.tags, meeting.source] : meeting.tags;
  const visibleBadges = badgeLabels.slice(0, 2);
  const overflowBadges = badgeLabels.slice(2);

  return (
    <header className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold leading-tight">{meeting.title}</h2>
        {meeting.summary ? (
          <p className="text-sm text-muted-foreground">{meeting.summary}</p>
        ) : null}
      </div>

      <dl className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <Fact icon={<CalendarDotsIcon size={14} />}>{formatDateTime(meeting.date)}</Fact>
        {duration ? <Fact icon={<ClockIcon size={14} />}>{duration}</Fact> : null}
        {people.length ? (
          <Fact icon={<UsersThreeIcon size={14} />}>{people.join(', ')}</Fact>
        ) : null}
      </dl>

      <div className="flex flex-wrap items-center gap-2">
        {meeting.recording ? (
          <LinkButton href={meeting.recording} icon={<VideoCameraIcon size={14} />}>
            Recording
          </LinkButton>
        ) : null}
        {meeting.meetingLink ? (
          <LinkButton href={meeting.meetingLink} icon={<ArrowSquareOutIcon size={14} />}>
            Meeting link
          </LinkButton>
        ) : null}
        {meeting.sourceUrl ? (
          <LinkButton href={meeting.sourceUrl} icon={<ArrowSquareOutIcon size={14} />}>
            Original note
          </LinkButton>
        ) : null}
        {visibleBadges.map((label, index) => (
          <Badge key={`${label}-${index}`} variant="secondary" className="h-6 font-normal">
            {label}
          </Badge>
        ))}
        {overflowBadges.length ? (
          <span className="text-xs text-muted-foreground">{overflowBadges.join(' · ')}</span>
        ) : null}
      </div>
    </header>
  );
}

function Fact({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <span className="min-w-0">{children}</span>
    </span>
  );
}

function LinkButton({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Button asChild variant="outline" size="sm" className="h-7 gap-1.5 px-2.5 text-xs">
      <a href={href} target="_blank" rel="noreferrer">
        {icon}
        {children}
      </a>
    </Button>
  );
}
