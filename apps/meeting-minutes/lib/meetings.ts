import type { DocumentRecord } from '@notis/sdk';

/**
 * Reading helpers for the two databases this app owns. Property values arrive
 * already normalized by the SDK, so everything here is about tolerating the
 * gaps that real data has: meetings imported from Notion carry no duration or
 * transcript, and Circleback sometimes sends an action item with no assignee.
 */

export interface Meeting {
  id: string;
  title: string;
  meetingId: string | null;
  date: string | null;
  durationMinutes: number | null;
  meetingLink: string | null;
  recording: string | null;
  attendees: string[];
  attendeeEmails: string[];
  externalAttendees: string[];
  tags: string[];
  summary: string | null;
  source: string | null;
  actionItemCount: number;
  openActionItems: number;
  transcriptSegments: number;
  hasTranscript: boolean;
  sourceUrl: string | null;
  contentMarkdown: string | null;
}

export interface ActionItem {
  id: string;
  title: string;
  itemId: string | null;
  meetingIds: string[];
  description: string | null;
  assignee: string | null;
  assigneeEmail: string | null;
  status: string | null;
  meetingDate: string | null;
  forMe: boolean;
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function list(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** Date properties come back as an ISO string or as `{ start }`. */
function date(value: unknown): string | null {
  if (typeof value === 'string') return text(value);
  if (value && typeof value === 'object' && 'start' in value) {
    return text((value as { start?: unknown }).start);
  }
  return null;
}

export function toMeeting(doc: DocumentRecord): Meeting {
  const p = doc.properties;
  return {
    id: doc.id,
    title: doc.title?.trim() || 'Untitled meeting',
    meetingId: text(p['Meeting ID']),
    date: date(p.Date) ?? doc.createdAt ?? null,
    durationMinutes: num(p['Duration (min)']),
    meetingLink: text(p['Meeting Link']),
    recording: text(p.Recording),
    attendees: list(p.Attendees),
    attendeeEmails: list(p['Attendee Emails']),
    externalAttendees: list(p['External Attendees']),
    tags: list(p.Tags),
    summary: text(p.Summary),
    source: text(p.Source),
    actionItemCount: num(p['Action Item Count']) ?? 0,
    openActionItems: num(p['Open Action Items']) ?? 0,
    transcriptSegments: num(p['Transcript Segments']) ?? 0,
    hasTranscript: p['Has Transcript'] === true,
    sourceUrl: text(p['Source URL']),
    contentMarkdown: doc.contentMarkdown ?? null,
  };
}

export interface MeetingResourceResolution {
  meetings: Meeting[];
  requested: Meeting | null;
  pending: boolean;
  missing: boolean;
  failed: boolean;
}

export function isDocumentMissingError(error: Error | null): boolean {
  return error?.message === 'Document not found';
}

export type PendingResourceId = string | null | undefined;

export function beginResourceNavigation(
  hostResourceId: string | null,
  pendingResourceId: PendingResourceId,
  nextResourceId: string | null,
): { pendingResourceId: PendingResourceId; shouldNavigate: boolean } {
  if (pendingResourceId === nextResourceId) {
    return { pendingResourceId, shouldNavigate: false };
  }
  if (pendingResourceId === undefined && hostResourceId === nextResourceId) {
    return { pendingResourceId: undefined, shouldNavigate: false };
  }
  return { pendingResourceId: nextResourceId, shouldNavigate: true };
}

export function isAwaitingResourceNavigationEcho(
  pendingResourceId: PendingResourceId,
  hostResourceId: string | null,
): boolean {
  return pendingResourceId !== undefined && pendingResourceId !== hostResourceId;
}

/** Resolve a meeting by its native document id, including an exact fetched row. */
export function resolveMeetingResource({
  meetings,
  resourceId,
  requestedDocument,
  resourceSettled,
  resourceFailed = false,
}: {
  meetings: Meeting[];
  resourceId: string | null;
  requestedDocument: DocumentRecord | null;
  resourceSettled: boolean;
  resourceFailed?: boolean;
}): MeetingResourceResolution {
  if (!resourceId) {
    return { meetings, requested: null, pending: false, missing: false, failed: false };
  }

  const listed = meetings.find((meeting) => meeting.id === resourceId) ?? null;
  const fetched =
    !listed && requestedDocument?.id === resourceId
      ? toMeeting(requestedDocument)
      : null;
  const requested = listed ?? fetched;

  if (requested) {
    const merged = listed ? meetings : [...meetings, requested].sort((left, right) => {
      const leftDate = left.date ? Date.parse(left.date) : 0;
      const rightDate = right.date ? Date.parse(right.date) : 0;
      return rightDate - leftDate;
    });
    return { meetings: merged, requested, pending: false, missing: false, failed: false };
  }

  if (resourceFailed) {
    return { meetings, requested: null, pending: false, missing: false, failed: true };
  }

  return {
    meetings,
    requested: null,
    pending: !resourceSettled,
    missing: resourceSettled,
    failed: false,
  };
}

export function toActionItem(doc: DocumentRecord): ActionItem {
  const p = doc.properties;
  return {
    id: doc.id,
    title: doc.title?.trim() || 'Untitled action item',
    itemId: text(p['Item ID']),
    meetingIds: list(p.Meeting),
    description: text(p.Description),
    assignee: text(p.Assignee),
    assigneeEmail: text(p['Assignee Email']),
    status: text(p.Status),
    meetingDate: date(p['Meeting Date']),
    forMe: p['For Me'] === true,
  };
}

export function isDone(item: ActionItem): boolean {
  return (item.status ?? '').toUpperCase() === 'COMPLETED';
}

export type ActionItemFilterKey = 'open' | 'mine' | 'done' | 'all';

export function actionItemMatchesFilter(item: ActionItem, filter: ActionItemFilterKey): boolean {
  if (filter === 'open') return !isDone(item);
  if (filter === 'done') return isDone(item);
  if (filter === 'mine') return item.forMe && !isDone(item);
  return true;
}

/** Keep the current filter when possible, otherwise reveal the exact item. */
export function filterForRequestedActionItem(
  item: ActionItem,
  current: ActionItemFilterKey,
): ActionItemFilterKey {
  if (actionItemMatchesFilter(item, current)) return current;
  return isDone(item) ? 'done' : 'open';
}

export function formatDate(value: string | null): string {
  if (!value) return 'No date';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'No date';
  return parsed.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(value: string | null): string {
  if (!value) return 'No date';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'No date';
  return parsed.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDuration(minutes: number | null): string | null {
  if (minutes === null || minutes <= 0) return null;
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** Groups meetings under a month heading, keeping the incoming order. */
export function groupByMonth(meetings: Meeting[]): { label: string; meetings: Meeting[] }[] {
  const groups: { label: string; meetings: Meeting[] }[] = [];
  for (const meeting of meetings) {
    const parsed = meeting.date ? new Date(meeting.date) : null;
    const label =
      parsed && !Number.isNaN(parsed.getTime())
        ? parsed.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
        : 'Undated';
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.meetings.push(meeting);
    else groups.push({ label, meetings: [meeting] });
  }
  return groups;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * The meeting write-up is stored as one markdown document with `# Summary`,
 * `# Analysis`, `# Action Items` and `# Transcript` headings. Splitting it lets
 * the reader jump straight to a section instead of scrolling a transcript.
 */
export interface MeetingSection {
  heading: string;
  body: string;
}

export function splitSections(markdown: string | null): MeetingSection[] {
  if (!markdown) return [];
  const lines = markdown.split('\n');
  const sections: MeetingSection[] = [];
  let heading: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (heading === null) {
      // Text before the first heading still deserves to be shown.
      const body = buffer.join('\n').trim();
      if (body) sections.push({ heading: 'Notes', body });
    } else {
      sections.push({ heading, body: buffer.join('\n').trim() });
    }
    buffer = [];
  };

  for (const line of lines) {
    const match = /^#\s+(.+?)\s*$/.exec(line);
    if (match) {
      if (heading !== null || buffer.join('').trim()) flush();
      heading = match[1];
    } else {
      buffer.push(line);
    }
  }
  if (heading !== null || buffer.join('').trim()) flush();

  return sections.filter((section) => section.body.length > 0);
}

/** Current open-item counts come from the linked ledger, not capture-time metadata. */
export function countOpenActionItems(items: ActionItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (isDone(item)) continue;
    for (const meetingId of new Set(item.meetingIds)) counts.set(meetingId, (counts.get(meetingId) ?? 0) + 1);
  }
  return counts;
}
