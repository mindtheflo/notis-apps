import type { NotisRuntime } from '@notis/sdk';

interface MockDoc {
  id: string;
  title: string;
  properties: Record<string, unknown>;
  icon?: string | null;
  databaseSlug?: string;
  createdAt?: string | null;
  lastEditedTime?: string | null;
  contentBlocknote?: Array<Record<string, unknown>> | null;
  contentMarkdown?: string | null;
  plainText?: string | null;
}

const STATE: Record<string, MockDoc[]> = { rolls: [] };
const ROLLS_DATABASE = {
  slug: 'rolls',
  title: 'Rolls',
  description: null,
  icon: null,
  properties: [
    { name: 'Value', type: 'number' as const },
    { name: 'Mode', type: 'select' as const },
    { name: 'Min', type: 'number' as const },
    { name: 'Max', type: 'number' as const },
    { name: 'Rolled At', type: 'date' as const },
  ],
};

declare global {
  interface Window {
    __NOTIS_RANDOM_RUNTIME__?: NotisRuntime;
  }
}

export function installMockRuntime(initialRoute: 'home' | 'history' = 'home'): NotisRuntime {
  const runtime: NotisRuntime = {
    app: {
      id: 'dev-notis-random',
      name: 'Random Number Generator',
      icon: 'lucide:dices',
      description: 'Dev preview — data is in-memory only.',
    },
    route: currentRoute(initialRoute),
    databases: [ROLLS_DATABASE],

    listTools: async () => [
      {
        name: 'notis-default-query',
        input_schema: { type: 'object', properties: { database_slug: { type: 'string' } } },
      },
      {
        name: 'notis-default-upsert_rolls',
        input_schema: { type: 'object', properties: {} },
      },
    ],
    callTool: async (name: string, args?: Record<string, unknown>): Promise<unknown> => {
      if (name === 'notis-default-query') {
        const request = args ?? {};
        const databaseSlug = typeof request.database_slug === 'string' ? request.database_slug : 'rolls';
        const query = request.query && typeof request.query === 'object'
          ? request.query as Record<string, unknown>
          : {};
        const offset = typeof request.offset === 'number' ? request.offset : 0;
        const all = STATE[databaseSlug] ?? [];
        const sliced = all.slice(offset);
        const pageSize = typeof query.page_size === 'number' ? query.page_size : undefined;
        return { documents: typeof pageSize === 'number' ? sliced.slice(0, pageSize) : sliced };
      }

      if (name === 'notis-default-upsert_rolls') {
        const request = args ?? {};
        const docs = STATE.rolls ?? [];
        const now = new Date().toISOString();
        const documentId = typeof request.document_id === 'string' ? request.document_id : undefined;
        const existing = documentId ? docs.find((d) => d.id === documentId) : undefined;
        const controlKeys = new Set(['document_id', 'title']);
        const properties = Object.fromEntries(
          Object.entries(request).filter(([key]) => !controlKeys.has(key)),
        );
        const doc: MockDoc = {
          id: existing?.id ?? `dev-rolls-${Date.now()}`,
          title: typeof request.title === 'string' ? request.title : existing?.title ?? 'Untitled',
          properties: { ...(existing?.properties ?? {}), ...properties },
          databaseSlug: 'rolls',
          icon: null,
          createdAt: existing?.createdAt ?? now,
          lastEditedTime: now,
        };
        if (existing) docs[docs.indexOf(existing)] = doc;
        else docs.unshift(doc);
        STATE.rolls = docs;
        return { status: 'success', document: doc };
      }

      throw new Error(`Tool calls unavailable in dev preview (${name}).`);
    },

    queryDatabase: async ({ databaseSlug, query, offset = 0 }) => {
      const all = STATE[databaseSlug] ?? [];
      const sliced = all.slice(offset);
      return {
        documents: typeof query?.page_size === 'number' ? sliced.slice(0, query.page_size) : sliced,
      };
    },

    getDocument: async ({ documentId }) => {
      const doc = Object.values(STATE).flat().find((item) => item.id === documentId);
      if (!doc) throw new Error(`Document not found (${documentId}).`);
      return doc;
    },

    upsertDocument: async ({ databaseSlug, documentId, title, properties }) => {
      const docs = STATE[databaseSlug] ?? [];
      const now = new Date().toISOString();
      const existing = documentId ? docs.find((doc) => doc.id === documentId) : undefined;
      const doc: MockDoc = {
        id: existing?.id ?? `dev-${databaseSlug}-${Date.now()}`,
        title: title ?? existing?.title ?? 'Untitled',
        properties: { ...(existing?.properties ?? {}), ...(properties ?? {}) },
        databaseSlug,
        icon: null,
        createdAt: existing?.createdAt ?? now,
        lastEditedTime: now,
      };
      if (existing) docs[docs.indexOf(existing)] = doc;
      else docs.unshift(doc);
      STATE[databaseSlug] = docs;
      return { status: 'success', document: doc };
    },

    listCollectionItems: async ({ databaseSlug = 'rolls', pageSize } = {}) => {
      const docs = STATE[databaseSlug] ?? [];
      const items = docs.slice(0, pageSize).map((doc) => ({
        id: doc.id,
        title: doc.title,
        icon: doc.icon,
      }));
      return { items };
    },

    request: async () => {
      throw new Error('Backend requests unavailable in dev preview.');
    },
  };

  window.__NOTIS_RANDOM_RUNTIME__ = runtime;
  return runtime;
}

export function setMockRoute(route: 'home' | 'history') {
  if (window.__NOTIS_RANDOM_RUNTIME__) {
    window.__NOTIS_RANDOM_RUNTIME__.route = currentRoute(route);
  }
}

function currentRoute(route: 'home' | 'history') {
  if (route === 'history') {
    return {
      slug: 'history',
      path: '/history',
      name: 'History',
      icon: null,
      parentSlug: null,
      default: false,
      collection: {
        database: 'rolls',
        titleProperty: 'Value',
        parentProperty: null,
        sidebar: { mode: 'flat-list' as const, allowCreate: false },
      },
    };
  }
  return {
    slug: 'home',
    path: '/',
    name: 'Generator',
    icon: 'lucide:sparkles',
    parentSlug: null,
    default: true,
    collection: null,
  };
}
