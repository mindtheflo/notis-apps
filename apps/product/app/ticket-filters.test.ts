import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_TICKET_FILTERS,
  planTicketReveal,
  ticketMatchesFilters,
  versionMatchesSearch,
  type Ticket,
  type TicketFilters,
  type Version,
} from './product';

function ticket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 'ticket-1',
    title: 'Filters reset when opening a ticket',
    key: 'NOT-42',
    type: 'Bug',
    status: 'Todo',
    priority: 'High',
    versionIds: ['version-9'],
    ...overrides,
  } as Ticket;
}

function filters(overrides: Partial<TicketFilters> = {}): TicketFilters {
  return { ...DEFAULT_TICKET_FILTERS, ...overrides };
}

test('filters match the ticket the list would show', () => {
  const bug = ticket();
  assert.equal(ticketMatchesFilters(bug, filters()), true);
  assert.equal(ticketMatchesFilters(bug, filters({ view: 'shipped' })), false);
  assert.equal(ticketMatchesFilters(bug, filters({ type: 'Feature' })), false);
  assert.equal(ticketMatchesFilters(bug, filters({ version: 'version-9' })), true);
  assert.equal(ticketMatchesFilters(bug, filters({ version: 'none' })), false);
  assert.equal(ticketMatchesFilters(bug, filters({ search: 'NOT-42' })), true);
  assert.equal(ticketMatchesFilters(bug, filters({ search: 'unrelated' })), false);
});

test('opening a ticket that the current filters already show changes no filter', () => {
  const visible = ticket({ status: 'In Progress', type: 'Bug' });
  const active = filters({ view: 'active', type: 'Bug', version: 'version-9', search: 'NOT' });
  assert.equal(ticketMatchesFilters(visible, active), true);
  assert.equal(planTicketReveal(visible, active), null);
});

test('a hidden deep link relaxes only the filters that hide it', () => {
  const shipped = ticket({ status: 'Done', type: 'Bug', versionIds: ['version-9'] });
  const active = filters({ view: 'active', type: 'Bug', version: 'version-9' });

  const relaxed = planTicketReveal(shipped, active);
  assert.deepEqual(relaxed, { view: 'all' });
  assert.equal(
    ticketMatchesFilters(shipped, { ...active, ...relaxed }),
    true,
    'the relaxed filters must actually reveal the ticket',
  );
});

test('a deep link hidden by several filters relaxes each of them', () => {
  const unversioned = ticket({ status: 'Done', type: 'Bug', versionIds: [] });
  const narrow = filters({ view: 'active', type: 'Feature', version: 'version-9', search: 'login' });

  const relaxed = planTicketReveal(unversioned, narrow);
  assert.deepEqual(relaxed, { view: 'all', type: 'all', version: 'all', search: '' });
  assert.equal(ticketMatchesFilters(unversioned, { ...narrow, ...relaxed }), true);
});

test('editing an open ticket out of the current view does not relax the search filter', () => {
  const stillMatching = ticket({ status: 'Done', title: 'Filter reset', key: 'NOT-42' });
  const searching = filters({ view: 'active', search: 'NOT-42' });

  // Marking the open ticket shipped hides it from the Active view, but the
  // triager's search term must survive the reveal untouched.
  const relaxed = planTicketReveal(stillMatching, searching);
  assert.deepEqual(relaxed, { view: 'all' });
  assert.equal(relaxed?.search, undefined);
});

test('release search matches the version name and headline', () => {
  const version = { id: 'v1', name: '09.19', headline: 'Filter fixes' } as Version;
  assert.equal(versionMatchesSearch(version, ''), true);
  assert.equal(versionMatchesSearch(version, '09.19'), true);
  assert.equal(versionMatchesSearch(version, 'filter'), true);
  assert.equal(versionMatchesSearch(version, 'unrelated'), false);
});
