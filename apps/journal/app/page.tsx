'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Markdown,
  NotisSelectionBoundary,
  ViewSkeleton,
  useActiveResource,
  useDocument,
  useNotis,
  useNotisNavigation,
  useTopBarSearch,
} from '@notis/sdk';
import { useCollectionInteractions, type CollectionInteractionController } from '@notis/sdk/interactions';
import {
  BookOpenTextIcon,
  CaretDownIcon,
  CaretUpIcon,
  ChatCircleDotsIcon,
  FlameIcon,
  LightbulbIcon,
  LightningIcon,
  MoonStarsIcon,
  NotebookIcon,
  QuotesIcon,
  RocketLaunchIcon,
  SparkleIcon,
  StarIcon,
  SunHorizonIcon,
  TargetIcon,
} from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import { PageHeading } from '@/components/page-heading';
import { cn } from '@/lib/utils';
import {
  computeStreak,
  beginResourceNavigation,
  dayKey,
  ENERGY_COLOR,
  eveningComplete,
  eveningStarted,
  formatDayLong,
  gratitudeCount,
  isDocumentMissingError,
  isAwaitingResourceNavigationEcho,
  monthLabel,
  moodStep,
  morningComplete,
  morningStarted,
  MOTIVATION_COLOR,
  railDate,
  relativeDay,
  resolveJournalResource,
  todayKey,
  useJournalEntries,
  type JournalEntry,
} from './journal-core';
import {
  EmptyState,
  LevelTicks,
  MoodDot,
  MoodScale,
  PromptBlock,
  RitualChip,
  RitualSection,
} from './journal-ui';

const MORNING_ACCENT = 'hsl(var(--primary))';
const MORNING_ACCENT_SOFT = 'hsl(var(--primary) / 0.1)';
const EVENING_ACCENT = 'hsl(var(--foreground) / 0.6)';

export default function JournalPage() {
  const { entries, loading, hasData, error, refresh } = useJournalEntries();
  const { resourceId } = useNotis();
  const navigation = useNotisNavigation();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const pendingResourceIdRef = useRef<string | null | undefined>(undefined);

  const listedRequestedEntry = useMemo(
    () => resourceId ? entries.find((entry) => entry.id === resourceId) ?? null : null,
    [entries, resourceId],
  );
  const requestedDocument = useDocument(resourceId, {
    enabled: Boolean(resourceId && !listedRequestedEntry),
  });
  const requestedDocumentMissing = isDocumentMissingError(requestedDocument.error);
  const resourceLookupError = requestedDocumentMissing
    ? null
    : requestedDocument.error?.message ?? error;
  const resourceResolution = useMemo(
    () => resolveJournalResource({
      entries,
      resourceId,
      requestedDocument: requestedDocument.document,
      resourceSettled: !loading && !requestedDocument.loading,
      resourceFailed: Boolean(resourceLookupError),
    }),
    [entries, loading, requestedDocument.document, requestedDocument.loading, resourceId, resourceLookupError],
  );
  const availableEntries = resourceResolution.entries;

  function updateSearch(value: string) {
    setSearch(value);
    if (resourceId || pendingResourceIdRef.current !== undefined) {
      const transition = beginResourceNavigation(
        resourceId,
        pendingResourceIdRef.current,
        null,
      );
      pendingResourceIdRef.current = transition.pendingResourceId;
      if (transition.shouldNavigate) navigation.toRoute('/', { resourceId: null });
    }
  }

  // Filtering is instant and local (no network round trip), so the top-bar
  // spinner is never driven here — only an explicitly submitted search
  // should toggle it, per the instant-loading contract.
  useTopBarSearch({
    value: search,
    onChange: updateSearch,
    placeholder: 'Search your journal…',
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return availableEntries;
    return availableEntries.filter((e) => entrySearchText(e).includes(q));
  }, [availableEntries, search]);

  function selectEntry(id: string | null) {
    setSelectedId(id);
    if (!id) return;
    const transition = beginResourceNavigation(
      resourceId,
      pendingResourceIdRef.current,
      id,
    );
    pendingResourceIdRef.current = transition.pendingResourceId;
    if (transition.shouldNavigate) navigation.toRoute('/', { resourceId: id });
  }

  const collection = useCollectionInteractions({
    items: filtered,
    getId: (entry: JournalEntry) => entry.id,
    selectionMode: 'none',
    activeId: selectedId,
    onActiveIdChange: selectEntry,
  });

  // Exact deep links win over the normal most-recent-day landing behavior.
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
        setSelectedId(availableEntries[0]?.id ?? null);
      }
      return;
    }
    if (!loading && !filtered.some((entry) => entry.id === selectedId)) {
      setSelectedId(filtered[0]?.id ?? null);
    }
  }, [availableEntries, filtered, loading, resourceId, resourceResolution.missing, resourceResolution.requested, selectedId]);

  const selected = useMemo(
    () => filtered.find((e) => e.id === selectedId) ?? null,
    [filtered, selectedId],
  );
  useActiveResource(selected ? {
    id: selected.id,
    kind: 'journal-entry',
    label: selected.title,
    attributes: {
      date: selected.date,
      morningComplete: morningComplete(selected),
      eveningComplete: eveningComplete(selected),
    },
    snapshot: selected.freeEntry ? { format: 'markdown', content: selected.freeEntry } : null,
  } : null);

  const streak = useMemo(() => computeStreak(entries), [entries]);
  const todayEntry = useMemo(
    () => entries.find((e) => dayKey(e.date) === todayKey()) ?? null,
    [entries],
  );

  const monthGroups = useMemo(() => {
    const groups: Array<{ label: string; items: JournalEntry[] }> = [];
    for (const entry of filtered) {
      const label = monthLabel(entry.date ?? entry.createdAt);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(entry);
      else groups.push({ label, items: [entry] });
    }
    return groups;
  }, [filtered]);

  const selectedIndex = useMemo(
    () => filtered.findIndex((e) => e.id === selectedId),
    [filtered, selectedId],
  );
  const newer = selectedIndex > 0 ? filtered[selectedIndex - 1] : null;
  const older =
    selectedIndex >= 0 && selectedIndex < filtered.length - 1
      ? filtered[selectedIndex + 1]
      : null;

  // First read with nothing to show yet: keep the heading and top-bar search
  // registered, and skeleton only the timeline + day-spread region below.
  const showInitialSkeleton = (loading || resourceResolution.pending) && !availableEntries.length;

  return (
    <div data-store-screenshot="journal" className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-8">
      <PageHeading
        title="Journal"
        description="Written with Notis, one morning and one evening at a time."
        actions={
          <>
            {streak > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium">
                <FlameIcon size={14} weight="fill" className="text-primary" />
                {streak}-day streak
              </span>
            ) : null}
            {todayEntry ? (
              <>
                <RitualChip
                  icon={SunHorizonIcon}
                  label="Morning"
                  tone="default"
                  state={
                    morningComplete(todayEntry)
                      ? 'complete'
                      : morningStarted(todayEntry)
                        ? 'partial'
                        : 'missing'
                  }
                />
                <RitualChip
                  icon={MoonStarsIcon}
                  label="Evening"
                  tone="secondary"
                  state={
                    eveningComplete(todayEntry)
                      ? 'complete'
                      : eveningStarted(todayEntry)
                        ? 'partial'
                        : 'missing'
                  }
                />
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                <ChatCircleDotsIcon size={13} />
                Today starts with your morning check-in
              </span>
            )}
          </>
        }
      />

      {resourceLookupError ? (
        <div className="mt-6 flex items-center justify-between gap-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span>{resourceLookupError}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              refresh();
              requestedDocument.refetch();
            }}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {resourceResolution.missing ? (
        <p className="mt-6 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          Journal entry no longer available. Showing your latest entry.
        </p>
      ) : null}

      {showInitialSkeleton ? (
        <div className="mt-6">
          <ViewSkeleton variant="detail" />
        </div>
      ) : !hasData ? null : availableEntries.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={BookOpenTextIcon}
            title="Your journal is waiting for its first page"
            description="Start a morning or evening check-in with your assistant. Scheduled prompts are optional."
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={NotebookIcon}
            title="Nothing matches your search"
            description="Try a different word — moods, gratitudes, highlights, and free entries are all searchable."
          />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[248px_minmax(0,1fr)]">
          {/* Timeline rail */}
          <nav
            {...collection.getContainerProps()}
            role="listbox"
            aria-label="Journal timeline"
            className="max-h-56 min-w-0 overflow-y-auto lg:max-h-[calc(100vh-220px)] lg:pr-1"
          >
            <div className="space-y-5">
              {monthGroups.map((group) => (
                <div key={group.label}>
                  <p className="px-2 text-xs font-semibold text-muted-foreground">
                    {group.label}
                  </p>
                  <div className="mt-1.5 space-y-0.5">
                    {group.items.map((entry) => (
                      <RailRow
                        key={entry.id}
                        entry={entry}
                        selected={entry.id === selectedId}
                        itemProps={collection.getItemProps(entry.id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </nav>

          {/* Day spread */}
          {selected ? (
            <NotisSelectionBoundary resource={{ id: selected.id, kind: 'journal-entry', label: selected.title }}>
              <DaySpread
                entry={selected}
                onNewer={newer ? () => selectEntry(newer.id) : undefined}
                onOlder={older ? () => selectEntry(older.id) : undefined}
              />
            </NotisSelectionBoundary>
          ) : null}
        </div>
      )}
    </div>
  );
}

function RailRow({
  entry,
  selected,
  itemProps,
}: {
  entry: JournalEntry;
  selected: boolean;
  itemProps: ReturnType<CollectionInteractionController<JournalEntry>['getItemProps']>;
}) {
  const { weekday, day } = railDate(entry.date ?? entry.createdAt);
  const word = entry.dayMoodWord ?? entry.morningMoodWord;
  return (
    <button
      {...itemProps}
      type="button"
      role="option"
      aria-current={selected ? 'date' : undefined}
      data-rail-row={dayKey(entry.date) ?? entry.id}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors',
        selected ? 'bg-muted' : 'hover:bg-muted/50',
      )}
    >
      <span className="flex w-9 shrink-0 flex-col items-center rounded-md py-0.5">
        <span className="text-xs font-semibold text-muted-foreground">
          {weekday}
        </span>
        <span className="text-sm font-semibold tabular-nums leading-tight">{day}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-xs capitalize', word ? 'font-medium' : 'text-muted-foreground')}>
          {word ?? relativeDay(entry.date) ?? 'Entry'}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1" aria-hidden>
        <MoodDot value={entry.morningMood} />
        <MoodDot value={entry.dayMood} />
      </span>
    </button>
  );
}

function DaySpread({
  entry,
  onNewer,
  onOlder,
}: {
  entry: JournalEntry;
  onNewer?: () => void;
  onOlder?: () => void;
}) {
  const isToday = dayKey(entry.date) === todayKey();
  const relative = relativeDay(entry.date);
  const missingMorningHint = isToday
    ? 'Not captured yet — Notis will pick it up with you.'
    : 'Not captured that day.';
  const missingEveningHint = isToday
    ? 'Tonight’s check-in will ask about this.'
    : 'Not captured that day.';

  return (
    <article className="min-w-0">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            {formatDayLong(entry.date ?? entry.createdAt)}
          </h2>
          {relative ? (
            <p className="mt-0.5 text-xs font-medium text-muted-foreground">{relative}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onNewer} disabled={!onNewer} aria-label="Newer entry">
            <CaretUpIcon size={16} weight="bold" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onOlder} disabled={!onOlder} aria-label="Older entry">
            <CaretDownIcon size={16} weight="bold" />
          </Button>
        </div>
      </header>

      <div className="mt-4 space-y-4">
        <RitualSection
          icon={SunHorizonIcon}
          title="Morning"
          accent={MORNING_ACCENT}
          aside={
            entry.morningMood == null && !morningStarted(entry) ? (
              <span className="text-xs italic text-muted-foreground/80">{missingMorningHint}</span>
            ) : undefined
          }
        >
          <PromptBlock prompt="Waking up, I felt" missingHint={missingMorningHint}>
            {entry.morningMood != null || entry.morningMoodWord ? (
              <MoodScale value={entry.morningMood} word={entry.morningMoodWord} />
            ) : null}
          </PromptBlock>

          {entry.morningFeeling ? (
            <PromptBlock prompt="How I was feeling">
              <p className="text-sm leading-relaxed">{entry.morningFeeling}</p>
            </PromptBlock>
          ) : null}

          <div className="space-y-2.5 rounded-xl bg-muted/40 px-4 py-3.5">
            <LevelTicks label="Energy" value={entry.energy} color={ENERGY_COLOR} icon={LightningIcon} />
            <LevelTicks label="Motivation" value={entry.motivation} color={MOTIVATION_COLOR} icon={RocketLaunchIcon} />
          </div>

          <PromptBlock
            prompt="Three things I’m grateful for"
            missingHint={missingMorningHint}
          >
            {gratitudeCount(entry) > 0 ? (
              <ol className="space-y-1.5">
                {entry.gratitudes.map((text, index) =>
                  text ? (
                    <li key={index} className="flex items-start gap-2.5">
                      <SparkleIcon
                        size={14}
                        weight="fill"
                        className="mt-0.5 shrink-0"
                        style={{ color: MORNING_ACCENT }}
                      />
                      <span className="text-sm leading-relaxed">{text}</span>
                    </li>
                  ) : null,
                )}
              </ol>
            ) : null}
          </PromptBlock>

          <PromptBlock prompt="What will make today great" missingHint={missingMorningHint}>
            {entry.intention ? (
              <p className="flex items-start gap-2.5 text-sm leading-relaxed">
                <TargetIcon size={14} weight="bold" className="mt-0.5 shrink-0 text-muted-foreground" />
                <span>{entry.intention}</span>
              </p>
            ) : null}
          </PromptBlock>

          {entry.affirmation ? (
            <figure className="rounded-xl px-4 py-4 text-center" style={{ backgroundColor: MORNING_ACCENT_SOFT }}>
              <QuotesIcon size={16} weight="fill" className="mx-auto" style={{ color: MORNING_ACCENT }} />
              <blockquote className="mt-1.5 text-base italic leading-relaxed">
                {entry.affirmation}
              </blockquote>
              <figcaption className="mt-1 text-xs font-medium text-muted-foreground">
                Daily affirmation
              </figcaption>
            </figure>
          ) : (
            <PromptBlock prompt="Daily affirmation" missingHint={missingMorningHint} />
          )}
        </RitualSection>

        <RitualSection
          icon={MoonStarsIcon}
          title="Evening"
          accent={EVENING_ACCENT}
          aside={
            !eveningStarted(entry) ? (
              <span className="text-xs italic text-muted-foreground/80">{missingEveningHint}</span>
            ) : undefined
          }
        >
          <PromptBlock prompt="The day felt" missingHint={missingEveningHint}>
            {entry.dayMood != null || entry.dayMoodWord ? (
              <MoodScale value={entry.dayMood} word={entry.dayMoodWord} />
            ) : null}
          </PromptBlock>

          <PromptBlock prompt="Highlight of the day" missingHint={missingEveningHint}>
            {entry.highlight ? (
              <p className="flex items-start gap-2.5 text-sm leading-relaxed">
                <StarIcon size={14} weight="fill" className="mt-0.5 shrink-0" style={{ color: EVENING_ACCENT }} />
                <span>{entry.highlight}</span>
              </p>
            ) : null}
          </PromptBlock>

          <PromptBlock prompt="What today taught me" missingHint={missingEveningHint}>
            {entry.lesson ? (
              <p className="flex items-start gap-2.5 text-sm leading-relaxed">
                <LightbulbIcon size={14} weight="bold" className="mt-0.5 shrink-0 text-muted-foreground" />
                <span>{entry.lesson}</span>
              </p>
            ) : null}
          </PromptBlock>
        </RitualSection>

        <OwnWordsSection entry={entry} isToday={isToday} />

        <p className="px-1 pb-2 text-center text-xs text-muted-foreground/70">
          Want to add or fix something? Just tell Notis — “add to my journal for{' '}
          {relative?.toLowerCase() ?? formatDayLong(entry.date)}…”
        </p>
      </div>
    </article>
  );
}

/** The optional free-form reflection, rendered read-only like every app view. */
function OwnWordsSection({ entry, isToday }: { entry: JournalEntry; isToday: boolean }) {
  return (
    <RitualSection
      icon={BookOpenTextIcon}
      title="In my own words"
      accent="hsl(var(--muted-foreground))"
      aside={
        <span className="text-xs italic text-muted-foreground/80">
          Captured in conversation with Notis.
        </span>
      }
    >
      {entry.freeEntry ? (
        <div className="prose prose-sm max-w-none text-sm leading-relaxed [&_p]:my-2">
          <Markdown value={entry.freeEntry} size="sm" />
        </div>
      ) : (
        <p className="text-sm italic text-muted-foreground/70">
          {isToday
            ? 'Nothing written yet — dictate a few lines to Notis tonight.'
            : 'No free entry that day.'}
        </p>
      )}
    </RitualSection>
  );
}

function entrySearchText(entry: JournalEntry): string {
  return [
    entry.title,
    entry.morningMoodWord,
    entry.dayMoodWord,
    entry.morningFeeling,
    ...entry.gratitudes,
    entry.intention,
    entry.affirmation,
    entry.highlight,
    entry.lesson,
    entry.freeEntry,
    moodStep(entry.morningMood)?.label,
    moodStep(entry.dayMood)?.label,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}
