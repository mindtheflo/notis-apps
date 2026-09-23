import assert from 'node:assert/strict';
import test from 'node:test';

import { beginResourceNavigation, findDatabaseResource } from './resource-deep-links.ts';

test('database deep links resolve only the exact stable database id', () => {
  const rows = [{ id: 'database/encoded id' }, { id: 'database-2' }];
  assert.deepEqual(findDatabaseResource('database/encoded id', rows), rows[0]);
  assert.equal(findDatabaseResource('missing', rows), null);
  assert.equal(findDatabaseResource(null, rows), null);
});

test('database selection only waits for a host echo after an actual resource change', () => {
  assert.deepEqual(beginResourceNavigation('database-1', undefined, 'database-1'), {
    pendingResourceId: undefined,
    shouldNavigate: false,
  });
  assert.deepEqual(beginResourceNavigation('database-1', undefined, 'database-2'), {
    pendingResourceId: 'database-2',
    shouldNavigate: true,
  });
  assert.deepEqual(beginResourceNavigation('database-1', 'database-2', 'database-2'), {
    pendingResourceId: 'database-2',
    shouldNavigate: false,
  });
});
