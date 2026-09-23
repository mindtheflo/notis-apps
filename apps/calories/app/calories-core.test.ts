import assert from 'node:assert/strict';
import test from 'node:test';

import {
  dayKey,
  parsePeriodResourceId,
  periodResourceId,
  periodRoutePath,
} from './calories-core';

const date = new Date(2026, 7, 29, 12);

test('period resource ids use normalized ISO period starts', () => {
  assert.equal(periodResourceId(date, 'day'), '2026-08-29');
  assert.equal(periodResourceId(date, 'week'), '2026-08-24');
  assert.equal(periodResourceId(date, 'month'), '2026-08-01');
  assert.equal(periodResourceId(date, 'year'), '2026-01-01');
});

test('period resource parsing accepts only valid normalized ids', () => {
  assert.equal(dayKey(parsePeriodResourceId('2026-08-24', 'week')), '2026-08-24');
  assert.equal(parsePeriodResourceId('2026-08-25', 'week'), null);
  assert.equal(parsePeriodResourceId('2026-02-31', 'day'), null);
  assert.equal(parsePeriodResourceId('August 29', 'day'), null);
});

test('period routes retain the day root and named aggregate paths', () => {
  assert.equal(periodRoutePath('day'), '/');
  assert.equal(periodRoutePath('week'), '/week');
  assert.equal(periodRoutePath('month'), '/month');
  assert.equal(periodRoutePath('year'), '/year');
});
