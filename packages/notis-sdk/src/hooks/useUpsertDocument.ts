'use client';

import { useCallback, useState } from 'react';
import { useNotisRuntime } from '../provider';
import type { DocumentRecord } from '../runtime';

interface UpsertArgs {
  databaseSlug: string;
  documentId?: string;
  title?: string;
  properties?: Record<string, unknown>;
  contentBlocknote?: Array<Record<string, unknown>> | null;
}

interface UseUpsertDocumentResult {
  upsert: (args: UpsertArgs) => Promise<DocumentRecord>;
  loading: boolean;
  error: Error | null;
}

/**
 * Create or update a document in a Notis database.
 *
 * ```tsx
 * const { upsert, loading } = useUpsertDocument();
 * await upsert({ databaseSlug: 'tasks', title: 'New task', properties: { status: 'Open' } });
 * ```
 */
export function useUpsertDocument(): UseUpsertDocumentResult {
  const runtime = useNotisRuntime();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const upsert = useCallback(
    async (args: UpsertArgs): Promise<DocumentRecord> => {
      if (!runtime) {
        throw new Error('Notis runtime not available. Ensure NotisProvider is mounted.');
      }

      setLoading(true);
      setError(null);

      try {
        const result = await runtime.upsertDocument(args);
        return result.document;
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [runtime],
  );

  return { upsert, loading, error };
}
