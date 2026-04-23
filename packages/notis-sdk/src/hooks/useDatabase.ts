'use client';

import { useCallback, useEffect, useState } from 'react';
import { useNotisRuntime } from '../provider';
import type { DocumentRecord, QueryFilter } from '../runtime';

interface UseDatabaseOptions {
  filter?: QueryFilter;
  pageSize?: number;
  offset?: number;
  /** Set to false to skip the initial fetch. */
  enabled?: boolean;
}

interface UseDatabaseResult {
  documents: DocumentRecord[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Query documents from a Notis database owned by this app.
 *
 * ```tsx
 * const { documents, loading } = useDatabase('transactions', {
 *   filter: { sorts: [{ property: 'date', direction: 'desc' }] },
 *   pageSize: 20,
 * });
 * ```
 */
export function useDatabase(
  databaseSlug: string,
  options: UseDatabaseOptions = {},
): UseDatabaseResult {
  const runtime = useNotisRuntime();
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  const enabled = options.enabled !== false;

  const refetch = useCallback(() => {
    setFetchKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!runtime || !enabled) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    runtime
      .queryDatabase({
        databaseSlug,
        query: {
          ...options.filter,
          page_size: options.pageSize,
        },
        offset: options.offset,
      })
      .then((result) => {
        if (!cancelled) {
          setDocuments(result.documents);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime, databaseSlug, fetchKey, enabled]);

  return { documents, loading, error, refetch };
}
