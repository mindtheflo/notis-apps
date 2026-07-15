'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { DocumentEditor, Markdown, useDocument, useNotisNavigation, useTopBarSearch } from '@notis/sdk';
import {
  BedIcon,
  CalendarBlankIcon,
  CaretDownIcon,
  CaretUpIcon,
  ChatCircleDotsIcon,
  CheckCircleIcon,
  ClockIcon,
  FireIcon,
  ForkKnifeIcon,
  LightningIcon,
  NotePencilIcon,
  NotebookIcon,
  PencilSimpleIcon,
  PillIcon,
  SmileyIcon,
  TrashIcon,
  TrendUpIcon,
  XIcon,
} from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  APPETITES,
  MOODS,
  average,
  combineDateTime,
  computeStreak,
  dayKey,
  entryToDraft,
  formatDay,
  formatTime,
  medActiveHours,
  minutesOfDay,
  monthLabel,
  moodMeta,
  relativeDay,
  useDeleteEntry,
  useJournalEntries,
  useUpsertEntry,
  type EntryDraft,
  type JournalEntry,
} from './journal-core';
import {
  EmptyState,
  LoadingState,
  Meter,
  MetricChip,
  MoodBadge,
  MoodDot,
  SectionCard,
  StatTile,
} from './journal-ui';

type Mode = 'view' | 'edit';

export default function JournalPage() {
  const { entries: fetchedEntries, loading, error, refresh } = useJournalEntries();
  const { save, loading: saving } = useUpsertEntry();
  const { remove, loading: deleting } = useDeleteEntry();
  const navigation = useNotisNavigation();

  const [locallyArchivedIds, setLocallyArchivedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [mode, setMode] = useState<Mode>('view');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const [search, setSearch] = useState('');
  const [moodFilter, setMoodFilter] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Archiving is persisted by the generated database tool, but the follow-up
  // query can race other in-flight document reads. Hide submitted entries
  // immediately and roll that local state back only when the archive fails.
  const entries = useMemo(
    () => fetchedEntries.filter((entry) => !locallyArchivedIds.has(entry.id)),
    [fetchedEntries, locallyArchivedIds],
  );

  const { setLoading: setSearchLoading } = useTopBarSearch({
    value: search,
    onChange: setSearch,
    placeholder: 'Search your journal…',
  });
  useEffect(() => {
    setSearchLoading(loading);
  }, [loading, setSearchLoading]);

  const selected = useMemo(
    () => entries.find((e) => e.id === selectedId) ?? null,
    [entries, selectedId],
  );

  // Browse-first: land on the most recent entry.
  useEffect(() => {
    if (!loading && entries.length && !entries.some((e) => e.id === selectedId)) {
      setSelectedId(entries[0].id);
      setMode('view');
    }
  }, [loading, entries, selectedId]);

  const openEntry = useCallback((entry: JournalEntry) => {
    setSaveError(null);
    setSelectedId(entry.id);
    setMode('view');
  }, []);

  const startEdit = useCallback((entry: JournalEntry) => {
    setSaveError(null);
    setSelectedId(entry.id);
    setDraft(entryToDraft(entry));
    setMode('edit');
  }, []);

  const handleSave = useCallback(async () => {
    if (!draft) return;
    setSaveError(null);
    try {
      const saved = await save(draft);
      setSelectedId(saved.id);
      setMode('view');
      refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  }, [draft, save, refresh]);

  const weekSummary = useMemo(() => summarizeWeek(entries), [entries]);
  const streak = useMemo(() => computeStreak(entries), [entries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (moodFilter && e.mood !== moodFilter) return false;
      if (!q) return true;
      if (e.title.toLowerCase().includes(q)) return true;
      if (e.mood && e.mood.toLowerCase().includes(q)) return true;
      if (e.reflection && e.reflection.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [entries, search, moodFilter]);

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

  // Newer/older navigation walks the currently filtered timeline.
  const selectedIndex = useMemo(
    () => filtered.findIndex((e) => e.id === selectedId),
    [filtered, selectedId],
  );
  const newer = selectedIndex > 0 ? filtered[selectedIndex - 1] : null;
  const older =
    selectedIndex >= 0 && selectedIndex < filtered.length - 1
      ? filtered[selectedIndex + 1]
      : null;

  const handleDelete = useCallback(
    async (entry: JournalEntry) => {
      setSaveError(null);
      setLocallyArchivedIds((current) => {
        const next = new Set(current);
        next.add(entry.id);
        return next;
      });
      // Move selection to a neighbour first so the detail pane doesn't flash empty.
      setSelectedId(older?.id ?? newer?.id ?? null);
      setMode('view');
      try {
        await remove(entry.id);
        refresh();
      } catch (err) {
        setLocallyArchivedIds((current) => {
          const next = new Set(current);
          next.delete(entry.id);
          return next;
        });
        setSelectedId(entry.id);
        setSaveError(err instanceof Error ? err.message : String(err));
      }
    },
    [remove, refresh, older, newer],
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <NotebookIcon size={14} weight="bold" />
            Journal
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Your journal</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse how your days felt. To add today, just tell Notis about your day.
          </p>
        </div>
        <Button variant="outline" onClick={() => navigation.toRoute('/insights')} className="gap-1.5">
          <TrendUpIcon size={16} weight="bold" />
          Insights
        </Button>
      </header>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Streak"
          value={streak}
          suffix={streak === 1 ? 'day' : 'days'}
          icon={FireIcon}
          accent="#f59e0b"
          hint="Consecutive days journaled"
        />
        <StatTile
          label="Mood · 7d"
          value={weekSummary.mood != null ? moodLabelForScore(weekSummary.mood) : '—'}
          icon={SmileyIcon}
          accent="#10b981"
          hint={weekSummary.mood != null ? `${weekSummary.mood} / 5 average` : 'No entries yet'}
        />
        <StatTile
          label="Motivation · 7d"
          value={weekSummary.motivation ?? '—'}
          suffix={weekSummary.motivation != null ? '/ 10' : undefined}
          icon={LightningIcon}
          accent="#3b82f6"
        />
        <StatTile
          label="Tasks · 7d"
          value={weekSummary.tasks}
          icon={CheckCircleIcon}
          accent="#8b5cf6"
          hint="Meaningful tasks completed"
        />
      </div>

      {!loading && !error && entries.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={ChatCircleDotsIcon}
            title="No entries yet"
            description="Your journal fills up from conversations — tell Notis how your day went and the entry will show up here, ready to browse and refine."
          />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <SectionCard
              title="Timeline"
              description={
                filtered.length === entries.length
                  ? `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`
                  : `${filtered.length} of ${entries.length} entries`
              }
              icon={CalendarBlankIcon}
            >
              <MoodFilterRow value={moodFilter} onChange={setMoodFilter} />
              {loading ? (
                <LoadingState label="Loading entries…" />
              ) : error ? (
                <p className="py-8 text-center text-xs text-destructive">{error}</p>
              ) : filtered.length === 0 ? (
                <EmptyState
                  icon={NotePencilIcon}
                  title="No matches"
                  description="Try a different search term or clear the mood filter."
                />
              ) : (
                <div className="-mx-1 max-h-[620px] space-y-3 overflow-y-auto pr-1">
                  {monthGroups.map((group) => (
                    <div key={group.label}>
                      <div className="sticky top-0 z-10 bg-card px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {group.label}
                        <span className="ml-1.5 font-normal normal-case tracking-normal">
                          · {group.items.length}
                        </span>
                      </div>
                      <ol className="space-y-1">
                        {group.items.map((entry) => (
                          <TimelineRow
                            key={entry.id}
                            entry={entry}
                            active={entry.id === selectedId}
                            onClick={() => openEntry(entry)}
                          />
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <div className="lg:col-span-7">
            {mode === 'edit' && draft && selected ? (
              <EntryEditor
                draft={draft}
                setDraft={setDraft}
                saving={saving}
                error={saveError}
                onSave={handleSave}
                onCancel={() => {
                  openEntry(selected);
                  // The reflection autosaves through the embedded editor while
                  // the form is open; refresh so view mode shows those edits.
                  refresh();
                }}
              />
            ) : selected ? (
              <EntryDetail
                entry={selected}
                position={
                  selectedIndex >= 0 ? `${selectedIndex + 1} of ${filtered.length}` : null
                }
                error={saveError}
                deleting={deleting}
                onEdit={() => startEdit(selected)}
                onDelete={() => handleDelete(selected)}
                onNewer={newer ? () => openEntry(newer) : undefined}
                onOlder={older ? () => openEntry(older) : undefined}
                onOpenInsights={() => navigation.toRoute('/insights')}
              />
            ) : loading ? (
              <LoadingState label="Loading your journal…" />
            ) : (
              <EmptyState
                icon={NotebookIcon}
                title="Pick an entry"
                description="Choose a day from the timeline to read and edit it."
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

function MoodFilterRow({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter entries by mood">
      <button
        type="button"
        onClick={() => onChange(null)}
        aria-pressed={value === null}
        className={cn(
          'min-h-9 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors',
          value === null ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50',
        )}
      >
        All
      </button>
      {MOODS.map((m) => {
        const active = value === m.name;
        return (
          <button
            key={m.name}
            type="button"
            onClick={() => onChange(active ? null : m.name)}
            aria-pressed={active}
            className={cn(
              'inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors',
              active ? 'text-foreground' : 'text-muted-foreground hover:bg-muted/50',
            )}
            style={active ? { backgroundColor: m.soft, color: m.color } : undefined}
            title={`Show ${m.name} days`}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: m.color }} />
            {m.name}
          </button>
        );
      })}
    </div>
  );
}

function TimelineRow({
  entry,
  active,
  onClick,
}: {
  entry: JournalEntry;
  active: boolean;
  onClick: () => void;
}) {
  const rel = relativeDay(entry.date);
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={cn(
          'flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left transition-colors',
          active ? 'bg-muted' : 'hover:bg-muted/50',
        )}
      >
        <span className="mt-1.5">
          <MoodDot mood={entry.mood} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{entry.title}</span>
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>{rel ?? formatDay(entry.date, { weekday: true })}</span>
            {entry.mood ? <span aria-hidden>·</span> : null}
            {entry.mood ? <span>{entry.mood}</span> : null}
          </span>
          {entry.reflection ? (
            <span className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground/80">
              {entry.reflection}
            </span>
          ) : null}
          <span className="mt-1.5 flex flex-wrap gap-1">
            {entry.motivation != null ? (
              <MetricChip icon={LightningIcon} value={entry.motivation} label="Motivation" tone="#3b82f6" />
            ) : null}
            {entry.meaningfulTasks != null ? (
              <MetricChip icon={CheckCircleIcon} value={entry.meaningfulTasks} label="Meaningful tasks" tone="#8b5cf6" />
            ) : null}
            {medActiveHours(entry) != null ? (
              <MetricChip icon={PillIcon} value={`${medActiveHours(entry)}h`} label="Medication active window" tone="#0ea5e9" />
            ) : null}
          </span>
        </span>
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Entry detail (read-only)
// ---------------------------------------------------------------------------

function EntryDetail({
  entry,
  position,
  error,
  deleting,
  onEdit,
  onDelete,
  onNewer,
  onOlder,
  onOpenInsights,
}: {
  entry: JournalEntry;
  position: string | null;
  error: string | null;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onNewer?: () => void;
  onOlder?: () => void;
  onOpenInsights: () => void;
}) {
  const rel = relativeDay(entry.date);
  const active = medActiveHours(entry);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // The timeline list query returns only properties, not the document body, so
  // fetch the full entry to show the reflection text right here on the home page.
  const { document: full, loading: bodyLoading } = useDocument(entry.id);
  const reflection = full?.contentMarkdown ?? full?.plainText ?? entry.reflection;

  // Reset the delete confirmation whenever the viewed entry changes.
  useEffect(() => {
    setConfirmDelete(false);
  }, [entry.id]);

  return (
    <div className="rounded-2xl border border-border bg-card text-card-foreground shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarBlankIcon size={13} weight="bold" />
            {rel ? <span className="font-medium text-foreground">{rel}</span> : null}
            <span>{formatDay(entry.date, { weekday: true })}</span>
          </div>
          <h2 className="mt-1.5 truncate text-xl font-semibold tracking-tight">{entry.title}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="inline-flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">Morning</span>
              <MoodBadge mood={entry.morningMood} />
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">Overall</span>
              <MoodBadge mood={entry.mood} />
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-center rounded-lg border border-border">
            <button
              type="button"
              onClick={onNewer}
              disabled={!onNewer}
              className="flex h-10 w-10 items-center justify-center rounded-l-lg text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
              aria-label="Newer entry"
              title="Newer entry"
            >
              <CaretUpIcon size={14} weight="bold" />
            </button>
            <button
              type="button"
              onClick={onOlder}
              disabled={!onOlder}
              className="flex h-10 w-10 items-center justify-center rounded-r-lg border-l border-border text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
              aria-label="Older entry"
              title="Older entry"
            >
              <CaretDownIcon size={14} weight="bold" />
            </button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onEdit}
            className="gap-1.5"
            data-screenshot-action="edit-entry"
          >
            <PencilSimpleIcon size={14} weight="bold" />
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmDelete(true)}
            className="gap-1.5 text-muted-foreground hover:text-destructive"
              aria-label="Archive entry"
              title="Archive entry"
          >
            <TrashIcon size={14} weight="bold" />
          </Button>
        </div>
      </div>

      {confirmDelete ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-destructive/20 bg-destructive/5 px-6 py-3">
          <span className="text-xs text-foreground">
            Archive this entry? It will disappear from your journal.
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={onDelete}
              disabled={deleting}
              className="gap-1.5"
            >
              <TrashIcon size={14} weight="bold" />
              {deleting ? 'Archiving…' : 'Archive'}
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="border-b border-border px-6 py-2.5 text-xs text-destructive">{error}</p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-2">
        <ScaleReadout label="Motivation" value={entry.motivation} icon={LightningIcon} tone="#3b82f6" />
        <ScaleReadout label="Sleepiness" value={entry.sleepiness} icon={BedIcon} tone="#6366f1" />
        <div className="rounded-xl border border-border bg-background/40 p-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <CheckCircleIcon size={14} weight="bold" style={{ color: '#8b5cf6' }} />
            Meaningful tasks
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">
            {entry.meaningfulTasks ?? '—'}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-background/40 p-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <ForkKnifeIcon size={14} weight="bold" style={{ color: '#f59e0b' }} />
            Appetite
          </div>
          <div className="mt-2 text-lg font-semibold">{entry.appetite ?? '—'}</div>
        </div>
      </div>

      <div className="px-6 pb-5">
        <MedicationWindow entry={entry} activeHours={active} />
      </div>

      {reflection || bodyLoading ? (
        <div className="border-t border-border px-6 py-5">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <NotePencilIcon size={14} weight="bold" />
            Reflection
          </div>
          {reflection ? (
            <Markdown value={reflection} size="sm" className="text-foreground/90" />
          ) : (
            <p className="text-xs text-muted-foreground">Loading entry…</p>
          )}
        </div>
      ) : null}

      <div className="flex items-center justify-between border-t border-border px-6 py-3">
        <span className="text-[11px] text-muted-foreground">
          {[
            position ? `Entry ${position}` : null,
            entry.lastEditedTime ? `Edited ${formatDay(entry.lastEditedTime, { weekday: true })}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
        <button
          type="button"
          onClick={onOpenInsights}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <TrendUpIcon size={13} weight="bold" />
          View insights
        </button>
      </div>
    </div>
  );
}

function ScaleReadout({
  label,
  value,
  icon: IconCmp,
  tone,
}: {
  label: string;
  value: number | null;
  icon: typeof LightningIcon;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/40 p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <IconCmp size={14} weight="bold" style={{ color: tone }} />
          {label}
        </span>
        <span className="text-sm font-semibold tabular-nums">
          {value != null ? `${value}` : '—'}
          <span className="text-muted-foreground">{value != null ? ' / 10' : ''}</span>
        </span>
      </div>
      <div className="mt-2.5">
        <Meter value={value != null ? value / 10 : 0} color={tone} />
      </div>
    </div>
  );
}

function MedicationWindow({
  entry,
  activeHours,
}: {
  entry: JournalEntry;
  activeHours: number | null;
}) {
  const onset = minutesOfDay(entry.medOnset);
  const off = minutesOfDay(entry.medWoreOff);
  const hasWindow = onset != null && off != null && off > onset;
  return (
    <div className="rounded-xl border border-border bg-background/40 p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <PillIcon size={14} weight="bold" style={{ color: '#0ea5e9' }} />
          Medication window
        </span>
        {activeHours != null ? (
          <span className="text-sm font-semibold tabular-nums">{activeHours}h active</span>
        ) : (
          <span className="text-xs text-muted-foreground">Not logged</span>
        )}
      </div>
      <div className="relative mt-3 h-2 w-full rounded-full bg-muted">
        {hasWindow ? (
          <div
            className="absolute inset-y-0 rounded-full"
            style={{
              left: `${(onset! / 1440) * 100}%`,
              width: `${((off! - onset!) / 1440) * 100}%`,
              backgroundColor: '#0ea5e9',
            }}
          />
        ) : null}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <ClockIcon size={11} weight="bold" />
          Onset {formatTime(entry.medOnset) ?? '—'}
        </span>
        <span>Wore off {formatTime(entry.medWoreOff) ?? '—'}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor (existing entries only — new entries are created via Notis)
// ---------------------------------------------------------------------------

function EntryEditor({
  draft,
  setDraft,
  saving,
  error,
  onSave,
  onCancel,
}: {
  draft: EntryDraft;
  setDraft: React.Dispatch<React.SetStateAction<EntryDraft | null>>;
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  const headlineId = useId();
  const dateId = useId();
  const tasksId = useId();
  const medicationStartId = useId();
  const medicationEndId = useId();
  const patch = useCallback(
    (partial: Partial<EntryDraft>) =>
      setDraft((prev) => (prev ? { ...prev, ...partial } : prev)),
    [setDraft],
  );

  const activePreview = useMemo(() => {
    const onset = combineDateTime(draft.date, draft.medOnsetTime);
    const off = combineDateTime(draft.date, draft.medWoreOffTime);
    if (!onset || !off) return null;
    const h = (new Date(off).getTime() - new Date(onset).getTime()) / 3_600_000;
    return h > 0 ? Math.round(h * 10) / 10 : null;
  }, [draft.date, draft.medOnsetTime, draft.medWoreOffTime]);

  return (
    <div className="rounded-2xl border border-border bg-card text-card-foreground shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <NotePencilIcon size={16} weight="bold" />
          </span>
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Edit entry</h2>
            <p className="text-[11px] text-muted-foreground">Update how the day went.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
          aria-label="Discard metric changes and close editor"
        >
          <XIcon size={15} weight="bold" />
        </button>
      </div>

      <div className="space-y-5 px-6 py-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
          <div>
            <FieldLabel htmlFor={headlineId}>Headline</FieldLabel>
            <input
              id={headlineId}
              type="text"
              value={draft.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder="Give the day a title…"
              className={inputClass}
            />
          </div>
          <div>
            <FieldLabel htmlFor={dateId}>Date</FieldLabel>
            <input
              id={dateId}
              type="date"
              value={draft.date}
              onChange={(e) => patch({ date: e.target.value })}
              className={cn(inputClass, 'sm:w-[160px]')}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <MoodPicker
            label="Morning mood"
            hint="How you woke up"
            value={draft.morningMood}
            onChange={(v) => patch({ morningMood: v })}
          />
          <MoodPicker
            label="Overall mood"
            hint="How the day felt"
            value={draft.mood}
            onChange={(v) => patch({ mood: v })}
          />
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <ScaleField
            label="Motivation"
            hint="1 low · 10 peak"
            value={draft.motivation}
            onChange={(v) => patch({ motivation: v })}
            tone="#3b82f6"
          />
          <ScaleField
            label="Sleepiness"
            hint="1 awake · 10 exhausted"
            value={draft.sleepiness}
            onChange={(v) => patch({ sleepiness: v })}
            tone="#6366f1"
          />
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor={tasksId}>Meaningful tasks completed</FieldLabel>
            <NumberStepper
              id={tasksId}
              label="Meaningful tasks completed"
              value={draft.meaningfulTasks}
              onChange={(v) => patch({ meaningfulTasks: v })}
            />
          </div>
          <fieldset>
            <legend className="mb-1.5 block text-xs font-medium text-muted-foreground">Appetite</legend>
            <div className="flex flex-wrap gap-2">
              {APPETITES.map((a) => {
                const selected = draft.appetite === a;
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => patch({ appetite: selected ? null : a })}
                    aria-pressed={selected}
                    className={cn(
                      'min-h-10 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                      selected
                        ? 'border-transparent bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {a}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <FieldLabel>
              <span className="inline-flex items-center gap-1.5">
                <PillIcon size={13} weight="bold" style={{ color: '#0ea5e9' }} />
                Medication
              </span>
            </FieldLabel>
            {activePreview != null ? (
              <span className="text-[11px] font-medium text-muted-foreground">
                {activePreview}h active window
              </span>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={medicationStartId} className="mb-1 block text-[11px] text-muted-foreground">Started working</label>
              <input
                id={medicationStartId}
                type="time"
                value={draft.medOnsetTime}
                onChange={(e) => patch({ medOnsetTime: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor={medicationEndId} className="mb-1 block text-[11px] text-muted-foreground">Wore off</label>
              <input
                id={medicationEndId}
                type="time"
                value={draft.medWoreOffTime}
                onChange={(e) => patch({ medWoreOffTime: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <FieldLabel>Reflection</FieldLabel>
            <span className="text-[11px] text-muted-foreground">Saves as you type</span>
          </div>
          {/* The reflection is the entry document's body — edited in place
              through the host document editor, independent of the form save. */}
          <div className="rounded-lg border border-border bg-background px-3 py-2">
            <DocumentEditor documentId={draft.id} variant="body" />
          </div>
        </div>

        {error ? (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Discard metric changes
        </Button>
        <Button onClick={onSave} disabled={saving} className="gap-1.5">
          <CheckCircleIcon size={16} weight="bold" />
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}

function MoodPicker({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const legendId = useId();
  return (
    <div role="group" aria-labelledby={legendId}>
      <div className="flex items-baseline justify-between">
        <span id={legendId} className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {MOODS.map((m) => {
          const selected = value === m.name;
          return (
            <button
              key={m.name}
              type="button"
              onClick={() => onChange(selected ? null : m.name)}
              aria-pressed={selected}
              className={cn(
                'inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                selected ? 'border-transparent' : 'border-border text-muted-foreground hover:bg-muted',
              )}
              style={selected ? { backgroundColor: m.soft, color: m.color } : undefined}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: m.color }} />
              {m.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ScaleField({
  label,
  hint,
  value,
  onChange,
  tone,
}: {
  label: string;
  hint: string;
  value: number | null;
  onChange: (value: number | null) => void;
  tone: string;
}) {
  const legendId = useId();
  return (
    <div role="group" aria-labelledby={legendId}>
      <div className="flex items-baseline justify-between">
        <span id={legendId} className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const active = value != null && n <= value;
          const isCurrent = value === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(isCurrent ? null : n)}
              className={cn(
                'h-10 flex-1 rounded-md border text-xs font-semibold tabular-nums transition-colors',
                active ? 'border-transparent text-white' : 'border-border text-muted-foreground hover:bg-muted',
              )}
              style={active ? { backgroundColor: tone } : undefined}
              aria-pressed={isCurrent}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NumberStepper({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const current = value ?? 0;
  return (
    <div className="inline-flex items-center rounded-lg border border-border">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, current - 1))}
        className="flex h-10 w-10 items-center justify-center rounded-l-lg text-muted-foreground transition-colors hover:bg-muted"
        aria-label={`Decrease ${label.toLowerCase()}`}
      >
        <span className="text-lg leading-none">−</span>
      </button>
      <input
        id={id}
        aria-label={label}
        type="number"
        min={0}
        value={value ?? ''}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === '' ? null : Math.max(0, Math.floor(Number(v))));
        }}
        placeholder="0"
        className="h-10 w-14 border-x border-border bg-transparent text-center text-sm font-semibold tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => onChange(current + 1)}
        className="flex h-10 w-10 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:bg-muted"
        aria-label={`Increase ${label.toLowerCase()}`}
      >
        <span className="text-lg leading-none">+</span>
      </button>
    </div>
  );
}

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  const className = 'mb-1.5 block text-xs font-medium text-muted-foreground';
  return htmlFor
    ? <label htmlFor={htmlFor} className={className}>{children}</label>
    : <span className={className}>{children}</span>;
}

const inputClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function moodLabelForScore(score: number): string {
  return MOODS.reduce((best, m) =>
    Math.abs(m.score - score) < Math.abs(best.score - score) ? m : best,
  ).name;
}

function summarizeWeek(entries: JournalEntry[]): {
  mood: number | null;
  motivation: number | null;
  tasks: number;
} {
  const cutoff = dayKey(new Date(Date.now() - 6 * 86400000).toISOString());
  const recent = entries.filter((e) => {
    const key = dayKey(e.date);
    return key && cutoff && key >= cutoff;
  });
  const mood = average(recent.map((e) => moodMeta(e.mood)?.score ?? null));
  const motivation = average(recent.map((e) => e.motivation));
  const tasks = recent.reduce((sum, e) => sum + (e.meaningfulTasks ?? 0), 0);
  return { mood, motivation, tasks };
}
