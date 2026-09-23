/**
 * Shared vocabulary for the Product app.
 *
 * The status, priority and type values here mirror the `tickets` database
 * schema exactly; the ordering is what turns a flat query result into the
 * grouped, priority-sorted list the Tickets view renders.
 */
import type { DocumentRecord } from '@notis/sdk';
import { asRecord, isPresentString, optionalString } from '@notis/sdk';

export const TICKETS_DB = 'tickets';
export const VERSIONS_DB = 'versions';

export type TicketStatus = 'Backlog' | 'Todo' | 'In Progress' | 'Beta' | 'Done' | 'Canceled';
export type TicketPriority = 'Urgent' | 'High' | 'Medium' | 'Low' | 'No priority';
export type TicketType = 'Feature' | 'Bug';
export type TicketSize = 'Major' | 'Minor';

/** Board order, top to bottom — active work first, finished work last. */
export const STATUS_ORDER: TicketStatus[] = [
  'In Progress',
  'Beta',
  'Todo',
  'Backlog',
  'Done',
  'Canceled',
];

export const PRIORITY_ORDER: TicketPriority[] = ['Urgent', 'High', 'Medium', 'Low', 'No priority'];

export const TICKET_TYPES: TicketType[] = ['Feature', 'Bug'];
export const TICKET_SIZES: TicketSize[] = ['Major', 'Minor'];

/**
 * Status marks. Each is a ring with a fill fraction, the way Linear draws
 * progress — the class names are portal tokens so they follow the theme.
 */
export const STATUS_META: Record<TicketStatus, { label: string; ring: string; fill: number }> = {
  Backlog: { label: 'Backlog', ring: 'text-muted-foreground', fill: 0 },
  Todo: { label: 'Todo', ring: 'text-muted-foreground', fill: 0 },
  'In Progress': { label: 'In Progress', ring: 'text-foreground', fill: 0.5 },
  Beta: { label: 'Beta', ring: 'text-primary', fill: 0.75 },
  Done: { label: 'Done', ring: 'text-primary', fill: 1 },
  Canceled: { label: 'Canceled', ring: 'text-muted-foreground', fill: 1 },
};

export const PRIORITY_META: Record<TicketPriority, { label: string; bars: number; tone: string }> = {
  Urgent: { label: 'Urgent', bars: 4, tone: 'text-destructive' },
  High: { label: 'High', bars: 3, tone: 'text-foreground' },
  Medium: { label: 'Medium', bars: 2, tone: 'text-foreground' },
  Low: { label: 'Low', bars: 1, tone: 'text-foreground' },
  'No priority': { label: 'No priority', bars: 0, tone: 'text-muted-foreground' },
};

export const VERSION_STATUSES = ['Draft', 'Ready', 'Ready for review', 'Published'] as const;
export type VersionStatus = (typeof VERSION_STATUSES)[number];

export interface Ticket {
  id: string;
  title: string;
  key: string;
  type: TicketType;
  status: TicketStatus;
  priority: TicketPriority;
  size: TicketSize | null;
  versionIds: string[];
  shippedOn: string | null;
  due: string | null;
  link: string | null;
  docsUpdated: boolean;
  socialPostCreated: boolean;
  notionId: string | null;
  description: string | null;
  createdAt: string | null;
}

export interface Version {
  id: string;
  name: string;
  releaseDate: string | null;
  status: VersionStatus;
  headline: string | null;
  changelogUrl: string | null;
  subject: string | null;
  video: string | null;
  cover: string | null;
  summary: string | null;
  changelog: string | null;
}

export type PendingResourceId = string | null | undefined;

export interface ArchiveResult<T> {
  succeeded: T[];
  failed: T[];
}

/**
 * Archive every selected ticket without stopping at the first failure. The UI
 * uses the split result to keep failed tickets selected while immediately
 * removing successful archives from the list.
 */
export async function archiveTickets<T>(
  tickets: readonly T[],
  archive: (ticket: T) => Promise<void>,
): Promise<ArchiveResult<T>> {
  const succeeded: T[] = [];
  const failed: T[] = [];
  for (const ticket of tickets) {
    try {
      await archive(ticket);
      succeeded.push(ticket);
    } catch {
      failed.push(ticket);
    }
  }
  return { succeeded, failed };
}

/** Reset the independently scrolling detail pane before the next ticket paints. */
export function resetTicketPanelScroll(target: { scrollTop: number } | null): void {
  if (target) target.scrollTop = 0;
}

// ---------------------------------------------------------------------------
// Ticket filters
// ---------------------------------------------------------------------------

export type TicketViewKey = 'active' | 'backlog' | 'shipped' | 'all';
export type TicketTypeFilter = 'all' | TicketType;

/** `all` keeps every version, `none` keeps only unversioned tickets. */
export type TicketVersionFilter = string;

export interface TicketFilters {
  view: TicketViewKey;
  type: TicketTypeFilter;
  version: TicketVersionFilter;
  search: string;
}

export const TICKET_VIEWS: {
  value: TicketViewKey;
  label: string;
  statuses: TicketStatus[] | null;
}[] = [
  { value: 'active', label: 'Active', statuses: ['In Progress', 'Beta', 'Todo'] },
  { value: 'backlog', label: 'Backlog', statuses: ['Backlog'] },
  { value: 'shipped', label: 'Shipped', statuses: ['Done'] },
  { value: 'all', label: 'All', statuses: null },
];

export const DEFAULT_TICKET_FILTERS: TicketFilters = {
  view: 'active',
  type: 'all',
  version: 'all',
  search: '',
};

export function matchesViewFilter(ticket: Ticket, view: TicketViewKey): boolean {
  const statuses = TICKET_VIEWS.find((entry) => entry.value === view)?.statuses;
  return statuses ? statuses.includes(ticket.status) : true;
}

export function matchesTypeFilter(ticket: Ticket, type: TicketTypeFilter): boolean {
  return type === 'all' ? true : ticket.type === type;
}

export function matchesVersionFilter(ticket: Ticket, version: TicketVersionFilter): boolean {
  if (version === 'all') return true;
  if (version === 'none') return ticket.versionIds.length === 0;
  return ticket.versionIds.includes(version);
}

export function matchesSearchFilter(ticket: Ticket, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return (
    ticket.title.toLowerCase().includes(needle) || ticket.key.toLowerCase().includes(needle)
  );
}

/** The single predicate the Tickets list and the deep-link reveal both use. */
export function ticketMatchesFilters(ticket: Ticket, filters: TicketFilters): boolean {
  return (
    matchesViewFilter(ticket, filters.view)
    && matchesTypeFilter(ticket, filters.type)
    && matchesVersionFilter(ticket, filters.version)
    && matchesSearchFilter(ticket, filters.search)
  );
}

/** Release search, matching on the version name and its headline. */
export function versionMatchesSearch(version: Version, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return (
    version.name.toLowerCase().includes(needle)
    || (version.headline ?? '').toLowerCase().includes(needle)
  );
}

/**
 * Filters a deep link has to relax before its ticket is visible in the list.
 *
 * Returns `null` when the ticket already passes the current filters, which is
 * the common case — opening a ticket from the list, or editing one while it is
 * open, must never disturb the triager's filters. Only a resource the current
 * filters genuinely hide relaxes anything, and then only the filters that hide
 * it: a version deep link keeps the type filter, a bug deep link keeps the
 * version filter.
 */
export function planTicketReveal(
  ticket: Ticket,
  filters: TicketFilters,
): Partial<TicketFilters> | null {
  const relaxed: Partial<TicketFilters> = {};
  if (!matchesViewFilter(ticket, filters.view)) relaxed.view = 'all';
  if (!matchesTypeFilter(ticket, filters.type)) relaxed.type = 'all';
  if (!matchesVersionFilter(ticket, filters.version)) relaxed.version = 'all';
  if (!matchesSearchFilter(ticket, filters.search)) relaxed.search = '';
  return Object.keys(relaxed).length > 0 ? relaxed : null;
}

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

export function resolveTicketResource(
  resourceId: string | null,
  tickets: readonly Ticket[],
): Ticket | null {
  if (!resourceId) return null;
  return tickets.find((ticket) => ticket.id === resourceId) ?? null;
}

export function resolveVersionResource(
  resourceId: string | null,
  versions: readonly Version[],
): Version | null {
  if (!resourceId) return null;
  return versions.find((version) => version.id === resourceId) ?? null;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Reads one property off a queried document. The runtime hands back either a
 * plain value or the Notion-shaped envelope depending on the host, so both are
 * unwrapped here rather than at every call site.
 */
function readProperty(document: DocumentRecord, name: string): unknown {
  const value = (document.properties ?? {})[name];
  const envelope = asRecord(value);
  if (!envelope || typeof envelope.type !== 'string') return value;
  const inner = envelope[envelope.type as string];
  if (envelope.type === 'select' || envelope.type === 'status') {
    return asRecord(inner)?.name ?? null;
  }
  if (envelope.type === 'date') {
    return asRecord(inner)?.start ?? null;
  }
  if (envelope.type === 'rich_text' || envelope.type === 'title') {
    if (!Array.isArray(inner)) return null;
    return inner.map((part) => optionalString(asRecord(part)?.plain_text) ?? '').join('');
  }
  if (envelope.type === 'relation') {
    if (!Array.isArray(inner)) return [];
    return inner.map((part) => optionalString(asRecord(part)?.id)).filter(isPresentString);
  }
  return inner ?? null;
}

function readString(document: DocumentRecord, name: string): string | null {
  return optionalString(readProperty(document, name));
}

function readIds(document: DocumentRecord, name: string): string[] {
  const value = readProperty(document, name);
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry : optionalString(asRecord(entry)?.id)))
    .filter(isPresentString);
}

function readBoolean(document: DocumentRecord, name: string): boolean {
  return readProperty(document, name) === true;
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes((value ?? '') as T) ? ((value ?? '') as T) : fallback;
}

export function toTicket(document: DocumentRecord): Ticket {
  return {
    id: document.id,
    title: document.title || 'Untitled',
    key: readString(document, 'Key') ?? '',
    type: oneOf(readString(document, 'Type'), TICKET_TYPES, 'Feature'),
    status: oneOf(readString(document, 'Status'), STATUS_ORDER, 'Backlog'),
    priority: oneOf(readString(document, 'Priority'), PRIORITY_ORDER, 'No priority'),
    size: (['Major', 'Minor'] as const).includes(readString(document, 'Size') as TicketSize)
      ? (readString(document, 'Size') as TicketSize)
      : null,
    versionIds: readIds(document, 'Version'),
    shippedOn: readString(document, 'Shipped on'),
    due: readString(document, 'Due'),
    link: readString(document, 'Link'),
    docsUpdated: readBoolean(document, 'Docs updated'),
    socialPostCreated: readBoolean(document, 'Social post created'),
    notionId: readString(document, 'Notion ID'),
    description: optionalString(document.contentMarkdown) ?? optionalString(document.plainText),
    createdAt: document.createdAt ?? null,
  };
}

export function toVersion(document: DocumentRecord): Version {
  return {
    id: document.id,
    name: document.title || 'Untitled',
    releaseDate: readString(document, 'Release date'),
    status: oneOf(readString(document, 'Status'), VERSION_STATUSES, 'Draft'),
    headline: readString(document, 'Headline'),
    changelogUrl: readString(document, 'Changelog URL'),
    subject: readString(document, 'Subject'),
    video: readString(document, 'Video'),
    cover: readString(document, 'Cover'),
    summary: readString(document, 'Summary'),
    changelog: optionalString(document.contentMarkdown) ?? optionalString(document.plainText),
  };
}

// ---------------------------------------------------------------------------
// Ordering and formatting
// ---------------------------------------------------------------------------

export function compareTickets(a: Ticket, b: Ticket): number {
  const priority = PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
  if (priority !== 0) return priority;
  const shipped = (b.shippedOn ?? '').localeCompare(a.shippedOn ?? '');
  if (shipped !== 0) return shipped;
  return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
}

/** Sorts newest release first, keeping undated drafts at the top. */
export function compareVersions(a: Version, b: Version): number {
  return (b.releaseDate ?? '9999').localeCompare(a.releaseDate ?? '9999');
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatShortDate(value: string | null | undefined): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Keep the installer dataset's ticket convention; never assume a publisher prefix. */
export function nextTicketKey(tickets: Pick<Ticket, 'key'>[]): string {
  const groups = new Map<string, {count: number; highest: number}>();
  for (const ticket of tickets) {
    const match = /^([A-Za-z][A-Za-z0-9_]*)-(\d+)$/.exec(ticket.key);
    if (!match) continue;
    const current = groups.get(match[1]) ?? {count: 0, highest: 0};
    current.count += 1;
    current.highest = Math.max(current.highest, Number(match[2]));
    groups.set(match[1], current);
  }
  const selected = [...groups].sort((a,b) => b[1].count-a[1].count || a[0].localeCompare(b[0]))[0];
  return selected ? `${selected[0]}-${selected[1].highest+1}` : 'TASK-1';
}
