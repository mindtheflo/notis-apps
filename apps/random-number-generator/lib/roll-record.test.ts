import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeRollRecord, sortRollRecordsDesc } from './roll-record';

test('normalizeRollRecord falls back to legacy title and Name-only documents', () => {
  const record = normalizeRollRecord({
    id: 'doc-1',
    title: '25',
    properties: { Name: '25' },
    createdAt: '2026-04-24T16:27:36.144829+00:00',
    lastEditedTime: '2026-04-24T16:27:36.144829+00:00',
  });

  assert.deepEqual(record, {
    id: 'doc-1',
    value: 25,
    mode: 'integer',
    min: null,
    max: null,
    at: '2026-04-24T16:27:36.144829+00:00',
  });
});

test('normalizeRollRecord preserves rich roll fields when the schema exists', () => {
  const record = normalizeRollRecord({
    id: 'doc-2',
    title: '42',
    properties: {
      Value: 42,
      Mode: 'Dice',
      Min: 1,
      Max: 6,
      'Rolled At': '2026-04-24T16:46:00.000Z',
    },
    createdAt: '2026-04-24T16:46:00.000Z',
    lastEditedTime: '2026-04-24T16:46:00.000Z',
  });

  assert.deepEqual(record, {
    id: 'doc-2',
    value: 42,
    mode: 'dice',
    min: 1,
    max: 6,
    at: '2026-04-24T16:46:00.000Z',
  });
});

test('sortRollRecordsDesc keeps newest rolls first', () => {
  const rows = [
    { id: 'old', value: 1, mode: 'integer' as const, min: 1, max: 10, at: '2026-04-24T16:20:00.000Z' },
    { id: 'new', value: 2, mode: 'integer' as const, min: 1, max: 10, at: '2026-04-24T16:30:00.000Z' },
  ];

  rows.sort(sortRollRecordsDesc);
  assert.deepEqual(rows.map((row) => row.id), ['new', 'old']);
});
