'use client';

/**
 * Shared data layer + domain model for Journal.
 *
 * Everything the Journal and Insights routes need to read and write
 * `journal_entries` lives here: the metric config, the entry adapter over the
 * SDK's normalized documents, the query/upsert hooks, and formatting helpers.
 */

import { useCallback, useMemo } from 'react';
import { useDocuments, useUpsertDocument, type DocumentRecord } from '@notis/sdk';

export const JOURNAL_DATABASE_SLUG = 'journal_entries';

// Canonical property names as defined on the journal_entries schema.
export const PROP = {
  title: 'Name',
  date: 'Date',
  morningMood: 'Morning Mood',
  mood: 'General Mood', // the day's overall mood
  motivation: 'Motivation',
  sleepiness: 'Sleepiness',
  tasks: 'Meaningful Tasks',
  appetite: 'Appetite',
  medOnset: 'Medication Onset',
  medWoreOff: 'Medication Wore Off',
} as const;

export interface JournalEntry {
  id: string;
  title: string;
  date: string | null; // YYYY-MM-DD for the day this entry is for
  morningMood: string | null;
  mood: string | null; // overall / general mood for the day
  motivation: number | null;
  sleepiness: number | null;
  meaningfulTasks: number | null;
  appetite: string | null;
  medOnset: string | null; // ISO date-time
  medWoreOff: string | null; // ISO date-time
  /** Markdown body of the entry document. Edited via the embedded editor. */
  reflection: string | null;
  createdAt: string | null;
  lastEditedTime: string | null;
}

export interface MoodOption {
  name: string;
  score: number; // 1..5, higher is better
  color: string; // accent used for dots / bars
  soft: string; // translucent background
}

/** Ordered best -> worst so segmented controls read naturally. */
export const MOODS: MoodOption[] = [
  { name: 'Amazing', score: 5, color: '#10b981', soft: 'rgba(16,185,129,0.14)' },
  { name: 'Good', score: 4, color: '#3b82f6', soft: 'rgba(59,130,246,0.14)' },
  { name: 'Neutral', score: 3, color: '#94a3b8', soft: 'rgba(148,163,184,0.16)' },
  { name: 'Low', score: 2, color: '#f59e0b', soft: 'rgba(245,158,11,0.16)' },
  { name: 'Rough', score: 1, color: '#ef4444', soft: 'rgba(239,68,68,0.14)' },
];

export const APPETITES = ['None', 'Low', 'Normal', 'High'] as const;
export type Appetite = (typeof APPETITES)[number];

export const APPETITE_COLOR: Record<string, string> = {
  None: '#ef4444',
  Low: '#f59e0b',
  Normal: '#10b981',
  High: '#3b82f6',
};

export function moodMeta(name: string | null | undefined): MoodOption | null {
  if (!name) return null;
  return MOODS.find((m) => m.name === name) ?? null;
}

// ---------------------------------------------------------------------------
// Entry adapter over SDK-normalized documents
// ---------------------------------------------------------------------------

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function entryFromDocument(document: DocumentRecord): JournalEntry {
  const props = document.properties;
  return {
    id: document.id,
    title: str(props[PROP.title]) ?? str(document.title) ?? 'Untitled entry',
    date: str(props[PROP.date]),
    morningMood: str(props[PROP.morningMood]),
    mood: str(props[PROP.mood]),
    motivation: num(props[PROP.motivation]),
    sleepiness: num(props[PROP.sleepiness]),
    meaningfulTasks: num(props[PROP.tasks]),
    appetite: str(props[PROP.appetite]),
    medOnset: str(props[PROP.medOnset]),
    medWoreOff: str(props[PROP.medWoreOff]),
    reflection: document.contentMarkdown ?? document.plainText ?? null,
    createdAt: document.createdAt ?? null,
    lastEditedTime: document.lastEditedTime ?? null,
  };
}

/** Newest first, using the entry Date then falling back to creation time. */
export function sortEntries(entries: JournalEntry[]): JournalEntry[] {
  return [...entries].sort((a, b) => {
    const av = a.date ?? a.createdAt ?? '';
    const bv = b.date ?? b.createdAt ?? '';
    return av < bv ? 1 : av > bv ? -1 : 0;
  });
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function toDate(value: string | null): Date | null {
  if (!value) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    const localDate = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(localDate.getTime()) ? null : localDate;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** YYYY-MM-DD in local time, for grouping and <input type="date">. */
export function dayKey(value: string | null): string | null {
  const d = toDate(value);
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayKey(): string {
  return dayKey(new Date().toISOString()) ?? '';
}

export function formatDay(value: string | null, opts: { weekday?: boolean } = {}): string {
  const d = toDate(value);
  if (!d) return 'No date';
  return d.toLocaleDateString(undefined, {
    weekday: opts.weekday ? 'short' : undefined,
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

export function relativeDay(value: string | null): string | null {
  const key = dayKey(value);
  if (!key) return null;
  const today = todayKey();
  if (key === today) return 'Today';
  const yesterday = dayKey(new Date(Date.now() - 86400000).toISOString());
  if (key === yesterday) return 'Yesterday';
  return null;
}

export function formatTime(value: string | null): string | null {
  const d = toDate(value);
  if (!d) return null;
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Hours between medication onset and wearing off, if both are present. */
export function medActiveHours(entry: JournalEntry): number | null {
  const start = toDate(entry.medOnset);
  const end = toDate(entry.medWoreOff);
  if (!start || !end) return null;
  const hours = (end.getTime() - start.getTime()) / 3_600_000;
  return hours > 0 ? Math.round(hours * 10) / 10 : null;
}

/** Minutes since local midnight, for placing a time on a 24h track. */
export function minutesOfDay(value: string | null): number | null {
  const d = toDate(value);
  if (!d) return null;
  return d.getHours() * 60 + d.getMinutes();
}

/** Combine a YYYY-MM-DD day with a HH:mm time into an ISO string. */
export function combineDateTime(day: string, time: string): string | null {
  if (!day || !time) return null;
  const d = new Date(`${day}T${time}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** HH:mm in local time for an <input type="time">. */
export function timeInputValue(value: string | null): string {
  const d = toDate(value);
  if (!d) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function average(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (!nums.length) return null;
  return round1(nums.reduce((sum, v) => sum + v, 0) / nums.length);
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useJournalEntries() {
  const { documents, loading, error, refetch } = useDocuments(JOURNAL_DATABASE_SLUG, {
    // A one-year window keeps the embedded app fast while preserving enough
    // history for useful trends. Older entries remain available in Notis.
    pageSize: 365,
    fetchAll: false,
  });

  const entries = useMemo(
    () => sortEntries(documents.map(entryFromDocument)),
    [documents],
  );

  return { entries, loading, error: error?.message ?? null, refresh: refetch };
}

/**
 * Editable form state for an existing entry's structured metrics. The
 * reflection is the entry document's markdown body — edited in place through
 * the SDK `DocumentEditor`, not through this draft. Creation happens through
 * Notis.
 */
export interface EntryDraft {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  morningMood: string | null;
  mood: string | null;
  motivation: number | null;
  sleepiness: number | null;
  meaningfulTasks: number | null;
  appetite: string | null;
  medOnsetTime: string; // HH:mm
  medWoreOffTime: string; // HH:mm
}

export function useUpsertEntry() {
  const { upsert, loading, error } = useUpsertDocument(JOURNAL_DATABASE_SLUG);

  const save = useCallback(
    async (draft: EntryDraft): Promise<JournalEntry> => {
      const properties: Record<string, unknown> = {
        [PROP.title]: draft.title.trim() || 'Untitled entry',
        [PROP.date]: draft.date ? { start: draft.date, end: null } : null,
        [PROP.morningMood]: draft.morningMood,
        [PROP.mood]: draft.mood,
        [PROP.motivation]: draft.motivation,
        [PROP.sleepiness]: draft.sleepiness,
        [PROP.tasks]: draft.meaningfulTasks,
        [PROP.appetite]: draft.appetite,
      };

      const onset = combineDateTime(draft.date, draft.medOnsetTime);
      properties[PROP.medOnset] = onset ? { start: onset, end: null } : null;
      const woreOff = combineDateTime(draft.date, draft.medWoreOffTime);
      properties[PROP.medWoreOff] = woreOff ? { start: woreOff, end: null } : null;

      const document = await upsert({
        documentId: draft.id,
        operation: 'update',
        properties,
      });
      return entryFromDocument(document);
    },
    [upsert],
  );

  return { save, loading, error };
}

/** Soft-delete (archive) an existing journal entry. */
export function useDeleteEntry() {
  const { upsert, loading, error } = useUpsertDocument(JOURNAL_DATABASE_SLUG);

  const remove = useCallback(
    async (entryId: string): Promise<void> => {
      await upsert({ documentId: entryId, operation: 'archive' });
    },
    [upsert],
  );

  return { remove, loading, error };
}

/** Turn a stored entry into an editable draft. */
export function entryToDraft(entry: JournalEntry): EntryDraft {
  return {
    id: entry.id,
    title: entry.title === 'Untitled entry' ? '' : entry.title,
    date: dayKey(entry.date) ?? dayKey(entry.createdAt) ?? todayKey(),
    morningMood: entry.morningMood,
    mood: entry.mood,
    motivation: entry.motivation,
    sleepiness: entry.sleepiness,
    meaningfulTasks: entry.meaningfulTasks,
    appetite: entry.appetite,
    medOnsetTime: timeInputValue(entry.medOnset),
    medWoreOffTime: timeInputValue(entry.medWoreOff),
  };
}

/** Compute a current daily-journaling streak (consecutive days up to today). */
export function computeStreak(entries: JournalEntry[]): number {
  const keys = new Set(entries.map((e) => dayKey(e.date)).filter(Boolean) as string[]);
  if (!keys.size) return 0;
  let streak = 0;
  const cursor = new Date();
  // Allow the streak to "start" yesterday if today has no entry yet.
  if (!keys.has(dayKey(cursor.toISOString()) ?? '')) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (keys.has(dayKey(cursor.toISOString()) ?? '')) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** "July 2026" style label for timeline month grouping. */
export function monthLabel(value: string | null): string {
  const key = dayKey(value);
  if (!key) return 'Undated';
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}
