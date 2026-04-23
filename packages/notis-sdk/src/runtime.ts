/**
 * NotisRuntime is the bridge between app code running in the browser and the
 * Notis platform. It is injected as `window.__NOTIS_RUNTIME__` into every app
 * page -- both in local preview (with mock implementations) and in the portal
 * (with real server-backed implementations).
 *
 * App code should never access `window.__NOTIS_RUNTIME__` directly. Instead,
 * use the hooks from `@notis/sdk` (useDatabase, useTool, etc.) which read
 * from the NotisProvider context.
 */

// ---------------------------------------------------------------------------
// Database types
// ---------------------------------------------------------------------------

export interface DatabaseProperty {
  name: string;
  type: 'title' | 'rich_text' | 'number' | 'checkbox' | 'date' | 'select' | 'multi_select' | 'status' | 'relation' | 'formula' | 'files';
  description?: string;
  options?: Array<{ name: string; id?: string }>;
}

export interface DatabaseDescriptor {
  slug: string;
  title: string;
  description?: string | null;
  icon?: string | null;
  properties: DatabaseProperty[];
}

export interface DocumentRecord {
  id: string;
  title: string;
  properties: Record<string, unknown>;
  icon?: string | null;
  databaseSlug?: string;
  contentBlocknote?: Array<Record<string, unknown>> | null;
  contentMarkdown?: string | null;
  plainText?: string | null;
  createdAt?: string | null;
  lastEditedTime?: string | null;
}

// ---------------------------------------------------------------------------
// Tool types
// ---------------------------------------------------------------------------

export interface ToolDescriptor {
  name: string;
  description?: string;
  input_schema?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Route types
// ---------------------------------------------------------------------------

export interface RouteDescriptor {
  slug: string;
  path: string;
  name: string;
  icon?: string | null;
  parentSlug?: string | null;
  default?: boolean;
  collection?: {
    database: string;
    titleProperty: string;
    parentProperty?: string | null;
    sidebar?: {
      mode: 'flat-list' | 'tree';
      allowCreate: boolean;
    } | null;
  } | null;
}

export interface CollectionItem {
  id: string;
  title: string;
  icon?: string | null;
}

export interface CollectionTreeItem extends CollectionItem {
  parent_id: string | null;
  has_children: boolean;
}

// ---------------------------------------------------------------------------
// App descriptor
// ---------------------------------------------------------------------------

export interface AppDescriptor {
  id: string;
  name: string;
  icon?: string | null;
  description?: string | null;
}

// ---------------------------------------------------------------------------
// Query types
// ---------------------------------------------------------------------------

export interface QueryFilter {
  filters?: Array<{
    property: string;
    operator: string;
    value: unknown;
  }>;
  sorts?: Array<{
    property: string;
    direction: 'asc' | 'desc';
  }>;
  page_size?: number;
}

// ---------------------------------------------------------------------------
// NotisRuntime -- the window.__NOTIS_RUNTIME__ contract
// ---------------------------------------------------------------------------

export interface NotisRuntime {
  app: AppDescriptor;
  route: RouteDescriptor;
  databases: DatabaseDescriptor[];

  navigate?: (payload: { kind: string; [key: string]: unknown }) => void;

  listTools(): Promise<ToolDescriptor[]>;
  callTool(name: string, args?: Record<string, unknown>): Promise<unknown>;

  queryDatabase(args: {
    databaseSlug: string;
    query?: QueryFilter;
    offset?: number;
  }): Promise<{ documents: DocumentRecord[] }>;

  getDocument(args: {
    documentId: string;
  }): Promise<DocumentRecord>;

  upsertDocument(args: {
    databaseSlug: string;
    documentId?: string;
    title?: string;
    properties?: Record<string, unknown>;
    contentBlocknote?: Array<Record<string, unknown>> | null;
  }): Promise<{ status: string; document: DocumentRecord }>;

  listCollectionItems(args?: {
    databaseSlug?: string;
    pageSize?: number;
  }): Promise<{ items: CollectionItem[] }>;

  listCollectionTree?(args?: {
    databaseSlug?: string;
    pageSize?: number;
  }): Promise<{ items: CollectionTreeItem[] }>;

  request(path: string, options?: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  }): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    __NOTIS_RUNTIME__?: NotisRuntime;
  }
}

/**
 * Read the injected runtime from the window. Returns null during SSR or if the
 * runtime hasn't been injected yet (e.g. during `next dev` without preview).
 */
export function getRuntime(): NotisRuntime | null {
  if (typeof window === 'undefined') return null;
  return window.__NOTIS_RUNTIME__ ?? null;
}
