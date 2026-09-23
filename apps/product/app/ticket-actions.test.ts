import assert from 'node:assert/strict';
import test from 'node:test';

import { archiveTickets, resetTicketPanelScroll } from './product';

test('ticket detail scroll resets to the top', () => {
  const pane = { scrollTop: 480 };
  resetTicketPanelScroll(pane);
  assert.equal(pane.scrollTop, 0);
  assert.doesNotThrow(() => resetTicketPanelScroll(null));
});

test('ticket archives continue after a failure and preserve retry candidates', async () => {
  const attempted: string[] = [];
  const result = await archiveTickets(['first', 'second', 'third'], async (id) => {
    attempted.push(id);
    if (id === 'second') throw new Error('permission denied');
  });

  assert.deepEqual(attempted, ['first', 'second', 'third']);
  assert.deepEqual(result.succeeded, ['first', 'third']);
  assert.deepEqual(result.failed, ['second']);
});
