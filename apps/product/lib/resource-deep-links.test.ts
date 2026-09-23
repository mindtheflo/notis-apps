import assert from 'node:assert/strict';
import test from 'node:test';

import {
  beginResourceNavigation,
  resolveTicketResource,
  resolveVersionResource,
  type Ticket,
  type Version,
} from '../app/product';

const ticket = {
  id: 'ticket-123',
  title: 'Exact ticket',
} as Ticket;

const version = {
  id: 'version-456',
  name: '08.26',
} as Version;

test('ticket resource links resolve only the stable document id', () => {
  assert.equal(resolveTicketResource(ticket.id, [ticket]), ticket);
  assert.equal(resolveTicketResource(ticket.title, [ticket]), null);
  assert.equal(resolveTicketResource('deleted-ticket', [ticket]), null);
});

test('version resource links resolve only the stable document id', () => {
  assert.equal(resolveVersionResource(version.id, [version]), version);
  assert.equal(resolveVersionResource(version.name, [version]), null);
  assert.equal(resolveVersionResource('deleted-version', [version]), null);
});

test('selection navigation stays idle when the host already exposes the resource', () => {
  assert.deepEqual(beginResourceNavigation(ticket.id, undefined, ticket.id), {
    pendingResourceId: undefined,
    shouldNavigate: false,
  });
  assert.deepEqual(beginResourceNavigation(ticket.id, undefined, version.id), {
    pendingResourceId: version.id,
    shouldNavigate: true,
  });
  assert.deepEqual(beginResourceNavigation(ticket.id, version.id, version.id), {
    pendingResourceId: version.id,
    shouldNavigate: false,
  });
});
