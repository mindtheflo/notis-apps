'use client';

import { useCallback, useEffect, useState } from 'react';
import { useNotisRuntime } from '../provider';
import type { DocumentRecord } from '../runtime';

interface UseDocumentResult {
  document: DocumentRecord | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Fetch a single document by ID.
 *
 * ```tsx
 * const { document, loading } = useDocument(documentId);
 * ```
 */
export function useDocument(documentId: string | null | undefined): UseDocumentResult {
  const runtime = useNotisRuntime();
  const [document, setDocument] = useState<DocumentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => setFetchKey((k) => k + 1), []);

  useEffect(() => {
    if (!runtime || !documentId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    runtime
      .getDocument({ documentId })
      .then((result) => {
        if (!cancelled) {
          setDocument(result);
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
  }, [runtime, documentId, fetchKey]);

  return { document, loading, error, refetch };
}
