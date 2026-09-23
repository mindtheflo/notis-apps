import assert from 'node:assert/strict';
import test from 'node:test';

import { beginResourceNavigation, findRequestedResource } from './resource-deep-links.ts';

test('finds exact native document ids without coercion', () => {
  const rows = [{ id: 'workspace/encoded id' }, { id: 'workspace-2' }];
  assert.deepEqual(findRequestedResource('workspace/encoded id', rows, (row) => row.id), rows[0]);
  assert.equal(findRequestedResource('missing', rows, (row) => row.id), null);
  assert.equal(findRequestedResource(null, rows, (row) => row.id), null);
});

test('resource navigation does not latch a pending value for the current host resource', () => {
  assert.deepEqual(beginResourceNavigation('workspace-1', undefined, 'workspace-1'), {
    pendingResourceId: undefined,
    shouldNavigate: false,
  });
  assert.deepEqual(beginResourceNavigation('workspace-1', 'workspace-2', 'workspace-2'), {
    pendingResourceId: 'workspace-2',
    shouldNavigate: false,
  });
  assert.deepEqual(beginResourceNavigation('workspace-1', undefined, 'workspace-2'), {
    pendingResourceId: 'workspace-2',
    shouldNavigate: true,
  });
  assert.deepEqual(beginResourceNavigation('workspace-1', undefined, null), {
    pendingResourceId: null,
    shouldNavigate: true,
  });
});
