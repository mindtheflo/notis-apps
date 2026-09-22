'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NotisSelectionBoundary, ViewSkeleton, normalizeDocumentRecord, useActiveResource, useNotis, useNotisNavigation, useQuery, useTool, useToolQuery, useTopBarSearch } from '@notis/sdk';
import { WarningCircleIcon as AlertCircle, AtIcon as AtSign, CalendarIcon as Calendar, CheckSquareIcon as CheckSquare, CircleIcon as Circle, CircleIcon as CircleDot, DatabaseIcon as Database, FileTextIcon as FileText, HashIcon as Hash, LinkIcon as Link2, ListChecksIcon as ListChecks, CircleNotchIcon as Loader2, EnvelopeIcon as Mail, PaperclipIcon as Paperclip, PhoneIcon as Phone, SigmaIcon as Sigma, TagIcon as Tag, TextTIcon as Type, UserIcon as User } from '@phosphor-icons/react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { PageHeading } from '@/components/page-heading';
import { cn } from '@/lib/utils';
import { beginResourceNavigation, findDatabaseResource } from '@/lib/resource-deep-links';
import type {
  DatabaseCatalogRow,
  DatabaseDetail,
  DatabaseDocument,
  DatabaseProperty,
  DocumentPropertyValue,
  GetDatabaseResult,
  ListDatabasesResult,
  QueryDatabaseArgs,
  QueryDatabaseResult,
} from '@/lib/types';

const TYPE_LABEL: Record<string, string> = {
  title: 'Text',
  rich_text: 'Text',
  number: 'Number',
  select: 'Select',
  multi_select: 'Multi-select',
  status: 'Status',
  checkbox: 'Checkbox',
  url: 'URL',
  email: 'Email',
  phone_number: 'Phone',
  date: 'Date',
  files: 'Files',
  relation: 'Relation',
  formula: 'Formula',
  people: 'People',
};

function PropertyTypeIcon({ type }: { type: string }) {
  const className = 'h-3.5 w-3.5 text-muted-foreground';
  switch (type) {
    case 'title':
      return <FileText className={className} />;
    case 'rich_text':
      return <Type className={className} />;
    case 'number':
      return <Hash className={className} />;
    case 'select':
      return <CircleDot className={className} />;
    case 'multi_select':
      return <Tag className={className} />;
    case 'status':
      return <Circle className={className} />;
    case 'checkbox':
      return <CheckSquare className={className} />;
    case 'url':
      return <Link2 className={className} />;
    case 'email':
      return <Mail className={className} />;
    case 'phone_number':
      return <Phone className={className} />;
    case 'date':
      return <Calendar className={className} />;
    case 'files':
      return <Paperclip className={className} />;
    case 'relation':
      return <Link2 className={className} />;
    case 'formula':
      return <Sigma className={className} />;
    case 'people':
      return <User className={className} />;
    default:
      return <AtSign className={className} />;
  }
}

function compactNumber(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '0';
  return new Intl.NumberFormat('en-US').format(n);
}

function resolvedDocumentCount(
  database: Pick<DatabaseCatalogRow, 'documents_count' | 'successful_documents' | 'total_documents'> | null | undefined,
): number {
  const count = database?.documents_count ?? database?.successful_documents ?? database?.total_documents;
  if (typeof count !== 'number' || !Number.isFinite(count)) return 0;
  return Math.max(0, count);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

function relationLabel(value: unknown, noun: string): string {
  const count = Array.isArray(value) ? value.length : 0;
  return `${compactNumber(count)} ${noun}${count === 1 ? '' : 's'}`;
}

type Group = {
  key: string;
  label: string;
  rows: DatabaseCatalogRow[];
};

function groupRows(rows: DatabaseCatalogRow[]): Group[] {
  const map = new Map<string, Group>();
  for (const row of rows) {
    const key = row.owner_app_id ?? '__workspace__';
    const label = row.owner_app_name ?? 'Workspace';
    if (!map.has(key)) {
      map.set(key, { key, label, rows: [] });
    }
    map.get(key)!.rows.push(row);
  }
  for (const group of map.values()) {
    group.rows.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  }
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function relationCount(database: DatabaseDetail | null): number {
  if (!database?.schema?.properties) return 0;
  return database.schema.properties.filter((p) => p.type === 'relation').length;
}

function nonRelationProps(database: DatabaseDetail | null): DatabaseProperty[] {
  if (!database?.schema?.properties) return [];
  return database.schema.properties.filter((p) => p.type !== 'relation');
}

function relationProps(database: DatabaseDetail | null): DatabaseProperty[] {
  if (!database?.schema?.properties) return [];
  return database.schema.properties.filter((p) => p.type === 'relation');
}

type ActiveTab = 'properties' | 'relations' | 'documents';

const EMPTY_DOCUMENTS: DatabaseDocument[] = [];

export default function CatalogPage() {
  const { resourceId } = useNotis();
  const navigation = useNotisNavigation();
  // Documents are paginated through a loop of idempotent calls, so they are
  // driven by a custom useQuery below rather than useDocuments (which only
  // addresses a database by slug; this catalog spans every app's databases
  // and slugs are only unique within their owning app, so every read here is
  // keyed by the stable database id instead).
  const queryDatabase = useTool<QueryDatabaseArgs, QueryDatabaseResult>(
    'LOCAL_NOTIS_DATABASE_QUERY',
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [unavailableResourceId, setUnavailableResourceId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('properties');

  const pendingResourceIdRef = useRef<string | null | undefined>(undefined);

  const selectDatabase = useCallback((databaseId: string | null) => {
    setSelectedId(databaseId);
    const transition = beginResourceNavigation(
      resourceId,
      pendingResourceIdRef.current,
      databaseId,
    );
    pendingResourceIdRef.current = transition.pendingResourceId;
    if (transition.shouldNavigate) navigation.toRoute('/', { resourceId: databaseId });
  }, [navigation, resourceId]);

  const listQuery = useToolQuery<ListDatabasesResult>(
    'LOCAL_NOTIS_DATABASE_LIST_DATABASES',
    {},
    { readOnly: true },
  );
  const listError = listQuery.error?.message ?? null;
  const rows = useMemo(
    () => (listQuery.data?.databases ?? []).filter((db): db is DatabaseCatalogRow =>
      Boolean(db && typeof db.id === 'string'),
    ),
    [listQuery.data],
  );

  // Resolve the selected database once the catalog has a successful result
  // (cached or fresh): honor a deep-linked resourceId, otherwise fall back to
  // the first row, and flag a resourceId that no longer resolves.
  useEffect(() => {
    if (!listQuery.hasData) return;
    if (pendingResourceIdRef.current !== undefined) {
      if (pendingResourceIdRef.current !== resourceId) return;
      pendingResourceIdRef.current = undefined;
    }
    if (!resourceId) {
      setUnavailableResourceId(null);
      setSelectedId(rows[0]?.id ?? null);
      return;
    }
    const requested = findDatabaseResource(resourceId, rows);
    if (requested) {
      setSelectedId(requested.id);
      setUnavailableResourceId(null);
    } else {
      setSelectedId((current) => current && rows.some((row) => row.id === current)
        ? current
        : rows[0]?.id ?? null);
      setUnavailableResourceId(resourceId);
    }
  }, [listQuery.hasData, resourceId, rows]);

  useEffect(() => {
    setActiveTab('properties');
  }, [selectedId]);

  const detailQuery = useToolQuery<GetDatabaseResult>(
    'LOCAL_NOTIS_DATABASE_GET_DATABASE',
    { database_id: selectedId ?? '' },
    { readOnly: true, enabled: Boolean(selectedId) },
  );
  const detail = detailQuery.data && 'database' in detailQuery.data ? detailQuery.data.database : null;
  const detailError = detailQuery.error?.message
    ?? (detailQuery.data && 'status' in detailQuery.data && detailQuery.data.status === 'error'
      ? detailQuery.data.message
      : null);

  const queryCall = queryDatabase.call;
  const documentsQuery = useQuery<DatabaseDocument[]>(
    ['catalog-documents', detail?.id ?? null],
    async () => {
      const databaseId = detail?.id;
      if (!databaseId) throw new Error('This database does not have a stable ID.');
      const pageSize = 100;
      const maxPages = 1000;
      let offset = 0;
      let collected: DatabaseDocument[] = [];

      for (let page = 0; page < maxPages; page += 1) {
        const result = await queryCall(
          { database_id: databaseId, query: { page_size: pageSize }, offset },
          { readOnly: true, dedupe: true },
        );
        if (!result || result.status === 'error') {
          throw new Error(result?.message || 'Failed to load documents.');
        }
        collected = [
          ...collected,
          ...(result.documents ?? []).map((document) => normalizeDocumentRecord(document)),
        ];
        if (!result.has_more) return collected;
        if (typeof result.next_offset !== 'number') {
          throw new Error('The document query did not return the next page offset.');
        }
        offset = result.next_offset;
      }

      throw new Error('Document query exceeded the pagination safety limit.');
    },
    { readOnly: true, enabled: activeTab === 'documents' && Boolean(detail?.id) },
  );
  const documents = documentsQuery.data ?? EMPTY_DOCUMENTS;
  const documentsError = documentsQuery.error?.message ?? null;

  const handleSearchChange = useCallback((next: string) => setSearch(next), []);
  useTopBarSearch({
    value: search,
    onChange: handleSearchChange,
    placeholder: 'Search databases',
  });

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    const linkedResourceId = pendingResourceIdRef.current !== undefined
      ? pendingResourceIdRef.current
      : resourceId;
    return rows.filter((row) => {
      if (row.id === selectedId && row.id === linkedResourceId) return true;
      const haystack = [row.name, row.slug, row.description, row.owner_app_name]
        .filter((v): v is string => typeof v === 'string')
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [resourceId, rows, search, selectedId]);

  const groups = useMemo(() => groupRows(filteredRows), [filteredRows]);
  const docCount = resolvedDocumentCount(detail);
  const relCount = relationCount(detail);
  const propCount = nonRelationProps(detail).length;
  const databaseResource = detail ? {
    id: detail.id,
    kind: 'database',
    label: detail.name ?? detail.slug ?? 'Untitled database',
    attributes: {
      slug: detail.slug,
      properties: propCount,
      relations: relCount,
      documents: docCount,
    },
  } : null;
  useActiveResource(databaseResource);

  const hasRows = rows.length > 0;
  const showCatalogSkeleton = !listQuery.hasData && listQuery.loading;
  const showDetailSkeleton = Boolean(selectedId) && !detailQuery.hasData && detailQuery.loading;

  return (
    <div
      data-store-screenshot="catalog"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 bg-background p-4 text-foreground antialiased sm:p-6 lg:p-8"
    >
      <PageHeading
        title={detail?.name ?? detail?.slug ?? 'Databases'}
        description={detail?.description ?? undefined}
        actions={
          listQuery.hasData && hasRows ? (
            <DatabasePicker groups={groups} selectedId={selectedId} onChange={selectDatabase} />
          ) : undefined
        }
      />

      {listError ? (
        <Notice tone="destructive">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{listError}</span>
            <Button variant="secondary" size="sm" onClick={() => void listQuery.refetch()}>
              Retry
            </Button>
          </div>
        </Notice>
      ) : null}
      {unavailableResourceId ? (
        <Notice>This database is no longer available. Showing the catalog instead.</Notice>
      ) : null}

      {showCatalogSkeleton ? (
        <ViewSkeleton variant="detail" />
      ) : !listQuery.hasData ? null : !hasRows ? (
        <DetailEmpty hasRows={false} />
      ) : showDetailSkeleton ? (
        <ViewSkeleton variant="detail" />
      ) : !detail ? (
        detailError ? (
          <DetailError message={detailError} onRetry={() => void detailQuery.refetch()} />
        ) : (
          <DetailEmpty hasRows />
        )
      ) : (
        <NotisSelectionBoundary resource={databaseResource} className="flex flex-col gap-4">
          {detailError ? (
            <Notice tone="destructive">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>{detailError}</span>
                <Button variant="secondary" size="sm" onClick={() => void detailQuery.refetch()}>
                  Retry
                </Button>
              </div>
            </Notice>
          ) : null}
          <DetailTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            propCount={propCount}
            relCount={relCount}
            docCount={docCount}
          />
          <div>
            {activeTab === 'properties' && (
              <PropertyList properties={nonRelationProps(detail)} />
            )}
            {activeTab === 'relations' && (
              <RelationsList properties={relationProps(detail)} onSelect={selectDatabase} />
            )}
            {activeTab === 'documents' && (
              <DocumentsTable
                database={detail}
                documents={documents}
                loading={documentsQuery.loading}
                isFetching={documentsQuery.isFetching}
                hasData={documentsQuery.hasData}
                error={documentsError}
                onRetry={() => void documentsQuery.refetch()}
                expectedCount={docCount}
              />
            )}
          </div>
        </NotisSelectionBoundary>
      )}
    </div>
  );
}

function DatabasePicker({
  groups,
  selectedId,
  onChange,
}: {
  groups: Group[];
  selectedId: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <NativeSelect
      aria-label="Select a database"
      value={selectedId ?? ''}
      onChange={(event) => onChange(event.target.value)}
      className="w-full sm:w-64"
    >
      {groups.map((group) => (
        <optgroup key={group.key} label={group.label}>
          {group.rows.map((row) => (
            <option key={row.id} value={row.id}>
              {(row.name ?? row.slug ?? 'Untitled')} · {compactNumber(resolvedDocumentCount(row))} docs
            </option>
          ))}
        </optgroup>
      ))}
    </NativeSelect>
  );
}

function Notice({
  tone = 'default',
  children,
}: {
  tone?: 'default' | 'destructive';
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-xl px-4 py-3 text-sm',
        tone === 'destructive' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground',
      )}
    >
      {children}
    </div>
  );
}

function DetailError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-10 py-16 text-center">
      <AlertCircle className="h-6 w-6 text-destructive" />
      <p className="text-sm font-medium text-foreground">Couldn't load this database</p>
      <p className="max-w-[42ch] text-xs text-muted-foreground">{message}</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

function DetailEmpty({ hasRows }: { hasRows: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-10 py-16 text-center">
      <Database className="h-10 w-10 text-muted-foreground/25" strokeWidth={1.4} />
      <p className="text-sm font-semibold text-foreground">
        {hasRows ? 'Select a database' : 'No databases yet'}
      </p>
      <p className="max-w-[42ch] text-xs text-muted-foreground">
        {hasRows
          ? 'Pick a database above to view its schema, properties, and relations.'
          : 'Databases created in your Notis workspace will appear here.'}
      </p>
    </div>
  );
}

function DetailTabs({
  activeTab,
  onTabChange,
  propCount,
  relCount,
  docCount,
}: {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  propCount: number;
  relCount: number;
  docCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <TabButton
        tab="properties"
        icon={<ListChecks className="h-3.5 w-3.5" />}
        label="Properties"
        count={propCount}
        active={activeTab === 'properties'}
        onClick={() => onTabChange('properties')}
      />
      <TabButton
        tab="relations"
        icon={<Link2 className="h-3.5 w-3.5" />}
        label="Relations"
        count={relCount}
        active={activeTab === 'relations'}
        onClick={() => onTabChange('relations')}
      />
      <TabButton
        tab="documents"
        icon={<Database className="h-3.5 w-3.5" />}
        label="Documents"
        count={docCount}
        active={activeTab === 'documents'}
        onClick={() => onTabChange('documents')}
      />
    </div>
  );
}

function TabButton({
  tab,
  icon,
  label,
  count,
  active,
  onClick,
}: {
  tab: ActiveTab;
  icon: React.ReactNode;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-tab={tab}
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors',
        active
          ? 'bg-muted font-medium text-foreground'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
    >
      {icon}
      <span>{label}</span>
      <span className="tabular-nums text-muted-foreground">{compactNumber(count)}</span>
    </button>
  );
}

function PropertyList({ properties }: { properties: DatabaseProperty[] }) {
  if (properties.length === 0) {
    return <SectionEmpty label="No properties defined." />;
  }
  return (
    <div className="flex flex-col gap-1">
      {properties.map((prop) => (
        <PropertyRow key={prop.id} property={prop} />
      ))}
    </div>
  );
}

function OptionBadges({ options }: { options: { name: string | null }[] }) {
  const shown = options.slice(0, 2);
  const rest = options.slice(2);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown.map((option, index) => (
        <Badge key={option.name ?? index} variant="secondary">
          {option.name ?? '—'}
        </Badge>
      ))}
      {rest.length > 0 ? (
        <span className="text-xs text-muted-foreground">
          {rest.map((option) => option.name ?? '—').join(' · ')}
        </span>
      ) : null}
    </div>
  );
}

function PropertyRow({ property }: { property: DatabaseProperty }) {
  const typeLabel = TYPE_LABEL[property.type] ?? property.type;
  const isTitle = property.type === 'title';
  const options = property.options ?? [];

  return (
    <div className="list-row flex flex-col gap-1.5 px-4 py-3.5">
      <div className="flex items-center gap-2.5">
        <PropertyTypeIcon type={property.type} />
        <span className="text-sm font-semibold tracking-[-0.005em] text-foreground">
          {property.name ?? 'Untitled'}
        </span>
        {isTitle ? <Badge variant="secondary">Title</Badge> : null}
        <span className="flex-1" />
        <span className="text-xs text-muted-foreground">{typeLabel}</span>
      </div>

      {options.length > 0 ? (
        <div className="pl-6">
          <OptionBadges options={options} />
        </div>
      ) : null}

      {property.format ? (
        <div className="pl-6">
          <Badge variant="secondary">Format · {property.format}</Badge>
        </div>
      ) : null}

      {property.expression ? (
        <div className="max-w-[60ch] pl-6">
          <code className="block truncate rounded-md bg-muted/60 px-2 py-1 font-mono text-xs text-muted-foreground">
            {property.expression}
          </code>
        </div>
      ) : null}

      {property.description ? (
        <div className="max-w-[52ch] pl-6">
          <p className="text-sm leading-5 text-muted-foreground">{property.description}</p>
        </div>
      ) : null}
    </div>
  );
}

function RelationsList({ properties, onSelect }: { properties: DatabaseProperty[]; onSelect: (id: string) => void }) {
  if (properties.length === 0) {
    return <SectionEmpty label="No relations defined." />;
  }
  return (
    <div className="flex flex-col gap-1">
      {properties.map((prop) => (
        <RelationRow key={prop.id} property={prop} onSelect={onSelect} />
      ))}
    </div>
  );
}

function RelationRow({ property, onSelect }: { property: DatabaseProperty; onSelect: (id: string) => void }) {
  const target = property.relation_target;
  return (
    <div className="list-row flex flex-col gap-1.5 px-4 py-3.5">
      <div className="flex items-center gap-2.5">
        <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm font-semibold tracking-[-0.005em] text-foreground">
          {property.name ?? 'Untitled'}
        </span>
        <span className="flex-1" />
        <span className="text-xs text-muted-foreground">Relation</span>
      </div>
      <div className="flex min-w-0 items-center gap-1.5 pl-6">
        <span className="text-xs text-muted-foreground">→</span>
        <Button type="button" variant="secondary" size="sm" className="min-w-0 gap-1.5" disabled={!target?.database_id} onClick={() => { if (target?.database_id) onSelect(target.database_id); }}>
          <Database className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="truncate">{target?.database_name ?? target?.database_slug ?? 'Unknown database'}</span>
        </Button>
      </div>
      {property.description ? (
        <div className="max-w-[52ch] pl-6">
          <p className="text-sm leading-5 text-muted-foreground">{property.description}</p>
        </div>
      ) : null}
    </div>
  );
}

function DocumentsTable({
  database,
  documents,
  loading,
  isFetching,
  hasData,
  error,
  onRetry,
  expectedCount,
}: {
  database: DatabaseDetail;
  documents: DatabaseDocument[];
  loading: boolean;
  isFetching: boolean;
  hasData: boolean;
  error: string | null;
  onRetry: () => void;
  expectedCount: number;
}) {
  const properties = (database.schema?.properties ?? []).filter((property) => property.type !== 'title');
  const gridTemplate = ['minmax(220px,1.6fr)', '150px', '150px', ...properties.map(() => 'minmax(160px,1fr)')].join(' ');

  if (loading) {
    return <ViewSkeleton variant="table" rows={6} />;
  }

  if (error && !hasData) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <AlertCircle className="h-5 w-5 text-destructive" />
        <p className="text-sm font-medium text-foreground">Couldn't load documents</p>
        <p className="max-w-[44ch] text-sm text-muted-foreground">{error}</p>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  if (hasData && documents.length === 0) {
    return <DocumentsEmpty count={expectedCount} />;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-sm text-muted-foreground">
          {compactNumber(documents.length)} loaded
        </p>
        {error ? (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <span>{error}</span>
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Retry
            </Button>
          </div>
        ) : isFetching ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Refreshing" />
        ) : null}
      </div>
      <div className="lg:overflow-x-auto">
        <div className="flex flex-col gap-1 lg:min-w-max">
          <div
            className="hidden gap-4 px-4 pb-1 text-xs font-medium text-muted-foreground lg:grid"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <span>Document</span>
            <span>Created</span>
            <span>Last edited</span>
            {properties.map((property) => (
              <span key={property.id} className="truncate">
                {property.name ?? property.id}
              </span>
            ))}
          </div>
          {documents.map((document) => (
            <div
              key={document.id}
              className="list-row flex flex-col gap-2 lg:grid lg:items-center lg:gap-4"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="truncate text-sm font-medium text-foreground">
                  {document.title || 'Untitled document'}
                </span>
                <span className="truncate font-mono text-xs text-muted-foreground">
                  {document.id}
                </span>
              </div>
              <DocField label="Created">
                <span className="text-sm text-muted-foreground">{formatDateTime(document.createdAt)}</span>
              </DocField>
              <DocField label="Last edited">
                <span className="text-sm text-muted-foreground">{formatDateTime(document.lastEditedTime)}</span>
              </DocField>
              {properties.map((property) => {
                const propertyName = property.name ?? property.id;
                return (
                  <DocField key={`${document.id}-${property.id}`} label={propertyName}>
                    <PropertyValue
                      property={property}
                      value={document.properties?.[propertyName]}
                    />
                  </DocField>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DocField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="mr-1 text-xs text-muted-foreground lg:hidden">{label}</span>
      {children}
    </div>
  );
}

function DocumentsEmpty({ count }: { count: number }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <Database className="h-8 w-8 text-muted-foreground/25" strokeWidth={1.4} />
      <p className="text-sm font-medium text-foreground">{compactNumber(count)} documents</p>
    </div>
  );
}

function PropertyValue({
  property,
  value,
}: {
  property: DatabaseProperty;
  value: DocumentPropertyValue | undefined;
}) {
  if (value == null || value === '') return <MutedDash />;

  switch (property.type) {
    case 'title':
    case 'rich_text':
      return <TextValue value={typeof value === 'string' ? value : stringifyFallback(value)} />;
    case 'number':
      return <TextValue value={typeof value === 'number' ? compactNumber(value) : ''} />;
    case 'select':
    case 'status':
      if (typeof value !== 'string') return <MutedDash />;
      return <Badge variant="secondary">{value}</Badge>;
    case 'multi_select': {
      const options = Array.isArray(value) ? value : [];
      if (options.length === 0) return <MutedDash />;
      const labels = options.map((option) => (typeof option === 'string' ? option : stringifyFallback(option)));
      return <OptionBadges options={labels.map((label) => ({ name: label || 'Untitled' }))} />;
    }
    case 'checkbox':
      return <TextValue value={value === true ? 'Yes' : 'No'} />;
    case 'date':
      return <TextValue value={typeof value === 'string' ? formatDate(value) : ''} />;
    case 'url':
    case 'email':
    case 'phone_number':
      return <TextValue value={typeof value === 'string' ? value : ''} />;
    case 'relation':
    case 'people':
    case 'files':
      return <TextValue value={relationLabel(value, property.type === 'people' ? 'person' : property.type === 'files' ? 'file' : 'linked record')} />;
    default:
      return <TextValue value={stringifyFallback(value)} />;
  }
}

function TextValue({ value }: { value: string }) {
  if (!value) return <MutedDash />;
  return <span className="block truncate text-sm text-foreground">{value}</span>;
}

function MutedDash() {
  return <span className="text-muted-foreground/60">—</span>;
}

function stringifyFallback(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function SectionEmpty({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-12 text-center">
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
