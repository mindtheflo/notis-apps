'use client';

import { useEffect, useState } from 'react';
import { useNotisRuntime } from '../provider';
import type { CollectionItem } from '../runtime';

interface UseCollectionResult {
  /** Items in the collection (from the bound database). */
  items: CollectionItem[];
  loading: boolean;
  error: Error | null;
}

/**
 * List collection items for the current route. Only meaningful on routes
 * that have a `collection` binding in `notis.config.ts`.
 *
 * ```tsx
 * const { items, loading } = useCollectionItems();
 * ```
 */
export function useCollectionItems(): UseCollectionResult {
  const runtime = useNotisRuntime();
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!runtime) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    runtime
      .listCollectionItems()
      .then((result) => {
        if (!cancelled) {
          setItems(result.items);
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
  }, [runtime]);

  return { items, loading, error };
}
