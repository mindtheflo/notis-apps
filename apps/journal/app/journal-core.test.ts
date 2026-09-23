import assert from 'node:assert/strict';
import test from 'node:test';

import {
  average,
  beginResourceNavigation,
  entryFromDocument,
  eveningComplete,
  gratitudeCount,
  isDocumentMissingError,
  isAwaitingResourceNavigationEcho,
  moodStep,
  morningComplete,
  morningStarted,
  resolveJournalResource,
  sortEntries,
  topMoodWords,
  type JournalEntry,
} from './journal-core';

test('journal navigation waits for the host echo without latching same-resource clicks', () => {
  assert.deepEqual(beginResourceNavigation('entry-a', undefined, 'entry-a'), {
    pendingResourceId: undefined,
    shouldNavigate: false,
  });
  assert.deepEqual(beginResourceNavigation('entry-a', undefined, 'entry-b'), {
    pendingResourceId: 'entry-b',
    shouldNavigate: true,
  });
  assert.deepEqual(beginResourceNavigation('entry-a', 'entry-b', 'entry-b'), {
    pendingResourceId: 'entry-b',
    shouldNavigate: false,
  });
  assert.deepEqual(beginResourceNavigation('entry-a', undefined, null), {
    pendingResourceId: null,
    shouldNavigate: true,
  });
  assert.equal(isAwaitingResourceNavigationEcho('entry-b', 'entry-a'), true);
  assert.equal(isAwaitingResourceNavigationEcho('entry-b', 'entry-b'), false);
  assert.equal(isAwaitingResourceNavigationEcho(null, 'entry-a'), true);
  assert.equal(isAwaitingResourceNavigationEcho(null, null), false);
  assert.equal(isAwaitingResourceNavigationEcho(undefined, 'entry-a'), false);
});

function entry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: 'entry',
    title: 'Journal — 2026-07-15',
    date: '2026-07-15',
    morningMood: 6,
    morningMoodWord: 'rested',
    morningFeeling: 'Calm and ready.',
    energy: 8,
    motivation: 9,
    gratitudes: ['Coffee', 'A quiet hour', 'Good sleep'],
    intention: 'One deep-work block.',
    affirmation: 'I am allowed to do one thing at a time.',
    dayMood: 6,
    dayMoodWord: 'satisfying',
    highlight: 'The demo landed.',
    lesson: 'Front-load the scary task.',
    freeEntry: 'A useful reflection.',
    createdAt: '2026-07-15T07:00:00.000Z',
    lastEditedTime: null,
    ...overrides,
  };
}

test('entry adapter preserves normalized journal fields and the free entry', () => {
  const result = entryFromDocument({
    id: 'entry-1',
    title: 'Fallback title',
    properties: {
      Name: 'Journal — 2026-07-15',
      Date: '2026-07-15',
      'Morning Mood': 6,
      'Morning Mood Word': 'rested',
      'Morning Feeling': 'Calm and ready.',
      Energy: 8,
      Motivation: 9,
      'Gratitude 1': 'Coffee',
      'Gratitude 2': 'A quiet hour',
      'Gratitude 3': '  ',
      Intention: 'One deep-work block.',
      Affirmation: 'I am allowed to do one thing at a time.',
      'Day Mood': 7,
      'Day Mood Word': 'unstoppable',
      Highlight: 'The demo landed.',
      Lesson: 'Front-load the scary task.',
    },
    contentMarkdown: 'Protected the morning for deep work.',
  });

  assert.equal(result.title, 'Journal — 2026-07-15');
  assert.equal(result.morningMood, 6);
  assert.equal(result.morningMoodWord, 'rested');
  assert.equal(result.dayMood, 7);
  assert.deepEqual(result.gratitudes, ['Coffee', 'A quiet hour', null]);
  assert.equal(result.freeEntry, 'Protected the morning for deep work.');
});

test('entries sort newest first without mutating the input', () => {
  const original = [entry({ id: 'old', date: '2026-07-12' }), entry({ id: 'new', date: '2026-07-15' })];
  assert.deepEqual(sortEntries(original).map((item) => item.id), ['new', 'old']);
  assert.deepEqual(original.map((item) => item.id), ['old', 'new']);
});

test('journal resource resolution prefers a listed exact document', () => {
  const listed = [entry({ id: 'new' }), entry({ id: 'requested', date: '2026-07-14' })];
  const result = resolveJournalResource({
    entries: listed,
    resourceId: 'requested',
    requestedDocument: null,
    resourceSettled: false,
  });

  assert.equal(result.requested?.id, 'requested');
  assert.equal(result.entries, listed);
  assert.equal(result.pending, false);
  assert.equal(result.missing, false);
});

test('journal resource resolution merges an older exact document into the rail', () => {
  const result = resolveJournalResource({
    entries: [entry({ id: 'new', date: '2026-07-15' })],
    resourceId: 'old',
    requestedDocument: {
      id: 'old',
      title: 'Old journal entry',
      properties: { Date: '2025-01-10' },
    },
    resourceSettled: true,
  });

  assert.equal(result.requested?.id, 'old');
  assert.deepEqual(result.entries.map((item) => item.id), ['new', 'old']);
  assert.equal(result.missing, false);
});

test('journal resource resolution distinguishes loading from a missing document', () => {
  const pending = resolveJournalResource({
    entries: [],
    resourceId: 'gone',
    requestedDocument: null,
    resourceSettled: false,
  });
  const missing = resolveJournalResource({
    entries: [],
    resourceId: 'gone',
    requestedDocument: null,
    resourceSettled: true,
  });

  assert.equal(pending.pending, true);
  assert.equal(pending.missing, false);
  assert.equal(missing.pending, false);
  assert.equal(missing.missing, true);
});

test('journal resource resolution keeps failed reads distinct from missing documents', () => {
  const failed = resolveJournalResource({
    entries: [],
    resourceId: 'unknown',
    requestedDocument: null,
    resourceSettled: true,
    resourceFailed: true,
  });

  assert.equal(failed.pending, false);
  assert.equal(failed.missing, false);
  assert.equal(failed.failed, true);
  assert.equal(isDocumentMissingError(new Error('Document not found')), true);
  assert.equal(isDocumentMissingError(new Error('network unavailable')), false);
});

test('mood scale lookup rounds and rejects out-of-range values', () => {
  assert.equal(moodStep(6.4)?.value, 6);
  assert.equal(moodStep(7)?.label, 'Very pleasant');
  assert.equal(moodStep(0), null);
  assert.equal(moodStep(null), null);
});

test('morning completeness requires the full ritual', () => {
  assert.equal(morningComplete(entry()), true);
  assert.equal(morningComplete(entry({ gratitudes: ['Coffee', null, null] })), false);
  assert.equal(morningComplete(entry({ affirmation: null })), false);
  assert.equal(morningStarted(entry({
    morningMood: null,
    morningMoodWord: null,
    morningFeeling: null,
    energy: null,
    motivation: null,
    gratitudes: [null, null, null],
    intention: null,
    affirmation: null,
  })), false);
  assert.equal(gratitudeCount(entry({ gratitudes: ['One', null, 'Three'] })), 2);
});

test('evening completeness requires mood, word, highlight, and lesson', () => {
  assert.equal(eveningComplete(entry()), true);
  assert.equal(eveningComplete(entry({ lesson: null })), false);
  assert.equal(eveningComplete(entry({ dayMood: null })), false);
});

test('metric helpers ignore missing values and count mood words', () => {
  assert.equal(average([8, null, undefined, 6]), 7);
  const words = topMoodWords([
    entry({ morningMoodWord: 'Rested', dayMoodWord: 'rested' }),
    entry({ morningMoodWord: 'foggy', dayMoodWord: null }),
  ]);
  assert.deepEqual(words[0], { word: 'rested', count: 2 });
  assert.deepEqual(words[1], { word: 'foggy', count: 1 });
});
