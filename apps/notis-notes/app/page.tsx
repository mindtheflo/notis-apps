'use client';

import { useEffect, useRef, useState } from 'react';
import {
  MultiSelectActionBar,
  MultiSelectCheckbox,
  MultiSelectDragOverlay,
  useDatabase,
  useMultiSelect,
  useNotis,
  useNotisRuntime,
  useTopBarSearch,
  useUpsertDocument,
  type DatabaseProperty,
  type DocumentRecord,
  type MultiSelectController,
} from '@notis/sdk';
import {
  ArrowUpDown,
  ArrowUpRight,
  Boxes,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  FolderMinus,
  LayoutGrid,
  Link2,
  Loader2,
  Maximize2,
  Plus,
  Rows3,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Table2,
  type LucideIcon,
} from 'lucide-react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type TabKey = 'gallery' | 'table' | 'calendar';

type TabConfig = {
  key: TabKey;
  label: string;
  icon: LucideIcon;
};

type FolderOption = {
  id: string;
  title: string;
  parentId: string | null;
  pathLabel: string;
};

const NOTE_DATABASE_SLUG = 'notes';
const FOLDER_DATABASE_SLUG = 'note_folders';
const DEFAULT_NOTE_TITLE = 'Untitled note';
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const TABS: TabConfig[] = [
  { key: 'gallery', label: 'Gallery', icon: LayoutGrid },
  { key: 'table', label: 'Table', icon: Table2 },
  { key: 'calendar', label: 'Calendar', icon: CalendarDays },
];

function isPresentString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getDateKey(value: unknown): string | null {
  if (!isPresentString(value)) return null;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function getDateInputValue(value: unknown): string {
  return getDateKey(value) ?? '';
}

function getRelationIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => isPresentString(item));
}

function getFolderTitle(document: DocumentRecord): string {
  const explicit = document.properties.Name;
  if (isPresentString(explicit)) return explicit;
  return document.title || 'Untitled folder';
}

function getNoteTitle(document: DocumentRecord): string {
  return isPresentString(document.title) ? document.title : DEFAULT_NOTE_TITLE;
}

function getPlainTextFromBlockNote(value: unknown): string {
  const segments: string[] = [];

  function visit(node: unknown): void {
    if (typeof node === 'string') {
      if (node.trim()) segments.push(node.trim());
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== 'object') return;

    const record = node as Record<string, unknown>;
    if (typeof record.text === 'string' && record.text.trim()) {
      segments.push(record.text.trim());
    }
    visit(record.content);
    visit(record.children);
  }

  visit(value);
  return segments.join(' ').replace(/\s+/g, ' ').trim();
}

function getNotePreviewText(document: DocumentRecord): string {
  if (isPresentString(document.plainText)) {
    return document.plainText.replace(/\s+/g, ' ').trim();
  }
  if (isPresentString(document.contentMarkdown)) {
    return document.contentMarkdown
      .replace(/[#*_`>~[\]()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  const fromBlocks = getPlainTextFromBlockNote(document.contentBlocknote);
  if (fromBlocks) return fromBlocks;
  return getNoteTitle(document);
}

function buildFolderOptions(documents: DocumentRecord[]): FolderOption[] {
  const byId = new Map(documents.map((d) => [d.id, d]));

  function buildPath(id: string, seen: Set<string> = new Set()): string {
    const folder = byId.get(id);
    if (!folder) return 'Untitled folder';
    const title = getFolderTitle(folder);
    if (seen.has(id)) return title;
    seen.add(id);
    const parentId = getRelationIds(folder.properties.Parent)[0] ?? null;
    if (!parentId || !byId.has(parentId)) return title;
    return `${buildPath(parentId, seen)} / ${title}`;
  }

  return documents
    .map((d) => ({
      id: d.id,
      title: getFolderTitle(d),
      parentId: getRelationIds(d.properties.Parent)[0] ?? null,
      pathLabel: buildPath(d.id),
    }))
    .sort((a, b) => a.pathLabel.localeCompare(b.pathLabel));
}

function getCoverUrl(document: DocumentRecord): string | null {
  if (isPresentString(document.cover)) {
    return document.cover.trim();
  }
  return null;
}

function NoteIcon({
  icon,
  className,
  fallbackClassName,
}: {
  icon: string | null | undefined;
  className?: string;
  fallbackClassName?: string;
}) {
  if (typeof icon === 'string' && icon.startsWith('lucide:')) {
    const name = icon.slice('lucide:'.length).trim().replace(/_/g, '-');
    if (name) {
      return (
        <DynamicIcon
          name={name as IconName}
          className={cn('h-3.5 w-3.5', className)}
          fallback={() => <FileText className={cn('h-3.5 w-3.5', className, fallbackClassName)} />}
        />
      );
    }
  }
  if (typeof icon === 'string' && /^https?:\/\//i.test(icon.trim())) {
    return (
      <img
        src={icon.trim()}
        alt=""
        className={cn('h-3.5 w-3.5 rounded-sm object-cover', className)}
      />
    );
  }
  return <FileText className={cn('h-3.5 w-3.5', className, fallbackClassName)} />;
}

function formatDateLabel(value: unknown): string {
  const key = getDateKey(value);
  if (!key) return 'No date';
  const date = new Date(`${key}T12:00:00`);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function formatPropertyValue(
  value: unknown,
  property: DatabaseProperty | null,
  folderNameById: Map<string, string>,
): string {
  if (property?.type === 'relation') {
    const ids = getRelationIds(value);
    if (!ids.length) return 'None';
    return ids.map((id) => folderNameById.get(id) ?? id).join(', ');
  }
  if (property?.type === 'date') return formatDateLabel(value);
  if (Array.isArray(value)) return value.length ? value.map((v) => String(v)).join(', ') : 'None';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  if (isPresentString(value)) return value;
  return 'None';
}

function formatMonthLabel(month: Date): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(month);
}

function startOfCalendarGrid(month: Date): Date {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const mondayIndex = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - mondayIndex);
  return start;
}

function buildCalendarDays(month: Date): Date[] {
  const start = startOfCalendarGrid(month);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function isToday(day: Date): boolean {
  const t = new Date();
  return day.getFullYear() === t.getFullYear() && day.getMonth() === t.getMonth() && day.getDate() === t.getDate();
}

function getStatusLabel(value: unknown): string | null {
  return isPresentString(value) ? value : null;
}

type StatusTone = 'active' | 'review' | 'done' | 'blocked' | 'idea' | 'neutral';

function getStatusTone(status: string | null): StatusTone {
  if (!status) return 'neutral';
  const s = status.toLowerCase();
  if (s.includes('done') || s.includes('complete') || s.includes('ship')) return 'done';
  if (s.includes('progress') || s.includes('active') || s.includes('draft')) return 'active';
  if (s.includes('review') || s.includes('wait') || s.includes('hold')) return 'review';
  if (s.includes('block') || s.includes('stuck')) return 'blocked';
  if (s.includes('idea') || s.includes('backlog')) return 'idea';
  return 'neutral';
}

const statusPillClasses: Record<StatusTone, string> = {
  active: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  review: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  done: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  blocked: 'bg-red-500/10 text-red-700 dark:text-red-400',
  idea: 'bg-muted text-muted-foreground',
  neutral: 'bg-muted text-muted-foreground',
};

const statusDotClasses: Record<StatusTone, string> = {
  active: 'bg-amber-500',
  review: 'bg-blue-500',
  done: 'bg-emerald-500',
  blocked: 'bg-red-500',
  idea: 'bg-stone-400',
  neutral: 'bg-stone-400',
};

const statusBarClasses: Record<StatusTone, string> = {
  active: 'border-l-amber-500',
  review: 'border-l-blue-500',
  done: 'border-l-emerald-500',
  blocked: 'border-l-red-500',
  idea: 'border-l-stone-400',
  neutral: 'border-l-stone-400',
};

function StatusPill({ status }: { status: string | null }) {
  if (!status) return null;
  const tone = getStatusTone(status);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-tight',
        statusPillClasses[tone],
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', statusDotClasses[tone])} />
      {status}
    </span>
  );
}

function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground',
        className,
      )}
    >
      {children}
    </span>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <Icon className="mb-4 h-10 w-10 stroke-[1.5] text-muted-foreground/30" />
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-[360px] items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      Loading notes…
    </div>
  );
}

function PageIcon({ icon }: { icon: string | null | undefined }) {
  if (typeof icon === 'string' && icon.startsWith('lucide:')) {
    const name = icon.slice('lucide:'.length).trim().replace(/_/g, '-');
    if (name) {
      return (
        <DynamicIcon
          name={name as IconName}
          className="h-7 w-7 stroke-[1.5] text-foreground"
          fallback={() => <Boxes className="h-7 w-7 stroke-[1.5] text-foreground" />}
        />
      );
    }
  }
  if (typeof icon === 'string' && /^https?:\/\//i.test(icon.trim())) {
    return (
      <img
        src={icon.trim()}
        alt=""
        className="h-7 w-7 rounded-md object-cover"
      />
    );
  }
  return <Boxes className="h-7 w-7 stroke-[1.5] text-foreground" />;
}

function ToolbarIconButton({
  icon: Icon,
  label,
}: {
  icon: LucideIcon;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled="true"
      tabIndex={-1}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function ViewPill({
  config,
  active,
  onSelect,
}: {
  config: TabConfig;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = config.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12.5px] font-medium transition-colors',
        active
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {config.label}
    </button>
  );
}

function PageHeader({
  title,
  icon,
  activeTab,
  onTabChange,
}: {
  title: string;
  icon: string | null;
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
}) {
  return (
    <div className="flex flex-col gap-3 px-6 pt-6">
      <PageIcon icon={icon} />
      <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
        <div className="flex items-center gap-1">
          {TABS.map((tab) => (
            <ViewPill
              key={tab.key}
              config={tab}
              active={activeTab === tab.key}
              onSelect={() => onTabChange(tab.key)}
            />
          ))}
        </div>
        <div className="ml-auto flex items-center gap-0.5">
          <ToolbarIconButton icon={SlidersHorizontal} label="Filter" />
          <ToolbarIconButton icon={ArrowUpDown} label="Sort" />
          <ToolbarIconButton icon={Link2} label="Copy link" />
          <ToolbarIconButton icon={Search} label="Search" />
          <ToolbarIconButton icon={Eye} label="Views" />
          <ToolbarIconButton icon={Maximize2} label="Expand" />
          <button
            type="button"
            aria-label="New"
            aria-disabled="true"
            tabIndex={-1}
            className="ml-1 inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-[12.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            New
          </button>
        </div>
      </div>
    </div>
  );
}

export default function NotesPage() {
  const { app, route, databases, collectionItem } = useNotis();
  const runtime = useNotisRuntime();
  const { upsert, loading: upserting } = useUpsertDocument();

  const [activeTab, setActiveTab] = useState<TabKey>('gallery');
  const [activeDateProperty, setActiveDateProperty] = useState('');
  const [visibleMonth, setVisibleMonth] = useState(() => new Date());
  const [creatingDocument, setCreatingDocument] = useState(false);
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const noteDatabase = databases.find((d) => d.slug === NOTE_DATABASE_SLUG) ?? null;
  const noteProperties = noteDatabase?.properties ?? [];
  const titleProperty = noteProperties.find((p) => p.type === 'title');
  const titlePropertyName = titleProperty?.name ?? 'Title';
  const folderPropertyName = noteProperties.find((p) => p.name === 'Folder')?.name ?? 'Folder';
  const statusPropertyName =
    noteProperties.find((p) => p.type === 'status' || p.name === 'Status')?.name ?? null;
  const dateProperties = noteProperties.filter((p) => p.type === 'date');
  const metadataProperties = noteProperties.filter((p) => p.name !== titlePropertyName);

  const activeFolderId = collectionItem?.id ?? null;

  const notesFilter = activeFolderId
    ? {
        filters: [
          {
            property: folderPropertyName,
            operator: 'contains',
            type: 'relation',
            value: activeFolderId,
          },
        ],
      }
    : undefined;

  const notesQuery = useDatabase(NOTE_DATABASE_SLUG, { filter: notesFilter, pageSize: 250 });
  const foldersQuery = useDatabase(FOLDER_DATABASE_SLUG, { pageSize: 500 });

  const { setLoading: setSearchLoading } = useTopBarSearch({
    value: searchQuery,
    onChange: setSearchQuery,
    placeholder: 'Search notes…',
    onSubmit: notesQuery.refetch,
  });

  useEffect(() => {
    setSearchLoading(notesQuery.loading);
  }, [notesQuery.loading, setSearchLoading]);

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const allNotes = notesQuery.documents;
  const notes = trimmedQuery
    ? allNotes.filter((note) => {
        if (getNoteTitle(note).toLowerCase().includes(trimmedQuery)) return true;
        if (isPresentString(note.plainText) && note.plainText.toLowerCase().includes(trimmedQuery)) return true;
        if (isPresentString(note.contentMarkdown) && note.contentMarkdown.toLowerCase().includes(trimmedQuery)) return true;
        return false;
      })
    : allNotes;
  const folders = foldersQuery.documents;
  const folderOptions = buildFolderOptions(folders);
  const folderNameById = new Map(folderOptions.map((f) => [f.id, f.title]));

  const calendarPropertyName =
    dateProperties.find((p) => p.name === activeDateProperty)?.name ?? dateProperties[0]?.name ?? '';

  const notesByDay = new Map<string, DocumentRecord[]>();
  for (const note of notes) {
    const key = getDateKey(note.properties[calendarPropertyName]);
    if (!key) continue;
    const bucket = notesByDay.get(key) ?? [];
    bucket.push(note);
    notesByDay.set(key, bucket);
  }
  const scheduledNotesCount = notes.filter((n) =>
    dateProperties.some((p) => Boolean(getDateKey(n.properties[p.name]))),
  ).length;

  const monthDays = buildCalendarDays(visibleMonth);
  const isLoading = notesQuery.loading || foldersQuery.loading;
  const currentFolderLabel = collectionItem?.title ?? 'All notes';
  const topLevelError = errorMessage || notesQuery.error?.message || foldersQuery.error?.message;
  const pageTitle = collectionItem?.title || route?.name || app?.name || 'Notes';
  const pageIcon = collectionItem?.icon || route?.icon || null;

  useEffect(() => {
    if (!dateProperties.length) {
      if (activeDateProperty) setActiveDateProperty('');
      return;
    }
    if (!dateProperties.some((p) => p.name === activeDateProperty)) {
      setActiveDateProperty(dateProperties[0].name);
    }
  }, [activeDateProperty, dateProperties]);

  async function openNote(document: DocumentRecord) {
    runtime?.navigate?.({ kind: 'document', documentId: document.id, title: document.title });
  }

  async function createDocument() {
    setCreatingDocument(true);
    setErrorMessage(null);
    try {
      const document = await upsert({
        databaseSlug: NOTE_DATABASE_SLUG,
        title: DEFAULT_NOTE_TITLE,
        properties: activeFolderId ? { [folderPropertyName]: [activeFolderId] } : undefined,
      });
      runtime?.navigate?.({ kind: 'document', documentId: document.id, title: document.title });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create note');
    } finally {
      setCreatingDocument(false);
    }
  }

  async function saveProperties(documentId: string, properties: Record<string, unknown>) {
    setSavingNoteId(documentId);
    setErrorMessage(null);
    try {
      await upsert({ databaseSlug: NOTE_DATABASE_SLUG, documentId, properties });
      notesQuery.refetch();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save note');
    } finally {
      setSavingNoteId(null);
    }
  }

  async function saveTitle(documentId: string, nextTitle: string) {
    const normalized = nextTitle.trim() || DEFAULT_NOTE_TITLE;
    setSavingNoteId(documentId);
    setErrorMessage(null);
    try {
      await upsert({ databaseSlug: NOTE_DATABASE_SLUG, documentId, title: normalized });
      notesQuery.refetch();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to rename note');
    } finally {
      setSavingNoteId(null);
    }
  }

  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const multiSelect = useMultiSelect<DocumentRecord>({
    items: notes,
    getId: (note) => note.id,
    bindKeyboardShortcuts: activeTab === 'table',
    enableDragSelect: activeTab === 'table',
    onHeadChange: (id) => {
      if (!id) return;
      rowRefs.current.get(id)?.scrollIntoView({ block: 'nearest' });
    },
  });

  async function bulkClearFolder() {
    const ids = multiSelect.getSelectedItems().map((n) => n.id);
    if (ids.length === 0) return;
    setErrorMessage(null);
    try {
      await Promise.all(
        ids.map((documentId) =>
          upsert({
            databaseSlug: NOTE_DATABASE_SLUG,
            documentId,
            properties: { [folderPropertyName]: [] },
          }),
        ),
      );
      multiSelect.clear();
      notesQuery.refetch();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update notes');
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-background">
      <PageHeader
        title={pageTitle}
        icon={pageIcon}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {topLevelError ? (
        <div className="mx-6 mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">
          {topLevelError}
        </div>
      ) : null}

      {isLoading ? <LoadingState /> : null}

      {!isLoading && activeTab === 'gallery' ? (
        <GalleryBody
          notes={notes}
          statusPropertyName={statusPropertyName}
          onOpenNote={openNote}
          onCreateDocument={createDocument}
          currentFolderLabel={currentFolderLabel}
          hasCollectionItem={Boolean(activeFolderId)}
        />
      ) : null}

      {!isLoading && activeTab === 'table' ? (
        <TableBody
          notes={notes}
          metadataProperties={metadataProperties}
          folderOptions={folderOptions}
          folderNameById={folderNameById}
          folderPropertyName={folderPropertyName}
          savingNoteId={savingNoteId}
          onOpen={openNote}
          onSaveTitle={saveTitle}
          onSaveProperties={saveProperties}
          currentFolderLabel={currentFolderLabel}
          hasCollectionItem={Boolean(activeFolderId)}
          multiSelect={multiSelect}
        />
      ) : null}

      {!isLoading && activeTab === 'calendar' ? (
        <CalendarBody
          notes={notes}
          monthDays={monthDays}
          visibleMonth={visibleMonth}
          setVisibleMonth={setVisibleMonth}
          notesByDay={notesByDay}
          statusPropertyName={statusPropertyName}
          calendarPropertyName={calendarPropertyName}
          dateProperties={dateProperties}
          activeDateProperty={activeDateProperty}
          setActiveDateProperty={setActiveDateProperty}
          scheduledNotesCount={scheduledNotesCount}
          onOpen={openNote}
        />
      ) : null}

      {activeTab === 'table' ? (
        <>
          <MultiSelectDragOverlay rect={multiSelect.dragRect} />
          <MultiSelectActionBar
            selectedCount={multiSelect.selectedCount}
            itemLabel={{ singular: 'note', plural: 'notes' }}
            actions={[
              {
                id: 'clear-folder',
                label: 'Move out of folder',
                shortcut: 'M',
                icon: <FolderMinus className="h-3.5 w-3.5" />,
                onRun: bulkClearFolder,
              },
            ]}
          />
        </>
      ) : null}
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Gallery view                                                                */
/* -------------------------------------------------------------------------- */

function GalleryBody({
  notes,
  statusPropertyName,
  onOpenNote,
  onCreateDocument,
  currentFolderLabel,
  hasCollectionItem,
}: {
  notes: DocumentRecord[];
  statusPropertyName: string | null;
  onOpenNote: (doc: DocumentRecord) => void;
  onCreateDocument: () => Promise<void>;
  currentFolderLabel: string;
  hasCollectionItem: boolean;
}) {
  if (!notes.length) {
    return (
      <EmptyState
        icon={LayoutGrid}
        title={hasCollectionItem ? 'No notes in this folder' : 'No notes yet'}
        description={
          hasCollectionItem
            ? `Create the first note in ${currentFolderLabel}.`
            : 'Folders live in the sidebar. Create a note here to get started.'
        }
        action={
          <Button size="sm" onClick={() => void onCreateDocument()} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            New note
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-3 xl:grid-cols-4">
      {notes.map((note) => (
        <NoteCard
          key={note.id}
          note={note}
          statusPropertyName={statusPropertyName}
          onOpen={() => onOpenNote(note)}
        />
      ))}
    </div>
  );
}

function NoteCard({
  note,
  statusPropertyName,
  onOpen,
}: {
  note: DocumentRecord;
  statusPropertyName: string | null;
  onOpen: () => void;
}) {
  const status = statusPropertyName ? getStatusLabel(note.properties[statusPropertyName]) : null;
  const coverUrl = getCoverUrl(note);
  const title = getNoteTitle(note);
  const previewText = getNotePreviewText(note);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'group flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-card text-left',
        'transition-colors hover:border-foreground/20 hover:shadow-sm',
      )}
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full bg-card px-5 py-5 text-foreground sm:px-6">
            <p className="line-clamp-5 text-xl font-semibold leading-snug text-foreground/75 sm:text-2xl">
              {previewText}
            </p>
          </div>
        )}
        {status ? (
          <div className="absolute right-2 top-2">
            <StatusPill status={status} />
          </div>
        ) : null}
      </div>
      <div className="flex w-full items-center gap-1.5 border-t border-border px-3 py-2">
        <NoteIcon icon={note.icon} className="shrink-0 text-muted-foreground" />
        <span className="line-clamp-1 text-[12.5px] text-foreground">
          {title}
        </span>
      </div>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Table view                                                                  */
/* -------------------------------------------------------------------------- */

function TableBody({
  notes,
  metadataProperties,
  folderOptions,
  folderNameById,
  folderPropertyName,
  savingNoteId,
  onOpen,
  onSaveTitle,
  onSaveProperties,
  currentFolderLabel,
  hasCollectionItem,
  multiSelect,
}: {
  notes: DocumentRecord[];
  metadataProperties: DatabaseProperty[];
  folderOptions: FolderOption[];
  folderNameById: Map<string, string>;
  folderPropertyName: string;
  savingNoteId: string | null;
  onOpen: (doc: DocumentRecord) => void;
  onSaveTitle: (id: string, title: string) => void;
  onSaveProperties: (id: string, props: Record<string, unknown>) => void;
  currentFolderLabel: string;
  hasCollectionItem: boolean;
  multiSelect: MultiSelectController<DocumentRecord>;
}) {
  const columns = metadataProperties.slice(0, 6);
  const allSelected =
    notes.length > 0 && notes.every((note) => multiSelect.isSelected(note.id));
  const handleSelectAllToggle = () => {
    if (multiSelect.selectedCount > 0) {
      multiSelect.clear();
      return;
    }
    multiSelect.select(notes.map((note) => note.id));
  };

  return (
    <div className="flex flex-1 flex-col gap-4 px-6 py-5">
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip icon={Settings2} label="Status is" value="Drafting, Review" />
        <FilterChip icon={CalendarDays} label="Due" value="this week" />
        <FilterChip icon={Rows3} label="Sort by" value="Updated ↓" />
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
          Add filter
        </button>
        <div className="flex-1" />
        <Eyebrow>Hide · Tags, Author</Eyebrow>
      </div>

      {!notes.length ? (
        <EmptyState
          icon={Table2}
          title={hasCollectionItem ? 'No rows in this folder' : 'No rows yet'}
          description={
            hasCollectionItem
              ? `Create a note in ${currentFolderLabel} to start editing metadata here.`
              : 'Notes become rows here. Create one to begin editing metadata inline.'
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div {...multiSelect.getContainerProps()} className="overflow-x-auto">
            <table className="w-full min-w-[1040px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="w-10 px-3 py-2.5">
                    <MultiSelectCheckbox
                      isSelected={allSelected}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectAllToggle();
                      }}
                      alwaysVisible
                      ariaLabel={allSelected ? 'Deselect all notes' : 'Select all notes'}
                    />
                  </th>
                  <th className="px-3 py-2.5 text-left">
                    <div className="flex items-center gap-1.5">
                      <FileText className="h-3 w-3 text-muted-foreground" />
                      <Eyebrow>Note</Eyebrow>
                    </div>
                  </th>
                  {columns.map((p) => (
                    <th key={p.name} className="border-l border-border px-3 py-2.5 text-left">
                      <Eyebrow>{p.name}</Eyebrow>
                    </th>
                  ))}
                  <th className="w-10 border-l border-border" />
                </tr>
              </thead>
              <tbody>
                {notes.map((note) => (
                  <TableRow
                    key={note.id}
                    note={note}
                    columns={columns}
                    folderOptions={folderOptions}
                    folderNameById={folderNameById}
                    folderPropertyName={folderPropertyName}
                    saving={savingNoteId === note.id}
                    onOpen={() => onOpen(note)}
                    onSaveTitle={(title) => onSaveTitle(note.id, title)}
                    onSaveProperties={(props) => onSaveProperties(note.id, props)}
                    isSelected={multiSelect.isSelected(note.id)}
                    onCheckboxClick={multiSelect.onCheckboxClick(note.id)}
                    onRowMouseDown={multiSelect.onRowMouseDown(note.id)}
                    rowProps={multiSelect.getRowProps(note.id)}
                    rowRef={(node) => {
                      if (node) {
                        rowRefs.current.set(note.id, node);
                      } else {
                        rowRefs.current.delete(note.id);
                      }
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-muted">
          <Sparkles className="h-3.5 w-3.5 text-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-foreground">Need a different view?</p>
          <p className="text-[12px] text-muted-foreground">
            Ask Notis to add a column, group by folder, hide shipped rows, or sort differently. No settings maze.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AgentHintChip>group by Folder</AgentHintChip>
          <AgentHintChip>hide Updated</AgentHintChip>
          <AgentHintChip>sort by Words</AgentHintChip>
        </div>
      </div>
    </div>
  );
}

function FilterChip({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11px]">
      <Icon className="h-3 w-3 text-muted-foreground" />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </span>
  );
}

function AgentHintChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-muted px-2.5 py-1 font-mono text-[10px] text-foreground/80">
      {children}
    </span>
  );
}

function TableRow({
  note,
  columns,
  folderOptions,
  folderNameById,
  folderPropertyName,
  saving,
  onOpen,
  onSaveTitle,
  onSaveProperties,
  isSelected,
  onCheckboxClick,
  onRowMouseDown,
  rowProps,
  rowRef,
}: {
  note: DocumentRecord;
  columns: DatabaseProperty[];
  folderOptions: FolderOption[];
  folderNameById: Map<string, string>;
  folderPropertyName: string;
  saving: boolean;
  onOpen: () => void;
  onSaveTitle: (title: string) => void;
  onSaveProperties: (props: Record<string, unknown>) => void;
  isSelected: boolean;
  onCheckboxClick: (event: React.MouseEvent) => void;
  onRowMouseDown: (event: React.MouseEvent) => void;
  rowProps: Record<string, string>;
  rowRef: (node: HTMLTableRowElement | null) => void;
}) {
  return (
    <tr
      {...rowProps}
      ref={rowRef}
      className={cn(
        'group border-b border-border last:border-b-0 transition-colors',
        saving ? 'bg-muted/20' : 'hover:bg-muted/30',
        isSelected && 'bg-primary/5 hover:bg-primary/10',
      )}
      onClick={onOpen}
      onMouseDown={onRowMouseDown}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onOpen();
        }
      }}
      tabIndex={0}
    >
      <td className="px-3 py-2">
        <MultiSelectCheckbox
          isSelected={isSelected}
          onClick={onCheckboxClick}
          alwaysVisible={isSelected}
          className={cn(
            'transition-opacity',
            !isSelected && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
          )}
        />
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-muted">
            <FileText className="h-3 w-3 text-muted-foreground" />
          </div>
          <input
            type="text"
            defaultValue={getNoteTitle(note)}
            key={`${note.id}:title:${getNoteTitle(note)}`}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            onBlur={(e) => onSaveTitle(e.target.value)}
            className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[13px] font-medium text-foreground outline-none transition-colors focus:border-border focus:bg-background"
          />
          <ArrowUpRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-60" />
        </div>
      </td>
      {columns.map((prop) => (
        <td key={prop.name} className="border-l border-border px-3 py-2 align-middle">
          <TableCell
            note={note}
            property={prop}
            folderOptions={folderOptions}
            folderNameById={folderNameById}
            folderPropertyName={folderPropertyName}
            onSaveProperties={onSaveProperties}
          />
        </td>
      ))}
      <td className="w-10 border-l border-border" />
    </tr>
  );
}

function TableCell({
  note,
  property,
  folderOptions,
  folderNameById,
  folderPropertyName,
  onSaveProperties,
}: {
  note: DocumentRecord;
  property: DatabaseProperty;
  folderOptions: FolderOption[];
  folderNameById: Map<string, string>;
  folderPropertyName: string;
  onSaveProperties: (props: Record<string, unknown>) => void;
}) {
  const value = note.properties[property.name];
  const selectClass =
    'w-full appearance-none rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[12px] text-foreground outline-none transition-colors focus:border-border focus:bg-background';

  if (property.type === 'status' || property.type === 'select') {
    const label = isPresentString(value) ? value : '';
    return (
      <div className="relative inline-flex items-center" onClick={(e) => e.stopPropagation()}>
        {label ? (
          <StatusPill status={label} />
        ) : (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">None</span>
        )}
        <select
          aria-label={property.name}
          className="absolute inset-0 cursor-pointer opacity-0"
          value={label}
          onChange={(e) => onSaveProperties({ [property.name]: e.target.value || null })}
        >
          <option value="">None</option>
          {(property.options ?? []).map((opt) => (
            <option key={opt.id ?? opt.name} value={opt.name}>
              {opt.name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (property.type === 'date') {
    return (
      <input
        type="date"
        value={getDateInputValue(value)}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onSaveProperties({ [property.name]: e.target.value || null })}
        className={cn(selectClass, 'text-[12px]')}
      />
    );
  }

  if (property.type === 'checkbox') {
    return (
      <label
        className="inline-flex items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onSaveProperties({ [property.name]: e.target.checked })}
          className="h-3.5 w-3.5 rounded border-border"
        />
      </label>
    );
  }

  if (property.type === 'relation' && property.name === folderPropertyName) {
    const currentId = getRelationIds(value)[0] ?? '';
    return (
      <select
        className={cn(selectClass, 'text-[12px]')}
        value={currentId}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onSaveProperties({ [property.name]: e.target.value ? [e.target.value] : [] })}
      >
        <option value="">No folder</option>
        {folderOptions.map((f) => (
          <option key={f.id} value={f.id}>
            {f.pathLabel}
          </option>
        ))}
      </select>
    );
  }

  if (property.type === 'number') {
    return (
      <input
        type="number"
        defaultValue={typeof value === 'number' ? String(value) : ''}
        inputMode="decimal"
        key={`${note.id}:${property.name}:${String(value ?? '')}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        onBlur={(e) => {
          const v = e.target.value.trim();
          onSaveProperties({ [property.name]: v ? Number(v) : null });
        }}
        className={cn(selectClass, 'font-mono text-[12px]')}
      />
    );
  }

  if (property.type === 'rich_text') {
    return (
      <input
        type="text"
        defaultValue={isPresentString(value) ? value : ''}
        key={`${note.id}:${property.name}:${String(value ?? '')}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        onBlur={(e) => {
          const v = e.target.value.trim();
          onSaveProperties({ [property.name]: v || null });
        }}
        className={cn(selectClass, 'text-[12px]')}
      />
    );
  }

  return (
    <span className="px-1.5 text-[12px] text-muted-foreground">
      {formatPropertyValue(value, property, folderNameById)}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Calendar view                                                               */
/* -------------------------------------------------------------------------- */

function CalendarBody({
  notes,
  monthDays,
  visibleMonth,
  setVisibleMonth,
  notesByDay,
  statusPropertyName,
  calendarPropertyName,
  dateProperties,
  activeDateProperty,
  setActiveDateProperty,
  scheduledNotesCount,
  onOpen,
}: {
  notes: DocumentRecord[];
  monthDays: Date[];
  visibleMonth: Date;
  setVisibleMonth: (d: Date) => void;
  notesByDay: Map<string, DocumentRecord[]>;
  statusPropertyName: string | null;
  calendarPropertyName: string;
  dateProperties: DatabaseProperty[];
  activeDateProperty: string;
  setActiveDateProperty: (v: string) => void;
  scheduledNotesCount: number;
  onOpen: (doc: DocumentRecord) => void;
}) {
  return (
    <div className="flex flex-1 flex-col gap-4 px-6 py-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-0 rounded-lg border border-border bg-background p-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <div className="px-2 text-[13px] font-semibold tracking-tight text-foreground">
            {formatMonthLabel(visibleMonth)}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1))}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
        <Button variant="outline" size="sm" className="h-8 text-[12px]" onClick={() => setVisibleMonth(new Date())}>
          Today
        </Button>

        <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11px]">
          <CalendarDays className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground">Date field</span>
          <select
            className="appearance-none bg-transparent pr-3 font-semibold text-foreground outline-none"
            value={calendarPropertyName}
            onChange={(e) => setActiveDateProperty(e.target.value)}
            disabled={!dateProperties.length}
          >
            {dateProperties.length ? (
              dateProperties.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))
            ) : (
              <option value="">—</option>
            )}
          </select>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </div>

        <div className="flex-1" />
        <Eyebrow>{pluralize(scheduledNotesCount, 'note')} scheduled</Eyebrow>
      </div>

      {!dateProperties.length ? (
        <EmptyState
          icon={CalendarDays}
          title="No date property yet"
          description="Add a date field to the notes database and this board will start plotting notes automatically."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="grid grid-cols-7 border-b border-border bg-muted/40">
            {WEEKDAY_LABELS.map((label, i) => (
              <div
                key={label}
                className={cn(
                  'px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em]',
                  i >= 5 ? 'text-muted-foreground/60' : 'text-muted-foreground',
                )}
              >
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthDays.map((day) => {
              const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
              const dayNotes = notesByDay.get(key) ?? [];
              const inMonth = isSameMonth(day, visibleMonth);
              const today = isToday(day);
              return (
                <div
                  key={key}
                  className={cn(
                    'flex min-h-[110px] flex-col gap-1.5 border-b border-r border-border px-2 py-2',
                    !inMonth && 'bg-muted/30',
                  )}
                >
                  <div className="flex items-center justify-between">
                    {today ? (
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-[11px] font-semibold text-background">
                        {day.getDate()}
                      </span>
                    ) : (
                      <span
                        className={cn(
                          'text-[12px] font-medium',
                          inMonth ? 'text-foreground/80' : 'text-muted-foreground/50',
                        )}
                      >
                        {day.getDate()}
                      </span>
                    )}
                    {today ? <Eyebrow className="text-foreground">Today</Eyebrow> : null}
                  </div>
                  <div className="flex flex-col gap-1">
                    {dayNotes.slice(0, 3).map((note) => {
                      const status = statusPropertyName
                        ? getStatusLabel(note.properties[statusPropertyName])
                        : null;
                      const tone = getStatusTone(status);
                      return (
                        <button
                          key={note.id}
                          type="button"
                          onClick={() => onOpen(note)}
                          className={cn(
                            'line-clamp-1 rounded-md border border-l-2 border-border bg-background px-2 py-1 text-left text-[11px] font-medium text-foreground transition-colors hover:bg-muted/50',
                            statusBarClasses[tone],
                          )}
                        >
                          {getNoteTitle(note)}
                        </button>
                      );
                    })}
                    {dayNotes.length > 3 ? (
                      <span className="px-1 text-[10px] text-muted-foreground">+{dayNotes.length - 3} more</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card px-4 py-3">
        <Eyebrow>Legend</Eyebrow>
        <LegendItem color="bg-amber-500" label="Drafting" />
        <LegendItem color="bg-blue-500" label="Review" />
        <LegendItem color="bg-emerald-500" label="Shipped" />
        <LegendItem color="bg-stone-400" label="Idea" />
        <div className="flex-1" />
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-foreground" />
          <span className="text-[12px] text-muted-foreground">Ask Notis to</span>
          <AgentHintChip>use Publish date</AgentHintChip>
          <AgentHintChip>color by Folder</AgentHintChip>
          <AgentHintChip>switch to week view</AgentHintChip>
        </div>
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn('h-0.5 w-3 rounded', color)} />
      <span className="text-[11px] font-medium text-foreground/80">{label}</span>
    </div>
  );
}
