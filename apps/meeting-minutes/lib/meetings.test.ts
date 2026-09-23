import assert from 'node:assert/strict';
import test from 'node:test';

import {
  actionItemMatchesFilter,
  beginResourceNavigation,
  filterForRequestedActionItem,
  isDocumentMissingError,
  isAwaitingResourceNavigationEcho,
  resolveMeetingResource,
  type ActionItem,
  type Meeting,
} from './meetings';

test('meeting navigation waits for host acknowledgement and ignores same-resource repeats', () => {
  assert.deepEqual(beginResourceNavigation('meeting-a', undefined, 'meeting-a'), {
    pendingResourceId: undefined,
    shouldNavigate: false,
  });
  assert.deepEqual(beginResourceNavigation('meeting-a', undefined, 'meeting-b'), {
    pendingResourceId: 'meeting-b',
    shouldNavigate: true,
  });
  assert.deepEqual(beginResourceNavigation('meeting-a', 'meeting-b', 'meeting-b'), {
    pendingResourceId: 'meeting-b',
    shouldNavigate: false,
  });
  assert.deepEqual(beginResourceNavigation('meeting-a', undefined, null), {
    pendingResourceId: null,
    shouldNavigate: true,
  });
  assert.equal(isAwaitingResourceNavigationEcho('meeting-b', 'meeting-a'), true);
  assert.equal(isAwaitingResourceNavigationEcho('meeting-b', 'meeting-b'), false);
  assert.equal(isAwaitingResourceNavigationEcho(null, 'meeting-a'), true);
  assert.equal(isAwaitingResourceNavigationEcho(null, null), false);
  assert.equal(isAwaitingResourceNavigationEcho(undefined, 'meeting-a'), false);
});

function meeting(id: string): Meeting {
  return {
    id,
    title: id,
    meetingId: null,
    date: '2026-08-29T10:00:00Z',
    durationMinutes: null,
    meetingLink: null,
    recording: null,
    attendees: [],
    attendeeEmails: [],
    externalAttendees: [],
    tags: [],
    summary: null,
    source: null,
    actionItemCount: 0,
    openActionItems: 0,
    transcriptSegments: 0,
    hasTranscript: false,
    sourceUrl: null,
    contentMarkdown: null,
  };
}

function actionItem(overrides: Partial<ActionItem> = {}): ActionItem {
  return {
    id: 'item',
    title: 'Follow up',
    itemId: null,
    meetingIds: [],
    description: null,
    assignee: null,
    assigneeEmail: null,
    status: 'PENDING',
    meetingDate: null,
    forMe: false,
    ...overrides,
  };
}

test('meeting resource resolution returns listed and exact fetched meetings', () => {
  const listed = [meeting('listed')];
  assert.equal(resolveMeetingResource({
    meetings: listed,
    resourceId: 'listed',
    requestedDocument: null,
    resourceSettled: false,
  }).requested?.id, 'listed');

  const fetched = resolveMeetingResource({
    meetings: listed,
    resourceId: 'older',
    requestedDocument: {
      id: 'older',
      title: 'Older meeting',
      properties: { Date: '2025-01-01' },
    },
    resourceSettled: true,
  });
  assert.equal(fetched.requested?.id, 'older');
  assert.deepEqual(fetched.meetings.map((item) => item.id), ['listed', 'older']);
});

test('meeting resource resolution distinguishes pending from missing', () => {
  assert.equal(resolveMeetingResource({
    meetings: [],
    resourceId: 'gone',
    requestedDocument: null,
    resourceSettled: false,
  }).pending, true);
  assert.equal(resolveMeetingResource({
    meetings: [],
    resourceId: 'gone',
    requestedDocument: null,
    resourceSettled: true,
  }).missing, true);
});

test('meeting resource resolution keeps failed reads distinct from missing documents', () => {
  const failed = resolveMeetingResource({
    meetings: [],
    resourceId: 'unknown',
    requestedDocument: null,
    resourceSettled: true,
    resourceFailed: true,
  });

  assert.equal(failed.pending, false);
  assert.equal(failed.missing, false);
  assert.equal(failed.failed, true);
  assert.equal(isDocumentMissingError(new Error('Document not found')), true);
  assert.equal(isDocumentMissingError(new Error('timeout')), false);
});

test('action-item deep links reveal the row without selecting it for bulk actions', () => {
  const pending = actionItem();
  const done = actionItem({ status: 'COMPLETED' });
  const mine = actionItem({ forMe: true });

  assert.equal(actionItemMatchesFilter(pending, 'open'), true);
  assert.equal(actionItemMatchesFilter(done, 'open'), false);
  assert.equal(filterForRequestedActionItem(done, 'open'), 'done');
  assert.equal(filterForRequestedActionItem(mine, 'mine'), 'mine');
});
