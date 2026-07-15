import assert from 'node:assert/strict';
import test from 'node:test';

import {
  average,
  combineDateTime,
  entryFromDocument,
  medActiveHours,
  sortEntries,
  type JournalEntry,
} from './journal-core';

function entry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: 'entry',
    title: 'A day',
    date: '2026-07-15',
    morningMood: 'Good',
    mood: 'Good',
    motivation: 8,
    sleepiness: 3,
    meaningfulTasks: 4,
    appetite: 'Normal',
    medOnset: '2026-07-15T08:00:00.000Z',
    medWoreOff: '2026-07-15T15:30:00.000Z',
    reflection: 'A useful reflection.',
    createdAt: '2026-07-15T07:00:00.000Z',
    lastEditedTime: null,
    ...overrides,
  };
}

test('entry adapter preserves normalized journal fields and reflection', () => {
  const result = entryFromDocument({
    id: 'entry-1',
    title: 'Fallback title',
    properties: {
      Name: 'Focused Tuesday',
      Date: '2026-07-15',
      'Morning Mood': 'Good',
      'General Mood': 'Amazing',
      Motivation: 9,
      Sleepiness: 2,
      'Meaningful Tasks': 5,
      Appetite: 'Normal',
      'Medication Onset': '2026-07-15T08:00:00.000Z',
      'Medication Wore Off': '2026-07-15T16:00:00.000Z',
    },
    contentMarkdown: 'Protected the morning for deep work.',
  });

  assert.equal(result.title, 'Focused Tuesday');
  assert.equal(result.mood, 'Amazing');
  assert.equal(result.meaningfulTasks, 5);
  assert.equal(result.reflection, 'Protected the morning for deep work.');
});

test('entries sort newest first without mutating the input', () => {
  const original = [entry({ id: 'old', date: '2026-07-12' }), entry({ id: 'new', date: '2026-07-15' })];
  assert.deepEqual(sortEntries(original).map((item) => item.id), ['new', 'old']);
  assert.deepEqual(original.map((item) => item.id), ['old', 'new']);
});

test('medication duration is rounded and rejects reversed windows', () => {
  assert.equal(medActiveHours(entry()), 7.5);
  assert.equal(
    medActiveHours(entry({ medOnset: '2026-07-15T16:00:00.000Z', medWoreOff: '2026-07-15T08:00:00.000Z' })),
    null,
  );
});

test('metric helpers ignore missing values and validate date/time combinations', () => {
  assert.equal(average([8, null, undefined, 6]), 7);
  assert.equal(combineDateTime('', '08:30'), null);
  assert.match(combineDateTime('2026-07-15', '08:30') || '', /^2026-07-15T/);
});
